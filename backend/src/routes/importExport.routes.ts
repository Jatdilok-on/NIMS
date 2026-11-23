import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { DeviceCategory, DeviceStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { getPermittedSiteIds, hasSitePermission } from '../middleware/rbac';
import {
  buildInventoryCsv,
  buildInventoryExcelBuffer,
  buildInventoryPdfBuffer,
  buildSampleInventoryCsv,
  buildSampleInventoryExcelBuffer,
  normalizeDeviceCategory,
  parseSpreadsheetBuffer,
} from '../lib/excel';
import { isValidIpv4, normalizeMacAddress } from '../lib/ipam';
import { createDeviceWithDetails, DevicePayload } from '../lib/deviceService';
import { getLiveAgentSiteIds, resolveEffectiveDeviceStatus } from '../lib/agentService';
import { recordAuditLog } from '../lib/audit';

const router = Router();
router.use(authenticate);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

router.get('/import/template', async (req, res, next) => {
  try {
    const format = String(req.query.format || 'xlsx').toLowerCase();
    if (format === 'csv') {
      const csv = buildSampleInventoryCsv();
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="nims-inventory-import-template.csv"',
      );
      res.send(csv);
      return;
    }
    const buf = await buildSampleInventoryExcelBuffer();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="nims-inventory-import-template.xlsx"',
    );
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

interface MinimalSiteRef {
  id: string;
  siteCode: string;
  siteName: string;
}

function escapeRegExp(val: string): string {
  return val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveSiteFromText(raw: string | undefined, sites: MinimalSiteRef[]): MinimalSiteRef | undefined {
  const trimmed = (raw || '').trim().toLowerCase();
  if (!trimmed) return undefined;
  return sites.find(
    (s) => s.siteCode.toLowerCase() === trimmed || s.siteName.toLowerCase() === trimmed,
  );
}

function detectSiteFromFilename(filename: string, sites: MinimalSiteRef[]): MinimalSiteRef | undefined {
  const baseName = filename.replace(/\.[^.]+$/, '').trim();
  if (!baseName) return undefined;

  const candidates: Array<{ token: string; site: MinimalSiteRef }> = [];
  for (const s of sites) {
    if (s.siteCode.trim().length >= 2) candidates.push({ token: s.siteCode.trim(), site: s });
    if (s.siteName.trim().length >= 3) candidates.push({ token: s.siteName.trim(), site: s });
  }
  candidates.sort((a, b) => b.token.length - a.token.length);

  for (const { token, site } of candidates) {
    const pattern = new RegExp(`(^|[^a-zA-Z0-9])${escapeRegExp(token)}([^a-zA-Z0-9]|$)`, 'i');
    if (pattern.test(baseName)) {
      return site;
    }
  }
  return undefined;
}

router.post('/import/preview', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Spreadsheet file is required' });
      return;
    }

    const rawSiteId = String(req.body.siteId || 'AUTO').trim();
    const rawFallbackSiteId = String(req.body.fallbackSiteId || '').trim();
    const isAutoSiteMode = rawSiteId === 'AUTO';

    const rawCategory = String(req.body.category || 'AUTO').toUpperCase();
    const fallbackRaw = String(req.body.fallbackCategory || '').toUpperCase();
    const isAutoMode = rawCategory === 'AUTO';
    const fixedCategory =
      !isAutoMode && rawCategory in DeviceCategory ? (rawCategory as DeviceCategory) : undefined;
    const fallbackCategory =
      fallbackRaw in DeviceCategory
        ? (fallbackRaw as DeviceCategory)
        : fixedCategory;

    if (!rawSiteId || (!isAutoMode && !fixedCategory)) {
      res.status(400).json({ error: 'Valid siteId (or AUTO) and inventory category (or AUTO) are required' });
      return;
    }

    const permittedEditSites = getPermittedSiteIds(req.user!, 'canEditInventory');
    if (!isAutoSiteMode) {
      if (!hasSitePermission(req.user!, rawSiteId, 'canEditInventory')) {
        res.status(403).json({ error: 'Permission denied to import inventory into this site' });
        return;
      }
    } else if (permittedEditSites !== null && permittedEditSites.length === 0) {
      res.status(403).json({ error: 'Permission denied to import inventory into any site' });
      return;
    }

    const accessibleSites = await prisma.site.findMany({
      where: isAutoSiteMode
        ? permittedEditSites !== null
          ? { id: { in: permittedEditSites } }
          : {}
        : { id: rawSiteId },
      select: { id: true, siteCode: true, siteName: true },
    });

    if (accessibleSites.length === 0) {
      res.status(404).json({ error: 'No accessible target sites found' });
      return;
    }

    const siteMap = new Map(accessibleSites.map((s) => [s.id, s]));
    const filenameSite = isAutoSiteMode
      ? detectSiteFromFilename(req.file.originalname, accessibleSites)
      : undefined;
    const defaultSite = !isAutoSiteMode
      ? siteMap.get(rawSiteId)
      : filenameSite ?? (rawFallbackSiteId ? siteMap.get(rawFallbackSiteId) : undefined);

    const parsed = await parseSpreadsheetBuffer(req.file.buffer, req.file.originalname);

    const mapVal = (row: Record<string, string>, targetField: string): string => {
      for (const [col, mapped] of Object.entries(parsed.suggestedMapping)) {
        if (mapped === targetField && row[col]) return row[col];
      }
      return '';
    };

    // Determine candidate target site IDs across rows for duplicate checks
    const resolvedSiteIdsPerRow: Array<MinimalSiteRef | undefined> = parsed.rows.map((raw) => {
      if (!isAutoSiteMode) return defaultSite;
      const rawSiteText = mapVal(raw, 'site');
      if (rawSiteText) {
        return resolveSiteFromText(rawSiteText, accessibleSites);
      }
      return defaultSite;
    });

    const candidateSiteIds = Array.from(
      new Set(
        resolvedSiteIdsPerRow
          .map((s) => s?.id)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    const existingDevices =
      candidateSiteIds.length > 0
        ? await prisma.device.findMany({
            where: { siteId: { in: candidateSiteIds } },
            select: { siteId: true, managementIp: true, macAddress: true },
          })
        : [];

    const existingIpsBySite = new Map<string, Set<string>>();
    const existingMacsBySite = new Map<string, Set<string>>();
    for (const d of existingDevices) {
      if (d.managementIp) {
        const set = existingIpsBySite.get(d.siteId) ?? new Set<string>();
        set.add(d.managementIp);
        existingIpsBySite.set(d.siteId, set);
      }
      if (d.macAddress) {
        const set = existingMacsBySite.get(d.siteId) ?? new Set<string>();
        set.add(d.macAddress);
        existingMacsBySite.set(d.siteId, set);
      }
    }

    const seenIpsBySite = new Map<string, Set<string>>();
    const seenMacsBySite = new Map<string, Set<string>>();

    const previewRows = parsed.rows.map((raw, idx) => {
      const issues: string[] = [];
      const name = mapVal(raw, 'name');
      const ip = mapVal(raw, 'managementIp');
      const macRaw = mapVal(raw, 'macAddress');
      const rawType = mapVal(raw, 'category');
      const rawSiteText = mapVal(raw, 'site');
      const resolvedSite = resolvedSiteIdsPerRow[idx];

      if (!resolvedSite) {
        issues.push(
          rawSiteText
            ? `Unknown Target Site "${rawSiteText}"`
            : 'Missing Target Site (select fallback site or add Site column)',
        );
      }

      const resolvedCategory = isAutoMode
        ? normalizeDeviceCategory(rawType, fallbackCategory)
        : rawType
          ? normalizeDeviceCategory(rawType, fixedCategory)
          : fixedCategory ?? null;

      if (!resolvedCategory) {
        issues.push(
          rawType
            ? `Unknown Type "${rawType}" (or pick fallback)`
            : 'Missing Type column/value',
        );
      }

      let normalizedMac: string | null = null;

      if (!name) issues.push('Missing Device Name');
      if (ip && !isValidIpv4(ip)) issues.push(`Invalid IP: ${ip}`);
      if (macRaw) {
        try {
          normalizedMac = normalizeMacAddress(macRaw);
        } catch {
          issues.push(`Invalid MAC: ${macRaw}`);
        }
      }

      let isDuplicate = false;
      const checkSiteKey = resolvedSite?.id || '__unassigned__';
      const siteExistingIps = existingIpsBySite.get(checkSiteKey);
      const siteExistingMacs = existingMacsBySite.get(checkSiteKey);
      const siteSeenIps = seenIpsBySite.get(checkSiteKey) ?? new Set<string>();
      const siteSeenMacs = seenMacsBySite.get(checkSiteKey) ?? new Set<string>();

      if (ip && (siteExistingIps?.has(ip) || siteSeenIps.has(ip))) {
        issues.push(`Duplicate IP in ${resolvedSite?.siteCode || 'site'}: ${ip}`);
        isDuplicate = true;
      }
      if (normalizedMac && (siteExistingMacs?.has(normalizedMac) || siteSeenMacs.has(normalizedMac))) {
        issues.push(`Duplicate MAC in ${resolvedSite?.siteCode || 'site'}: ${normalizedMac}`);
        isDuplicate = true;
      }

      if (ip) {
        siteSeenIps.add(ip);
        seenIpsBySite.set(checkSiteKey, siteSeenIps);
      }
      if (normalizedMac) {
        siteSeenMacs.add(normalizedMac);
        seenMacsBySite.set(checkSiteKey, siteSeenMacs);
      }

      return {
        rowNumber: idx + 2,
        raw,
        resolvedSiteId: resolvedSite?.id ?? null,
        resolvedSiteCode: resolvedSite?.siteCode ?? null,
        resolvedCategory,
        status: issues.length === 0 ? 'READY' : isDuplicate ? 'DUPLICATE' : 'INVALID',
        issues,
      };
    });

    res.json({
      headers: parsed.headers,
      suggestedMapping: parsed.suggestedMapping,
      detectedVlan: parsed.detectedVlan,
      detectedSiteId: filenameSite?.id ?? null,
      detectedSiteCode: filenameSite?.siteCode ?? null,
      totalRows: parsed.rows.length,
      previewRows,
    });
  } catch (err) {
    next(err);
  }
});

const confirmImportSchema = z.object({
  siteId: z.string().min(1),
  fallbackSiteId: z.string().optional(),
  category: z.union([z.literal('AUTO'), z.nativeEnum(DeviceCategory)]).default('AUTO'),
  fallbackCategory: z.nativeEnum(DeviceCategory).optional(),
  columnMapping: z.record(z.string()),
  defaultVlan: z.string().optional(),
  skipDuplicates: z.boolean().default(true),
  rows: z.array(z.record(z.string())),
  rowCategories: z.array(z.nativeEnum(DeviceCategory)).optional(),
  rowSites: z.array(z.string()).optional(),
});

router.post('/import/confirm', async (req, res, next) => {
  try {
    const body = confirmImportSchema.parse(req.body);
    const isAutoSiteMode = body.siteId === 'AUTO';
    const permittedEditSites = getPermittedSiteIds(req.user!, 'canEditInventory');

    if (!isAutoSiteMode && !hasSitePermission(req.user!, body.siteId, 'canEditInventory')) {
      res.status(403).json({ error: 'Permission denied to import inventory into this site' });
      return;
    }

    const accessibleSites = await prisma.site.findMany({
      where: isAutoSiteMode
        ? permittedEditSites !== null
          ? { id: { in: permittedEditSites } }
          : {}
        : { id: body.siteId },
      select: { id: true, siteCode: true, siteName: true },
    });

    if (accessibleSites.length === 0) {
      res.status(404).json({ error: 'Target site not found or unauthorized' });
      return;
    }

    const siteMap = new Map(accessibleSites.map((s) => [s.id, s]));
    const defaultSiteId = isAutoSiteMode ? body.fallbackSiteId : body.siteId;

    let importedCount = 0;
    let skippedDuplicates = 0;
    const errors: { rowIndex: number; name?: string; error: string }[] = [];
    const importedSiteMap = new Map<string, string>();

    for (let i = 0; i < body.rows.length; i++) {
      const raw = body.rows[i];
      const mapped: Record<string, string> = {};
      for (const [excelCol, targetField] of Object.entries(body.columnMapping)) {
        if (targetField && raw[excelCol] !== undefined) {
          mapped[targetField] = String(raw[excelCol]).trim();
        }
      }

      const name = mapped.name || mapped.hostname;
      if (!name) {
        errors.push({ rowIndex: i + 1, error: 'Missing device name' });
        continue;
      }

      const mappedSiteRef = mapped.site
        ? resolveSiteFromText(mapped.site, accessibleSites)
        : undefined;
      const targetSiteId = isAutoSiteMode
        ? body.rowSites?.[i] || mappedSiteRef?.id || defaultSiteId
        : body.siteId;

      if (!targetSiteId || !siteMap.has(targetSiteId)) {
        errors.push({
          rowIndex: i + 1,
          name,
          error: mapped.site
            ? `Unknown or unauthorized site "${mapped.site}"`
            : 'Missing target site',
        });
        continue;
      }

      const fallbackCat =
        body.category === 'AUTO' ? body.fallbackCategory : body.category;
      const rowCategory =
        body.rowCategories?.[i] ??
        normalizeDeviceCategory(mapped.category, fallbackCat);
      if (!rowCategory) {
        errors.push({
          rowIndex: i + 1,
          name,
          error: `Unknown or missing inventory type "${mapped.category || ''}"`,
        });
        continue;
      }

      const itemNoNum = mapped.itemNo ? parseInt(mapped.itemNo, 10) : null;
      const portCountNum = mapped.portCount ? parseInt(mapped.portCount, 10) : null;
      const statusUpper = (mapped.status || '').toUpperCase();
      const status: DeviceStatus =
        statusUpper in DeviceStatus ? (statusUpper as DeviceStatus) : DeviceStatus.UNKNOWN;

      const vlanVal = mapped.vlan || body.defaultVlan || null;

      const payload: DevicePayload = {
        siteId: targetSiteId,
        category: rowCategory,
        itemNo: itemNoNum && !Number.isNaN(itemNoNum) ? itemNoNum : null,
        name,
        model: mapped.model || null,
        vendor: mapped.vendor || null,
        macAddress: mapped.macAddress || null,
        serialNumber: mapped.serialNumber || null,
        managementIp: mapped.managementIp || null,
        vlan: vlanVal,
        location: mapped.location || null,
        status,
        responsiblePerson: mapped.responsiblePerson || null,
        remark: mapped.remark || null,
      };

      if (rowCategory === DeviceCategory.SWITCH) {
        payload.switchDetail = {
          managementVlan: vlanVal,
          rack: mapped.rack || null,
          floor: mapped.floor || null,
          portCount: portCountNum && !Number.isNaN(portCountNum) ? portCountNum : null,
          firmwareVersion: mapped.firmwareVersion || null,
        };
      } else if (rowCategory === DeviceCategory.ACCESS_POINT) {
        payload.accessPointDetail = {
          ssid: mapped.ssid || null,
          channel: mapped.channel || null,
          frequency: mapped.frequency || null,
          floor: mapped.floor || null,
          controller: mapped.controller || null,
        };
      } else if (rowCategory === DeviceCategory.AP_CLIENT) {
        payload.apClientDetail = {
          connectedAp: mapped.connectedAp || null,
          wirelessMode: mapped.wirelessMode || null,
          ssid: mapped.ssid || null,
          frequency: mapped.frequency || null,
          connectedDevice: mapped.connectedDevice || null,
        };
      } else if (rowCategory === DeviceCategory.WLC) {
        payload.controllerDetail = {
          controllerVersion: mapped.firmwareVersion || null,
        };
      } else if (
        rowCategory === DeviceCategory.SERVER ||
        rowCategory === DeviceCategory.ESXI ||
        rowCategory === DeviceCategory.VM ||
        rowCategory === DeviceCategory.NAS ||
        rowCategory === DeviceCategory.PC ||
        rowCategory === DeviceCategory.NVR
      ) {
        payload.serverDetail = {
          hostname: mapped.hostname || name,
          manufacturer: mapped.vendor || null,
          productionIp: mapped.productionIp || null,
          operatingSystem: mapped.operatingSystem || null,
          cpu: mapped.cpu || null,
          ram: mapped.ram || null,
          storage: mapped.storage || null,
          hypervisor: mapped.hypervisor || null,
          serviceApplication: mapped.serviceApplication || null,
          rack: mapped.rack || null,
        };
      }

      try {
        await createDeviceWithDetails(payload);
        importedCount++;
        const siteRef = siteMap.get(targetSiteId)!;
        importedSiteMap.set(siteRef.id, siteRef.siteCode);
      } catch (err) {
        const msg = (err as Error).message;
        if (msg.includes('Duplicate') && body.skipDuplicates) {
          skippedDuplicates++;
        } else {
          errors.push({ rowIndex: i + 1, name, error: msg });
        }
      }
    }

    const importedSiteIds = Array.from(importedSiteMap.keys());
    const importedSiteCodes = Array.from(importedSiteMap.values());

    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'IMPORT_INVENTORY',
      module: 'INVENTORY',
      siteId: importedSiteIds.length === 1 ? importedSiteIds[0] : isAutoSiteMode ? null : body.siteId,
      siteCode: importedSiteCodes.join(', ') || undefined,
      details: {
        category: body.category,
        siteMode: isAutoSiteMode ? 'AUTO' : 'FIXED',
        sites: importedSiteCodes,
        totalRows: body.rows.length,
        importedCount,
        skippedDuplicates,
        errorCount: errors.length,
      },
    });

    res.json({
      totalRows: body.rows.length,
      importedCount,
      skippedDuplicates,
      errorCount: errors.length,
      errors,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/export', async (req, res, next) => {
  try {
    const format = String(req.query.format || 'xlsx').toLowerCase();
    const siteId = typeof req.query.siteId === 'string' ? req.query.siteId : undefined;
    const category =
      typeof req.query.category === 'string' && req.query.category in DeviceCategory
        ? (req.query.category as DeviceCategory)
        : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const vlan = typeof req.query.vlan === 'string' ? req.query.vlan.trim() : '';
    const location = typeof req.query.location === 'string' ? req.query.location.trim() : '';

    const permittedSiteIds = getPermittedSiteIds(req.user!, 'canViewInventory');
    if (siteId && permittedSiteIds !== null && !permittedSiteIds.includes(siteId)) {
      res.status(403).json({ error: 'Access denied to site export' });
      return;
    }

    const devices = await prisma.device.findMany({
      where: {
        ...(siteId ? { siteId } : permittedSiteIds !== null ? { siteId: { in: permittedSiteIds } } : {}),
        ...(category ? { category } : {}),
        ...(vlan ? { vlan: { contains: vlan, mode: 'insensitive' } } : {}),
        ...(location ? { location: { contains: location, mode: 'insensitive' } } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { model: { contains: search, mode: 'insensitive' } },
                { vendor: { contains: search, mode: 'insensitive' } },
                { managementIp: { contains: search, mode: 'insensitive' } },
                { macAddress: { contains: search, mode: 'insensitive' } },
                { serialNumber: { contains: search, mode: 'insensitive' } },
                { location: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        site: { select: { siteCode: true } },
      },
      orderBy: [{ category: 'asc' }, { itemNo: 'asc' }, { name: 'asc' }],
    });

    devices.sort((a, b) => {
      const siteCmp = a.site.siteCode.localeCompare(b.site.siteCode);
      if (siteCmp !== 0) return siteCmp;
      const catCmp = a.category.localeCompare(b.category);
      if (catCmp !== 0) return catCmp;
      const itemCmp = (a.itemNo ?? Number.MAX_SAFE_INTEGER) - (b.itemNo ?? Number.MAX_SAFE_INTEGER);
      if (itemCmp !== 0) return itemCmp;
      return a.name.localeCompare(b.name);
    });

    const uniqueSiteIds = Array.from(new Set(devices.map((d) => d.siteId)));
    const liveSiteIds =
      uniqueSiteIds.length > 0 ? await getLiveAgentSiteIds(uniqueSiteIds) : new Set<string>();

    const exportRows = devices.map((d) => ({
      itemNo: d.itemNo,
      siteCode: d.site.siteCode,
      category: d.category,
      name: d.name,
      model: d.model,
      vendor: d.vendor,
      macAddress: d.macAddress,
      serialNumber: d.serialNumber,
      managementIp: d.managementIp,
      vlan: d.vlan,
      location: d.location,
      status: resolveEffectiveDeviceStatus(d, liveSiteIds),
      responsiblePerson: d.responsiblePerson,
      remark: d.remark,
    }));

    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'EXPORT_INVENTORY',
      module: 'INVENTORY',
      siteId: siteId ?? null,
      details: { format, count: exportRows.length },
    });

    if (format === 'csv') {
      const csv = buildInventoryCsv(exportRows);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="nims-inventory.csv"');
      res.send(csv);
      return;
    }

    if (format === 'pdf') {
      const pdfBuf = await buildInventoryPdfBuffer(exportRows);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="nims-inventory.pdf"');
      res.send(pdfBuf);
      return;
    }

    const xlsxBuf = await buildInventoryExcelBuffer(exportRows);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename="nims-inventory.xlsx"');
    res.send(xlsxBuf);
  } catch (err) {
    next(err);
  }
});

export default router;

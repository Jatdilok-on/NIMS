import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { RoleCode } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { hasSitePermission, requireRoles, requireSitePermission } from '../middleware/rbac';
import {
  buildSitesCsv,
  buildSitesExcelBuffer,
  parseSiteSpreadsheetBuffer,
} from '../lib/excel';
import { recordAuditLog } from '../lib/audit';
import { getLiveAgentSiteIds } from '../lib/agentService';
import { deleteSiteStorageFolder } from '../lib/storage';

const router = Router();
router.use(authenticate);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const SITE_CODE_REGEX = /^[a-zA-Z0-9_-]{2,32}$/;

function generateUniqueSiteCode(
  siteName: string,
  usedCodes: Set<string>,
  nextSeqRef: { value: number },
): string {
  const asciiBase = siteName
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toUpperCase();

  if (asciiBase.length >= 2) {
    const base = asciiBase.slice(0, 26).replace(/-$/, '');
    const candidateBase = base.length >= 2 ? base : asciiBase.slice(0, 26);
    if (!usedCodes.has(candidateBase)) {
      usedCodes.add(candidateBase);
      return candidateBase;
    }
    let suffixNum = 2;
    while (suffixNum < 10000) {
      const suffix = `-${suffixNum}`;
      const trimmed = candidateBase.slice(0, 32 - suffix.length).replace(/-$/, '');
      const candidate = `${trimmed}${suffix}`;
      if (!usedCodes.has(candidate)) {
        usedCodes.add(candidate);
        return candidate;
      }
      suffixNum++;
    }
  }

  while (true) {
    const candidate = `SITE-${String(nextSeqRef.value++).padStart(3, '0')}`;
    if (!usedCodes.has(candidate)) {
      usedCodes.add(candidate);
      return candidate;
    }
  }
}

const siteSchema = z.object({
  siteCode: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine((val) => !val || SITE_CODE_REGEX.test(val), {
      message: 'Site Code must be 2-32 letters, numbers, - or _',
    }),
  siteName: z.string().min(2).max(160),
  customerName: z.string().max(160).optional().nullable(),
  location: z.string().max(500).optional().nullable(),
  googleMapUrl: z
    .string()
    .max(1000)
    .optional()
    .nullable()
    .refine((val) => !val || !val.trim() || /^https?:\/\//i.test(val.trim()), {
      message: 'Google Map link must start with http:// or https://',
    }),
  address: z.string().max(500).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  contactPerson: z.string().max(160).optional().nullable(),
  responsibleEngineer: z.string().max(160).optional().nullable(),
  storageQuotaMb: z.number().int().min(100).max(1048576).optional(),
});

const projectSchema = z.object({
  name: z.string().min(2).max(200),
  code: z.string().max(50).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  status: z.string().max(40).optional(),
});

router.get('/', async (req, res, next) => {
  try {
    const user = req.user!;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    const where: Record<string, unknown> = {};
    if (user.roleCode !== RoleCode.SUPER_ADMIN) {
      const siteIds = user.sitePermissions.map((p) => p.siteId);
      where.id = { in: siteIds };
    }
    if (search) {
      where.OR = [
        { siteCode: { contains: search, mode: 'insensitive' } },
        { siteName: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } },
      ];
    }

    const sites = await prisma.site.findMany({
      where,
      include: {
        _count: {
          select: {
            devices: true,
            subnets: true,
            diagrams: true,
            documents: true,
            maintenanceRecords: true,
          },
        },
      },
      orderBy: { siteCode: 'asc' },
    });

    const liveSiteIds = await getLiveAgentSiteIds(sites.map((s) => s.id));
    res.json({
      sites: sites.map((s) => ({ ...s, hasLiveAgent: liveSiteIds.has(s.id) })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/export', async (req, res, next) => {
  try {
    const user = req.user!;
    const format = String(req.query.format || 'xlsx').toLowerCase();
    const templateOnly = String(req.query.template || 'false').toLowerCase() === 'true';

    let rows;
    if (templateOnly) {
      rows = [
        {
          siteCode: 'BKK01',
          siteName: 'Bangkok HQ Data Center',
          customerName: 'Internal Enterprise',
          location: 'Bangkok, Thailand',
          googleMapUrl: 'https://maps.google.com/?q=13.7563,100.5018',
          address: '123 Sukhumvit Rd, Bangkok',
          contactPerson: 'Somchai',
          responsibleEngineer: 'Network Team',
          description: 'Sample row — edit or add sites before importing',
        },
      ];
    } else {
      const where: Record<string, unknown> = {};
      if (user.roleCode !== RoleCode.SUPER_ADMIN) {
        where.id = { in: user.sitePermissions.map((p) => p.siteId) };
      }
      const sites = await prisma.site.findMany({ where, orderBy: { siteCode: 'asc' } });
      rows = sites.map((s) => ({
        siteCode: s.siteCode,
        siteName: s.siteName,
        customerName: s.customerName,
        location: s.location,
        googleMapUrl: s.googleMapUrl,
        address: s.address,
        contactPerson: s.contactPerson,
        responsibleEngineer: s.responsibleEngineer,
        description: s.description,
      }));

      await recordAuditLog({
        req,
        userId: user.id,
        username: user.username,
        action: 'EXPORT_SITES',
        module: 'SITE',
        details: { format, count: rows.length },
      });
    }

    if (format === 'csv') {
      const csv = buildSitesCsv(rows);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${templateOnly ? 'nims-sites-template.csv' : 'nims-sites.csv'}"`,
      );
      res.send(csv);
      return;
    }

    const xlsxBuf = await buildSitesExcelBuffer(rows);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${templateOnly ? 'nims-sites-template.xlsx' : 'nims-sites.xlsx'}"`,
    );
    res.send(xlsxBuf);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/import/preview',
  requireRoles(RoleCode.SUPER_ADMIN),
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'Spreadsheet file is required' });
        return;
      }

      const parsed = await parseSiteSpreadsheetBuffer(req.file.buffer, req.file.originalname);
      const existing = await prisma.site.findMany({ select: { siteCode: true } });
      const existingCodes = new Set(existing.map((s) => s.siteCode.toUpperCase()));
      const seenCodes = new Set<string>();
      const usedForAuto = new Set(existingCodes);
      const nextSeqRef = { value: existing.length + 1 };

      const siteCodeCol =
        Object.entries(parsed.suggestedMapping).find(([, target]) => target === 'siteCode')?.[0] ||
        null;

      const mapVal = (row: Record<string, string>, targetField: string): string => {
        for (const [col, mapped] of Object.entries(parsed.suggestedMapping)) {
          if (mapped === targetField && row[col]) return row[col];
        }
        return '';
      };

      for (const raw of parsed.rows) {
        const explicitCode = mapVal(raw, 'siteCode').trim().toUpperCase();
        if (explicitCode) usedForAuto.add(explicitCode);
      }

      const previewRows = parsed.rows.map((raw, idx) => {
        const issues: string[] = [];
        const rawCopy: Record<string, string> = { ...raw };
        let codeRaw = mapVal(raw, 'siteCode').trim();
        const siteName = mapVal(raw, 'siteName').trim();
        const mapUrl = mapVal(raw, 'googleMapUrl').trim();

        let autoGenerated = false;
        if (!codeRaw && siteName.length >= 2) {
          codeRaw = generateUniqueSiteCode(siteName, usedForAuto, nextSeqRef);
          autoGenerated = true;
          if (siteCodeCol) {
            rawCopy[siteCodeCol] = codeRaw;
          }
        } else if (!codeRaw) {
          issues.push('Missing Site Code (or Site Name to auto-generate)');
        } else if (!SITE_CODE_REGEX.test(codeRaw)) {
          issues.push(`Invalid Site Code "${codeRaw}" (use 2-32 letters/numbers/-/_)`);
        }

        const codeUpper = codeRaw.toUpperCase();
        if (!siteName || siteName.length < 2) {
          issues.push('Missing or too short Site Name');
        }
        if (mapUrl && !/^https?:\/\//i.test(mapUrl)) {
          issues.push('Google Map Link must start with http:// or https://');
        }

        let isDuplicate = false;
        if (!autoGenerated && codeUpper && (existingCodes.has(codeUpper) || seenCodes.has(codeUpper))) {
          issues.push(`Duplicate Site Code: ${codeUpper}`);
          isDuplicate = true;
        }
        if (codeUpper) seenCodes.add(codeUpper);

        return {
          rowNumber: idx + 2,
          raw: rawCopy,
          generatedSiteCode: autoGenerated ? codeUpper : undefined,
          status: issues.length === 0 ? 'READY' : isDuplicate ? 'DUPLICATE' : 'INVALID',
          issues,
        };
      });

      res.json({
        headers: parsed.headers,
        suggestedMapping: parsed.suggestedMapping,
        totalRows: parsed.rows.length,
        previewRows,
      });
    } catch (err) {
      next(err);
    }
  },
);

const confirmSiteImportSchema = z.object({
  columnMapping: z.record(z.string()),
  skipDuplicates: z.boolean().default(true),
  rows: z.array(z.record(z.string())),
});

router.post(
  '/import/confirm',
  requireRoles(RoleCode.SUPER_ADMIN),
  async (req, res, next) => {
    try {
      const body = confirmSiteImportSchema.parse(req.body);
      const existing = await prisma.site.findMany({ select: { id: true, siteCode: true } });
      const existingByCode = new Map(existing.map((s) => [s.siteCode.toUpperCase(), s.id]));
      const usedForAuto = new Set(existingByCode.keys());
      const nextSeqRef = { value: existing.length + 1 };

      for (const raw of body.rows) {
        for (const [col, targetField] of Object.entries(body.columnMapping)) {
          if (targetField === 'siteCode' && raw[col]) {
            const explicit = String(raw[col]).trim().toUpperCase();
            if (explicit) usedForAuto.add(explicit);
          }
        }
      }

      let importedCount = 0;
      let updatedCount = 0;
      let skippedDuplicates = 0;
      const errors: Array<{ rowIndex: number; siteCode?: string; error: string }> = [];

      for (let i = 0; i < body.rows.length; i++) {
        const raw = body.rows[i];
        const mapped: Record<string, string> = {};
        for (const [col, targetField] of Object.entries(body.columnMapping)) {
          if (targetField && raw[col] !== undefined) {
            mapped[targetField] = String(raw[col]).trim();
          }
        }

        const siteName = mapped.siteName || '';
        const googleMapUrl = mapped.googleMapUrl || null;
        if (siteName.length < 2) {
          errors.push({
            rowIndex: i + 1,
            siteCode: (mapped.siteCode || '').toUpperCase(),
            error: 'Site Name is required',
          });
          continue;
        }

        let codeRaw = mapped.siteCode || '';
        if (!codeRaw) {
          codeRaw = generateUniqueSiteCode(siteName, usedForAuto, nextSeqRef);
        } else if (!SITE_CODE_REGEX.test(codeRaw)) {
          errors.push({
            rowIndex: i + 1,
            siteCode: codeRaw.toUpperCase(),
            error: `Invalid Site Code "${codeRaw}" (2-32 alphanumeric/-/_)`,
          });
          continue;
        }
        const siteCode = codeRaw.toUpperCase();
        usedForAuto.add(siteCode);
        if (googleMapUrl && !/^https?:\/\//i.test(googleMapUrl)) {
          errors.push({
            rowIndex: i + 1,
            siteCode,
            error: 'Google Map Link must start with http:// or https://',
          });
          continue;
        }

        const existingId = existingByCode.get(siteCode);
        const data = {
          siteName,
          customerName: mapped.customerName || null,
          location: mapped.location || null,
          googleMapUrl,
          address: mapped.address || null,
          contactPerson: mapped.contactPerson || null,
          responsibleEngineer: mapped.responsibleEngineer || null,
          description: mapped.description || null,
        };

        try {
          if (existingId) {
            if (body.skipDuplicates) {
              skippedDuplicates++;
              continue;
            }
            await prisma.site.update({ where: { id: existingId }, data });
            updatedCount++;
          } else {
            const created = await prisma.site.create({
              data: {
                siteCode,
                ...data,
              },
            });
            existingByCode.set(siteCode, created.id);
            importedCount++;
          }
        } catch (err) {
          errors.push({ rowIndex: i + 1, siteCode, error: (err as Error).message });
        }
      }

      await recordAuditLog({
        req,
        userId: req.user!.id,
        username: req.user!.username,
        action: 'IMPORT_SITES',
        module: 'SITE',
        details: {
          totalRows: body.rows.length,
          importedCount,
          updatedCount,
          skippedDuplicates,
          errorCount: errors.length,
        },
      });

      res.json({
        totalRows: body.rows.length,
        importedCount,
        updatedCount,
        skippedDuplicates,
        errorCount: errors.length,
        errors,
      });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/:id', async (req, res, next) => {
  try {
    const user = req.user!;
    const siteId = req.params.id;
    if (
      user.roleCode !== RoleCode.SUPER_ADMIN &&
      !user.sitePermissions.some((p) => p.siteId === siteId)
    ) {
      res.status(403).json({ error: 'Access denied to this site' });
      return;
    }

    const site = await prisma.site.findUnique({
      where: { id: siteId },
      include: {
        _count: {
          select: {
            devices: true,
            vlans: true,
            subnets: true,
            diagrams: true,
            documents: true,
            maintenanceRecords: true,
            projects: true,
          },
        },
      },
    });

    if (!site) {
      res.status(404).json({ error: 'Site not found' });
      return;
    }

    const deviceCounts = await prisma.device.groupBy({
      by: ['category', 'status'],
      where: { siteId },
      _count: true,
    });

    const userPerms =
      user.roleCode === RoleCode.SUPER_ADMIN
        ? {
            canViewInventory: true,
            canEditInventory: true,
            canViewDiagram: true,
            canEditDiagram: true,
            canViewIpam: true,
            canEditIpam: true,
            canViewDocuments: true,
            canEditDocuments: true,
            canDeleteDocuments: true,
            canViewCredentials: true,
            canEditCredentials: true,
            canViewMaintenance: true,
            canEditMaintenance: true,
            canManageSite: true,
          }
        : {
            canViewInventory: hasSitePermission(user, siteId, 'canViewInventory'),
            canEditInventory: hasSitePermission(user, siteId, 'canEditInventory'),
            canViewDiagram: hasSitePermission(user, siteId, 'canViewDiagram'),
            canEditDiagram: hasSitePermission(user, siteId, 'canEditDiagram'),
            canViewIpam: hasSitePermission(user, siteId, 'canViewIpam'),
            canEditIpam: hasSitePermission(user, siteId, 'canEditIpam'),
            canViewDocuments: hasSitePermission(user, siteId, 'canViewDocuments'),
            canEditDocuments: hasSitePermission(user, siteId, 'canEditDocuments'),
            canDeleteDocuments: hasSitePermission(user, siteId, 'canDeleteDocuments'),
            canViewCredentials: hasSitePermission(user, siteId, 'canViewCredentials'),
            canEditCredentials: hasSitePermission(user, siteId, 'canEditCredentials'),
            canViewMaintenance: hasSitePermission(user, siteId, 'canViewMaintenance'),
            canEditMaintenance: hasSitePermission(user, siteId, 'canEditMaintenance'),
            canManageSite: hasSitePermission(user, siteId, 'canManageSite'),
          };

    const liveSiteIds = await getLiveAgentSiteIds([siteId]);
    res.json({
      site: { ...site, hasLiveAgent: liveSiteIds.has(siteId) },
      deviceCounts,
      permissions: userPerms,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRoles(RoleCode.SUPER_ADMIN), async (req, res, next) => {
  try {
    const body = siteSchema.parse(req.body);
    let finalSiteCode = body.siteCode ? body.siteCode.toUpperCase().trim() : '';
    if (!finalSiteCode) {
      const existing = await prisma.site.findMany({ select: { siteCode: true } });
      const used = new Set(existing.map((s) => s.siteCode.toUpperCase()));
      finalSiteCode = generateUniqueSiteCode(body.siteName, used, { value: existing.length + 1 });
    }
    const site = await prisma.site.create({
      data: {
        siteCode: finalSiteCode,
        siteName: body.siteName.trim(),
        customerName: body.customerName ?? null,
        location: body.location ?? null,
        googleMapUrl: body.googleMapUrl?.trim() || null,
        address: body.address ?? null,
        description: body.description ?? null,
        contactPerson: body.contactPerson ?? null,
        responsibleEngineer: body.responsibleEngineer ?? null,
        storageQuotaMb: body.storageQuotaMb ?? 10240,
      },
    });

    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'CREATE_SITE',
      module: 'SITE',
      siteId: site.id,
      siteCode: site.siteCode,
    });

    res.status(201).json({ site });
  } catch (err) {
    next(err);
  }
});

router.put(
  '/:id',
  requireSitePermission('canManageSite', (req) => String(req.params.id)),
  async (req, res, next) => {
    try {
      const body = siteSchema.partial().parse(req.body);
      const site = await prisma.site.update({
        where: { id: String(req.params.id) },
        data: {
          siteCode: body.siteCode ? body.siteCode.toUpperCase().trim() : undefined,
          siteName: body.siteName?.trim(),
          customerName: body.customerName,
          location: body.location,
          googleMapUrl:
            body.googleMapUrl !== undefined ? body.googleMapUrl?.trim() || null : undefined,
          address: body.address,
          description: body.description,
          contactPerson: body.contactPerson,
          responsibleEngineer: body.responsibleEngineer,
          storageQuotaMb: body.storageQuotaMb,
        },
      });

      await recordAuditLog({
        req,
        userId: req.user!.id,
        username: req.user!.username,
        action: 'UPDATE_SITE',
        module: 'SITE',
        siteId: site.id,
        siteCode: site.siteCode,
      });

      res.json({ site });
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/:id', async (req, res, next) => {
  try {
    const siteId = String(req.params.id);
    const user = req.user!;
    const canDelete =
      user.roleCode === RoleCode.SUPER_ADMIN ||
      (user.roleCode === RoleCode.SITE_ADMIN && hasSitePermission(user, siteId, 'canManageSite'));

    if (!canDelete) {
      res.status(403).json({ error: 'Only Super Admin or authorized Site Admin can delete a site' });
      return;
    }

    const site = await prisma.site.delete({ where: { id: siteId } });
    deleteSiteStorageFolder(site.siteCode);
    await recordAuditLog({
      req,
      userId: user.id,
      username: user.username,
      action: 'DELETE_SITE',
      module: 'SITE',
      siteId: site.id,
      siteCode: site.siteCode,
    });
    res.json({ message: 'Site deleted' });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/projects', async (req, res, next) => {
  try {
    const siteId = String(req.params.id);
    const user = req.user!;
    if (
      user.roleCode !== RoleCode.SUPER_ADMIN &&
      !user.sitePermissions.some((p) => p.siteId === siteId)
    ) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    const projects = await prisma.project.findMany({
      where: { siteId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ projects });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:id/projects',
  requireSitePermission('canEditDocuments', (req) => String(req.params.id)),
  async (req, res, next) => {
    try {
      const body = projectSchema.parse(req.body);
      const project = await prisma.project.create({
        data: {
          siteId: String(req.params.id),
          name: body.name.trim(),
          code: body.code ?? null,
          description: body.description ?? null,
          startDate: body.startDate ? new Date(body.startDate) : null,
          endDate: body.endDate ? new Date(body.endDate) : null,
          status: body.status || 'ACTIVE',
        },
      });
      res.status(201).json({ project });
    } catch (err) {
      next(err);
    }
  },
);

export default router;

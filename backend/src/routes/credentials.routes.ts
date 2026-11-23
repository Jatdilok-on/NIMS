import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { AuditResult, LoginType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import {
  blockIpViewerFromCredentials,
  getPermittedSiteIds,
  hasSitePermission,
  requireSitePermission,
} from '../middleware/rbac';
import { decryptSecret, encryptSecret } from '../lib/crypto';
import {
  buildCredentialsCsv,
  buildCredentialsExcelBuffer,
  parseCredentialSpreadsheetBuffer,
} from '../lib/excel';
import { isValidIpv4 } from '../lib/ipam';
import { recordAuditLog } from '../lib/audit';

const router = Router();
router.use(authenticate, blockIpViewerFromCredentials);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

function normalizeLoginType(raw?: string | null): LoginType {
  const upper = (raw || '').trim().toUpperCase().replace(/\s+/g, '_');
  if (upper in LoginType) return upper as LoginType;
  if (upper === 'WEB' || upper === 'WEBGUI' || upper === 'GUI') return LoginType.WEB_GUI;
  return LoginType.SSH;
}

const credentialSchema = z.object({
  siteId: z.string().min(1),
  deviceId: z.string().optional().nullable(),
  deviceName: z.string().min(1).max(200),
  deviceModel: z.string().max(150).optional().nullable(),
  managementIp: z.string().max(50).optional().nullable(),
  loginType: z.nativeEnum(LoginType).default(LoginType.SSH),
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(500),
  accessMethod: z.string().max(160).optional().nullable(),
  port: z.number().int().min(1).max(65535).optional().nullable(),
  url: z
    .string()
    .max(500)
    .optional()
    .nullable()
    .refine((val) => !val || /^https?:\/\//i.test(val.trim()), {
      message: 'URL must start with http:// or https://',
    }),
  remark: z.string().max(1000).optional().nullable(),
  passwordExpiresAt: z.string().optional().nullable(),
  howToConnect: z.string().max(2000).optional().nullable(),
  steps: z.array(z.string()).optional(),
  instructionNotes: z.string().max(1000).optional().nullable(),
});

const updateCredentialSchema = credentialSchema.partial().omit({ siteId: true });

function sanitizeCredentialRecord(c: {
  id: string;
  siteId: string;
  deviceId: string | null;
  deviceName: string;
  deviceModel: string | null;
  managementIp: string | null;
  loginType: LoginType;
  accessMethod: string | null;
  port: number | null;
  url: string | null;
  remark: string | null;
  passwordUpdatedAt: Date;
  passwordExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  site?: { id: string; siteCode: string; siteName: string };
  device?: { id: string; name: string; model: string | null; managementIp: string | null } | null;
  instructions?: Array<{
    id: string;
    title: string;
    howToConnect: string;
    steps: unknown;
    notes: string | null;
  }>;
}) {
  return {
    id: c.id,
    siteId: c.siteId,
    deviceId: c.deviceId,
    deviceName: c.deviceName,
    deviceModel: c.deviceModel,
    managementIp: c.managementIp,
    loginType: c.loginType,
    accessMethod: c.accessMethod,
    port: c.port,
    url: c.url,
    remark: c.remark,
    passwordUpdatedAt: c.passwordUpdatedAt,
    passwordExpiresAt: c.passwordExpiresAt,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    site: c.site,
    device: c.device,
    instructions: c.instructions || [],
    usernameMasked: '••••••••',
    passwordMasked: '••••••••••••',
  };
}

router.get('/', async (req, res, next) => {
  try {
    const siteId = typeof req.query.siteId === 'string' ? req.query.siteId : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const permitted = getPermittedSiteIds(req.user!, 'canViewCredentials');

    if (siteId && permitted !== null && !permitted.includes(siteId)) {
      res.status(403).json({ error: 'You do not have permission to view credentials for this site' });
      return;
    }

    if (permitted !== null && permitted.length === 0) {
      res.json({ credentials: [] });
      return;
    }

    const rows = await prisma.credential.findMany({
      where: {
        ...(siteId ? { siteId } : permitted !== null ? { siteId: { in: permitted } } : {}),
        ...(search
          ? {
              OR: [
                { deviceName: { contains: search, mode: 'insensitive' } },
                { deviceModel: { contains: search, mode: 'insensitive' } },
                { managementIp: { contains: search, mode: 'insensitive' } },
                { accessMethod: { contains: search, mode: 'insensitive' } },
                { url: { contains: search, mode: 'insensitive' } },
                { remark: { contains: search, mode: 'insensitive' } },
                { site: { siteCode: { contains: search, mode: 'insensitive' } } },
                { site: { siteName: { contains: search, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      include: {
        site: { select: { id: true, siteCode: true, siteName: true } },
        device: { select: { id: true, name: true, model: true, managementIp: true } },
        instructions: {
          select: { id: true, title: true, howToConnect: true, steps: true, notes: true },
        },
      },
      orderBy: [{ siteId: 'asc' }, { deviceName: 'asc' }],
    });

    res.json({ credentials: rows.map(sanitizeCredentialRecord) });
  } catch (err) {
    next(err);
  }
});

router.get('/export', async (req, res, next) => {
  try {
    const format = String(req.query.format || 'xlsx').toLowerCase();
    const siteId = typeof req.query.siteId === 'string' && req.query.siteId ? req.query.siteId : undefined;
    const includeSecrets = String(req.query.includeSecrets ?? 'true').toLowerCase() !== 'false';
    const templateOnly = String(req.query.template || 'false').toLowerCase() === 'true';

    const permitted = getPermittedSiteIds(req.user!, 'canViewCredentials');
    if (siteId && permitted !== null && !permitted.includes(siteId)) {
      res.status(403).json({ error: 'Access denied to export credentials for this site' });
      return;
    }

    let exportRows = [];
    if (templateOnly) {
      let sampleSiteCode = 'SITE1';
      if (siteId) {
        const s = await prisma.site.findUnique({ where: { id: siteId }, select: { siteCode: true } });
        if (s) sampleSiteCode = s.siteCode;
      }
      exportRows = [
        {
          siteCode: sampleSiteCode,
          deviceName: 'CORE-SW-01',
          deviceModel: 'Catalyst 9300',
          managementIp: '10.10.10.1',
          loginType: 'SSH',
          username: 'netadmin',
          password: 'ChangeMe123!',
          port: 22,
          url: '',
          accessMethod: 'Jump Host -> SSH',
          howToConnect: 'Connect via Site VPN then SSH',
          steps: '1. Connect VPN\n2. ssh netadmin@10.10.10.1',
          remark: 'Sample row — replace before import',
        },
      ];
    } else {
      const rows =
        permitted !== null && permitted.length === 0
          ? []
          : await prisma.credential.findMany({
              where: {
                ...(siteId ? { siteId } : permitted !== null ? { siteId: { in: permitted } } : {}),
              },
              include: {
                site: { select: { siteCode: true } },
                instructions: { select: { howToConnect: true, steps: true } },
              },
              orderBy: [{ siteId: 'asc' }, { deviceName: 'asc' }],
            });

      exportRows = rows.map((c) => {
        const firstInst = c.instructions?.[0];
        const stepsList = Array.isArray(firstInst?.steps)
          ? (firstInst.steps as unknown[]).map((s) => String(s)).join('\n')
          : '';
        return {
          siteCode: c.site.siteCode,
          deviceName: c.deviceName,
          deviceModel: c.deviceModel,
          managementIp: c.managementIp,
          loginType: c.loginType,
          username: includeSecrets ? decryptSecret(c.usernameEncrypted) : '••••••••',
          password: includeSecrets ? decryptSecret(c.passwordEncrypted) : '••••••••••••',
          port: c.port,
          url: c.url,
          accessMethod: c.accessMethod,
          howToConnect: firstInst?.howToConnect || null,
          steps: stepsList || null,
          remark: c.remark,
        };
      });

      await recordAuditLog({
        req,
        userId: req.user!.id,
        username: req.user!.username,
        action: 'EXPORT_CREDENTIALS',
        module: 'CREDENTIALS',
        siteId: siteId ?? null,
        details: { format, count: exportRows.length, includeSecrets },
      });
    }

    res.setHeader('Cache-Control', 'no-store');
    if (format === 'csv') {
      const csv = buildCredentialsCsv(exportRows);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${templateOnly ? 'nims-credentials-template.csv' : 'nims-access-mgmt.csv'}"`,
      );
      res.send(csv);
      return;
    }

    const xlsxBuf = await buildCredentialsExcelBuffer(exportRows);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${templateOnly ? 'nims-credentials-template.xlsx' : 'nims-access-mgmt.xlsx'}"`,
    );
    res.send(xlsxBuf);
  } catch (err) {
    next(err);
  }
});

router.post('/import/preview', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Spreadsheet file is required' });
      return;
    }

    const siteId = String(req.body.siteId || '');
    if (!siteId) {
      res.status(400).json({ error: 'siteId is required' });
      return;
    }
    if (!hasSitePermission(req.user!, siteId, 'canEditCredentials')) {
      res.status(403).json({ error: 'Permission denied to import credentials into this site' });
      return;
    }

    const parsed = await parseCredentialSpreadsheetBuffer(req.file.buffer, req.file.originalname);
    const existing = await prisma.credential.findMany({
      where: { siteId },
      select: { deviceName: true, loginType: true, managementIp: true },
    });

    const existingKeys = new Set(
      existing.map((c) => `${c.deviceName.toLowerCase()}::${c.loginType}`),
    );
    const seenKeys = new Set<string>();

    const mapVal = (row: Record<string, string>, targetField: string): string => {
      for (const [col, mapped] of Object.entries(parsed.suggestedMapping)) {
        if (mapped === targetField && row[col]) return row[col];
      }
      return '';
    };

    const previewRows = parsed.rows.map((raw, idx) => {
      const issues: string[] = [];
      const deviceName = mapVal(raw, 'deviceName');
      const username = mapVal(raw, 'username');
      const password = mapVal(raw, 'password');
      const ip = mapVal(raw, 'managementIp');
      const portStr = mapVal(raw, 'port');
      const loginType = normalizeLoginType(mapVal(raw, 'loginType'));

      if (!deviceName) issues.push('Missing Device Name');
      if (!username) issues.push('Missing Username');
      if (!password) issues.push('Missing Password');
      if (ip && !isValidIpv4(ip)) issues.push(`Invalid IP: ${ip}`);
      if (portStr) {
        const p = Number(portStr);
        if (!Number.isInteger(p) || p < 1 || p > 65535) issues.push(`Invalid Port: ${portStr}`);
      }

      const key = `${deviceName.toLowerCase()}::${loginType}`;
      let isDuplicate = false;
      if (deviceName && (existingKeys.has(key) || seenKeys.has(key))) {
        issues.push(`Duplicate entry (${deviceName} / ${loginType})`);
        isDuplicate = true;
      }
      if (deviceName) seenKeys.add(key);

      return {
        rowNumber: idx + 2,
        raw,
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
});

const confirmCredImportSchema = z.object({
  siteId: z.string().min(1),
  columnMapping: z.record(z.string()),
  skipDuplicates: z.boolean().default(true),
  rows: z.array(z.record(z.string())),
});

router.post('/import/confirm', async (req, res, next) => {
  try {
    const body = confirmCredImportSchema.parse(req.body);
    if (!hasSitePermission(req.user!, body.siteId, 'canEditCredentials')) {
      res.status(403).json({ error: 'Permission denied to import credentials into this site' });
      return;
    }

    const site = await prisma.site.findUnique({ where: { id: body.siteId } });
    if (!site) {
      res.status(404).json({ error: 'Site not found' });
      return;
    }

    const [existingCreds, siteDevices] = await Promise.all([
      prisma.credential.findMany({
        where: { siteId: body.siteId },
        select: { deviceName: true, loginType: true },
      }),
      prisma.device.findMany({
        where: { siteId: body.siteId },
        select: { id: true, name: true, managementIp: true },
      }),
    ]);

    const existingKeys = new Set(
      existingCreds.map((c) => `${c.deviceName.toLowerCase()}::${c.loginType}`),
    );
    const devByName = new Map(siteDevices.map((d) => [d.name.toLowerCase(), d.id]));
    const devByIp = new Map(
      siteDevices.filter((d) => d.managementIp).map((d) => [d.managementIp!, d.id]),
    );

    let importedCount = 0;
    let skippedDuplicates = 0;
    const errors: Array<{ rowIndex: number; name?: string; error: string }> = [];

    for (let i = 0; i < body.rows.length; i++) {
      const raw = body.rows[i];
      const mapped: Record<string, string> = {};
      for (const [col, targetField] of Object.entries(body.columnMapping)) {
        if (targetField && raw[col] !== undefined) {
          mapped[targetField] = String(raw[col]).trim();
        }
      }

      const deviceName = mapped.deviceName;
      const username = mapped.username;
      const password = mapped.password;
      if (!deviceName || !username || !password) {
        errors.push({
          rowIndex: i + 1,
          name: deviceName,
          error: 'Device Name, Username, and Password are required',
        });
        continue;
      }

      const loginType = normalizeLoginType(mapped.loginType);
      const key = `${deviceName.toLowerCase()}::${loginType}`;
      if (existingKeys.has(key)) {
        if (body.skipDuplicates) {
          skippedDuplicates++;
          continue;
        }
      }
      existingKeys.add(key);

      const portNum = mapped.port ? parseInt(mapped.port, 10) : null;
      const validPort = portNum && !Number.isNaN(portNum) && portNum >= 1 && portNum <= 65535 ? portNum : null;
      const mgmtIp = mapped.managementIp || null;
      const matchedDeviceId =
        devByName.get(deviceName.toLowerCase()) ||
        (mgmtIp ? devByIp.get(mgmtIp) : undefined) ||
        null;

      try {
        const cred = await prisma.credential.create({
          data: {
            siteId: body.siteId,
            deviceId: matchedDeviceId,
            deviceName,
            deviceModel: mapped.deviceModel || null,
            managementIp: mgmtIp,
            loginType,
            usernameEncrypted: encryptSecret(username),
            passwordEncrypted: encryptSecret(password),
            accessMethod: mapped.accessMethod || null,
            port: validPort,
            url: mapped.url || null,
            remark: mapped.remark || null,
            createdById: req.user!.id,
          },
        });

        const steps = (mapped.steps || '')
          .split(/\r?\n|;/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (mapped.howToConnect || steps.length > 0) {
          await prisma.accessInstruction.create({
            data: {
              credentialId: cred.id,
              title: `${deviceName} (${loginType}) Connection Guide`,
              howToConnect: mapped.howToConnect || '',
              steps,
            },
          });
        }
        importedCount++;
      } catch (err) {
        errors.push({ rowIndex: i + 1, name: deviceName, error: (err as Error).message });
      }
    }

    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'IMPORT_CREDENTIALS',
      module: 'CREDENTIALS',
      siteId: site.id,
      siteCode: site.siteCode,
      details: {
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

router.post(
  '/',
  requireSitePermission('canEditCredentials', (req) => req.body?.siteId),
  async (req, res, next) => {
    try {
      const body = credentialSchema.parse(req.body);
      if (body.deviceId) {
        const linkedDevice = await prisma.device.findFirst({
          where: { id: body.deviceId, siteId: body.siteId },
        });
        if (!linkedDevice) {
          res.status(400).json({ error: 'Referenced deviceId does not belong to this site' });
          return;
        }
      }
      const passwordExpiresAt = body.passwordExpiresAt ? new Date(body.passwordExpiresAt) : null;
      if (passwordExpiresAt && Number.isNaN(passwordExpiresAt.getTime())) {
        res.status(400).json({ error: 'Invalid passwordExpiresAt date' });
        return;
      }

      const usernameEncrypted = encryptSecret(body.username);
      const passwordEncrypted = encryptSecret(body.password);

      const tx = prisma;
      const cred = await tx.credential.create({
        data: {
          siteId: body.siteId,
          deviceId: body.deviceId || null,
          deviceName: body.deviceName.trim(),
          deviceModel: body.deviceModel?.trim() || null,
          managementIp: body.managementIp?.trim() || null,
          loginType: body.loginType,
          usernameEncrypted,
          passwordEncrypted,
          accessMethod: body.accessMethod?.trim() || null,
          port: body.port ?? null,
          url: body.url?.trim() || null,
          remark: body.remark?.trim() || null,
          passwordExpiresAt,
          createdById: req.user!.id,
        },
      });

      if (body.howToConnect || (body.steps && body.steps.length > 0)) {
        await tx.accessInstruction.create({
          data: {
            credentialId: cred.id,
            title: `${body.deviceName} (${body.loginType}) Connection Guide`,
            howToConnect: body.howToConnect || '',
            steps: body.steps || [],
            notes: body.instructionNotes || null,
          },
        });
      }

      const created = await tx.credential.findUniqueOrThrow({
        where: { id: cred.id },
        include: {
          site: { select: { id: true, siteCode: true, siteName: true } },
          instructions: true,
        },
      });

      await recordAuditLog({
        req,
        userId: req.user!.id,
        username: req.user!.username,
        action: 'CREATE_CREDENTIAL',
        module: 'CREDENTIALS',
        siteId: created.siteId,
        siteCode: created.site.siteCode,
        deviceId: created.deviceId,
        deviceName: created.deviceName,
        details: { credentialId: created.id, loginType: created.loginType },
      });

      res.status(201).json({ credential: sanitizeCredentialRecord(created) });
    } catch (err) {
      next(err);
    }
  },
);

router.put('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.credential.findUnique({
      where: { id: req.params.id },
      include: { site: { select: { siteCode: true } }, instructions: true },
    });
    if (!existing) {
      res.status(404).json({ error: 'Credential not found' });
      return;
    }
    if (!hasSitePermission(req.user!, existing.siteId, 'canEditCredentials')) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }

    const body = updateCredentialSchema.parse(req.body);
    if (body.deviceId) {
      const linkedDevice = await prisma.device.findFirst({
        where: { id: body.deviceId, siteId: existing.siteId },
      });
      if (!linkedDevice) {
        res.status(400).json({ error: 'Referenced deviceId does not belong to this site' });
        return;
      }
    }
    let nextPasswordExpiresAt: Date | null | undefined = undefined;
    if (body.passwordExpiresAt !== undefined) {
      if (body.passwordExpiresAt) {
        const d = new Date(body.passwordExpiresAt);
        if (Number.isNaN(d.getTime())) {
          res.status(400).json({ error: 'Invalid passwordExpiresAt date' });
          return;
        }
        nextPasswordExpiresAt = d;
      } else {
        nextPasswordExpiresAt = null;
      }
    }

    const tx = prisma;
    const cred = await tx.credential.update({
      where: { id: existing.id },
      data: {
        deviceId: body.deviceId !== undefined ? body.deviceId : undefined,
        deviceName: body.deviceName?.trim(),
        deviceModel: body.deviceModel,
        managementIp: body.managementIp,
        loginType: body.loginType,
        usernameEncrypted: body.username ? encryptSecret(body.username) : undefined,
        passwordEncrypted: body.password ? encryptSecret(body.password) : undefined,
        passwordUpdatedAt: body.password ? new Date() : undefined,
        accessMethod: body.accessMethod,
        port: body.port,
        url: body.url,
        remark: body.remark,
        passwordExpiresAt: nextPasswordExpiresAt,
      },
    });

    if (body.howToConnect !== undefined || body.steps !== undefined) {
      const firstInst = existing.instructions[0];
      if (firstInst) {
        await tx.accessInstruction.update({
          where: { id: firstInst.id },
          data: {
            howToConnect: body.howToConnect ?? firstInst.howToConnect,
            steps: body.steps ?? (firstInst.steps as string[]),
            notes: body.instructionNotes ?? firstInst.notes,
          },
        });
      } else {
        await tx.accessInstruction.create({
          data: {
            credentialId: cred.id,
            title: `${cred.deviceName} Connection Guide`,
            howToConnect: body.howToConnect || '',
            steps: body.steps || [],
            notes: body.instructionNotes || null,
          },
        });
      }
    }

    const updated = await tx.credential.findUniqueOrThrow({
      where: { id: cred.id },
      include: {
        site: { select: { id: true, siteCode: true, siteName: true } },
        instructions: true,
      },
    });

    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'UPDATE_CREDENTIAL',
      module: 'CREDENTIALS',
      siteId: updated.siteId,
      siteCode: updated.site.siteCode,
      deviceId: updated.deviceId,
      deviceName: updated.deviceName,
      details: { credentialId: updated.id, passwordChanged: Boolean(body.password) },
    });

    res.json({ credential: sanitizeCredentialRecord(updated) });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reveal', async (req, res, next) => {
  try {
    const cred = await prisma.credential.findUnique({
      where: { id: req.params.id },
      include: { site: { select: { siteCode: true } } },
    });
    if (!cred) {
      res.status(404).json({ error: 'Credential not found' });
      return;
    }
    if (!hasSitePermission(req.user!, cred.siteId, 'canViewCredentials')) {
      await recordAuditLog({
        req,
        userId: req.user!.id,
        username: req.user!.username,
        action: 'VIEW_CREDENTIAL',
        module: 'CREDENTIALS',
        siteId: cred.siteId,
        siteCode: cred.site.siteCode,
        deviceName: cred.deviceName,
        result: AuditResult.DENIED,
        details: { credentialId: cred.id },
      });
      res.status(403).json({ error: 'Permission denied to view credentials for this site' });
      return;
    }

    const username = decryptSecret(cred.usernameEncrypted);
    const password = decryptSecret(cred.passwordEncrypted);

    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'VIEW_CREDENTIAL',
      module: 'CREDENTIALS',
      siteId: cred.siteId,
      siteCode: cred.site.siteCode,
      deviceId: cred.deviceId,
      deviceName: cred.deviceName,
      details: { credentialId: cred.id, loginType: cred.loginType },
    });

    res.json({
      id: cred.id,
      username,
      password,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/copy', async (req, res, next) => {
  try {
    const field = req.body?.field === 'username' ? 'username' : 'password';
    const cred = await prisma.credential.findUnique({
      where: { id: req.params.id },
      include: { site: { select: { siteCode: true } } },
    });
    if (!cred) {
      res.status(404).json({ error: 'Credential not found' });
      return;
    }
    if (!hasSitePermission(req.user!, cred.siteId, 'canViewCredentials')) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }

    const value =
      field === 'username'
        ? decryptSecret(cred.usernameEncrypted)
        : decryptSecret(cred.passwordEncrypted);

    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: field === 'username' ? 'COPY_USERNAME' : 'COPY_PASSWORD',
      module: 'CREDENTIALS',
      siteId: cred.siteId,
      siteCode: cred.site.siteCode,
      deviceId: cred.deviceId,
      deviceName: cred.deviceName,
      details: { credentialId: cred.id, field },
    });

    res.json({ field, value });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/history', async (req, res, next) => {
  try {
    const cred = await prisma.credential.findUnique({ where: { id: req.params.id } });
    if (!cred) {
      res.status(404).json({ error: 'Credential not found' });
      return;
    }
    if (!hasSitePermission(req.user!, cred.siteId, 'canViewCredentials')) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }

    const logs = await prisma.auditLog.findMany({
      where: {
        module: 'CREDENTIALS',
        siteId: cred.siteId,
        deviceName: cred.deviceName,
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    res.json({ history: logs });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.credential.findUnique({
      where: { id: req.params.id },
      include: { site: { select: { siteCode: true } } },
    });
    if (!existing) {
      res.status(404).json({ error: 'Credential not found' });
      return;
    }
    if (!hasSitePermission(req.user!, existing.siteId, 'canEditCredentials')) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }

    await prisma.credential.delete({ where: { id: existing.id } });

    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'DELETE_CREDENTIAL',
      module: 'CREDENTIALS',
      siteId: existing.siteId,
      siteCode: existing.site.siteCode,
      deviceName: existing.deviceName,
    });

    res.json({ message: 'Credential deleted' });
  } catch (err) {
    next(err);
  }
});

export default router;

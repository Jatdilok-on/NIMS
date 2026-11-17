import os from 'os';
import fs from 'fs';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { BackupSchedule, RoleCode } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { readStoredFile, saveSiteFile } from '../lib/storage';
import { refreshBackupScheduler } from '../lib/backup';
import { recordAuditLog } from '../lib/audit';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const settingsSchema = z.object({
  organizationName: z.string().min(2).max(160).optional(),
  defaultTheme: z.enum(['light', 'dark', 'midnight', 'emerald', 'indigo', 'nord']).optional(),
  storageLocation: z.string().min(1).max(500).optional(),
  backupLocation: z.string().min(1).max(500).optional(),
  backupSchedule: z.nativeEnum(BackupSchedule).optional(),
  backupRetentionCount: z.number().int().min(1).max(365).optional(),
  auditRetentionDays: z.number().int().min(30).max(3650).optional(),
});

router.get('/public', async (_req, res, next) => {
  try {
    const s = await prisma.systemSetting.findUnique({ where: { key: 'default' } });
    res.json({
      organizationName: s?.organizationName || 'NIMS Enterprise',
      defaultTheme: s?.defaultTheme || 'light',
      hasLogo: Boolean(s?.logoPath),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/logo', async (_req, res, next) => {
  try {
    const s = await prisma.systemSetting.findUnique({ where: { key: 'default' } });
    if (!s?.logoPath) {
      res.status(404).json({ error: 'Logo not configured' });
      return;
    }
    const buf = readStoredFile(s.logoPath);
    const ext = s.logoPath.toLowerCase().split('.').pop();
    const mime =
      ext === 'svg'
        ? 'image/svg+xml'
        : ext === 'jpg' || ext === 'jpeg'
          ? 'image/jpeg'
          : 'image/png';
    res.setHeader('Content-Type', mime);
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

router.use(authenticate, requireRoles(RoleCode.SUPER_ADMIN));

router.get('/', async (_req, res, next) => {
  try {
    const settings = await prisma.systemSetting.findUnique({ where: { key: 'default' } });
    res.json({ settings });
  } catch (err) {
    next(err);
  }
});

router.put('/', async (req, res, next) => {
  try {
    const body = settingsSchema.parse(req.body);
    const existingSetting = await prisma.systemSetting.findUnique({ where: { key: 'default' } });
    const settings = existingSetting
      ? await prisma.systemSetting.update({
          where: { id: existingSetting.id },
          data: body,
        })
      : await prisma.systemSetting.create({
          data: {
            key: 'default',
            ...body,
          },
        });

    await refreshBackupScheduler();

    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'UPDATE_SYSTEM_SETTINGS',
      module: 'SETTINGS',
      details: body as Record<string, unknown>,
    });

    res.json({ settings });
  } catch (err) {
    next(err);
  }
});

router.post('/logo', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Logo file is required' });
      return;
    }
    const saved = saveSiteFile('global', 'branding', req.file.originalname, req.file.buffer);
    const settings = await prisma.systemSetting.update({
      where: { key: 'default' },
      data: { logoPath: saved.relativePath },
    });
    res.json({ settings });
  } catch (err) {
    next(err);
  }
});

router.get('/system-info', async (_req, res, next) => {
  try {
    const [dbCheck, siteCount, deviceCount, userCount, auditCount] = await Promise.all([
      prisma.$runCommandRaw({ ping: 1 }),
      prisma.site.count(),
      prisma.device.count(),
      prisma.user.count(),
      prisma.auditLog.count(),
    ]);
    const settings = await prisma.systemSetting.findUnique({ where: { key: 'default' } });

    res.json({
      systemInfo: {
        nodeVersion: process.version,
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        uptimeSeconds: Math.floor(process.uptime()),
        totalMemoryMb: Math.round(os.totalmem() / 1024 / 1024),
        freeMemoryMb: Math.round(os.freemem() / 1024 / 1024),
        databaseStatus: dbCheck ? 'Connected (MongoDB)' : 'Unknown',
        storageExists: settings ? fs.existsSync(settings.storageLocation) : false,
        counts: { siteCount, deviceCount, userCount, auditCount },
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;

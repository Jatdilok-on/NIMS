import os from 'os';
import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { BackupSchedule, RoleCode } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import {
  ALLOWED_LOGO_EXTENSIONS,
  deleteStoredFile,
  isAllowedExtension,
  readStoredFile,
  resolveSafeMimeType,
  saveSiteFile,
} from '../lib/storage';
import { getStorageAndBackupDirs, refreshBackupScheduler } from '../lib/backup';
import { recordAuditLog } from '../lib/audit';
import { env } from '../config/env';

function getDirectorySizeSafe(dirPath: string, depth = 0): number {
  if (depth > 8 || !fs.existsSync(dirPath)) return 0;
  let total = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += getDirectorySizeSafe(full, depth + 1);
      } else if (entry.isFile()) {
        total += fs.statSync(full).size;
      }
    }
  } catch {
    // ignore unreadable subpaths
  }
  return total;
}

function getDiskFreeBytesSafe(dirPath: string): number | null {
  try {
    const probe = fs.existsSync(dirPath) ? dirPath : path.dirname(dirPath);
    if (!fs.existsSync(probe)) return null;
    const stats = fs.statfsSync(probe);
    return Number(stats.bavail) * Number(stats.bsize);
  } catch {
    return null;
  }
}

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
    const mime = resolveSafeMimeType(s.logoPath);
    res.setHeader('Content-Type', mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox; style-src 'unsafe-inline'");
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
    if (!isAllowedExtension(req.file.originalname, ALLOWED_LOGO_EXTENSIONS)) {
      res.status(400).json({ error: 'Logo must be a PNG, JPG, WEBP, GIF, or ICO image' });
      return;
    }
    const existingSetting = await prisma.systemSetting.findUnique({ where: { key: 'default' } });
    const saved = saveSiteFile('global', 'branding', req.file.originalname, req.file.buffer);
    const settings = existingSetting
      ? await prisma.systemSetting.update({
          where: { id: existingSetting.id },
          data: { logoPath: saved.relativePath },
        })
      : await prisma.systemSetting.create({
          data: { key: 'default', logoPath: saved.relativePath },
        });
    if (existingSetting?.logoPath && existingSetting.logoPath !== saved.relativePath) {
      deleteStoredFile(existingSetting.logoPath);
    }
    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'UPDATE_SYSTEM_LOGO',
      module: 'SETTINGS',
      details: { fileName: req.file.originalname },
    });
    res.json({ settings });
  } catch (err) {
    next(err);
  }
});

router.get('/system-info', async (_req, res, next) => {
  try {
    const [dbCheck, siteCount, deviceCount, documentCount, diagramCount, userCount, auditCount, dirs] =
      await Promise.all([
        prisma.$runCommandRaw({ ping: 1 }),
        prisma.site.count(),
        prisma.device.count(),
        prisma.document.count(),
        prisma.diagram.count(),
        prisma.user.count(),
        prisma.auditLog.count(),
        getStorageAndBackupDirs(),
      ]);

    const storageUsageBytes = getDirectorySizeSafe(env.storageRoot);
    const backupUsageBytes = getDirectorySizeSafe(dirs.backupDir);
    const backupDiskFreeBytes = getDiskFreeBytesSafe(dirs.backupDir);

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
        storageExists: fs.existsSync(env.storageRoot),
        activeStorageRoot: env.storageRoot,
        activeBackupDir: dirs.backupDir,
        storageUsageBytes,
        backupUsageBytes,
        backupDiskFreeBytes,
        counts: { siteCount, deviceCount, documentCount, diagramCount, userCount, auditCount },
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;

import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import multer from 'multer';
import { BackupStatus, BackupType, RoleCode } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { createSystemBackup, restoreFromBackupArchive } from '../lib/backup';
import { recordAuditLog } from '../lib/audit';
import { env } from '../config/env';
import { ensureDir } from '../lib/storage';

const router = Router();
router.use(authenticate, requireRoles(RoleCode.SUPER_ADMIN));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
});

router.get('/', async (_req, res, next) => {
  try {
    const jobs = await prisma.backupJob.findMany({
      include: {
        initiatedBy: { select: { id: true, username: true, fullName: true } },
      },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
    res.json({ jobs });
  } catch (err) {
    next(err);
  }
});

router.post('/run', async (req, res, next) => {
  try {
    const job = await createSystemBackup({
      type: BackupType.MANUAL,
      initiatedById: req.user!.id,
      notes: req.body?.notes || 'Manual backup',
      includesDb: req.body?.includesDb !== false,
      includesFiles: req.body?.includesFiles !== false,
    });

    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'RUN_BACKUP',
      module: 'BACKUP',
      details: { jobId: job.id, fileName: job.fileName, fileSize: job.fileSize },
    });

    res.status(201).json({ job });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/download', async (req, res, next) => {
  try {
    const job = await prisma.backupJob.findUnique({ where: { id: req.params.id } });
    if (!job || !fs.existsSync(job.filePath)) {
      res.status(404).json({ error: 'Backup archive not found on disk' });
      return;
    }

    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'DOWNLOAD_BACKUP',
      module: 'BACKUP',
      details: { jobId: job.id, fileName: job.fileName },
    });

    res.download(job.filePath, job.fileName);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/restore', async (req, res, next) => {
  try {
    const job = await prisma.backupJob.findUnique({ where: { id: req.params.id } });
    if (!job || !fs.existsSync(job.filePath)) {
      res.status(404).json({ error: 'Backup archive not found' });
      return;
    }
    if (job.status !== BackupStatus.COMPLETED && job.status !== BackupStatus.RESTORED) {
      res.status(400).json({ error: `Cannot restore backup job with status ${job.status}` });
      return;
    }

    const result = await restoreFromBackupArchive(job.filePath);

    await prisma.backupJob.update({
      where: { id: job.id },
      data: { status: BackupStatus.RESTORED },
    });

    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'RESTORE_BACKUP',
      module: 'BACKUP',
      details: { jobId: job.id, ...result },
    });

    res.json({ message: 'Backup restored successfully', ...result });
  } catch (err) {
    next(err);
  }
});

router.post('/upload-restore', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file || !req.file.originalname.endsWith('.zip')) {
      res.status(400).json({ error: 'Valid .zip backup archive is required' });
      return;
    }

    ensureDir(env.backupRoot);
    const tempPath = path.join(env.backupRoot, `restore-upload-${Date.now()}.zip`);
    fs.writeFileSync(tempPath, req.file.buffer);

    let result;
    try {
      result = await restoreFromBackupArchive(tempPath);
    } finally {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {
        // ignore temp cleanup failure
      }
    }

    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'UPLOAD_RESTORE_BACKUP',
      module: 'BACKUP',
      details: { originalFileName: req.file.originalname, ...result },
    });

    res.json({ message: 'Backup archive uploaded and restored', ...result });
  } catch (err) {
    next(err);
  }
});

export default router;

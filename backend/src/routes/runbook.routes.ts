import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { Router } from 'express';
import { RoleCode } from '@prisma/client';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { recordAuditLog } from '../lib/audit';
import { env } from '../config/env';
import { ensureDir, resolveSafeStoragePath, sanitizeFileName } from '../lib/storage';
import {
  loadRunbookGuides,
  resetRunbookGuides,
  RunbookGuide,
  RunbookIconType,
  saveRunbookGuides,
  withRunbookLock,
} from '../lib/runbookStore';

const router = Router();
router.use(authenticate);

const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const ALLOWED_IMAGE_MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function detectImageExtension(buffer: Buffer): { ext: string; mime: string } | null {
  if (buffer.length < 12) return null;
  if (buffer.subarray(0, 8).equals(PNG_SIG)) {
    return { ext: '.png', mime: 'image/png' };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: '.jpg', mime: 'image/jpeg' };
  }
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { ext: '.webp', mime: 'image/webp' };
  }
  const gifHdr = buffer.subarray(0, 6).toString('ascii');
  if (gifHdr === 'GIF87a' || gifHdr === 'GIF89a') {
    return { ext: '.gif', mime: 'image/gif' };
  }
  return null;
}

function getRunbookImagesDir(): string {
  const dir = resolveSafeStoragePath(path.join('runbook', 'images'));
  ensureDir(dir);
  return dir;
}

function removeImageFileIfPresent(imageFile?: string | null): void {
  if (!imageFile) return;
  try {
    const safeName = sanitizeFileName(imageFile);
    if (!safeName || safeName === '.' || safeName === '..') return;
    const target = resolveSafeStoragePath(path.join('runbook', 'images', safeName));
    if (fs.existsSync(target) && fs.statSync(target).isFile()) {
      fs.unlinkSync(target);
    }
  } catch {
    // ignore cleanup failures
  }
}

const ICON_TYPES: [RunbookIconType, ...RunbookIconType[]] = [
  'CRANE',
  'AMR',
  'SHUTTLE',
  'PLC',
  'AP',
  'CLIENT',
  'SWITCH',
  'SERVER',
  'CAMERA',
  'OTHER',
];

const pingRuleSchema = z.object({
  condition: z.string().trim().min(1).max(300),
  meaning: z.string().trim().min(1).max(500),
});

const guidePayloadSchema = z.object({
  id: z.string().trim().min(1).max(64).optional(),
  codeBadge: z.string().trim().min(1).max(50),
  iconType: z.enum(ICON_TYPES).default('OTHER'),
  thTitle: z.string().trim().min(1).max(160),
  enTitle: z.string().trim().max(160).optional().default(''),
  thPath: z.string().trim().max(400).optional().default(''),
  enPath: z.string().trim().max(400).optional().default(''),
  thPhysical: z.array(z.string().trim().min(1).max(500)).default([]),
  enPhysical: z.array(z.string().trim().min(1).max(500)).default([]),
  thNetworkMatrix: z.array(pingRuleSchema).default([]),
  enNetworkMatrix: z.array(pingRuleSchema).default([]),
  thSelfFix: z.array(z.string().trim().min(1).max(500)).default([]),
  enSelfFix: z.array(z.string().trim().min(1).max(500)).default([]),
  thEscalate: z.array(z.string().trim().min(1).max(500)).default([]),
  enEscalate: z.array(z.string().trim().min(1).max(500)).default([]),
  clearImage: z.boolean().optional(),
});

function slugifyId(input: string): string {
  const cleaned = input
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return cleaned || `GUIDE_${Date.now().toString(36).toUpperCase()}`;
}

function normalizeGuideInput(
  body: z.infer<typeof guidePayloadSchema>,
  fixedId: string,
  username: string,
  existingImageFile?: string | null,
): RunbookGuide {
  const thTitle = body.thTitle.trim();
  const enTitle = body.enTitle.trim() || thTitle;
  const thPath = body.thPath.trim() || '-';
  const enPath = body.enPath.trim() || thPath;
  const thPhysical = body.thPhysical;
  const enPhysical = body.enPhysical.length > 0 ? body.enPhysical : thPhysical;
  const thNetworkMatrix = body.thNetworkMatrix;
  const enNetworkMatrix =
    body.enNetworkMatrix.length > 0 ? body.enNetworkMatrix : thNetworkMatrix;
  const thSelfFix = body.thSelfFix;
  const enSelfFix = body.enSelfFix.length > 0 ? body.enSelfFix : thSelfFix;
  const thEscalate = body.thEscalate;
  const enEscalate = body.enEscalate.length > 0 ? body.enEscalate : thEscalate;

  return {
    id: fixedId,
    codeBadge: body.codeBadge.trim(),
    iconType: body.iconType,
    thTitle,
    enTitle,
    thPath,
    enPath,
    thPhysical,
    enPhysical,
    thNetworkMatrix,
    enNetworkMatrix,
    thSelfFix,
    enSelfFix,
    thEscalate,
    enEscalate,
    imageFile: body.clearImage ? null : existingImageFile ?? null,
    updatedBy: username,
    updatedAt: new Date().toISOString(),
  };
}

// All signed-in users (including IT Service / Viewers) can read Runbook guides & attached photos
router.get('/', (_req, res, next) => {
  try {
    const guides = loadRunbookGuides();
    res.json({ guides });
  } catch (err) {
    next(err);
  }
});

router.get('/images/:filename', (req, res) => {
  try {
    const rawParam = String(req.params.filename || '');
    const safeName = sanitizeFileName(rawParam);
    if (!safeName || safeName === '.' || safeName === '..' || safeName !== rawParam) {
      res.status(400).json({ error: 'Invalid image filename' });
      return;
    }

    const ext = path.extname(safeName).toLowerCase();
    const mimeType = ALLOWED_IMAGE_MIME_BY_EXT[ext];
    if (!mimeType) {
      res.status(400).json({ error: 'Unsupported image format' });
      return;
    }

    const fullPath = resolveSafeStoragePath(path.join('runbook', 'images', safeName), env.storageRoot);
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
      res.status(404).json({ error: 'Runbook image not found' });
      return;
    }

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.sendFile(fullPath);
  } catch {
    res.status(400).json({ error: 'Invalid image path' });
  }
});

// Network Engineer, Site Admin, and Super Admin can create, update, upload images, or delete guides
router.post(
  '/',
  requireRoles(RoleCode.SUPER_ADMIN, RoleCode.SITE_ADMIN, RoleCode.NETWORK_ENGINEER),
  async (req, res, next) => {
    try {
      const parsed = guidePayloadSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid runbook guide data' });
        return;
      }

      const { created, nextGuides } = await withRunbookLock(() => {
        const guides = loadRunbookGuides();
        let candidateId = slugifyId(parsed.data.id || parsed.data.codeBadge || parsed.data.thTitle);
        let suffix = 2;
        while (guides.some((g) => g.id === candidateId)) {
          candidateId = `${slugifyId(parsed.data.id || parsed.data.codeBadge)}_${suffix++}`;
        }

        const entry = normalizeGuideInput(parsed.data, candidateId, req.user!.username, null);
        const updatedList = [...guides, entry];
        saveRunbookGuides(updatedList);
        return { created: entry, nextGuides: updatedList };
      });

      await recordAuditLog({
        req,
        userId: req.user!.id,
        username: req.user!.username,
        action: 'ADD_RUNBOOK_GUIDE',
        module: 'RUNBOOK',
        details: { guideId: created.id, title: created.thTitle },
      });

      res.status(201).json({ guide: created, guides: nextGuides });
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  '/:id',
  requireRoles(RoleCode.SUPER_ADMIN, RoleCode.SITE_ADMIN, RoleCode.NETWORK_ENGINEER),
  async (req, res, next) => {
    try {
      const parsed = guidePayloadSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid runbook guide data' });
        return;
      }

      const targetId = String(req.params.id);
      const outcome = await withRunbookLock(() => {
        const guides = loadRunbookGuides();
        const idx = guides.findIndex((g) => g.id === targetId);
        if (idx < 0) return null;

        const prevImage = guides[idx].imageFile ?? null;
        const updated = normalizeGuideInput(parsed.data, targetId, req.user!.username, prevImage);
        const nextGuides = [...guides];
        nextGuides[idx] = updated;
        saveRunbookGuides(nextGuides);
        return { updated, nextGuides, clearedImage: parsed.data.clearImage ? prevImage : null };
      });

      if (!outcome) {
        res.status(404).json({ error: 'Runbook guide not found' });
        return;
      }

      if (outcome.clearedImage) {
        removeImageFileIfPresent(outcome.clearedImage);
      }

      await recordAuditLog({
        req,
        userId: req.user!.id,
        username: req.user!.username,
        action: 'UPDATE_RUNBOOK_GUIDE',
        module: 'RUNBOOK',
        details: { guideId: outcome.updated.id, title: outcome.updated.thTitle },
      });

      res.json({ guide: outcome.updated, guides: outcome.nextGuides });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/image',
  requireRoles(RoleCode.SUPER_ADMIN, RoleCode.SITE_ADMIN, RoleCode.NETWORK_ENGINEER),
  uploadImage.single('image'),
  async (req, res, next) => {
    let writtenFilename: string | null = null;
    try {
      const targetId = String(req.params.id);
      if (!req.file) {
        res.status(400).json({ error: 'Image file is required' });
        return;
      }

      const detected = detectImageExtension(req.file.buffer);
      if (!detected) {
        res.status(400).json({ error: 'Only PNG, JPG, WEBP, or GIF image files are allowed' });
        return;
      }

      const imagesDir = getRunbookImagesDir();
      const filename = `${sanitizeFileName(targetId)}-${crypto.randomBytes(6).toString('hex')}${detected.ext}`;
      const destPath = path.join(imagesDir, filename);
      fs.writeFileSync(destPath, req.file.buffer);
      writtenFilename = filename;

      const outcome = await withRunbookLock(() => {
        const guides = loadRunbookGuides();
        const idx = guides.findIndex((g) => g.id === targetId);
        if (idx < 0) return null;

        const prevImage = guides[idx].imageFile ?? null;
        const updated: RunbookGuide = {
          ...guides[idx],
          imageFile: filename,
          updatedBy: req.user!.username,
          updatedAt: new Date().toISOString(),
        };
        const nextGuides = [...guides];
        nextGuides[idx] = updated;
        saveRunbookGuides(nextGuides);
        return { updated, nextGuides, prevImage };
      });

      if (!outcome) {
        removeImageFileIfPresent(writtenFilename);
        res.status(404).json({ error: 'Runbook guide not found' });
        return;
      }

      // Only delete previous image after guides.json persisted successfully
      if (outcome.prevImage && outcome.prevImage !== filename) {
        removeImageFileIfPresent(outcome.prevImage);
      }

      await recordAuditLog({
        req,
        userId: req.user!.id,
        username: req.user!.username,
        action: 'UPLOAD_RUNBOOK_IMAGE',
        module: 'RUNBOOK',
        details: { guideId: targetId, filename },
      });

      res.json({ guide: outcome.updated, guides: outcome.nextGuides });
    } catch (err) {
      if (writtenFilename) removeImageFileIfPresent(writtenFilename);
      next(err);
    }
  },
);

router.delete(
  '/:id',
  requireRoles(RoleCode.SUPER_ADMIN, RoleCode.SITE_ADMIN, RoleCode.NETWORK_ENGINEER),
  async (req, res, next) => {
    try {
      const targetId = String(req.params.id);
      const outcome = await withRunbookLock(() => {
        const guides = loadRunbookGuides();
        const target = guides.find((g) => g.id === targetId);
        if (!target) return { status: 404 as const };
        if (guides.length <= 1) return { status: 400 as const };

        const nextGuides = guides.filter((g) => g.id !== targetId);
        saveRunbookGuides(nextGuides);
        return { status: 200 as const, target, nextGuides };
      });

      if (outcome.status === 404) {
        res.status(404).json({ error: 'Runbook guide not found' });
        return;
      }
      if (outcome.status === 400) {
        res.status(400).json({ error: 'Cannot delete the last remaining runbook guide' });
        return;
      }

      removeImageFileIfPresent(outcome.target.imageFile);

      await recordAuditLog({
        req,
        userId: req.user!.id,
        username: req.user!.username,
        action: 'DELETE_RUNBOOK_GUIDE',
        module: 'RUNBOOK',
        details: { guideId: targetId, title: outcome.target.thTitle },
      });

      res.json({ guides: outcome.nextGuides });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/reset-defaults',
  requireRoles(RoleCode.SUPER_ADMIN, RoleCode.SITE_ADMIN),
  async (req, res, next) => {
    try {
      const guides = await withRunbookLock(() => {
        const fresh = resetRunbookGuides();
        // Sweep all uploaded runbook images (including any orphans)
        try {
          const imagesDir = getRunbookImagesDir();
          for (const file of fs.readdirSync(imagesDir)) {
            removeImageFileIfPresent(file);
          }
        } catch {
          // ignore sweep failure
        }
        return fresh;
      });

      await recordAuditLog({
        req,
        userId: req.user!.id,
        username: req.user!.username,
        action: 'RESET_RUNBOOK_GUIDES',
        module: 'RUNBOOK',
      });
      res.json({ guides });
    } catch (err) {
      next(err);
    }
  },
);

export default router;

import { Router } from 'express';
import { RoleCode } from '@prisma/client';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { recordAuditLog } from '../lib/audit';
import {
  loadRunbookGuides,
  resetRunbookGuides,
  RunbookGuide,
  RunbookIconType,
  saveRunbookGuides,
} from '../lib/runbookStore';

const router = Router();
router.use(authenticate);

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
    updatedBy: username,
    updatedAt: new Date().toISOString(),
  };
}

// All signed-in users (including IT Service / Viewers) can read Runbook guides
router.get('/', (_req, res) => {
  const guides = loadRunbookGuides();
  res.json({ guides });
});

// Network Engineer, Site Admin, and Super Admin can create, update, or delete guides
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

      const guides = loadRunbookGuides();
      let candidateId = slugifyId(parsed.data.id || parsed.data.codeBadge || parsed.data.thTitle);
      let suffix = 2;
      while (guides.some((g) => g.id === candidateId)) {
        candidateId = `${slugifyId(parsed.data.id || parsed.data.codeBadge)}_${suffix++}`;
      }

      const created = normalizeGuideInput(parsed.data, candidateId, req.user!.username);
      const nextGuides = [...guides, created];
      saveRunbookGuides(nextGuides);

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
      const guides = loadRunbookGuides();
      const idx = guides.findIndex((g) => g.id === targetId);
      if (idx < 0) {
        res.status(404).json({ error: 'Runbook guide not found' });
        return;
      }

      const updated = normalizeGuideInput(parsed.data, targetId, req.user!.username);
      const nextGuides = [...guides];
      nextGuides[idx] = updated;
      saveRunbookGuides(nextGuides);

      await recordAuditLog({
        req,
        userId: req.user!.id,
        username: req.user!.username,
        action: 'UPDATE_RUNBOOK_GUIDE',
        module: 'RUNBOOK',
        details: { guideId: updated.id, title: updated.thTitle },
      });

      res.json({ guide: updated, guides: nextGuides });
    } catch (err) {
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
      const guides = loadRunbookGuides();
      const target = guides.find((g) => g.id === targetId);
      if (!target) {
        res.status(404).json({ error: 'Runbook guide not found' });
        return;
      }

      const nextGuides = guides.filter((g) => g.id !== targetId);
      saveRunbookGuides(nextGuides);

      await recordAuditLog({
        req,
        userId: req.user!.id,
        username: req.user!.username,
        action: 'DELETE_RUNBOOK_GUIDE',
        module: 'RUNBOOK',
        details: { guideId: targetId, title: target.thTitle },
      });

      res.json({ guides: nextGuides });
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
      const guides = resetRunbookGuides();
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

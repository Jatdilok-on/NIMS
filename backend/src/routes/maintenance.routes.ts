import { Router } from 'express';
import { z } from 'zod';
import { MaintenanceStatus, MaintenanceType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { getPermittedSiteIds, hasSitePermission, requireSitePermission } from '../middleware/rbac';
import { recordAuditLog } from '../lib/audit';

const router = Router();
router.use(authenticate);

const maintenanceSchema = z.object({
  siteId: z.string().min(1),
  deviceId: z.string().optional().nullable(),
  title: z.string().min(2).max(200),
  maintenanceType: z.nativeEnum(MaintenanceType).default(MaintenanceType.PREVENTIVE),
  status: z.nativeEnum(MaintenanceStatus).default(MaintenanceStatus.COMPLETED),
  performedAt: z.string().optional(),
  nextScheduledAt: z.string().optional().nullable(),
  engineerName: z.string().max(160).optional().nullable(),
  summary: z.string().min(2).max(2000),
  findings: z.string().max(2000).optional().nullable(),
  actionsTaken: z.string().max(2000).optional().nullable(),
});

router.get('/', async (req, res, next) => {
  try {
    const siteId = typeof req.query.siteId === 'string' ? req.query.siteId : undefined;
    const permitted = getPermittedSiteIds(req.user!, 'canViewMaintenance');
    if (siteId && permitted !== null && !permitted.includes(siteId)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const records = await prisma.maintenanceRecord.findMany({
      where: siteId ? { siteId } : permitted !== null ? { siteId: { in: permitted } } : {},
      include: {
        site: { select: { id: true, siteCode: true, siteName: true } },
        device: { select: { id: true, name: true, model: true, managementIp: true } },
      },
      orderBy: { performedAt: 'desc' },
    });

    res.json({ records });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  requireSitePermission('canEditMaintenance', (req) => req.body?.siteId),
  async (req, res, next) => {
    try {
      const body = maintenanceSchema.parse(req.body);
      const site = await prisma.site.findUnique({ where: { id: body.siteId } });
      if (!site) {
        res.status(404).json({ error: 'Site not found' });
        return;
      }

      if (body.deviceId) {
        const device = await prisma.device.findFirst({
          where: { id: body.deviceId, siteId: body.siteId },
        });
        if (!device) {
          res.status(400).json({ error: 'Referenced deviceId does not belong to this site' });
          return;
        }
      }

      const performedAt = body.performedAt ? new Date(body.performedAt) : new Date();
      if (Number.isNaN(performedAt.getTime())) {
        res.status(400).json({ error: 'Invalid performedAt date' });
        return;
      }
      const nextScheduledAt = body.nextScheduledAt ? new Date(body.nextScheduledAt) : null;
      if (nextScheduledAt && Number.isNaN(nextScheduledAt.getTime())) {
        res.status(400).json({ error: 'Invalid nextScheduledAt date' });
        return;
      }

      const record = await prisma.maintenanceRecord.create({
        data: {
          siteId: body.siteId,
          deviceId: body.deviceId || null,
          title: body.title.trim(),
          maintenanceType: body.maintenanceType,
          status: body.status,
          performedAt,
          nextScheduledAt,
          engineerName: body.engineerName || req.user!.fullName,
          engineerUserId: req.user!.id,
          summary: body.summary.trim(),
          findings: body.findings?.trim() || null,
          actionsTaken: body.actionsTaken?.trim() || null,
        },
        include: {
          site: { select: { id: true, siteCode: true, siteName: true } },
          device: { select: { id: true, name: true } },
        },
      });

      await recordAuditLog({
        req,
        userId: req.user!.id,
        username: req.user!.username,
        action: 'ADD_MAINTENANCE_RECORD',
        module: 'MAINTENANCE',
        siteId: record.siteId,
        siteCode: record.site.siteCode,
        deviceId: record.deviceId,
        deviceName: record.device?.name,
        details: { title: record.title, type: record.maintenanceType },
      });

      res.status(201).json({ record });
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.maintenanceRecord.findUnique({
      where: { id: req.params.id },
      include: { site: { select: { siteCode: true } }, device: { select: { name: true } } },
    });
    if (!existing) {
      res.status(404).json({ error: 'Maintenance record not found' });
      return;
    }
    if (!hasSitePermission(req.user!, existing.siteId, 'canEditMaintenance')) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }
    await prisma.maintenanceRecord.delete({ where: { id: existing.id } });
    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'DELETE_MAINTENANCE_RECORD',
      module: 'MAINTENANCE',
      siteId: existing.siteId,
      siteCode: existing.site.siteCode,
      deviceId: existing.deviceId,
      deviceName: existing.device?.name,
      details: { recordId: existing.id, title: existing.title },
    });
    res.json({ message: 'Deleted' });
  } catch (err) {
    next(err);
  }
});

export default router;

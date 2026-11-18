import { Router } from 'express';
import { AuditResult, Prisma, RoleCode } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';

const router = Router();
router.use(authenticate, requireRoles(RoleCode.SUPER_ADMIN, RoleCode.SITE_ADMIN));

router.get('/', async (req, res, next) => {
  try {
    const user = req.user!;
    const siteId = typeof req.query.siteId === 'string' ? req.query.siteId : undefined;
    const action = typeof req.query.action === 'string' ? req.query.action.trim() : undefined;
    const module = typeof req.query.module === 'string' ? req.query.module.trim() : undefined;
    const username = typeof req.query.username === 'string' ? req.query.username.trim() : undefined;
    const result =
      typeof req.query.result === 'string' && req.query.result in AuditResult
        ? (req.query.result as AuditResult)
        : undefined;

    const rawPage = parseInt(String(req.query.page || '1'), 10);
    const rawPageSize = parseInt(String(req.query.pageSize || '50'), 10);
    const page = Math.max(1, Number.isFinite(rawPage) ? rawPage : 1);
    const pageSize = Math.min(200, Math.max(1, Number.isFinite(rawPageSize) ? rawPageSize : 50));

    const where: Prisma.AuditLogWhereInput = {};
    if (user.roleCode !== RoleCode.SUPER_ADMIN) {
      const permittedSites = user.sitePermissions.map((p) => p.siteId);
      if (siteId && !permittedSites.includes(siteId)) {
        res.status(403).json({ error: 'Access denied to requested site audit logs' });
        return;
      }
      where.siteId = siteId ? siteId : { in: permittedSites };
    } else if (siteId) {
      where.siteId = siteId;
    }
    if (action) where.action = { contains: action, mode: 'insensitive' };
    if (module) where.module = { contains: module, mode: 'insensitive' };
    if (username) where.username = { contains: username, mode: 'insensitive' };
    if (result) where.result = result;

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    res.json({
      logs,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize) || 1,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;

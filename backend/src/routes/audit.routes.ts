import { Router } from 'express';
import { AuditResult, Prisma, RoleCode } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { clearApiRequestLogs, queryApiRequestLogs } from '../lib/apiLogger';
import { recordAuditLog } from '../lib/audit';

const router = Router();
router.use(authenticate, requireRoles(RoleCode.SUPER_ADMIN, RoleCode.SITE_ADMIN));

router.get('/', async (req, res, next) => {
  try {
    const user = req.user!;
    const siteId = typeof req.query.siteId === 'string' && req.query.siteId.trim() ? req.query.siteId.trim() : undefined;
    const action = typeof req.query.action === 'string' ? req.query.action.trim() : undefined;
    const module = typeof req.query.module === 'string' ? req.query.module.trim() : undefined;
    const modulesRaw = typeof req.query.modules === 'string' ? req.query.modules.trim() : undefined;
    const username = typeof req.query.username === 'string' ? req.query.username.trim() : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
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

    if (modulesRaw) {
      const list = modulesRaw
        .split(',')
        .map((m) => m.trim().toUpperCase())
        .filter(Boolean);
      if (list.length === 1) {
        where.module = { equals: list[0], mode: 'insensitive' };
      } else if (list.length > 1) {
        where.module = { in: list };
      }
    } else if (module) {
      where.module = { contains: module, mode: 'insensitive' };
    }

    if (action) where.action = { contains: action, mode: 'insensitive' };
    if (username) where.username = { contains: username, mode: 'insensitive' };
    if (result) where.result = result;
    if (search) {
      where.OR = [
        { action: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
        { deviceName: { contains: search, mode: 'insensitive' } },
        { siteCode: { contains: search, mode: 'insensitive' } },
        { sourceIp: { contains: search, mode: 'insensitive' } },
      ];
    }

    const total = await prisma.auditLog.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (safePage - 1) * pageSize,
      take: pageSize,
    });

    res.json({
      logs,
      pagination: {
        page: safePage,
        pageSize,
        total,
        totalPages,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Super Admin-only live API traffic log viewer
router.get(
  '/api-requests',
  requireRoles(RoleCode.SUPER_ADMIN),
  (req, res) => {
    const method = typeof req.query.method === 'string' ? req.query.method : undefined;
    const statusGroup =
      typeof req.query.statusGroup === 'string' ? req.query.statusGroup : undefined;
    const username = typeof req.query.username === 'string' ? req.query.username : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const excludePolling = req.query.excludePolling !== 'false';
    const rawPage = parseInt(String(req.query.page || '1'), 10);
    const rawPageSize = parseInt(String(req.query.pageSize || '50'), 10);

    const payload = queryApiRequestLogs({
      method,
      statusGroup,
      username,
      search,
      excludePolling,
      page: Number.isFinite(rawPage) ? rawPage : 1,
      pageSize: Number.isFinite(rawPageSize) ? rawPageSize : 50,
    });

    res.json(payload);
  },
);

router.delete(
  '/api-requests',
  requireRoles(RoleCode.SUPER_ADMIN),
  async (req, res, next) => {
    try {
      const cleared = clearApiRequestLogs();
      await recordAuditLog({
        req,
        userId: req.user!.id,
        username: req.user!.username,
        action: 'CLEAR_API_LOGS',
        module: 'AUDIT',
        details: { clearedEntries: cleared },
      });
      res.json({ cleared });
    } catch (err) {
      next(err);
    }
  },
);

export default router;

import { Router } from 'express';
import { DeviceCategory, DeviceStatus, Prisma, RoleCode } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { getPermittedSiteIds } from '../middleware/rbac';
import { getLiveAgentSiteIds, resolveEffectiveDeviceStatus } from '../lib/agentService';

const router = Router();

router.use(authenticate);

router.get('/summary', async (req, res, next) => {
  try {
    const user = req.user!;
    const requestedSiteId = typeof req.query.siteId === 'string' && req.query.siteId ? req.query.siteId : undefined;

    const permittedSiteIds = getPermittedSiteIds(user, 'canViewInventory');

    let siteFilter: { id?: { in: string[] } } = {};
    let scopedSiteIds: string[] | undefined;

    if (permittedSiteIds !== null) {
      if (requestedSiteId) {
        if (!permittedSiteIds.includes(requestedSiteId)) {
          res.status(403).json({ error: 'Access denied to requested site' });
          return;
        }
        scopedSiteIds = [requestedSiteId];
        siteFilter = { id: { in: scopedSiteIds } };
      } else {
        scopedSiteIds = permittedSiteIds;
        siteFilter = { id: { in: permittedSiteIds } };
      }
    } else if (requestedSiteId) {
      scopedSiteIds = [requestedSiteId];
      siteFilter = { id: { in: scopedSiteIds } };
    }

    const deviceWhere = scopedSiteIds ? { siteId: { in: scopedSiteIds } } : {};
    const docWhere = scopedSiteIds ? { siteId: { in: scopedSiteIds } } : {};
    const diagWhere = scopedSiteIds ? { siteId: { in: scopedSiteIds } } : {};

    const recentActivityWhere: Prisma.AuditLogWhereInput = {};
    if (user.roleCode !== RoleCode.SUPER_ADMIN) {
      recentActivityWhere.userId = user.id;
    }
    if (requestedSiteId) {
      recentActivityWhere.siteId = requestedSiteId;
    }

    const now = new Date();
    const twelveMonthsStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const [
      sites,
      categoryGroups,
      deviceStatusRows,
      liveSiteIds,
      recentCreatedDevices,
      totalDocuments,
      totalDiagrams,
      recentAuditLogs,
    ] = await Promise.all([
      prisma.site.findMany({
        where: siteFilter,
        select: {
          id: true,
          siteCode: true,
          siteName: true,
          _count: { select: { devices: true, documents: true, diagrams: true } },
        },
        orderBy: { siteCode: 'asc' },
      }),
      prisma.device.groupBy({
        by: ['category'],
        where: deviceWhere,
        _count: { _all: true },
      }),
      prisma.device.findMany({
        where: deviceWhere,
        select: {
          siteId: true,
          status: true,
          managementIp: true,
          monitorEnabled: true,
          lastPingAt: true,
        },
      }),
      getLiveAgentSiteIds(scopedSiteIds),
      prisma.device.findMany({
        where: { ...deviceWhere, createdAt: { gte: twelveMonthsStart } },
        select: { createdAt: true },
      }),
      prisma.document.count({ where: docWhere }),
      prisma.diagram.count({ where: diagWhere }),
      prisma.auditLog.findMany({
        where: recentActivityWhere,
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          username: true,
          action: true,
          module: true,
          siteCode: true,
          deviceName: true,
          result: true,
          createdAt: true,
        },
      }),
    ]);

    const byCategory: Record<DeviceCategory, number> = {
      SWITCH: 0,
      ACCESS_POINT: 0,
      AP_CLIENT: 0,
      WLC: 0,
      SERVER: 0,
      PLC: 0,
      ESXI: 0,
      VM: 0,
      NAS: 0,
      UPS: 0,
      IP_CAM: 0,
      PC: 0,
      NVR: 0,
      TV: 0,
      PRINTER: 0,
      BARCODE: 0,
    };

    const byStatus: Record<DeviceStatus, number> = {
      ONLINE: 0,
      OFFLINE: 0,
      MAINTENANCE: 0,
      UNKNOWN: 0,
    };

    let totalNetworkDevices = 0;
    for (const grp of categoryGroups) {
      byCategory[grp.category] = grp._count._all;
      totalNetworkDevices += grp._count._all;
    }
    for (const dev of deviceStatusRows) {
      const effectiveStatus = resolveEffectiveDeviceStatus(dev, liveSiteIds);
      byStatus[effectiveStatus] = (byStatus[effectiveStatus] ?? 0) + 1;
    }

    const monthlyMap = new Map<string, number>();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyMap.set(key, 0);
    }

    for (const dev of recentCreatedDevices) {
      const d = new Date(dev.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyMap.has(key)) {
        monthlyMap.set(key, (monthlyMap.get(key) || 0) + 1);
      }
    }

    res.json({
      kpis: {
        totalSites: sites.length,
        totalSwitches: byCategory.SWITCH,
        totalAccessPoints: byCategory.ACCESS_POINT,
        totalApClients: byCategory.AP_CLIENT,
        totalWlc: byCategory.WLC,
        totalServers: byCategory.SERVER,
        totalPlc: byCategory.PLC,
        totalEsxi: byCategory.ESXI,
        totalVm: byCategory.VM,
        totalNas: byCategory.NAS,
        totalUps: byCategory.UPS,
        totalIpCams: byCategory.IP_CAM,
        totalPc: byCategory.PC,
        totalNvr: byCategory.NVR,
        totalTv: byCategory.TV,
        totalPrinter: byCategory.PRINTER,
        totalBarcode: byCategory.BARCODE,
        totalNetworkDevices,
        totalDocuments,
        totalNetworkDiagrams: totalDiagrams,
      },
      statusSummary: byStatus,
      charts: {
        devicesBySite: sites.map((s) => ({
          siteId: s.id,
          siteCode: s.siteCode,
          siteName: s.siteName,
          count: s._count.devices,
        })),
        devicesByType: [
          { type: 'Switch', category: 'SWITCH', count: byCategory.SWITCH },
          { type: 'Access Point', category: 'ACCESS_POINT', count: byCategory.ACCESS_POINT },
          { type: 'AP Client', category: 'AP_CLIENT', count: byCategory.AP_CLIENT },
          { type: 'WLC', category: 'WLC', count: byCategory.WLC },
          { type: 'Server', category: 'SERVER', count: byCategory.SERVER },
          { type: 'PLC', category: 'PLC', count: byCategory.PLC },
          { type: 'ESXi', category: 'ESXI', count: byCategory.ESXI },
          { type: 'VM', category: 'VM', count: byCategory.VM },
          { type: 'NAS', category: 'NAS', count: byCategory.NAS },
          { type: 'UPS', category: 'UPS', count: byCategory.UPS },
          { type: 'IP Camera', category: 'IP_CAM', count: byCategory.IP_CAM },
          { type: 'PC', category: 'PC', count: byCategory.PC },
          { type: 'NVR', category: 'NVR', count: byCategory.NVR },
          { type: 'TV', category: 'TV', count: byCategory.TV },
          { type: 'Printer', category: 'PRINTER', count: byCategory.PRINTER },
          { type: 'Barcode', category: 'BARCODE', count: byCategory.BARCODE },
        ],
        devicesByStatus: [
          { status: 'ONLINE', label: 'Online', count: byStatus.ONLINE },
          { status: 'OFFLINE', label: 'Offline', count: byStatus.OFFLINE },
          { status: 'MAINTENANCE', label: 'Maintenance', count: byStatus.MAINTENANCE },
          { status: 'UNKNOWN', label: 'Unknown', count: byStatus.UNKNOWN },
        ],
        monthlyAdded: Array.from(monthlyMap.entries()).map(([month, count]) => ({
          month,
          count,
        })),
      },
      recentActivity: recentAuditLogs,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

import { Router } from 'express';
import { DeviceStatus, Prisma, RoleCode } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { getPermittedSiteIds } from '../middleware/rbac';
import { getLiveAgentSiteIds, resolveEffectiveDeviceStatus } from '../lib/agentService';
import { BUILT_IN_DEVICE_CATEGORY_CODES } from '../lib/deviceCategories';

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
      registeredDeviceTypes,
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
      prisma.deviceType.findMany({
        select: { code: true, name: true, iconKey: true, isSystem: true },
        orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
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

    const byCategory: Record<string, number> = {};
    for (const code of BUILT_IN_DEVICE_CATEGORY_CODES) {
      byCategory[code] = 0;
    }
    for (const dt of registeredDeviceTypes) {
      if (!(dt.code in byCategory)) {
        byCategory[dt.code] = 0;
      }
    }

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

    const CHART_LABEL_OVERRIDES: Record<string, string> = {
      SWITCH: 'Switch',
      ACCESS_POINT: 'Access Point',
      AP_CLIENT: 'AP Client',
      WLC: 'WLC',
      SERVER: 'Server',
      PLC: 'PLC',
      ESXI: 'ESXi',
      VM: 'VM',
      NAS: 'NAS',
      UPS: 'UPS',
      IP_CAM: 'IP Camera',
      PC: 'PC',
      NVR: 'NVR',
      TV: 'TV',
      PRINTER: 'Printer',
      BARCODE: 'Barcode',
      HANDHELD: 'Handheld',
    };

    const seenChartCategories = new Set<string>();
    const devicesByType: Array<{
      type: string;
      category: string;
      iconKey?: string | null;
      isSystem?: boolean;
      count: number;
    }> = [];

    for (const dt of registeredDeviceTypes) {
      seenChartCategories.add(dt.code);
      devicesByType.push({
        type: CHART_LABEL_OVERRIDES[dt.code] || dt.name,
        category: dt.code,
        iconKey: dt.iconKey || dt.code,
        isSystem: Boolean(dt.isSystem),
        count: byCategory[dt.code] ?? 0,
      });
    }
    for (const [category, count] of Object.entries(byCategory)) {
      if (!seenChartCategories.has(category) && count > 0) {
        devicesByType.push({
          type: CHART_LABEL_OVERRIDES[category] || category,
          category,
          iconKey: category,
          isSystem: false,
          count,
        });
      }
    }

    res.json({
      kpis: {
        totalSites: sites.length,
        totalSwitches: byCategory.SWITCH ?? 0,
        totalAccessPoints: byCategory.ACCESS_POINT ?? 0,
        totalApClients: byCategory.AP_CLIENT ?? 0,
        totalWlc: byCategory.WLC ?? 0,
        totalServers: byCategory.SERVER ?? 0,
        totalPlc: byCategory.PLC ?? 0,
        totalEsxi: byCategory.ESXI ?? 0,
        totalVm: byCategory.VM ?? 0,
        totalNas: byCategory.NAS ?? 0,
        totalUps: byCategory.UPS ?? 0,
        totalIpCams: byCategory.IP_CAM ?? 0,
        totalPc: byCategory.PC ?? 0,
        totalNvr: byCategory.NVR ?? 0,
        totalTv: byCategory.TV ?? 0,
        totalPrinter: byCategory.PRINTER ?? 0,
        totalBarcode: byCategory.BARCODE ?? 0,
        totalHandheld: byCategory.HANDHELD ?? 0,
        byCategory,
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
        devicesByType,
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

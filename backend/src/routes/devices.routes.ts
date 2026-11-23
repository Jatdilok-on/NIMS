import { Router } from 'express';
import { z } from 'zod';
import { DeviceCategory, DeviceStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { getPermittedSiteIds, hasSitePermission, requireSitePermission } from '../middleware/rbac';
import {
  createDeviceWithDetails,
  releaseDeviceIpamAllocations,
  updateDeviceWithDetails,
} from '../lib/deviceService';
import { recordAuditLog } from '../lib/audit';
import {
  getLiveAgentSiteIds,
  withAgentTelemetry,
} from '../lib/agentService';

const router = Router();
router.use(authenticate);

const deviceInputSchema = z.object({
  siteId: z.string().min(1),
  category: z.nativeEnum(DeviceCategory),
  itemNo: z.number().int().positive().optional().nullable(),
  name: z.string().min(1).max(200),
  model: z.string().max(150).optional().nullable(),
  vendor: z.string().max(120).optional().nullable(),
  macAddress: z.string().max(50).optional().nullable(),
  serialNumber: z.string().max(120).optional().nullable(),
  managementIp: z.string().max(50).optional().nullable(),
  vlan: z.string().max(40).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  status: z.nativeEnum(DeviceStatus).optional(),
  monitorEnabled: z.boolean().optional(),
  responsiblePerson: z.string().max(160).optional().nullable(),
  remark: z.string().max(1000).optional().nullable(),
  switchDetail: z
    .object({
      managementVlan: z.string().max(60).optional().nullable(),
      rack: z.string().max(80).optional().nullable(),
      floor: z.string().max(80).optional().nullable(),
      portCount: z.number().int().min(0).max(2048).optional().nullable(),
      firmwareVersion: z.string().max(120).optional().nullable(),
      maintainer: z.string().max(160).optional().nullable(),
      installationDate: z.string().max(60).optional().nullable(),
      warrantyExpiration: z.string().max(60).optional().nullable(),
    })
    .optional(),
  accessPointDetail: z
    .object({
      ssid: z.string().max(120).optional().nullable(),
      channel: z.string().max(40).optional().nullable(),
      frequency: z.string().max(40).optional().nullable(),
      floor: z.string().max(80).optional().nullable(),
      installationPosition: z.string().max(160).optional().nullable(),
      controller: z.string().max(120).optional().nullable(),
    })
    .optional(),
  apClientDetail: z
    .object({
      connectedAp: z.string().max(160).optional().nullable(),
      wirelessMode: z.string().max(80).optional().nullable(),
      ssid: z.string().max(120).optional().nullable(),
      frequency: z.string().max(40).optional().nullable(),
      connectedDevice: z.string().max(160).optional().nullable(),
    })
    .optional(),
  controllerDetail: z
    .object({
      controllerVersion: z.string().max(120).optional().nullable(),
      managedApCount: z.number().int().min(0).max(100000).optional().nullable(),
    })
    .optional(),
  serverDetail: z
    .object({
      hostname: z.string().max(160).optional().nullable(),
      manufacturer: z.string().max(120).optional().nullable(),
      productionIp: z.string().max(60).optional().nullable(),
      operatingSystem: z.string().max(160).optional().nullable(),
      cpu: z.string().max(160).optional().nullable(),
      ram: z.string().max(120).optional().nullable(),
      storage: z.string().max(160).optional().nullable(),
      hypervisor: z.string().max(120).optional().nullable(),
      serviceApplication: z.string().max(240).optional().nullable(),
      rack: z.string().max(80).optional().nullable(),
      maintenanceDate: z.string().max(60).optional().nullable(),
    })
    .optional(),
});

router.get('/global-search', async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q || q.length < 2) {
      res.json({ devices: [], subnets: [], documents: [], diagrams: [] });
      return;
    }

    const permittedInventorySiteIds = getPermittedSiteIds(req.user!, 'canViewInventory');
    const permittedIpamSiteIds = getPermittedSiteIds(req.user!, 'canViewIpam');
    const permittedDocSiteIds = getPermittedSiteIds(req.user!, 'canViewDocuments');
    const permittedDiagramSiteIds = getPermittedSiteIds(req.user!, 'canViewDiagram');

    const canQueryDevices = permittedInventorySiteIds === null || permittedInventorySiteIds.length > 0;
    const canQuerySubnets = permittedIpamSiteIds === null || permittedIpamSiteIds.length > 0;
    const canQueryDocs = permittedDocSiteIds === null || permittedDocSiteIds.length > 0;
    const canQueryDiagrams = permittedDiagramSiteIds === null || permittedDiagramSiteIds.length > 0;

    const deviceSiteScope =
      permittedInventorySiteIds !== null ? { siteId: { in: permittedInventorySiteIds } } : {};
    const subnetSiteScope =
      permittedIpamSiteIds !== null ? { siteId: { in: permittedIpamSiteIds } } : {};
    const docSiteScope =
      permittedDocSiteIds !== null ? { siteId: { in: permittedDocSiteIds } } : {};
    const diagramSiteScope =
      permittedDiagramSiteIds !== null ? { siteId: { in: permittedDiagramSiteIds } } : {};

    const [devices, subnets, documents, diagrams] = await Promise.all([
      canQueryDevices
        ? prisma.device.findMany({
            where: {
              ...deviceSiteScope,
              OR: [
                { managementIp: { contains: q, mode: 'insensitive' } },
                { macAddress: { contains: q, mode: 'insensitive' } },
                { serialNumber: { contains: q, mode: 'insensitive' } },
                { name: { contains: q, mode: 'insensitive' } },
                { model: { contains: q, mode: 'insensitive' } },
                { location: { contains: q, mode: 'insensitive' } },
              ],
            },
            include: {
              site: { select: { id: true, siteCode: true, siteName: true } },
            },
            take: 30,
            orderBy: { name: 'asc' },
          })
        : Promise.resolve([]),
      canQuerySubnets
        ? prisma.subnet.findMany({
            where: {
              ...subnetSiteScope,
              OR: [
                { cidr: { contains: q, mode: 'insensitive' } },
                { gateway: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
              ],
            },
            include: {
              site: { select: { id: true, siteCode: true, siteName: true } },
            },
            take: 15,
          })
        : Promise.resolve([]),
      canQueryDocs
        ? prisma.document.findMany({
            where: {
              ...docSiteScope,
              OR: [
                { documentName: { contains: q, mode: 'insensitive' } },
                { originalFileName: { contains: q, mode: 'insensitive' } },
                { projectName: { contains: q, mode: 'insensitive' } },
              ],
            },
            select: {
              id: true,
              siteId: true,
              documentName: true,
              originalFileName: true,
              documentType: true,
              site: { select: { id: true, siteCode: true } },
            },
            take: 10,
            orderBy: { updatedAt: 'desc' },
          })
        : Promise.resolve([]),
      canQueryDiagrams
        ? prisma.diagram.findMany({
            where: {
              ...diagramSiteScope,
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
              ],
            },
            select: {
              id: true,
              siteId: true,
              title: true,
              kind: true,
              site: { select: { id: true, siteCode: true } },
            },
            take: 10,
            orderBy: { updatedAt: 'desc' },
          })
        : Promise.resolve([]),
    ]);

    const uniqueSiteIds = Array.from(new Set(devices.map((d) => d.siteId)));
    const liveSiteIds =
      uniqueSiteIds.length > 0 ? await getLiveAgentSiteIds(uniqueSiteIds) : new Set<string>();

    res.json({
      devices: devices.map((d) => withAgentTelemetry(d, liveSiteIds)),
      subnets,
      documents,
      diagrams,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const user = req.user!;
    const permittedSiteIds = getPermittedSiteIds(user, 'canViewInventory');

    const siteId = typeof req.query.siteId === 'string' ? req.query.siteId : undefined;
    if (siteId && permittedSiteIds !== null && !permittedSiteIds.includes(siteId)) {
      res.status(403).json({ error: 'Access denied to requested site' });
      return;
    }

    const category =
      typeof req.query.category === 'string' && req.query.category in DeviceCategory
        ? (req.query.category as DeviceCategory)
        : undefined;
    const status =
      typeof req.query.status === 'string' && req.query.status in DeviceStatus
        ? (req.query.status as DeviceStatus)
        : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const model = typeof req.query.model === 'string' ? req.query.model.trim() : '';
    const location = typeof req.query.location === 'string' ? req.query.location.trim() : '';
    const vlan = typeof req.query.vlan === 'string' ? req.query.vlan.trim() : '';
    const ip = typeof req.query.ip === 'string' ? req.query.ip.trim() : '';

    const rawPage = parseInt(String(req.query.page || '1'), 10);
    const page = Math.max(1, Number.isFinite(rawPage) ? rawPage : 1);
    const rawPageSize = String(req.query.pageSize || '25').toLowerCase();
    const isAllPageSize = rawPageSize === 'all';
    const pageSize = isAllPageSize
      ? 10000
      : Math.min(10000, Math.max(1, parseInt(rawPageSize, 10) || 25));
    const sortByRaw = typeof req.query.sortBy === 'string' ? req.query.sortBy : 'itemNo';
    const sortOrder = req.query.sortOrder === 'desc' ? 'desc' : 'asc';

    const allowedSortFields = new Set([
      'itemNo',
      'name',
      'model',
      'vendor',
      'managementIp',
      'vlan',
      'location',
      'status',
      'category',
      'createdAt',
      'updatedAt',
    ]);
    const sortBy = allowedSortFields.has(sortByRaw) ? sortByRaw : 'createdAt';

    const where: Prisma.DeviceWhereInput = {};
    if (siteId) {
      where.siteId = siteId;
    } else if (permittedSiteIds !== null) {
      where.siteId = { in: permittedSiteIds };
    }
    if (category) where.category = category;
    if (model) where.model = { contains: model, mode: 'insensitive' };
    if (location) where.location = { contains: location, mode: 'insensitive' };
    if (vlan) where.vlan = { contains: vlan, mode: 'insensitive' };
    if (ip) where.managementIp = { contains: ip, mode: 'insensitive' };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { model: { contains: search, mode: 'insensitive' } },
        { vendor: { contains: search, mode: 'insensitive' } },
        { macAddress: { contains: search, mode: 'insensitive' } },
        { serialNumber: { contains: search, mode: 'insensitive' } },
        { managementIp: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } },
        { vlan: { contains: search, mode: 'insensitive' } },
      ];
    }

    const deviceInclude = {
      site: { select: { id: true, siteCode: true, siteName: true } },
      switchDetail: true,
      accessPointDetail: true,
      apClientDetail: true,
      controllerDetail: true,
      serverDetail: true,
    } as const;

    const orderBySpec: Prisma.DeviceOrderByWithRelationInput[] =
      sortBy === 'itemNo'
        ? [{ itemNo: sortOrder }, { createdAt: 'asc' }]
        : [{ [sortBy]: sortOrder }, { itemNo: 'asc' }];

    let devices;
    let total = 0;

    if (status) {
      // Status filter must reflect effective runtime status (non-agent -> UNKNOWN)
      const allMatching = await prisma.device.findMany({
        where,
        include: deviceInclude,
        orderBy: orderBySpec,
      });
      if (sortBy === 'itemNo') {
        allMatching.sort((a, b) => {
          const av = a.itemNo ?? Number.MAX_SAFE_INTEGER;
          const bv = b.itemNo ?? Number.MAX_SAFE_INTEGER;
          return sortOrder === 'asc' ? av - bv : bv - av;
        });
      }
      const uniqueSiteIds = Array.from(new Set(allMatching.map((d) => d.siteId)));
      const liveSiteIds =
        uniqueSiteIds.length > 0 ? await getLiveAgentSiteIds(uniqueSiteIds) : new Set<string>();
      const filtered = allMatching
        .map((d) => withAgentTelemetry(d, liveSiteIds))
        .filter((d) => d.status === status);
      total = filtered.length;
      const start = isAllPageSize ? 0 : (page - 1) * pageSize;
      devices = isAllPageSize ? filtered : filtered.slice(start, start + pageSize);

      res.json({
        devices,
        pagination: {
          page: isAllPageSize ? 1 : page,
          pageSize,
          total,
          totalPages: isAllPageSize ? 1 : Math.ceil(total / pageSize) || 1,
        },
      });
      return;
    }

    total = await prisma.device.count({ where });

    if (sortBy === 'itemNo' && !isAllPageSize) {
      const skip = (page - 1) * pageSize;
      const nonNullWhere: Prisma.DeviceWhereInput = { ...where, itemNo: { not: null } };
      const nullWhere: Prisma.DeviceWhereInput = { ...where, itemNo: null };

      if (sortOrder === 'asc') {
        const nonNullCount = await prisma.device.count({ where: nonNullWhere });
        const nonNullRows =
          skip < nonNullCount
            ? await prisma.device.findMany({
                where: nonNullWhere,
                include: deviceInclude,
                orderBy: [{ itemNo: 'asc' }, { createdAt: 'asc' }],
                skip,
                take: pageSize,
              })
            : [];
        const remaining = pageSize - nonNullRows.length;
        const nullSkip = Math.max(0, skip - nonNullCount);
        const nullRows =
          remaining > 0
            ? await prisma.device.findMany({
                where: nullWhere,
                include: deviceInclude,
                orderBy: [{ createdAt: 'asc' }],
                skip: nullSkip,
                take: remaining,
              })
            : [];
        devices = [...nonNullRows, ...nullRows];
      } else {
        const nullCount = await prisma.device.count({ where: nullWhere });
        const nullRows =
          skip < nullCount
            ? await prisma.device.findMany({
                where: nullWhere,
                include: deviceInclude,
                orderBy: [{ createdAt: 'asc' }],
                skip,
                take: pageSize,
              })
            : [];
        const remaining = pageSize - nullRows.length;
        const nonNullSkip = Math.max(0, skip - nullCount);
        const nonNullRows =
          remaining > 0
            ? await prisma.device.findMany({
                where: nonNullWhere,
                include: deviceInclude,
                orderBy: [{ itemNo: 'desc' }, { createdAt: 'asc' }],
                skip: nonNullSkip,
                take: remaining,
              })
            : [];
        devices = [...nullRows, ...nonNullRows];
      }
    } else {
      devices = await prisma.device.findMany({
        where,
        include: deviceInclude,
        orderBy: orderBySpec,
        skip: isAllPageSize ? 0 : (page - 1) * pageSize,
        take: pageSize,
      });

      if (sortBy === 'itemNo') {
        devices.sort((a, b) => {
          const av = a.itemNo ?? Number.MAX_SAFE_INTEGER;
          const bv = b.itemNo ?? Number.MAX_SAFE_INTEGER;
          return sortOrder === 'asc' ? av - bv : bv - av;
        });
      }
    }

    const uniqueSiteIds = Array.from(new Set(devices.map((d) => d.siteId)));
    const liveSiteIds =
      uniqueSiteIds.length > 0 ? await getLiveAgentSiteIds(uniqueSiteIds) : new Set<string>();

    res.json({
      devices: devices.map((d) => withAgentTelemetry(d, liveSiteIds)),
      pagination: {
        page: isAllPageSize ? 1 : page,
        pageSize,
        total,
        totalPages: isAllPageSize ? 1 : Math.ceil(total / pageSize) || 1,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const device = await prisma.device.findUnique({
      where: { id: req.params.id },
      include: {
        site: true,
        switchDetail: true,
        accessPointDetail: true,
        apClientDetail: true,
        controllerDetail: true,
        serverDetail: true,
        ipAddresses: {
          include: { subnet: { select: { id: true, cidr: true, vlanNumber: true } } },
        },
        maintenanceRecords: {
          orderBy: { performedAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    if (!hasSitePermission(req.user!, device.siteId, 'canViewInventory')) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const liveSiteIds = await getLiveAgentSiteIds([device.siteId]);
    res.json({
      device: withAgentTelemetry(device, liveSiteIds),
    });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  requireSitePermission('canEditInventory', (req) => req.body?.siteId),
  async (req, res, next) => {
    try {
      const body = deviceInputSchema.parse(req.body);
      const device = await createDeviceWithDetails(body);

      await recordAuditLog({
        req,
        userId: req.user!.id,
        username: req.user!.username,
        action: 'ADD_DEVICE',
        module: 'INVENTORY',
        siteId: device.siteId,
        siteCode: device.site.siteCode,
        deviceId: device.id,
        deviceName: device.name,
        details: { category: device.category, managementIp: device.managementIp },
      });

      const liveSiteIds = await getLiveAgentSiteIds([device.siteId]);
      res.status(201).json({ device: withAgentTelemetry(device, liveSiteIds) });
    } catch (err) {
      next(err);
    }
  },
);

router.put('/bulk', async (req, res, next) => {
  try {
    const bulkSchema = z.object({
      deviceIds: z.array(z.string().min(1)).min(1),
      category: z.nativeEnum(DeviceCategory).optional(),
      status: z.nativeEnum(DeviceStatus).optional(),
    });
    const body = bulkSchema.parse(req.body);

    const targets = await prisma.device.findMany({
      where: { id: { in: body.deviceIds } },
      select: { id: true, siteId: true },
    });

    const authorizedIds = targets
      .filter((d) => hasSitePermission(req.user!, d.siteId, 'canEditInventory'))
      .map((d) => d.id);

    if (authorizedIds.length === 0) {
      res.status(403).json({ error: 'Permission denied to edit selected devices' });
      return;
    }

    let nextDeviceTypeId: string | undefined = undefined;
    if (body.category) {
      const dt = await prisma.deviceType.findUniqueOrThrow({ where: { code: body.category } });
      nextDeviceTypeId = dt.id;
    }

    const result = await prisma.device.updateMany({
      where: { id: { in: authorizedIds } },
      data: {
        ...(body.category ? { category: body.category, deviceTypeId: nextDeviceTypeId } : {}),
        ...(body.status ? { status: body.status } : {}),
      },
    });

    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'BULK_EDIT_DEVICES',
      module: 'INVENTORY',
      details: { count: result.count, category: body.category, status: body.status },
    });

    res.json({ updatedCount: result.count });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.device.findUnique({
      where: { id: req.params.id },
      include: { site: { select: { siteCode: true } } },
    });
    if (!existing) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }
    if (!hasSitePermission(req.user!, existing.siteId, 'canEditInventory')) {
      res.status(403).json({ error: 'Permission denied to edit devices in this site' });
      return;
    }

    const body = deviceInputSchema.partial().parse(req.body);
    if (body.siteId && body.siteId !== existing.siteId) {
      if (!hasSitePermission(req.user!, body.siteId, 'canEditInventory')) {
        res.status(403).json({ error: 'Permission denied for target site' });
        return;
      }
    }
    const device = await updateDeviceWithDetails(req.params.id, body);

    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'EDIT_DEVICE',
      module: 'INVENTORY',
      siteId: device.siteId,
      siteCode: device.site.siteCode,
      deviceId: device.id,
      deviceName: device.name,
      details: { category: device.category, managementIp: device.managementIp },
    });

    const liveSiteIds = await getLiveAgentSiteIds([device.siteId]);
    res.json({
      device: withAgentTelemetry(device, liveSiteIds),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/bulk-delete', async (req, res, next) => {
  try {
    const bulkDeleteSchema = z.object({
      deviceIds: z.array(z.string().min(1)).min(1),
    });
    const body = bulkDeleteSchema.parse(req.body);

    const targets = await prisma.device.findMany({
      where: { id: { in: body.deviceIds } },
      select: { id: true, siteId: true, name: true },
    });

    const authorized = targets.filter((d) =>
      hasSitePermission(req.user!, d.siteId, 'canEditInventory'),
    );
    if (authorized.length === 0) {
      res.status(403).json({ error: 'Permission denied to delete selected devices' });
      return;
    }

    for (const dev of authorized) {
      await releaseDeviceIpamAllocations(prisma, dev.id);
    }

    const delRes = await prisma.device.deleteMany({
      where: { id: { in: authorized.map((d) => d.id) } },
    });

    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'BULK_DELETE_DEVICES',
      module: 'INVENTORY',
      details: {
        deletedCount: delRes.count,
        deviceNames: authorized.map((d) => d.name).slice(0, 50),
      },
    });

    res.json({ deletedCount: delRes.count });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.device.findUnique({
      where: { id: req.params.id },
      include: { site: { select: { siteCode: true } } },
    });
    if (!existing) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }
    if (!hasSitePermission(req.user!, existing.siteId, 'canEditInventory')) {
      res.status(403).json({ error: 'Permission denied to delete devices in this site' });
      return;
    }

    await releaseDeviceIpamAllocations(prisma, existing.id);
    await prisma.device.delete({ where: { id: req.params.id } });

    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'DELETE_DEVICE',
      module: 'INVENTORY',
      siteId: existing.siteId,
      siteCode: existing.site.siteCode,
      deviceId: existing.id,
      deviceName: existing.name,
    });

    res.json({ message: 'Device deleted' });
  } catch (err) {
    next(err);
  }
});

export default router;

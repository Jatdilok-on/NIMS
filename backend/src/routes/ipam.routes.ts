import { Router } from 'express';
import { z } from 'zod';
import { IpAllocationStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { getPermittedSiteIds, hasSitePermission, requireSitePermission } from '../middleware/rbac';
import {
  enumerateBlock24Hosts,
  getIpv4Block24Prefix,
  ipv4ToInt,
  isHostIpInCidr,
  isIpInCidr,
  isValidIpv4,
  parseCidr,
  parseVlanNumber,
} from '../lib/ipam';
import {
  pickBestSubnetForDevice,
  releaseDeviceIpamAllocations,
  syncDeviceIpamAllocation,
} from '../lib/deviceService';
import { getLiveAgentSiteIds, isDeviceMonitoredByLiveAgent } from '../lib/agentService';
import { recordAuditLog } from '../lib/audit';

const router = Router();
router.use(authenticate);

const vlanSchema = z.object({
  siteId: z.string().min(1),
  vlanId: z.number().int().min(1).max(4094),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
});

const subnetSchema = z.object({
  siteId: z.string().min(1),
  vlanDbId: z.string().optional().nullable(),
  vlanNumber: z.number().int().min(1).max(4094).optional().nullable(),
  cidr: z.string().min(7).max(32),
  gateway: z.string().optional().nullable(),
  dns1: z.string().optional().nullable(),
  dns2: z.string().optional().nullable(),
  dhcpServer: z.string().optional().nullable(),
  description: z.string().max(500).optional().nullable(),
});

const allocateIpSchema = z.object({
  subnetId: z.string().min(1),
  ipAddress: z.string().min(7).max(40),
  status: z.nativeEnum(IpAllocationStatus),
  hostname: z.string().max(160).optional().nullable(),
  macAddress: z.string().max(50).optional().nullable(),
  deviceId: z.string().optional().nullable(),
  description: z.string().max(500).optional().nullable(),
});

router.get('/vlans', async (req, res, next) => {
  try {
    const siteId = typeof req.query.siteId === 'string' ? req.query.siteId : undefined;
    const permitted = getPermittedSiteIds(req.user!, 'canViewIpam');
    if (siteId && permitted !== null && !permitted.includes(siteId)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const vlans = await prisma.vlan.findMany({
      where: siteId ? { siteId } : permitted !== null ? { siteId: { in: permitted } } : {},
      include: {
        site: { select: { id: true, siteCode: true, siteName: true } },
        _count: { select: { subnets: true } },
      },
      orderBy: [{ siteId: 'asc' }, { vlanId: 'asc' }],
    });

    res.json({ vlans });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/vlans',
  requireSitePermission('canEditIpam', (req) => req.body?.siteId),
  async (req, res, next) => {
    try {
      const body = vlanSchema.parse(req.body);
      const vlan = await prisma.vlan.create({
        data: {
          siteId: body.siteId,
          vlanId: body.vlanId,
          name: body.name.trim(),
          description: body.description ?? null,
        },
      });
      await recordAuditLog({
        req,
        userId: req.user!.id,
        username: req.user!.username,
        action: 'CREATE_VLAN',
        module: 'IPAM',
        siteId: vlan.siteId,
        details: { vlanId: vlan.vlanId, name: vlan.name },
      });
      res.status(201).json({ vlan });
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/vlans/:id', async (req, res, next) => {
  try {
    const vlan = await prisma.vlan.findUnique({ where: { id: req.params.id } });
    if (!vlan) {
      res.status(404).json({ error: 'VLAN not found' });
      return;
    }
    if (!hasSitePermission(req.user!, vlan.siteId, 'canEditIpam')) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }
    await prisma.vlan.delete({ where: { id: vlan.id } });
    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'DELETE_VLAN',
      module: 'IPAM',
      siteId: vlan.siteId,
      details: { vlanId: vlan.vlanId, name: vlan.name },
    });
    res.json({ message: 'VLAN deleted' });
  } catch (err) {
    next(err);
  }
});

router.get('/subnets', async (req, res, next) => {
  try {
    const siteId = typeof req.query.siteId === 'string' ? req.query.siteId : undefined;
    const permitted = getPermittedSiteIds(req.user!, 'canViewIpam');
    if (siteId && permitted !== null && !permitted.includes(siteId)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const subnets = await prisma.subnet.findMany({
      where: siteId ? { siteId } : permitted !== null ? { siteId: { in: permitted } } : {},
      include: {
        site: { select: { id: true, siteCode: true, siteName: true } },
        vlan: { select: { id: true, vlanId: true, name: true } },
        ipAddresses: {
          select: { status: true },
        },
      },
      orderBy: [{ siteId: 'asc' }, { vlanNumber: 'asc' }, { cidr: 'asc' }],
    });

    const liveSiteIds = await getLiveAgentSiteIds(
      Array.from(new Set(subnets.map((s) => s.siteId))),
    );

    const formatted = subnets.map((s) => {
      const allocatedCount = s.ipAddresses.filter(
        (ip) => ip.status !== IpAllocationStatus.AVAILABLE,
      ).length;
      const reservedCount = s.ipAddresses.filter(
        (ip) => ip.status === IpAllocationStatus.RESERVED,
      ).length;
      return {
        ...s,
        ipAddresses: undefined,
        hasLiveAgent: liveSiteIds.has(s.siteId),
        allocatedCount,
        reservedCount,
        availableCount: Math.max(0, s.totalHosts - allocatedCount),
        utilizationPct: s.totalHosts > 0 ? Math.round((allocatedCount / s.totalHosts) * 100) : 0,
      };
    });

    res.json({ subnets: formatted });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/subnets',
  requireSitePermission('canEditIpam', (req) => req.body?.siteId),
  async (req, res, next) => {
    try {
      const body = subnetSchema.parse(req.body);
      let cidrInfo;
      try {
        cidrInfo = parseCidr(body.cidr);
      } catch (e) {
        res.status(400).json({ error: e instanceof Error ? e.message : 'Invalid CIDR notation' });
        return;
      }

      for (const ipField of [body.gateway, body.dns1, body.dns2, body.dhcpServer]) {
        if (ipField && ipField.trim() && !isValidIpv4(ipField.trim())) {
          res.status(400).json({ error: `Invalid IPv4 address: ${ipField}` });
          return;
        }
      }
      if (body.gateway && body.gateway.trim() && !isHostIpInCidr(body.gateway.trim(), cidrInfo.cidr)) {
        res.status(400).json({
          error: `Gateway ${body.gateway.trim()} must be a valid host address inside ${cidrInfo.cidr}`,
        });
        return;
      }

      const siteExists = await prisma.site.findUnique({ where: { id: body.siteId }, select: { id: true } });
      if (!siteExists) {
        res.status(404).json({ error: 'Site not found' });
        return;
      }

      const tx = prisma;
      // Ensure VLAN exists & belongs to this site
      let vlanDbId = body.vlanDbId ?? null;
      if (vlanDbId) {
        const refVlan = await tx.vlan.findFirst({ where: { id: vlanDbId, siteId: body.siteId } });
        if (!refVlan) {
          res.status(400).json({ error: 'Referenced vlanDbId does not belong to this site' });
          return;
        }
      } else if (body.vlanNumber) {
        let existingVlan = await tx.vlan.findUnique({
          where: { siteId_vlanId: { siteId: body.siteId, vlanId: body.vlanNumber } },
        });
        if (!existingVlan) {
          existingVlan = await tx.vlan.create({
            data: {
              siteId: body.siteId,
              vlanId: body.vlanNumber,
              name: `VLAN ${body.vlanNumber}`,
            },
          });
        }
        vlanDbId = existingVlan.id;
      }

      const subnet = await tx.subnet.create({
        data: {
          siteId: body.siteId,
          vlanDbId,
          vlanNumber: body.vlanNumber ?? null,
          cidr: cidrInfo.cidr,
          networkAddress: cidrInfo.networkAddress,
          subnetMask: cidrInfo.subnetMask,
          broadcastAddress: cidrInfo.broadcastAddress,
          gateway: body.gateway?.trim() || null,
          dns1: body.dns1?.trim() || null,
          dns2: body.dns2?.trim() || null,
          dhcpServer: body.dhcpServer?.trim() || null,
          ipRangeStart: cidrInfo.ipRangeStart,
          ipRangeEnd: cidrInfo.ipRangeEnd,
          totalHosts: cidrInfo.totalHosts,
          description: body.description?.trim() || null,
        },
      });

      // Mark Gateway if inside subnet
      if (subnet.gateway && isIpInCidr(subnet.gateway, subnet.cidr)) {
        const existingGwIp = await tx.ipAddress.findUnique({
          where: { subnetId_ipAddress: { subnetId: subnet.id, ipAddress: subnet.gateway } },
        });
        if (existingGwIp) {
          await tx.ipAddress.update({
            where: { id: existingGwIp.id },
            data: { status: IpAllocationStatus.GATEWAY, description: 'Default Gateway' },
          });
        } else {
          await tx.ipAddress.create({
            data: {
              siteId: subnet.siteId,
              subnetId: subnet.id,
              ipAddress: subnet.gateway,
              status: IpAllocationStatus.GATEWAY,
              description: 'Default Gateway',
            },
          });
        }
      }

      // Auto-link any existing site devices whose IP + VLAN match this subnet
      const siteDevices = await tx.device.findMany({
        where: { siteId: subnet.siteId, managementIp: { not: null } },
      });
      for (const dev of siteDevices) {
        if (dev.managementIp && isIpInCidr(dev.managementIp, subnet.cidr)) {
          await syncDeviceIpamAllocation(tx, {
            id: dev.id,
            siteId: dev.siteId,
            name: dev.name,
            managementIp: dev.managementIp,
            macAddress: dev.macAddress,
            vlan: dev.vlan,
          });
        }
      }

      await recordAuditLog({
        req,
        userId: req.user!.id,
        username: req.user!.username,
        action: 'CREATE_SUBNET',
        module: 'IPAM',
        siteId: subnet.siteId,
        details: { cidr: subnet.cidr, vlanNumber: subnet.vlanNumber },
      });

      res.status(201).json({ subnet });
    } catch (err) {
      next(err);
    }
  },
);

const updateSubnetSchema = subnetSchema.omit({ siteId: true }).partial();

router.put('/subnets/:id', async (req, res, next) => {
  try {
    const existing = await prisma.subnet.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: 'Subnet not found' });
      return;
    }
    if (!hasSitePermission(req.user!, existing.siteId, 'canEditIpam')) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }

    const body = updateSubnetSchema.parse(req.body ?? {});
    const nextCidrInput = body.cidr !== undefined ? body.cidr : existing.cidr;
    let cidrInfo;
    try {
      cidrInfo = parseCidr(nextCidrInput);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'Invalid CIDR notation' });
      return;
    }

    const nextGateway =
      body.gateway !== undefined ? body.gateway?.trim() || null : existing.gateway;
    const nextDns1 = body.dns1 !== undefined ? body.dns1?.trim() || null : existing.dns1;
    const nextDns2 = body.dns2 !== undefined ? body.dns2?.trim() || null : existing.dns2;
    const nextDhcp =
      body.dhcpServer !== undefined ? body.dhcpServer?.trim() || null : existing.dhcpServer;
    const nextDescription =
      body.description !== undefined ? body.description?.trim() || null : existing.description;
    const nextVlanNumber =
      body.vlanNumber !== undefined ? body.vlanNumber ?? null : existing.vlanNumber;

    for (const ipField of [nextGateway, nextDns1, nextDns2, nextDhcp]) {
      if (ipField && !isValidIpv4(ipField)) {
        res.status(400).json({ error: `Invalid IPv4 address: ${ipField}` });
        return;
      }
    }
    if (nextGateway && !isHostIpInCidr(nextGateway, cidrInfo.cidr)) {
      res.status(400).json({
        error: `Gateway ${nextGateway} must be a valid host address inside ${cidrInfo.cidr}`,
      });
      return;
    }

    let vlanDbId = existing.vlanDbId;
    if (body.vlanNumber !== undefined) {
      if (nextVlanNumber) {
        let existingVlan = await prisma.vlan.findUnique({
          where: { siteId_vlanId: { siteId: existing.siteId, vlanId: nextVlanNumber } },
        });
        if (!existingVlan) {
          existingVlan = await prisma.vlan.create({
            data: {
              siteId: existing.siteId,
              vlanId: nextVlanNumber,
              name: `VLAN ${nextVlanNumber}`,
            },
          });
        }
        vlanDbId = existingVlan.id;
      } else {
        vlanDbId = null;
      }
    }

    const updated = await prisma.subnet.update({
      where: { id: existing.id },
      data: {
        vlanDbId,
        vlanNumber: nextVlanNumber,
        cidr: cidrInfo.cidr,
        networkAddress: cidrInfo.networkAddress,
        subnetMask: cidrInfo.subnetMask,
        broadcastAddress: cidrInfo.broadcastAddress,
        gateway: nextGateway,
        dns1: nextDns1,
        dns2: nextDns2,
        dhcpServer: nextDhcp,
        ipRangeStart: cidrInfo.ipRangeStart,
        ipRangeEnd: cidrInfo.ipRangeEnd,
        totalHosts: cidrInfo.totalHosts,
        description: nextDescription,
      },
    });

    // Reconcile old Gateway marker if gateway or CIDR changed
    if (
      existing.gateway &&
      (existing.gateway !== updated.gateway || !isIpInCidr(existing.gateway, updated.cidr))
    ) {
      const oldGwRecord = await prisma.ipAddress.findUnique({
        where: {
          subnetId_ipAddress: { subnetId: existing.id, ipAddress: existing.gateway },
        },
      });
      if (oldGwRecord && oldGwRecord.status === IpAllocationStatus.GATEWAY) {
        if (oldGwRecord.deviceId) {
          await prisma.ipAddress.update({
            where: { id: oldGwRecord.id },
            data: { status: IpAllocationStatus.ALLOCATED },
          });
        } else {
          await prisma.ipAddress.delete({ where: { id: oldGwRecord.id } });
        }
      }
    }

    // Remove out-of-range non-device manual IPs if CIDR shrunk
    if (existing.cidr !== updated.cidr) {
      const subnetIps = await prisma.ipAddress.findMany({
        where: { subnetId: updated.id, deviceId: null },
        select: { id: true, ipAddress: true },
      });
      const outOfRangeIds = subnetIps
        .filter((r) => !isIpInCidr(r.ipAddress, updated.cidr))
        .map((r) => r.id);
      if (outOfRangeIds.length > 0) {
        await prisma.ipAddress.deleteMany({ where: { id: { in: outOfRangeIds } } });
      }
    }

    // Apply new Gateway marker if inside subnet
    if (updated.gateway && isIpInCidr(updated.gateway, updated.cidr)) {
      const existingGwIp = await prisma.ipAddress.findUnique({
        where: { subnetId_ipAddress: { subnetId: updated.id, ipAddress: updated.gateway } },
      });
      if (existingGwIp) {
        await prisma.ipAddress.update({
          where: { id: existingGwIp.id },
          data: {
            status: IpAllocationStatus.GATEWAY,
            description: existingGwIp.description || 'Default Gateway',
          },
        });
      } else {
        await prisma.ipAddress.create({
          data: {
            siteId: updated.siteId,
            subnetId: updated.id,
            ipAddress: updated.gateway,
            status: IpAllocationStatus.GATEWAY,
            description: 'Default Gateway',
          },
        });
      }
    }

    // Re-sync site devices if CIDR, VLAN, or Gateway changed
    if (
      existing.cidr !== updated.cidr ||
      existing.vlanNumber !== updated.vlanNumber ||
      existing.gateway !== updated.gateway
    ) {
      const siteDevices = await prisma.device.findMany({
        where: { siteId: updated.siteId, managementIp: { not: null } },
      });
      for (const dev of siteDevices) {
        if (
          dev.managementIp &&
          (isIpInCidr(dev.managementIp, updated.cidr) ||
            isIpInCidr(dev.managementIp, existing.cidr))
        ) {
          await syncDeviceIpamAllocation(prisma, {
            id: dev.id,
            siteId: dev.siteId,
            name: dev.name,
            managementIp: dev.managementIp,
            macAddress: dev.macAddress,
            vlan: dev.vlan,
          });
        }
      }
    }

    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'UPDATE_SUBNET',
      module: 'IPAM',
      siteId: updated.siteId,
      details: { subnetId: updated.id, cidr: updated.cidr, vlanNumber: updated.vlanNumber },
    });

    res.json({ subnet: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/subnets/:id', async (req, res, next) => {
  try {
    const subnet = await prisma.subnet.findUnique({ where: { id: req.params.id } });
    if (!subnet) {
      res.status(404).json({ error: 'Subnet not found' });
      return;
    }
    if (!hasSitePermission(req.user!, subnet.siteId, 'canEditIpam')) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }
    await prisma.subnet.delete({ where: { id: subnet.id } });
    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'DELETE_SUBNET',
      module: 'IPAM',
      siteId: subnet.siteId,
      details: { subnetId: subnet.id, cidr: subnet.cidr },
    });
    res.json({ message: 'Subnet deleted' });
  } catch (err) {
    next(err);
  }
});

router.get('/subnets/:id/ips', async (req, res, next) => {
  try {
    const subnet = await prisma.subnet.findUnique({
      where: { id: req.params.id },
      include: {
        site: { select: { id: true, siteCode: true, siteName: true } },
        vlan: true,
        ipAddresses: {
          include: {
            device: {
              select: {
                id: true,
                siteId: true,
                name: true,
                category: true,
                model: true,
                vendor: true,
                macAddress: true,
                serialNumber: true,
                managementIp: true,
                vlan: true,
                location: true,
                status: true,
                monitorEnabled: true,
                lastPingAt: true,
                lastLatencyMs: true,
              },
            },
          },
        },
      },
    });

    if (!subnet) {
      res.status(404).json({ error: 'Subnet not found' });
      return;
    }
    if (!hasSitePermission(req.user!, subnet.siteId, 'canViewIpam')) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const liveSiteIds = await getLiveAgentSiteIds([subnet.siteId]);
    const serializeIpRecord = (record: (typeof subnet.ipAddresses)[number]) => ({
      ipAddress: record.ipAddress,
      status: record.status,
      hostname: record.hostname || record.device?.name || null,
      macAddress: record.macAddress || record.device?.macAddress || null,
      description: record.description || null,
      device: record.device
        ? {
            ...record.device,
            agentLive: isDeviceMonitoredByLiveAgent(record.device, liveSiteIds),
          }
        : null,
    });

    const allocatedMap = new Map(subnet.ipAddresses.map((a) => [a.ipAddress, a]));
    const activeRecords = subnet.ipAddresses
      .filter((a) => a.status !== IpAllocationStatus.AVAILABLE)
      .sort((a, b) => ipv4ToInt(a.ipAddress) - ipv4ToInt(b.ipAddress));

    const allocatedIps = activeRecords.map(serializeIpRecord);

    const blockCounts = new Map<string, number>();
    for (const record of activeRecords) {
      const prefix = getIpv4Block24Prefix(record.ipAddress);
      blockCounts.set(prefix, (blockCounts.get(prefix) ?? 0) + 1);
    }

    const activeBlocks = Array.from(blockCounts.entries())
      .map(([blockPrefix, usedCount]) => ({
        blockPrefix,
        blockCidr: `${blockPrefix}.0/24`,
        usedCount,
      }))
      .sort((a, b) => ipv4ToInt(`${a.blockPrefix}.0`) - ipv4ToInt(`${b.blockPrefix}.0`));

    const requestedBlock =
      typeof req.query.block === 'string' && req.query.block.trim()
        ? req.query.block.trim()
        : undefined;
    const preferredBlock =
      requestedBlock ?? (subnet.totalHosts > 256 ? activeBlocks[0]?.blockPrefix : undefined);

    const blockView = enumerateBlock24Hosts(subnet.cidr, preferredBlock);

    const grid = blockView.ips.map((ip) => {
      const record = allocatedMap.get(ip);
      if (record) {
        return serializeIpRecord(record);
      }
      return {
        ipAddress: ip,
        status: IpAllocationStatus.AVAILABLE,
        hostname: null,
        macAddress: null,
        description: null,
        device: null,
      };
    });

    const { ipAddresses: _rawIpAddresses, ...subnetMeta } = subnet;
    res.json({
      subnet: subnetMeta,
      ips: grid,
      allocatedIps,
      activeBlocks,
      currentBlockPrefix: blockView.blockPrefix,
      currentBlockCidr: blockView.blockCidr,
      isLargeSubnet: subnet.totalHosts > 256,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/ips/allocate', async (req, res, next) => {
  try {
    const body = allocateIpSchema.parse(req.body);
    const subnet = await prisma.subnet.findUnique({ where: { id: body.subnetId } });
    if (!subnet) {
      res.status(404).json({ error: 'Subnet not found' });
      return;
    }
    if (!hasSitePermission(req.user!, subnet.siteId, 'canEditIpam')) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }
    if (!isHostIpInCidr(body.ipAddress, subnet.cidr)) {
      res.status(400).json({
        error: `IP ${body.ipAddress} must be a usable host address inside ${subnet.cidr}`,
      });
      return;
    }

    if (body.status === IpAllocationStatus.AVAILABLE) {
      await prisma.ipAddress.deleteMany({
        where: { subnetId: subnet.id, ipAddress: body.ipAddress },
      });
      await recordAuditLog({
        req,
        userId: req.user!.id,
        username: req.user!.username,
        action: 'RELEASE_IP_ALLOCATION',
        module: 'IPAM',
        siteId: subnet.siteId,
        details: { ipAddress: body.ipAddress },
      });
      res.json({ message: 'IP released to AVAILABLE' });
      return;
    }

    if (body.deviceId) {
      const targetDevice = await prisma.device.findFirst({
        where: { id: body.deviceId, siteId: subnet.siteId },
      });
      if (!targetDevice) {
        res.status(400).json({ error: 'Referenced deviceId does not belong to this subnet site' });
        return;
      }
    }

    const existingIp = await prisma.ipAddress.findUnique({
      where: { subnetId_ipAddress: { subnetId: subnet.id, ipAddress: body.ipAddress } },
    });

    const ipRecord = existingIp
      ? await prisma.ipAddress.update({
          where: { id: existingIp.id },
          data: {
            status: body.status,
            hostname: body.hostname ?? null,
            macAddress: body.macAddress ?? null,
            deviceId: body.deviceId ?? null,
            description: body.description ?? null,
          },
          include: { device: true },
        })
      : await prisma.ipAddress.create({
          data: {
            siteId: subnet.siteId,
            subnetId: subnet.id,
            ipAddress: body.ipAddress,
            status: body.status,
            hostname: body.hostname ?? null,
            macAddress: body.macAddress ?? null,
            deviceId: body.deviceId ?? null,
            description: body.description ?? null,
          },
          include: { device: true },
        });

    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'UPDATE_IP_ALLOCATION',
      module: 'IPAM',
      siteId: subnet.siteId,
      details: { ipAddress: body.ipAddress, status: body.status },
    });

    res.json({ ipRecord });
  } catch (err) {
    next(err);
  }
});

router.get('/lookup', async (req, res, next) => {
  try {
    const ip = typeof req.query.ip === 'string' ? req.query.ip.trim() : '';
    if (!ip) {
      res.status(400).json({ error: 'Query parameter ip is required' });
      return;
    }

    const permitted = getPermittedSiteIds(req.user!, 'canViewIpam');
    const siteWhere = permitted !== null ? { siteId: { in: permitted } } : {};

    const [devices, allocations] = await Promise.all([
      prisma.device.findMany({
        where: { ...siteWhere, managementIp: ip },
        include: { site: { select: { id: true, siteCode: true, siteName: true } } },
      }),
      prisma.ipAddress.findMany({
        where: { ...siteWhere, ipAddress: ip },
        include: {
          subnet: { select: { id: true, cidr: true, vlanNumber: true, gateway: true } },
          device: { select: { id: true, name: true, model: true, location: true, category: true } },
          site: { select: { id: true, siteCode: true, siteName: true } },
        },
      }),
    ]);

    res.json({ ip, devices, allocations });
  } catch (err) {
    next(err);
  }
});

interface UnmappedSuggestionAccumulator {
  siteId: string;
  siteCode: string;
  siteName: string;
  suggestedCidr: string;
  deviceCount: number;
  vlanNumbers: Set<number | null>;
  sampleDevices: { name: string; ip: string }[];
}

async function collectInventorySyncStatus(siteIds: string[] | null) {
  const siteWhere = siteIds !== null ? { siteId: { in: siteIds } } : {};

  const [devices, subnets, activeAllocations] = await Promise.all([
    prisma.device.findMany({
      where: { ...siteWhere, managementIp: { not: null } },
      select: {
        id: true,
        siteId: true,
        name: true,
        managementIp: true,
        macAddress: true,
        vlan: true,
        site: { select: { id: true, siteCode: true, siteName: true } },
      },
      orderBy: [{ siteId: 'asc' }, { itemNo: 'asc' }, { name: 'asc' }],
    }),
    prisma.subnet.findMany({
      where: siteWhere,
      select: {
        id: true,
        siteId: true,
        cidr: true,
        vlanNumber: true,
        gateway: true,
      },
    }),
    prisma.ipAddress.findMany({
      where: { ...siteWhere, deviceId: { not: null } },
      select: {
        id: true,
        deviceId: true,
        subnetId: true,
        ipAddress: true,
        hostname: true,
        macAddress: true,
        status: true,
      },
    }),
  ]);

  const subnetsBySite = new Map<string, typeof subnets>();
  for (const sub of subnets) {
    const list = subnetsBySite.get(sub.siteId) ?? [];
    list.push(sub);
    subnetsBySite.set(sub.siteId, list);
  }

  const allocationsByDevice = new Map<string, (typeof activeAllocations)[number]>();
  for (const alloc of activeAllocations) {
    if (alloc.deviceId) {
      allocationsByDevice.set(alloc.deviceId, alloc);
    }
  }

  const suggestionsMap = new Map<string, UnmappedSuggestionAccumulator>();
  let unmappedNoSubnetCount = 0;
  let needsSyncCount = 0;
  const devicesToSync: typeof devices = [];

  for (const dev of devices) {
    const ip = dev.managementIp?.trim();
    if (!ip || !isValidIpv4(ip)) continue;

    const siteSubnets = subnetsBySite.get(dev.siteId) ?? [];
    const matchingSubnet = pickBestSubnetForDevice(siteSubnets, ip, dev.vlan);
    const existingAlloc = allocationsByDevice.get(dev.id);

    if (!matchingSubnet) {
      unmappedNoSubnetCount++;
      const suggestedCidr = `${getIpv4Block24Prefix(ip)}.0/24`;
      const key = `${dev.siteId}::${suggestedCidr}`;
      let group = suggestionsMap.get(key);
      if (!group) {
        group = {
          siteId: dev.siteId,
          siteCode: dev.site.siteCode,
          siteName: dev.site.siteName,
          suggestedCidr,
          deviceCount: 0,
          vlanNumbers: new Set(),
          sampleDevices: [],
        };
        suggestionsMap.set(key, group);
      }
      group.deviceCount++;
      group.vlanNumbers.add(parseVlanNumber(dev.vlan));
      if (group.sampleDevices.length < 4) {
        group.sampleDevices.push({ name: dev.name, ip });
      }
      if (existingAlloc) {
        devicesToSync.push(dev);
      }
      continue;
    }

    const expectedStatus =
      matchingSubnet.gateway === ip ? IpAllocationStatus.GATEWAY : IpAllocationStatus.ALLOCATED;
    const isSynced =
      existingAlloc &&
      existingAlloc.subnetId === matchingSubnet.id &&
      existingAlloc.ipAddress === ip &&
      existingAlloc.hostname === dev.name &&
      (existingAlloc.macAddress ?? null) === (dev.macAddress ?? null) &&
      existingAlloc.status === expectedStatus;

    if (!isSynced) {
      needsSyncCount++;
      devicesToSync.push(dev);
    }
  }

  const suggestedSubnets = Array.from(suggestionsMap.values())
    .map((g) => {
      const nonNullVlans = Array.from(g.vlanNumbers).filter((v): v is number => v !== null);
      const uniformVlan =
        g.vlanNumbers.size === 1 && nonNullVlans.length === 1 ? nonNullVlans[0] : null;
      return {
        siteId: g.siteId,
        siteCode: g.siteCode,
        siteName: g.siteName,
        suggestedCidr: g.suggestedCidr,
        deviceCount: g.deviceCount,
        vlanNumber: uniformVlan,
        sampleDevices: g.sampleDevices,
      };
    })
    .sort((a, b) => a.siteCode.localeCompare(b.siteCode) || a.suggestedCidr.localeCompare(b.suggestedCidr));

  return {
    totalChecked: devices.length,
    unmappedNoSubnetCount,
    needsSyncCount,
    suggestedSubnets,
    devicesToSync,
    subnetsBySite,
  };
}

router.get('/unmapped-devices', async (req, res, next) => {
  try {
    const siteId = typeof req.query.siteId === 'string' && req.query.siteId.trim() ? req.query.siteId.trim() : undefined;
    const permitted = getPermittedSiteIds(req.user!, 'canViewIpam');
    if (siteId && permitted !== null && !permitted.includes(siteId)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const targetSiteIds = siteId ? [siteId] : permitted;
    const summary = await collectInventorySyncStatus(targetSiteIds);

    res.json({
      unmappedNoSubnetCount: summary.unmappedNoSubnetCount,
      needsSyncCount: summary.needsSyncCount,
      suggestedSubnets: summary.suggestedSubnets,
    });
  } catch (err) {
    next(err);
  }
});

const syncIpamSchema = z.object({
  siteId: z.string().min(1).optional(),
  autoCreateSubnets: z.boolean().optional().default(false),
});

router.post('/sync', async (req, res, next) => {
  try {
    const body = syncIpamSchema.parse(req.body ?? {});
    const permittedEdit = getPermittedSiteIds(req.user!, 'canEditIpam');

    if (body.siteId) {
      if (!hasSitePermission(req.user!, body.siteId, 'canEditIpam')) {
        res.status(403).json({ error: 'Permission denied' });
        return;
      }
    } else if (permittedEdit !== null && permittedEdit.length === 0) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }

    const targetSiteIds = body.siteId ? [body.siteId] : permittedEdit;
    let summary = await collectInventorySyncStatus(targetSiteIds);
    let createdSubnetsCount = 0;

    if (body.autoCreateSubnets && summary.suggestedSubnets.length > 0) {
      for (const suggestion of summary.suggestedSubnets) {
        const existingSiteSubnets = summary.subnetsBySite.get(suggestion.siteId) ?? [];
        // Skip auto-creating if this exact CIDR already exists on the site (e.g. with another VLAN)
        if (existingSiteSubnets.some((s) => s.cidr === suggestion.suggestedCidr)) {
          continue;
        }

        const cidrInfo = parseCidr(suggestion.suggestedCidr);
        let vlanDbId: string | null = null;
        if (suggestion.vlanNumber) {
          let existingVlan = await prisma.vlan.findUnique({
            where: { siteId_vlanId: { siteId: suggestion.siteId, vlanId: suggestion.vlanNumber } },
          });
          if (!existingVlan) {
            existingVlan = await prisma.vlan.create({
              data: {
                siteId: suggestion.siteId,
                vlanId: suggestion.vlanNumber,
                name: `VLAN ${suggestion.vlanNumber}`,
              },
            });
          }
          vlanDbId = existingVlan.id;
        }

        const created = await prisma.subnet.create({
          data: {
            siteId: suggestion.siteId,
            vlanDbId,
            vlanNumber: suggestion.vlanNumber ?? null,
            cidr: cidrInfo.cidr,
            networkAddress: cidrInfo.networkAddress,
            subnetMask: cidrInfo.subnetMask,
            broadcastAddress: cidrInfo.broadcastAddress,
            ipRangeStart: cidrInfo.ipRangeStart,
            ipRangeEnd: cidrInfo.ipRangeEnd,
            totalHosts: cidrInfo.totalHosts,
            description: 'Auto-created from Device Inventory IPs',
          },
        });
        createdSubnetsCount++;
        existingSiteSubnets.push({
          id: created.id,
          siteId: created.siteId,
          cidr: created.cidr,
          vlanNumber: created.vlanNumber,
          gateway: created.gateway,
        });
        summary.subnetsBySite.set(suggestion.siteId, existingSiteSubnets);
      }

      if (createdSubnetsCount > 0) {
        summary = await collectInventorySyncStatus(targetSiteIds);
      }
    }

    let syncedDevicesCount = 0;
    for (const dev of summary.devicesToSync) {
      const ip = dev.managementIp?.trim() || null;
      if (!ip || !isValidIpv4(ip)) {
        await releaseDeviceIpamAllocations(prisma, dev.id);
        continue;
      }
      await syncDeviceIpamAllocation(prisma, {
        id: dev.id,
        siteId: dev.siteId,
        name: dev.name,
        managementIp: ip,
        macAddress: dev.macAddress,
        vlan: dev.vlan,
      });
      syncedDevicesCount++;
    }

    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'SYNC_IPAM_DEVICES',
      module: 'IPAM',
      siteId: body.siteId ?? null,
      details: {
        autoCreateSubnets: body.autoCreateSubnets,
        createdSubnetsCount,
        syncedDevicesCount,
        totalChecked: summary.totalChecked,
      },
    });

    res.json({
      createdSubnetsCount,
      syncedDevicesCount,
      totalChecked: summary.totalChecked,
      remainingUnmapped: summary.unmappedNoSubnetCount,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

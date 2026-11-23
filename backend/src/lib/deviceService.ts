import { DeviceCategory, DeviceStatus, IpAllocationStatus, Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { isIpInCidr, isValidIpv4, normalizeMacAddress, parseCidr, parseVlanNumber } from './ipam';
import { HttpError } from '../middleware/errorHandler';

export interface DevicePayload {
  siteId: string;
  category: DeviceCategory;
  itemNo?: number | null;
  name: string;
  model?: string | null;
  vendor?: string | null;
  macAddress?: string | null;
  serialNumber?: string | null;
  managementIp?: string | null;
  vlan?: string | null;
  location?: string | null;
  status?: DeviceStatus;
  monitorEnabled?: boolean;
  responsiblePerson?: string | null;
  remark?: string | null;
  switchDetail?: {
    managementVlan?: string | null;
    rack?: string | null;
    floor?: string | null;
    portCount?: number | null;
    firmwareVersion?: string | null;
    maintainer?: string | null;
    installationDate?: string | null;
    warrantyExpiration?: string | null;
  };
  accessPointDetail?: {
    ssid?: string | null;
    channel?: string | null;
    frequency?: string | null;
    floor?: string | null;
    installationPosition?: string | null;
    controller?: string | null;
  };
  apClientDetail?: {
    connectedAp?: string | null;
    wirelessMode?: string | null;
    ssid?: string | null;
    frequency?: string | null;
    connectedDevice?: string | null;
  };
  controllerDetail?: {
    controllerVersion?: string | null;
    managedApCount?: number | null;
  };
  serverDetail?: {
    hostname?: string | null;
    manufacturer?: string | null;
    productionIp?: string | null;
    operatingSystem?: string | null;
    cpu?: string | null;
    ram?: string | null;
    storage?: string | null;
    hypervisor?: string | null;
    serviceApplication?: string | null;
    rack?: string | null;
    maintenanceDate?: string | null;
  };
}

export async function validateSiteDeviceUniqueness(
  siteId: string,
  managementIp?: string | null,
  macAddress?: string | null,
  excludeDeviceId?: string,
): Promise<{ cleanIp: string | null; cleanMac: string | null }> {
  const cleanIp = managementIp && managementIp.trim() ? managementIp.trim() : null;
  if (cleanIp && !isValidIpv4(cleanIp)) {
    throw new HttpError(400, `Invalid Management IPv4 address: ${cleanIp}`);
  }

  let cleanMac: string | null = null;
  if (macAddress && macAddress.trim()) {
    try {
      cleanMac = normalizeMacAddress(macAddress);
    } catch (err) {
      throw new HttpError(400, (err as Error).message);
    }
  }

  if (cleanIp) {
    const existingIp = await prisma.device.findFirst({
      where: {
        siteId,
        managementIp: cleanIp,
        ...(excludeDeviceId ? { id: { not: excludeDeviceId } } : {}),
      },
      select: { id: true, name: true },
    });
    if (existingIp) {
      throw new HttpError(
        409,
        `Duplicate Management IP ${cleanIp} already assigned to "${existingIp.name}" in this site`,
      );
    }
  }

  if (cleanMac) {
    const existingMac = await prisma.device.findFirst({
      where: {
        siteId,
        macAddress: cleanMac,
        ...(excludeDeviceId ? { id: { not: excludeDeviceId } } : {}),
      },
      select: { id: true, name: true },
    });
    if (existingMac) {
      throw new HttpError(
        409,
        `Duplicate MAC Address ${cleanMac} already assigned to "${existingMac.name}" in this site`,
      );
    }
  }

  return { cleanIp, cleanMac };
}

export function pickBestSubnetForDevice<T extends { id: string; cidr: string; vlanNumber: number | null; gateway: string | null }>(
  subnets: T[],
  managementIp: string,
  vlan?: string | null,
): T | undefined {
  const cidrMatches = subnets.filter((s) => isIpInCidr(managementIp, s.cidr));
  if (cidrMatches.length === 0) return undefined;

  const deviceVlan = parseVlanNumber(vlan);
  const candidates =
    deviceVlan !== null
      ? (() => {
          const exactVlan = cidrMatches.filter((s) => s.vlanNumber === deviceVlan);
          if (exactVlan.length > 0) return exactVlan;
          return cidrMatches.filter((s) => s.vlanNumber === null);
        })()
      : cidrMatches;

  if (candidates.length === 0) return undefined;

  return [...candidates].sort((a, b) => parseCidr(b.cidr).prefixLength - parseCidr(a.cidr).prefixLength)[0];
}

export async function releaseDeviceIpamAllocations(
  tx: typeof prisma,
  deviceId: string,
  keep?: { subnetId: string; ipAddress: string },
): Promise<void> {
  const staleWhere: Prisma.IpAddressWhereInput = {
    deviceId,
    ...(keep
      ? {
          OR: [{ subnetId: { not: keep.subnetId } }, { ipAddress: { not: keep.ipAddress } }],
        }
      : {}),
  };

  await tx.ipAddress.updateMany({
    where: { ...staleWhere, status: { not: IpAllocationStatus.ALLOCATED } },
    data: { deviceId: null, hostname: null, macAddress: null },
  });

  await tx.ipAddress.deleteMany({
    where: { ...staleWhere, status: IpAllocationStatus.ALLOCATED },
  });
}

export async function syncDeviceIpamAllocation(
  tx: typeof prisma,
  device: {
    id: string;
    siteId: string;
    name: string;
    managementIp: string | null;
    macAddress: string | null;
    vlan?: string | null;
  },
): Promise<void> {
  let matchingSubnet:
    | { id: string; cidr: string; vlanNumber: number | null; gateway: string | null }
    | undefined;

  if (device.managementIp) {
    const subnets = await tx.subnet.findMany({ where: { siteId: device.siteId } });
    matchingSubnet = pickBestSubnetForDevice(subnets, device.managementIp, device.vlan);
  }

  await releaseDeviceIpamAllocations(
    tx,
    device.id,
    matchingSubnet && device.managementIp
      ? { subnetId: matchingSubnet.id, ipAddress: device.managementIp }
      : undefined,
  );

  if (!device.managementIp || !matchingSubnet) return;

  const ipStatus =
    matchingSubnet.gateway === device.managementIp
      ? IpAllocationStatus.GATEWAY
      : IpAllocationStatus.ALLOCATED;

  const existingIp = await tx.ipAddress.findUnique({
    where: {
      subnetId_ipAddress: {
        subnetId: matchingSubnet.id,
        ipAddress: device.managementIp,
      },
    },
  });

  if (existingIp) {
    await tx.ipAddress.update({
      where: { id: existingIp.id },
      data: {
        deviceId: device.id,
        hostname: device.name,
        macAddress: device.macAddress,
        status: ipStatus,
      },
    });
  } else {
    await tx.ipAddress.create({
      data: {
        siteId: device.siteId,
        subnetId: matchingSubnet.id,
        ipAddress: device.managementIp,
        deviceId: device.id,
        hostname: device.name,
        macAddress: device.macAddress,
        status: ipStatus,
      },
    });
  }
}

function parseOptionalDate(val?: string | null): Date | null {
  if (!val || !val.trim()) return null;
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function createDeviceWithDetails(payload: DevicePayload) {
  const { cleanIp, cleanMac } = await validateSiteDeviceUniqueness(
    payload.siteId,
    payload.managementIp,
    payload.macAddress,
  );

  const deviceType = await prisma.deviceType.findUniqueOrThrow({
    where: { code: payload.category },
  });

  const monitorEnabled = payload.monitorEnabled ?? true;
  const effectiveCreateStatus =
    payload.status === DeviceStatus.MAINTENANCE
      ? DeviceStatus.MAINTENANCE
      : !cleanIp || !monitorEnabled
        ? DeviceStatus.UNKNOWN
        : payload.status ?? DeviceStatus.UNKNOWN;

  const tx = prisma;
  const device = await tx.device.create({
      data: {
        siteId: payload.siteId,
        deviceTypeId: deviceType.id,
        category: payload.category,
        itemNo: payload.itemNo ?? null,
        name: payload.name.trim(),
        model: payload.model?.trim() || null,
        vendor: payload.vendor?.trim() || null,
        macAddress: cleanMac,
        serialNumber: payload.serialNumber?.trim() || null,
        managementIp: cleanIp,
        vlan: payload.vlan?.trim() || null,
        location: payload.location?.trim() || null,
        status: effectiveCreateStatus,
        monitorEnabled,
        responsiblePerson: payload.responsiblePerson?.trim() || null,
        remark: payload.remark?.trim() || null,
      },
    });

    if (payload.category === DeviceCategory.SWITCH) {
      const d = payload.switchDetail || {};
      await tx.switchDetail.create({
        data: {
          deviceId: device.id,
          managementVlan: d.managementVlan ?? payload.vlan ?? null,
          rack: d.rack ?? null,
          floor: d.floor ?? null,
          portCount: d.portCount ?? null,
          firmwareVersion: d.firmwareVersion ?? null,
          maintainer: d.maintainer ?? null,
          installationDate: parseOptionalDate(d.installationDate),
          warrantyExpiration: parseOptionalDate(d.warrantyExpiration),
        },
      });
    } else if (payload.category === DeviceCategory.ACCESS_POINT) {
      const d = payload.accessPointDetail || {};
      await tx.accessPointDetail.create({
        data: {
          deviceId: device.id,
          ssid: d.ssid ?? null,
          channel: d.channel ?? null,
          frequency: d.frequency ?? null,
          floor: d.floor ?? null,
          installationPosition: d.installationPosition ?? null,
          controller: d.controller ?? null,
        },
      });
    } else if (payload.category === DeviceCategory.AP_CLIENT) {
      const d = payload.apClientDetail || {};
      await tx.apClientDetail.create({
        data: {
          deviceId: device.id,
          connectedAp: d.connectedAp ?? null,
          wirelessMode: d.wirelessMode ?? null,
          ssid: d.ssid ?? null,
          frequency: d.frequency ?? null,
          connectedDevice: d.connectedDevice ?? null,
        },
      });
    } else if (payload.category === DeviceCategory.WLC) {
      const d = payload.controllerDetail || {};
      await tx.controllerDetail.create({
        data: {
          deviceId: device.id,
          controllerVersion: d.controllerVersion ?? null,
          managedApCount: d.managedApCount ?? null,
        },
      });
    } else if (
      payload.category === DeviceCategory.SERVER ||
      payload.category === DeviceCategory.ESXI ||
      payload.category === DeviceCategory.VM ||
      payload.category === DeviceCategory.NAS ||
      payload.category === DeviceCategory.PC ||
      payload.category === DeviceCategory.NVR
    ) {
      const d = payload.serverDetail || {};
      await tx.serverDetail.create({
        data: {
          deviceId: device.id,
          hostname: d.hostname ?? null,
          manufacturer: d.manufacturer ?? payload.vendor ?? null,
          productionIp: d.productionIp ?? null,
          operatingSystem: d.operatingSystem ?? null,
          cpu: d.cpu ?? null,
          ram: d.ram ?? null,
          storage: d.storage ?? null,
          hypervisor: d.hypervisor ?? null,
          serviceApplication: d.serviceApplication ?? null,
          rack: d.rack ?? null,
          maintenanceDate: parseOptionalDate(d.maintenanceDate),
        },
      });
    }

    await syncDeviceIpamAllocation(tx, {
      id: device.id,
      siteId: device.siteId,
      name: device.name,
      managementIp: device.managementIp,
      macAddress: device.macAddress,
      vlan: device.vlan,
    });

    return tx.device.findUniqueOrThrow({
      where: { id: device.id },
      include: {
        site: { select: { id: true, siteCode: true, siteName: true } },
        switchDetail: true,
        accessPointDetail: true,
        apClientDetail: true,
        controllerDetail: true,
        serverDetail: true,
      },
    });
}

export async function updateDeviceWithDetails(deviceId: string, payload: Partial<DevicePayload>) {
  const existing = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!existing) throw new HttpError(404, 'Device not found');

  const targetSiteId = payload.siteId ?? existing.siteId;
  const { cleanIp, cleanMac } = await validateSiteDeviceUniqueness(
    targetSiteId,
    payload.managementIp !== undefined ? payload.managementIp : existing.managementIp,
    payload.macAddress !== undefined ? payload.macAddress : existing.macAddress,
    deviceId,
  );

  const nextCategory = payload.category ?? existing.category;
  const categoryChanged = payload.category !== undefined && payload.category !== existing.category;
  let nextDeviceTypeId: string | undefined = undefined;
  if (categoryChanged) {
    const dt = await prisma.deviceType.findUniqueOrThrow({ where: { code: nextCategory } });
    nextDeviceTypeId = dt.id;
    // Remove stale subtype detail records from previous category
    if (existing.category === DeviceCategory.SWITCH) {
      await prisma.switchDetail.deleteMany({ where: { deviceId } });
    } else if (existing.category === DeviceCategory.ACCESS_POINT) {
      await prisma.accessPointDetail.deleteMany({ where: { deviceId } });
    } else if (existing.category === DeviceCategory.AP_CLIENT) {
      await prisma.apClientDetail.deleteMany({ where: { deviceId } });
    } else if (existing.category === DeviceCategory.WLC) {
      await prisma.controllerDetail.deleteMany({ where: { deviceId } });
    } else if (
      nextCategory !== DeviceCategory.SERVER &&
      nextCategory !== DeviceCategory.ESXI &&
      nextCategory !== DeviceCategory.VM &&
      nextCategory !== DeviceCategory.NAS &&
      nextCategory !== DeviceCategory.PC &&
      nextCategory !== DeviceCategory.NVR
    ) {
      await prisma.serverDetail.deleteMany({ where: { deviceId } });
    }
  }

  const nextMonitorEnabled =
    payload.monitorEnabled !== undefined ? payload.monitorEnabled : existing.monitorEnabled;
  const requestedStatus = payload.status !== undefined ? payload.status : existing.status;
  const monitoringDisabledNow = !nextMonitorEnabled || !cleanIp;
  const nextStatus =
    requestedStatus === DeviceStatus.MAINTENANCE
      ? DeviceStatus.MAINTENANCE
      : monitoringDisabledNow
        ? DeviceStatus.UNKNOWN
        : payload.status;

  const tx = prisma;
  const updated = await tx.device.update({
      where: { id: deviceId },
      data: {
        siteId: payload.siteId !== undefined ? payload.siteId : undefined,
        deviceTypeId: nextDeviceTypeId,
        category: payload.category !== undefined ? payload.category : undefined,
        itemNo: payload.itemNo !== undefined ? payload.itemNo : undefined,
        name: payload.name !== undefined ? payload.name.trim() : undefined,
        model: payload.model !== undefined ? payload.model?.trim() || null : undefined,
        vendor: payload.vendor !== undefined ? payload.vendor?.trim() || null : undefined,
        macAddress: payload.macAddress !== undefined ? cleanMac : undefined,
        serialNumber:
          payload.serialNumber !== undefined ? payload.serialNumber?.trim() || null : undefined,
        managementIp: payload.managementIp !== undefined ? cleanIp : undefined,
        vlan: payload.vlan !== undefined ? payload.vlan?.trim() || null : undefined,
        location: payload.location !== undefined ? payload.location?.trim() || null : undefined,
        status: nextStatus,
        monitorEnabled: payload.monitorEnabled !== undefined ? payload.monitorEnabled : undefined,
        ...(monitoringDisabledNow
          ? { lastPingAt: null, lastLatencyMs: null, consecutiveMisses: 0 }
          : {}),
        responsiblePerson:
          payload.responsiblePerson !== undefined
            ? payload.responsiblePerson?.trim() || null
            : undefined,
        remark: payload.remark !== undefined ? payload.remark?.trim() || null : undefined,
      },
    });

    if (updated.category === DeviceCategory.SWITCH && payload.switchDetail) {
      const d = payload.switchDetail;
      const existingDetail = await tx.switchDetail.findUnique({ where: { deviceId } });
      if (existingDetail) {
        await tx.switchDetail.update({
          where: { id: existingDetail.id },
          data: {
            managementVlan: d.managementVlan,
            rack: d.rack,
            floor: d.floor,
            portCount: d.portCount,
            firmwareVersion: d.firmwareVersion,
            maintainer: d.maintainer,
            installationDate:
              d.installationDate !== undefined ? parseOptionalDate(d.installationDate) : undefined,
            warrantyExpiration:
              d.warrantyExpiration !== undefined
                ? parseOptionalDate(d.warrantyExpiration)
                : undefined,
          },
        });
      } else {
        await tx.switchDetail.create({
          data: {
            deviceId,
            ...d,
            installationDate: parseOptionalDate(d.installationDate),
            warrantyExpiration: parseOptionalDate(d.warrantyExpiration),
          },
        });
      }
    } else if (updated.category === DeviceCategory.ACCESS_POINT && payload.accessPointDetail) {
      const existingDetail = await tx.accessPointDetail.findUnique({ where: { deviceId } });
      if (existingDetail) {
        await tx.accessPointDetail.update({
          where: { id: existingDetail.id },
          data: payload.accessPointDetail,
        });
      } else {
        await tx.accessPointDetail.create({
          data: { deviceId, ...payload.accessPointDetail },
        });
      }
    } else if (updated.category === DeviceCategory.AP_CLIENT && payload.apClientDetail) {
      const existingDetail = await tx.apClientDetail.findUnique({ where: { deviceId } });
      if (existingDetail) {
        await tx.apClientDetail.update({
          where: { id: existingDetail.id },
          data: payload.apClientDetail,
        });
      } else {
        await tx.apClientDetail.create({
          data: { deviceId, ...payload.apClientDetail },
        });
      }
    } else if (updated.category === DeviceCategory.WLC && payload.controllerDetail) {
      const existingDetail = await tx.controllerDetail.findUnique({ where: { deviceId } });
      if (existingDetail) {
        await tx.controllerDetail.update({
          where: { id: existingDetail.id },
          data: payload.controllerDetail,
        });
      } else {
        await tx.controllerDetail.create({
          data: { deviceId, ...payload.controllerDetail },
        });
      }
    } else if (
      (updated.category === DeviceCategory.SERVER ||
        updated.category === DeviceCategory.ESXI ||
        updated.category === DeviceCategory.VM ||
        updated.category === DeviceCategory.NAS ||
        updated.category === DeviceCategory.PC ||
        updated.category === DeviceCategory.NVR) &&
      payload.serverDetail
    ) {
      const d = payload.serverDetail;
      const existingDetail = await tx.serverDetail.findUnique({ where: { deviceId } });
      if (existingDetail) {
        await tx.serverDetail.update({
          where: { id: existingDetail.id },
          data: {
            ...d,
            maintenanceDate:
              d.maintenanceDate !== undefined ? parseOptionalDate(d.maintenanceDate) : undefined,
          },
        });
      } else {
        await tx.serverDetail.create({
          data: {
            deviceId,
            ...d,
            maintenanceDate: parseOptionalDate(d.maintenanceDate),
          },
        });
      }
    }

    await syncDeviceIpamAllocation(tx, {
      id: updated.id,
      siteId: updated.siteId,
      name: updated.name,
      managementIp: updated.managementIp,
      macAddress: updated.macAddress,
      vlan: updated.vlan,
    });

    return tx.device.findUniqueOrThrow({
      where: { id: deviceId },
      include: {
        site: { select: { id: true, siteCode: true, siteName: true } },
        switchDetail: true,
        accessPointDetail: true,
        apClientDetail: true,
        controllerDetail: true,
        serverDetail: true,
      },
    });
}

const DIAGRAM_HARDWARE_TYPES = new Set([
  'switch',
  'router',
  'firewall',
  'access_point',
  'server',
  'plc',
  'esxi',
  'vm',
  'nas',
  'ups',
  'ip_cam',
  'pc',
  'nvr',
  'tv',
  'printer',
  'barcode',
  'handheld',
  'wlc',
  'wireless_bridge',
  'client',
  'custom_icon',
]);

const DEFAULT_PALETTE_LABELS = new Set([
  'Switch',
  'Router',
  'Firewall',
  'Access Point',
  'Server',
  'Cloud',
  'Internet',
  'PLC',
  'ESXi',
  'VM',
  'NAS',
  'UPS',
  'IP Camera',
  'PC',
  'NVR',
  'TV',
  'Printer',
  'Barcode',
  'Handheld',
  'Wireless Bridge',
  'Client',
  'Custom Icon',
  'Note / Text',
]);

export function mapDiagramTypeToDeviceCategory(
  deviceType?: string | null,
  explicitCategory?: string | null,
): DeviceCategory {
  if (
    explicitCategory &&
    [
      'SWITCH',
      'ACCESS_POINT',
      'AP_CLIENT',
      'WLC',
      'SERVER',
      'PLC',
      'ESXI',
      'VM',
      'NAS',
      'UPS',
      'IP_CAM',
      'PC',
      'NVR',
      'TV',
      'PRINTER',
      'BARCODE',
      'HANDHELD',
    ].includes(explicitCategory)
  ) {
    return explicitCategory as DeviceCategory;
  }
  switch (deviceType) {
    case 'access_point':
      return DeviceCategory.ACCESS_POINT;
    case 'wireless_bridge':
    case 'client':
      return DeviceCategory.AP_CLIENT;
    case 'wlc':
      return DeviceCategory.WLC;
    case 'server':
      return DeviceCategory.SERVER;
    case 'plc':
      return DeviceCategory.PLC;
    case 'esxi':
      return DeviceCategory.ESXI;
    case 'vm':
      return DeviceCategory.VM;
    case 'nas':
      return DeviceCategory.NAS;
    case 'ups':
      return DeviceCategory.UPS;
    case 'ip_cam':
      return DeviceCategory.IP_CAM;
    case 'pc':
      return DeviceCategory.PC;
    case 'nvr':
      return DeviceCategory.NVR;
    case 'tv':
      return DeviceCategory.TV;
    case 'printer':
      return DeviceCategory.PRINTER;
    case 'barcode':
      return DeviceCategory.BARCODE;
    case 'handheld':
      return DeviceCategory.HANDHELD;
    default:
      return DeviceCategory.SWITCH;
  }
}

export async function syncDiagramNodesToInventory(
  siteId: string,
  canvasData: unknown,
): Promise<{ canvasData: Record<string, unknown>; syncedCount: number }> {
  if (!canvasData || typeof canvasData !== 'object') {
    return { canvasData: (canvasData || {}) as Record<string, unknown>, syncedCount: 0 };
  }

  const cd = canvasData as {
    nodes?: Array<{ id: string; data?: Record<string, unknown>; [k: string]: unknown }>;
    [k: string]: unknown;
  };

  if (!Array.isArray(cd.nodes) || cd.nodes.length === 0) {
    return { canvasData: cd, syncedCount: 0 };
  }

  let syncedCount = 0;
  const updatedNodes = [];

  for (const node of cd.nodes) {
    const data = node.data;
    if (!data || data.deviceType === 'note') {
      updatedNodes.push(node);
      continue;
    }

    const deviceType = typeof data.deviceType === 'string' ? data.deviceType : 'switch';
    if (deviceType.startsWith('zone_') || deviceType.startsWith('shape_')) {
      updatedNodes.push(node);
      continue;
    }

    // If this node is already linked to a Device Inventory record, sync edited fields (status, label, etc.) back
    if (typeof data.deviceId === 'string' && data.deviceId.trim().length > 0) {
      const existingDev = await prisma.device.findFirst({
        where: { id: data.deviceId.trim(), siteId },
      });
      if (!existingDev) {
        updatedNodes.push(node);
        continue;
      }

      const nextStatus =
        typeof data.status === 'string' &&
        ['ONLINE', 'OFFLINE', 'MAINTENANCE', 'UNKNOWN'].includes(data.status)
          ? (data.status as DeviceStatus)
          : existingDev.status;
      const nextName =
        typeof data.label === 'string' && data.label.trim().length > 0
          ? data.label.trim()
          : existingDev.name;
      const nextModel =
        data.model !== undefined
          ? typeof data.model === 'string' && data.model.trim()
            ? data.model.trim()
            : null
          : existingDev.model;
      const nextVendor =
        data.vendor !== undefined
          ? typeof data.vendor === 'string' && data.vendor.trim()
            ? data.vendor.trim()
            : null
          : existingDev.vendor;
      const nextVlan =
        data.vlan !== undefined
          ? typeof data.vlan === 'string' && data.vlan.trim()
            ? data.vlan.trim()
            : null
          : existingDev.vlan;
      const nextLocation =
        data.location !== undefined
          ? typeof data.location === 'string' && data.location.trim()
            ? data.location.trim()
            : null
          : existingDev.location;
      const rawNodeIp = typeof data.ipAddress === 'string' ? data.ipAddress.trim() : '';
      const nextIp =
        rawNodeIp && isValidIpv4(rawNodeIp)
          ? rawNodeIp
          : rawNodeIp === '' && data.ipAddress !== undefined
            ? null
            : existingDev.managementIp;

      const changed =
        nextStatus !== existingDev.status ||
        nextName !== existingDev.name ||
        nextModel !== existingDev.model ||
        nextVendor !== existingDev.vendor ||
        nextVlan !== existingDev.vlan ||
        nextLocation !== existingDev.location ||
        nextIp !== existingDev.managementIp;

      if (changed) {
        let finalDev = existingDev;
        try {
          finalDev = await updateDeviceWithDetails(existingDev.id, {
            name: nextName,
            model: nextModel,
            vendor: nextVendor,
            vlan: nextVlan,
            location: nextLocation,
            status: nextStatus,
            managementIp: nextIp,
          });
        } catch {
          // If IP conflicts with another device, still persist status & metadata edits safely
          finalDev = await updateDeviceWithDetails(existingDev.id, {
            name: nextName,
            model: nextModel,
            vendor: nextVendor,
            vlan: nextVlan,
            location: nextLocation,
            status: nextStatus,
          });
        }
        updatedNodes.push({
          ...node,
          data: {
            ...data,
            label: finalDev.name,
            model: finalDev.model || undefined,
            vendor: finalDev.vendor || undefined,
            ipAddress: finalDev.managementIp || undefined,
            vlan: finalDev.vlan || undefined,
            location: finalDev.location || undefined,
            status: finalDev.status,
          },
        });
      } else {
        updatedNodes.push(node);
      }
      continue;
    }
    const label = typeof data.label === 'string' ? data.label.trim() : '';
    const rawIp = typeof data.ipAddress === 'string' ? data.ipAddress.trim() : '';
    const model = typeof data.model === 'string' ? data.model.trim() : '';
    const vendor = typeof data.vendor === 'string' ? data.vendor.trim() : '';
    const rawMac = typeof data.macAddress === 'string' ? data.macAddress.trim() : '';
    const serialNumber = typeof data.serialNumber === 'string' ? data.serialNumber.trim() : '';
    const vlan = typeof data.vlan === 'string' ? data.vlan.trim() : '';
    const location = typeof data.location === 'string' ? data.location.trim() : '';

    const hasExplicitOptIn = data.syncToInventory === true;
    const hasExplicitOptOut = data.syncToInventory === false;
    const hasDetails = Boolean(rawIp || model || rawMac || serialNumber);
    const hasCustomLabel = Boolean(label && !DEFAULT_PALETTE_LABELS.has(label));
    const shouldAutoSync =
      !hasExplicitOptOut &&
      (hasExplicitOptIn || (DIAGRAM_HARDWARE_TYPES.has(deviceType) && (hasDetails || hasCustomLabel)));

    if (!shouldAutoSync || !label) {
      updatedNodes.push(node);
      continue;
    }

    const cleanIp = rawIp && isValidIpv4(rawIp) ? rawIp : null;
    let cleanMac: string | null = null;
    if (rawMac) {
      try {
        cleanMac = normalizeMacAddress(rawMac);
      } catch {
        cleanMac = null;
      }
    }

    // Check if matching device already exists in this site so we link instead of erroring
    let targetDevice = cleanIp
      ? await prisma.device.findFirst({
          where: { siteId, managementIp: cleanIp },
        })
      : null;

    if (!targetDevice && cleanMac) {
      targetDevice = await prisma.device.findFirst({
        where: { siteId, macAddress: cleanMac },
      });
    }

    if (!targetDevice) {
      const category = mapDiagramTypeToDeviceCategory(
        deviceType,
        typeof data.inventoryCategory === 'string' ? data.inventoryCategory : null,
      );
      const status =
        typeof data.status === 'string' &&
        ['ONLINE', 'OFFLINE', 'MAINTENANCE', 'UNKNOWN'].includes(data.status)
          ? (data.status as DeviceStatus)
          : DeviceStatus.UNKNOWN;

      targetDevice = await createDeviceWithDetails({
        siteId,
        category,
        name: label,
        model: model || (deviceType === 'plc' ? 'PLC' : null),
        vendor: vendor || null,
        macAddress: cleanMac,
        serialNumber: serialNumber || null,
        managementIp: cleanIp,
        vlan: vlan || null,
        location: location || null,
        status,
        remark: `Added from Network Diagram (${deviceType})`,
      });
      syncedCount += 1;
    }

    updatedNodes.push({
      ...node,
      data: {
        ...data,
        deviceId: targetDevice.id,
        label: targetDevice.name,
        model: targetDevice.model || model || undefined,
        vendor: targetDevice.vendor || vendor || undefined,
        ipAddress: targetDevice.managementIp || rawIp || undefined,
        macAddress: targetDevice.macAddress || cleanMac || undefined,
        serialNumber: targetDevice.serialNumber || serialNumber || undefined,
        vlan: targetDevice.vlan || vlan || undefined,
        location: targetDevice.location || location || undefined,
        status: targetDevice.status,
      },
    });
  }

  return {
    canvasData: {
      ...cd,
      nodes: updatedNodes,
    },
    syncedCount,
  };
}

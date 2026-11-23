import { RoleCode } from '@prisma/client';
import { prisma } from './prisma';
import { env } from '../config/env';

const SYSTEM_ROLES: { code: RoleCode; name: string; description: string }[] = [
  {
    code: RoleCode.SUPER_ADMIN,
    name: 'Super Admin',
    description: 'Full organizational control across all sites, users, credentials, audit logs, and backups.',
  },
  {
    code: RoleCode.SITE_ADMIN,
    name: 'Site Admin',
    description: 'Manage assigned sites including inventory, diagrams, documents, IPAM, and authorized credentials.',
  },
  {
    code: RoleCode.NETWORK_ENGINEER,
    name: 'Network Engineer',
    description: 'View and modify inventory, diagrams, IPAM, and documents on assigned sites.',
  },
  {
    code: RoleCode.VIEWER,
    name: 'Viewer',
    description: 'Read-only access to dashboard, inventory, diagrams, IPAM, and documents on assigned sites.',
  },
  {
    code: RoleCode.IP_VIEWER,
    name: 'IP Viewer (Restricted)',
    description: 'View device names, models, IPs, MACs, serial numbers, locations, diagrams, and subnets; strictly blocked from credentials.',
  },
];

const SYSTEM_DEVICE_TYPES: {
  code: string;
  name: string;
  description: string;
  iconKey: string;
  isSystem: boolean;
}[] = [
  { code: 'SWITCH', name: 'Switch', description: 'Layer 2 / Layer 3 Network Switches', iconKey: 'SWITCH', isSystem: true },
  { code: 'ACCESS_POINT', name: 'Access Point', description: 'Wireless Access Points', iconKey: 'ACCESS_POINT', isSystem: true },
  { code: 'AP_CLIENT', name: 'AP Client', description: 'Wireless Bridges and Client Devices', iconKey: 'AP_CLIENT', isSystem: true },
  { code: 'WLC', name: 'Wireless Controller (WLC)', description: 'Wireless LAN Controllers', iconKey: 'WLC', isSystem: true },
  { code: 'SERVER', name: 'Server', description: 'Physical & Virtual Infrastructure Servers', iconKey: 'SERVER', isSystem: true },
  { code: 'PLC', name: 'PLC', description: 'Programmable Logic Controllers & Industrial Automation', iconKey: 'PLC', isSystem: true },
  { code: 'ESXI', name: 'VMware ESXi', description: 'Hypervisor & Virtualization Hosts', iconKey: 'ESXI', isSystem: true },
  { code: 'VM', name: 'Virtual Machine (VM)', description: 'Guest Virtual Machines', iconKey: 'VM', isSystem: true },
  { code: 'NAS', name: 'NAS Storage', description: 'Network-Attached Storage Appliances', iconKey: 'NAS', isSystem: true },
  { code: 'UPS', name: 'UPS', description: 'Uninterruptible Power Supplies', iconKey: 'UPS', isSystem: true },
  { code: 'IP_CAM', name: 'IP Camera (CCTV)', description: 'Network IP Cameras & CCTV Devices', iconKey: 'IP_CAM', isSystem: true },
  { code: 'PC', name: 'PC / Workstation', description: 'Desktop PCs & Operator Workstations', iconKey: 'PC', isSystem: true },
  { code: 'NVR', name: 'NVR Recorder', description: 'Network Video Recorders & CCTV Storage', iconKey: 'NVR', isSystem: true },
  { code: 'TV', name: 'TV / Display', description: 'Smart TVs, Dashboard Displays & Digital Signage', iconKey: 'TV', isSystem: true },
  { code: 'PRINTER', name: 'Printer', description: 'Network Printers & Industrial Label Printers', iconKey: 'PRINTER', isSystem: true },
  { code: 'BARCODE', name: 'Barcode Scanner', description: 'Fixed & Handheld Barcode Scanners / Readers', iconKey: 'BARCODE', isSystem: true },
  { code: 'HANDHELD', name: 'Handheld Terminal / PDA', description: 'Mobile Handheld Terminals, RF Scanners & Rugged PDAs', iconKey: 'HANDHELD', isSystem: true },
];

const SYSTEM_PERMISSIONS: { code: string; module: string; action: string; description: string }[] = [
  { code: 'site:manage', module: 'SITE', action: 'MANAGE', description: 'Create, update, delete sites' },
  { code: 'inventory:view', module: 'INVENTORY', action: 'VIEW', description: 'View device inventory' },
  { code: 'inventory:edit', module: 'INVENTORY', action: 'EDIT', description: 'Create, edit, delete devices' },
  { code: 'ipam:view', module: 'IPAM', action: 'VIEW', description: 'View VLANs, subnets, and IP allocations' },
  { code: 'ipam:edit', module: 'IPAM', action: 'EDIT', description: 'Manage VLANs, subnets, and IP allocations' },
  { code: 'diagram:view', module: 'DIAGRAM', action: 'VIEW', description: 'View network diagrams' },
  { code: 'diagram:edit', module: 'DIAGRAM', action: 'EDIT', description: 'Upload and edit network diagrams' },
  { code: 'document:view', module: 'DOCUMENT', action: 'VIEW', description: 'View and download project documents' },
  { code: 'document:edit', module: 'DOCUMENT', action: 'EDIT', description: 'Upload and update project documents' },
  { code: 'document:delete', module: 'DOCUMENT', action: 'DELETE', description: 'Delete project documents' },
  { code: 'credential:view', module: 'CREDENTIALS', action: 'VIEW', description: 'View and copy device credentials' },
  { code: 'credential:edit', module: 'CREDENTIALS', action: 'EDIT', description: 'Create, edit, delete credentials' },
  { code: 'audit:view', module: 'AUDIT', action: 'VIEW', description: 'View immutable audit logs' },
  { code: 'user:manage', module: 'USER', action: 'MANAGE', description: 'Manage users and site permissions' },
  { code: 'backup:manage', module: 'BACKUP', action: 'MANAGE', description: 'Run and restore system backups' },
];

export async function ensureReferenceData(): Promise<void> {
  for (const role of SYSTEM_ROLES) {
    const existing = await prisma.role.findUnique({ where: { code: role.code } });
    if (existing) {
      await prisma.role.update({
        where: { id: existing.id },
        data: { name: role.name, description: role.description },
      });
    } else {
      await prisma.role.create({ data: role });
    }
  }

  for (const dt of SYSTEM_DEVICE_TYPES) {
    const existing = await prisma.deviceType.findUnique({ where: { code: dt.code } });
    if (existing) {
      await prisma.deviceType.update({
        where: { id: existing.id },
        data: {
          name: dt.name,
          description: dt.description,
          iconKey: dt.iconKey,
          isSystem: true,
        },
      });
    } else {
      await prisma.deviceType.create({ data: dt });
    }
  }

  for (const perm of SYSTEM_PERMISSIONS) {
    const existing = await prisma.permission.findUnique({ where: { code: perm.code } });
    if (existing) {
      await prisma.permission.update({
        where: { id: existing.id },
        data: { module: perm.module, action: perm.action, description: perm.description },
      });
    } else {
      await prisma.permission.create({ data: perm });
    }
  }

  const existingSetting = await prisma.systemSetting.findUnique({ where: { key: 'default' } });
  if (!existingSetting) {
    await prisma.systemSetting.create({
      data: {
        key: 'default',
        organizationName: 'NIMS Enterprise',
        defaultTheme: 'light',
        storageLocation: env.storageRoot,
        backupLocation: env.backupRoot,
      },
    });
  }
}

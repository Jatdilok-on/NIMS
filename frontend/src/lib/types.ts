export type RoleCode =
  | 'SUPER_ADMIN'
  | 'SITE_ADMIN'
  | 'NETWORK_ENGINEER'
  | 'VIEWER'
  | 'IP_VIEWER';

export type DeviceCategory =
  | 'SWITCH'
  | 'ACCESS_POINT'
  | 'AP_CLIENT'
  | 'WLC'
  | 'SERVER'
  | 'PLC'
  | 'ESXI'
  | 'VM'
  | 'NAS'
  | 'UPS'
  | 'IP_CAM'
  | 'PC'
  | 'NVR'
  | 'TV'
  | 'PRINTER'
  | 'BARCODE';
export type DeviceStatus = 'ONLINE' | 'OFFLINE' | 'MAINTENANCE' | 'UNKNOWN';
export type IpAllocationStatus = 'AVAILABLE' | 'ALLOCATED' | 'RESERVED' | 'GATEWAY' | 'DHCP';
export type LoginType =
  | 'SSH'
  | 'HTTPS'
  | 'HTTP'
  | 'WINBOX'
  | 'RDP'
  | 'VPN'
  | 'CONSOLE'
  | 'WEB_GUI'
  | 'OTHER';

export type DocumentCategory =
  | 'NETWORK_DESIGN'
  | 'NETWORK_DIAGRAM'
  | 'CONFIGURATION_BACKUP'
  | 'IP_ADDRESS_PLAN'
  | 'PROJECT_SPECIFICATION'
  | 'INSTALLATION_REPORT'
  | 'MAINTENANCE_REPORT'
  | 'USER_MANUAL'
  | 'VENDOR_DOCUMENTS'
  | 'OTHER';

export interface SitePermission {
  id?: string;
  siteId: string;
  site?: { id: string; siteCode: string; siteName: string };
  canViewInventory: boolean;
  canEditInventory: boolean;
  canViewDiagram: boolean;
  canEditDiagram: boolean;
  canViewIpam: boolean;
  canEditIpam: boolean;
  canViewDocuments: boolean;
  canEditDocuments: boolean;
  canDeleteDocuments: boolean;
  canViewCredentials: boolean;
  canEditCredentials: boolean;
  canViewMaintenance: boolean;
  canEditMaintenance: boolean;
  canManageSite: boolean;
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  fullName: string;
  roleCode: RoleCode;
  roleName: string;
  mustChangePassword?: boolean;
  sitePermissions: SitePermission[];
}

export interface Site {
  id: string;
  siteCode: string;
  siteName: string;
  customerName?: string | null;
  location?: string | null;
  googleMapUrl?: string | null;
  address?: string | null;
  description?: string | null;
  contactPerson?: string | null;
  responsibleEngineer?: string | null;
  storageQuotaMb: number;
  createdAt: string;
  updatedAt: string;
  _count?: {
    devices: number;
    subnets?: number;
    diagrams: number;
    documents: number;
    maintenanceRecords?: number;
  };
  diagrams?: DiagramItem[];
}

export interface Device {
  id: string;
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
  status: DeviceStatus;
  lastPingAt?: string | null;
  lastSeenAt?: string | null;
  lastLatencyMs?: number | null;
  consecutiveMisses?: number;
  monitorEnabled?: boolean;
  responsiblePerson?: string | null;
  remark?: string | null;
  createdAt: string;
  updatedAt: string;
  site?: { id: string; siteCode: string; siteName: string };
  switchDetail?: Record<string, unknown> | null;
  accessPointDetail?: Record<string, unknown> | null;
  apClientDetail?: Record<string, unknown> | null;
  controllerDetail?: Record<string, unknown> | null;
  serverDetail?: Record<string, unknown> | null;
}

export interface Subnet {
  id: string;
  siteId: string;
  vlanNumber?: number | null;
  cidr: string;
  networkAddress: string;
  subnetMask: string;
  broadcastAddress: string;
  gateway?: string | null;
  dns1?: string | null;
  dns2?: string | null;
  dhcpServer?: string | null;
  ipRangeStart: string;
  ipRangeEnd: string;
  totalHosts: number;
  description?: string | null;
  allocatedCount?: number;
  reservedCount?: number;
  availableCount?: number;
  utilizationPct?: number;
  site?: { id: string; siteCode: string; siteName: string };
  vlan?: { id: string; vlanId: number; name: string } | null;
}

export interface CredentialItem {
  id: string;
  siteId: string;
  deviceId?: string | null;
  deviceName: string;
  deviceModel?: string | null;
  managementIp?: string | null;
  loginType: LoginType;
  accessMethod?: string | null;
  port?: number | null;
  url?: string | null;
  remark?: string | null;
  passwordUpdatedAt: string;
  passwordExpiresAt?: string | null;
  usernameMasked: string;
  passwordMasked: string;
  site?: { id: string; siteCode: string; siteName: string };
  instructions?: Array<{
    id: string;
    title: string;
    howToConnect: string;
    steps: string[];
    notes?: string | null;
  }>;
}

export interface DiagramItem {
  id: string;
  siteId: string;
  title: string;
  description?: string | null;
  kind: 'EDITOR' | 'UPLOADED';
  fileFormat: 'JSON' | 'PNG' | 'JPG' | 'SVG' | 'PDF' | 'DRAWIO' | 'XML' | 'VSDX';
  currentVersion: number;
  canvasData?: {
    nodes?: unknown[];
    edges?: unknown[];
    backgroundImage?: string | null;
    backgroundColor?: string | null;
    backgroundOpacity?: number | null;
    backgroundFit?: 'contain' | 'cover' | 'fill' | null;
    backgroundWidth?: number | null;
    backgroundX?: number | null;
    backgroundY?: number | null;
    gridVariant?: 'dots' | 'lines' | 'cross' | 'none' | null;
  } | null;
  filePath?: string | null;
  previewSvgPath?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  updatedAt: string;
  site?: { id: string; siteCode: string; siteName: string };
  versions?: Array<{
    id: string;
    version: number;
    fileFormat: string;
    filePath?: string | null;
    changeNote?: string | null;
    createdAt: string;
    createdBy?: { username: string; fullName: string } | null;
  }>;
}

export interface DocumentItem {
  id: string;
  siteId: string;
  documentName: string;
  documentType: string;
  category: DocumentCategory;
  projectName?: string | null;
  description?: string | null;
  currentVersion: string;
  versionNumber: number;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  responsiblePerson?: string | null;
  remark?: string | null;
  createdAt: string;
  updatedAt: string;
  site?: { id: string; siteCode: string; siteName: string };
  uploadedBy?: { username: string; fullName: string } | null;
  versions?: Array<{
    id: string;
    versionNumber: number;
    versionLabel: string;
    originalFileName: string;
    fileSize: number;
    changeNote?: string | null;
    createdAt: string;
  }>;
}

export type AgentConnectionState = 'ONLINE' | 'OFFLINE' | 'NEVER_CONNECTED' | 'DISABLED';

export interface SiteAgent {
  id: string;
  siteId: string;
  name: string;
  tokenPrefix: string;
  isActive: boolean;
  pollIntervalSec: number;
  offlineThreshold: number;
  hostname?: string | null;
  localIp?: string | null;
  platform?: string | null;
  agentVersion?: string | null;
  lastHeartbeatAt?: string | null;
  lastReportSummary?: {
    total: number;
    up: number;
    down: number;
    ignored?: number;
    durationMs?: number | null;
    reportedAt?: string;
  } | null;
  connectionState: AgentConnectionState;
  createdAt: string;
  updatedAt: string;
  site?: { id: string; siteCode: string; siteName: string };
}

import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { Readable } from 'stream';
import { DeviceCategory, RoleCode } from '@prisma/client';

export interface ParsedSpreadsheet {
  headers: string[];
  rows: Record<string, string>[];
  suggestedMapping: Record<string, string>;
  detectedVlan?: string;
}

const CREDENTIAL_HEADER_ALIASES: Record<string, string[]> = {
  siteCode: ['site', 'site code', 'sitecode'],
  deviceName: ['device name', 'devicename', 'name', 'device', 'hostname'],
  deviceModel: ['device model', 'model'],
  managementIp: ['management ip', 'mgmt ip', 'ip', 'ip address', 'ipaddress'],
  loginType: ['login type', 'logintype', 'protocol', 'type'],
  username: ['username', 'user', 'login', 'account'],
  password: ['password', 'pass', 'pwd', 'secret'],
  port: ['port'],
  url: ['url', 'management url', 'link'],
  accessMethod: ['access method', 'method'],
  howToConnect: ['how to connect', 'connection method', 'instructions'],
  steps: ['steps', 'connection steps'],
  remark: ['remark', 'remarks', 'note', 'notes'],
};

const SITE_HEADER_ALIASES: Record<string, string[]> = {
  siteCode: ['site code', 'sitecode', 'code', 'site'],
  siteName: ['site name', 'sitename', 'name', 'facility', 'project name'],
  customerName: ['customer', 'customer name', 'client', 'company'],
  location: ['location', 'province', 'city', 'area'],
  googleMapUrl: ['google map', 'google map link', 'google maps', 'map url', 'map link', 'gps link'],
  address: ['address', 'full address'],
  contactPerson: ['contact', 'contact person', 'pic'],
  responsibleEngineer: ['engineer', 'responsible engineer', 'owner', 'responsible'],
  description: ['description', 'desc', 'remark', 'notes'],
};

const USER_HEADER_ALIASES: Record<string, string[]> = {
  username: ['username', 'user name', 'user', 'account', 'login', 'ชื่อผู้ใช้'],
  fullName: ['full name', 'fullname', 'name', 'display name', 'employee name', 'ชื่อ', 'ชื่อ-นามสกุล'],
  email: ['email', 'e-mail', 'mail', 'อีเมล'],
  password: ['password', 'pass', 'pwd', 'initial password', 'รหัสผ่าน'],
  roleCode: ['role', 'role code', 'rolecode', 'permission', 'position', 'สิทธิ์', 'ตำแหน่ง'],
  siteCodes: ['site', 'sites', 'site code', 'site codes', 'sitecodes', 'branch', 'สาขา', 'ไซต์'],
  isActive: ['status', 'active', 'is active', 'isactive', 'สถานะ'],
};

const HEADER_ALIASES: Record<string, string[]> = {
  site: ['site', 'site code', 'sitecode', 'site name', 'sitename', 'target site', 'branch', 'ไซต์', 'สาขา'],
  itemNo: ['no', 'no.', '#', 'seq', 'index'],
  category: ['type', 'category', 'device type', 'inventory type', 'equipment type', 'ประเภท'],
  name: ['name', 'device name', 'ap name', 'server name', 'hostname'],
  model: ['model', 'device model'],
  vendor: ['vendor', 'brand', 'manufacturer'],
  macAddress: ['mac', 'mac address', 'macaddress'],
  serialNumber: ['sn', 's/n', 'serial', 'serial number', 'serialnumber'],
  managementIp: ['ip', 'management ip', 'mgmt ip', 'ip address', 'ipaddress'],
  vlan: ['vlan', 'management vlan', 'mgmt vlan'],
  location: ['location', 'building', 'room', 'area'],
  rack: ['rack', 'cabinet'],
  floor: ['floor', 'level'],
  portCount: ['ports', 'port count', 'portcount'],
  firmwareVersion: ['firmware', 'firmware version', 'os version'],
  status: ['status', 'device status'],
  responsiblePerson: ['responsible', 'responsible person', 'owner', 'pic'],
  remark: ['remark', 'remarks', 'note', 'notes'],
  ssid: ['ssid'],
  channel: ['channel'],
  frequency: ['frequency', 'band'],
  controller: ['controller', 'wlc'],
  connectedAp: ['connected ap', 'ap'],
  wirelessMode: ['wireless mode', 'mode'],
  connectedDevice: ['connected device'],
  hostname: ['hostname'],
  operatingSystem: ['os', 'operating system'],
  productionIp: ['production ip', 'prod ip'],
  cpu: ['cpu'],
  ram: ['ram', 'memory'],
  storage: ['storage', 'disk'],
  hypervisor: ['hypervisor'],
  serviceApplication: ['service', 'application', 'service/application'],
};

function cellToString(val: ExcelJS.CellValue): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') {
    if ('text' in val && val.text !== undefined) return String(val.text).trim();
    if ('result' in val && val.result !== undefined) return String(val.result).trim();
    if ('richText' in val && Array.isArray(val.richText)) {
      return val.richText.map((r) => r.text).join('').trim();
    }
    if (val instanceof Date) return val.toISOString().slice(0, 10);
  }
  return String(val).trim();
}

export function detectHeaderMapping(headers: string[]): {
  suggestedMapping: Record<string, string>;
  detectedVlan?: string;
} {
  const suggestedMapping: Record<string, string> = {};
  let detectedVlan: string | undefined;

  for (const h of headers) {
    const lower = h.trim().toLowerCase();
    // Handle patterns like "IP(VLAN 1211)" or "IP (VLAN1211)"
    const vlanIpMatch = lower.match(/^ip\s*\(\s*vlan\s*(\d+)\s*\)$/i);
    if (vlanIpMatch) {
      suggestedMapping[h] = 'managementIp';
      detectedVlan = vlanIpMatch[1];
      continue;
    }

    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(lower)) {
        suggestedMapping[h] = field;
        break;
      }
    }
  }

  return { suggestedMapping, detectedVlan };
}

function mapHeadersByAliases(
  headers: string[],
  aliasesMap: Record<string, string[]>,
): Record<string, string> {
  const suggestedMapping: Record<string, string> = {};
  for (const h of headers) {
    const lower = h.trim().toLowerCase();
    for (const [field, aliases] of Object.entries(aliasesMap)) {
      if (aliases.includes(lower)) {
        suggestedMapping[h] = field;
        break;
      }
    }
  }
  return suggestedMapping;
}

export function detectCredentialHeaderMapping(headers: string[]): Record<string, string> {
  return mapHeadersByAliases(headers, CREDENTIAL_HEADER_ALIASES);
}

export function detectSiteHeaderMapping(headers: string[]): Record<string, string> {
  return mapHeadersByAliases(headers, SITE_HEADER_ALIASES);
}

export function detectUserHeaderMapping(headers: string[]): Record<string, string> {
  return mapHeadersByAliases(headers, USER_HEADER_ALIASES);
}

export function normalizeUserRole(
  rawValue?: string | null,
  fallback?: RoleCode,
): RoleCode | null {
  const cleaned = (rawValue || '').trim();
  if (!cleaned) return fallback ?? null;

  const upper = cleaned.toUpperCase().replace(/[\s-]+/g, '_');
  if (upper in RoleCode) {
    return upper as RoleCode;
  }

  const lower = cleaned.toLowerCase();
  if (lower.includes('super')) return RoleCode.SUPER_ADMIN;
  if (lower.includes('site admin') || lower === 'admin' || lower === 'administrator') {
    return RoleCode.SITE_ADMIN;
  }
  if (lower.includes('network') || lower.includes('engineer')) {
    return RoleCode.NETWORK_ENGINEER;
  }
  if (lower.includes('ip viewer') || lower.includes('ip_viewer') || lower.includes('ip only')) {
    return RoleCode.IP_VIEWER;
  }
  if (lower.includes('viewer') || lower.includes('read')) {
    return RoleCode.VIEWER;
  }
  return null;
}

function decodeCsvBufferToUtf8(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(buffer.subarray(3));
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buffer.subarray(2)).replace(/^\uFEFF/, '');
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buffer.subarray(2)).replace(/^\uFEFF/, '');
  }

  try {
    const utf8Text = new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '');
    if (
      !/[\u0E00-\u0E7F\u3000-\u9FFF]/.test(utf8Text) &&
      /[\u0080-\u024F]/.test(utf8Text)
    ) {
      const win874Text = new TextDecoder('windows-874').decode(buffer).replace(/^\uFEFF/, '');
      if (/[\u0E01-\u0E5B]/.test(win874Text)) {
        return win874Text;
      }
    }
    return utf8Text;
  } catch {
    // Thai Excel CSV exports use Windows-874 / TIS-620 by default instead of UTF-8
    return new TextDecoder('windows-874').decode(buffer).replace(/^\uFEFF/, '');
  }
}

async function extractWorksheetTable(
  buffer: Buffer,
  filename: string,
): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const workbook = new ExcelJS.Workbook();
  const ext = filename.toLowerCase().split('.').pop();

  if (ext === 'csv') {
    const utf8Csv = decodeCsvBufferToUtf8(buffer);
    const stream = Readable.from(Buffer.from(utf8Csv, 'utf8'));
    await workbook.csv.read(stream);
  } else {
    // Load xlsx / xls-compatible XML workbook
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('Spreadsheet contains no worksheets');
  }

  const headers: string[] = [];
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const label = cellToString(cell.value);
    if (label) {
      headers[colNumber - 1] = label;
    }
  });

  // Fill gaps if any empty header columns exist
  const cleanHeaders = headers.map((h, i) => h || `Column_${i + 1}`);
  const rows: Record<string, string>[] = [];

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: Record<string, string> = {};
    let hasValue = false;
    cleanHeaders.forEach((header, idx) => {
      const val = cellToString(row.getCell(idx + 1).value);
      obj[header] = val;
      if (val !== '') hasValue = true;
    });
    if (hasValue) rows.push(obj);
  });

  return { headers: cleanHeaders, rows };
}

export async function parseSpreadsheetBuffer(
  buffer: Buffer,
  filename: string,
): Promise<ParsedSpreadsheet> {
  const { headers, rows } = await extractWorksheetTable(buffer, filename);
  const { suggestedMapping, detectedVlan } = detectHeaderMapping(headers);
  return {
    headers,
    rows,
    suggestedMapping,
    detectedVlan,
  };
}

export async function parseCredentialSpreadsheetBuffer(
  buffer: Buffer,
  filename: string,
): Promise<ParsedSpreadsheet> {
  const { headers, rows } = await extractWorksheetTable(buffer, filename);
  const suggestedMapping = detectCredentialHeaderMapping(headers);
  return {
    headers,
    rows,
    suggestedMapping,
  };
}

export async function parseSiteSpreadsheetBuffer(
  buffer: Buffer,
  filename: string,
): Promise<ParsedSpreadsheet> {
  const { headers, rows } = await extractWorksheetTable(buffer, filename);
  const suggestedMapping = detectSiteHeaderMapping(headers);
  return {
    headers,
    rows,
    suggestedMapping,
  };
}

export async function parseUsersSpreadsheetBuffer(
  buffer: Buffer,
  filename: string,
): Promise<ParsedSpreadsheet> {
  const { headers, rows } = await extractWorksheetTable(buffer, filename);
  const suggestedMapping = detectUserHeaderMapping(headers);
  return {
    headers,
    rows,
    suggestedMapping,
  };
}

const SAMPLE_USERS_TEMPLATE_ROWS = [
  {
    username: 'somchai.n',
    fullName: 'Somchai Network',
    email: 'somchai.n@company.com',
    password: 'NimsUser#2026!',
    roleCode: 'NETWORK_ENGINEER',
    siteCodes: 'AAI, AMW',
    isActive: 'ACTIVE',
  },
  {
    username: 'suda.admin',
    fullName: 'Suda SiteAdmin',
    email: 'suda.a@company.com',
    password: 'NimsAdmin#2026!',
    roleCode: 'SITE_ADMIN',
    siteCodes: 'ALL',
    isActive: 'ACTIVE',
  },
  {
    username: 'viewer.demo',
    fullName: 'Read-Only Viewer',
    email: 'viewer.demo@company.com',
    password: 'NimsViewer#2026!',
    roleCode: 'VIEWER',
    siteCodes: 'AAI',
    isActive: 'ACTIVE',
  },
  {
    username: 'ipam.guest',
    fullName: 'IPAM Only Viewer',
    email: 'ipam.guest@company.com',
    password: 'NimsIpView#2026!',
    roleCode: 'IP_VIEWER',
    siteCodes: 'AAI',
    isActive: 'ACTIVE',
  },
];

export async function buildSampleUsersExcelBuffer(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NIMS - AUTOMOTIONWORKS';
  wb.created = new Date();

  const sheet = wb.addWorksheet('Users Import');
  sheet.columns = [
    { header: 'Username', key: 'username', width: 20 },
    { header: 'Full Name', key: 'fullName', width: 26 },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Password', key: 'password', width: 20 },
    { header: 'Role', key: 'roleCode', width: 20 },
    { header: 'Site Codes', key: 'siteCodes', width: 22 },
    { header: 'Status', key: 'isActive', width: 12 },
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F2942' },
  };
  for (const r of SAMPLE_USERS_TEMPLATE_ROWS) {
    sheet.addRow(r);
  }

  const guide = wb.addWorksheet('Valid Roles');
  guide.columns = [
    { header: 'Role Code', key: 'code', width: 22 },
    { header: 'Description', key: 'desc', width: 48 },
  ];
  guide.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  guide.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E40AF' },
  };
  [
    { code: 'SUPER_ADMIN', desc: 'Full unrestricted access across all sites and RBAC' },
    { code: 'SITE_ADMIN', desc: 'Full management + credentials for assigned sites' },
    { code: 'NETWORK_ENGINEER', desc: 'Edit inventory, diagrams, IPAM, docs & maintenance' },
    { code: 'VIEWER', desc: 'Read-only access to assigned sites' },
    { code: 'IP_VIEWER', desc: 'IPAM & basic read-only access (no credentials access)' },
  ].forEach((r) => guide.addRow(r));

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export function buildSampleUsersCsv(): string {
  const headers = ['Username', 'Full Name', 'Email', 'Password', 'Role', 'Site Codes', 'Status'];
  const lines = [headers.join(',')];
  for (const r of SAMPLE_USERS_TEMPLATE_ROWS) {
    lines.push(
      [r.username, r.fullName, r.email, r.password, r.roleCode, r.siteCodes, r.isActive]
        .map(escapeCsvValue)
        .join(','),
    );
  }
  return '\uFEFF' + lines.join('\r\n');
}

export interface ExportDeviceRow {
  itemNo: number | null;
  siteCode: string;
  category: DeviceCategory;
  name: string;
  model: string | null;
  vendor: string | null;
  macAddress: string | null;
  serialNumber: string | null;
  managementIp: string | null;
  vlan: string | null;
  location: string | null;
  status: string;
  responsiblePerson: string | null;
  remark: string | null;
}

export async function buildInventoryExcelBuffer(rows: ExportDeviceRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NIMS - Network Infrastructure Management System';
  wb.created = new Date();

  const sheet = wb.addWorksheet('Device Inventory');
  sheet.columns = [
    { header: 'No.', key: 'itemNo', width: 8 },
    { header: 'Site', key: 'siteCode', width: 14 },
    { header: 'Type', key: 'category', width: 16 },
    { header: 'Device Name', key: 'name', width: 26 },
    { header: 'Model', key: 'model', width: 22 },
    { header: 'Vendor', key: 'vendor', width: 16 },
    { header: 'MAC Address', key: 'macAddress', width: 20 },
    { header: 'Serial Number', key: 'serialNumber', width: 22 },
    { header: 'Management IP', key: 'managementIp', width: 18 },
    { header: 'VLAN', key: 'vlan', width: 10 },
    { header: 'Location', key: 'location', width: 22 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Responsible Person', key: 'responsiblePerson', width: 20 },
    { header: 'Remark', key: 'remark', width: 30 },
  ];

  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F2942' },
  };

  rows.forEach((r, idx) => {
    sheet.addRow({
      itemNo: r.itemNo ?? idx + 1,
      siteCode: r.siteCode,
      category: r.category,
      name: r.name,
      model: r.model ?? '',
      vendor: r.vendor ?? '',
      macAddress: r.macAddress ?? '',
      serialNumber: r.serialNumber ?? '',
      managementIp: r.managementIp ?? '',
      vlan: r.vlan ?? '',
      location: r.location ?? '',
      status: r.status,
      responsiblePerson: r.responsiblePerson ?? '',
      remark: r.remark ?? '',
    });
  });

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

function escapeCsvValue(val: string | number | null | undefined): string {
  const s = val === null || val === undefined ? '' : String(val);
  // Neutralize spreadsheet formula injection while preserving plain display values
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  if (safe.includes(',') || safe.includes('"') || safe.includes('\n') || safe.includes('\r')) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function buildInventoryCsv(rows: ExportDeviceRow[]): string {
  const headers = [
    'No.',
    'Site',
    'Type',
    'Device Name',
    'Model',
    'Vendor',
    'MAC Address',
    'Serial Number',
    'Management IP',
    'VLAN',
    'Location',
    'Status',
    'Responsible Person',
    'Remark',
  ];

  const lines = [headers.join(',')];
  rows.forEach((r, idx) => {
    lines.push(
      [
        r.itemNo ?? idx + 1,
        r.siteCode,
        r.category,
        r.name,
        r.model,
        r.vendor,
        r.macAddress,
        r.serialNumber,
        r.managementIp,
        r.vlan,
        r.location,
        r.status,
        r.responsiblePerson,
        r.remark,
      ]
        .map(escapeCsvValue)
        .join(','),
    );
  });

  return '\uFEFF' + lines.join('\r\n');
}

const CATEGORY_SYNONYMS: Array<{ patterns: string[]; category: DeviceCategory }> = [
  {
    patterns: ['ap_client', 'ap client', 'ap-client', 'wireless client', 'wireless bridge', 'cpe', 'bridge'],
    category: DeviceCategory.AP_CLIENT,
  },
  {
    patterns: ['access_point', 'access point', 'access-point', 'wifi ap', 'wireless ap', 'ap'],
    category: DeviceCategory.ACCESS_POINT,
  },
  {
    patterns: ['ip_cam', 'ip cam', 'ip-cam', 'ipcam', 'ip camera', 'ipcamera', 'cctv', 'camera', 'cam'],
    category: DeviceCategory.IP_CAM,
  },
  {
    patterns: ['plc', 'programmable logic controller', 'plc controller'],
    category: DeviceCategory.PLC,
  },
  {
    patterns: ['wlc', 'wireless controller', 'controller', 'ac controller'],
    category: DeviceCategory.WLC,
  },
  {
    patterns: ['switch', 'sw', 'core switch', 'l2 switch', 'l3 switch', 'distribution switch'],
    category: DeviceCategory.SWITCH,
  },
  {
    patterns: ['esxi', 'vmware', 'vmware esxi', 'hypervisor'],
    category: DeviceCategory.ESXI,
  },
  {
    patterns: ['vm', 'virtual machine', 'guest vm'],
    category: DeviceCategory.VM,
  },
  {
    patterns: ['server', 'svr', 'physical server', 'rack server'],
    category: DeviceCategory.SERVER,
  },
  {
    patterns: ['nas', 'nas storage', 'storage', 'synology', 'qnap'],
    category: DeviceCategory.NAS,
  },
  {
    patterns: ['ups', 'backup power', 'power supply'],
    category: DeviceCategory.UPS,
  },
  {
    patterns: ['nvr', 'nvr recorder', 'network video recorder', 'dvr'],
    category: DeviceCategory.NVR,
  },
  {
    patterns: ['pc', 'workstation', 'desktop', 'computer', 'client pc', 'operator pc'],
    category: DeviceCategory.PC,
  },
  {
    patterns: ['tv', 'smart tv', 'television', 'tv display', 'tv dashboard', 'digital signage'],
    category: DeviceCategory.TV,
  },
  {
    patterns: ['printer', 'label printer', 'network printer', 'zebra', 'เครื่องพิมพ์'],
    category: DeviceCategory.PRINTER,
  },
  {
    patterns: ['barcode', 'barcode scanner', 'barcode reader', 'scanner', 'บาร์โค้ด', 'เครื่องสแกน'],
    category: DeviceCategory.BARCODE,
  },
];

export function normalizeDeviceCategory(
  rawValue?: string | null,
  fallback?: DeviceCategory,
): DeviceCategory | null {
  const cleaned = (rawValue || '').trim();
  if (!cleaned) return fallback ?? null;

  const upper = cleaned.toUpperCase().replace(/[\s-]+/g, '_');
  if (upper in DeviceCategory) {
    return upper as DeviceCategory;
  }

  const lower = cleaned.toLowerCase();
  for (const entry of CATEGORY_SYNONYMS) {
    if (entry.patterns.some((p) => lower === p || lower.includes(`(${p})`) || lower.startsWith(`${p} `) || lower.endsWith(` ${p}`))) {
      return entry.category;
    }
  }
  return null;
}

export interface SampleDeviceTemplateRow {
  itemNo: number;
  category: DeviceCategory;
  name: string;
  model: string;
  vendor: string;
  macAddress: string;
  serialNumber: string;
  managementIp: string;
  vlan: string;
  location: string;
  status: string;
  responsiblePerson: string;
  remark: string;
}

export const SAMPLE_INVENTORY_TEMPLATE_ROWS: SampleDeviceTemplateRow[] = [
  {
    itemNo: 1,
    category: DeviceCategory.SWITCH,
    name: 'CORE-SW-01',
    model: 'RG-NBS5200-24GT4XS',
    vendor: 'Ruijie',
    macAddress: 'AA:BB:CC:11:22:01',
    serialNumber: 'SN-SW-0001',
    managementIp: '192.168.10.1',
    vlan: '10',
    location: 'Server Room Rack A',
    status: 'ONLINE',
    responsiblePerson: 'Network Team',
    remark: 'Core Distribution Switch',
  },
  {
    itemNo: 2,
    category: DeviceCategory.ACCESS_POINT,
    name: 'AP-ZONE-A-01',
    model: 'RG-AP820-L(V3)',
    vendor: 'Ruijie',
    macAddress: 'AA:BB:CC:11:22:02',
    serialNumber: 'SN-AP-0002',
    managementIp: '192.168.10.21',
    vlan: '20',
    location: 'Warehouse Zone A',
    status: 'ONLINE',
    responsiblePerson: 'Network Team',
    remark: 'Indoor Wi-Fi Access Point',
  },
  {
    itemNo: 3,
    category: DeviceCategory.AP_CLIENT,
    name: 'CPE-SRM-01',
    model: 'CPE210',
    vendor: 'TP-Link',
    macAddress: 'AA:BB:CC:11:22:03',
    serialNumber: 'SN-APC-0003',
    managementIp: '192.168.10.31',
    vlan: '20',
    location: 'Crane SRM-01',
    status: 'ONLINE',
    responsiblePerson: 'Automation Team',
    remark: 'Wireless Client / Bridge',
  },
  {
    itemNo: 4,
    category: DeviceCategory.WLC,
    name: 'WLC-MAIN-01',
    model: 'RG-WS6008',
    vendor: 'Ruijie',
    macAddress: 'AA:BB:CC:11:22:04',
    serialNumber: 'SN-WLC-0004',
    managementIp: '192.168.10.5',
    vlan: '10',
    location: 'Server Room Rack A',
    status: 'ONLINE',
    responsiblePerson: 'Network Team',
    remark: 'Wireless LAN Controller',
  },
  {
    itemNo: 5,
    category: DeviceCategory.SERVER,
    name: 'SVR-WCS-01',
    model: 'PowerEdge R750',
    vendor: 'Dell',
    macAddress: 'AA:BB:CC:11:22:05',
    serialNumber: 'SN-SVR-0005',
    managementIp: '192.168.10.50',
    vlan: '10',
    location: 'Server Room Rack B',
    status: 'ONLINE',
    responsiblePerson: 'System Team',
    remark: 'Application / WCS Server',
  },
  {
    itemNo: 6,
    category: DeviceCategory.PLC,
    name: 'PLC-CONVEYOR-01',
    model: 'Q06UDEHCPU',
    vendor: 'Mitsubishi',
    macAddress: 'AA:BB:CC:11:22:06',
    serialNumber: 'SN-PLC-0006',
    managementIp: '192.168.30.10',
    vlan: '30',
    location: 'Conveyor Line 1',
    status: 'ONLINE',
    responsiblePerson: 'Automation Team',
    remark: 'Industrial PLC Controller',
  },
  {
    itemNo: 7,
    category: DeviceCategory.ESXI,
    name: 'ESXI-HOST-01',
    model: 'ProLiant DL380 Gen10',
    vendor: 'HPE',
    macAddress: 'AA:BB:CC:11:22:07',
    serialNumber: 'SN-ESXI-0007',
    managementIp: '192.168.10.60',
    vlan: '10',
    location: 'Server Room Rack B',
    status: 'ONLINE',
    responsiblePerson: 'System Team',
    remark: 'VMware ESXi Hypervisor',
  },
  {
    itemNo: 8,
    category: DeviceCategory.VM,
    name: 'VM-NIMS-01',
    model: 'Ubuntu 22.04 LTS',
    vendor: 'VMware',
    macAddress: 'AA:BB:CC:11:22:08',
    serialNumber: 'VM-0008',
    managementIp: '192.168.10.61',
    vlan: '10',
    location: 'Hosted on ESXI-HOST-01',
    status: 'ONLINE',
    responsiblePerson: 'System Team',
    remark: 'Virtual Machine',
  },
  {
    itemNo: 9,
    category: DeviceCategory.NAS,
    name: 'NAS-BACKUP-01',
    model: 'RS1221+',
    vendor: 'Synology',
    macAddress: 'AA:BB:CC:11:22:09',
    serialNumber: 'SN-NAS-0009',
    managementIp: '192.168.10.70',
    vlan: '10',
    location: 'Server Room Rack B',
    status: 'ONLINE',
    responsiblePerson: 'System Team',
    remark: 'Network Storage & Backup',
  },
  {
    itemNo: 10,
    category: DeviceCategory.UPS,
    name: 'UPS-RACK-A',
    model: 'Smart-UPS 3000VA',
    vendor: 'APC',
    macAddress: 'AA:BB:CC:11:22:10',
    serialNumber: 'SN-UPS-0010',
    managementIp: '192.168.10.80',
    vlan: '10',
    location: 'Server Room Rack A',
    status: 'ONLINE',
    responsiblePerson: 'Facility Team',
    remark: 'Backup Power Supply',
  },
  {
    itemNo: 11,
    category: DeviceCategory.IP_CAM,
    name: 'CAM-GATE-01',
    model: 'DS-2CD2143G2-I',
    vendor: 'Hikvision',
    macAddress: 'AA:BB:CC:11:22:11',
    serialNumber: 'SN-CAM-0011',
    managementIp: '192.168.40.101',
    vlan: '40',
    location: 'Loading Dock Gate 1',
    status: 'ONLINE',
    responsiblePerson: 'Security / IT',
    remark: 'CCTV IP Camera',
  },
  {
    itemNo: 12,
    category: DeviceCategory.PC,
    name: 'PC-OPERATOR-01',
    model: 'OptiPlex 7010',
    vendor: 'Dell',
    macAddress: 'AA:BB:CC:11:22:12',
    serialNumber: 'SN-PC-0012',
    managementIp: '192.168.50.10',
    vlan: '50',
    location: 'Control Room Desk 1',
    status: 'ONLINE',
    responsiblePerson: 'Operation / IT',
    remark: 'Operator Workstation PC',
  },
  {
    itemNo: 13,
    category: DeviceCategory.NVR,
    name: 'NVR-CCTV-01',
    model: 'DS-9632NI-M8',
    vendor: 'Hikvision',
    macAddress: 'AA:BB:CC:11:22:13',
    serialNumber: 'SN-NVR-0013',
    managementIp: '192.168.40.10',
    vlan: '40',
    location: 'Server Room Rack B',
    status: 'ONLINE',
    responsiblePerson: 'Security / IT',
    remark: '32-Ch Network Video Recorder',
  },
  {
    itemNo: 14,
    category: DeviceCategory.TV,
    name: 'TV-DASHBOARD-01',
    model: 'UA55CU7000K',
    vendor: 'Samsung',
    macAddress: 'AA:BB:CC:11:22:14',
    serialNumber: 'SN-TV-0014',
    managementIp: '192.168.50.20',
    vlan: '50',
    location: 'Control Room Wall 1',
    status: 'ONLINE',
    responsiblePerson: 'Operation / IT',
    remark: 'Dashboard Display Smart TV',
  },
  {
    itemNo: 15,
    category: DeviceCategory.PRINTER,
    name: 'PRT-LABEL-01',
    model: 'ZT411',
    vendor: 'Zebra',
    macAddress: 'AA:BB:CC:11:22:15',
    serialNumber: 'SN-PRT-0015',
    managementIp: '192.168.50.30',
    vlan: '50',
    location: 'Packing Line 1',
    status: 'ONLINE',
    responsiblePerson: 'Operation / IT',
    remark: 'Industrial Label Printer',
  },
  {
    itemNo: 16,
    category: DeviceCategory.BARCODE,
    name: 'BCS-GATE-01',
    model: 'DataMan 280',
    vendor: 'Cognex',
    macAddress: 'AA:BB:CC:11:22:16',
    serialNumber: 'SN-BCS-0016',
    managementIp: '192.168.50.40',
    vlan: '50',
    location: 'Conveyor Inbound',
    status: 'ONLINE',
    responsiblePerson: 'Automation Team',
    remark: 'Fixed Network Barcode Reader',
  },
];

export async function buildSampleInventoryExcelBuffer(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NIMS - Network Infrastructure Management System';
  wb.created = new Date();

  const sheet = wb.addWorksheet('Device Import Template');
  sheet.columns = [
    { header: 'Site', key: 'site', width: 14 },
    { header: 'No.', key: 'itemNo', width: 7 },
    { header: 'Type', key: 'category', width: 16 },
    { header: 'Device Name', key: 'name', width: 22 },
    { header: 'Model', key: 'model', width: 22 },
    { header: 'Vendor', key: 'vendor', width: 14 },
    { header: 'MAC Address', key: 'macAddress', width: 20 },
    { header: 'Serial Number', key: 'serialNumber', width: 18 },
    { header: 'Management IP', key: 'managementIp', width: 18 },
    { header: 'VLAN', key: 'vlan', width: 10 },
    { header: 'Location', key: 'location', width: 24 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Responsible Person', key: 'responsiblePerson', width: 18 },
    { header: 'Remark', key: 'remark', width: 28 },
  ];

  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F2942' },
  };

  for (const r of SAMPLE_INVENTORY_TEMPLATE_ROWS) {
    sheet.addRow({ site: '', ...r });
  }

  const guide = wb.addWorksheet('Valid Device Types');
  guide.columns = [
    { header: 'Type Code (Recommended)', key: 'code', width: 22 },
    { header: 'Display Name', key: 'label', width: 28 },
    { header: 'Accepted Aliases in "Type" Column', key: 'aliases', width: 48 },
  ];
  guide.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  guide.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E40AF' },
  };
  [
    { code: 'SWITCH', label: 'Network Switch', aliases: 'SWITCH, SW, Switch, L2 Switch, L3 Switch' },
    { code: 'ACCESS_POINT', label: 'Access Point', aliases: 'ACCESS_POINT, AP, Access Point, WiFi AP' },
    { code: 'AP_CLIENT', label: 'AP Client / Wireless Bridge', aliases: 'AP_CLIENT, AP Client, Bridge, Wireless Bridge, CPE' },
    { code: 'WLC', label: 'Wireless Controller (WLC)', aliases: 'WLC, Controller, Wireless Controller' },
    { code: 'SERVER', label: 'Server', aliases: 'SERVER, Server, SVR' },
    { code: 'PLC', label: 'PLC / Industrial Controller', aliases: 'PLC' },
    { code: 'ESXI', label: 'VMware ESXi Host', aliases: 'ESXI, ESXi, VMware, Hypervisor' },
    { code: 'VM', label: 'Virtual Machine (VM)', aliases: 'VM, Virtual Machine' },
    { code: 'NAS', label: 'NAS Storage', aliases: 'NAS, Storage, NAS Storage' },
    { code: 'UPS', label: 'UPS / Backup Power', aliases: 'UPS, Backup Power' },
    { code: 'IP_CAM', label: 'IP Camera (CCTV)', aliases: 'IP_CAM, IP Cam, IP Camera, CCTV, Camera' },
    { code: 'PC', label: 'PC / Workstation', aliases: 'PC, Workstation, Desktop, Computer' },
    { code: 'NVR', label: 'NVR Recorder', aliases: 'NVR, NVR Recorder, Network Video Recorder' },
    { code: 'TV', label: 'TV / Display', aliases: 'TV, Smart TV, Television, TV Dashboard' },
    { code: 'PRINTER', label: 'Printer', aliases: 'PRINTER, Printer, Label Printer, Zebra' },
    { code: 'BARCODE', label: 'Barcode Scanner', aliases: 'BARCODE, Barcode Scanner, Barcode Reader, Scanner' },
  ].forEach((row) => guide.addRow(row));

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export function buildSampleInventoryCsv(): string {
  const headers = [
    'Site',
    'No.',
    'Type',
    'Device Name',
    'Model',
    'Vendor',
    'MAC Address',
    'Serial Number',
    'Management IP',
    'VLAN',
    'Location',
    'Status',
    'Responsible Person',
    'Remark',
  ];
  const lines = [headers.join(',')];
  for (const r of SAMPLE_INVENTORY_TEMPLATE_ROWS) {
    lines.push(
      [
        '',
        r.itemNo,
        r.category,
        r.name,
        r.model,
        r.vendor,
        r.macAddress,
        r.serialNumber,
        r.managementIp,
        r.vlan,
        r.location,
        r.status,
        r.responsiblePerson,
        r.remark,
      ]
        .map(escapeCsvValue)
        .join(','),
    );
  }
  return '\uFEFF' + lines.join('\r\n');
}

export interface ExportSiteRow {
  siteCode: string;
  siteName: string;
  customerName: string | null;
  location: string | null;
  googleMapUrl: string | null;
  address: string | null;
  contactPerson: string | null;
  responsibleEngineer: string | null;
  description: string | null;
}

export async function buildSitesExcelBuffer(rows: ExportSiteRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NIMS - Network Infrastructure Management System';
  wb.created = new Date();

  const sheet = wb.addWorksheet('Sites');
  sheet.columns = [
    { header: 'Site Code', key: 'siteCode', width: 14 },
    { header: 'Site Name', key: 'siteName', width: 26 },
    { header: 'Customer Name', key: 'customerName', width: 22 },
    { header: 'Location', key: 'location', width: 20 },
    { header: 'Google Map Link', key: 'googleMapUrl', width: 34 },
    { header: 'Address', key: 'address', width: 32 },
    { header: 'Contact Person', key: 'contactPerson', width: 20 },
    { header: 'Responsible Engineer', key: 'responsibleEngineer', width: 22 },
    { header: 'Description', key: 'description', width: 32 },
  ];

  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F2942' },
  };

  rows.forEach((r) => {
    sheet.addRow({
      siteCode: r.siteCode,
      siteName: r.siteName,
      customerName: r.customerName ?? '',
      location: r.location ?? '',
      googleMapUrl: r.googleMapUrl ?? '',
      address: r.address ?? '',
      contactPerson: r.contactPerson ?? '',
      responsibleEngineer: r.responsibleEngineer ?? '',
      description: r.description ?? '',
    });
  });

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export function buildSitesCsv(rows: ExportSiteRow[]): string {
  const headers = [
    'Site Code',
    'Site Name',
    'Customer Name',
    'Location',
    'Google Map Link',
    'Address',
    'Contact Person',
    'Responsible Engineer',
    'Description',
  ];

  const lines = [headers.join(',')];
  rows.forEach((r) => {
    lines.push(
      [
        r.siteCode,
        r.siteName,
        r.customerName,
        r.location,
        r.googleMapUrl,
        r.address,
        r.contactPerson,
        r.responsibleEngineer,
        r.description,
      ]
        .map(escapeCsvValue)
        .join(','),
    );
  });

  return '\uFEFF' + lines.join('\r\n');
}

export interface ExportCredentialRow {
  siteCode: string;
  deviceName: string;
  deviceModel: string | null;
  managementIp: string | null;
  loginType: string;
  username: string;
  password: string;
  port: number | null;
  url: string | null;
  accessMethod: string | null;
  howToConnect: string | null;
  steps: string | null;
  remark: string | null;
}

export async function buildCredentialsExcelBuffer(
  rows: ExportCredentialRow[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NIMS - Network Infrastructure Management System';
  wb.created = new Date();

  const sheet = wb.addWorksheet('Access Management');
  sheet.columns = [
    { header: 'Site', key: 'siteCode', width: 14 },
    { header: 'Device Name', key: 'deviceName', width: 24 },
    { header: 'Device Model', key: 'deviceModel', width: 20 },
    { header: 'Management IP', key: 'managementIp', width: 18 },
    { header: 'Login Type', key: 'loginType', width: 14 },
    { header: 'Username', key: 'username', width: 20 },
    { header: 'Password', key: 'password', width: 22 },
    { header: 'Port', key: 'port', width: 10 },
    { header: 'Management URL', key: 'url', width: 28 },
    { header: 'Access Method', key: 'accessMethod', width: 20 },
    { header: 'How To Connect', key: 'howToConnect', width: 32 },
    { header: 'Connection Steps', key: 'steps', width: 34 },
    { header: 'Remark', key: 'remark', width: 26 },
  ];

  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F2942' },
  };

  rows.forEach((r) => {
    sheet.addRow({
      siteCode: r.siteCode,
      deviceName: r.deviceName,
      deviceModel: r.deviceModel ?? '',
      managementIp: r.managementIp ?? '',
      loginType: r.loginType,
      username: r.username,
      password: r.password,
      port: r.port ?? '',
      url: r.url ?? '',
      accessMethod: r.accessMethod ?? '',
      howToConnect: r.howToConnect ?? '',
      steps: r.steps ?? '',
      remark: r.remark ?? '',
    });
  });

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export function buildCredentialsCsv(rows: ExportCredentialRow[]): string {
  const headers = [
    'Site',
    'Device Name',
    'Device Model',
    'Management IP',
    'Login Type',
    'Username',
    'Password',
    'Port',
    'Management URL',
    'Access Method',
    'How To Connect',
    'Connection Steps',
    'Remark',
  ];

  const lines = [headers.join(',')];
  rows.forEach((r) => {
    lines.push(
      [
        r.siteCode,
        r.deviceName,
        r.deviceModel,
        r.managementIp,
        r.loginType,
        r.username,
        r.password,
        r.port,
        r.url,
        r.accessMethod,
        r.howToConnect,
        r.steps,
        r.remark,
      ]
        .map(escapeCsvValue)
        .join(','),
    );
  });

  return '\uFEFF' + lines.join('\r\n');
}

export async function buildInventoryPdfBuffer(
  rows: ExportDeviceRow[],
  title = 'NIMS Device Inventory Report',
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ layout: 'landscape', size: 'A4', margin: 30 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).fillColor('#0f2942').text(title, { align: 'left' });
    doc
      .fontSize(9)
      .fillColor('#64748b')
      .text(`Generated: ${new Date().toISOString()} | Total Devices: ${rows.length}`);
    doc.moveDown(0.8);

    const colWidths = [28, 55, 72, 115, 95, 95, 85, 42, 95, 65];
    const headers = [
      'No',
      'Site',
      'Type',
      'Device Name',
      'Model',
      'MAC Address',
      'Mgmt IP',
      'VLAN',
      'Location',
      'Status',
    ];

    const drawRow = (cells: string[], y: number, isHeader = false) => {
      let x = 30;
      if (isHeader) {
        doc.rect(30, y - 3, colWidths.reduce((a, b) => a + b, 0), 18).fill('#0f2942');
        doc.fillColor('#ffffff').fontSize(8);
      } else {
        doc.fillColor('#0f172a').fontSize(7.5);
      }
      cells.forEach((cell, i) => {
        doc.text(cell.slice(0, 24), x + 3, y, { width: colWidths[i] - 6, ellipsis: true });
        x += colWidths[i];
      });
    };

    let y = doc.y;
    drawRow(headers, y, true);
    y += 20;

    rows.forEach((r, idx) => {
      if (y > 540) {
        doc.addPage({ layout: 'landscape', size: 'A4', margin: 30 });
        y = 35;
        drawRow(headers, y, true);
        y += 20;
      }
      drawRow(
        [
          String(r.itemNo ?? idx + 1),
          r.siteCode,
          r.category,
          r.name,
          r.model ?? '-',
          r.macAddress ?? '-',
          r.managementIp ?? '-',
          r.vlan ?? '-',
          r.location ?? '-',
          r.status,
        ],
        y,
      );
      y += 16;
    });

    doc.end();
  });
}

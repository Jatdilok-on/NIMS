import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import archiver from 'archiver';
import { DeviceCategory, DeviceStatus, RoleCode } from '@prisma/client';
import { decryptSecret, encryptSecret, hashPassword, hashToken, verifyPassword } from '../lib/crypto';
import {
  canManageSiteAgents,
  computeAgentConnectionState,
  evaluateDevicePingOutcome,
  generateAgentTokenPair,
  isDeviceMonitoredByLiveAgent,
} from '../lib/agentService';
import {
  enumerateBlock24Hosts,
  isIpInCidr,
  isValidIpv4,
  normalizeMacAddress,
  parseCidr,
  parseVlanNumber,
} from '../lib/ipam';
import { mapDiagramTypeToDeviceCategory, pickBestSubnetForDevice } from '../lib/deviceService';
import { sanitizeAuditDetails } from '../lib/audit';
import {
  buildCredentialsCsv,
  buildCredentialsExcelBuffer,
  buildInventoryCsv,
  buildInventoryExcelBuffer,
  buildInventoryPdfBuffer,
  buildSampleUsersExcelBuffer,
  buildSitesCsv,
  buildSitesExcelBuffer,
  normalizeUserRole,
  parseCredentialSpreadsheetBuffer,
  parseSiteSpreadsheetBuffer,
  parseSpreadsheetBuffer,
  parseUsersSpreadsheetBuffer,
} from '../lib/excel';
import {
  convertVsdxToSvg,
  exportReactFlowToDrawioXml,
  parseDrawioToReactFlow,
} from '../lib/visio';

describe('AES-256-GCM Credentials Vault & Password Hashing', () => {
  it('encrypts and decrypts credentials cleanly without plaintext exposure', () => {
    const secret = 'Super$ecretNetPassword!2026';
    const encrypted = encryptSecret(secret);
    expect(encrypted).not.toContain(secret);
    expect(encrypted.startsWith('v1:')).toBe(true);
    expect(decryptSecret(encrypted)).toBe(secret);
  });

  it('fails decryption on tampered ciphertext or wrong key', () => {
    const encrypted = encryptSecret('admin-pass');
    const wrongKey = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    expect(() => decryptSecret(encrypted, wrongKey)).toThrow();

    const parts = encrypted.split(':');
    parts[3] = Buffer.from('tampered').toString('base64');
    expect(() => decryptSecret(parts.join(':'))).toThrow();
  });

  it('hashes and verifies user login passwords with bcrypt', async () => {
    const hash = await hashPassword('NimsStrongPass#99');
    expect(hash).not.toBe('NimsStrongPass#99');
    expect(await verifyPassword('NimsStrongPass#99', hash)).toBe(true);
    expect(await verifyPassword('WrongPass', hash)).toBe(false);
  });
});

describe('IPAM CIDR Math & MAC Normalization', () => {
  it('computes BTV VLAN 1211 subnet 172.28.7.0/24 accurately', () => {
    const info = parseCidr('172.28.7.0/24');
    expect(info.networkAddress).toBe('172.28.7.0');
    expect(info.subnetMask).toBe('255.255.255.0');
    expect(info.broadcastAddress).toBe('172.28.7.255');
    expect(info.ipRangeStart).toBe('172.28.7.1');
    expect(info.ipRangeEnd).toBe('172.28.7.254');
    expect(info.totalHosts).toBe(254);
    expect(isIpInCidr('172.28.7.254', info.cidr)).toBe(true);
    expect(isIpInCidr('172.28.8.1', info.cidr)).toBe(false);
  });

  it('validates IPv4 and normalizes MAC addresses across formats', () => {
    expect(isValidIpv4('172.28.7.10')).toBe(true);
    expect(isValidIpv4('172.28.7.300')).toBe(false);
    expect(normalizeMacAddress('aa-bb-cc-dd-ee-ff')).toBe('AA:BB:CC:DD:EE:FF');
    expect(normalizeMacAddress('0011.2233.4455')).toBe('00:11:22:33:44:55');
    expect(() => normalizeMacAddress('invalid-mac')).toThrow();
  });

  it('slices large /16 subnets by /24 block and matches devices by VLAN + longest prefix', () => {
    expect(parseVlanNumber('10')).toBe(10);
    expect(parseVlanNumber('VLAN 1211')).toBe(1211);
    expect(parseVlanNumber('untagged')).toBeNull();

    const block110 = enumerateBlock24Hosts('191.20.0.0/16', '191.20.110');
    expect(block110.blockCidr).toBe('191.20.110.0/24');
    expect(block110.ips).toContain('191.20.110.2');
    expect(block110.ips.length).toBe(256);

    const subnets = [
      { id: 's-16', cidr: '191.20.0.0/16', vlanNumber: 10, gateway: '191.20.5.1' },
      { id: 's-24-v20', cidr: '191.20.110.0/24', vlanNumber: 20, gateway: null },
      { id: 's-24-v10', cidr: '191.20.110.0/24', vlanNumber: 10, gateway: null },
    ];
    expect(pickBestSubnetForDevice(subnets, '191.20.110.2', '10')?.id).toBe('s-24-v10');
    expect(pickBestSubnetForDevice(subnets, '191.20.110.2', '20')?.id).toBe('s-24-v20');
    expect(pickBestSubnetForDevice(subnets, '191.20.5.50', '10')?.id).toBe('s-16');
    expect(pickBestSubnetForDevice(subnets, '191.20.5.50', '99')).toBeUndefined();

    expect(mapDiagramTypeToDeviceCategory('plc')).toBe(DeviceCategory.PLC);
    expect(mapDiagramTypeToDeviceCategory('esxi')).toBe(DeviceCategory.ESXI);
    expect(mapDiagramTypeToDeviceCategory('vm')).toBe(DeviceCategory.VM);
    expect(mapDiagramTypeToDeviceCategory('nas')).toBe(DeviceCategory.NAS);
    expect(mapDiagramTypeToDeviceCategory('ups')).toBe(DeviceCategory.UPS);
    expect(mapDiagramTypeToDeviceCategory('plc', 'SERVER')).toBe(DeviceCategory.SERVER);
    expect(mapDiagramTypeToDeviceCategory('access_point')).toBe(DeviceCategory.ACCESS_POINT);
    expect(mapDiagramTypeToDeviceCategory('wireless_bridge')).toBe(DeviceCategory.AP_CLIENT);
    expect(mapDiagramTypeToDeviceCategory('server')).toBe(DeviceCategory.SERVER);
  });
});

describe('Audit Log Secret Sanitization', () => {
  it('redacts password and secret keys recursively', () => {
    const sanitized = sanitizeAuditDetails({
      username: 'engineer1',
      password: 'plaintext-should-never-appear',
      nested: {
        secret: 'topsecret',
        device: 'BTV-SW-01',
      },
    }) as Record<string, unknown>;

    expect(sanitized.username).toBe('engineer1');
    expect(sanitized.password).toBe('[REDACTED]');
    expect((sanitized.nested as Record<string, unknown>).secret).toBe('[REDACTED]');
    expect((sanitized.nested as Record<string, unknown>).device).toBe('BTV-SW-01');
  });
});

describe('Excel Import/Export & PDF Export', () => {
  it('parses legacy Excel columns including IP(VLAN 1211)', async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Building (SW)');
    sheet.addRow(['No.', 'Model', 'MAC', 'SN', 'NAME', 'Location', 'IP(VLAN 1211)']);
    sheet.addRow([1, 'Cisco C9200L-48P', 'aa-bb-cc-11-22-33', 'SN123456', 'BTV-SW-CORE-01', 'Server Room', '172.28.7.10']);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    const parsed = await parseSpreadsheetBuffer(buf, 'btv_switches.xlsx');
    expect(parsed.detectedVlan).toBe('1211');
    expect(parsed.suggestedMapping['IP(VLAN 1211)']).toBe('managementIp');
    expect(parsed.suggestedMapping['NAME']).toBe('name');
    expect(parsed.suggestedMapping['SN']).toBe('serialNumber');
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]['NAME']).toBe('BTV-SW-CORE-01');
  });

  it('generates XLSX, CSV, and PDF exports cleanly without credentials', async () => {
    const rows = [
      {
        itemNo: 1,
        siteCode: 'BTV',
        category: DeviceCategory.SWITCH,
        name: 'BTV-SW-01',
        model: 'Aruba 6200F',
        vendor: 'Aruba',
        macAddress: 'AA:BB:CC:DD:EE:01',
        serialNumber: 'SN0001',
        managementIp: '172.28.7.11',
        vlan: '1211',
        location: 'Floor 1 Rack A',
        status: DeviceStatus.ONLINE,
        responsiblePerson: 'Somchai',
        remark: 'Core Access',
      },
    ];

    const xlsx = await buildInventoryExcelBuffer(rows);
    expect(xlsx.length).toBeGreaterThan(1000);

    const csv = buildInventoryCsv(rows);
    expect(csv).toContain('BTV-SW-01');
    expect(csv).toContain('172.28.7.11');

    const pdf = await buildInventoryPdfBuffer(rows);
    expect(pdf.subarray(0, 4).toString('utf8')).toBe('%PDF');
  });

  it('round-trips Access Mgmt credentials through Excel & CSV export/import parsing', async () => {
    const creds = [
      {
        siteCode: 'AMW',
        deviceName: 'AMW-CORE-SW',
        deviceModel: 'Catalyst 9300',
        managementIp: '191.20.110.2',
        loginType: 'SSH',
        username: 'netadmin',
        password: 'P@ssword#2026',
        port: 22,
        url: 'https://191.20.110.2',
        accessMethod: 'Jump Host -> SSH',
        howToConnect: 'Connect VPN first',
        steps: '1. VPN\n2. SSH',
        remark: 'Core Switch',
      },
    ];

    const xlsx = await buildCredentialsExcelBuffer(creds);
    const parsed = await parseCredentialSpreadsheetBuffer(xlsx, 'access-mgmt.xlsx');
    expect(parsed.suggestedMapping['Device Name']).toBe('deviceName');
    expect(parsed.suggestedMapping['Username']).toBe('username');
    expect(parsed.suggestedMapping['Password']).toBe('password');
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]['Device Name']).toBe('AMW-CORE-SW');
    expect(parsed.rows[0]['Password']).toBe('P@ssword#2026');

    const csv = buildCredentialsCsv(creds);
    expect(csv).toContain('AMW-CORE-SW');
    expect(csv).toContain('netadmin');
  });

  it('round-trips Sites with Google Map links through Excel & CSV export/import parsing', async () => {
    const sites = [
      {
        siteCode: 'BKK01',
        siteName: 'Bangkok HQ',
        customerName: 'Internal',
        location: 'Bangkok, Thailand',
        googleMapUrl: 'https://maps.google.com/?q=13.7563,100.5018',
        address: '123 Sukhumvit Rd',
        contactPerson: 'Somchai',
        responsibleEngineer: 'Network Team',
        description: 'Main DC',
      },
    ];

    const xlsx = await buildSitesExcelBuffer(sites);
    const parsed = await parseSiteSpreadsheetBuffer(xlsx, 'sites.xlsx');
    expect(parsed.suggestedMapping['Site Code']).toBe('siteCode');
    expect(parsed.suggestedMapping['Site Name']).toBe('siteName');
    expect(parsed.suggestedMapping['Google Map Link']).toBe('googleMapUrl');
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]['Site Code']).toBe('BKK01');
    expect(parsed.rows[0]['Google Map Link']).toBe('https://maps.google.com/?q=13.7563,100.5018');

    const csv = buildSitesCsv(sites);
    expect(csv).toContain('BKK01');
    expect(csv).toContain('https://maps.google.com/?q=13.7563,100.5018');
  });

  it('decodes Windows-874 (TIS-620) Thai CSV files cleanly without replacement characters', async () => {
    // Encode Thai text "เครื่อง CNC ปั๊ม" in Windows-874 bytes (as saved by Excel CSV in Thailand)
    // เ(E0) ค(A4) ร(C3) ื(D7) ่(E8) อ(CD) ง(A7) " CNC " ป(BB) ั(D1) ๊(EA) ม(C1)
    const thaiBytes = Buffer.from([
      0xe0, 0xa4, 0xc3, 0xd7, 0xe8, 0xcd, 0xa7, 0x20, 0x43, 0x4e, 0x43, 0x20, 0xbb, 0xd1, 0xea, 0xc1,
    ]);
    const header = Buffer.from('Site,Type,Device Name,Management IP,Location\r\n', 'ascii');
    const rowPrefix = Buffer.from('AMW-SERVER,PLC,', 'ascii');
    const rowSuffix = Buffer.from(',191.20.110.169,Zone A\r\n', 'ascii');
    const win874Csv = Buffer.concat([header, rowPrefix, thaiBytes, rowSuffix]);

    const parsed = await parseSpreadsheetBuffer(win874Csv, 'thai-devices.csv');
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]['Device Name']).toBe('เครื่อง CNC ปั๊ม');
    expect(parsed.rows[0]['Device Name']).not.toContain('\uFFFD');
  });

  it('parses Users import template and normalizes RBAC roles cleanly', async () => {
    const xlsx = await buildSampleUsersExcelBuffer();
    const parsed = await parseUsersSpreadsheetBuffer(xlsx, 'users.xlsx');
    expect(parsed.suggestedMapping['Username']).toBe('username');
    expect(parsed.suggestedMapping['Role']).toBe('roleCode');
    expect(parsed.suggestedMapping['Site Codes']).toBe('siteCodes');
    expect(parsed.rows.length).toBeGreaterThanOrEqual(4);

    expect(normalizeUserRole('Network Engineer')).toBe(RoleCode.NETWORK_ENGINEER);
    expect(normalizeUserRole('Site Admin')).toBe(RoleCode.SITE_ADMIN);
    expect(normalizeUserRole('IP Viewer')).toBe(RoleCode.IP_VIEWER);
    expect(normalizeUserRole('Viewer')).toBe(RoleCode.VIEWER);
  });
});

describe('Diagram Engine (Draw.io & Visio Conversion)', () => {
  it('round-trips React Flow nodes & edges to Draw.io XML and back', () => {
    const xml = exportReactFlowToDrawioXml(
      'BTV Core Topology',
      [
        {
          id: 'sw1',
          position: { x: 100, y: 120 },
          data: { label: 'BTV-SW-CORE', ipAddress: '172.28.7.1' },
        },
        {
          id: 'ap1',
          position: { x: 350, y: 120 },
          data: { label: 'BTV-AP-01', ipAddress: '172.28.7.50' },
        },
      ],
      [
        {
          id: 'e1',
          source: 'sw1',
          target: 'ap1',
          data: { sourcePort: 'GE0/0/1', targetPort: 'ETH0', vlan: '1211', speed: '1G', color: '#2563eb' },
        },
      ],
    );
    expect(xml).toContain('<mxfile');
    const parsed = parseDrawioToReactFlow(xml);
    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.edges).toHaveLength(1);
    expect(parsed.edges[0].data?.label).toContain('GE0/0/1');
  });

  it('converts a .vsdx OOXML archive to an SVG preview', async () => {
    const vsdxBuffer = await new Promise<Buffer>((resolve, reject) => {
      const archive = archiver('zip');
      const chunks: Buffer[] = [];
      archive.on('data', (c) => chunks.push(c));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);
      archive.append(
        `<?xml version="1.0" encoding="UTF-8"?>
        <PageContents>
          <Shapes>
            <Shape ID="1">
              <Cell N="PinX" V="3"/>
              <Cell N="PinY" V="4"/>
              <Cell N="Width" V="1.5"/>
              <Cell N="Height" V="0.8"/>
              <Text>Core Switch</Text>
            </Shape>
          </Shapes>
        </PageContents>`,
        { name: 'visio/pages/page1.xml' },
      );
      archive.finalize();
    });

    const svg = await convertVsdxToSvg(vsdxBuffer);
    expect(svg).toContain('<svg');
    expect(svg).toContain('Core Switch');
  });
});

describe('Site Agent Ping Evaluation & Token Helpers', () => {
  it('generates prefixed tokens whose hash matches hashToken()', () => {
    const pair = generateAgentTokenPair();
    expect(pair.rawToken.startsWith('nims_agt_')).toBe(true);
    expect(pair.tokenPrefix).toBe(pair.rawToken.slice(0, 16));
    expect(pair.tokenHash).toBe(hashToken(pair.rawToken));
  });

  it('computes agent connection state accurately from heartbeat cadence', () => {
    const now = new Date('2026-11-17T06:00:00Z');
    expect(
      computeAgentConnectionState({ isActive: false, pollIntervalSec: 60, lastHeartbeatAt: now }, now),
    ).toBe('DISABLED');
    expect(
      computeAgentConnectionState({ isActive: true, pollIntervalSec: 60, lastHeartbeatAt: null }, now),
    ).toBe('NEVER_CONNECTED');
    expect(
      computeAgentConnectionState(
        { isActive: true, pollIntervalSec: 60, lastHeartbeatAt: new Date(now.getTime() - 120_000) },
        now,
      ),
    ).toBe('ONLINE');
    expect(
      computeAgentConnectionState(
        { isActive: true, pollIntervalSec: 60, lastHeartbeatAt: new Date(now.getTime() - 240_000) },
        now,
      ),
    ).toBe('OFFLINE');
  });

  it('requires consecutive misses >= offlineThreshold before flipping to OFFLINE and protects MAINTENANCE', () => {
    const now = new Date('2026-11-17T06:00:00Z');
    const miss1 = evaluateDevicePingOutcome({
      currentStatus: DeviceStatus.ONLINE,
      currentMisses: 0,
      alive: false,
      latencyMs: null,
      offlineThreshold: 3,
      now,
    });
    expect(miss1.nextStatus).toBe(DeviceStatus.ONLINE);
    expect(miss1.nextMisses).toBe(1);
    expect(miss1.statusChanged).toBe(false);

    const miss3 = evaluateDevicePingOutcome({
      currentStatus: DeviceStatus.ONLINE,
      currentMisses: 2,
      alive: false,
      latencyMs: null,
      offlineThreshold: 3,
      now,
    });
    expect(miss3.nextStatus).toBe(DeviceStatus.OFFLINE);
    expect(miss3.nextMisses).toBe(3);
    expect(miss3.statusChanged).toBe(true);

    const recovered = evaluateDevicePingOutcome({
      currentStatus: DeviceStatus.OFFLINE,
      currentMisses: 3,
      alive: true,
      latencyMs: 4,
      offlineThreshold: 3,
      now,
    });
    expect(recovered.nextStatus).toBe(DeviceStatus.ONLINE);
    expect(recovered.nextMisses).toBe(0);
    expect(recovered.lastLatencyMs).toBe(4);
    expect(recovered.statusChanged).toBe(true);

    const maintProtected = evaluateDevicePingOutcome({
      currentStatus: DeviceStatus.MAINTENANCE,
      currentMisses: 0,
      alive: false,
      latencyMs: null,
      offlineThreshold: 1,
      now,
    });
    expect(maintProtected.nextStatus).toBe(DeviceStatus.MAINTENANCE);
    expect(maintProtected.statusChanged).toBe(false);
  });

  it('restricts site agent management to SUPER_ADMIN and assigned SITE_ADMIN only', () => {
    expect(
      canManageSiteAgents({ roleCode: RoleCode.SUPER_ADMIN, sitePermissions: [] }, 'site-amw'),
    ).toBe(true);
    expect(
      canManageSiteAgents(
        { roleCode: RoleCode.SITE_ADMIN, sitePermissions: [{ siteId: 'site-amw' }] },
        'site-amw',
      ),
    ).toBe(true);
    expect(
      canManageSiteAgents(
        { roleCode: RoleCode.SITE_ADMIN, sitePermissions: [{ siteId: 'site-amw' }] },
        'site-other',
      ),
    ).toBe(false);
    expect(
      canManageSiteAgents(
        { roleCode: RoleCode.NETWORK_ENGINEER, sitePermissions: [{ siteId: 'site-amw' }] },
        'site-amw',
      ),
    ).toBe(false);
    expect(
      canManageSiteAgents(
        { roleCode: RoleCode.VIEWER, sitePermissions: [{ siteId: 'site-amw' }] },
        'site-amw',
      ),
    ).toBe(false);
    expect(
      canManageSiteAgents(
        { roleCode: RoleCode.IP_VIEWER, sitePermissions: [{ siteId: 'site-amw' }] },
        'site-amw',
      ),
    ).toBe(false);
  });

  it('flags devices as agentLive only when their site has an active live agent and valid IP', () => {
    const liveSites = new Set(['site-amw']);
    expect(
      isDeviceMonitoredByLiveAgent(
        { siteId: 'site-amw', managementIp: '191.20.110.5', monitorEnabled: true },
        liveSites,
      ),
    ).toBe(true);
    expect(
      isDeviceMonitoredByLiveAgent(
        { siteId: 'site-amw', managementIp: '191.20.110.5', monitorEnabled: undefined },
        liveSites,
      ),
    ).toBe(true);
    expect(
      isDeviceMonitoredByLiveAgent(
        { siteId: 'site-amw', managementIp: '191.20.110.5', monitorEnabled: false },
        liveSites,
      ),
    ).toBe(false);
    expect(
      isDeviceMonitoredByLiveAgent(
        { siteId: 'site-amw', managementIp: null, monitorEnabled: true },
        liveSites,
      ),
    ).toBe(false);
    expect(
      isDeviceMonitoredByLiveAgent(
        { siteId: 'site-other', managementIp: '191.20.110.5', monitorEnabled: true },
        liveSites,
      ),
    ).toBe(false);
  });
});

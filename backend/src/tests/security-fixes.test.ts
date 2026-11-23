import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { DeviceCategory, RoleCode } from '@prisma/client';
import { env } from '../config/env';
import { hashToken } from '../lib/crypto';
import { prisma } from '../lib/prisma';
import { createApp } from '../app';
import {
  ALLOWED_LOGO_EXTENSIONS,
  isAllowedExtension,
  resolveSafeMimeType,
} from '../lib/storage';
import {
  buildInventoryCsv,
  normalizeDeviceCategory,
  parseSpreadsheetBuffer,
} from '../lib/excel';
import { isHostIpInCidr } from '../lib/ipam';
import ExcelJS from 'exceljs';

function mockSessionLookup(opts: {
  userId: string;
  roleCode: RoleCode;
  mustChangePassword?: boolean;
  sitePermissions?: Array<Record<string, unknown>>;
}) {
  const rawJwt = jwt.sign(
    { sub: opts.userId, sid: `sess-${opts.userId}`, role: opts.roleCode },
    env.jwtSecret,
    { expiresIn: '1h' },
  );

  const sessionSpy = vi.spyOn(prisma.session, 'findUnique').mockResolvedValue({
    id: `sess-${opts.userId}`,
    userId: opts.userId,
    tokenHash: hashToken(rawJwt),
    ipAddress: '127.0.0.1',
    userAgent: 'vitest',
    expiresAt: new Date(Date.now() + 3600_000),
    revokedAt: null,
    createdAt: new Date(),
    user: {
      id: opts.userId,
      username: `user-${opts.userId}`,
      email: `${opts.userId}@nims.local`,
      fullName: 'Test User',
      passwordHash: 'hash',
      roleId: `role-${opts.roleCode}`,
      mustChangePassword: Boolean(opts.mustChangePassword),
      isActive: true,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      role: {
        id: `role-${opts.roleCode}`,
        code: opts.roleCode,
        name: opts.roleCode,
        description: null,
        isSystem: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      sitePermissions: opts.sitePermissions ?? [],
    },
  } as never);

  return { rawJwt, sessionSpy };
}

describe('Security Hardening & API Regression Tests', () => {
  it('blocks cookie-authenticated mutating requests even when a dummy Bearer header is sent without CSRF', async () => {
    const app = createApp();
    const { rawJwt, sessionSpy } = mockSessionLookup({
      userId: 'csrf-admin',
      roleCode: RoleCode.SUPER_ADMIN,
    });

    const res = await request(app)
      .post('/api/devices/bulk-edit')
      .set('Cookie', [`nims_session=${rawJwt}`, 'nims_csrf=valid-csrf'])
      .set('Authorization', 'Bearer dummy-bypass-attempt')
      .send({ deviceIds: ['d1'] });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/CSRF/i);
    sessionSpy.mockRestore();
  });

  it('enforces mustChangePassword before accessing operational API routes', async () => {
    const app = createApp();
    const { rawJwt, sessionSpy } = mockSessionLookup({
      userId: 'temp-user',
      roleCode: RoleCode.SUPER_ADMIN,
      mustChangePassword: true,
    });

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${rawJwt}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.mustChangePassword).toBe(true);

    const blockedRes = await request(app)
      .get('/api/sites')
      .set('Authorization', `Bearer ${rawJwt}`);
    expect(blockedRes.status).toBe(403);
    expect(blockedRes.body.code).toBe('MUST_CHANGE_PASSWORD');

    sessionSpy.mockRestore();
  });

  it('prevents SITE_ADMIN from reading audit logs of unauthorized sites via ?siteId=', async () => {
    const app = createApp();
    const { rawJwt, sessionSpy } = mockSessionLookup({
      userId: 'site-admin-1',
      roleCode: RoleCode.SITE_ADMIN,
      sitePermissions: [
        {
          id: 'perm-1',
          userId: 'site-admin-1',
          siteId: 'site-btv',
          canViewInventory: true,
          canEditInventory: true,
          canViewDiagram: true,
          canEditDiagram: true,
          canViewIpam: true,
          canEditIpam: true,
          canViewDocuments: true,
          canEditDocuments: true,
          canDeleteDocuments: true,
          canViewCredentials: true,
          canEditCredentials: true,
          canViewMaintenance: true,
          canEditMaintenance: true,
          canManageSite: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    const res = await request(app)
      .get('/api/audit-logs?siteId=site-secret-other')
      .set('Authorization', `Bearer ${rawJwt}`);

    expect(res.status).toBe(403);
    sessionSpy.mockRestore();
  });

  it('scopes global-search subnets strictly by canViewIpam instead of canViewInventory', async () => {
    const app = createApp();
    const { rawJwt, sessionSpy } = mockSessionLookup({
      userId: 'inv-only-user',
      roleCode: RoleCode.VIEWER,
      sitePermissions: [
        {
          id: 'perm-inv',
          userId: 'inv-only-user',
          siteId: 'site-btv',
          canViewInventory: true,
          canEditInventory: false,
          canViewDiagram: false,
          canEditDiagram: false,
          canViewIpam: false,
          canEditIpam: false,
          canViewDocuments: false,
          canEditDocuments: false,
          canDeleteDocuments: false,
          canViewCredentials: false,
          canEditCredentials: false,
          canViewMaintenance: false,
          canEditMaintenance: false,
          canManageSite: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    const devSpy = vi.spyOn(prisma.device, 'findMany').mockResolvedValue([] as never);
    const subSpy = vi.spyOn(prisma.subnet, 'findMany').mockResolvedValue([] as never);

    const res = await request(app)
      .get('/api/devices/global-search?q=192.168')
      .set('Authorization', `Bearer ${rawJwt}`);

    expect(res.status).toBe(200);
    expect(devSpy).toHaveBeenCalledTimes(1);
    expect(subSpy).not.toHaveBeenCalled();

    devSpy.mockRestore();
    subSpy.mockRestore();
    sessionSpy.mockRestore();
  });

  it('returns 400 instead of 500 for malformed JSON on /api/diagrams/parse-import', async () => {
    const app = createApp();
    const { rawJwt, sessionSpy } = mockSessionLookup({
      userId: 'diagram-user',
      roleCode: RoleCode.SUPER_ADMIN,
    });

    const res = await request(app)
      .post('/api/diagrams/parse-import')
      .set('Authorization', `Bearer ${rawJwt}`)
      .attach('file', Buffer.from('{bad-json', 'utf8'), 'broken.json');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/JSON/i);
    sessionSpy.mockRestore();
  });

  it('derives safe MIME types from file extensions and restricts logo uploads to raster images', () => {
    expect(resolveSafeMimeType('config.xml')).toBe('text/plain; charset=utf-8');
    expect(resolveSafeMimeType('notes.txt')).toBe('text/plain; charset=utf-8');
    expect(resolveSafeMimeType('report.pdf')).toBe('application/pdf');
    expect(isAllowedExtension('logo.png', ALLOWED_LOGO_EXTENSIONS)).toBe(true);
    expect(isAllowedExtension('logo.svg', ALLOWED_LOGO_EXTENSIONS)).toBe(false);
    expect(isAllowedExtension('payload.html', ALLOWED_LOGO_EXTENSIONS)).toBe(false);
  });

  it('neutralizes CSV formula injection and resolves PLC Controller / Storage Server categories accurately', () => {
    const csv = buildInventoryCsv([
      {
        itemNo: 1,
        siteCode: 'BTV',
        category: DeviceCategory.SWITCH,
        name: '=CMD("calc")',
        model: '+SUM(1,2)',
        vendor: '@evil',
        macAddress: null,
        serialNumber: null,
        managementIp: '10.0.0.1',
        vlan: null,
        location: null,
        status: 'ONLINE',
        responsiblePerson: null,
        remark: null,
      },
    ]);

    expect(csv).toContain("'=CMD");
    expect(csv).toContain("'+SUM");
    expect(csv).toContain("'@evil");

    expect(normalizeDeviceCategory('PLC Controller')).toBe(DeviceCategory.PLC);
    expect(normalizeDeviceCategory('Storage Server')).toBe(DeviceCategory.SERVER);
    expect(normalizeDeviceCategory('Handheld Terminal')).toBe(DeviceCategory.HANDHELD);
    expect(normalizeDeviceCategory('Hardheld')).toBe(DeviceCategory.HANDHELD);
    expect(normalizeDeviceCategory('PDA')).toBe(DeviceCategory.HANDHELD);
  });

  it('excludes network and broadcast addresses from host IP allocation checks for <= /30', () => {
    expect(isHostIpInCidr('192.168.10.0', '192.168.10.0/24')).toBe(false);
    expect(isHostIpInCidr('192.168.10.255', '192.168.10.0/24')).toBe(false);
    expect(isHostIpInCidr('192.168.10.1', '192.168.10.0/24')).toBe(true);
    expect(isHostIpInCidr('192.168.10.254', '192.168.10.0/24')).toBe(true);
    expect(isHostIpInCidr('10.0.0.0', '10.0.0.0/31')).toBe(true);
    expect(isHostIpInCidr('10.0.0.5', '10.0.0.5/32')).toBe(true);
  });

  it('preserves columns accurately when Excel worksheet has an empty Column A header', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Devices');
    ws.getCell('B1').value = 'Device Name';
    ws.getCell('C1').value = 'Management IP';
    ws.getCell('B2').value = 'CORE-SW-01';
    ws.getCell('C2').value = '10.20.30.1';
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    const parsed = await parseSpreadsheetBuffer(buf, 'sparse-col-a.xlsx');
    expect(parsed.headers).toEqual(['Column_1', 'Device Name', 'Management IP']);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]['Device Name']).toBe('CORE-SW-01');
    expect(parsed.rows[0]['Management IP']).toBe('10.20.30.1');
  });

  it('returns 400 on non-numeric diagram version restore and records audit log on monitoring toggle', async () => {
    const app = createApp();
    const { rawJwt, sessionSpy } = mockSessionLookup({
      userId: 'diag-admin',
      roleCode: RoleCode.SUPER_ADMIN,
    });

    const diagSpy = vi.spyOn(prisma.diagram, 'findUnique').mockResolvedValue({
      id: 'diag-1',
      siteId: 'site-1',
      title: 'Test Topology',
      currentVersion: 2,
      site: { siteCode: 'BTV' },
    } as never);

    const badVerRes = await request(app)
      .post('/api/diagrams/diag-1/restore/not-a-number')
      .set('Authorization', `Bearer ${rawJwt}`);
    expect(badVerRes.status).toBe(400);

    const devSpy = vi.spyOn(prisma.device, 'findUnique').mockResolvedValue({
      id: 'dev-1',
      siteId: 'site-1',
      name: 'SW-01',
      site: { id: 'site-1', siteCode: 'BTV' },
    } as never);
    const devUpdateSpy = vi.spyOn(prisma.device, 'update').mockResolvedValue({
      id: 'dev-1',
      name: 'SW-01',
      monitorEnabled: false,
    } as never);
    const auditSpy = vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as never);

    const monRes = await request(app)
      .patch('/api/agents/devices/dev-1/monitoring')
      .set('Authorization', `Bearer ${rawJwt}`)
      .send({ monitorEnabled: false });

    expect(monRes.status).toBe(200);
    expect(auditSpy).toHaveBeenCalledTimes(1);

    diagSpy.mockRestore();
    devSpy.mockRestore();
    devUpdateSpy.mockRestore();
    auditSpy.mockRestore();
    sessionSpy.mockRestore();
  });

  it('rejects javascript: URLs during credential bulk import and neutralizes leading-space CSV formulas', async () => {
    const csvWithSpaces = buildInventoryCsv([
      {
        itemNo: 1,
        siteCode: 'BTV',
        category: 'HANDHELD',
        name: ' =HYPERLINK("http://evil")',
        model: 'MC9300',
        vendor: 'Zebra',
        macAddress: null,
        serialNumber: null,
        managementIp: '10.0.0.5',
        vlan: null,
        location: null,
        status: 'ONLINE',
        responsiblePerson: null,
        remark: null,
      },
    ]);
    expect(csvWithSpaces).toContain("' =HYPERLINK");

    const app = createApp();
    const { rawJwt, sessionSpy } = mockSessionLookup({
      userId: 'cred-admin',
      roleCode: RoleCode.SUPER_ADMIN,
    });
    const siteSpy = vi.spyOn(prisma.site, 'findUnique').mockResolvedValue({
      id: 'site-1',
      siteCode: 'BTV',
    } as never);
    const credFindSpy = vi.spyOn(prisma.credential, 'findMany').mockResolvedValue([] as never);
    const devFindSpy = vi.spyOn(prisma.device, 'findMany').mockResolvedValue([] as never);
    const credCreateSpy = vi.spyOn(prisma.credential, 'create');

    const res = await request(app)
      .post('/api/credentials/import/confirm')
      .set('Authorization', `Bearer ${rawJwt}`)
      .send({
        siteId: 'site-1',
        columnMapping: {
          Device: 'deviceName',
          User: 'username',
          Pass: 'password',
          URL: 'url',
        },
        rows: [
          {
            Device: 'CORE-SW-01',
            User: 'admin',
            Pass: 'Secret123!',
            URL: 'javascript:alert(1)',
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.importedCount).toBe(0);
    expect(res.body.errorCount).toBe(1);
    expect(res.body.errors[0].error).toMatch(/http:\/\/ or https:\/\//i);
    expect(credCreateSpy).not.toHaveBeenCalled();

    credCreateSpy.mockRestore();
    devFindSpy.mockRestore();
    credFindSpy.mockRestore();
    siteSpy.mockRestore();
    sessionSpy.mockRestore();
  });

  it('allows SUPER_ADMIN to delete/prune backups, blocks deleting RUNNING backups, and enforces DB/files selection', async () => {
    const app = createApp();

    // Non-SUPER_ADMIN denied
    const siteAdminSess = mockSessionLookup({
      userId: 'sa-1',
      roleCode: RoleCode.SITE_ADMIN,
    });
    const deniedRes = await request(app)
      .delete('/api/backups/bk-1')
      .set('Authorization', `Bearer ${siteAdminSess.rawJwt}`);
    expect(deniedRes.status).toBe(403);
    siteAdminSess.sessionSpy.mockRestore();

    const superSess = mockSessionLookup({
      userId: 'super-bk',
      roleCode: RoleCode.SUPER_ADMIN,
    });

    // Reject empty backup scope
    const emptyScopeRes = await request(app)
      .post('/api/backups/run')
      .set('Authorization', `Bearer ${superSess.rawJwt}`)
      .send({ includesDb: false, includesFiles: false });
    expect(emptyScopeRes.status).toBe(400);

    // Block deleting RUNNING backup
    const findBackupSpy = vi.spyOn(prisma.backupJob, 'findUnique').mockResolvedValue({
      id: 'bk-running',
      status: 'RUNNING',
      fileName: 'running.zip',
      filePath: '',
      fileSize: 0,
    } as never);
    const runningDelRes = await request(app)
      .delete('/api/backups/bk-running')
      .set('Authorization', `Bearer ${superSess.rawJwt}`);
    expect(runningDelRes.status).toBe(409);

    // Allow deleting completed backup record
    const settingSpy = vi
      .spyOn(prisma.systemSetting, 'findUnique')
      .mockResolvedValue({ backupLocation: './backups', backupRetentionCount: 5, auditRetentionDays: 365 } as never);
    findBackupSpy.mockResolvedValue({
      id: 'bk-done',
      status: 'COMPLETED',
      fileName: 'nims-backup-old.zip',
      filePath: '',
      fileSize: 2048,
    } as never);
    const deleteBackupSpy = vi.spyOn(prisma.backupJob, 'delete').mockResolvedValue({} as never);
    const delOkRes = await request(app)
      .delete('/api/backups/bk-done')
      .set('Authorization', `Bearer ${superSess.rawJwt}`);
    expect(delOkRes.status).toBe(200);
    expect(delOkRes.body.deletedId).toBe('bk-done');

    // Prune endpoint succeeds cleanly
    const findManyBackupSpy = vi.spyOn(prisma.backupJob, 'findMany').mockResolvedValue([] as never);
    const delManyAuditSpy = vi
      .spyOn(prisma.auditLog, 'deleteMany')
      .mockResolvedValue({ count: 7 } as never);
    const pruneRes = await request(app)
      .post('/api/backups/prune')
      .set('Authorization', `Bearer ${superSess.rawJwt}`)
      .send({ includeAuditLogs: true });
    expect(pruneRes.status).toBe(200);
    expect(pruneRes.body.deletedAuditLogs).toBe(7);

    delManyAuditSpy.mockRestore();
    findManyBackupSpy.mockRestore();
    deleteBackupSpy.mockRestore();
    settingSpy.mockRestore();
    findBackupSpy.mockRestore();
    superSess.sessionSpy.mockRestore();
  });
});

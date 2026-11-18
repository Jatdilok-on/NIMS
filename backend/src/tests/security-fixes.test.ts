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
import { buildInventoryCsv, normalizeDeviceCategory } from '../lib/excel';

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
  });
});

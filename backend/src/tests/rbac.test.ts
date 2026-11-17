import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { RoleCode } from '@prisma/client';
import { hasSitePermission, getPermittedSiteIds } from '../middleware/rbac';
import { AuthenticatedUser } from '../middleware/auth';
import { resolveSafeStoragePath } from '../lib/storage';
import { env } from '../config/env';
import { hashToken } from '../lib/crypto';
import { prisma } from '../lib/prisma';
import { createApp } from '../app';

function makeUser(
  roleCode: RoleCode,
  siteId = 'site-btv',
  overrides: Partial<AuthenticatedUser['sitePermissions'][0]> = {},
): AuthenticatedUser {
  return {
    id: 'user-1',
    username: `test-${roleCode.toLowerCase()}`,
    email: 'test@nims.local',
    fullName: 'Test User',
    roleCode,
    roleName: roleCode,
    mustChangePassword: false,
    sessionId: 'sess-1',
    sitePermissions: [
      {
        id: 'perm-1',
        userId: 'user-1',
        siteId,
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
        ...overrides,
      },
    ],
  };
}

describe('RBAC Matrix & Site-Level Permissions', () => {
  it('grants SUPER_ADMIN access to all sites and credentials', () => {
    const admin = makeUser(RoleCode.SUPER_ADMIN);
    expect(getPermittedSiteIds(admin)).toBeNull();
    expect(hasSitePermission(admin, 'any-other-site', 'canViewCredentials')).toBe(true);
    expect(hasSitePermission(admin, 'any-other-site', 'canManageSite')).toBe(true);
  });

  it('strictly blocks IP_VIEWER from credentials even if site flags are true', () => {
    const ipViewer = makeUser(RoleCode.IP_VIEWER, 'site-btv', {
      canViewCredentials: true,
      canEditCredentials: true,
      canEditInventory: true,
    });

    expect(hasSitePermission(ipViewer, 'site-btv', 'canViewInventory')).toBe(true);
    expect(hasSitePermission(ipViewer, 'site-btv', 'canViewDiagram')).toBe(true);
    expect(hasSitePermission(ipViewer, 'site-btv', 'canViewIpam')).toBe(true);

    // Must be strictly false for edits and all credential operations
    expect(hasSitePermission(ipViewer, 'site-btv', 'canViewCredentials')).toBe(false);
    expect(hasSitePermission(ipViewer, 'site-btv', 'canEditCredentials')).toBe(false);
    expect(hasSitePermission(ipViewer, 'site-btv', 'canEditInventory')).toBe(false);
    expect(hasSitePermission(ipViewer, 'site-btv', 'canManageSite')).toBe(false);
  });

  it('prevents VIEWER from editing or deleting resources', () => {
    const viewer = makeUser(RoleCode.VIEWER, 'site-btv', {
      canEditInventory: true,
      canDeleteDocuments: true,
    });
    expect(hasSitePermission(viewer, 'site-btv', 'canViewInventory')).toBe(true);
    expect(hasSitePermission(viewer, 'site-btv', 'canEditInventory')).toBe(false);
    expect(hasSitePermission(viewer, 'site-btv', 'canDeleteDocuments')).toBe(false);
  });

  it('isolates non-super-admin users to assigned sites only', () => {
    const engineer = makeUser(RoleCode.NETWORK_ENGINEER, 'site-btv');
    expect(hasSitePermission(engineer, 'site-btv', 'canEditInventory')).toBe(true);
    expect(hasSitePermission(engineer, 'site-amw', 'canViewInventory')).toBe(false);
  });
});

describe('Storage Path Traversal Protection', () => {
  it('blocks directory traversal attempts outside storage root', () => {
    expect(() => resolveSafeStoragePath('../../etc/passwd', '/data/nims/storage')).toThrow(
      /traversal/i,
    );
    const ok = resolveSafeStoragePath('sites/BTV/diagrams/topo.png', '/data/nims/storage');
    expect(ok).toContain('BTV');
  });
});

describe('HTTP Backend Security & Credential Endpoint Enforcement', () => {
  it('returns 401 when unauthenticated on protected routes', async () => {
    const app = createApp();
    const res = await request(app).get('/api/credentials');
    expect(res.status).toBe(401);
  });

  it('returns 403 Forbidden when IP_VIEWER accesses /api/credentials or /reveal', async () => {
    const app = createApp();
    const rawJwt = jwt.sign(
      { sub: 'ip-viewer-id', sid: 'sess-ip', role: RoleCode.IP_VIEWER },
      env.jwtSecret,
      { expiresIn: '1h' },
    );

    const sessionSpy = vi.spyOn(prisma.session, 'findUnique').mockResolvedValue({
      id: 'sess-ip',
      userId: 'ip-viewer-id',
      tokenHash: hashToken(rawJwt),
      ipAddress: '127.0.0.1',
      userAgent: 'vitest',
      expiresAt: new Date(Date.now() + 3600_000),
      revokedAt: null,
      createdAt: new Date(),
      user: {
        id: 'ip-viewer-id',
        username: 'ip_viewer_user',
        email: 'ip@nims.local',
        fullName: 'IP Viewer',
        passwordHash: 'hash',
        roleId: 'role-ip',
        isActive: true,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        role: {
          id: 'role-ip',
          code: RoleCode.IP_VIEWER,
          name: 'IP Viewer',
          description: null,
          isSystem: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        sitePermissions: [],
      },
    } as never);

    const auditSpy = vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as never);

    const resGet = await request(app)
      .get('/api/credentials')
      .set('Authorization', `Bearer ${rawJwt}`);
    expect(resGet.status).toBe(403);
    expect(resGet.body.error).toMatch(/IP Viewer/i);

    const resReveal = await request(app)
      .post('/api/credentials/cred-123/reveal')
      .set('Authorization', `Bearer ${rawJwt}`);
    expect(resReveal.status).toBe(403);

    sessionSpy.mockRestore();
    auditSpy.mockRestore();
  });
});

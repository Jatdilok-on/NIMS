import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { RoleCode } from '@prisma/client';
import {
  getUserPresence,
  recordUserActivity,
  removeSessionPresence,
  removeUserPresence,
} from '../lib/presence';
import { clearApiRequestLogs, queryApiRequestLogs } from '../lib/apiLogger';
import { createApp } from '../app';
import { env } from '../config/env';
import { hashToken } from '../lib/crypto';
import { prisma } from '../lib/prisma';

function mockSessionForRole(userId: string, username: string, roleCode: RoleCode, sessionId: string) {
  const rawJwt = jwt.sign({ sub: userId, sid: sessionId, role: roleCode }, env.jwtSecret, {
    expiresIn: '1h',
  });
  const sessionSpy = vi.spyOn(prisma.session, 'findUnique').mockResolvedValue({
    id: sessionId,
    userId,
    tokenHash: hashToken(rawJwt),
    ipAddress: '10.10.1.5',
    userAgent: 'vitest',
    expiresAt: new Date(Date.now() + 3600_000),
    revokedAt: null,
    createdAt: new Date(),
    user: {
      id: userId,
      username,
      email: `${username}@nims.local`,
      fullName: username,
      passwordHash: 'hash',
      roleId: `role-${roleCode}`,
      isActive: true,
      mustChangePassword: false,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      role: {
        id: `role-${roleCode}`,
        code: roleCode,
        name: roleCode,
        description: null,
        isSystem: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      sitePermissions: [],
    },
  } as never);
  return { rawJwt, sessionSpy };
}

describe('User Realtime Presence Registry', () => {
  afterEach(() => {
    removeUserPresence('u-pres-1');
  });

  it('tracks multi-session online state and clears cleanly on logout/removal', () => {
    const empty = getUserPresence('u-pres-1', null);
    expect(empty.isOnline).toBe(false);
    expect(empty.activeSessionCount).toBe(0);

    recordUserActivity('u-pres-1', 'sess-a', { ip: '192.168.1.10', path: '/api/sites' });
    recordUserActivity('u-pres-1', 'sess-b', { ip: '192.168.1.11', path: '/api/devices' });

    const both = getUserPresence('u-pres-1', null);
    expect(both.isOnline).toBe(true);
    expect(both.activeSessionCount).toBe(2);
    expect(both.lastKnownIp).toBe('192.168.1.11');

    removeSessionPresence('u-pres-1', 'sess-b');
    const oneLeft = getUserPresence('u-pres-1', null);
    expect(oneLeft.isOnline).toBe(true);
    expect(oneLeft.activeSessionCount).toBe(1);
    expect(oneLeft.lastKnownIp).toBe('192.168.1.10');

    removeSessionPresence('u-pres-1', 'sess-a');
    const offline = getUserPresence('u-pres-1', null);
    expect(offline.isOnline).toBe(false);
    expect(offline.activeSessionCount).toBe(0);
  });

  it('falls back to lastLoginAt when user is offline', () => {
    const loginTime = new Date('2026-11-19T01:00:00.000Z');
    const snap = getUserPresence('u-pres-1', loginTime);
    expect(snap.isOnline).toBe(false);
    expect(snap.lastActiveAt).toBe(loginTime.toISOString());
  });
});

describe('API Request Logger & Super Admin Endpoint RBAC', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearApiRequestLogs();
    removeUserPresence('super-1');
    removeUserPresence('site-admin-1');
  });

  it('captures API traffic, redacts secret query params, and restricts log access to SUPER_ADMIN', async () => {
    clearApiRequestLogs();
    const app = createApp();
    const auditSpy = vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as never);

    // 1. Trigger a health request + a synthetic sensitive query request
    await request(app).get('/api/health?token=topsecret123');

    // Polling filter should hide /api/health by default, show it when excludePolling=false
    const hiddenRes = queryApiRequestLogs({ excludePolling: true });
    expect(hiddenRes.logs.some((l) => l.path.startsWith('/api/health'))).toBe(false);

    const visibleRes = queryApiRequestLogs({ excludePolling: false });
    const healthEntry = visibleRes.logs.find((l) => l.path.startsWith('/api/health'));
    expect(healthEntry).toBeDefined();
    expect(healthEntry!.path).not.toContain('topsecret123');
    expect(healthEntry!.path).toContain('REDACTED');

    // 2. SITE_ADMIN gets 403 on /api/audit-logs/api-requests
    const siteAdminMock = mockSessionForRole('site-admin-1', 'siteadmin', RoleCode.SITE_ADMIN, 'sess-sa');
    const deniedRes = await request(app)
      .get('/api/audit-logs/api-requests')
      .set('Authorization', `Bearer ${siteAdminMock.rawJwt}`);
    expect(deniedRes.status).toBe(403);
    siteAdminMock.sessionSpy.mockRestore();

    // 3. SUPER_ADMIN gets 200 on /api/audit-logs/api-requests and sees recorded traffic
    const superMock = mockSessionForRole('super-1', 'superadmin', RoleCode.SUPER_ADMIN, 'sess-sup');
    const allowedRes = await request(app)
      .get('/api/audit-logs/api-requests?excludePolling=false')
      .set('Authorization', `Bearer ${superMock.rawJwt}`);
    expect(allowedRes.status).toBe(200);
    expect(Array.isArray(allowedRes.body.logs)).toBe(true);
    expect(allowedRes.body.logs.some((l: { path: string }) => l.path.startsWith('/api/health'))).toBe(true);

    superMock.sessionSpy.mockRestore();
    auditSpy.mockRestore();
  });
});

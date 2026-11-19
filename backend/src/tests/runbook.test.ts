import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { RoleCode } from '@prisma/client';
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
    ipAddress: '127.0.0.1',
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

describe('Runbook Guides API & RBAC', () => {
  const originalStorageRoot = env.storageRoot;
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nims-runbook-test-'));

  afterEach(() => {
    vi.restoreAllMocks();
    env.storageRoot = originalStorageRoot;
  });

  it('allows all roles to read guides, restricts edit to NETWORK_ENGINEER / SITE_ADMIN / SUPER_ADMIN', async () => {
    env.storageRoot = tempRoot;
    const app = createApp();
    const auditSpy = vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as never);

    // 1. VIEWER can read default guides but gets 403 on POST
    const viewer = mockSessionForRole('u-view', 'itservice_viewer', RoleCode.VIEWER, 'sess-v');
    const getRes = await request(app)
      .get('/api/runbook')
      .set('Authorization', `Bearer ${viewer.rawJwt}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.guides.length).toBe(7);
    expect(getRes.body.guides.some((g: { id: string }) => g.id === 'RGV')).toBe(true);

    const deniedPost = await request(app)
      .post('/api/runbook')
      .set('Authorization', `Bearer ${viewer.rawJwt}`)
      .send({ codeBadge: 'UPS', thTitle: 'UPS Check' });
    expect(deniedPost.status).toBe(403);
    viewer.sessionSpy.mockRestore();

    // 2. NETWORK_ENGINEER can add, edit, and delete a guide
    const netEng = mockSessionForRole('u-ne', 'net_eng', RoleCode.NETWORK_ENGINEER, 'sess-ne');
    const createRes = await request(app)
      .post('/api/runbook')
      .set('Authorization', `Bearer ${netEng.rawJwt}`)
      .send({
        codeBadge: 'CCTV • Cam',
        iconType: 'CAMERA',
        thTitle: 'CCTV กล้องคลังสินค้า',
        thPath: 'NVR -> PoE Switch -> Camera',
        thPhysical: ['Check IR LED'],
        thNetworkMatrix: [{ condition: 'Switch OK, Cam Timeout', meaning: 'Check PoE port / cable' }],
        thSelfFix: ['Inspect RJ45'],
        thEscalate: ['Escalate if PoE down'],
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.guide.thTitle).toBe('CCTV กล้องคลังสินค้า');
    const createdId = createRes.body.guide.id;

    const updateRes = await request(app)
      .put(`/api/runbook/${createdId}`)
      .set('Authorization', `Bearer ${netEng.rawJwt}`)
      .send({
        codeBadge: 'CCTV • IP Cam',
        iconType: 'CAMERA',
        thTitle: 'CCTV กล้องคลังสินค้า (อัปเดต)',
        thPath: 'NVR -> PoE Switch -> IP Cam',
        thPhysical: ['Check IR LED', 'Check Bracket'],
        thNetworkMatrix: [{ condition: 'Switch OK, Cam Timeout', meaning: 'Check PoE port / cable' }],
        thSelfFix: ['Inspect RJ45'],
        thEscalate: ['Escalate if PoE down'],
      });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.guide.thTitle).toContain('อัปเดต');
    expect(updateRes.body.guide.updatedBy).toBe('net_eng');

    // 3. Test image upload, safe serving headers, and path traversal / SVG rejection
    const pngPayload = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('0000000d494844520000', 'hex'),
    ]);
    const uploadRes = await request(app)
      .post(`/api/runbook/${createdId}/image`)
      .set('Authorization', `Bearer ${netEng.rawJwt}`)
      .attach('image', pngPayload, 'cabinet.png');
    expect(uploadRes.status).toBe(200);
    const uploadedFile = uploadRes.body.guide.imageFile as string;
    expect(uploadedFile).toMatch(/\.png$/);

    const imgGetRes = await request(app)
      .get(`/api/runbook/images/${uploadedFile}`)
      .set('Authorization', `Bearer ${netEng.rawJwt}`);
    expect(imgGetRes.status).toBe(200);
    expect(imgGetRes.headers['content-type']).toContain('image/png');
    expect(imgGetRes.headers['content-security-policy']).toContain('sandbox');

    const badImgTraversal = await request(app)
      .get('/api/runbook/images/..')
      .set('Authorization', `Bearer ${netEng.rawJwt}`);
    expect(badImgTraversal.status).toBe(400);

    const badSvgReq = await request(app)
      .get('/api/runbook/images/xss.svg')
      .set('Authorization', `Bearer ${netEng.rawJwt}`);
    expect(badSvgReq.status).toBe(400);

    const deleteRes = await request(app)
      .delete(`/api/runbook/${createdId}`)
      .set('Authorization', `Bearer ${netEng.rawJwt}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.guides.some((g: { id: string }) => g.id === createdId)).toBe(false);

    netEng.sessionSpy.mockRestore();
    auditSpy.mockRestore();
  });

  it('auto-seeds new RGV default into existing legacy guides.json without overwriting custom guides or resurrecting deletions', async () => {
    const legacyTempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nims-runbook-legacy-'));
    env.storageRoot = legacyTempRoot;
    const runbookDir = path.join(legacyTempRoot, 'runbook');
    fs.mkdirSync(runbookDir, { recursive: true });
    fs.writeFileSync(
      path.join(runbookDir, 'guides.json'),
      JSON.stringify([
        {
          id: 'SHU',
          codeBadge: 'SHU • Custom',
          iconType: 'SHUTTLE',
          thTitle: 'SHU (แก้ไขเฉพาะไซต์)',
          enTitle: 'SHU Custom',
          thPath: 'PLC Main -> AP -> SHU',
          enPath: 'PLC Main -> AP -> SHU',
          thPhysical: ['Check battery'],
          enPhysical: ['Check battery'],
          thNetworkMatrix: [],
          enNetworkMatrix: [],
          thSelfFix: [],
          enSelfFix: [],
          thEscalate: [],
          enEscalate: [],
        },
      ]),
      'utf8',
    );

    const app = createApp();
    const netEng = mockSessionForRole('u-ne2', 'net_eng2', RoleCode.NETWORK_ENGINEER, 'sess-ne2');
    const auditSpy = vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as never);

    const firstGet = await request(app)
      .get('/api/runbook')
      .set('Authorization', `Bearer ${netEng.rawJwt}`);
    expect(firstGet.status).toBe(200);
    expect(firstGet.body.guides.map((g: { id: string }) => g.id)).toEqual(['SHU', 'RGV']);
    expect(firstGet.body.guides[0].thTitle).toBe('SHU (แก้ไขเฉพาะไซต์)');

    // Explicitly deleting RGV should stay deleted on reload
    const delRgv = await request(app)
      .delete('/api/runbook/RGV')
      .set('Authorization', `Bearer ${netEng.rawJwt}`);
    expect(delRgv.status).toBe(200);

    const secondGet = await request(app)
      .get('/api/runbook')
      .set('Authorization', `Bearer ${netEng.rawJwt}`);
    expect(secondGet.status).toBe(200);
    expect(secondGet.body.guides.map((g: { id: string }) => g.id)).toEqual(['SHU']);

    netEng.sessionSpy.mockRestore();
    auditSpy.mockRestore();
    fs.rmSync(legacyTempRoot, { recursive: true, force: true });
  });
});

import { Router } from 'express';
import { z } from 'zod';
import { RoleCode } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { hashPassword } from '../lib/crypto';
import { ensureReferenceData } from '../lib/bootstrap';
import { recordAuditLog } from '../lib/audit';

const router = Router();

const initSetupSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_.-]+$/),
  email: z.string().email(),
  fullName: z.string().min(2).max(120),
  password: z.string().min(10, 'Password must be at least 10 characters').max(128),
  organizationName: z.string().min(2).max(120).optional(),
  createSampleSites: z.boolean().optional(),
});

router.get('/status', async (_req, res, next) => {
  try {
    const userCount = await prisma.user.count();
    const settings = await prisma.systemSetting.findUnique({ where: { key: 'default' } }).catch(() => null);
    res.json({
      needsSetup: userCount === 0,
      organizationName: settings?.organizationName || 'NIMS Enterprise',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/init', async (req, res, next) => {
  try {
    const existingUsers = await prisma.user.count();
    if (existingUsers > 0) {
      res.status(403).json({ error: 'System is already initialized. Setup endpoint is locked.' });
      return;
    }

    const body = initSetupSchema.parse(req.body);
    await ensureReferenceData();

    const superAdminRole = await prisma.role.findUniqueOrThrow({
      where: { code: RoleCode.SUPER_ADMIN },
    });

    const passwordHash = await hashPassword(body.password);

    const admin = await prisma.user.create({
      data: {
        username: body.username.trim(),
        email: body.email.trim().toLowerCase(),
        fullName: body.fullName.trim(),
        passwordHash,
        roleId: superAdminRole.id,
        isActive: true,
      },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
      },
    });

    if (body.organizationName) {
      await prisma.systemSetting.update({
        where: { key: 'default' },
        data: { organizationName: body.organizationName.trim() },
      });
    }

    if (body.createSampleSites) {
      const sampleSites = [
        {
          siteCode: 'BTV',
          siteName: 'BTV Main Campus',
          customerName: 'Internal Enterprise',
          location: 'Bangkok',
          description: 'Primary headquarters network infrastructure',
        },
        {
          siteCode: 'AMW',
          siteName: 'AMW Facility',
          customerName: 'Internal Enterprise',
          location: 'Rayong',
          description: 'Manufacturing and warehouse network site',
        },
        {
          siteCode: 'CUST01',
          siteName: 'Customer Site 01',
          customerName: 'Enterprise Client A',
          location: 'Chonburi',
          description: 'Managed customer infrastructure site 01',
        },
      ];
      for (const s of sampleSites) {
        const existingSite = await prisma.site.findUnique({ where: { siteCode: s.siteCode } });
        if (!existingSite) {
          await prisma.site.create({ data: s });
        }
      }
    }

    await recordAuditLog({
      req,
      userId: admin.id,
      username: admin.username,
      action: 'INITIAL_SUPER_ADMIN_CREATED',
      module: 'SETUP',
    });

    res.status(201).json({
      message: 'Super Admin initialized successfully',
      user: admin,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

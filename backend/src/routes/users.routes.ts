import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { RoleCode } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticate, invalidateSessionCacheForUser } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { hashPassword } from '../lib/crypto';
import { recordAuditLog } from '../lib/audit';
import {
  buildSampleUsersCsv,
  buildSampleUsersExcelBuffer,
  normalizeUserRole,
  parseUsersSpreadsheetBuffer,
} from '../lib/excel';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_.-]{3,50}$/;

function parseSiteCodesList(raw: string | undefined, allSites: Array<{ id: string; siteCode: string }>) {
  const text = (raw || '').trim();
  if (!text) return { siteIds: [] as string[], unknownCodes: [] as string[] };

  const tokens = text
    .split(/[,;|/]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  if (tokens.some((t) => t.toUpperCase() === 'ALL')) {
    return { siteIds: allSites.map((s) => s.id), unknownCodes: [] as string[] };
  }

  const byCode = new Map(allSites.map((s) => [s.siteCode.toLowerCase(), s.id]));
  const siteIds: string[] = [];
  const unknownCodes: string[] = [];
  for (const tok of tokens) {
    const matched = byCode.get(tok.toLowerCase());
    if (matched) {
      if (!siteIds.includes(matched)) siteIds.push(matched);
    } else {
      unknownCodes.push(tok);
    }
  }
  return { siteIds, unknownCodes };
}

function parseUserActiveFlag(raw: string | undefined): boolean {
  const val = (raw || '').trim().toLowerCase();
  if (!val) return true;
  if (['false', '0', 'no', 'inactive', 'disabled', 'ปิด', 'ระงับ'].includes(val)) {
    return false;
  }
  return true;
}

const router = Router();
router.use(authenticate, requireRoles(RoleCode.SUPER_ADMIN));

const sitePermSchema = z.object({
  siteId: z.string().min(1),
  canViewInventory: z.boolean().default(true),
  canEditInventory: z.boolean().default(false),
  canViewDiagram: z.boolean().default(true),
  canEditDiagram: z.boolean().default(false),
  canViewIpam: z.boolean().default(true),
  canEditIpam: z.boolean().default(false),
  canViewDocuments: z.boolean().default(true),
  canEditDocuments: z.boolean().default(false),
  canDeleteDocuments: z.boolean().default(false),
  canViewCredentials: z.boolean().default(false),
  canEditCredentials: z.boolean().default(false),
  canViewMaintenance: z.boolean().default(true),
  canEditMaintenance: z.boolean().default(false),
  canManageSite: z.boolean().default(false),
});

const createUserSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_.-]+$/),
  email: z.string().email(),
  fullName: z.string().min(2).max(120),
  password: z.string().min(10).max(128),
  roleCode: z.nativeEnum(RoleCode),
  isActive: z.boolean().default(true),
  mustChangePassword: z.boolean().default(true),
  sitePermissions: z.array(sitePermSchema).optional(),
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  fullName: z.string().min(2).max(120).optional(),
  password: z.string().min(10).max(128).optional(),
  roleCode: z.nativeEnum(RoleCode).optional(),
  syncSitePermissions: z.boolean().default(true),
  isActive: z.boolean().optional(),
  mustChangePassword: z.boolean().optional(),
});

const bulkSitePermsSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1),
  mode: z.enum(['replace', 'merge', 'remove']).default('replace'),
  sitePermissions: z.array(sitePermSchema).default([]),
  siteIds: z.array(z.string().min(1)).optional(),
});

function buildDefaultPermissionsForRole(roleCode: RoleCode) {
  const canEdit = roleCode === RoleCode.SITE_ADMIN || roleCode === RoleCode.NETWORK_ENGINEER;
  const isSiteAdmin = roleCode === RoleCode.SITE_ADMIN || roleCode === RoleCode.SUPER_ADMIN;
  const isIpViewer = roleCode === RoleCode.IP_VIEWER;
  return {
    canViewInventory: true,
    canEditInventory: !isIpViewer && canEdit,
    canViewDiagram: true,
    canEditDiagram: !isIpViewer && canEdit,
    canViewIpam: true,
    canEditIpam: !isIpViewer && canEdit,
    canViewDocuments: true,
    canEditDocuments: !isIpViewer && canEdit,
    canDeleteDocuments: !isIpViewer && isSiteAdmin,
    canViewCredentials: !isIpViewer && isSiteAdmin,
    canEditCredentials: !isIpViewer && isSiteAdmin,
    canViewMaintenance: true,
    canEditMaintenance: !isIpViewer && canEdit,
    canManageSite: !isIpViewer && isSiteAdmin,
  };
}

function sanitizeSitePermissionForRole(
  userId: string,
  sp: z.infer<typeof sitePermSchema>,
  roleCode: RoleCode,
) {
  const isIpViewer = roleCode === RoleCode.IP_VIEWER;
  const isViewer = roleCode === RoleCode.VIEWER;
  const readOnly = isIpViewer || isViewer;

  return {
    userId,
    siteId: sp.siteId,
    canViewInventory: sp.canViewInventory,
    canEditInventory: readOnly ? false : sp.canEditInventory,
    canViewDiagram: sp.canViewDiagram,
    canEditDiagram: readOnly ? false : sp.canEditDiagram,
    canViewIpam: sp.canViewIpam,
    canEditIpam: readOnly ? false : sp.canEditIpam,
    canViewDocuments: sp.canViewDocuments,
    canEditDocuments: readOnly ? false : sp.canEditDocuments,
    canDeleteDocuments: readOnly ? false : sp.canDeleteDocuments,
    canViewCredentials: isIpViewer ? false : sp.canViewCredentials,
    canEditCredentials: readOnly ? false : sp.canEditCredentials,
    canViewMaintenance: sp.canViewMaintenance,
    canEditMaintenance: readOnly ? false : sp.canEditMaintenance,
    canManageSite:
      roleCode === RoleCode.SITE_ADMIN || roleCode === RoleCode.SUPER_ADMIN
        ? sp.canManageSite
        : false,
  };
}

router.get('/roles', async (_req, res, next) => {
  try {
    const roles = await prisma.role.findMany({
      orderBy: { code: 'asc' },
    });
    res.json({ roles });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        isActive: true,
        mustChangePassword: true,
        lastLoginAt: true,
        createdAt: true,
        role: { select: { id: true, code: true, name: true } },
        sitePermissions: {
          include: { site: { select: { id: true, siteCode: true, siteName: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const body = createUserSchema.parse(req.body);
    const role = await prisma.role.findUniqueOrThrow({ where: { code: body.roleCode } });
    const passwordHash = await hashPassword(body.password);

    const created = await prisma.user.create({
      data: {
        username: body.username.trim(),
        email: body.email.trim().toLowerCase(),
        fullName: body.fullName.trim(),
        passwordHash,
        roleId: role.id,
        isActive: body.isActive,
        mustChangePassword: body.mustChangePassword,
      },
    });

    if (body.sitePermissions && body.sitePermissions.length > 0) {
      for (const sp of body.sitePermissions) {
        await prisma.userSitePermission.create({
          data: sanitizeSitePermissionForRole(created.id, sp, body.roleCode),
        });
      }
    }

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: created.id },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        isActive: true,
        mustChangePassword: true,
        role: true,
        sitePermissions: true,
      },
    });

    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'CREATE_USER',
      module: 'USER',
      details: { targetUsername: user.username, role: body.roleCode },
    });

    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
});

router.get('/import/template', async (req, res, next) => {
  try {
    const format = String(req.query.format || 'xlsx').toLowerCase();
    if (format === 'csv') {
      const csv = buildSampleUsersCsv();
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="nims-users-import-template.csv"',
      );
      res.send(csv);
      return;
    }
    const buf = await buildSampleUsersExcelBuffer();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="nims-users-import-template.xlsx"',
    );
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

router.post('/import/preview', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Spreadsheet file is required' });
      return;
    }

    const defaultRoleRaw = String(req.body.defaultRoleCode || 'VIEWER').toUpperCase();
    const defaultRoleCode =
      defaultRoleRaw in RoleCode ? (defaultRoleRaw as RoleCode) : RoleCode.VIEWER;
    const defaultPassword = String(req.body.defaultPassword || '');

    const parsed = await parseUsersSpreadsheetBuffer(req.file.buffer, req.file.originalname);

    const [existingUsers, allSites] = await Promise.all([
      prisma.user.findMany({ select: { username: true, email: true } }),
      prisma.site.findMany({ select: { id: true, siteCode: true } }),
    ]);

    const existingUsernames = new Set(existingUsers.map((u) => u.username.toLowerCase()));
    const existingEmails = new Set(existingUsers.map((u) => u.email.toLowerCase()));
    const seenUsernames = new Set<string>();
    const seenEmails = new Set<string>();

    const mapVal = (row: Record<string, string>, targetField: string): string => {
      for (const [col, mapped] of Object.entries(parsed.suggestedMapping)) {
        if (mapped === targetField && row[col] !== undefined) return row[col];
      }
      return '';
    };

    const previewRows = parsed.rows.map((raw, idx) => {
      const issues: string[] = [];
      const username = mapVal(raw, 'username').trim();
      const fullName = mapVal(raw, 'fullName').trim();
      const email = mapVal(raw, 'email').trim().toLowerCase();
      const rowPassword = mapVal(raw, 'password');
      const effectivePassword = rowPassword || defaultPassword;
      const rawRole = mapVal(raw, 'roleCode');
      const resolvedRole = normalizeUserRole(rawRole, defaultRoleCode);
      const rawSiteCodes = mapVal(raw, 'siteCodes');
      const { siteIds, unknownCodes } = parseSiteCodesList(rawSiteCodes, allSites);
      const isActive = parseUserActiveFlag(mapVal(raw, 'isActive'));

      if (!username || !USERNAME_REGEX.test(username)) {
        issues.push('Invalid username (3-50 chars: letters, numbers, _, ., -)');
      }
      if (!fullName || fullName.length < 2) {
        issues.push('Missing Full Name (min 2 chars)');
      }
      if (!email || !EMAIL_REGEX.test(email)) {
        issues.push('Invalid email address');
      }
      if (!effectivePassword || effectivePassword.length < 10) {
        issues.push('Password must be >= 10 characters (or set Default Password)');
      }
      if (!resolvedRole) {
        issues.push(`Unknown role "${rawRole}"`);
      }
      if (unknownCodes.length > 0) {
        issues.push(`Unknown site codes: ${unknownCodes.join(', ')}`);
      }

      let isDuplicate = false;
      const unameLower = username.toLowerCase();
      if (username && (existingUsernames.has(unameLower) || seenUsernames.has(unameLower))) {
        issues.push(`Duplicate username: ${username}`);
        isDuplicate = true;
      }
      if (email && (existingEmails.has(email) || seenEmails.has(email))) {
        issues.push(`Duplicate email: ${email}`);
        isDuplicate = true;
      }

      if (username) seenUsernames.add(unameLower);
      if (email) seenEmails.add(email);

      return {
        rowNumber: idx + 2,
        raw,
        resolvedRole: resolvedRole ?? defaultRoleCode,
        resolvedSiteCount: resolvedRole === RoleCode.SUPER_ADMIN ? allSites.length : siteIds.length,
        isActive,
        status: issues.length === 0 ? 'READY' : isDuplicate ? 'DUPLICATE' : 'INVALID',
        issues,
      };
    });

    res.json({
      headers: parsed.headers,
      suggestedMapping: parsed.suggestedMapping,
      totalRows: parsed.rows.length,
      previewRows,
    });
  } catch (err) {
    next(err);
  }
});

const confirmImportUsersSchema = z.object({
  columnMapping: z.record(z.string()),
  defaultRoleCode: z.nativeEnum(RoleCode).default(RoleCode.VIEWER),
  defaultPassword: z.string().optional(),
  mustChangePassword: z.boolean().default(true),
  skipDuplicates: z.boolean().default(true),
  rows: z.array(z.record(z.string())),
  rowRoles: z.array(z.nativeEnum(RoleCode)).optional(),
});

router.post('/import/confirm', async (req, res, next) => {
  try {
    const body = confirmImportUsersSchema.parse(req.body);

    const [roles, allSites, existingUsers] = await Promise.all([
      prisma.role.findMany(),
      prisma.site.findMany({ select: { id: true, siteCode: true } }),
      prisma.user.findMany({ select: { username: true, email: true } }),
    ]);

    const roleByCode = new Map(roles.map((r) => [r.code, r]));
    const existingUsernames = new Set(existingUsers.map((u) => u.username.toLowerCase()));
    const existingEmails = new Set(existingUsers.map((u) => u.email.toLowerCase()));

    let importedCount = 0;
    let skippedDuplicates = 0;
    const errors: { rowIndex: number; name?: string; error: string }[] = [];
    const importedUsernames: string[] = [];

    for (let i = 0; i < body.rows.length; i++) {
      const raw = body.rows[i];
      const mapped: Record<string, string> = {};
      for (const [col, target] of Object.entries(body.columnMapping)) {
        if (target && raw[col] !== undefined) {
          mapped[target] = String(raw[col]).trim();
        }
      }

      const username = (mapped.username || '').trim();
      const fullName = (mapped.fullName || '').trim();
      const email = (mapped.email || '').trim().toLowerCase();
      const rawPwd = mapped.password || body.defaultPassword || '';

      if (!username || !USERNAME_REGEX.test(username)) {
        errors.push({ rowIndex: i + 1, name: username || fullName, error: 'Invalid username' });
        continue;
      }
      if (!fullName || fullName.length < 2) {
        errors.push({ rowIndex: i + 1, name: username, error: 'Missing Full Name' });
        continue;
      }
      if (!email || !EMAIL_REGEX.test(email)) {
        errors.push({ rowIndex: i + 1, name: username, error: 'Invalid email' });
        continue;
      }
      if (!rawPwd || rawPwd.length < 10) {
        errors.push({
          rowIndex: i + 1,
          name: username,
          error: 'Password must be at least 10 characters',
        });
        continue;
      }

      if (
        existingUsernames.has(username.toLowerCase()) ||
        existingEmails.has(email)
      ) {
        if (body.skipDuplicates) {
          skippedDuplicates++;
        } else {
          errors.push({
            rowIndex: i + 1,
            name: username,
            error: 'Duplicate username or email',
          });
        }
        continue;
      }

      const roleCode =
        body.rowRoles?.[i] ??
        normalizeUserRole(mapped.roleCode, body.defaultRoleCode);
      if (!roleCode || !roleByCode.has(roleCode)) {
        errors.push({
          rowIndex: i + 1,
          name: username,
          error: `Unknown role "${mapped.roleCode || ''}"`,
        });
        continue;
      }

      const role = roleByCode.get(roleCode)!;
      const isActive = parseUserActiveFlag(mapped.isActive);
      const passwordHash = await hashPassword(rawPwd);

      const created = await prisma.user.create({
        data: {
          username,
          email,
          fullName,
          passwordHash,
          roleId: role.id,
          isActive,
          mustChangePassword: body.mustChangePassword,
        },
      });

      existingUsernames.add(username.toLowerCase());
      existingEmails.add(email);

      if (roleCode !== RoleCode.SUPER_ADMIN && mapped.siteCodes) {
        const { siteIds } = parseSiteCodesList(mapped.siteCodes, allSites);
        const defaults = buildDefaultPermissionsForRole(roleCode);
        for (const siteId of siteIds) {
          await prisma.userSitePermission.create({
            data: { userId: created.id, siteId, ...defaults },
          });
        }
      }

      importedCount++;
      importedUsernames.push(created.username);
    }

    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'IMPORT_USERS',
      module: 'USER',
      details: {
        totalRows: body.rows.length,
        importedCount,
        skippedDuplicates,
        errorCount: errors.length,
        usernames: importedUsernames.slice(0, 20),
      },
    });

    res.json({
      totalRows: body.rows.length,
      importedCount,
      skippedDuplicates,
      errorCount: errors.length,
      errors,
    });
  } catch (err) {
    next(err);
  }
});

router.put('/bulk-site-permissions', async (req, res, next) => {
  try {
    const body = bulkSitePermsSchema.parse(req.body);
    const targetUsers = await prisma.user.findMany({
      where: { id: { in: body.userIds } },
      include: { role: true },
    });

    const eligibleUsers = targetUsers.filter((u) => u.role.code !== RoleCode.SUPER_ADMIN);
    if (eligibleUsers.length === 0) {
      res.status(400).json({ error: 'No non-SuperAdmin users selected' });
      return;
    }

    const siteIdsToActOn =
      body.siteIds && body.siteIds.length > 0
        ? body.siteIds
        : body.sitePermissions.map((sp) => sp.siteId);

    for (const u of eligibleUsers) {
      if (body.mode === 'replace') {
        await prisma.userSitePermission.deleteMany({ where: { userId: u.id } });
        for (const sp of body.sitePermissions) {
          await prisma.userSitePermission.create({
            data: sanitizeSitePermissionForRole(u.id, sp, u.role.code),
          });
        }
      } else if (body.mode === 'merge') {
        if (siteIdsToActOn.length > 0) {
          await prisma.userSitePermission.deleteMany({
            where: { userId: u.id, siteId: { in: siteIdsToActOn } },
          });
        }
        for (const sp of body.sitePermissions) {
          await prisma.userSitePermission.create({
            data: sanitizeSitePermissionForRole(u.id, sp, u.role.code),
          });
        }
      } else if (body.mode === 'remove') {
        if (siteIdsToActOn.length > 0) {
          await prisma.userSitePermission.deleteMany({
            where: { userId: u.id, siteId: { in: siteIdsToActOn } },
          });
        }
      }
      invalidateSessionCacheForUser(u.id);
    }

    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'BULK_CHANGE_PERMISSION',
      module: 'USER',
      details: {
        mode: body.mode,
        userCount: eligibleUsers.length,
        usernames: eligibleUsers.map((u) => u.username),
        siteCount: body.mode === 'remove' ? siteIdsToActOn.length : body.sitePermissions.length,
      },
    });

    res.json({
      updatedUsers: eligibleUsers.length,
      usernames: eligibleUsers.map((u) => u.username),
    });
  } catch (err) {
    next(err);
  }
});

const bulkRoleSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1),
  roleCode: z.nativeEnum(RoleCode),
  syncSitePermissions: z.boolean().default(true),
});

async function syncUserPermissionsForRole(
  userId: string,
  roleCode: RoleCode,
  syncDefaults: boolean,
) {
  if (syncDefaults) {
    await prisma.userSitePermission.updateMany({
      where: { userId },
      data: buildDefaultPermissionsForRole(roleCode),
    });
    return;
  }

  const existingPerms = await prisma.userSitePermission.findMany({ where: { userId } });
  for (const sp of existingPerms) {
    const sanitized = sanitizeSitePermissionForRole(userId, sp, roleCode);
    await prisma.userSitePermission.update({
      where: { id: sp.id },
      data: {
        canEditInventory: sanitized.canEditInventory,
        canEditDiagram: sanitized.canEditDiagram,
        canEditIpam: sanitized.canEditIpam,
        canEditDocuments: sanitized.canEditDocuments,
        canDeleteDocuments: sanitized.canDeleteDocuments,
        canViewCredentials: sanitized.canViewCredentials,
        canEditCredentials: sanitized.canEditCredentials,
        canEditMaintenance: sanitized.canEditMaintenance,
        canManageSite: sanitized.canManageSite,
      },
    });
  }
}

router.put('/bulk-role', async (req, res, next) => {
  try {
    const body = bulkRoleSchema.parse(req.body);
    const targetRole = await prisma.role.findUniqueOrThrow({ where: { code: body.roleCode } });

    const eligibleIds = body.userIds.filter(
      (id) => !(id === req.user!.id && body.roleCode !== RoleCode.SUPER_ADMIN),
    );
    if (eligibleIds.length === 0) {
      res.status(400).json({ error: 'Cannot demote your own active Super Admin account' });
      return;
    }

    const users = await prisma.user.findMany({
      where: { id: { in: eligibleIds } },
      select: { id: true, username: true },
    });

    for (const u of users) {
      await prisma.user.update({
        where: { id: u.id },
        data: { roleId: targetRole.id },
      });
      await syncUserPermissionsForRole(u.id, body.roleCode, body.syncSitePermissions);
      invalidateSessionCacheForUser(u.id);
    }

    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'BULK_CHANGE_ROLE',
      module: 'USER',
      details: {
        roleCode: body.roleCode,
        userCount: users.length,
        usernames: users.map((u) => u.username),
      },
    });

    res.json({ updatedUsers: users.length, roleCode: body.roleCode });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const body = updateUserSchema.parse(req.body);
    if (req.params.id === req.user!.id) {
      if (body.roleCode && body.roleCode !== RoleCode.SUPER_ADMIN) {
        res.status(400).json({ error: 'Cannot change your own Super Admin role' });
        return;
      }
      if (body.isActive === false) {
        res.status(400).json({ error: 'Cannot deactivate your own active Super Admin account' });
        return;
      }
    }

    let roleId: string | undefined;
    if (body.roleCode) {
      const role = await prisma.role.findUniqueOrThrow({ where: { code: body.roleCode } });
      roleId = role.id;
    }

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        email: body.email?.trim().toLowerCase(),
        fullName: body.fullName?.trim(),
        passwordHash: body.password ? await hashPassword(body.password) : undefined,
        roleId,
        isActive: body.isActive,
        mustChangePassword: body.mustChangePassword,
      },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        isActive: true,
        mustChangePassword: true,
        role: true,
      },
    });

    if (body.roleCode) {
      await syncUserPermissionsForRole(updated.id, body.roleCode, body.syncSitePermissions);
    }

    // If deactivated or password reset, revoke active sessions
    if (body.isActive === false || body.password) {
      await prisma.session.updateMany({
        where: { userId: updated.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    invalidateSessionCacheForUser(updated.id);

    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'UPDATE_USER',
      module: 'USER',
      details: { targetUsername: updated.username, roleCode: body.roleCode, isActive: body.isActive },
    });

    res.json({ user: updated });
  } catch (err) {
    next(err);
  }
});

router.put('/:id/site-permissions', async (req, res, next) => {
  try {
    const permissions = z.array(sitePermSchema).parse(req.body.sitePermissions);
    const targetUser = await prisma.user.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { role: true },
    });

    await prisma.userSitePermission.deleteMany({ where: { userId: targetUser.id } });
    for (const sp of permissions) {
      await prisma.userSitePermission.create({
        data: sanitizeSitePermissionForRole(targetUser.id, sp, targetUser.role.code),
      });
    }

    invalidateSessionCacheForUser(targetUser.id);
    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'CHANGE_PERMISSION',
      module: 'USER',
      details: { targetUsername: targetUser.username, siteCount: permissions.length },
    });

    const updatedPerms = await prisma.userSitePermission.findMany({
      where: { userId: targetUser.id },
      include: { site: { select: { id: true, siteCode: true, siteName: true } } },
    });

    res.json({ sitePermissions: updatedPerms });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (req.params.id === req.user!.id) {
      res.status(400).json({ error: 'Cannot delete your own active Super Admin account' });
      return;
    }
    const deleted = await prisma.user.delete({ where: { id: req.params.id } });
    await prisma.session.deleteMany({ where: { userId: req.params.id } }).catch(() => undefined);
    invalidateSessionCacheForUser(req.params.id);
    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'DELETE_USER',
      module: 'USER',
      details: { deletedUsername: deleted.username },
    });
    res.json({ message: 'User deleted' });
  } catch (err) {
    next(err);
  }
});

export default router;

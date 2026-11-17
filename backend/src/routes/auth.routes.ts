import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { AuditResult } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  generateRandomToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from '../lib/crypto';
import { env } from '../config/env';
import {
  authenticate,
  CSRF_COOKIE_NAME,
  invalidateSessionCacheForUser,
  SESSION_COOKIE_NAME,
} from '../middleware/auth';
import { extractClientIp, recordAuditLog } from '../lib/audit';
import { loginRateLimiter } from '../middleware/rateLimit';

const router = Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10, 'New password must be at least 10 characters').max(128),
});

router.post('/login', loginRateLimiter, async (req, res, next) => {
  try {
    const { username, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: username.trim() },
          { email: username.trim().toLowerCase() },
        ],
      },
      include: {
        role: true,
        sitePermissions: true,
      },
    });

    if (!user || !user.isActive) {
      await recordAuditLog({
        req,
        username: username.trim(),
        action: 'USER_LOGIN',
        module: 'AUTH',
        result: AuditResult.FAILURE,
        details: { reason: 'Invalid credentials or inactive account' },
      });
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      await recordAuditLog({
        req,
        userId: user.id,
        username: user.username,
        action: 'USER_LOGIN',
        module: 'AUTH',
        result: AuditResult.FAILURE,
        details: { reason: 'Incorrect password' },
      });
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    const sessionId = generateRandomToken(12);
    const rawJwt = jwt.sign(
      { sub: user.id, sid: sessionId, role: user.role.code },
      env.jwtSecret,
      { expiresIn: `${env.sessionTtlHours}h` },
    );
    const tokenHash = hashToken(rawJwt);
    const expiresAt = new Date(Date.now() + env.sessionTtlHours * 3600 * 1000);

    await prisma.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        tokenHash,
        ipAddress: extractClientIp(req),
        userAgent: req.headers['user-agent']?.slice(0, 500) ?? null,
        expiresAt,
      },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const csrfToken = generateRandomToken(24);
    const maxAgeMs = env.sessionTtlHours * 3600 * 1000;

    res.cookie(SESSION_COOKIE_NAME, rawJwt, {
      httpOnly: true,
      secure: env.cookieSecure,
      sameSite: 'lax',
      maxAge: maxAgeMs,
      path: '/',
    });

    res.cookie(CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: false,
      secure: env.cookieSecure,
      sameSite: 'lax',
      maxAge: maxAgeMs,
      path: '/',
    });

    await recordAuditLog({
      req,
      userId: user.id,
      username: user.username,
      action: 'USER_LOGIN',
      module: 'AUTH',
      result: AuditResult.SUCCESS,
    });

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        roleCode: user.role.code,
        roleName: user.role.name,
        mustChangePassword: Boolean(user.mustChangePassword),
        sitePermissions: user.sitePermissions,
      },
      csrfToken,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', authenticate, async (req, res, next) => {
  try {
    if (req.user) {
      invalidateSessionCacheForUser(req.user.id);
      await prisma.session.update({
        where: { id: req.user.sessionId },
        data: { revokedAt: new Date() },
      });

      await recordAuditLog({
        req,
        userId: req.user.id,
        username: req.user.username,
        action: 'USER_LOGOUT',
        module: 'AUTH',
        result: AuditResult.SUCCESS,
      });
    }

    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    res.clearCookie(CSRF_COOKIE_NAME, { path: '/' });
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticate, async (req, res) => {
  res.json({ user: req.user });
});

router.post('/change-password', authenticate, async (req, res, next) => {
  try {
    const body = changePasswordSchema.parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });

    const valid = await verifyPassword(body.currentPassword, user.passwordHash);
    if (!valid) {
      res.status(400).json({ error: 'Current password is incorrect' });
      return;
    }

    if (body.newPassword === body.currentPassword) {
      res.status(400).json({ error: 'New password must be different from current password' });
      return;
    }

    const newHash = await hashPassword(body.newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash, mustChangePassword: false },
    });

    invalidateSessionCacheForUser(user.id);

    await recordAuditLog({
      req,
      userId: user.id,
      username: user.username,
      action: 'CHANGE_PASSWORD',
      module: 'AUTH',
      result: AuditResult.SUCCESS,
    });

    res.json({ message: 'Password updated successfully', mustChangePassword: false });
  } catch (err) {
    next(err);
  }
});

export default router;

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { RoleCode, UserSitePermission } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { hashToken } from '../lib/crypto';
import { extractClientIp } from '../lib/audit';
import { recordUserActivity } from '../lib/presence';

export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  roleCode: RoleCode;
  roleName: string;
  mustChangePassword: boolean;
  sessionId: string;
  sitePermissions: UserSitePermission[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export const SESSION_COOKIE_NAME = 'nims_session';
export const CSRF_COOKIE_NAME = 'nims_csrf';

const SESSION_CACHE_TTL_MS = 10_000;
const MAX_SESSION_CACHE_SIZE = 500;

interface CachedSessionEntry {
  user: AuthenticatedUser;
  sessionExpiresAt: number;
  cachedUntil: number;
}

const sessionCache = new Map<string, CachedSessionEntry>();

export function invalidateSessionCacheByTokenHash(tokenHash: string): void {
  sessionCache.delete(tokenHash);
}

export function invalidateSessionCacheForUser(userId: string): void {
  for (const [key, entry] of sessionCache.entries()) {
    if (entry.user.id === userId) {
      sessionCache.delete(key);
    }
  }
}

export interface JwtPayload {
  sub: string;
  sid: string;
  role: RoleCode;
}

function isAllowedDuringPasswordChange(req: Request): boolean {
  const fullPath = `${req.baseUrl}${req.path}`.replace(/\/+$/, '');
  return (
    fullPath === '/api/auth/me' ||
    fullPath === '/api/auth/logout' ||
    fullPath === '/api/auth/change-password'
  );
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const cookieToken = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
    const authHeader = req.headers.authorization;
    const bearerToken =
      authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;

    const rawToken = cookieToken || bearerToken;
    if (!rawToken) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // CSRF verification whenever the cookie-backed session is used on state-changing requests
    const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase());
    if (cookieToken && isMutating) {
      const csrfCookie = req.cookies?.[CSRF_COOKIE_NAME];
      const csrfHeader = req.headers['x-csrf-token'];
      if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
        res.status(403).json({ error: 'Invalid or missing CSRF token' });
        return;
      }
    }

    const decoded = jwt.verify(rawToken, env.jwtSecret) as JwtPayload;
    const tokenHash = hashToken(rawToken);
    const nowMs = Date.now();

    const cached = sessionCache.get(tokenHash);
    if (
      cached &&
      cached.cachedUntil > nowMs &&
      cached.sessionExpiresAt > nowMs &&
      cached.user.id === decoded.sub
    ) {
      if (cached.user.mustChangePassword && !isAllowedDuringPasswordChange(req)) {
        res.status(403).json({
          error: 'Password change required before accessing this resource',
          code: 'MUST_CHANGE_PASSWORD',
        });
        return;
      }
      req.user = cached.user;
      recordUserActivity(cached.user.id, cached.user.sessionId, {
        ip: extractClientIp(req),
        path: (req.originalUrl || `${req.baseUrl}${req.path}`).split('?')[0],
      });
      next();
      return;
    }

    const session = await prisma.session.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            role: true,
            sitePermissions: true,
          },
        },
      },
    });

    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt < new Date() ||
      !session.user ||
      !session.user.isActive ||
      session.user.id !== decoded.sub
    ) {
      sessionCache.delete(tokenHash);
      res.status(401).json({ error: 'Session expired or invalid' });
      return;
    }

    const authenticatedUser: AuthenticatedUser = {
      id: session.user.id,
      username: session.user.username,
      email: session.user.email,
      fullName: session.user.fullName,
      roleCode: session.user.role.code,
      roleName: session.user.role.name,
      mustChangePassword: Boolean(session.user.mustChangePassword),
      sessionId: session.id,
      sitePermissions: session.user.sitePermissions,
    };

    if (sessionCache.size >= MAX_SESSION_CACHE_SIZE) {
      const oldestKey = sessionCache.keys().next().value;
      if (oldestKey) sessionCache.delete(oldestKey);
    }
    sessionCache.set(tokenHash, {
      user: authenticatedUser,
      sessionExpiresAt: session.expiresAt.getTime(),
      cachedUntil: nowMs + SESSION_CACHE_TTL_MS,
    });

    if (authenticatedUser.mustChangePassword && !isAllowedDuringPasswordChange(req)) {
      res.status(403).json({
        error: 'Password change required before accessing this resource',
        code: 'MUST_CHANGE_PASSWORD',
      });
      return;
    }

    req.user = authenticatedUser;
    recordUserActivity(authenticatedUser.id, authenticatedUser.sessionId, {
      ip: extractClientIp(req),
      path: (req.originalUrl || `${req.baseUrl}${req.path}`).split('?')[0],
    });

    next();
  } catch {
    res.status(401).json({ error: 'Invalid authentication token' });
  }
}

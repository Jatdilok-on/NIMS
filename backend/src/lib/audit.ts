import { AuditResult, Prisma } from '@prisma/client';
import { Request } from 'express';
import { prisma } from './prisma';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'passwordencrypted',
  'usernameencrypted',
  'secret',
  'token',
  'accesstoken',
  'refreshtoken',
  'apikey',
  'credential',
  'credentials',
  'privatekey',
]);

export function sanitizeAuditDetails(obj: unknown): Prisma.InputJsonValue | undefined {
  if (obj === null || obj === undefined) return undefined;
  if (typeof obj !== 'object') {
    return obj as Prisma.InputJsonValue;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeAuditDetails(item) ?? null) as Prisma.InputJsonValue;
  }
  const result: Record<string, Prisma.InputJsonValue> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      result[key] = '[REDACTED]';
    } else if (value !== undefined) {
      result[key] = (sanitizeAuditDetails(value) ?? null) as Prisma.InputJsonValue;
    }
  }
  return result as Prisma.InputJsonValue;
}

export interface AuditInput {
  req?: Request;
  userId?: string | null;
  username: string;
  action: string;
  module: string;
  siteId?: string | null;
  siteCode?: string | null;
  deviceId?: string | null;
  deviceName?: string | null;
  result?: AuditResult;
  details?: Record<string, unknown>;
}

export function extractClientIp(req?: Request): string | null {
  if (!req) return null;
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || null;
}

export async function recordAuditLog(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        username: input.username,
        action: input.action,
        module: input.module,
        siteId: input.siteId ?? null,
        siteCode: input.siteCode ?? null,
        deviceId: input.deviceId ?? null,
        deviceName: input.deviceName ?? null,
        sourceIp: extractClientIp(input.req),
        userAgent: input.req?.headers['user-agent']?.slice(0, 500) ?? null,
        result: input.result ?? AuditResult.SUCCESS,
        details: sanitizeAuditDetails(input.details),
      },
    });
  } catch (err) {
    // Never log secrets in error fallback
    console.error('Failed to record audit log:', (err as Error).message);
  }
}

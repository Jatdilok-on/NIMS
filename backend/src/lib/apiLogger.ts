import { NextFunction, Request, Response } from 'express';
import { extractClientIp } from './audit';

export interface ApiRequestLogEntry {
  id: number;
  timestamp: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  username: string;
  roleCode: string | null;
  sourceIp: string | null;
  userAgent: string | null;
}

const MAX_API_LOG_ENTRIES = 1500;
const apiLogs: ApiRequestLogEntry[] = [];
let nextEntryId = 1;

const POLLING_PATH_PREFIXES = [
  '/api/health',
  '/api/auth/heartbeat',
  '/api/audit-logs/api-requests',
];

function isPollingPath(urlPath: string): boolean {
  const clean = urlPath.split('?')[0];
  return POLLING_PATH_PREFIXES.some((prefix) => clean === prefix);
}

function sanitizePath(rawUrl: string): string {
  const [pathname, query] = rawUrl.split('?');
  if (!query) return pathname;
  // Redact any token/password/secret query parameter values if ever passed
  const params = new URLSearchParams(query);
  for (const key of Array.from(params.keys())) {
    if (/token|secret|password|key|auth/i.test(key)) {
      params.set(key, '[REDACTED]');
    }
  }
  const rebuilt = params.toString();
  return rebuilt ? `${pathname}?${rebuilt}` : pathname;
}

export function apiRequestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'OPTIONS') {
    next();
    return;
  }

  const startNs = process.hrtime.bigint();
  const fullPath = sanitizePath(req.originalUrl || `${req.baseUrl}${req.path}`);

  res.on('finish', () => {
    const durationMs = Math.max(
      0,
      Math.round(Number(process.hrtime.bigint() - startNs) / 1_000_000),
    );

    const actorUser = req.user;
    const actorAgent = req.siteAgent;
    const fallbackActor = (req as Request & { apiActorName?: string }).apiActorName;
    const username = actorUser
      ? actorUser.username
      : actorAgent
        ? `agent:${actorAgent.name}`
        : fallbackActor || 'anonymous';
    const roleCode = actorUser
      ? actorUser.roleCode
      : actorAgent
        ? 'SITE_AGENT'
        : null;

    apiLogs.push({
      id: nextEntryId++,
      timestamp: new Date().toISOString(),
      method: req.method.toUpperCase(),
      path: fullPath.slice(0, 300),
      statusCode: res.statusCode,
      durationMs,
      username,
      roleCode,
      sourceIp: extractClientIp(req),
      userAgent:
        typeof req.headers['user-agent'] === 'string'
          ? req.headers['user-agent'].slice(0, 160)
          : null,
    });

    if (apiLogs.length > MAX_API_LOG_ENTRIES) {
      apiLogs.splice(0, apiLogs.length - MAX_API_LOG_ENTRIES);
    }
  });

  next();
}

export interface ApiLogQueryOptions {
  method?: string;
  statusGroup?: string;
  username?: string;
  search?: string;
  excludePolling?: boolean;
  page?: number;
  pageSize?: number;
}

export function queryApiRequestLogs(opts: ApiLogQueryOptions) {
  const methodFilter = opts.method?.trim().toUpperCase();
  const statusFilter = opts.statusGroup?.trim().toLowerCase();
  const userFilter = opts.username?.trim().toLowerCase();
  const searchFilter = opts.search?.trim().toLowerCase();
  const excludePolling = Boolean(opts.excludePolling);
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, opts.pageSize ?? 50));

  const filtered: ApiRequestLogEntry[] = [];
  for (let i = apiLogs.length - 1; i >= 0; i--) {
    const entry = apiLogs[i];
    if (excludePolling && isPollingPath(entry.path)) continue;
    if (methodFilter && entry.method !== methodFilter) continue;
    if (statusFilter === '2xx' && (entry.statusCode < 200 || entry.statusCode >= 300)) continue;
    if (statusFilter === '3xx' && (entry.statusCode < 300 || entry.statusCode >= 400)) continue;
    if (statusFilter === '4xx' && (entry.statusCode < 400 || entry.statusCode >= 500)) continue;
    if (statusFilter === '5xx' && entry.statusCode < 500) continue;
    if (userFilter && !entry.username.toLowerCase().includes(userFilter)) continue;
    if (
      searchFilter &&
      !entry.path.toLowerCase().includes(searchFilter) &&
      !entry.username.toLowerCase().includes(searchFilter) &&
      !(entry.sourceIp || '').toLowerCase().includes(searchFilter)
    ) {
      continue;
    }
    filtered.push(entry);
  }

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;
  const logs = filtered.slice(offset, offset + pageSize);

  let errorCount = 0;
  let totalDuration = 0;
  const fiveMinCutoff = Date.now() - 5 * 60 * 1000;
  let last5MinCount = 0;

  for (const item of filtered) {
    if (item.statusCode >= 400) errorCount++;
    totalDuration += item.durationMs;
    if (new Date(item.timestamp).getTime() >= fiveMinCutoff) last5MinCount++;
  }

  return {
    logs,
    stats: {
      totalBuffered: apiLogs.length,
      matchedTotal: total,
      last5MinCount,
      errorCount,
      avgDurationMs: total > 0 ? Math.round(totalDuration / total) : 0,
    },
    pagination: {
      page: safePage,
      pageSize,
      total,
      totalPages,
    },
  };
}

export function clearApiRequestLogs(): number {
  const count = apiLogs.length;
  apiLogs.length = 0;
  return count;
}

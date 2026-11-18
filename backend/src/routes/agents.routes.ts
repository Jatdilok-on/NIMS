import fs from 'fs';
import path from 'path';
import { NextFunction, Request, Response, Router } from 'express';
import { Prisma, RoleCode } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { hashToken } from '../lib/crypto';
import { extractClientIp, recordAuditLog } from '../lib/audit';
import {
  canManageSiteAgents,
  computeAgentConnectionState,
  evaluateDevicePingOutcome,
  generateAgentTokenPair,
  isAgentTargetIpValid,
} from '../lib/agentService';

const router = Router();

interface AuthenticatedAgent {
  id: string;
  siteId: string;
  name: string;
  isActive: boolean;
  pollIntervalSec: number;
  offlineThreshold: number;
}

declare global {
  namespace Express {
    interface Request {
      siteAgent?: AuthenticatedAgent;
    }
  }
}

function extractAgentToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const xHeader = req.headers['x-agent-token'];
  if (typeof xHeader === 'string' && xHeader.trim()) {
    return xHeader.trim();
  }
  return null;
}

async function authenticateAgent(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawToken = extractAgentToken(req);
    if (!rawToken || !rawToken.startsWith('nims_agt_')) {
      res.status(401).json({ error: 'Valid site agent token is required' });
      return;
    }

    const tokenHash = hashToken(rawToken);
    const agent = await prisma.siteAgent.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        siteId: true,
        name: true,
        isActive: true,
        pollIntervalSec: true,
        offlineThreshold: true,
      },
    });

    if (!agent) {
      res.status(401).json({ error: 'Invalid site agent token' });
      return;
    }

    if (!agent.isActive) {
      res.status(403).json({ error: 'Site agent is disabled' });
      return;
    }

    req.siteAgent = agent;
    next();
  } catch (err) {
    next(err);
  }
}

function resolveAgentScriptPath(relFile = 'nims-agent.mjs'): string | null {
  const candidates = [
    path.resolve(process.cwd(), '../agent', relFile),
    path.resolve(process.cwd(), 'agent', relFile),
    path.resolve(__dirname, '../../../agent', relFile),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// ============================================================================
// AGENT RUNTIME ENDPOINTS (Token Auth - called by remote site probes)
// ============================================================================

const reportSchema = z.object({
  hostname: z.string().max(200).optional().nullable(),
  localIp: z.string().max(64).optional().nullable(),
  platform: z.string().max(100).optional().nullable(),
  agentVersion: z.string().max(40).optional().nullable(),
  durationMs: z.number().int().nonnegative().max(600000).optional(),
  results: z
    .array(
      z.object({
        deviceId: z.string().min(1),
        alive: z.boolean(),
        latencyMs: z.number().nonnegative().max(60000).nullable().optional(),
        method: z.string().max(32).optional(),
      }),
    )
    .max(5000),
});

router.get('/runtime/script', authenticateAgent, (_req, res) => {
  const scriptPath = resolveAgentScriptPath();
  if (!scriptPath) {
    res.status(404).json({ error: 'Agent script file not found on server' });
    return;
  }
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="nims-agent.mjs"');
  res.sendFile(scriptPath);
});

router.get('/runtime/targets', authenticateAgent, async (req, res, next) => {
  try {
    const agent = req.siteAgent!;
    const now = new Date();

    const hostname =
      typeof req.headers['x-agent-hostname'] === 'string'
        ? req.headers['x-agent-hostname'].slice(0, 200)
        : undefined;
    const platform =
      typeof req.headers['x-agent-platform'] === 'string'
        ? req.headers['x-agent-platform'].slice(0, 100)
        : undefined;
    const agentVersion =
      typeof req.headers['x-agent-version'] === 'string'
        ? req.headers['x-agent-version'].slice(0, 40)
        : undefined;
    const localIp =
      typeof req.headers['x-agent-local-ip'] === 'string'
        ? req.headers['x-agent-local-ip'].slice(0, 64)
        : extractClientIp(req) ?? undefined;

    const isRelaySync = req.headers['x-relay-sync'] === '1';

    const [site, devices] = await Promise.all([
      prisma.site.findUnique({
        where: { id: agent.siteId },
        select: { id: true, siteCode: true, siteName: true },
      }),
      prisma.device.findMany({
        where: {
          siteId: agent.siteId,
          managementIp: { not: null },
        },
        select: {
          id: true,
          name: true,
          category: true,
          managementIp: true,
          status: true,
          monitorEnabled: true,
        },
        orderBy: { name: 'asc' },
      }),
      ...(isRelaySync
        ? []
        : [
            prisma.siteAgent.update({
              where: { id: agent.id },
              data: {
                lastHeartbeatAt: now,
                ...(hostname ? { hostname } : {}),
                ...(platform ? { platform } : {}),
                ...(agentVersion ? { agentVersion } : {}),
                ...(localIp ? { localIp } : {}),
              },
            }),
          ]),
    ]);

    const targets = devices
      .filter((d) => d.monitorEnabled !== false && isAgentTargetIpValid(d.managementIp))
      .map((d) => ({
        id: d.id,
        name: d.name,
        category: d.category,
        managementIp: d.managementIp!.trim(),
        status: d.status,
      }));

    res.json({
      agent: {
        id: agent.id,
        name: agent.name,
        pollIntervalSec: agent.pollIntervalSec,
        offlineThreshold: agent.offlineThreshold,
      },
      site,
      targets,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/runtime/report', authenticateAgent, async (req, res, next) => {
  try {
    const parsed = reportSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid ping report payload' });
      return;
    }

    const agent = req.siteAgent!;
    const now = new Date();
    const body = parsed.data;

    const site = await prisma.site.findUnique({
      where: { id: agent.siteId },
      select: { id: true, siteCode: true },
    });

    const siteDevices = await prisma.device.findMany({
      where: { siteId: agent.siteId },
      select: {
        id: true,
        name: true,
        managementIp: true,
        status: true,
        consecutiveMisses: true,
        monitorEnabled: true,
      },
    });
    const deviceMap = new Map(siteDevices.map((d) => [d.id, d]));

    const updates: Prisma.PrismaPromise<unknown>[] = [];
    const transitions: Array<{
      deviceId: string;
      deviceName: string;
      fromStatus: string;
      toStatus: string;
      latencyMs: number | null;
      method?: string;
    }> = [];

    let upCount = 0;
    let downCount = 0;
    let ignoredCount = 0;

    for (const r of body.results) {
      const dev = deviceMap.get(r.deviceId);
      if (!dev || dev.monitorEnabled === false) {
        ignoredCount++;
        continue;
      }

      if (r.alive) upCount++;
      else downCount++;

      const evalResult = evaluateDevicePingOutcome({
        currentStatus: dev.status,
        currentMisses: dev.consecutiveMisses ?? 0,
        alive: r.alive,
        latencyMs: r.latencyMs ?? null,
        offlineThreshold: agent.offlineThreshold,
        now,
      });

      updates.push(
        prisma.device.update({
          where: { id: dev.id },
          data: {
            status: evalResult.nextStatus,
            consecutiveMisses: evalResult.nextMisses,
            lastPingAt: evalResult.lastPingAt,
            lastLatencyMs: evalResult.lastLatencyMs,
            ...(evalResult.lastSeenAt ? { lastSeenAt: evalResult.lastSeenAt } : {}),
          },
        }),
      );

      if (evalResult.statusChanged) {
        transitions.push({
          deviceId: dev.id,
          deviceName: dev.name,
          fromStatus: dev.status,
          toStatus: evalResult.nextStatus,
          latencyMs: evalResult.lastLatencyMs,
          method: r.method,
        });
      }
    }

    const summary = {
      total: upCount + downCount,
      up: upCount,
      down: downCount,
      ignored: ignoredCount,
      durationMs: body.durationMs ?? null,
      reportedAt: now.toISOString(),
    };

    for (let i = 0; i < updates.length; i += 20) {
      await Promise.all(updates.slice(i, i + 20));
    }
    await prisma.siteAgent.update({
      where: { id: agent.id },
      data: {
        lastHeartbeatAt: now,
        lastReportSummary: summary as Prisma.InputJsonValue,
        ...(body.hostname ? { hostname: body.hostname } : {}),
        ...(body.localIp ? { localIp: body.localIp } : (extractClientIp(req) ? { localIp: extractClientIp(req) } : {})),
        ...(body.platform ? { platform: body.platform } : {}),
        ...(body.agentVersion ? { agentVersion: body.agentVersion } : {}),
      },
    });

    for (const tr of transitions) {
      await recordAuditLog({
        req,
        username: `agent:${agent.name}`,
        action: 'DEVICE_STATUS_TRANSITION',
        module: 'MONITORING',
        siteId: agent.siteId,
        siteCode: site?.siteCode,
        deviceId: tr.deviceId,
        deviceName: tr.deviceName,
        details: {
          agentId: agent.id,
          fromStatus: tr.fromStatus,
          toStatus: tr.toStatus,
          latencyMs: tr.latencyMs,
          method: tr.method || 'ICMP',
        },
      });
    }

    res.json({
      ok: true,
      updated: updates.length,
      transitions: transitions.length,
      summary,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// ADMIN / WEB UI ENDPOINTS (Session Cookie + RBAC Auth)
// ============================================================================

router.use(authenticate);
router.use(requireRoles(RoleCode.SUPER_ADMIN, RoleCode.SITE_ADMIN));

function serializeAgent(agent: {
  id: string;
  siteId: string;
  name: string;
  tokenPrefix: string;
  isActive: boolean;
  pollIntervalSec: number;
  offlineThreshold: number;
  hostname: string | null;
  localIp: string | null;
  platform: string | null;
  agentVersion: string | null;
  lastHeartbeatAt: Date | null;
  lastReportSummary: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  site?: { id: string; siteCode: string; siteName: string };
}) {
  return {
    ...agent,
    connectionState: computeAgentConnectionState(agent),
  };
}

router.get('/script', (_req, res) => {
  const scriptPath = resolveAgentScriptPath('nims-agent.mjs');
  if (!scriptPath) {
    res.status(404).json({ error: 'Agent script file not found on server' });
    return;
  }
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="nims-agent.mjs"');
  res.sendFile(scriptPath);
});

router.get('/relay-script', (_req, res) => {
  const scriptPath = resolveAgentScriptPath('relay/nims-relay-bridge.mjs');
  if (!scriptPath) {
    res.status(404).json({ error: 'Relay bridge script file not found on server' });
    return;
  }
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="nims-relay-bridge.mjs"');
  res.sendFile(scriptPath);
});

router.get('/', async (req, res, next) => {
  try {
    const requestedSiteId =
      typeof req.query.siteId === 'string' && req.query.siteId.trim()
        ? req.query.siteId.trim()
        : undefined;

    if (requestedSiteId) {
      if (!canManageSiteAgents(req.user!, requestedSiteId)) {
        res.status(403).json({ error: 'Access denied to requested site' });
        return;
      }
    }

    const where: Prisma.SiteAgentWhereInput = {};
    if (requestedSiteId) {
      where.siteId = requestedSiteId;
    } else if (req.user!.roleCode !== RoleCode.SUPER_ADMIN) {
      where.siteId = { in: req.user!.sitePermissions.map((p) => p.siteId) };
    }

    const agents = await prisma.siteAgent.findMany({
      where,
      select: {
        id: true,
        siteId: true,
        name: true,
        tokenPrefix: true,
        isActive: true,
        pollIntervalSec: true,
        offlineThreshold: true,
        hostname: true,
        localIp: true,
        platform: true,
        agentVersion: true,
        lastHeartbeatAt: true,
        lastReportSummary: true,
        createdAt: true,
        updatedAt: true,
        site: { select: { id: true, siteCode: true, siteName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ agents: agents.map(serializeAgent) });
  } catch (err) {
    next(err);
  }
});

const createAgentSchema = z.object({
  siteId: z.string().min(1),
  name: z.string().trim().min(2).max(100),
  pollIntervalSec: z.number().int().min(10).max(3600).optional(),
  offlineThreshold: z.number().int().min(1).max(10).optional(),
});

router.post('/', async (req, res, next) => {
  try {
    const parsed = createAgentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid agent payload' });
      return;
    }

    const { siteId, name, pollIntervalSec = 60, offlineThreshold = 3 } = parsed.data;
    if (!canManageSiteAgents(req.user!, siteId)) {
      res.status(403).json({ error: 'Admin permission required to create a site agent' });
      return;
    }

    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, siteCode: true, siteName: true },
    });
    if (!site) {
      res.status(404).json({ error: 'Site not found' });
      return;
    }

    const { rawToken, tokenPrefix, tokenHash } = generateAgentTokenPair();

    const created = await prisma.siteAgent.create({
      data: {
        siteId,
        name,
        tokenPrefix,
        tokenHash,
        pollIntervalSec,
        offlineThreshold,
      },
      select: {
        id: true,
        siteId: true,
        name: true,
        tokenPrefix: true,
        isActive: true,
        pollIntervalSec: true,
        offlineThreshold: true,
        hostname: true,
        localIp: true,
        platform: true,
        agentVersion: true,
        lastHeartbeatAt: true,
        lastReportSummary: true,
        createdAt: true,
        updatedAt: true,
        site: { select: { id: true, siteCode: true, siteName: true } },
      },
    });

    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'CREATE_SITE_AGENT',
      module: 'MONITORING',
      siteId: site.id,
      siteCode: site.siteCode,
      details: { agentId: created.id, name, pollIntervalSec, offlineThreshold },
    });

    res.status(201).json({
      agent: serializeAgent(created),
      rawToken,
    });
  } catch (err) {
    next(err);
  }
});

const updateAgentSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  isActive: z.boolean().optional(),
  pollIntervalSec: z.number().int().min(10).max(3600).optional(),
  offlineThreshold: z.number().int().min(1).max(10).optional(),
});

router.patch('/:id', async (req, res, next) => {
  try {
    const parsed = updateAgentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid update payload' });
      return;
    }

    const agentId = String(req.params.id);
    const existing = await prisma.siteAgent.findUnique({
      where: { id: agentId },
      include: { site: { select: { id: true, siteCode: true, siteName: true } } },
    });
    if (!existing) {
      res.status(404).json({ error: 'Site agent not found' });
      return;
    }

    if (!canManageSiteAgents(req.user!, existing.siteId)) {
      res.status(403).json({ error: 'Admin permission required' });
      return;
    }

    const updated = await prisma.siteAgent.update({
      where: { id: existing.id },
      data: parsed.data,
      select: {
        id: true,
        siteId: true,
        name: true,
        tokenPrefix: true,
        isActive: true,
        pollIntervalSec: true,
        offlineThreshold: true,
        hostname: true,
        localIp: true,
        platform: true,
        agentVersion: true,
        lastHeartbeatAt: true,
        lastReportSummary: true,
        createdAt: true,
        updatedAt: true,
        site: { select: { id: true, siteCode: true, siteName: true } },
      },
    });

    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'UPDATE_SITE_AGENT',
      module: 'MONITORING',
      siteId: existing.siteId,
      siteCode: existing.site.siteCode,
      details: { agentId: existing.id, ...parsed.data },
    });

    res.json({ agent: serializeAgent(updated) });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/rotate-token', async (req, res, next) => {
  try {
    const agentId = String(req.params.id);
    const existing = await prisma.siteAgent.findUnique({
      where: { id: agentId },
      include: { site: { select: { id: true, siteCode: true, siteName: true } } },
    });
    if (!existing) {
      res.status(404).json({ error: 'Site agent not found' });
      return;
    }

    if (!canManageSiteAgents(req.user!, existing.siteId)) {
      res.status(403).json({ error: 'Admin permission required' });
      return;
    }

    const { rawToken, tokenPrefix, tokenHash } = generateAgentTokenPair();
    const updated = await prisma.siteAgent.update({
      where: { id: existing.id },
      data: { tokenPrefix, tokenHash },
      select: {
        id: true,
        siteId: true,
        name: true,
        tokenPrefix: true,
        isActive: true,
        pollIntervalSec: true,
        offlineThreshold: true,
        hostname: true,
        localIp: true,
        platform: true,
        agentVersion: true,
        lastHeartbeatAt: true,
        lastReportSummary: true,
        createdAt: true,
        updatedAt: true,
        site: { select: { id: true, siteCode: true, siteName: true } },
      },
    });

    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'ROTATE_SITE_AGENT_TOKEN',
      module: 'MONITORING',
      siteId: existing.siteId,
      siteCode: existing.site.siteCode,
      details: { agentId: existing.id, name: existing.name },
    });

    res.json({ agent: serializeAgent(updated), rawToken });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const agentId = String(req.params.id);
    const existing = await prisma.siteAgent.findUnique({
      where: { id: agentId },
      include: { site: { select: { id: true, siteCode: true } } },
    });
    if (!existing) {
      res.status(404).json({ error: 'Site agent not found' });
      return;
    }

    if (!canManageSiteAgents(req.user!, existing.siteId)) {
      res.status(403).json({ error: 'Admin permission required' });
      return;
    }

    await prisma.siteAgent.delete({ where: { id: existing.id } });

    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'DELETE_SITE_AGENT',
      module: 'MONITORING',
      siteId: existing.siteId,
      siteCode: existing.site.siteCode,
      details: { agentId: existing.id, name: existing.name },
    });

    res.json({ message: 'Site agent deleted' });
  } catch (err) {
    next(err);
  }
});

router.patch('/devices/:deviceId/monitoring', async (req, res, next) => {
  try {
    const parsed = z.object({ monitorEnabled: z.boolean() }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'monitorEnabled boolean is required' });
      return;
    }

    const deviceId = String(req.params.deviceId);
    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      include: { site: { select: { id: true, siteCode: true } } },
    });
    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    if (!canManageSiteAgents(req.user!, device.siteId)) {
      res.status(403).json({ error: 'Admin permission required' });
      return;
    }

    const updated = await prisma.device.update({
      where: { id: device.id },
      data: { monitorEnabled: parsed.data.monitorEnabled },
      select: { id: true, name: true, monitorEnabled: true },
    });

    res.json({ device: updated });
  } catch (err) {
    next(err);
  }
});

export default router;

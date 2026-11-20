import { DeviceStatus, RoleCode } from '@prisma/client';
import { generateRandomToken, hashToken } from './crypto';
import { isValidIpv4 } from './ipam';
import { prisma } from './prisma';

export type AgentConnectionState = 'ONLINE' | 'OFFLINE' | 'NEVER_CONNECTED' | 'DISABLED';

export interface PingEvaluationInput {
  currentStatus: DeviceStatus;
  currentMisses: number;
  alive: boolean;
  latencyMs: number | null;
  offlineThreshold: number;
  now: Date;
}

export interface PingEvaluationOutput {
  nextStatus: DeviceStatus;
  nextMisses: number;
  lastPingAt: Date;
  lastSeenAt?: Date;
  lastLatencyMs: number | null;
  statusChanged: boolean;
}

/**
 * Generates a prefixed raw token (returned once to the admin) and its SHA-256 hash.
 */
export function generateAgentTokenPair(): {
  rawToken: string;
  tokenPrefix: string;
  tokenHash: string;
} {
  const rawToken = `nims_agt_${generateRandomToken(24)}`;
  const tokenPrefix = rawToken.slice(0, 16);
  const tokenHash = hashToken(rawToken);
  return { rawToken, tokenPrefix, tokenHash };
}

/**
 * Computes whether a Site Agent is currently online based on its heartbeat cadence.
 */
export function computeAgentConnectionState(
  agent: { isActive: boolean; pollIntervalSec: number; lastHeartbeatAt: Date | null },
  now: Date = new Date(),
): AgentConnectionState {
  if (!agent.isActive) return 'DISABLED';
  if (!agent.lastHeartbeatAt) return 'NEVER_CONNECTED';
  const staleWindowMs = Math.max(agent.pollIntervalSec * 3, 180) * 1000;
  return now.getTime() - agent.lastHeartbeatAt.getTime() <= staleWindowMs
    ? 'ONLINE'
    : 'OFFLINE';
}

/**
 * Evaluates a single ping outcome against consecutive-miss threshold and MAINTENANCE lock.
 */
export function evaluateDevicePingOutcome(input: PingEvaluationInput): PingEvaluationOutput {
  const threshold = Math.max(1, input.offlineThreshold);
  const isMaintenance = input.currentStatus === DeviceStatus.MAINTENANCE;

  if (input.alive) {
    const nextStatus = isMaintenance ? DeviceStatus.MAINTENANCE : DeviceStatus.ONLINE;
    return {
      nextStatus,
      nextMisses: 0,
      lastPingAt: input.now,
      lastSeenAt: input.now,
      lastLatencyMs: input.latencyMs !== null && input.latencyMs >= 0 ? Math.round(input.latencyMs) : null,
      statusChanged: nextStatus !== input.currentStatus,
    };
  }

  const nextMisses = Math.max(0, input.currentMisses) + 1;
  let nextStatus = input.currentStatus;
  if (!isMaintenance && nextMisses >= threshold) {
    nextStatus = DeviceStatus.OFFLINE;
  }

  return {
    nextStatus,
    nextMisses,
    lastPingAt: input.now,
    lastLatencyMs: null,
    statusChanged: nextStatus !== input.currentStatus,
  };
}

export function isAgentTargetIpValid(ip: string | null | undefined): ip is string {
  return Boolean(ip && isValidIpv4(ip.trim()));
}

/**
 * Only SUPER_ADMIN (any site) and SITE_ADMIN (assigned sites) may view or manage Site Agents.
 */
export function canManageSiteAgents(
  user: { roleCode: RoleCode; sitePermissions: Array<{ siteId: string }> },
  siteId: string,
): boolean {
  if (user.roleCode === RoleCode.SUPER_ADMIN) {
    return true;
  }
  if (user.roleCode === RoleCode.SITE_ADMIN) {
    return user.sitePermissions.some((p) => p.siteId === siteId);
  }
  return false;
}

/**
 * Returns the set of siteIds that currently have at least one ONLINE Site Agent.
 */
export async function getLiveAgentSiteIds(siteIds?: string[]): Promise<Set<string>> {
  const agents = await prisma.siteAgent.findMany({
    where: {
      isActive: true,
      lastHeartbeatAt: { not: null },
      ...(siteIds && siteIds.length > 0 ? { siteId: { in: siteIds } } : {}),
    },
    select: {
      siteId: true,
      isActive: true,
      pollIntervalSec: true,
      lastHeartbeatAt: true,
    },
  });

  const now = new Date();
  const liveSiteIds = new Set<string>();
  for (const agent of agents) {
    if (computeAgentConnectionState(agent, now) === 'ONLINE') {
      liveSiteIds.add(agent.siteId);
    }
  }
  return liveSiteIds;
}

export function isDeviceMonitoredByLiveAgent(
  device: { siteId: string; managementIp?: string | null; monitorEnabled?: boolean | null },
  liveSiteIds: Set<string>,
): boolean {
  return (
    liveSiteIds.has(device.siteId) &&
    device.monitorEnabled !== false &&
    isAgentTargetIpValid(device.managementIp)
  );
}

/**
 * Devices not actively monitored by a live Site Agent (or never pinged by one)
 * report UNKNOWN status instead of stale ONLINE/OFFLINE, unless in MAINTENANCE.
 */
export function resolveEffectiveDeviceStatus(
  device: {
    siteId: string;
    status: DeviceStatus;
    managementIp?: string | null;
    monitorEnabled?: boolean | null;
    lastPingAt?: Date | string | null;
  },
  liveSiteIds: Set<string>,
): DeviceStatus {
  if (device.status === DeviceStatus.MAINTENANCE) {
    return DeviceStatus.MAINTENANCE;
  }
  if (!isDeviceMonitoredByLiveAgent(device, liveSiteIds) || !device.lastPingAt) {
    return DeviceStatus.UNKNOWN;
  }
  return device.status;
}

export function withAgentTelemetry<
  T extends {
    siteId: string;
    status: DeviceStatus;
    managementIp?: string | null;
    monitorEnabled?: boolean | null;
    lastPingAt?: Date | string | null;
    lastLatencyMs?: number | null;
  },
>(device: T, liveSiteIds: Set<string>): T & { agentLive: boolean } {
  const agentLive = isDeviceMonitoredByLiveAgent(device, liveSiteIds);
  const status = resolveEffectiveDeviceStatus(device, liveSiteIds);
  return {
    ...device,
    status,
    agentLive,
    lastLatencyMs: agentLive && status === DeviceStatus.ONLINE ? device.lastLatencyMs ?? null : null,
  };
}

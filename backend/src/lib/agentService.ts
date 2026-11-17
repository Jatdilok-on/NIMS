import { DeviceStatus } from '@prisma/client';
import { generateRandomToken, hashToken } from './crypto';
import { isValidIpv4 } from './ipam';

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

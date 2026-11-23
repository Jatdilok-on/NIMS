export const USER_ONLINE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const STALE_RECORD_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface SessionPresenceEntry {
  lastSeenAt: number;
  expiresAt?: number;
  ip?: string;
  lastPath?: string;
}

interface UserPresenceRecord {
  lastSeenAt: number;
  ip?: string;
  lastPath?: string;
  sessions: Map<string, SessionPresenceEntry>;
}

const presenceByUser = new Map<string, UserPresenceRecord>();
let lastPruneAt = 0;

function pruneStalePresence(now: number): void {
  if (now - lastPruneAt < 60_000) return;
  lastPruneAt = now;
  for (const [userId, rec] of presenceByUser.entries()) {
    for (const [sid, s] of rec.sessions.entries()) {
      if (now - s.lastSeenAt > STALE_RECORD_TTL_MS || (s.expiresAt && s.expiresAt <= now)) {
        rec.sessions.delete(sid);
      }
    }
    if (rec.sessions.size === 0 && now - rec.lastSeenAt > STALE_RECORD_TTL_MS) {
      presenceByUser.delete(userId);
    }
  }
}

export function recordUserActivity(
  userId: string,
  sessionId: string,
  meta?: { ip?: string | null; path?: string | null; expiresAt?: number },
): void {
  const now = Date.now();
  pruneStalePresence(now);

  let rec = presenceByUser.get(userId);
  if (!rec) {
    rec = { lastSeenAt: now, sessions: new Map() };
    presenceByUser.set(userId, rec);
  }

  rec.lastSeenAt = now;
  if (meta?.ip) rec.ip = meta.ip;
  if (meta?.path) rec.lastPath = meta.path;

  const existingSession = rec.sessions.get(sessionId);
  rec.sessions.set(sessionId, {
    lastSeenAt: now,
    expiresAt: meta?.expiresAt ?? existingSession?.expiresAt,
    ip: meta?.ip || existingSession?.ip,
    lastPath: meta?.path || existingSession?.lastPath,
  });
}

export function removeSessionPresence(userId: string, sessionId: string): void {
  const rec = presenceByUser.get(userId);
  if (!rec) return;
  rec.sessions.delete(sessionId);
  // Keep rec.lastSeenAt intact when sessions drop to 0 so lastActiveAt does not jump backwards to lastLoginAt
  if (rec.sessions.size === 0) {
    return;
  }
  let maxSeen = -1;
  let latestIp: string | undefined;
  let latestPath: string | undefined;
  for (const s of rec.sessions.values()) {
    if (s.lastSeenAt >= maxSeen) {
      maxSeen = s.lastSeenAt;
      latestIp = s.ip;
      latestPath = s.lastPath;
    }
  }
  rec.lastSeenAt = maxSeen >= 0 ? maxSeen : rec.lastSeenAt;
  rec.ip = latestIp;
  rec.lastPath = latestPath;
}

export function removeOtherSessionsPresence(userId: string, keepSessionId: string): void {
  const rec = presenceByUser.get(userId);
  if (!rec) return;
  for (const sid of Array.from(rec.sessions.keys())) {
    if (sid !== keepSessionId) {
      rec.sessions.delete(sid);
    }
  }
  const kept = rec.sessions.get(keepSessionId);
  if (kept) {
    rec.lastSeenAt = kept.lastSeenAt;
    rec.ip = kept.ip;
    rec.lastPath = kept.lastPath;
  }
}

export function removeUserPresence(userId: string): void {
  presenceByUser.delete(userId);
}

export interface UserPresenceSnapshot {
  isOnline: boolean;
  lastActiveAt: string | null;
  activeSessionCount: number;
  lastKnownIp: string | null;
  lastPath: string | null;
}

export function getUserPresence(
  userId: string,
  fallbackLastLoginAt?: Date | null,
): UserPresenceSnapshot {
  const now = Date.now();
  const rec = presenceByUser.get(userId);

  if (!rec) {
    return {
      isOnline: false,
      lastActiveAt: fallbackLastLoginAt ? fallbackLastLoginAt.toISOString() : null,
      activeSessionCount: 0,
      lastKnownIp: null,
      lastPath: null,
    };
  }

  let onlineSessionCount = 0;
  for (const s of rec.sessions.values()) {
    if (s.expiresAt && s.expiresAt <= now) continue;
    if (now - s.lastSeenAt <= USER_ONLINE_TTL_MS) {
      onlineSessionCount++;
    }
  }

  const lastSeenMs = Math.max(rec.lastSeenAt, fallbackLastLoginAt?.getTime() ?? 0);

  return {
    isOnline: onlineSessionCount > 0,
    lastActiveAt: lastSeenMs > 0 ? new Date(lastSeenMs).toISOString() : null,
    activeSessionCount: onlineSessionCount,
    lastKnownIp: rec.ip ?? null,
    lastPath: rec.lastPath ?? null,
  };
}

#!/usr/bin/env node
/**
 * NIMS Notebook Relay Bridge (Zero-Dependency)
 *
 * Runs on a Notebook that can reach BOTH:
 *   1) Local NIMS Server on LAN (e.g. https://191.20.110.191:3000)
 *   2) Cloudflare Worker Relay over outbound HTTPS (e.g. https://nims-relay.xxx.workers.dev)
 *
 * Requirements: Node.js 18+ (no npm install required)
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

function parseConfigArg(argv) {
  for (let i = 0; i < argv.length; i++) {
    if ((argv[i] === '--config' || argv[i] === '-c') && argv[i + 1]) {
      return path.resolve(argv[i + 1]);
    }
  }
  return null;
}

const explicitConfig = parseConfigArg(process.argv.slice(2));
const candidates = explicitConfig
  ? [explicitConfig]
  : [
      path.join(process.cwd(), 'nims-relay-bridge.env'),
      path.join(__dirname, 'nims-relay-bridge.env'),
    ];
const activeEnvPath = candidates.find((p) => fs.existsSync(p)) || null;
for (const p of candidates) {
  loadEnvFile(p);
}

if (process.env.NIMS_ALLOW_INSECURE_TLS === 'true') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const NIMS_URL = (process.env.NIMS_URL || '').replace(/\/+$/, '');
const RELAY_URL = (process.env.RELAY_URL || '').replace(/\/+$/, '');
const BRIDGE_SECRET = (process.env.BRIDGE_SECRET || '').trim();
const BRIDGE_POLL_SEC = Math.max(5, parseInt(process.env.BRIDGE_POLL_SEC || '15', 10));
const TARGETS_SYNC_SEC = Math.max(30, parseInt(process.env.TARGETS_SYNC_SEC || '120', 10));

function parseTokenList(raw) {
  return (raw || '')
    .split(/[\r\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const TOKENS = parseTokenList(process.env.NIMS_AGENT_TOKENS);

if (!NIMS_URL || !RELAY_URL || !BRIDGE_SECRET || TOKENS.length === 0) {
  console.error(
    '[NIMS Relay Bridge] Missing required settings.\n' +
      'Required: NIMS_URL, RELAY_URL, BRIDGE_SECRET, NIMS_AGENT_TOKENS\n' +
      'Create nims-relay-bridge.env from nims-relay-bridge.env.example.',
  );
  process.exit(1);
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

const tokenByHash = new Map();
function rebuildTokenMap(tokens) {
  tokenByHash.clear();
  for (const token of tokens) {
    tokenByHash.set(sha256Hex(token), token);
  }
}
rebuildTokenMap(TOKENS);

let lastEnvMtimeMs = activeEnvPath ? fs.statSync(activeEnvPath).mtimeMs : 0;
function reloadTokensIfEnvChanged() {
  if (!activeEnvPath || !fs.existsSync(activeEnvPath)) return false;
  try {
    const stat = fs.statSync(activeEnvPath);
    if (stat.mtimeMs === lastEnvMtimeMs) return false;
    lastEnvMtimeMs = stat.mtimeMs;
    const content = fs.readFileSync(activeEnvPath, 'utf8');
    const match = content.match(/^\s*NIMS_AGENT_TOKENS\s*=\s*(.+)$/m);
    if (!match) return false;
    const raw = match[1].trim().replace(/^["']|["']$/g, '');
    const nextTokens = parseTokenList(raw);
    if (nextTokens.length === 0) return false;
    rebuildTokenMap(nextTokens);
    console.log(`[${new Date().toISOString()}] Reloaded NIMS_AGENT_TOKENS (${tokenByHash.size} site(s)) from ${path.basename(activeEnvPath)}.`);
    return true;
  } catch {
    return false;
  }
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} (${url}): ${data.error || text || res.statusText}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

const lastTargetDigestByHash = new Map();
let lastTargetsSyncAt = 0;

async function syncTargetsIfDue() {
  const now = Date.now();
  if (now - lastTargetsSyncAt < TARGETS_SYNC_SEC * 1000) return;
  lastTargetsSyncAt = now;

  const changedItems = [];
  for (const [tokenHash, token] of tokenByHash.entries()) {
    try {
      const payload = await fetchJson(`${NIMS_URL}/api/agents/runtime/targets`, {
        method: 'GET',
        headers: {
          authorization: `Bearer ${token}`,
          'x-relay-sync': '1',
        },
      });
      const digest = sha256Hex(JSON.stringify(payload));
      if (lastTargetDigestByHash.get(tokenHash) !== digest) {
        changedItems.push({ tokenHash, payload, digest });
      }
    } catch (err) {
      console.error(`[NIMS Relay Bridge] Failed reading targets from NIMS (${tokenHash.slice(0, 8)}): ${err.message}`);
    }
  }

  if (changedItems.length === 0) return;

  await fetchJson(`${RELAY_URL}/bridge/targets`, {
    method: 'POST',
    headers: { 'x-bridge-secret': BRIDGE_SECRET },
    body: JSON.stringify({
      items: changedItems.map(({ tokenHash, payload }) => ({ tokenHash, payload })),
    }),
  });

  for (const item of changedItems) {
    lastTargetDigestByHash.set(item.tokenHash, item.digest);
  }
  console.log(`[${new Date().toISOString()}] Synced targets to Cloudflare Relay for ${changedItems.length} site(s).`);
}

async function forwardPendingReports() {
  const res = await fetchJson(`${RELAY_URL}/bridge/reports`, {
    method: 'GET',
    headers: { 'x-bridge-secret': BRIDGE_SECRET },
  });

  const reports = Array.isArray(res.reports) ? res.reports : [];
  if (reports.length === 0) return;

  const ackItems = [];
  for (const rep of reports) {
    const token = tokenByHash.get(rep.tokenHash);
    if (!token) {
      console.warn(`[NIMS Relay Bridge] Unknown tokenHash ${rep.tokenHash?.slice(0, 8)} — add its token to NIMS_AGENT_TOKENS.`);
      continue;
    }
    if (!rep.payload) continue;

    try {
      const forwarded = await fetchJson(`${NIMS_URL}/api/agents/runtime/report`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          ...(rep.payload.hostname ? { 'x-agent-hostname': String(rep.payload.hostname) } : {}),
          ...(rep.payload.localIp ? { 'x-agent-local-ip': String(rep.payload.localIp) } : {}),
        },
        body: JSON.stringify(rep.payload),
      });
      ackItems.push({ tokenHash: rep.tokenHash, reportedAt: rep.reportedAt });
      const count = Array.isArray(rep.payload.results) ? rep.payload.results.length : 0;
      console.log(
        `[${new Date().toISOString()}] Forwarded report (${rep.payload.hostname || rep.tokenHash.slice(0, 8)}): ${count} target(s), updated=${forwarded.updated ?? count}`,
      );
    } catch (err) {
      console.error(`[NIMS Relay Bridge] Failed forwarding report to NIMS: ${err.message}`);
    }
  }

  if (ackItems.length > 0) {
    await fetchJson(`${RELAY_URL}/bridge/reports/ack`, {
      method: 'POST',
      headers: { 'x-bridge-secret': BRIDGE_SECRET },
      body: JSON.stringify({ items: ackItems }),
    });
  }
}

async function loop() {
  console.log(
    `[NIMS Relay Bridge] Started.\n` +
      `  Local NIMS : ${NIMS_URL}\n` +
      `  Cloud Relay: ${RELAY_URL}\n` +
      `  Sites      : ${tokenByHash.size} token(s)\n` +
      `  Poll       : every ${BRIDGE_POLL_SEC}s (targets sync every ${TARGETS_SYNC_SEC}s)`,
  );

  while (true) {
    if (reloadTokensIfEnvChanged()) {
      lastTargetsSyncAt = 0;
    }
    try {
      await syncTargetsIfDue();
    } catch (err) {
      console.error(`[NIMS Relay Bridge] Targets sync error: ${err.message}`);
    }
    try {
      await forwardPendingReports();
    } catch (err) {
      console.error(`[NIMS Relay Bridge] Reports poll error: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, BRIDGE_POLL_SEC * 1000));
  }
}

loop().catch((err) => {
  console.error('[NIMS Relay Bridge] Fatal error:', err);
  process.exit(1);
});

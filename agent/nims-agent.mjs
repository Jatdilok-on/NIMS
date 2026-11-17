#!/usr/bin/env node
/**
 * NIMS Site Ping Agent (Zero-Dependency Standalone Probe)
 *
 * Runs inside a remote site/plant/customer LAN, fetches device targets for
 * its assigned site from the central NIMS server over HTTP/HTTPS, pings all
 * targets locally (ICMP + optional TCP fallback), and reports UP/DOWN status
 * and latency back to NIMS.
 *
 * Requirements: Node.js 18+ (no npm install required)
 */

import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AGENT_VERSION = '1.0.0';
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

function parseCliArgs(argv) {
  const opts = { once: false, configPath: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--once') {
      opts.once = true;
    } else if ((arg === '--config' || arg === '-c') && argv[i + 1]) {
      opts.configPath = path.resolve(argv[++i]);
    }
  }
  return opts;
}

const cli = parseCliArgs(process.argv.slice(2));
if (cli.configPath) {
  loadEnvFile(cli.configPath);
} else {
  loadEnvFile(path.join(process.cwd(), 'nims-agent.env'));
  loadEnvFile(path.join(process.cwd(), '.env'));
  loadEnvFile(path.join(__dirname, 'nims-agent.env'));
  loadEnvFile(path.join(__dirname, '.env'));
}

if (process.env.NIMS_ALLOW_INSECURE_TLS === 'true') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const NIMS_URL = (process.env.NIMS_URL || '').replace(/\/+$/, '');
const NIMS_AGENT_TOKEN = (process.env.NIMS_AGENT_TOKEN || '').trim();
const PING_TIMEOUT_MS = Math.max(500, parseInt(process.env.NIMS_PING_TIMEOUT_MS || '2000', 10));
const CONCURRENCY = Math.max(1, Math.min(50, parseInt(process.env.NIMS_CONCURRENCY || '15', 10)));
const FALLBACK_TCP_PORTS = (process.env.NIMS_FALLBACK_TCP_PORTS || '')
  .split(',')
  .map((s) => parseInt(s.trim(), 10))
  .filter((p) => Number.isInteger(p) && p > 0 && p <= 65535);

if (!NIMS_URL || !NIMS_AGENT_TOKEN) {
  console.error(
    '[NIMS Agent] Missing NIMS_URL or NIMS_AGENT_TOKEN.\n' +
      'Provide them via environment variables or nims-agent.env in this directory.\n' +
      'Example:\n' +
      '  NIMS_URL=http://191.20.110.191:3000\n' +
      '  NIMS_AGENT_TOKEN=nims_agt_xxxxxxxxxxxxxxxx',
  );
  process.exit(1);
}

function apiEndpoint(suffix) {
  if (NIMS_URL.endsWith('/api')) {
    return `${NIMS_URL}${suffix}`;
  }
  return `${NIMS_URL}/api${suffix}`;
}

function detectLocalIpv4() {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    if (!entries) continue;
    for (const iface of entries) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

function pingIcmp(ip, timeoutMs) {
  return new Promise((resolve) => {
    const start = Date.now();
    const isWin = process.platform === 'win32';
    const isMac = process.platform === 'darwin';

    const args = isWin
      ? ['-n', '1', '-w', String(timeoutMs), ip]
      : isMac
        ? ['-c', '1', '-W', String(timeoutMs), ip]
        : ['-c', '1', '-W', String(Math.max(1, Math.ceil(timeoutMs / 1000))), ip];

    const child = spawn('ping', args, { windowsHide: true });
    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', () => {});

    const killer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // ignore
      }
    }, timeoutMs + 1500);

    child.on('error', () => {
      clearTimeout(killer);
      resolve({ alive: false, latencyMs: null, method: 'ICMP' });
    });

    child.on('close', (code) => {
      clearTimeout(killer);
      // Checking TTL prevents Windows ping.exe exit-code-0 false positives on "Destination host unreachable"
      const hasTtlReply = /\bttl=\d+/i.test(stdout);
      const hasUnreachable = /unreachable/i.test(stdout);
      if (code === 0 && hasTtlReply && !hasUnreachable) {
        let latencyMs = Date.now() - start;
        if (/time<\s*1\s*ms/i.test(stdout)) {
          latencyMs = 1;
        } else {
          const match = stdout.match(/time[=<]\s*([\d.]+)\s*ms/i);
          if (match) {
            latencyMs = Math.max(1, Math.round(parseFloat(match[1])));
          }
        }
        resolve({ alive: true, latencyMs, method: 'ICMP' });
        return;
      }
      resolve({ alive: false, latencyMs: null, method: 'ICMP' });
    });
  });
}

function checkTcpPort(ip, port, timeoutMs) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    let settled = false;

    const done = (alive) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(
        alive
          ? { alive: true, latencyMs: Math.max(1, Date.now() - start), method: `TCP:${port}` }
          : null,
      );
    };

    socket.setTimeout(timeoutMs);
    socket.on('connect', () => done(true));
    socket.on('timeout', () => done(false));
    socket.on('error', () => done(false));
    socket.connect(port, ip);
  });
}

async function probeTarget(target) {
  const icmp = await pingIcmp(target.managementIp, PING_TIMEOUT_MS);
  if (icmp.alive) {
    return { deviceId: target.id, ...icmp };
  }

  for (const port of FALLBACK_TCP_PORTS) {
    const tcp = await checkTcpPort(target.managementIp, port, Math.min(PING_TIMEOUT_MS, 1500));
    if (tcp && tcp.alive) {
      return { deviceId: target.id, ...tcp };
    }
  }

  return { deviceId: target.id, alive: false, latencyMs: null, method: 'ICMP' };
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIdx = 0;

  async function runWorker() {
    while (true) {
      const current = nextIdx++;
      if (current >= items.length) return;
      results[current] = await worker(items[current]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${NIMS_AGENT_TOKEN}`,
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
      throw new Error(`HTTP ${res.status}: ${data.error || text || res.statusText}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function runCycle() {
  const cycleStart = Date.now();
  const hostMeta = {
    hostname: os.hostname(),
    localIp: detectLocalIpv4(),
    platform: `${process.platform}/${process.arch}`,
    agentVersion: AGENT_VERSION,
  };

  const targetRes = await fetchJson(apiEndpoint('/agents/runtime/targets'), {
    method: 'GET',
    headers: {
      'x-agent-hostname': hostMeta.hostname,
      'x-agent-platform': hostMeta.platform,
      'x-agent-version': hostMeta.agentVersion,
      ...(hostMeta.localIp ? { 'x-agent-local-ip': hostMeta.localIp } : {}),
    },
  });

  const targets = Array.isArray(targetRes.targets) ? targetRes.targets : [];
  const pollIntervalSec = Number(targetRes.agent?.pollIntervalSec) || 60;
  const siteLabel = targetRes.site
    ? `${targetRes.site.siteCode} (${targetRes.site.siteName})`
    : 'site';

  const results = targets.length > 0 ? await runPool(targets, CONCURRENCY, probeTarget) : [];
  const durationMs = Date.now() - cycleStart;

  const report = await fetchJson(apiEndpoint('/agents/runtime/report'), {
    method: 'POST',
    body: JSON.stringify({
      ...hostMeta,
      durationMs,
      results,
    }),
  });

  const upCount = results.filter((r) => r.alive).length;
  const downCount = results.length - upCount;
  console.log(
    `[${new Date().toISOString()}] ${siteLabel}: pinged ${results.length} target(s) in ${durationMs}ms -> UP=${upCount}, DOWN=${downCount}, updated=${report.updated ?? results.length}`,
  );

  return pollIntervalSec;
}

let stopping = false;
process.on('SIGINT', () => {
  stopping = true;
  console.log('\n[NIMS Agent] Shutting down gracefully...');
  process.exit(0);
});
process.on('SIGTERM', () => {
  stopping = true;
  process.exit(0);
});

async function main() {
  console.log(`[NIMS Agent v${AGENT_VERSION}] Starting probe -> ${NIMS_URL}`);
  if (FALLBACK_TCP_PORTS.length > 0) {
    console.log(`[NIMS Agent] Fallback TCP ports enabled: ${FALLBACK_TCP_PORTS.join(', ')}`);
  }

  while (!stopping) {
    let waitSec = 60;
    try {
      waitSec = await runCycle();
    } catch (err) {
      const causeMsg =
        err && typeof err === 'object' && 'cause' in err && err.cause
          ? ` (${err.cause.code || err.cause.message || String(err.cause)})`
          : '';
      console.error(`[${new Date().toISOString()}] [NIMS Agent] Cycle failed: ${err.message}${causeMsg}`);
      if (/localhost|127\.0\.0\.1/i.test(NIMS_URL) && /fetch failed/i.test(err.message)) {
        console.error(
          '[NIMS Agent] Hint: NIMS_URL points to localhost. If this agent runs on another PC, set NIMS_URL in nims-agent.env to the NIMS server IP.',
        );
      }
    }
    if (cli.once) {
      break;
    }
    await new Promise((r) => setTimeout(r, waitSec * 1000));
  }
}

main();

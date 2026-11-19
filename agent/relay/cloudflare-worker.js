/**
 * NIMS Cloudflare Worker + D1 HTTPS Relay
 *
 * Bindings required in Cloudflare Worker -> Settings -> Bindings / Variables:
 *   1. D1 database binding: Variable name = DB -> your D1 database (e.g. nims-relay-db)
 *   2. Secret / Environment variable: BRIDGE_SECRET = <strong random secret>
 *
 * Routes:
 *   GET  /health                     -> health check
 *   GET  /api/agents/runtime/targets -> called by remote nims-agent.mjs
 *   POST /api/agents/runtime/report  -> called by remote nims-agent.mjs
 *   POST /bridge/targets             -> called by Notebook bridge (x-bridge-secret)
 *   GET  /bridge/reports             -> called by Notebook bridge (x-bridge-secret)
 *   POST /bridge/reports/ack         -> called by Notebook bridge (x-bridge-secret)
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function timingSafeSecretMatch(provided, expected) {
  if (!provided || !expected) return false;
  const [a, b] = await Promise.all([sha256Hex(provided), sha256Hex(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function extractBearerToken(request) {
  const auth = request.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  const token = auth.slice(7).trim();
  return token.length > 0 ? token : null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    if (method === 'GET' && (path === '/' || path === '/health')) {
      return json({ ok: true, service: 'nims-cloudflare-relay' });
    }

    if (!env.DB) {
      return json({ error: 'Missing D1 binding "DB" in Worker settings' }, 500);
    }

    // --- Remote Site Agent Endpoints ---
    if (method === 'GET' && path === '/api/agents/runtime/targets') {
      const token = extractBearerToken(request);
      if (!token) return json({ error: 'Missing Authorization Bearer token' }, 401);

      const tokenHash = await sha256Hex(token);
      const row = await env.DB.prepare(
        'SELECT payload_json FROM relay_targets WHERE token_hash = ?',
      )
        .bind(tokenHash)
        .first();

      if (!row) {
        return json(
          { error: 'Targets not synced yet for this agent token. Check Notebook bridge.' },
          503,
        );
      }

      return new Response(row.payload_json, {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
    }

    if (method === 'POST' && path === '/api/agents/runtime/report') {
      const token = extractBearerToken(request);
      if (!token) return json({ error: 'Missing Authorization Bearer token' }, 401);

      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'Invalid JSON body' }, 400);
      }

      if (!body || !Array.isArray(body.results)) {
        return json({ error: 'Invalid ping report payload' }, 400);
      }

      const tokenHash = await sha256Hex(token);
      const reportedAt = new Date().toISOString();

      await env.DB.prepare(
        `INSERT INTO relay_reports (token_hash, payload_json, reported_at)
         VALUES (?, ?, ?)
         ON CONFLICT(token_hash) DO UPDATE SET
           payload_json = excluded.payload_json,
           reported_at = excluded.reported_at`,
      )
        .bind(tokenHash, JSON.stringify(body), reportedAt)
        .run();

      return json({
        ok: true,
        queued: true,
        updated: body.results.length,
        reportedAt,
      });
    }

    // --- Notebook Bridge Endpoints (protected by BRIDGE_SECRET) ---
    if (path.startsWith('/bridge/')) {
      const secretOk = await timingSafeSecretMatch(
        request.headers.get('x-bridge-secret') || '',
        env.BRIDGE_SECRET || '',
      );
      if (!secretOk) {
        return json({ error: 'Unauthorized bridge request' }, 401);
      }

      if (method === 'POST' && path === '/bridge/targets') {
        let body;
        try {
          body = await request.json();
        } catch {
          return json({ error: 'Invalid JSON body' }, 400);
        }

        const items = Array.isArray(body?.items) ? body.items : [];
        const deleteHashes = Array.isArray(body?.deleteTokenHashes) ? body.deleteTokenHashes : [];
        const now = new Date().toISOString();

        for (const item of items) {
          if (!item?.tokenHash || !item?.payload) continue;
          await env.DB.prepare(
            `INSERT INTO relay_targets (token_hash, payload_json, updated_at)
             VALUES (?, ?, ?)
             ON CONFLICT(token_hash) DO UPDATE SET
               payload_json = excluded.payload_json,
               updated_at = excluded.updated_at`,
          )
            .bind(String(item.tokenHash), JSON.stringify(item.payload), now)
            .run();
        }

        for (const hash of deleteHashes) {
          if (!hash) continue;
          await env.DB.prepare('DELETE FROM relay_targets WHERE token_hash = ?')
            .bind(String(hash))
            .run();
        }

        return json({ ok: true, synced: items.length, deleted: deleteHashes.length });
      }

      if (method === 'GET' && path === '/bridge/reports') {
        // Purge orphan/unclaimed reports older than 24h so they cannot block LIMIT 100 queue slots
        const staleCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        await env.DB.prepare('DELETE FROM relay_reports WHERE reported_at < ?')
          .bind(staleCutoff)
          .run();

        const { results } = await env.DB.prepare(
          'SELECT token_hash, payload_json, reported_at FROM relay_reports ORDER BY reported_at ASC LIMIT 100',
        ).all();

        const reports = (results || []).map((row) => {
          let payload = null;
          try {
            payload = JSON.parse(row.payload_json);
          } catch {
            payload = null;
          }
          return {
            tokenHash: row.token_hash,
            payload,
            reportedAt: row.reported_at,
          };
        });

        return json({ ok: true, reports });
      }

      if (method === 'POST' && path === '/bridge/reports/ack') {
        let body;
        try {
          body = await request.json();
        } catch {
          return json({ error: 'Invalid JSON body' }, 400);
        }

        const items = Array.isArray(body?.items) ? body.items : [];
        for (const item of items) {
          if (!item?.tokenHash || !item?.reportedAt) continue;
          await env.DB.prepare(
            'DELETE FROM relay_reports WHERE token_hash = ? AND reported_at = ?',
          )
            .bind(String(item.tokenHash), String(item.reportedAt))
            .run();
        }

        return json({ ok: true, acked: items.length });
      }
    }

    return json({ error: 'Not found' }, 404);
  },
};

> 🌐 **Language:** [🇹🇭 ภาษาไทย](README.md) | **🇺🇸 English**

# NIMS Site Ping Agent

A zero-dependency single-file **Site Ping Agent** (no `npm install` needed; requires only **Node.js 18+**) deployed inside each site or plant LAN to probe **UP / DOWN** device availability and latency and report status back to the central NIMS server over HTTP/HTTPS.

## Highlights for Multi-Site & Isolated Networks
- **Supports both LAN Direct and Cross-Network** topologies from the same **+ Add Site Agent** dialog.
- **No inbound firewall ports required** at remote sites (outbound-only HTTP/HTTPS or relayed via Cloudflare Workers + D1 for air-gapped servers; see [agent/relay/README.en.md](relay/README.en.md)).
- **Duplicate IPs across different sites never conflict**, because every probe authenticates with its site-specific Agent Token.
- **Consecutive Miss Threshold** prevents brief packet drops from flapping devices to `OFFLINE`.
- **Automatic Stale-Ping Cleanup:** pausing, stopping, or deleting an agent clears stale live ping timestamps cleanly.
- Devices marked **`MAINTENANCE`** are never overwritten automatically to `ONLINE` / `OFFLINE`.

---

## Installation & Usage

### Option 1: 1-Click Installer from the NIMS Web UI (Recommended)
1. Open NIMS -> **Sites** -> select a site -> **Site Agents** tab.
2. Click **+ Add Site Agent**, name your agent, and choose **LAN Direct** or **Remote (Cross-Network)**.
3. Download the **1-Click Installer (`.bat`)** and double-click it on the target probe host to install and run it in the background.

### Option 2: Manual Node.js Execution (`nims-agent.mjs` + `nims-agent.env`)
1. Copy the **Agent Token** or download `nims-agent.mjs` and `nims-agent.env` from **Site Agents**.
2. Place both files in the same folder on the probe host and run:

### Single-Shot Test (`--once`)
```bash
node nims-agent.mjs --once
```

### Continuous Run (Terminal or PM2)
```bash
node nims-agent.mjs
```
*(You can specify an alternate config file via `--config path/to/nims-agent.env`.)*

Or run continuously under **PM2**:
```bash
npm install -g pm2
pm2 start nims-agent.mjs --name nims-site-agent
pm2 save
```

---

## Environment Variables (`nims-agent.env`)

```env
NIMS_URL=http://191.20.110.191:3000
NIMS_AGENT_TOKEN=nims_agt_xxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Optional settings
NIMS_PING_TIMEOUT_MS=2000
NIMS_CONCURRENCY=15
# Fallback TCP ports to check when ICMP Echo is blocked
NIMS_FALLBACK_TCP_PORTS=22,80,443,3389,502,9100
# Set to true when NIMS uses a self-signed HTTPS certificate on LAN
NIMS_ALLOW_INSECURE_TLS=false
```

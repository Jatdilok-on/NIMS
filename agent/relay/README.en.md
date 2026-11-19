> 🌐 **Language:** [🇹🇭 ภาษาไทย](README.md) | **🇺🇸 English**

# NIMS Cloudflare D1 HTTPS Relay (For Air-Gapped / Offline NIMS Servers)

Use this relay kit when the **central NIMS Server cannot reach the internet**, while a **Notebook Bridge** sits inside the same LAN as the NIMS Server and has outbound internet access (without opening inbound router ports at customer sites).

---

## 1. Create a Cloudflare D1 Database (Free 100,000 rows/day tier)
1. In Cloudflare Dashboard, open **Storage & databases** -> **D1 SQL database** -> click **Create** and name it `nims-relay-db`.
2. Open `nims-relay-db` -> **Console** tab -> paste the SQL from `schema.sql` and click **Execute**.

## 2. Create the Cloudflare Worker
1. Go to **Workers & Pages** -> **Create application** -> **Start with Hello World!** -> name it `nims-relay` -> **Deploy**.
2. Click **Edit code** -> replace the template with `cloudflare-worker.js` -> click **Deploy**.
3. Open **Settings -> Bindings / Variables and Secrets** for Worker `nims-relay`:
   - **Add binding** -> **D1 database** -> Variable name = `DB` -> select `nims-relay-db`.
   - **Add variable / secret** -> Name = `BRIDGE_SECRET` -> set a strong random secret string.
4. Test in your browser: `https://nims-relay.<subdomain>.workers.dev/health` (should return `{"ok":true,"service":"nims-cloudflare-relay"}`).

## 3. Run the Bridge on the LAN Notebook (Reachable to NIMS Server)

### Option 1: Download the 1-Click Bridge Installer from the Web UI (Recommended)
1. Open NIMS -> **Sites** -> **Site Agents** tab -> **+ Add Site Agent** -> select **Remote (Cross-Network)**.
2. In **Step 1: Notebook Bridge**, enter your Cloudflare Worker URL and `BRIDGE_SECRET`, then download **`install-bridge.bat`** and run it on the bridge machine.

### Option 2: Manual Setup from `agent/relay/`
1. Copy `agent/relay/` to the bridge host (e.g., `C:\nims-bridge`) and rename `nims-relay-bridge.env.example` to `nims-relay-bridge.env`.
2. Configure `nims-relay-bridge.env`:
   - `NIMS_URL=https://191.20.110.191:3000`
   - `NIMS_ALLOW_INSECURE_TLS=true`
   - `RELAY_URL=https://nims-relay.<subdomain>.workers.dev`
   - `BRIDGE_SECRET=<same secret configured on the Worker>`
   - *(Optional)* `NIMS_AGENT_TOKENS=<comma-separated Agent Tokens>` — if omitted or managed via NIMS, active remote agent tokens are synced and paused/deleted tokens are stopped cleanly.
3. Start the bridge:
   - **Background Auto-Start (Recommended):** double-click **`install-bridge-background.bat`** (hides window, registers startup, generates `view-bridge-log.bat` / `uninstall-bridge.bat`).
   - **Foreground Console:** double-click **`start-bridge.bat`** or run `node nims-relay-bridge.mjs`.

## 4. Install Remote Agents at Target Sites
Download **Step 2: 1-Click Remote Agent Installer** from **+ Add Site Agent -> Remote**, or place `agent/nims-agent.mjs` with `nims-agent.env`:
```env
NIMS_URL=https://nims-relay.<subdomain>.workers.dev
NIMS_AGENT_TOKEN=<Site Agent Token>
```
Run `node nims-agent.mjs` — remote ping results flow through Cloudflare D1 and are pulled into NIMS automatically (pausing or deleting an agent clears stale relay reports and resets stale ping status on the server).

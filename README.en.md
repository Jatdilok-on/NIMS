> 🌐 **Language:** [🇹🇭 ภาษาไทย](README.md) | **🇺🇸 English**

# NIMS – Network Infrastructure Management System

An on-premise web application for centralized multi-site network infrastructure management covering Network Diagrams, IP Address Management (IPAM), Device Inventory, AES-256-GCM Credentials Vault, Project Documents, Maintenance History, Role-Based Access Control (RBAC), and Audit Logs.

---

## Key Capabilities

- **Multi-Site Organization Management**
  - Manage unlimited sites with per-site RBAC permissions and an 8-tab Workspace per site (Overview, Diagrams, Device Inventory, IPAM, Access & Vault, Documents, Maintenance History, Site Settings).
  - Quick View modal for site details, Google Maps link, and VPN / credentials summary.

- **NOC Dashboard & Analytics**
  - Organization-wide or site-filtered KPIs (total sites, devices, diagrams, documents, and breakdown across **17 device categories**).
  - Live device status (`ONLINE`, `OFFLINE`, `MAINTENANCE`, `UNKNOWN`), bar/donut charts, monthly growth trends, and scoped Recent Activity (all logs visible to `SUPER_ADMIN`).

- **Device Inventory & Import/Export**
  - Supports **17 device types**: `SWITCH`, `ACCESS_POINT`, `AP_CLIENT`, `WLC`, `SERVER`, `PLC`, `ESXI`, `VM`, `NAS`, `UPS`, `IP_CAM`, `PC`, `NVR`, `TV`, `PRINTER`, `BARCODE`, `HANDHELD` (including import aliases such as `PDA`, `HHT`, `Hardheld`).
  - Per-site duplicate IP & MAC detection plus Global Search.
  - Excel / CSV import (supports Thai UTF-8 and Windows-874/TIS-620 CSV encoding), multi-category import in a single file, and auto-detected target site by column or filename.
  - Single-page listing with Bulk Edit / Bulk Delete and export to `.xlsx`, `.csv`, and `.pdf`.

- **IP Address Management (IPAM)**
  - Manage VLANs and Subnets with automatic CIDR Mask, Network, Broadcast, and Usable IP Range calculations plus an interactive IP Grid.
  - Real-time Site Agent status badges directly on IP tables (`ONLINE` blinking green, `OFFLINE` solid red, `MAINTENANCE`, `UNKNOWN`) with CSV/Excel/PDF export.
  - Automatic inventory IP mapping into subnets, unassigned-IP detection, Auto-Create `/24` Subnets & Sync, and inline `Edit Subnet`.

- **Network Diagram Engine**
  - Upload and preview `PNG`, `JPG`, `SVG`, multi-page `PDF`, `.drawio`, `.xml`, and Visio `.vsdx` (server-side SVG conversion), with version history and rollback.
  - Built-in interactive diagram editor (`@xyflow/react`) to place real inventory devices or standard shapes, draw LAN/Fiber/Wireless links with port/VLAN/speed metadata, pin floor plan backgrounds, auto-route orthogonal cables, sync status live with inventory, and export full-bounds high-resolution `PNG` (excluding MiniMap/Controls), `.drawio`, or `.json`.

- **Credentials Vault (Access Management)**
  - Encrypts usernames and passwords with **AES-256-GCM** using a separate `CREDENTIALS_ENCRYPTION_KEY`, logs every reveal/copy event, supports Copy All & HTTP LAN clipboard fallback, and enforces `403` restrictions on `IP_VIEWER` at the backend.

- **Project Documents & Maintenance History**
  - Categorized document storage with file versioning and downloads, alongside maintenance/firmware upgrade logs.

- **Users, RBAC, Realtime User Presence, Security & Audit / API Logs**
  - 5 role levels (`SUPER_ADMIN`, `SITE_ADMIN`, `NETWORK_ENGINEER`, `VIEWER`, `IP_VIEWER`) with per-site module permissions and Bulk Assign enforced across UI and API.
  - **Realtime User Presence (`/users`):** Live **`ONLINE` (blinking green)** / **`OFFLINE`** indicators per user with active session count, last active timestamp, and last known IP.
  - **Categorized Audit Logs & API Traffic Monitor (`/audit-logs`):** Category split tabs (Auth/RBAC, Device `ONLINE ↔ OFFLINE` transitions, Inventory/IPAM/Diagrams, Vault/Docs/Maint, Users/Sites/System), site filtering, readable event details, and a **Super Admin-only API Traffic Monitor** inspecting live `/api/*` requests with method/status filters and secret redaction.
  - Bulk user import via Excel/CSV and forced first-login password change.
  - Complete **4-language UI** (`ไทย`, `English`, `中文`, `日本語`), multiple color themes, and offline-bundled **`Anuphan` + `JetBrains Mono`** fonts (zero external internet needed on LAN servers).
  - Production-hardened with HttpOnly Cookie Auth, CSRF Origin Validation, CSP/XSS Sanitization, and upload size/MIME validation.

- **IT Service Device Check Runbook (`/runbook`)**
  - Guided 4-step first-line troubleshooting SOP (**Step 1:** 10s Scope Isolation → **Step 2:** 4-Stage Sequential Ping → **Step 3:** Per-system guides for **SRM Cranes**, **AMR Vehicles**, **SHU Shuttles**, **RGV Rail Cars**, **PLC Main**, **Access Points**, **AP Clients/Bridges** → **Step 4:** Escalation Ticket Builder).
  - Includes an **animated clickable triage flow diagram** (switchable between `Ping Order: Source → End` and `Floor Check: Unit → Switch`) paired with **realistic animated hardware case illustrations** synchronized 1-to-1 with each stage, LED field cheat sheet, quick symptom selector, live site device IP lookup with 1-click `ping -n 5 <IP>` copy, and clean A4 printing across light & dark themes.
  - **4-Stage Escalation Ticket Builder**: dynamically adapts stage labels to the selected equipment guide, auto-populates `IP / VLAN / Location`, supports symptom patterns (`Hard Down`, `Flapping`, `High Latency`), provides smart isolation even when stages are skipped, and copies a structured summary in 1 click.
  - `NETWORK_ENGINEER`, `SITE_ADMIN`, and `SUPER_ADMIN` can easily **Add / Edit / Delete guides** and **attach field reference photos** directly from the UI (automatically backed up with `storage/`).

- **Real-Time Monitoring (Site Ping Agents & Cross-Network Relay)**
  - Deploy `nims-agent.mjs` via **Sites → Site Agents → + Add Site Agent** in either **LAN Direct** or **Remote (Cross-Network)** mode with 1-Click installers for both the Probe Agent and Step 1 Relay Bridge.
  - Automatically pings devices per site with live Up/Down LEDs, latency (`ms`), animated diagram link cables, IPAM live indicators, and automatic stale-ping reset when an agent is stopped or deleted.
  - Supports **Cross-Network** deployments using **Notebook Bridge (`agent/relay/nims-relay-bridge.mjs`) + Cloudflare Workers & D1 Relay** for air-gapped servers without opening inbound firewall ports.
  - See architecture diagrams, flows, RBAC matrix, and capacity specs in [docs/PRESENTATION_FLOW.md](docs/PRESENTATION_FLOW.md).

- **System Settings, Backup & Retention (`/settings`)**
  - Portable `.zip` backups supporting **Full Backup (MongoDB + Storage Files)** or **Database Only** with optional **notes** and a SHA-256 manifest, for both manual and scheduled jobs (daily/weekly/monthly).
  - Supports **manual backup deletion**, **configurable retention policies (`backupRetentionCount` / `auditRetentionDays`) + one-click Prune**, and live **MongoDB Replica Set (`rs0`)**, storage usage, and **disk free space** telemetry.

---

## Project Structure

- `backend/` — Node.js + Express + TypeScript + Prisma ORM + MongoDB REST API (Port `4000`)
- `frontend/` — Next.js App Router + React + TypeScript + Tailwind CSS + React Flow (Port `3000`)
- `agent/` — Zero-dependency Site Ping Agent ([agent/README.en.md](agent/README.en.md)) and Cloudflare Workers + D1 Relay Bridge ([agent/relay/README.en.md](agent/relay/README.en.md))
- `scripts/` — Management & production scripts:
  - `run-nims.mjs` — Direct Node.js runner (no Docker required)
  - `deploy-windows-server.ps1` — Registers and launches the `"NIMS Production Server"` Windows Scheduled Task
  - `harden-windows-lan.ps1` / `harden-lan.bat` — LAN production Firewall/NTFS/TLS hardening and Caddy reverse proxy (`Caddyfile.lan.example`)
- `start-nims.ps1` / `start-nims.bat` — Quick Windows launchers
- `docs/` — Documentation: [PRESENTATION_FLOW.md](docs/PRESENTATION_FLOW.md), [ARCHITECTURE.md](docs/ARCHITECTURE.md), [INSTALLATION.en.md](docs/INSTALLATION.en.md), [BACKUP_RESTORE.md](docs/BACKUP_RESTORE.md), [API.md](docs/API.md)
- `docker-compose.yml` — Docker Compose setup (MongoDB 7 + Backend + Frontend)
- `.env.example` — Environment template

---

## Quick Start (Node.js + MongoDB — No Docker Required)

1. Install **MongoDB Community Server** and enable Single-Node Replica Set (`rs0`) in `mongod.cfg` *(required by Prisma ORM)*:
   - Add `replication: { replSetName: "rs0" }` to `mongod.cfg` and restart the `MongoDB` service.
2. Install dependencies, initialize `.env` + Replica Set (`rs0`), push schema, and seed reference data:
   ```bash
   npm run install:all
   npm run setup:db
   ```
3. Run in **Development** mode:
   ```bash
   npm run dev
   ```
   Or build and run in **Production** mode:
   ```bash
   npm run build
   npm start
   ```
4. Open `http://localhost:3000/setup` to create the first **Super Admin** account.
5. Run backend test suite:
   ```bash
   npm test
   ```

---

## Windows Server Production Deployment & Patch Upgrade

### 1. First-Time Windows Server Setup (Startup Task)
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-windows-server.ps1 -InstallStartupTask -OpenFirewall
```
*(Run `scripts\harden-windows-lan.ps1` afterward to tighten LAN Firewall rules, NTFS ACLs, or HTTPS proxy settings.)*

### 2. Upgrade Existing Production Server (`C:\nims-production-offline`)
Copy `nims-production-patch.zip` to `C:\nims-production-patch.zip` on the server, open **Windows PowerShell (Run as Administrator)**, and run:
```powershell
$wd = "C:\nims-production-offline"
Stop-ScheduledTask -TaskName "NIMS Production Server" -ErrorAction SilentlyContinue
Stop-ScheduledTask -TaskName "NIMS HTTPS Proxy" -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*nims*" -or $_.CommandLine -like "*next*" -or $_.CommandLine -like "*dist/index.js*" -or $_.CommandLine -like "*dist\index.js*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
Remove-Item (Join-Path $wd "frontend\.next") -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $wd "backend\dist") -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive -Path "C:\nims-production-patch.zip" -DestinationPath $wd -Force
Start-ScheduledTask -TaskName "NIMS Production Server"
Start-ScheduledTask -TaskName "NIMS HTTPS Proxy"
Start-Sleep -Seconds 4
Get-NetTCPConnection -LocalPort 3000,3001,4000 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalAddress, LocalPort, State, OwningProcess
```
*(Preserves `.env`, `node_modules`, `data/`, and MongoDB data. Once ports `3000`, `3001`, and `4000` show `Listen`, press `Ctrl+F5` in your browser.)*

---

## Author & License

- **Developed & Maintained by:** AUTOMOTIONWORKS
- **Copyright & License:** © 2026 AUTOMOTIONWORKS. All Rights Reserved. See [LICENSE](LICENSE).

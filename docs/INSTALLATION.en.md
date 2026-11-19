> 🌐 **Language:** [🇹🇭 ภาษาไทย](INSTALLATION.md) | **🇺🇸 English**

# NIMS Installation & Deployment Guide

## 1. Prerequisites (Direct Node.js + MongoDB — No Docker Required)

- **On-Premise Server:** Windows 10/11, Windows Server 2019/2022, or Ubuntu/Debian/RHEL Linux Server
- **Runtime:** Node.js 20+ (LTS v20 / v22 / v24 with `npm`)
- **Database:** MongoDB Community Server 7+ (configured as a single-node Replica Set `rs0`, required by Prisma ORM) or MongoDB Atlas
- **Optional Container Alternative:** Docker Engine 24+ and Docker Compose v2+

---

## 2. Enable Single-Node Replica Set (`rs0`) on Local MongoDB

Prisma ORM requires MongoDB Replica Set support (without `--replSet`, code `P2031` occurs):

1. Open your MongoDB config (`C:\Program Files\MongoDB\Server\<ver>\bin\mongod.cfg` on Windows or `/etc/mongod.conf` on Linux) and add:
   ```yaml
   replication:
     replSetName: "rs0"
   ```
2. Restart the MongoDB service (`Restart-Service MongoDB` in Admin PowerShell on Windows, or `sudo systemctl restart mongod` on Linux).
3. Initialize the single-node replica set once via Node.js (no `mongosh` needed):
   ```bash
   npm run mongo:init-rs
   ```
   *(Or run `npm run setup:db` directly, which also initializes `rs0` automatically.)*

---

## 3. Environment & Cryptographic Secrets

Copy `.env.example` to `.env` (or run `npm run setup:db`, which auto-generates `.env` with cryptographically random secrets if missing):
- `DATABASE_URL` — e.g. `mongodb://127.0.0.1:27017/nims?replicaSet=rs0&directConnection=true`
- `JWT_SECRET` — 64-hex key signing user session tokens
- `CREDENTIALS_ENCRYPTION_KEY` — 64-hex key encrypting device login credentials via **AES-256-GCM**
- `NODE_ENV` — set to `production` in production deployments
- `CORS_ORIGIN` — web origin accessed by users, e.g. `http://192.168.1.10:3000` or `https://192.168.1.10:3001`
- `COOKIE_SECURE` — set `true` over HTTPS, `false` over plain HTTP on LAN
- `STORAGE_ROOT` / `BACKUP_ROOT` — directories for uploaded assets and `.zip` backups

Generate a 64-hex secret manually with Node.js:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> **IMPORTANT:** Never store `CREDENTIALS_ENCRYPTION_KEY` inside the database. Back up `.env` or this key in a secure offline vault so encrypted credentials remain recoverable across server migrations or restores.

---

## 4. Running Directly with Node.js (No Docker Required)

1. Ensure the local `MongoDB` service is running (`net start MongoDB` on Windows or `systemctl start mongod` on Linux).
2. Install dependencies, push schema/indexes, and seed reference data:
   ```bash
   npm run install:all
   npm run setup:db
   ```
3. Run in **Development Mode** *(hot-reload backend + frontend)*:
   ```bash
   npm run dev
   ```
   Or build and run in **Production Mode**:
   ```bash
   npm run build
   npm start
   ```
   *(On Windows, you can also run `.\start-nims.ps1` or `.\start-nims.ps1 -Mode start` for production.)*

---

## 4B. Docker Compose Alternative (Optional)

1. Copy `.env.example` to `.env` and fill in `JWT_SECRET` and `CREDENTIALS_ENCRYPTION_KEY`.
2. Build and launch:
   ```bash
   docker compose up -d --build
   ```
   *(The backend container runs `npx prisma db push` on startup.)*

---

## 5. Windows Server Production Deployment & Patch Upgrade

### A. Initial Production Setup (Windows Scheduled Task)
Run in **Windows PowerShell (Run as Administrator)** inside the project root:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-windows-server.ps1 -InstallStartupTask -OpenFirewall
```
This verifies MongoDB, creates or preserves `.env`, skips `npm install`/`build` when pre-packaged offline, opens TCP port `3000`, and registers the `"NIMS Production Server"` Scheduled Task to start automatically at boot.

To apply LAN security hardening (firewall isolation, NTFS ACLs on `.env`/`data`, and optional HTTPS reverse proxy):
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\harden-windows-lan.ps1
```

### B. Apply Patch Update on Production Server (`C:\nims-production-offline`)
Place `nims-production-patch.zip` at `C:\nims-production-patch.zip` on the server, open **PowerShell (Run as Administrator)**, and run:
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
*(Preserves existing `.env`, `node_modules`, `data/`, and MongoDB data.)*

---

## 6. First-Time Super Admin Setup

No default admin credentials are hardcoded in the application. Create the first administrator account using either method:

### Option A: Web Setup Wizard (Recommended)
1. Open `http://<SERVER_IP>:3000/setup`.
2. Enter your Organization Name, Super Admin Full Name, Username, Email, and a strong password (minimum 10 characters).
3. Once created, `/setup` permanently locks down (`403 Forbidden`).

### Option B: CLI Seed Script
```bash
cd backend
INITIAL_ADMIN_USERNAME=netadmin \
INITIAL_ADMIN_EMAIL=netadmin@company.local \
INITIAL_ADMIN_PASSWORD="ChangeMeStrong#2026" \
npm run seed:admin
```

---

## 7. HTTPS Reverse Proxy (Recommended for Production)

Terminate TLS using Caddy, Nginx, or IIS Reverse Proxy in front of port `3000` (see `scripts/Caddyfile.lan.example`) and update `.env`:
- `COOKIE_SECURE=true`
- `CORS_ORIGIN=https://<SERVER_IP_OR_DOMAIN>`

---

## 8. Field Monitoring Agents (Site Ping Agent & Cross-Network Relay)

- **LAN / Direct-Reachable Sites:** See [agent/README.en.md](../agent/README.en.md)
- **Cross-Network / Air-Gapped NIMS Server (Cloudflare D1 Relay + Notebook Bridge):** See [agent/relay/README.en.md](../agent/relay/README.en.md)

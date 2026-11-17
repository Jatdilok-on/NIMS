# NIMS Installation & Deployment Guide

## 1. Prerequisites (Direct Node.js + MongoDB — No Docker Required)

- **On-Premise Server**: Windows 10/11 / Windows Server 2019/2022 or Ubuntu/Debian/RHEL Linux Server
- **Runtime**: Node.js 20+ or 22+ / 24+ (with `npm`)
- **Database**: MongoDB Community Server 7+ (configured as a single-node Replica Set `rs0`, required by Prisma ORM) or MongoDB Atlas.
- **Optional Container Alternative**: Docker Engine 24+ and Docker Compose v2+

## 2. Enable Single-Node Replica Set on Local MongoDB (Required for Prisma)

Prisma ORM requires MongoDB Replica Set support (code `P2031` occurs if MongoDB runs without `--replSet`):

1. Open MongoDB config (`C:\Program Files\MongoDB\Server\<ver>\bin\mongod.cfg` on Windows or `/etc/mongod.conf` on Linux) and add:
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

## 3. Environment & Cryptographic Secrets

Copy `.env.example` to `.env` (or run `npm run setup:db` which auto-generates `.env` with cryptographically random secrets if missing):
- `DATABASE_URL` — e.g. `mongodb://127.0.0.1:27017/nims?replicaSet=rs0&directConnection=true`
- `JWT_SECRET` — 64-hex key signing user session tokens
- `CREDENTIALS_ENCRYPTION_KEY` — 64-hex key encrypting device login usernames and passwords via AES-256-GCM

To generate secrets manually with Node.js:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> **IMPORTANT**: Never store `CREDENTIALS_ENCRYPTION_KEY` inside the database. Back it up in a secure offline password vault so backups can be decrypted if the server is replaced.

## 3. Running Directly with Node.js (Recommended without Docker)

1. Ensure MongoDB service is running locally (`net start MongoDB` on Windows or `systemctl start mongod` on Linux).
2. Install dependencies & push MongoDB schema/indexes + seed reference roles & device types:
   ```bash
   npm run install:all
   npm run setup:db
   ```
3. Run in **Development Mode** (hot-reload backend + frontend):
   ```bash
   npm run dev
   ```
   Or build and run in **Production Mode**:
   ```bash
   npm run build
   npm start
   ```
   On Windows you can also run `.\start-nims.ps1` (or `.\start-nims.ps1 -Mode start` for production).

## 3B. Docker Compose Alternative (Optional)

1. Copy `.env.example` to `.env` and fill in `JWT_SECRET` and `CREDENTIALS_ENCRYPTION_KEY`.
2. Build and launch:
   ```bash
   docker compose up -d --build
   ```
   The backend container runs `npx prisma db push` on startup.

## 4. First-Time Super Admin Setup

No default admin username or password is hardcoded in the application.

### Option A: Web Onboarding Wizard
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

## 5. HTTPS Reverse Proxy (Recommended for Production)

Terminate TLS using Nginx, Caddy, or IIS Reverse Proxy in front of port `3000`, and set `COOKIE_SECURE=true` and `CORS_ORIGIN=https://nims.company.local` in `.env`.

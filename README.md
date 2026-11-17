# NIMS – Network Infrastructure Management System

Centralized enterprise web application for managing multi-site Network Infrastructure, Network Diagrams, IP Address Management (IPAM), Device Inventory, Encrypted Login Credentials, Project Documents, Maintenance History, and Immutable Audit Logs.

## Key Capabilities

- **Multi-Site Organization**: Manage unlimited sites (e.g., `BTV`, `AMW`, `CUST01`) with strict site-scoped permissions and an 8-tab site workspace (Overview, Network Diagram, Device Inventory, IPAM, Access Management, Project Documents, Maintenance History, Site Settings).
- **Dashboard & Analytics**: Organization-wide KPIs, status counts (`Online`, `Offline`, `Maintenance`, `Unknown`), and interactive charts (Devices by Site, Type, Status, Monthly Additions) with per-site filtering.
- **Device Inventory & Excel Import/Export**: Switches, Access Points, AP Clients, Wireless Controllers (WLC), and Servers; duplicate IP & MAC detection within each site; Global Search; 10-step Excel/CSV Import Wizard (supports legacy `No., Model, MAC, SN, NAME, Location, IP(VLAN 1211)` headers); Export to `.xlsx`, `.csv`, and `.pdf`.
- **IP Address Management (IPAM)**: VLANs, CIDR subnet auto-calculation (mask, network, broadcast, usable range), gateway/DNS/DHCP tracking, interactive IP map, and automatic linking to inventory devices.
- **Network Diagram Engine**:
  - Upload & preview `PNG`, `JPG`, `SVG`, `PDF` (multi-page), `.drawio`, `.xml`, and Visio `.vsdx` (automatic server-side SVG preview conversion).
  - Interactive Web-Based Topology Editor (`@xyflow/react`) with drag-and-drop network shapes, live Inventory device drag-and-drop, LAN/Fiber/Wireless edge metadata (port, VLAN, speed, color), background image overlay, live inventory sync, Undo/Redo, version history, and export to PNG / `.drawio`.
- **Access Management / Credentials Vault**: AES-256-GCM encrypted username/password storage using an isolated `CREDENTIALS_ENCRYPTION_KEY`, reveal/copy audit logging, and strict backend `403` enforcement preventing `IP_VIEWER` access.
- **Project Document Management**: Folder categories, version control (replace & download history), inline preview, and permission-scoped deletion.
- **RBAC & Immutable Audit Logs**: `SUPER_ADMIN`, `SITE_ADMIN`, `NETWORK_ENGINEER`, `VIEWER`, `IP_VIEWER`, plus per-site granular module permissions.
- **Backup & Restore**: Manual & scheduled (Daily/Weekly/Monthly) ZIP archives containing MongoDB JSON snapshot + uploaded files + SHA-256 manifest, with one-click restore.

## Project Structure

- `backend/` — Node.js + Express + TypeScript + Prisma ORM + MongoDB REST API
- `frontend/` — Next.js App Router + React + TypeScript + Tailwind CSS + React Flow
- `scripts/run-nims.mjs` — Direct Node.js runner (no Docker required)
- `start-nims.ps1` / `start-nims.bat` — Windows quick-launch scripts
- `docs/` — [ARCHITECTURE.md](docs/ARCHITECTURE.md), [INSTALLATION.md](docs/INSTALLATION.md), [BACKUP_RESTORE.md](docs/BACKUP_RESTORE.md), [API.md](docs/API.md)
- `docker-compose.yml` — Optional Docker Compose stack (MongoDB 7 + Backend + Frontend)
- `.env.example` — Environment template

## Quick Start (Node.js + MongoDB, No Docker Required)

1. Install **MongoDB Community Server** and enable single-node Replica Set (`rs0`) in `mongod.cfg` (required by Prisma ORM on MongoDB):
   - Add `replication: { replSetName: "rs0" }` to `mongod.cfg` and restart the MongoDB service (`Restart-Service MongoDB` in Admin PowerShell).
2. Install dependencies, initialize `.env`, initialize Replica Set (`rs0`), push MongoDB collections/indexes, and seed reference data (no `mongosh` needed):
   ```bash
   npm run install:all
   npm run setup:db
   ```
3. Start both Backend (port `4000`) and Frontend (port `3000`):
   ```bash
   npm run dev
   ```
   Or build and run in production mode:
   ```bash
   npm run build
   npm start
   ```
4. Open `http://localhost:3000/setup` in your browser to create the first **Super Admin** account securely (no default passwords are hardcoded).

## Author & License

- **Created & Developed by:** AUTOMOTIONWORKS
- **Copyright & License:** © 2026 AUTOMOTIONWORKS. All Rights Reserved. See [LICENSE](LICENSE) for attribution requirements.

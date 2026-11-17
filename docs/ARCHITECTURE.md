# NIMS – System Architecture & Database Design

## 1. High-Level Architecture

NIMS (Network Infrastructure Management System) is designed for **on-premise deployment** (Windows Server or Linux Server) directly on Node.js + MongoDB (or optionally via Docker Compose) without requiring continuous internet connectivity.

```
+-------------------------------------------------------------------+
|               Client Browsers (Desktop / iPhone / Android)        |
|        Next.js App Router + React + TypeScript + Tailwind CSS     |
|   - Enterprise Responsive UI (Dark / Light Mode)                  |
|   - React Flow Interactive Diagram Editor                         |
|   - Multi-page PDF & High-Res Image/Visio/Draw.io Viewer          |
+---------------------------------+---------------------------------+
                                  | HTTPS / REST API (HttpOnly Cookie + CSRF)
                                  v
+-------------------------------------------------------------------+
|                   Backend API Server (Node.js + Express + TS)     |
|  - Auth Middleware (JWT in HttpOnly Cookie + Session DB Check)    |
|  - RBAC + Site-Level Permission Guard (Role + UserSitePermission) |
|  - AES-256-GCM Vault Service (Key isolated in Env/KMS)            |
|  - IPAM CIDR Calculator & Duplicate IP/MAC Validator              |
|  - Excel/CSV/PDF Import-Export Engine                             |
|  - Visio (.vsdx) & Draw.io Parser/Converter                       |
|  - Immutable Audit Logger (Zero Secrets Logged)                   |
|  - Scheduled Backup & Restore Engine                              |
+----------------+--------------------------------+-----------------+
                 | Prisma ORM                     | Local FS / NAS
                 v                                v
+--------------------------------+   +------------------------------+
|           MongoDB              |   |    Storage Root / NAS        |
|  - Site-Isolated Collections   |   |  - /sites/<CODE>/diagrams    |
|  - Unique & Secondary Indexes  |   |  - /sites/<CODE>/documents   |
|  - Replica Set (rs0) Enabled     |   |  - /backups                  |
+--------------------------------+   +------------------------------+
```

## 2. Security & RBAC Architecture

### Password & Secret Isolation
1. **User Login Passwords**: Hashed with `bcryptjs` (cost factor 12) + per-user random salt.
2. **Device Login Credentials (`credentials` table)**:
   - Both `usernameEncrypted` and `passwordEncrypted` are encrypted with **AES-256-GCM** using a unique 12-byte random IV and 16-byte authentication tag per field.
   - The `CREDENTIALS_ENCRYPTION_KEY` is stored solely in environment/host secret configuration, completely separate from MongoDB.
   - Credentials are **never** included in inventory endpoints, global search, Excel/CSV/PDF exports, application logs, or audit log payloads.
   - Every reveal or copy of a credential triggers an immutable `audit_logs` record (`VIEW_CREDENTIAL` / `COPY_PASSWORD`).

### Role-Based & Site-Scoped Access Control
Every API endpoint validates:
1. Authenticated session (`users.isActive === true`, valid session token).
2. Global Role (`SUPER_ADMIN`, `SITE_ADMIN`, `NETWORK_ENGINEER`, `VIEWER`, `IP_VIEWER`).
3. Per-Site Granular Permissions (`user_site_permissions`).

| Capability | Super Admin | Site Admin | Network Engineer | Viewer | IP Viewer |
|---|---|---|---|---|---|
| Manage All Sites / Users / Settings / Backups | Yes | No | No | No | No |
| Manage Assigned Sites | Yes | Yes | View | View | View |
| View Inventory / IPAM / Diagrams | Yes | Yes | Yes | Yes | Yes |
| Edit Inventory / IPAM / Diagrams | Yes | Yes | Yes | No | No |
| View/Upload Documents | Yes | Yes | View (+Edit if granted) | View | View (No Secrets) |
| View / Copy Credentials & Access Instructions | Yes | Per-Site Perm | Per-Site Perm | No (unless explicit) | **NEVER (403)** |
| View Audit Logs | Yes | Site Scoped (if granted) | No | No | No |

`IP_VIEWER` is strictly blocked at the backend API layer (`403 Forbidden`) from `/api/credentials/*` and any credential-related payloads.

## 3. MongoDB Collections Schema (Prisma ORM)

- **Identity & RBAC**: `users`, `roles`, `permissions`, `role_permissions`, `user_site_permissions`, `sessions`
- **Organization & Sites**: `sites`, `projects`, `maintenance_records`
- **Device Inventory (Supertype + Subtypes)**: `device_types`, `devices`, `switches`, `access_points`, `ap_clients`, `controllers`, `servers`
- **IPAM**: `vlans`, `subnets`, `ip_addresses`
- **Access Vault**: `credentials`, `access_instructions`
- **Diagrams & Documents**: `diagrams`, `diagram_versions`, `documents`, `document_versions`
- **Governance & Operations**: `audit_logs`, `backup_jobs`, `system_settings`

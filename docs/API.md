# NIMS REST API Documentation

Base URL: `/api` (proxied via Next.js `/api/*` or directly at `http://localhost:4000/api`)

## Authentication & Security Headers

- **Session Cookie**: `POST /api/auth/login` sets an `HttpOnly` JWT cookie (`nims_session`) and a readable CSRF cookie (`nims_csrf`).
- **CSRF Protection**: All state-changing cookie requests (`POST`, `PUT`, `PATCH`, `DELETE`) must send header `X-CSRF-Token: <nims_csrf_value>`.
- **Bearer Auth**: API clients may also pass `Authorization: Bearer <jwt>`.

## Endpoints Overview

### Setup & Health
- `GET /api/health` — Service health status
- `GET /api/setup/status` — `{ needsSetup, organizationName }`
- `POST /api/setup/init` — Initialize first Super Admin (locked with `403` once 1+ user exists)

### Auth
- `POST /api/auth/login` — Authenticate (`{ username, password }`)
- `POST /api/auth/logout` — Revoke current session & clear cookies
- `GET /api/auth/me` — Current user profile + site permissions
- `POST /api/auth/change-password` — Update own password

### Dashboard
- `GET /api/dashboard/summary?siteId=<optional>` — KPIs, status summary, chart datasets, recent activity

### Sites & Projects
- `GET /api/sites?search=` — List permitted sites
- `GET /api/sites/:id` — Site details, device counts, resolved permissions
- `POST /api/sites` — Create site (`SUPER_ADMIN`)
- `PUT /api/sites/:id` — Update site (`canManageSite`)
- `DELETE /api/sites/:id` — Delete site (`SUPER_ADMIN`)
- `GET /api/sites/:id/projects` & `POST /api/sites/:id/projects`

### Device Inventory & Global Search
- `GET /api/devices/global-search?q=` — Search devices & subnets by IP, MAC, SN, Name, Model, Location
- `GET /api/devices?siteId=&category=&status=&vlan=&location=&model=&ip=&search=&page=&pageSize=&sortBy=&sortOrder=`
- `GET /api/devices/:id` — Full device details + subtype specs + linked IPAM + maintenance
- `POST /api/devices` — Create device (checks duplicate IP/MAC within site; auto-links IPAM)
- `PUT /api/devices/:id` — Update device (checks duplicate IP/MAC; syncs IPAM & diagrams)
- `DELETE /api/devices/:id` — Delete device

### Inventory Import & Export
- `POST /api/inventory/import/preview` — Multipart upload (`.xlsx`, `.xls`, `.csv`) + `siteId` + `category`; returns column mapping (`IP(VLAN 1211)` auto-detected) & duplicate/validation preview
- `POST /api/inventory/import/confirm` — Commit mapped rows with duplicate skip & summary report
- `GET /api/inventory/export?format=xlsx|csv|pdf&siteId=&category=` — Export inventory (zero credentials)

### IP Address Management (IPAM)
- `GET /api/ipam/vlans?siteId=` / `POST /api/ipam/vlans` / `DELETE /api/ipam/vlans/:id`
- `GET /api/ipam/subnets?siteId=` / `POST /api/ipam/subnets` / `DELETE /api/ipam/subnets/:id`
- `GET /api/ipam/subnets/:id/ips` — Full IP host grid with device associations
- `POST /api/ipam/ips/allocate` — Allocate, Reserve, or Release IP
- `GET /api/ipam/lookup?ip=` — Reverse lookup IP to device & subnet

### Credentials Vault (Strictly Blocked `403` for `IP_VIEWER`)
- `GET /api/credentials?siteId=&search=` — Masked credential list + instructions
- `POST /api/credentials` — Store AES-256-GCM encrypted credentials + access instructions
- `PUT /api/credentials/:id` — Update credential / re-encrypt password
- `POST /api/credentials/:id/reveal` — Decrypt username & password + write `VIEW_CREDENTIAL` audit log
- `POST /api/credentials/:id/copy` — Decrypt single field + write `COPY_USERNAME`/`COPY_PASSWORD` audit log
- `GET /api/credentials/:id/history` — Credential access audit history
- `DELETE /api/credentials/:id`

### Network Diagrams
- `GET /api/diagrams?siteId=` / `GET /api/diagrams/:id` (auto-enriches linked nodes with live inventory!)
- `POST /api/diagrams` / `PUT /api/diagrams/:id` (creates version in `diagram_versions`)
- `POST /api/diagrams/upload` — Upload `PNG`, `JPG`, `SVG`, `PDF`, `.drawio`, `.xml`, `.vsdx` (converts `.vsdx` to SVG preview & parses `.drawio` to React Flow)
- `GET /api/diagrams/:id/file` / `GET /api/diagrams/:id/preview-svg`
- `GET /api/diagrams/:id/export/drawio` — Export React Flow topology to `.drawio` XML
- `POST /api/diagrams/:id/restore/:version` / `DELETE /api/diagrams/:id`

### Project Documents
- `GET /api/documents?siteId=&category=&search=`
- `POST /api/documents/upload` — Multipart document upload
- `POST /api/documents/:id/replace` — Upload new version (`document_versions`)
- `GET /api/documents/:id/download?version=&inline=1` — Download or inline preview
- `DELETE /api/documents/:id`

### Maintenance, Users, Audit Logs, Backups & Settings
- `GET /api/maintenance?siteId=` / `POST /api/maintenance` / `DELETE /api/maintenance/:id`
- `GET /api/users` / `GET /api/users/roles` / `POST /api/users` / `PUT /api/users/:id` / `PUT /api/users/:id/site-permissions` / `DELETE /api/users/:id` (`SUPER_ADMIN`)
- `GET /api/audit-logs?siteId=&username=&action=&module=&result=&page=&pageSize=` (`SUPER_ADMIN`, `SITE_ADMIN`)
- `GET /api/backups` / `POST /api/backups/run` / `GET /api/backups/:id/download` / `POST /api/backups/:id/restore` / `POST /api/backups/upload-restore` (`SUPER_ADMIN`)
- `GET /api/settings/public` / `GET /api/settings` / `PUT /api/settings` / `POST /api/settings/logo` / `GET /api/settings/system-info`

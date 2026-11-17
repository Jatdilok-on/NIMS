# NIMS Backup & Restore Guide

## 1. What Each Backup Archive Contains

Each NIMS backup is a portable `.zip` archive (`nims-backup-<timestamp>.zip`) stored in `BACKUP_ROOT` (Local disk or mounted NAS):
- `database.json` — Logical snapshot of all NIMS tables (sites, devices, IPAM, encrypted credentials, diagrams, documents, maintenance logs, users, permissions, settings)
- `storage/` — Complete directory tree of uploaded Diagrams, Project Documents, and Branding assets organized by site
- `manifest.json` — Timestamp and SHA-256 checksum of the database snapshot

> Note: Device credentials remain **AES-256-GCM encrypted** inside `database.json`. Always retain a separate secure copy of `CREDENTIALS_ENCRYPTION_KEY` from `.env`.

## 2. Scheduled & Manual Backups

1. Sign in as **Super Admin** and open **System & Backup** (`/settings`).
2. Configure:
   - **Backup Location** (e.g., `/data/nims/backups` or mounted NAS path)
   - **Scheduled Backup Frequency**: `Daily (02:00 AM)`, `Weekly`, `Monthly`, or `Manual Only`
   - **Backup Retention Count**: Number of completed archives to retain automatically (older archives are pruned).
3. Click **Run Manual Backup Now** to trigger an immediate backup and download the `.zip` archive off-site if desired.

## 3. Restoring from a Backup

### In-App Restore (Super Admin)
- Click **Restore** next to any listed backup job in `/settings`, OR
- Click **Upload & Restore (.zip)** to restore from an offline archive file.

### MongoDB Physical Backup (Optional Secondary Backup)
For large deployments, you can also run `mongodump` / `mongorestore`:
```bash
mongodump --uri="mongodb://127.0.0.1:27017/nims" --archive="nims_mongo_$(date +%F).gz" --gzip
```
Restore with:
```bash
mongorestore --uri="mongodb://127.0.0.1:27017/nims" --archive="nims_mongo_YYYY-MM-DD.gz" --gzip --drop
```

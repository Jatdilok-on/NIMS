'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Database,
  Download,
  HardDrive,
  Play,
  RotateCcw,
  Save,
  Settings as SettingsIcon,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { ConfirmActionModal } from '@/components/common/ConfirmActionModal';
import { apiFetch, ApiError, formatBytes } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { NIMS_THEMES, ThemeId } from '@/lib/themes';

interface SystemSettings {
  organizationName: string;
  defaultTheme: ThemeId;
  storageLocation: string;
  backupLocation: string;
  backupSchedule: 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
  backupRetentionCount: number;
  auditRetentionDays: number;
}

interface BackupJob {
  id: string;
  type: string;
  status: string;
  fileName: string;
  fileSize: number;
  checksum?: string | null;
  includesDb?: boolean;
  includesFiles?: boolean;
  notes?: string | null;
  initiatedBy?: { username: string; fullName: string } | null;
  startedAt: string;
  completedAt?: string | null;
}

interface SystemInfo {
  nodeVersion: string;
  platform: string;
  arch: string;
  hostname: string;
  uptimeSeconds: number;
  totalMemoryMb: number;
  freeMemoryMb: number;
  databaseStatus: string;
  storageExists: boolean;
  activeStorageRoot?: string;
  activeBackupDir?: string;
  storageUsageBytes?: number;
  backupUsageBytes?: number;
  backupDiskFreeBytes?: number | null;
  counts: {
    siteCount: number;
    deviceCount: number;
    documentCount?: number;
    diagramCount?: number;
    userCount: number;
    auditCount: number;
  };
}

export default function SettingsAndBackupPage() {
  const { t } = useI18n();
  const { user, refreshUser } = useAuth();
  const isSuperAdmin = user?.roleCode === 'SUPER_ADMIN';
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [backups, setBackups] = useState<BackupJob[]>([]);
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [runningBackup, setRunningBackup] = useState(false);
  const [backupScope, setBackupScope] = useState<'FULL' | 'DB_ONLY'>('FULL');
  const [backupNotes, setBackupNotes] = useState('');
  const [msg, setMsg] = useState('');
  const [restoreConfirm, setRestoreConfirm] = useState<
    | { kind: 'job'; job: BackupJob }
    | { kind: 'file'; file: File }
    | null
  >(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BackupJob | null>(null);
  const [deletingBackup, setDeletingBackup] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pruneConfirmOpen, setPruneConfirmOpen] = useState(false);
  const [pruning, setPruning] = useState(false);
  const [pruneError, setPruneError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoadError(null);
    try {
      const [sRes, bRes, iRes] = await Promise.all([
        apiFetch<{ settings: SystemSettings }>('/settings'),
        apiFetch<{ jobs: BackupJob[] }>('/backups'),
        apiFetch<{ systemInfo: SystemInfo }>('/settings/system-info'),
      ]);
      setSettings(sRes.settings);
      setBackups(bRes.jobs);
      setSysInfo(iRes.systemInfo);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load system settings');
    }
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    loadAll();
  }, [loadAll, isSuperAdmin]);

  if (user && !isSuperAdmin) {
    return (
      <div className="p-8 text-center text-sm text-red-600 dark:text-red-400">
        Access denied: Super Admin privileges are required to view system settings and backups.
      </div>
    );
  }

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setMsg('');
    try {
      await apiFetch('/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      await refreshUser();
      setMsg('System settings saved and backup schedule refreshed.');
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleRunBackup = async () => {
    setRunningBackup(true);
    setMsg('');
    try {
      const includesFiles = backupScope === 'FULL';
      await apiFetch('/backups/run', {
        method: 'POST',
        body: JSON.stringify({
          includesDb: true,
          includesFiles,
          notes: backupNotes.trim() || undefined,
        }),
      });
      setBackupNotes('');
      setMsg(
        includesFiles
          ? 'Full backup (Database + Storage files) completed.'
          : 'Database-only backup completed.',
      );
      loadAll();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Backup failed');
    } finally {
      setRunningBackup(false);
    }
  };

  const handleDeleteBackup = (job: BackupJob) => {
    setDeleteError(null);
    setDeleteTarget(job);
  };

  const confirmDeleteBackup = async () => {
    if (!deleteTarget) return;
    setDeletingBackup(true);
    setDeleteError(null);
    try {
      const res = await apiFetch<{ fileName: string; freedBytes: number }>(
        `/backups/${deleteTarget.id}`,
        { method: 'DELETE' },
      );
      setDeleteTarget(null);
      setMsg(`Deleted backup "${res.fileName}" (${formatBytes(res.freedBytes)} freed).`);
      loadAll();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Failed to delete backup');
    } finally {
      setDeletingBackup(false);
    }
  };

  const confirmPruneBackups = async () => {
    setPruning(true);
    setPruneError(null);
    try {
      const res = await apiFetch<{
        deletedBackups: number;
        freedBytes: number;
        deletedAuditLogs: number;
      }>('/backups/prune', {
        method: 'POST',
        body: JSON.stringify({ includeAuditLogs: true }),
      });
      setPruneConfirmOpen(false);
      setMsg(
        `Cleanup complete: removed ${res.deletedBackups} old backup(s) (${formatBytes(res.freedBytes)} freed) and ${res.deletedAuditLogs} expired audit log(s).`,
      );
      loadAll();
    } catch (err) {
      setPruneError(err instanceof ApiError ? err.message : 'Retention cleanup failed');
    } finally {
      setPruning(false);
    }
  };

  const handleRestore = (job: BackupJob) => {
    setRestoreError(null);
    setRestoreConfirm({ kind: 'job', job });
  };

  const handleUploadRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setRestoreError(null);
    setRestoreConfirm({ kind: 'file', file });
  };

  const confirmRestore = async () => {
    if (!restoreConfirm) return;
    setRestoring(true);
    setRestoreError(null);
    try {
      if (restoreConfirm.kind === 'job') {
        await apiFetch(`/backups/${restoreConfirm.job.id}/restore`, { method: 'POST' });
        setMsg('System restored successfully.');
      } else {
        const fd = new FormData();
        fd.append('file', restoreConfirm.file);
        await apiFetch('/backups/upload-restore', { method: 'POST', body: fd });
        setMsg('Backup uploaded and restored.');
      }
      setRestoreConfirm(null);
      loadAll();
    } catch (err) {
      setRestoreError(err instanceof ApiError ? err.message : 'Restore failed');
    } finally {
      setRestoring(false);
    }
  };

  if (!settings) {
    if (loadError) {
      return (
        <div className="p-8 text-center space-y-3">
          <div className="text-sm text-red-600 dark:text-red-400">{loadError}</div>
          <button
            onClick={() => loadAll()}
            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium cursor-pointer"
          >
            Retry
          </button>
        </div>
      );
    }
    return <div className="p-8 text-center text-sm text-slate-500">Loading settings...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('settings.title')}</h1>
        <p className="text-sm text-[var(--nims-muted)]">{t('settings.subtitle')}</p>
      </div>

      {msg && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm text-emerald-700">
          {msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Settings Form */}
        <form
          onSubmit={handleSaveSettings}
          className="lg:col-span-2 rounded-xl bg-[var(--nims-surface)] border border-[var(--nims-border)] p-6 space-y-4 text-sm"
        >
          <div className="flex items-center gap-2 font-bold text-base">
            <SettingsIcon className="h-5 w-5 text-blue-600" />
            <span>{t('settings.orgConfig')}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--nims-muted)] mb-1">
                {t('settings.orgName')}
              </label>
              <input
                value={settings.organizationName}
                onChange={(e) => setSettings({ ...settings, organizationName: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[var(--nims-border)] bg-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--nims-muted)] mb-1">
                {t('settings.defaultTheme')}
              </label>
              <select
                value={settings.defaultTheme}
                onChange={(e) =>
                  setSettings({ ...settings, defaultTheme: e.target.value as ThemeId })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--nims-border)] bg-[var(--nims-surface)]"
              >
                {NIMS_THEMES.map((item) => {
                  const key = `theme.${item.id}` as Parameters<typeof t>[0];
                  return (
                    <option key={item.id} value={item.id}>
                      {t(key)}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Active Storage Path (.env STORAGE_ROOT)
              </label>
              <input
                readOnly
                value={sysInfo?.activeStorageRoot || settings.storageLocation}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 font-mono text-xs text-slate-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Backup Location (Local / NAS)
              </label>
              <input
                value={settings.backupLocation}
                onChange={(e) => setSettings({ ...settings, backupLocation: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-mono text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Scheduled Backup Frequency
              </label>
              <select
                value={settings.backupSchedule}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    backupSchedule: e.target.value as SystemSettings['backupSchedule'],
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="NONE">Manual Only</option>
                <option value="DAILY">Daily (02:00 AM)</option>
                <option value="WEEKLY">Weekly (Sunday 02:00 AM)</option>
                <option value="MONTHLY">Monthly (1st 02:00 AM)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Backup Retention Count
              </label>
              <input
                type="number"
                min={1}
                max={365}
                value={settings.backupRetentionCount}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    backupRetentionCount: parseInt(e.target.value || '14', 10),
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Audit Log Retention (Days)
              </label>
              <input
                type="number"
                min={30}
                max={3650}
                value={settings.auditRetentionDays}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    auditRetentionDays: parseInt(e.target.value || '365', 10),
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 text-white font-semibold cursor-pointer"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </form>

        {/* System Information Card */}
        {sysInfo && (
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-3 text-sm">
            <div className="flex items-center gap-2 font-bold text-base">
              <HardDrive className="h-5 w-5 text-emerald-600" />
              <span>System Information</span>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Database (MongoDB)</span>
                <span className="font-semibold text-emerald-600">{sysInfo.databaseStatus}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Node.js / Platform</span>
                <span className="font-mono">
                  {sysInfo.nodeVersion} • {sysInfo.platform} ({sysInfo.arch})
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Memory Free / Total</span>
                <span>{sysInfo.freeMemoryMb} / {sysInfo.totalMemoryMb} MB</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Storage / Backup Used</span>
                <span className="font-mono">
                  {formatBytes(sysInfo.storageUsageBytes ?? 0)} / {formatBytes(sysInfo.backupUsageBytes ?? 0)}
                </span>
              </div>
              {typeof sysInfo.backupDiskFreeBytes === 'number' && (
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Backup Drive Free Space</span>
                  <span className="font-mono font-semibold">{formatBytes(sysInfo.backupDiskFreeBytes)}</span>
                </div>
              )}
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Sites / Devices</span>
                <span>{sysInfo.counts.siteCount} / {sysInfo.counts.deviceCount}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Documents / Diagrams</span>
                <span>{sysInfo.counts.documentCount ?? 0} / {sysInfo.counts.diagramCount ?? 0}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Users / Audit Logs</span>
                <span>{sysInfo.counts.userCount} / {sysInfo.counts.auditCount}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Backup & Restore Section */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-bold text-base">
              <Database className="h-5 w-5 text-blue-600" />
              <span>Database & Storage Backups</span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Retention policy keeps the newest {settings.backupRetentionCount} completed/restored archive(s). Always store copies & <code className="font-mono">.env</code> off-site.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setPruneError(null);
                setPruneConfirmOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
              title="Clean backups beyond retention count and expired audit logs"
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-600" />
              Clean Old Backups
            </button>
            <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
              <Upload className="h-3.5 w-3.5" />
              Upload & Restore (.zip)
              <input type="file" accept=".zip" onChange={handleUploadRestore} className="hidden" />
            </label>
          </div>
        </div>

        <div className="rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-3.5 py-2 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            Backup <code className="font-mono">.zip</code> archives contain full database snapshots and encrypted Access Vault secrets — restrict access to <code className="font-mono">{sysInfo?.activeBackupDir || settings.backupLocation}</code> and back up <code className="font-mono">.env</code> separately.
          </span>
        </div>

        {/* Manual Backup Controls */}
        <div className="flex flex-wrap items-center gap-2.5 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs">
          <select
            value={backupScope}
            onChange={(e) => setBackupScope(e.target.value as 'FULL' | 'DB_ONLY')}
            aria-label="Backup scope"
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold cursor-pointer"
          >
            <option value="FULL">Full Backup (Database + Storage Files)</option>
            <option value="DB_ONLY">Database Only (Fast Snapshot)</option>
          </select>
          <input
            type="text"
            value={backupNotes}
            onChange={(e) => setBackupNotes(e.target.value)}
            maxLength={200}
            placeholder="Optional note (e.g. Before server patch)..."
            className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
          />
          <button
            type="button"
            onClick={handleRunBackup}
            disabled={runningBackup}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0f2942] hover:bg-[#143758] text-white font-semibold cursor-pointer disabled:opacity-60"
          >
            <Play className="h-3.5 w-3.5" />
            {runningBackup ? 'Creating Backup...' : 'Run Backup Now'}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <th className="py-2 pr-4">Backup File</th>
                <th className="py-2 pr-4">Scope</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Size</th>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {backups.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-500 text-xs">
                    No backup archives created yet.
                  </td>
                </tr>
              ) : (
                backups.map((b) => {
                  const statusClass =
                    b.status === 'COMPLETED'
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : b.status === 'RESTORED'
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                        : b.status === 'FAILED'
                          ? 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                          : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300';
                  const scopeLabel =
                    b.includesDb !== false && b.includesFiles !== false
                      ? 'DB + Files'
                      : b.includesDb !== false
                        ? 'DB Only'
                        : 'Files Only';
                  const canDownloadOrRestore =
                    b.status === 'COMPLETED' || b.status === 'RESTORED';

                  return (
                    <tr key={b.id}>
                      <td className="py-2.5 pr-4">
                        <div className="font-mono text-xs">{b.fileName}</div>
                        {(b.notes || b.checksum) && (
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {b.notes ? <span>{b.notes}</span> : null}
                            {b.notes && b.checksum ? ' • ' : ''}
                            {b.checksum ? (
                              <span className="font-mono">SHA256:{b.checksum.slice(0, 10)}</span>
                            ) : null}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-slate-600 dark:text-slate-300">
                        {scopeLabel}
                      </td>
                      <td className="py-2.5 pr-4 text-xs">{b.type}</td>
                      <td className="py-2.5 pr-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusClass}`}>
                          {b.status}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-xs">{formatBytes(b.fileSize)}</td>
                      <td className="py-2.5 pr-4 text-xs text-slate-500">
                        <div>{new Date(b.startedAt).toLocaleString()}</div>
                        {b.initiatedBy?.username && (
                          <div className="text-[11px] text-slate-400">by {b.initiatedBy.username}</div>
                        )}
                      </td>
                      <td className="py-2.5 text-right whitespace-nowrap">
                        {canDownloadOrRestore && (
                          <>
                            <a
                              href={`/api/backups/${b.id}/download`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs mr-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
                            >
                              <Download className="h-3 w-3" />
                              Download
                            </a>
                            <button
                              type="button"
                              onClick={() => handleRestore(b)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-50 text-amber-800 border border-amber-200 text-xs font-medium cursor-pointer mr-1.5 hover:bg-amber-100"
                            >
                              <RotateCcw className="h-3 w-3" />
                              Restore
                            </button>
                          </>
                        )}
                        {b.status !== 'RUNNING' && (
                          <button
                            type="button"
                            onClick={() => handleDeleteBackup(b)}
                            title="Delete backup archive"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-red-200 dark:border-red-900 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 text-xs cursor-pointer"
                          >
                            <Trash2 className="h-3 w-3" />
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {restoreConfirm && (
        <ConfirmActionModal
          title={restoreConfirm.kind === 'job' ? 'Restore System Backup' : 'Upload & Restore Backup'}
          subtitle="Database & files snapshot restore"
          itemName={
            restoreConfirm.kind === 'job'
              ? restoreConfirm.job.fileName
              : restoreConfirm.file.name
          }
          badgeText={restoreConfirm.kind === 'job' ? restoreConfirm.job.type : 'UPLOAD'}
          details={
            restoreConfirm.kind === 'job'
              ? [{ label: 'Size', value: formatBytes(restoreConfirm.job.fileSize) }]
              : [{ label: 'Size', value: formatBytes(restoreConfirm.file.size) }]
          }
          message={
            restoreConfirm.kind === 'job'
              ? 'Existing database records and uploaded files will be replaced by this backup snapshot.'
              : 'Upload this backup archive and replace the current system database and files?'
          }
          variant="warning"
          confirmLabel="Restore"
          loadingLabel="Restoring..."
          loading={restoring}
          error={restoreError}
          onCancel={() => {
            if (!restoring) setRestoreConfirm(null);
          }}
          onConfirm={confirmRestore}
        />
      )}

      {deleteTarget && (
        <ConfirmActionModal
          title="Delete Backup Archive"
          subtitle="Permanent backup & disk file removal"
          itemName={deleteTarget.fileName}
          badgeText={deleteTarget.status}
          details={[
            { label: 'Type', value: deleteTarget.type },
            { label: 'Size', value: formatBytes(deleteTarget.fileSize) },
          ]}
          message="This will permanently delete both the backup record and its .zip archive from disk."
          variant="danger"
          confirmLabel="Delete"
          loadingLabel="Deleting..."
          loading={deletingBackup}
          error={deleteError}
          onCancel={() => {
            if (!deletingBackup) setDeleteTarget(null);
          }}
          onConfirm={confirmDeleteBackup}
        />
      )}

      {pruneConfirmOpen && (
        <ConfirmActionModal
          title="Clean Old Backups & Expired Audit Logs"
          subtitle="Apply configured retention policy immediately"
          itemName={`Keep latest ${settings.backupRetentionCount} backups • ${settings.auditRetentionDays} days audit history`}
          badgeText="RETENTION"
          message="Older backup archives exceeding Retention Count and audit logs older than Audit Log Retention Days will be permanently deleted."
          variant="warning"
          confirmLabel="Run Cleanup"
          loadingLabel="Cleaning..."
          loading={pruning}
          error={pruneError}
          onCancel={() => {
            if (!pruning) setPruneConfirmOpen(false);
          }}
          onConfirm={confirmPruneBackups}
        />
      )}
    </div>
  );
}

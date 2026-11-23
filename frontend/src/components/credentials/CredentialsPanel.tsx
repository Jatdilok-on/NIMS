'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  ClipboardCopy,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileSpreadsheet,
  History,
  KeyRound,
  Pencil,
  Plus,
  ShieldAlert,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { ConfirmActionModal } from '@/components/common/ConfirmActionModal';
import {
  SearchInputWithClear,
  SiteQuickPills,
  SiteSelectControl,
} from '@/components/common/SiteFilterBar';
import { apiFetch, ApiError, copyTextSafe, getSafeExternalUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { CredentialItem, LoginType, Site } from '@/lib/types';
import { ImportCredentialsModal } from './ImportCredentialsModal';

export function CredentialsPanel({
  fixedSiteId,
  canEdit = true,
}: {
  fixedSiteId?: string;
  canEdit?: boolean;
}) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [sites, setSites] = useState<Site[]>([]);
  const [credentials, setCredentials] = useState<CredentialItem[]>([]);
  const [siteFilter, setSiteFilter] = useState('');
  const [loginTypeFilter, setLoginTypeFilter] = useState<'' | LoginType>('');
  const [search, setSearch] = useState('');
  const [revealed, setRevealed] = useState<Record<string, { username: string; password: string }>>({});
  const [toast, setToast] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingCred, setEditingCred] = useState<CredentialItem | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [instructionModal, setInstructionModal] = useState<CredentialItem | null>(null);
  const [historyModal, setHistoryModal] = useState<{
    cred: CredentialItem;
    logs: Array<{ id: string; username: string; action: string; sourceIp?: string; createdAt: string }>;
  } | null>(null);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<CredentialItem | null>(null);
  const [deletingCred, setDeletingCred] = useState(false);
  const [deleteCredError, setDeleteCredError] = useState<string | null>(null);

  const isIpViewer = user?.roleCode === 'IP_VIEWER';

  useEffect(() => {
    if (isIpViewer) return;
    apiFetch<{ sites: Site[] }>('/sites')
      .then((res) => setSites(res.sites))
      .catch(() => {});
  }, [isIpViewer]);

  const loadCredentials = useCallback(async () => {
    if (isIpViewer) return;
    setError('');
    try {
      const params = new URLSearchParams();
      if (fixedSiteId) params.set('siteId', fixedSiteId);
      if (search.trim()) params.set('search', search.trim());
      const res = await apiFetch<{ credentials: CredentialItem[] }>(
        `/credentials?${params.toString()}`,
      );
      setCredentials(res.credentials);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load credentials');
    }
  }, [fixedSiteId, search, isIpViewer]);

  useEffect(() => {
    loadCredentials();
  }, [loadCredentials]);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const credCountsBySite = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of credentials) {
      map.set(c.siteId, (map.get(c.siteId) || 0) + 1);
    }
    return map;
  }, [credentials]);

  const filteredCredentials = useMemo(() => {
    return credentials.filter((c) => {
      if (!fixedSiteId && siteFilter && c.siteId !== siteFilter) return false;
      if (loginTypeFilter && c.loginType !== loginTypeFilter) return false;
      return true;
    });
  }, [credentials, fixedSiteId, siteFilter, loginTypeFilter]);

  if (isIpViewer) {
    return (
      <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-8 text-center space-y-2">
        <ShieldAlert className="h-8 w-8 text-amber-600 mx-auto" />
        <h3 className="font-bold text-base">{t('vault.restrictedTitle')}</h3>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {t('vault.restrictedDesc')}
        </p>
      </div>
    );
  }

  const notify = (msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(''), 2500);
  };

  const toggleReveal = async (cred: CredentialItem) => {
    if (revealed[cred.id]) {
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[cred.id];
        return next;
      });
      return;
    }
    try {
      const res = await apiFetch<{ username: string; password: string }>(
        `/credentials/${cred.id}/reveal`,
        { method: 'POST' },
      );
      setRevealed((prev) => ({ ...prev, [cred.id]: res }));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to reveal credential');
    }
  };

  const copyField = async (cred: CredentialItem, field: 'username' | 'password') => {
    try {
      const res = await apiFetch<{ value: string }>(`/credentials/${cred.id}/copy`, {
        method: 'POST',
        body: JSON.stringify({ field }),
      });
      await copyTextSafe(res.value);
      notify(`${field === 'username' ? 'Username' : 'Password'} copied (audit logged)`);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to copy');
    }
  };

  const copyTextValue = async (label: string, value?: string | number | null) => {
    const str = value !== null && value !== undefined ? String(value).trim() : '';
    if (!str) return;
    try {
      await copyTextSafe(str);
      notify(`${label} copied`);
    } catch {
      alert('Unable to copy to clipboard');
    }
  };

  const copyAllParams = async (cred: CredentialItem) => {
    try {
      let secret = revealed[cred.id];
      if (!secret) {
        secret = await apiFetch<{ username: string; password: string }>(
          `/credentials/${cred.id}/reveal`,
          { method: 'POST' },
        );
        setRevealed((prev) => ({ ...prev, [cred.id]: secret }));
      }
      const firstInst = cred.instructions?.[0];
      const stepsList = Array.isArray(firstInst?.steps) ? firstInst.steps : [];
      const lines = [
        `Site: ${cred.site?.siteCode || '-'}`,
        `Device Name: ${cred.deviceName}`,
        cred.deviceModel ? `Model: ${cred.deviceModel}` : null,
        `Login Type: ${cred.loginType}${cred.port ? ` (Port: ${cred.port})` : ''}`,
        cred.managementIp ? `IP / Host: ${cred.managementIp}` : null,
        cred.url ? `URL: ${cred.url}` : null,
        cred.accessMethod ? `Access Method: ${cred.accessMethod}` : null,
        `Username: ${secret.username}`,
        `Password: ${secret.password}`,
        firstInst?.howToConnect ? `How to Connect: ${firstInst.howToConnect}` : null,
        stepsList.length > 0 ? `Steps:\n${stepsList.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}` : null,
        firstInst?.notes ? `Notes: ${firstInst.notes}` : null,
        cred.remark ? `Remark: ${cred.remark}` : null,
      ].filter(Boolean);
      await copyTextSafe(lines.join('\n'));
      notify('All login/VPN parameters copied (audit logged)');
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to copy parameters');
    }
  };

  const openHistory = async (cred: CredentialItem) => {
    try {
      const res = await apiFetch<{
        history: Array<{ id: string; username: string; action: string; sourceIp?: string; createdAt: string }>;
      }>(`/credentials/${cred.id}/history`);
      setHistoryModal({ cred, logs: res.history });
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to load history');
    }
  };

  const handleDelete = (cred: CredentialItem) => {
    setDeleteCredError(null);
    setDeleteTarget(cred);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeletingCred(true);
    setDeleteCredError(null);
    try {
      await apiFetch(`/credentials/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      loadCredentials();
    } catch (err) {
      setDeleteCredError(err instanceof ApiError ? err.message : 'Failed to delete credential');
    } finally {
      setDeletingCred(false);
    }
  };

  const activeExportSiteId = fixedSiteId || siteFilter;

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed bottom-20 right-6 z-50 bg-[#0f2942] text-white px-4 py-2.5 rounded-lg shadow-xl text-xs font-semibold">
          {toast}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[260px]">
          <SearchInputWithClear
            value={search}
            onChange={setSearch}
            placeholder={t('vault.searchPlaceholder')}
            className="flex-1 min-w-[220px] max-w-md"
          />
          {!fixedSiteId && (
            <SiteSelectControl
              sites={sites}
              value={siteFilter}
              onChange={setSiteFilter}
              countsBySite={credCountsBySite}
              totalCount={credentials.length}
              className="min-w-[200px]"
            />
          )}
          <select
            value={loginTypeFilter}
            onChange={(e) => setLoginTypeFilter(e.target.value as '' | LoginType)}
            aria-label="Filter by Login Type"
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold cursor-pointer"
          >
            <option value="">ทุกประเภท Login ({credentials.length})</option>
            <option value="SSH">SSH</option>
            <option value="HTTPS">HTTPS</option>
            <option value="HTTP">HTTP</option>
            <option value="WINBOX">Winbox</option>
            <option value="RDP">RDP</option>
            <option value="VPN">VPN</option>
            <option value="CONSOLE">Console</option>
            <option value="WEB_GUI">Web GUI</option>
            <option value="OTHER">Other</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/api/credentials/export?format=xlsx${activeExportSiteId ? `&siteId=${encodeURIComponent(activeExportSiteId)}` : ''}`}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
            {t('common.exportExcel')}
          </a>
          <a
            href={`/api/credentials/export?format=csv${activeExportSiteId ? `&siteId=${encodeURIComponent(activeExportSiteId)}` : ''}`}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Download className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" />
            {t('common.exportCsv')}
          </a>
          {canEdit && (
            <button
              onClick={() => setShowImport(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-semibold hover:bg-blue-100 cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5" />
              {t('common.importExcelCsv')}
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              {t('vault.addCred')}
            </button>
          )}
        </div>
      </div>

      {!fixedSiteId && (
        <SiteQuickPills
          sites={sites}
          value={siteFilter}
          onChange={setSiteFilter}
          countsBySite={credCountsBySite}
          totalCount={credentials.length}
        />
      )}

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filteredCredentials.length === 0 ? (
          <div className="col-span-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-500 space-y-2">
            <div>{t('vault.empty')}</div>
            {(search || siteFilter || loginTypeFilter) && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setSiteFilter('');
                  setLoginTypeFilter('');
                }}
                className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
              >
                แสดงทั้งหมด
              </button>
            )}
          </div>
        ) : (
          filteredCredentials.map((cred) => {
            const rev = revealed[cred.id];
            const firstInst = cred.instructions?.[0];
            const stepsList = Array.isArray(firstInst?.steps) ? firstInst.steps : [];
            const paramItems: Array<{ label: string; value?: string | number | null; mono?: boolean; isUrl?: boolean }> = [
              { label: 'Site', value: cred.site?.siteCode ? `${cred.site.siteCode} (${cred.site.siteName})` : '-' },
              { label: 'Device Name', value: cred.deviceName },
              { label: 'Device Model', value: cred.deviceModel || '-' },
              { label: 'Management IP / Host', value: cred.managementIp || '-', mono: true },
              { label: 'Login Type', value: cred.loginType },
              { label: 'Port', value: cred.port ?? '-', mono: true },
              { label: 'Access Method', value: cred.accessMethod || '-' },
              { label: 'Management URL', value: cred.url || '-', mono: true, isUrl: Boolean(cred.url) },
              {
                label: 'Updated / Expires',
                value: `${new Date(cred.passwordUpdatedAt).toLocaleDateString()}${
                  cred.passwordExpiresAt ? ` → Exp: ${new Date(cred.passwordExpiresAt).toLocaleDateString()}` : ''
                }`,
              },
            ];

            return (
              <div
                key={cred.id}
                className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-9 w-9 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center text-blue-600 shrink-0">
                      <KeyRound className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-sm truncate">{cred.deviceName}</div>
                      <div className="text-xs text-slate-500 truncate">
                        {cred.site?.siteCode} • {cred.deviceModel || 'Network Device'} •{' '}
                        <span className="font-mono">{cred.managementIp || '-'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => copyAllParams(cred)}
                      title={t('vault.copyAll')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-50 dark:bg-sky-950/60 hover:bg-sky-100 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 text-[11px] font-semibold cursor-pointer"
                    >
                      <ClipboardCopy className="h-3 w-3" />
                      {t('vault.copyAll')}
                    </button>
                    <span className="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-semibold">
                      {cred.loginType}
                      {cred.port ? `:${cred.port}` : ''}
                    </span>
                  </div>
                </div>

                {/* Encrypted Username / Password Row */}
                <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">{t('vault.username')}</span>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-mono font-semibold select-all truncate">
                        {rev ? rev.username : cred.usernameMasked}
                      </span>
                      <button
                        onClick={() => toggleReveal(cred)}
                        title={rev ? 'Hide Username & Password' : 'Reveal Username & Password'}
                        className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                      >
                        {rev ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        onClick={() => copyField(cred, 'username')}
                        title="Copy Username"
                        className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">{t('vault.password')}</span>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-mono font-semibold select-all truncate">
                        {rev ? rev.password : cred.passwordMasked}
                      </span>
                      <button
                        onClick={() => toggleReveal(cred)}
                        title={rev ? 'Hide Username & Password' : 'Reveal Username & Password'}
                        className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                      >
                        {rev ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        onClick={() => copyField(cred, 'password')}
                        title="Copy Password"
                        className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* All Connection Parameters (Always Visible & Copyable for Login / VPN) */}
                <div className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 p-3 space-y-2 text-xs">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {t('vault.allParams')}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5">
                    {paramItems.map((p) => {
                      const hasVal = p.value !== undefined && p.value !== null && String(p.value) !== '-';
                      return (
                        <div
                          key={p.label}
                          className="flex items-center justify-between gap-1.5 py-1 border-b border-slate-200/60 dark:border-slate-800/80 last:border-b-0 min-w-0"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-[10px] text-slate-400">{p.label}</div>
                            {p.isUrl && hasVal && getSafeExternalUrl(String(p.value)) ? (
                              <a
                                href={getSafeExternalUrl(String(p.value))!}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono text-sky-600 dark:text-sky-400 hover:underline truncate block select-all"
                                title={String(p.value)}
                              >
                                {String(p.value)}
                              </a>
                            ) : (
                              <div
                                className={`${p.mono ? 'font-mono' : ''} font-medium text-slate-700 dark:text-slate-200 truncate select-all`}
                                title={String(p.value ?? '-')}
                              >
                                {String(p.value ?? '-')}
                              </div>
                            )}
                          </div>
                          {hasVal && (
                            <button
                              type="button"
                              onClick={() => copyTextValue(p.label, p.value)}
                              title={`Copy ${p.label}`}
                              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 cursor-pointer shrink-0"
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* How to Connect / Steps / Notes / Remark */}
                  <div className="pt-1.5 border-t border-slate-200/70 dark:border-slate-800 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] text-slate-400 block">How to Connect</span>
                        <span className="text-slate-700 dark:text-slate-200 select-all break-words">
                          {firstInst?.howToConnect || '-'}
                        </span>
                      </div>
                      {firstInst?.howToConnect && (
                        <button
                          type="button"
                          onClick={() => copyTextValue('How to Connect', firstInst.howToConnect)}
                          title="Copy How to Connect"
                          className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 cursor-pointer shrink-0"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] text-slate-400 block">Connection Steps</span>
                        {stepsList.length > 0 ? (
                          <ol className="list-decimal list-inside space-y-0.5 text-slate-700 dark:text-slate-200 font-mono text-[11px] select-all">
                            {stepsList.map((s, idx) => (
                              <li key={idx} className="break-words">{s}</li>
                            ))}
                          </ol>
                        ) : (
                          <span>-</span>
                        )}
                      </div>
                      {stepsList.length > 0 && (
                        <button
                          type="button"
                          onClick={() => copyTextValue('Connection Steps', stepsList.join('\n'))}
                          title="Copy Connection Steps"
                          className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 cursor-pointer shrink-0"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="flex items-start justify-between gap-1.5 min-w-0">
                        <div className="min-w-0 flex-1">
                          <span className="text-[10px] text-slate-400 block">Instruction Notes</span>
                          <span className="text-slate-700 dark:text-slate-200 select-all break-words">
                            {firstInst?.notes || '-'}
                          </span>
                        </div>
                        {firstInst?.notes && (
                          <button
                            type="button"
                            onClick={() => copyTextValue('Instruction Notes', firstInst.notes)}
                            title="Copy Notes"
                            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 cursor-pointer shrink-0"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        )}
                      </div>

                      <div className="flex items-start justify-between gap-1.5 min-w-0">
                        <div className="min-w-0 flex-1">
                          <span className="text-[10px] text-slate-400 block">Remark</span>
                          <span className="text-slate-700 dark:text-slate-200 select-all break-words">
                            {cred.remark || '-'}
                          </span>
                        </div>
                        {cred.remark && (
                          <button
                            type="button"
                            onClick={() => copyTextValue('Remark', cred.remark)}
                            title="Copy Remark"
                            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 cursor-pointer shrink-0"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1">
                  <div className="text-slate-500">
                    {t('vault.updated')} {new Date(cred.passwordUpdatedAt).toLocaleDateString()}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {getSafeExternalUrl(cred.url) && (
                      <a
                        href={getSafeExternalUrl(cred.url)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {t('vault.openUrl')}
                      </a>
                    )}
                    <button
                      onClick={() => setInstructionModal(cred)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <BookOpen className="h-3 w-3" />
                      {t('vault.instructions')}
                    </button>
                    <button
                      onClick={() => openHistory(cred)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <History className="h-3 w-3" />
                      {t('vault.history')}
                    </button>
                    {canEdit && (
                      <button
                        onClick={() => {
                          setEditingCred(cred);
                          setShowModal(true);
                        }}
                        title="Edit Credential & Parameters"
                        className="p-1.5 rounded hover:bg-blue-50 dark:hover:bg-blue-950 text-blue-600 cursor-pointer"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => handleDelete(cred)}
                        title="Delete Credential"
                        className="p-1.5 rounded hover:bg-red-50 text-red-600 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Instructions Modal */}
      {instructionModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base">
                Access Instructions — {instructionModal.deviceName}
              </h3>
              <button onClick={() => setInstructionModal(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            {instructionModal.instructions && instructionModal.instructions.length > 0 ? (
              instructionModal.instructions.map((inst) => (
                <div key={inst.id} className="space-y-3 text-sm">
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                    <div className="text-xs font-semibold text-slate-500 mb-1">
                      Connection Method
                    </div>
                    <p>{inst.howToConnect || instructionModal.accessMethod || '-'}</p>
                  </div>
                  {Array.isArray(inst.steps) && inst.steps.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-slate-500 mb-1">
                        Connection Steps
                      </div>
                      <ol className="list-decimal list-inside space-y-1">
                        {inst.steps.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">
                Access Method: {instructionModal.accessMethod || instructionModal.loginType}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Access History Modal */}
      {historyModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base">
                Access History — {historyModal.cred.deviceName}
              </h3>
              <button onClick={() => setHistoryModal(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {historyModal.logs.length === 0 ? (
                <p className="py-4 text-slate-500 text-center">No credential access events yet.</p>
              ) : (
                historyModal.logs.map((l) => (
                  <div key={l.id} className="py-2 flex items-center justify-between">
                    <div>
                      <span className="font-semibold">{l.username}</span> •{' '}
                      <span className="font-mono">{l.action}</span>
                    </div>
                    <span className="text-slate-500">
                      {new Date(l.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Credential Modal */}
      {showModal && (
        <AddCredentialModal
          sites={sites}
          fixedSiteId={fixedSiteId}
          editing={editingCred}
          onClose={() => {
            setShowModal(false);
            setEditingCred(null);
          }}
          onCreated={() => {
            setShowModal(false);
            setEditingCred(null);
            loadCredentials();
          }}
        />
      )}

      {/* Import Credentials Modal */}
      {showImport && (
        <ImportCredentialsModal
          sites={sites}
          fixedSiteId={fixedSiteId}
          onClose={() => setShowImport(false)}
          onImported={() => {
            setShowImport(false);
            loadCredentials();
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmActionModal
          title="Delete Credential"
          subtitle="Permanent vault entry removal"
          itemName={deleteTarget.deviceName}
          badgeText={deleteTarget.loginType}
          details={[
            ...(deleteTarget.site
              ? [{ label: 'Site', value: `${deleteTarget.site.siteCode} — ${deleteTarget.site.siteName}` }]
              : []),
            ...(deleteTarget.managementIp
              ? [{ label: 'Management IP', value: deleteTarget.managementIp }]
              : []),
          ]}
          message={`Are you sure you want to delete credentials for "${deleteTarget.deviceName}"?`}
          variant="danger"
          loading={deletingCred}
          error={deleteCredError}
          onCancel={() => {
            if (!deletingCred) setDeleteTarget(null);
          }}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

function AddCredentialModal({
  sites,
  fixedSiteId,
  editing,
  onClose,
  onCreated,
}: {
  sites: Site[];
  fixedSiteId?: string;
  editing?: CredentialItem | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const firstInst = editing?.instructions?.[0];
  const [siteId, setSiteId] = useState(editing?.siteId || fixedSiteId || sites[0]?.id || '');
  useEffect(() => {
    if (!siteId && !editing && sites.length > 0) {
      setSiteId(fixedSiteId || sites[0].id);
    }
  }, [siteId, editing, fixedSiteId, sites]);
  const [deviceName, setDeviceName] = useState(editing?.deviceName || '');
  const [deviceModel, setDeviceModel] = useState(editing?.deviceModel || '');
  const [managementIp, setManagementIp] = useState(editing?.managementIp || '');
  const [loginType, setLoginType] = useState<LoginType>(editing?.loginType || 'SSH');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [port, setPort] = useState(editing?.port ? String(editing.port) : '22');
  const [url, setUrl] = useState(editing?.url || '');
  const [accessMethod, setAccessMethod] = useState(editing?.accessMethod || '');
  const [remark, setRemark] = useState(editing?.remark || '');
  const [howToConnect, setHowToConnect] = useState(firstInst?.howToConnect || '');
  const [stepsText, setStepsText] = useState(
    Array.isArray(firstInst?.steps) ? firstInst.steps.join('\n') : '',
  );
  const [instructionNotes, setInstructionNotes] = useState(firstInst?.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        deviceName,
        deviceModel: deviceModel || null,
        managementIp: managementIp || null,
        loginType,
        port: port ? parseInt(port, 10) : null,
        url: url || null,
        accessMethod: accessMethod || null,
        remark: remark || null,
        howToConnect: howToConnect || null,
        instructionNotes: instructionNotes || null,
        steps: stepsText
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      };

      if (editing) {
        if (username.trim()) payload.username = username.trim();
        if (password) payload.password = password;
        await apiFetch(`/credentials/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        payload.siteId = siteId;
        payload.username = username;
        payload.password = password;
        await apiFetch('/credentials', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to store credential');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-slate-800 shadow-2xl">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-lg">
            {editing ? `Edit Credential — ${editing.deviceName}` : 'Store Encrypted Device Credential'}
          </h3>
          <button onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-3 text-sm">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-red-700 text-xs">
              {error}
            </div>
          )}

          {!fixedSiteId && !editing && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Site *</label>
              <select
                required
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.siteCode} — {s.siteName}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Device Name *</label>
              <input required value={deviceName} onChange={(e) => setDeviceName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Device Model</label>
              <input value={deviceModel} onChange={(e) => setDeviceModel(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Management IP / Host</label>
              <input value={managementIp} onChange={(e) => setManagementIp(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-mono" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Login Type *</label>
              <select
                value={loginType}
                onChange={(e) => setLoginType(e.target.value as LoginType)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                {['SSH', 'HTTPS', 'HTTP', 'WINBOX', 'RDP', 'VPN', 'CONSOLE', 'WEB_GUI', 'OTHER'].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                {editing ? 'Username (leave blank to keep)' : 'Username *'}
              </label>
              <input
                required={!editing}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={editing ? '(unchanged)' : ''}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                {editing ? 'Password (leave blank to keep)' : 'Password *'}
              </label>
              <input
                type="password"
                required={!editing}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={editing ? '(unchanged)' : ''}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Port</label>
              <input type="number" value={port} onChange={(e) => setPort(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Access Method</label>
              <input value={accessMethod} onChange={(e) => setAccessMethod(e.target.value)} placeholder="OpenVPN / FortiClient / WireGuard / Direct" className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Management URL</label>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://172.28.7.10:8443" className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-mono" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">How to Connect</label>
            <input value={howToConnect} onChange={(e) => setHowToConnect(e.target.value)} placeholder="Connect via Jump Host / VPN then SSH port 22" className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Connection Steps (one per line)</label>
            <textarea rows={3} value={stepsText} onChange={(e) => setStepsText(e.target.value)} placeholder="1. Connect to Site VPN&#10;2. SSH to 172.28.7.10" className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Instruction Notes</label>
              <input value={instructionNotes} onChange={(e) => setInstructionNotes(e.target.value)} placeholder="OTP / Pre-shared Key / Notes" className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Remark</label>
              <input value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Additional remark" className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300">Cancel</button>
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-lg bg-blue-600 text-white font-semibold cursor-pointer">
              {saving ? 'Encrypting & Saving...' : editing ? 'Update Credential' : 'Save Credential'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

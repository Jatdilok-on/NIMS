'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Globe,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { TranslationKey, useI18n } from '@/lib/i18n';
import { Site } from '@/lib/types';

interface AuditRow {
  id: string;
  username: string;
  action: string;
  module: string;
  siteCode?: string | null;
  deviceName?: string | null;
  sourceIp?: string | null;
  result: 'SUCCESS' | 'DENIED' | 'FAILURE';
  details?: Record<string, unknown> | null;
  createdAt: string;
}

interface ApiRequestRow {
  id: number;
  timestamp: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  username: string;
  roleCode?: string | null;
  sourceIp?: string | null;
  userAgent?: string | null;
}

interface ApiStats {
  totalBuffered: number;
  matchedTotal: number;
  last5MinCount: number;
  errorCount: number;
  avgDurationMs: number;
}

type CategoryKey = 'ALL' | 'AUTH' | 'MONITORING' | 'NETWORK' | 'VAULT_DOCS' | 'ADMIN';

const CATEGORY_TABS: Array<{ key: CategoryKey; labelKey: TranslationKey; modules: string }> = [
  { key: 'ALL', labelKey: 'audit.catAll', modules: '' },
  { key: 'AUTH', labelKey: 'audit.catAuth', modules: 'AUTH,RBAC' },
  { key: 'MONITORING', labelKey: 'audit.catMonitoring', modules: 'MONITORING' },
  { key: 'NETWORK', labelKey: 'audit.catNetwork', modules: 'INVENTORY,IPAM,DIAGRAM' },
  { key: 'VAULT_DOCS', labelKey: 'audit.catVaultDocs', modules: 'CREDENTIALS,DOCUMENT,MAINTENANCE' },
  { key: 'ADMIN', labelKey: 'audit.catAdmin', modules: 'USER,SITE,BACKUP,SETTINGS,SETUP,AUDIT' },
];

const MODULE_BADGE_CLASS: Record<string, string> = {
  AUTH: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300',
  RBAC: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  MONITORING: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300',
  INVENTORY: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  IPAM: 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300',
  DIAGRAM: 'bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300',
  CREDENTIALS: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  DOCUMENT: 'bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300',
  MAINTENANCE: 'bg-orange-50 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300',
  USER: 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300',
  SITE: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  BACKUP: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  SETTINGS: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

const METHOD_BADGE_CLASS: Record<string, string> = {
  GET: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800',
  POST: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
  PUT: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
  PATCH: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800',
  DELETE: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800',
};

function renderAuditDetails(row: AuditRow): React.ReactNode {
  const d = row.details;
  if (!d || typeof d !== 'object') return <span className="text-slate-400">-</span>;

  if (row.action === 'DEVICE_STATUS_TRANSITION' && d.fromStatus && d.toStatus) {
    const to = String(d.toStatus);
    const from = String(d.fromStatus);
    const isDown = to === 'OFFLINE';
    const isUp = to === 'ONLINE';
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span
          className={`px-2 py-0.5 rounded font-semibold ${
            isDown
              ? 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300'
              : isUp
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
          }`}
        >
          {from} → {to}
        </span>
        {d.latencyMs != null && (
          <span className="font-mono text-[11px] text-slate-500">{String(d.latencyMs)}ms</span>
        )}
        {d.method ? (
          <span className="font-mono text-[11px] text-slate-400">({String(d.method)})</span>
        ) : null}
      </div>
    );
  }

  const summaryParts: string[] = [];
  if (typeof d.reason === 'string') summaryParts.push(d.reason);
  if (typeof d.targetUsername === 'string') summaryParts.push(`user: ${d.targetUsername}`);
  if (typeof d.deletedUsername === 'string') summaryParts.push(`user: ${d.deletedUsername}`);
  if (typeof d.roleCode === 'string') summaryParts.push(`role: ${d.roleCode}`);
  if (typeof d.isActive === 'boolean') summaryParts.push(`active: ${String(d.isActive)}`);
  if (typeof d.name === 'string') summaryParts.push(d.name);
  if (typeof d.title === 'string') summaryParts.push(d.title);
  if (typeof d.filename === 'string') summaryParts.push(d.filename);
  if (typeof d.cidr === 'string') summaryParts.push(d.cidr);
  if (typeof d.ipAddress === 'string') summaryParts.push(d.ipAddress);
  if (typeof d.updatedCount === 'number') summaryParts.push(`updated: ${d.updatedCount}`);
  if (typeof d.deletedCount === 'number') summaryParts.push(`deleted: ${d.deletedCount}`);
  if (typeof d.count === 'number') summaryParts.push(`count: ${d.count}`);

  if (summaryParts.length === 0) {
    const compact = Object.entries(d)
      .filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object')
      .slice(0, 3)
      .map(([k, v]) => `${k}: ${String(v)}`);
    if (compact.length === 0) return <span className="text-slate-400">-</span>;
    return <span className="text-xs text-slate-600 dark:text-slate-300">{compact.join(' • ')}</span>;
  }

  return (
    <span className="text-xs text-slate-600 dark:text-slate-300">
      {summaryParts.join(' • ')}
    </span>
  );
}

export default function AuditLogsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const isSuperAdmin = user?.roleCode === 'SUPER_ADMIN';
  const canViewAuditLogs = isSuperAdmin || user?.roleCode === 'SITE_ADMIN';

  const [activeTab, setActiveTab] = useState<'TRAIL' | 'API'>('TRAIL');

  // Audit Trail state
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [category, setCategory] = useState<CategoryKey>('ALL');
  const [siteId, setSiteId] = useState('');
  const [username, setUsername] = useState('');
  const [search, setSearch] = useState('');
  const [result, setResult] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalTrailCount, setTotalTrailCount] = useState(0);

  // API Traffic Log state (Super Admin only)
  const [apiLogs, setApiLogs] = useState<ApiRequestRow[]>([]);
  const [apiStats, setApiStats] = useState<ApiStats | null>(null);
  const [apiMethod, setApiMethod] = useState('');
  const [apiStatusGroup, setApiStatusGroup] = useState('');
  const [apiSearch, setApiSearch] = useState('');
  const [excludePolling, setExcludePolling] = useState(true);
  const [apiAutoRefresh, setApiAutoRefresh] = useState(true);
  const [apiPage, setApiPage] = useState(1);
  const [apiTotalPages, setApiTotalPages] = useState(1);
  const [clearingApiLogs, setClearingApiLogs] = useState(false);

  useEffect(() => {
    if (!canViewAuditLogs) return;
    apiFetch<{ sites: Site[] }>('/sites')
      .then((res) => setSites(res.sites || []))
      .catch(() => {});
  }, [canViewAuditLogs]);

  const loadLogs = useCallback(async () => {
    const activeCat = CATEGORY_TABS.find((c) => c.key === category);
    const params = new URLSearchParams({ page: String(page), pageSize: '40' });
    if (activeCat?.modules) params.set('modules', activeCat.modules);
    if (siteId) params.set('siteId', siteId);
    if (username.trim()) params.set('username', username.trim());
    if (search.trim()) params.set('search', search.trim());
    if (result) params.set('result', result);

    const res = await apiFetch<{
      logs: AuditRow[];
      pagination: { total: number; totalPages: number };
    }>(`/audit-logs?${params.toString()}`);
    setLogs(res.logs);
    setTotalPages(res.pagination.totalPages);
    setTotalTrailCount(res.pagination.total);
  }, [category, siteId, page, username, search, result]);

  const loadApiLogs = useCallback(async () => {
    if (!isSuperAdmin) return;
    const params = new URLSearchParams({
      page: String(apiPage),
      pageSize: '50',
      excludePolling: String(excludePolling),
    });
    if (apiMethod) params.set('method', apiMethod);
    if (apiStatusGroup) params.set('statusGroup', apiStatusGroup);
    if (apiSearch.trim()) params.set('search', apiSearch.trim());

    const res = await apiFetch<{
      logs: ApiRequestRow[];
      stats: ApiStats;
      pagination: { totalPages: number };
    }>(`/audit-logs/api-requests?${params.toString()}`);
    setApiLogs(res.logs);
    setApiStats(res.stats);
    setApiTotalPages(res.pagination.totalPages);
  }, [isSuperAdmin, apiPage, excludePolling, apiMethod, apiStatusGroup, apiSearch]);

  useEffect(() => {
    if (!canViewAuditLogs || activeTab !== 'TRAIL') return;
    loadLogs().catch(() => {});
  }, [loadLogs, canViewAuditLogs, activeTab]);

  useEffect(() => {
    if (!isSuperAdmin || activeTab !== 'API') return;
    loadApiLogs().catch(() => {});
    if (!apiAutoRefresh) return;
    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      loadApiLogs().catch(() => {});
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [loadApiLogs, isSuperAdmin, activeTab, apiAutoRefresh]);

  const handleClearApiLogs = async () => {
    if (!isSuperAdmin) return;
    setClearingApiLogs(true);
    try {
      await apiFetch('/audit-logs/api-requests', { method: 'DELETE' });
      setApiPage(1);
      await loadApiLogs();
    } catch {
      // ignore
    } finally {
      setClearingApiLogs(false);
    }
  };

  if (user && !canViewAuditLogs) {
    return (
      <div className="p-8 text-center text-sm text-red-600 dark:text-red-400">
        {t('audit.accessDenied')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            {activeTab === 'API' ? (
              <Globe className="h-6 w-6 text-indigo-600" />
            ) : (
              <Activity className="h-6 w-6 text-blue-600" />
            )}
            {activeTab === 'API' ? t('audit.apiTitle') : t('audit.title')}
          </h1>
          <p className="text-sm text-slate-500">{t('audit.subtitle')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isSuperAdmin && (
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab('TRAIL')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md cursor-pointer transition ${
                  activeTab === 'TRAIL'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Activity className="h-3.5 w-3.5" />
                {t('audit.tabTrail')}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('API')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md cursor-pointer transition ${
                  activeTab === 'API'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Globe className="h-3.5 w-3.5" />
                {t('audit.tabApi')}
              </button>
            </div>
          )}

          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
            <ShieldCheck className="h-4 w-4" />
            {t('audit.badge')}
          </span>
        </div>
      </div>

      {activeTab === 'TRAIL' ? (
        <>
          {/* Category Split Pills */}
          <div className="flex flex-wrap items-center gap-2">
            {CATEGORY_TABS.map((cat) => {
              const active = category === cat.key;
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => {
                    setCategory(cat.key);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition cursor-pointer ${
                    active
                      ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {t(cat.labelKey)}
                </button>
              );
            })}
            <span className="ml-auto text-xs text-slate-400">
              {totalTrailCount.toLocaleString()} records
            </span>
          </div>

          {/* Search & Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={t('audit.searchPlaceholder')}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
            />
            <input
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setPage(1);
              }}
              placeholder={t('audit.filterUser')}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
            />
            <select
              value={siteId}
              onChange={(e) => {
                setSiteId(e.target.value);
                setPage(1);
              }}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
            >
              <option value="">{t('audit.allSites')}</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.siteCode} — {s.siteName}
                </option>
              ))}
            </select>
            <select
              value={result}
              onChange={(e) => {
                setResult(e.target.value);
                setPage(1);
              }}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
            >
              <option value="">{t('audit.allResults')}</option>
              <option value="SUCCESS">SUCCESS</option>
              <option value="DENIED">DENIED</option>
              <option value="FAILURE">FAILURE</option>
            </select>
            <button
              type="button"
              onClick={() => loadLogs().catch(() => {})}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t('common.refresh')}
            </button>
          </div>

          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/70 text-left text-xs uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
                    <th className="px-4 py-3">{t('audit.colTime')}</th>
                    <th className="px-4 py-3">{t('audit.colUser')}</th>
                    <th className="px-4 py-3">{t('audit.colModule')}</th>
                    <th className="px-4 py-3">{t('audit.colAction')}</th>
                    <th className="px-4 py-3">{t('audit.colDetails')}</th>
                    <th className="px-4 py-3">{t('audit.colSite')}</th>
                    <th className="px-4 py-3">{t('audit.colDevice')}</th>
                    <th className="px-4 py-3">{t('audit.colIp')}</th>
                    <th className="px-4 py-3">{t('audit.colResult')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-xs text-slate-400">
                        {t('audit.emptyLogs')}
                      </td>
                    </tr>
                  ) : (
                    logs.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                          {new Date(l.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 font-semibold whitespace-nowrap">{l.username}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                              MODULE_BADGE_CLASS[l.module] ||
                              'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {l.module}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap">{l.action}</td>
                        <td className="px-4 py-2.5">{renderAuditDetails(l)}</td>
                        <td className="px-4 py-2.5 text-xs whitespace-nowrap">{l.siteCode || '-'}</td>
                        <td className="px-4 py-2.5 text-xs whitespace-nowrap">{l.deviceName || '-'}</td>
                        <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap">
                          {l.sourceIp || '-'}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                              l.result === 'SUCCESS'
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                                : l.result === 'DENIED'
                                  ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                                  : 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300'
                            }`}
                          >
                            {l.result}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end gap-2 text-xs">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 rounded border disabled:opacity-40 cursor-pointer"
            >
              {t('audit.prev')}
            </button>
            <span className="py-1">
              {t('audit.pageOf')} {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 rounded border disabled:opacity-40 cursor-pointer"
            >
              {t('audit.next')}
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Super Admin API Monitor */}
          {apiStats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3">
                <div className="text-xs text-slate-500">{t('audit.apiBuffered')}</div>
                <div className="text-xl font-bold mt-0.5">
                  {apiStats.matchedTotal.toLocaleString()}
                  <span className="text-xs font-normal text-slate-400 ml-1">
                    / {apiStats.totalBuffered}
                  </span>
                </div>
              </div>
              <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3">
                <div className="text-xs text-slate-500">{t('audit.apiLast5Min')}</div>
                <div className="text-xl font-bold mt-0.5 text-blue-600 dark:text-blue-400">
                  {apiStats.last5MinCount.toLocaleString()}
                </div>
              </div>
              <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3">
                <div className="text-xs text-slate-500">{t('audit.apiErrors')}</div>
                <div
                  className={`text-xl font-bold mt-0.5 ${
                    apiStats.errorCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600'
                  }`}
                >
                  {apiStats.errorCount.toLocaleString()}
                </div>
              </div>
              <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3">
                <div className="text-xs text-slate-500">{t('audit.apiAvgLatency')}</div>
                <div className="text-xl font-bold mt-0.5">{apiStats.avgDurationMs} ms</div>
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              <input
                value={apiSearch}
                onChange={(e) => {
                  setApiSearch(e.target.value);
                  setApiPage(1);
                }}
                placeholder={t('audit.apiSearchPlaceholder')}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
              />
              <select
                value={apiMethod}
                onChange={(e) => {
                  setApiMethod(e.target.value);
                  setApiPage(1);
                }}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
              >
                <option value="">{t('audit.apiMethodAll')}</option>
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="DELETE">DELETE</option>
              </select>
              <select
                value={apiStatusGroup}
                onChange={(e) => {
                  setApiStatusGroup(e.target.value);
                  setApiPage(1);
                }}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
              >
                <option value="">{t('audit.apiStatusAll')}</option>
                <option value="2xx">2xx (Success)</option>
                <option value="3xx">3xx (Redirect/Cache)</option>
                <option value="4xx">4xx (Client Error)</option>
                <option value="5xx">5xx (Server Error)</option>
              </select>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadApiLogs().catch(() => {})}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t('common.refresh')}
                </button>
                <button
                  type="button"
                  disabled={clearingApiLogs}
                  onClick={handleClearApiLogs}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t('audit.apiClearBtn')}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={excludePolling}
                  onChange={(e) => {
                    setExcludePolling(e.target.checked);
                    setApiPage(1);
                  }}
                />
                {t('audit.apiHidePolling')}
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={apiAutoRefresh}
                  onChange={(e) => setApiAutoRefresh(e.target.checked)}
                />
                {t('audit.apiAutoRefresh')}
              </label>
            </div>
          </div>

          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/70 text-left text-xs uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
                    <th className="px-4 py-3">{t('audit.colTime')}</th>
                    <th className="px-4 py-3">{t('audit.apiColMethod')}</th>
                    <th className="px-4 py-3">{t('audit.apiColStatus')}</th>
                    <th className="px-4 py-3">{t('audit.apiColEndpoint')}</th>
                    <th className="px-4 py-3">{t('audit.apiColLatency')}</th>
                    <th className="px-4 py-3">{t('audit.apiColActor')}</th>
                    <th className="px-4 py-3">{t('audit.colIp')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {apiLogs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-xs text-slate-400">
                        {t('audit.apiEmpty')}
                      </td>
                    </tr>
                  ) : (
                    apiLogs.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="px-4 py-2 text-xs text-slate-500 whitespace-nowrap">
                          {new Date(row.timestamp).toLocaleString()}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded border text-[11px] font-bold font-mono ${
                              METHOD_BADGE_CLASS[row.method] ||
                              'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            {row.method}
                          </span>
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold ${
                              row.statusCode >= 500
                                ? 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                                : row.statusCode >= 400
                                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                                  : row.statusCode >= 300
                                    ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                    : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                            }`}
                          >
                            {row.statusCode}
                          </span>
                        </td>
                        <td
                          className="px-4 py-2 font-mono text-xs text-slate-700 dark:text-slate-200 max-w-md truncate"
                          title={row.path}
                        >
                          {row.path}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs whitespace-nowrap text-slate-500">
                          {row.durationMs} ms
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="font-semibold">{row.username}</span>
                            {row.roleCode && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-500">
                                {row.roleCode}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">
                          {row.sourceIp || '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end gap-2 text-xs">
            <button
              disabled={apiPage <= 1}
              onClick={() => setApiPage((p) => p - 1)}
              className="px-3 py-1 rounded border disabled:opacity-40 cursor-pointer"
            >
              {t('audit.prev')}
            </button>
            <span className="py-1">
              {t('audit.pageOf')} {apiPage} / {apiTotalPages}
            </span>
            <button
              disabled={apiPage >= apiTotalPages}
              onClick={() => setApiPage((p) => p + 1)}
              className="px-3 py-1 rounded border disabled:opacity-40 cursor-pointer"
            >
              {t('audit.next')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

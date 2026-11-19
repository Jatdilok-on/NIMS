'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Activity, ShieldCheck } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

interface AuditRow {
  id: string;
  username: string;
  action: string;
  module: string;
  siteCode?: string | null;
  deviceName?: string | null;
  sourceIp?: string | null;
  result: 'SUCCESS' | 'DENIED' | 'FAILURE';
  createdAt: string;
}

export default function AuditLogsPage() {
  const { user } = useAuth();
  const canViewAuditLogs = user?.roleCode === 'SUPER_ADMIN' || user?.roleCode === 'SITE_ADMIN';
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [username, setUsername] = useState('');
  const [action, setAction] = useState('');
  const [result, setResult] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const loadLogs = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: '40' });
    if (username.trim()) params.set('username', username.trim());
    if (action.trim()) params.set('action', action.trim());
    if (result) params.set('result', result);
    const res = await apiFetch<{
      logs: AuditRow[];
      pagination: { totalPages: number };
    }>(`/audit-logs?${params.toString()}`);
    setLogs(res.logs);
    setTotalPages(res.pagination.totalPages);
  }, [page, username, action, result]);

  useEffect(() => {
    if (!canViewAuditLogs) return;
    loadLogs().catch(() => {});
  }, [loadLogs, canViewAuditLogs]);

  if (user && !canViewAuditLogs) {
    return (
      <div className="p-8 text-center text-sm text-red-600 dark:text-red-400">
        Access denied: Administrator privileges are required to view audit logs.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="h-6 w-6 text-blue-600" />
            Immutable Audit Logs
          </h1>
          <p className="text-sm text-slate-500">
            Tamper-resistant chronological log of logins, inventory changes, document downloads, and credential access
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
          <ShieldCheck className="h-4 w-4" />
          Append-Only • Secrets Redacted
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
        <input
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setPage(1);
          }}
          placeholder="Filter by username..."
          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
        />
        <input
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
          placeholder="Filter by action (e.g. VIEW_CREDENTIAL)..."
          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
        />
        <select
          value={result}
          onChange={(e) => {
            setResult(e.target.value);
            setPage(1);
          }}
          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
        >
          <option value="">All Results</option>
          <option value="SUCCESS">SUCCESS</option>
          <option value="DENIED">DENIED</option>
          <option value="FAILURE">FAILURE</option>
        </select>
      </div>

      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/70 text-left text-xs uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <th className="px-4 py-3">Date & Time</th>
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Module</th>
                <th className="px-4 py-3">Site</th>
                <th className="px-4 py-3">Device</th>
                <th className="px-4 py-3">Source IP</th>
                <th className="px-4 py-3">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                    {new Date(l.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 font-semibold">{l.username}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{l.action}</td>
                  <td className="px-4 py-2.5 text-xs">{l.module}</td>
                  <td className="px-4 py-2.5 text-xs">{l.siteCode || '-'}</td>
                  <td className="px-4 py-2.5 text-xs">{l.deviceName || '-'}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{l.sourceIp || '-'}</td>
                  <td className="px-4 py-2.5">
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
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-end gap-2 text-xs">
        <button
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
          className="px-3 py-1 rounded border disabled:opacity-40"
        >
          Previous
        </button>
        <span className="py-1">
          Page {page} / {totalPages}
        </span>
        <button
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
          className="px-3 py-1 rounded border disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

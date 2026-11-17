'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Check,
  Copy,
  Download,
  KeyRound,
  Pencil,
  Plus,
  Power,
  Radio,
  RefreshCw,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import { ConfirmActionModal } from '@/components/common/ConfirmActionModal';
import { apiFetch, ApiError } from '@/lib/api';
import { AgentConnectionState, SiteAgent } from '@/lib/types';

const STATE_BADGE: Record<AgentConnectionState, { label: string; className: string; dot: string }> = {
  ONLINE: {
    label: 'ONLINE',
    className:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
    dot: 'bg-emerald-500 animate-pulse',
  },
  OFFLINE: {
    label: 'OFFLINE',
    className:
      'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800',
    dot: 'bg-red-500',
  },
  NEVER_CONNECTED: {
    label: 'WAITING FOR AGENT',
    className:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
    dot: 'bg-amber-500',
  },
  DISABLED: {
    label: 'DISABLED',
    className:
      'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
    dot: 'bg-slate-400',
  },
};

function formatRelativeTime(iso?: string | null): string {
  if (!iso) return 'Never';
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 10) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function buildAgentEnvText(serverUrl: string, token: string): string {
  return [
    `NIMS_URL=${serverUrl}`,
    `NIMS_AGENT_TOKEN=${token}`,
    'NIMS_PING_TIMEOUT_MS=2000',
    'NIMS_CONCURRENCY=15',
    '# Optional: fallback TCP port checks when ICMP ping is blocked by firewall',
    'NIMS_FALLBACK_TCP_PORTS=22,80,443,3389,502,9100',
    'NIMS_ALLOW_INSECURE_TLS=false',
    '',
  ].join('\n');
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function SiteAgentsPanel({
  siteId,
  siteCode,
  canManage = false,
}: {
  siteId: string;
  siteCode: string;
  canManage?: boolean;
}) {
  const [agents, setAgents] = useState<SiteAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingAgent, setEditingAgent] = useState<SiteAgent | null>(null);
  const [tokenReveal, setTokenReveal] = useState<{
    agentName: string;
    rawToken: string;
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [rotateTarget, setRotateTarget] = useState<SiteAgent | null>(null);
  const [rotating, setRotating] = useState(false);
  const [rotateError, setRotateError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<SiteAgent | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const serverOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  const loadAgents = useCallback(async () => {
    try {
      const res = await apiFetch<{ agents: SiteAgent[] }>(`/agents?siteId=${siteId}`);
      setAgents(res.agents);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load site agents');
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    loadAgents();
    const timer = setInterval(() => {
      loadAgents().catch(() => {});
    }, 30000);
    return () => clearInterval(timer);
  }, [loadAgents]);

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const toggleActive = async (agent: SiteAgent) => {
    try {
      await apiFetch(`/agents/${agent.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !agent.isActive }),
      });
      loadAgents();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update agent');
    }
  };

  const confirmRotateToken = async () => {
    if (!rotateTarget) return;
    setRotating(true);
    setRotateError(null);
    try {
      const res = await apiFetch<{ agent: SiteAgent; rawToken: string }>(
        `/agents/${rotateTarget.id}/rotate-token`,
        { method: 'POST' },
      );
      setRotateTarget(null);
      setTokenReveal({ agentName: res.agent.name, rawToken: res.rawToken });
      loadAgents();
    } catch (err) {
      setRotateError(err instanceof ApiError ? err.message : 'Failed to rotate token');
    } finally {
      setRotating(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiFetch(`/agents/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      loadAgents();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Failed to delete site agent');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Radio className="h-5 w-5 text-blue-600" />
            Site Ping Agents ({siteCode})
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Deploy a zero-dependency Node.js probe inside this site&apos;s LAN to ping devices and report UP/DOWN status automatically.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => loadAgents()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
          <a
            href="/api/agents/script"
            download="nims-agent.mjs"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium"
          >
            <Download className="h-3.5 w-3.5 text-blue-600" />
            Download nims-agent.mjs
          </a>
          {canManage && (
            <button
              type="button"
              onClick={() => {
                setEditingAgent(null);
                setShowForm(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Add Site Agent
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-4 py-2.5 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* One-time Token & Quick-Start Banner */}
      {tokenReveal && (
        <div className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold text-sm text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
                <KeyRound className="h-4 w-4" />
                Agent Token Generated — {tokenReveal.agentName}
              </h3>
              <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-0.5">
                Copy or download this configuration now. For security, the full token cannot be viewed again after closing this panel.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setTokenReveal(null)}
              className="p-1 rounded hover:bg-emerald-200/50 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 px-3 py-2 font-mono text-xs">
            <span className="flex-1 break-all select-all">{tokenReveal.rawToken}</span>
            <button
              type="button"
              onClick={() => copyText('token', tokenReveal.rawToken)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-sans font-semibold cursor-pointer"
            >
              {copiedKey === 'token' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedKey === 'token' ? 'Copied' : 'Copy Token'}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <a
              href="/api/agents/script"
              download="nims-agent.mjs"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Download className="h-3.5 w-3.5 text-blue-600" />
              1. Download nims-agent.mjs
            </a>
            <button
              type="button"
              onClick={() =>
                downloadTextFile(
                  'nims-agent.env',
                  buildAgentEnvText(serverOrigin, tokenReveal.rawToken),
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-emerald-600" />
              2. Download nims-agent.env
            </button>
            <button
              type="button"
              onClick={() => copyText('cmd', 'node nims-agent.mjs --once')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-mono hover:bg-slate-800 cursor-pointer"
            >
              <Terminal className="h-3.5 w-3.5" />
              {copiedKey === 'cmd' ? 'Copied command!' : '3. Copy: node nims-agent.mjs --once'}
            </button>
          </div>
        </div>
      )}

      {/* Agents List */}
      {loading ? (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-500">
          Loading site agents...
        </div>
      ) : agents.length === 0 ? (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center space-y-3">
          <Activity className="h-8 w-8 text-slate-400 mx-auto" />
          <div>
            <h3 className="font-semibold text-sm">No Site Agent Configured</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Add a Site Agent to monitor devices inside {siteCode}&apos;s private network without opening inbound firewall ports or changing overlapping IP ranges.
            </p>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => {
                setEditingAgent(null);
                setShowForm(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Create First Site Agent
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {agents.map((agent) => {
            const badge = STATE_BADGE[agent.connectionState] || STATE_BADGE.NEVER_CONNECTED;
            const summary = agent.lastReportSummary;
            return (
              <div
                key={agent.id}
                className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-sm">{agent.name}</h3>
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${badge.className}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
                        {badge.label}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 mt-1">
                      Token: {agent.tokenPrefix}...
                    </div>
                  </div>

                  {canManage && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleActive(agent)}
                        title={agent.isActive ? 'Disable agent' : 'Enable agent'}
                        className={`p-1.5 rounded-lg border text-xs cursor-pointer ${
                          agent.isActive
                            ? 'border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-800 dark:hover:bg-emerald-950/40'
                            : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Power className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingAgent(agent);
                          setShowForm(true);
                        }}
                        title="Edit settings"
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRotateError(null);
                          setRotateTarget(agent);
                        }}
                        title="Rotate token"
                        className="p-1.5 rounded-lg border border-amber-200 dark:border-amber-800 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 cursor-pointer"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteError(null);
                          setDeleteTarget(agent);
                        }}
                        title="Delete agent"
                        className="p-1.5 rounded-lg border border-red-200 dark:border-red-800 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                  <div>
                    <span className="text-slate-500 block text-[11px]">Poll Interval</span>
                    <span className="font-semibold">{agent.pollIntervalSec}s</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Offline Threshold</span>
                    <span className="font-semibold">{agent.offlineThreshold} misses</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Last Heartbeat</span>
                    <span className="font-semibold" title={agent.lastHeartbeatAt || undefined}>
                      {formatRelativeTime(agent.lastHeartbeatAt)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Probe Host</span>
                    <span className="font-mono font-medium truncate block">
                      {agent.hostname || '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Probe IP / OS</span>
                    <span className="font-mono font-medium truncate block">
                      {agent.localIp || '-'} {agent.platform ? `(${agent.platform})` : ''}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Last Scan</span>
                    {summary ? (
                      <span className="font-semibold">
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {summary.up} UP
                        </span>
                        {' / '}
                        <span
                          className={
                            summary.down > 0
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-slate-500'
                          }
                        >
                          {summary.down} DOWN
                        </span>
                        {summary.durationMs != null ? ` (${summary.durationMs}ms)` : ''}
                      </span>
                    ) : (
                      <span className="text-slate-400">No scans yet</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <AgentFormModal
          siteId={siteId}
          editing={editingAgent}
          onClose={() => {
            setShowForm(false);
            setEditingAgent(null);
          }}
          onCreated={(res) => {
            setShowForm(false);
            setEditingAgent(null);
            if (res.rawToken) {
              setTokenReveal({ agentName: res.agent.name, rawToken: res.rawToken });
            }
            loadAgents();
          }}
        />
      )}

      {rotateTarget && (
        <ConfirmActionModal
          title="Rotate Agent Token"
          subtitle="Invalidate previous API token"
          itemName={rotateTarget.name}
          badgeText={`${rotateTarget.tokenPrefix}...`}
          message="Generating a new token will immediately disconnect the running agent until you update its nims-agent.env token."
          variant="warning"
          confirmLabel="Rotate Token"
          loadingLabel="Rotating..."
          loading={rotating}
          error={rotateError}
          onCancel={() => {
            if (!rotating) setRotateTarget(null);
          }}
          onConfirm={confirmRotateToken}
        />
      )}

      {deleteTarget && (
        <ConfirmActionModal
          title="Delete Site Agent"
          subtitle="Permanent probe removal"
          itemName={deleteTarget.name}
          badgeText={deleteTarget.connectionState}
          details={[
            { label: 'Token Prefix', value: `${deleteTarget.tokenPrefix}...` },
            ...(deleteTarget.hostname
              ? [{ label: 'Host', value: deleteTarget.hostname }]
              : []),
          ]}
          message={`Are you sure you want to delete site agent "${deleteTarget.name}"?`}
          variant="danger"
          loading={deleting}
          error={deleteError}
          onCancel={() => {
            if (!deleting) setDeleteTarget(null);
          }}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

function AgentFormModal({
  siteId,
  editing,
  onClose,
  onCreated,
}: {
  siteId: string;
  editing: SiteAgent | null;
  onClose: () => void;
  onCreated: (res: { agent: SiteAgent; rawToken?: string }) => void;
}) {
  const [name, setName] = useState(editing?.name || '');
  const [pollIntervalSec, setPollIntervalSec] = useState(
    String(editing?.pollIntervalSec ?? 60),
  );
  const [offlineThreshold, setOfflineThreshold] = useState(
    String(editing?.offlineThreshold ?? 3),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: name.trim(),
        pollIntervalSec: Math.max(10, Math.min(3600, parseInt(pollIntervalSec, 10) || 60)),
        offlineThreshold: Math.max(1, Math.min(10, parseInt(offlineThreshold, 10) || 3)),
      };
      if (editing) {
        const res = await apiFetch<{ agent: SiteAgent }>(`/agents/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        onCreated({ agent: res.agent });
      } else {
        const res = await apiFetch<{ agent: SiteAgent; rawToken: string }>('/agents', {
          method: 'POST',
          body: JSON.stringify({ siteId, ...payload }),
        });
        onCreated(res);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-bold text-base">
            {editing ? 'Edit Site Agent' : 'Add Site Ping Agent'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-sm">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/40 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              Agent Name *
            </label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Plant-Rayong Probe PC"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Poll Interval (sec)
              </label>
              <input
                type="number"
                min={10}
                max={3600}
                value={pollIntervalSec}
                onChange={(e) => setPollIntervalSec(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Offline Misses
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={offlineThreshold}
                onChange={(e) => setOfflineThreshold(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
              />
            </div>
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed">
            Devices are marked OFFLINE only after failing the configured consecutive ping attempts. Devices manually set to MAINTENANCE keep their status.
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Agent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

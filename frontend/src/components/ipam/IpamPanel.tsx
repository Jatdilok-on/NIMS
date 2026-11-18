'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ExternalLink, Layers, Pencil, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { ConfirmActionModal } from '@/components/common/ConfirmActionModal';
import { DeviceCategoryTechIcon, TechIpamIcon } from '@/components/icons/TechIcons';
import { apiFetch, ApiError } from '@/lib/api';
import { getDeviceLedClass, isDeviceAgentLive } from '@/lib/deviceTelemetry';
import { useI18n } from '@/lib/i18n';
import { IpAllocationStatus, Site, Subnet } from '@/lib/types';

interface IpGridCell {
  ipAddress: string;
  status: IpAllocationStatus;
  hostname?: string | null;
  macAddress?: string | null;
  description?: string | null;
  device?: {
    id: string;
    siteId?: string;
    name: string;
    category: string;
    model?: string | null;
    vendor?: string | null;
    macAddress?: string | null;
    serialNumber?: string | null;
    vlan?: string | null;
    location?: string | null;
    status: string;
    monitorEnabled?: boolean;
    lastPingAt?: string | null;
    lastLatencyMs?: number | null;
    agentLive?: boolean;
  } | null;
}

interface ActiveBlockSummary {
  blockPrefix: string;
  blockCidr: string;
  usedCount: number;
}

interface SuggestedSubnet {
  siteId: string;
  siteCode: string;
  siteName: string;
  suggestedCidr: string;
  deviceCount: number;
  vlanNumber: number | null;
  sampleDevices: Array<{ name: string; ip: string }>;
}

interface UnmappedSummary {
  unmappedNoSubnetCount: number;
  needsSyncCount: number;
  suggestedSubnets: SuggestedSubnet[];
}

const IP_TILE_CLASS: Record<IpAllocationStatus, string> = {
  AVAILABLE: 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-300',
  ALLOCATED: 'bg-blue-600 border-blue-700 text-white',
  RESERVED: 'bg-amber-400 border-amber-500 text-slate-900',
  GATEWAY: 'bg-[#0f2942] border-[#0f2942] text-white',
  DHCP: 'bg-violet-600 border-violet-700 text-white',
};

const IP_BADGE_CLASS: Record<IpAllocationStatus, string> = {
  AVAILABLE: 'bg-emerald-100 text-emerald-800',
  ALLOCATED: 'bg-blue-600 text-white',
  RESERVED: 'bg-amber-400 text-slate-900',
  GATEWAY: 'bg-[#0f2942] text-white',
  DHCP: 'bg-violet-600 text-white',
};

export function IpamPanel({
  fixedSiteId,
  canEdit = true,
}: {
  fixedSiteId?: string;
  canEdit?: boolean;
}) {
  const { t } = useI18n();
  const [sites, setSites] = useState<Site[]>([]);
  const [subnets, setSubnets] = useState<Subnet[]>([]);
  const [selectedSubnet, setSelectedSubnet] = useState<Subnet | null>(null);
  const [ipGrid, setIpGrid] = useState<IpGridCell[]>([]);
  const [allocatedIps, setAllocatedIps] = useState<IpGridCell[]>([]);
  const [activeBlocks, setActiveBlocks] = useState<ActiveBlockSummary[]>([]);
  const [currentBlockPrefix, setCurrentBlockPrefix] = useState('');
  const [currentBlockCidr, setCurrentBlockCidr] = useState('');
  const [isLargeSubnet, setIsLargeSubnet] = useState(false);
  const [blockSearch, setBlockSearch] = useState('');
  const [loadingGrid, setLoadingGrid] = useState(false);
  const [selectedIpCell, setSelectedIpCell] = useState<IpGridCell | null>(null);
  const [showAddSubnet, setShowAddSubnet] = useState(false);
  const [editingSubnet, setEditingSubnet] = useState<Subnet | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Subnet | null>(null);
  const [deletingSubnet, setDeletingSubnet] = useState(false);
  const [deleteSubnetError, setDeleteSubnetError] = useState<string | null>(null);
  const [addSubnetPreset, setAddSubnetPreset] = useState<{
    siteId?: string;
    cidr?: string;
    vlanNumber?: number | null;
  } | null>(null);
  const [ipLookup, setIpLookup] = useState('');
  const [lookupResult, setLookupResult] = useState<string | null>(null);
  const [unmappedSummary, setUnmappedSummary] = useState<UnmappedSummary | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ sites: Site[] }>('/sites')
      .then((res) => setSites(res.sites))
      .catch(() => {});
  }, []);

  const loadSubnets = useCallback(async () => {
    const q = fixedSiteId ? `?siteId=${fixedSiteId}` : '';
    const [subnetsRes, unmappedRes] = await Promise.all([
      apiFetch<{ subnets: Subnet[] }>(`/ipam/subnets${q}`),
      apiFetch<UnmappedSummary>(`/ipam/unmapped-devices${q}`).catch(() => null),
    ]);
    setSubnets(subnetsRes.subnets);
    setUnmappedSummary(unmappedRes);
  }, [fixedSiteId]);

  useEffect(() => {
    loadSubnets().catch(() => {});
  }, [loadSubnets]);

  const handleSyncDevices = async (autoCreateSubnets: boolean) => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await apiFetch<{
        createdSubnetsCount: number;
        syncedDevicesCount: number;
        totalChecked: number;
        remainingUnmapped: number;
      }>('/ipam/sync', {
        method: 'POST',
        body: JSON.stringify({
          ...(fixedSiteId ? { siteId: fixedSiteId } : {}),
          autoCreateSubnets,
        }),
      });
      await loadSubnets();
      if (selectedSubnet) {
        openSubnetGrid(selectedSubnet, currentBlockPrefix || undefined).catch(() => {});
      }
      setSyncMessage(
        `Sync complete: created ${res.createdSubnetsCount} subnet(s), synced ${res.syncedDevicesCount} device IP(s)` +
          (res.remainingUnmapped > 0
            ? ` (${res.remainingUnmapped} device IP(s) still need a matching subnet).`
            : '.'),
      );
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to sync devices to IPAM');
    } finally {
      setSyncing(false);
    }
  };

  const openSubnetGrid = useCallback(
    async (subnet: Subnet, block?: string, silent = false) => {
      if (!silent) setLoadingGrid(true);
      try {
        const qs = block ? `?block=${encodeURIComponent(block)}` : '';
        const res = await apiFetch<{
          subnet: Subnet;
          ips: IpGridCell[];
          allocatedIps?: IpGridCell[];
          activeBlocks?: ActiveBlockSummary[];
          currentBlockPrefix?: string;
          currentBlockCidr?: string;
          isLargeSubnet?: boolean;
        }>(`/ipam/subnets/${subnet.id}/ips${qs}`);
        setSelectedSubnet(res.subnet);
        setIpGrid(res.ips);
        setAllocatedIps(res.allocatedIps ?? res.ips.filter((c) => c.status !== 'AVAILABLE'));
        setActiveBlocks(res.activeBlocks ?? []);
        setCurrentBlockPrefix(res.currentBlockPrefix ?? '');
        setCurrentBlockCidr(res.currentBlockCidr ?? res.subnet.cidr);
        setIsLargeSubnet(Boolean(res.isLargeSubnet));
        if (!silent) setBlockSearch(res.currentBlockPrefix ?? '');
      } finally {
        if (!silent) setLoadingGrid(false);
      }
    },
    [],
  );

  // Poll live agent telemetry every 10s for subnets and currently opened IP grid
  useEffect(() => {
    const timer = setInterval(() => {
      loadSubnets().catch(() => {});
      if (selectedSubnet) {
        openSubnetGrid(selectedSubnet, currentBlockPrefix || undefined, true).catch(() => {});
      }
    }, 10000);
    return () => clearInterval(timer);
  }, [loadSubnets, openSubnetGrid, selectedSubnet, currentBlockPrefix]);

  const handleJumpBlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubnet || !blockSearch.trim()) return;
    const parts = blockSearch.trim().replace(/\/.*$/, '').split('.');
    if (parts.length >= 3) {
      const prefix = `${parts[0]}.${parts[1]}.${parts[2]}`;
      openSubnetGrid(selectedSubnet, prefix);
    }
  };

  const handleDeleteSubnet = (sub: Subnet) => {
    setDeleteSubnetError(null);
    setDeleteTarget(sub);
  };

  const confirmDeleteSubnet = async () => {
    if (!deleteTarget) return;
    setDeletingSubnet(true);
    setDeleteSubnetError(null);
    try {
      await apiFetch(`/ipam/subnets/${deleteTarget.id}`, { method: 'DELETE' });
      if (selectedSubnet?.id === deleteTarget.id) setSelectedSubnet(null);
      setDeleteTarget(null);
      loadSubnets();
    } catch (err) {
      setDeleteSubnetError(err instanceof ApiError ? err.message : 'Failed to delete subnet');
    } finally {
      setDeletingSubnet(false);
    }
  };

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ipLookup.trim()) return;
    try {
      const res = await apiFetch<{
        devices: Array<{ name: string; location?: string | null; site?: { siteCode: string } }>;
        allocations: Array<{ status: string; subnet: { cidr: string; vlanNumber?: number | null } }>;
      }>(`/ipam/lookup?ip=${encodeURIComponent(ipLookup.trim())}`);
      if (res.devices.length > 0) {
        const d = res.devices[0];
        setLookupResult(
          `${ipLookup.trim()} → ${d.name} (${d.site?.siteCode || '-'}, Location: ${d.location || '-'})`,
        );
      } else if (res.allocations.length > 0) {
        const a = res.allocations[0];
        setLookupResult(
          `${ipLookup.trim()} → Status: ${a.status} in ${a.subnet.cidr} (VLAN ${a.subnet.vlanNumber || '-'})`,
        );
      } else {
        setLookupResult(`${ipLookup.trim()} is not currently assigned to any device or allocation.`);
      }
    } catch {
      setLookupResult('Lookup failed');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form onSubmit={handleLookup} className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              value={ipLookup}
              onChange={(e) => setIpLookup(e.target.value)}
              placeholder={t('ipam.lookupPlaceholder')}
              className="pl-9 pr-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono w-64"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-semibold cursor-pointer"
          >
            {t('ipam.lookupBtn')}
          </button>
        </form>

        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleSyncDevices(false)}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer disabled:opacity-50"
              title="Sync Device Inventory IPs into matching Subnets"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {t('ipam.syncDevices')}
            </button>
            <button
              onClick={() => {
                setAddSubnetPreset(null);
                setShowAddSubnet(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              {t('ipam.addSubnet')}
            </button>
          </div>
        )}
      </div>

      {lookupResult && (
        <div className="rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 px-4 py-2.5 text-sm flex items-center justify-between">
          <span>{lookupResult}</span>
          <button onClick={() => setLookupResult(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {syncMessage && (
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-4 py-2.5 text-xs sm:text-sm text-emerald-800 dark:text-emerald-200 flex items-center justify-between">
          <span>{syncMessage}</span>
          <button onClick={() => setSyncMessage(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {unmappedSummary &&
        (unmappedSummary.unmappedNoSubnetCount > 0 || unmappedSummary.needsSyncCount > 0) && (
          <div className="rounded-xl bg-amber-50/90 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-4 py-3.5 text-xs space-y-2.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-semibold text-amber-900 dark:text-amber-200 text-sm">
                    Device Inventory IPs Pending IPAM Sync
                  </div>
                  <p className="text-amber-800 dark:text-amber-300">
                    IPAM tracks IPs inside defined Subnets.{' '}
                    {unmappedSummary.unmappedNoSubnetCount > 0 && (
                      <span>
                        <strong>{unmappedSummary.unmappedNoSubnetCount}</strong> device IP(s) do not have a matching Subnet yet.{' '}
                      </span>
                    )}
                    {unmappedSummary.needsSyncCount > 0 && (
                      <span>
                        <strong>{unmappedSummary.needsSyncCount}</strong> device IP(s) match an existing Subnet and are ready to sync.
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {canEdit && (
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {unmappedSummary.needsSyncCount > 0 && (
                    <button
                      onClick={() => handleSyncDevices(false)}
                      disabled={syncing}
                      className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold cursor-pointer disabled:opacity-50"
                    >
                      {syncing ? 'Syncing...' : `Sync to Existing Subnets (${unmappedSummary.needsSyncCount})`}
                    </button>
                  )}
                  {unmappedSummary.unmappedNoSubnetCount > 0 && (
                    <button
                      onClick={() => handleSyncDevices(true)}
                      disabled={syncing}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer disabled:opacity-50"
                    >
                      {syncing ? 'Creating & Syncing...' : 'Auto-Create /24 Subnets & Sync All'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {unmappedSummary.suggestedSubnets.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {unmappedSummary.suggestedSubnets.map((sug) => (
                  <button
                    key={`${sug.siteId}-${sug.suggestedCidr}`}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => {
                      if (!canEdit) return;
                      setAddSubnetPreset({
                        siteId: sug.siteId,
                        cidr: sug.suggestedCidr,
                        vlanNumber: sug.vlanNumber,
                      });
                      setShowAddSubnet(true);
                    }}
                    title={`Click to add ${sug.suggestedCidr} for ${sug.siteCode} with custom Gateway/DNS (${sug.sampleDevices.map((d) => `${d.name}: ${d.ip}`).join(', ')})`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 hover:border-blue-500 transition cursor-pointer disabled:cursor-default"
                  >
                    <span className="font-semibold">{sug.siteCode}</span>
                    <span className="font-mono font-bold text-blue-700 dark:text-blue-300">{sug.suggestedCidr}</span>
                    {sug.vlanNumber && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                        VLAN {sug.vlanNumber}
                      </span>
                    )}
                    <span className="text-slate-500">({sug.deviceCount} devices)</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

      {/* Subnets Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {subnets.length === 0 ? (
          <div className="col-span-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-500">
            No subnets defined yet. Add a subnet such as <code>172.28.7.0/24</code> (VLAN 1211).
          </div>
        ) : (
          subnets.map((sub) => (
            <div
              key={sub.id}
              onClick={() => openSubnetGrid(sub)}
              className={`nims-card rounded-2xl p-4 cursor-pointer ${
                selectedSubnet?.id === sub.id
                  ? 'border-[var(--nims-secondary)] ring-2 ring-[var(--nims-glow)]'
                  : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="nims-icon-orb h-8 w-8 bg-gradient-to-br from-sky-500 to-blue-600 text-white shrink-0">
                    <TechIpamIcon className="h-4 w-4" />
                  </span>
                  <span className="font-bold font-mono text-base">{sub.cidr}</span>
                  {sub.hasLiveAgent && (
                    <span
                      className="nims-led-core nims-led-online"
                      title="Site Agent Live"
                      aria-label="Site Agent Live"
                    />
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {sub.vlanNumber && (
                    <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs font-semibold">
                      VLAN {sub.vlanNumber}
                    </span>
                  )}
                  {!fixedSiteId && sub.site && (
                    <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-xs font-semibold">
                      {sub.site.siteCode}
                    </span>
                  )}
                  {canEdit && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingSubnet(sub);
                        }}
                        title="Edit Subnet / Gateway / DNS / VLAN"
                        className="p-1 rounded hover:bg-blue-50 dark:hover:bg-blue-950/60 text-blue-600 cursor-pointer"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSubnet(sub);
                        }}
                        title="Delete Subnet"
                        className="p-1 rounded hover:bg-red-50 text-red-600 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                <div>Mask: <span className="font-mono">{sub.subnetMask}</span></div>
                <div>GW: <span className="font-mono">{sub.gateway || '-'}</span></div>
                <div>DNS1: <span className="font-mono">{sub.dns1 || '-'}</span></div>
                <div>DNS2: <span className="font-mono">{sub.dns2 || '-'}</span></div>
                <div>Range: <span className="font-mono">{sub.ipRangeStart}–{sub.ipRangeEnd.split('.').pop()}</span></div>
                <div>Broadcast: <span className="font-mono">{sub.broadcastAddress}</span></div>
              </div>

              <div className="mt-3">
                <div className="flex justify-between text-[11px] mb-1">
                  <span>Used: {sub.allocatedCount ?? 0} / {sub.totalHosts}</span>
                  <span>{sub.utilizationPct ?? 0}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full"
                    style={{ width: `${Math.min(100, sub.utilizationPct ?? 0)}%` }}
                  />
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Interactive IP Matrix & Used Allocations */}
      {selectedSubnet && (
        <div className="space-y-4">
          {/* Used / Allocated IPs Summary Table */}
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-bold text-sm sm:text-base flex items-center gap-2">
                  <span className="font-mono">{selectedSubnet.cidr}</span>
                  <span>— Active / Used IPs ({allocatedIps.length})</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Auto-linked by Site ({selectedSubnet.site?.siteCode || '-'})
                  {selectedSubnet.vlanNumber ? ` • VLAN ${selectedSubnet.vlanNumber}` : ''}
                </p>
              </div>
            </div>

            {allocatedIps.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No IPs currently allocated or reserved in this subnet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-semibold">IP Address</th>
                      <th className="px-4 py-2.5 text-left font-semibold">Status</th>
                      <th className="px-4 py-2.5 text-left font-semibold">Device / Hostname</th>
                      <th className="px-4 py-2.5 text-left font-semibold">Type / Model</th>
                      <th className="px-4 py-2.5 text-left font-semibold">VLAN</th>
                      <th className="px-4 py-2.5 text-left font-semibold">Location / MAC</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {allocatedIps.map((cell) => {
                      const blockPrefix = cell.ipAddress.split('.').slice(0, 3).join('.');
                      const dev = cell.device;
                      const devLive = Boolean(
                        dev && isDeviceAgentLive({ agentLive: dev.agentLive, lastPingAt: dev.lastPingAt }),
                      );
                      const isAgentOnline = Boolean(devLive && dev?.status === 'ONLINE');
                      const isOffline = dev?.status === 'OFFLINE';
                      return (
                        <tr
                          key={cell.ipAddress}
                          onClick={() => setSelectedIpCell(cell)}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                        >
                          <td className="px-4 py-2.5 font-mono font-semibold text-blue-600 dark:text-blue-400">
                            {cell.ipAddress}
                          </td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${IP_BADGE_CLASS[cell.status]}`}
                            >
                              {cell.status}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-medium">
                            {dev ? (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span>{dev.name}</span>
                                <span
                                  className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                                    isOffline
                                      ? 'bg-red-600 text-white'
                                      : isAgentOnline
                                      ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border border-emerald-500/35'
                                      : dev.status === 'MAINTENANCE'
                                      ? 'bg-amber-500/12 text-amber-700 dark:text-amber-300'
                                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                                  }`}
                                >
                                  <span
                                    className={getDeviceLedClass(dev.status, isAgentOnline)}
                                    aria-hidden="true"
                                  />
                                  <span>{dev.status}</span>
                                  {isAgentOnline && dev.lastLatencyMs != null && (
                                    <span className="font-mono opacity-80">
                                      {dev.lastLatencyMs}ms
                                    </span>
                                  )}
                                </span>
                              </div>
                            ) : (
                              <span>{cell.hostname || cell.description || '-'}</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                            {cell.device ? (
                              <span className="inline-flex items-center gap-1.5">
                                <span className="h-6 w-6 rounded-md bg-sky-500/10 text-sky-500 flex items-center justify-center shrink-0">
                                  <DeviceCategoryTechIcon
                                    category={cell.device.category}
                                    className="h-3.5 w-3.5"
                                  />
                                </span>
                                <span>
                                  {cell.device.category}
                                  {cell.device.model || cell.device.vendor
                                    ? ` • ${[cell.device.vendor, cell.device.model].filter(Boolean).join(' ')}`
                                    : ''}
                                </span>
                              </span>
                            ) : (
                              <span className="text-slate-400">{cell.description || '-'}</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 font-mono">
                            {cell.device?.vlan || (selectedSubnet.vlanNumber ? String(selectedSubnet.vlanNumber) : '-')}
                          </td>
                          <td className="px-4 py-2.5 text-slate-500">
                            <div>{cell.device?.location || '-'}</div>
                            {cell.macAddress && (
                              <div className="font-mono text-[11px] text-slate-400">{cell.macAddress}</div>
                            )}
                          </td>
                          <td
                            className="px-4 py-2.5 text-right whitespace-nowrap space-x-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {isLargeSubnet && blockPrefix !== currentBlockPrefix && (
                              <button
                                onClick={() => openSubnetGrid(selectedSubnet, blockPrefix)}
                                className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px]"
                              >
                                View /24
                              </button>
                            )}
                            {cell.device && (
                              <Link
                                href={`/sites/${selectedSubnet.siteId}?tab=inventory&deviceId=${cell.device.id}`}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 text-[11px] font-medium"
                              >
                                Device <ExternalLink className="h-3 w-3" />
                              </Link>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-bold text-base font-mono">
                  {selectedSubnet.cidr} — IP Address Map
                  {isLargeSubnet && currentBlockCidr ? ` (${currentBlockCidr})` : ''}
                </h3>
                <p className="text-xs text-slate-500">
                  Click any IP address to view linked device & location or update allocation
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px] font-medium items-center">
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">Available</span>
                <span className="px-2 py-0.5 rounded bg-blue-600 text-white">Allocated</span>
                <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-900">Reserved</span>
                <span className="px-2 py-0.5 rounded bg-[#0f2942] text-white">Gateway</span>
                <span className="px-2 py-0.5 rounded bg-violet-600 text-white">DHCP</span>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-50 border border-emerald-300 text-emerald-800 dark:bg-emerald-950/50 dark:border-emerald-700 dark:text-emerald-300">
                  <span className="nims-led-core nims-led-online !w-2 !h-2" aria-hidden="true" />
                  Agent Online
                </span>
                <span className="px-2 py-0.5 rounded bg-red-600 text-white">Offline</span>
              </div>
            </div>

            {isLargeSubnet && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-3">
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="inline-flex items-center gap-1 font-semibold text-slate-600 dark:text-slate-300 mr-1">
                    <Layers className="h-3.5 w-3.5" /> /24 Blocks:
                  </span>
                  {activeBlocks.map((b) => (
                    <button
                      key={b.blockPrefix}
                      onClick={() => openSubnetGrid(selectedSubnet, b.blockPrefix)}
                      className={`px-2.5 py-1 rounded-md font-mono text-xs transition ${
                        currentBlockPrefix === b.blockPrefix
                          ? 'bg-blue-600 text-white font-semibold'
                          : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-blue-400'
                      }`}
                    >
                      {b.blockCidr} ({b.usedCount})
                    </button>
                  ))}
                </div>
                <form onSubmit={handleJumpBlock} className="flex items-center gap-1.5">
                  <input
                    value={blockSearch}
                    onChange={(e) => setBlockSearch(e.target.value)}
                    placeholder="e.g. 191.20.110"
                    className="w-36 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-mono"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1 rounded bg-slate-900 dark:bg-slate-700 text-white text-xs font-medium"
                  >
                    Go
                  </button>
                </form>
              </div>
            )}

            <div className={`grid grid-cols-4 sm:grid-cols-8 md:grid-cols-12 lg:grid-cols-16 gap-1.5 ${loadingGrid ? 'opacity-60' : ''}`}>
              {ipGrid.map((cell) => {
                const lastOctet = cell.ipAddress.split('.').pop();
                const tileLabel =
                  cell.status !== 'AVAILABLE'
                    ? cell.device?.name || (cell.status === 'GATEWAY' ? 'GW' : cell.hostname || cell.status)
                    : null;
                const dev = cell.device;
                const devLive = Boolean(
                  dev && isDeviceAgentLive({ agentLive: dev.agentLive, lastPingAt: dev.lastPingAt }),
                );
                const isAgentOnline = Boolean(devLive && dev?.status === 'ONLINE');
                const isOffline = dev?.status === 'OFFLINE';
                const tileClass = isOffline
                  ? 'bg-red-600 border-red-700 text-white'
                  : isAgentOnline
                  ? `${IP_TILE_CLASS[cell.status]} border-emerald-400 nims-ip-tile-online`
                  : IP_TILE_CLASS[cell.status];

                return (
                  <button
                    key={cell.ipAddress}
                    onClick={() => setSelectedIpCell(cell)}
                    title={`${cell.ipAddress} (${cell.status})${
                      dev
                        ? ` - ${dev.name} (${dev.category}) • ${dev.status}${
                            isAgentOnline && dev.lastLatencyMs != null ? ` (${dev.lastLatencyMs}ms)` : ''
                          }`
                        : cell.hostname
                        ? ` - ${cell.hostname}`
                        : ''
                    }`}
                    className={`relative px-1 py-1.5 rounded border text-xs font-mono font-semibold text-center transition hover:scale-105 cursor-pointer flex flex-col items-center justify-center min-h-[44px] ${tileClass}`}
                  >
                    {isAgentOnline && (
                      <span
                        className="nims-led-core nims-led-online !w-2 !h-2 !absolute top-1 right-1"
                        aria-hidden="true"
                      />
                    )}
                    <span>.{lastOctet}</span>
                    {tileLabel && (
                      <span className="text-[9px] font-sans font-medium truncate max-w-full opacity-90 leading-tight">
                        {tileLabel}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* IP Allocation Detail / Edit Modal */}
      {selectedIpCell && selectedSubnet && (
        <IpAllocationModal
          subnet={selectedSubnet}
          cell={selectedIpCell}
          canEdit={canEdit}
          onClose={() => setSelectedIpCell(null)}
          onSaved={() => {
            setSelectedIpCell(null);
            openSubnetGrid(selectedSubnet, currentBlockPrefix || undefined);
            loadSubnets();
          }}
        />
      )}

      {/* Add / Edit Subnet Modal */}
      {(showAddSubnet || editingSubnet) && (
        <SubnetFormModal
          sites={sites}
          fixedSiteId={fixedSiteId}
          editingSubnet={editingSubnet}
          initialPreset={addSubnetPreset}
          onClose={() => {
            setShowAddSubnet(false);
            setEditingSubnet(null);
            setAddSubnetPreset(null);
          }}
          onSaved={() => {
            const editedId = editingSubnet?.id;
            setShowAddSubnet(false);
            setEditingSubnet(null);
            setAddSubnetPreset(null);
            loadSubnets();
            if (editedId && selectedSubnet?.id === editedId) {
              openSubnetGrid(selectedSubnet, currentBlockPrefix || undefined).catch(() => {});
            }
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmActionModal
          title="Delete Subnet"
          subtitle="Permanent IP subnet removal"
          itemName={deleteTarget.cidr}
          badgeText={deleteTarget.vlanNumber != null ? `VLAN ${deleteTarget.vlanNumber}` : undefined}
          details={[
            ...(deleteTarget.site
              ? [{ label: 'Site', value: `${deleteTarget.site.siteCode} — ${deleteTarget.site.siteName}` }]
              : []),
            ...(deleteTarget.gateway
              ? [{ label: 'Gateway', value: deleteTarget.gateway }]
              : []),
          ]}
          message={`Are you sure you want to delete subnet ${deleteTarget.cidr} and all of its IP allocations?`}
          variant="danger"
          loading={deletingSubnet}
          error={deleteSubnetError}
          onCancel={() => {
            if (!deletingSubnet) setDeleteTarget(null);
          }}
          onConfirm={confirmDeleteSubnet}
        />
      )}
    </div>
  );
}

function IpAllocationModal({
  subnet,
  cell,
  canEdit,
  onClose,
  onSaved,
}: {
  subnet: Subnet;
  cell: IpGridCell;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<IpAllocationStatus>(cell.status);
  const [hostname, setHostname] = useState(cell.hostname || '');
  const [description, setDescription] = useState(cell.description || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/ipam/ips/allocate', {
        method: 'POST',
        body: JSON.stringify({
          subnetId: subnet.id,
          ipAddress: cell.ipAddress,
          status,
          hostname: hostname || null,
          description: description || null,
          deviceId: cell.device?.id || null,
        }),
      });
      onSaved();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to update IP');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h4 className="font-bold font-mono text-base">{cell.ipAddress}</h4>
            <p className="text-xs text-slate-500">
              {subnet.cidr} {subnet.vlanNumber ? `• VLAN ${subnet.vlanNumber}` : ''}
            </p>
          </div>
          <button onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSave} className="p-5 space-y-3 text-sm">
          {cell.device && (() => {
            const dev = cell.device;
            const devLive = isDeviceAgentLive({
              agentLive: dev.agentLive,
              lastPingAt: dev.lastPingAt,
            });
            const isAgentOnline = devLive && dev.status === 'ONLINE';
            const isOffline = dev.status === 'OFFLINE';
            return (
              <div
                className={`rounded-lg p-3 text-xs space-y-1 border ${
                  isOffline
                    ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800'
                    : isAgentOnline
                    ? 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
                    : 'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold flex items-center gap-1.5">
                    <span
                      className={getDeviceLedClass(dev.status, isAgentOnline)}
                      aria-hidden="true"
                    />
                    <span>Linked Device: {dev.name}</span>
                  </div>
                  <Link
                    href={`/sites/${subnet.siteId}?tab=inventory&deviceId=${dev.id}`}
                    className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-300 hover:underline font-medium"
                  >
                    Open <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
                <div>
                  Type: {dev.category} • Vendor/Model:{' '}
                  {[dev.vendor, dev.model].filter(Boolean).join(' ') || '-'}
                </div>
                <div>
                  VLAN: {dev.vlan || subnet.vlanNumber || '-'} • Location: {dev.location || '-'} • Status:{' '}
                  <strong className={isOffline ? 'text-red-600 dark:text-red-400' : ''}>
                    {dev.status}
                  </strong>
                  {isAgentOnline && dev.lastLatencyMs != null && (
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 ml-1">
                      ({dev.lastLatencyMs}ms)
                    </span>
                  )}
                </div>
                {cell.macAddress && <div className="font-mono">MAC: {cell.macAddress}</div>}
              </div>
            );
          })()}

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Status</label>
            <select
              disabled={!canEdit}
              value={status}
              onChange={(e) => setStatus(e.target.value as IpAllocationStatus)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
            >
              <option value="AVAILABLE">Available (Release)</option>
              <option value="ALLOCATED">Allocated</option>
              <option value="RESERVED">Reserved</option>
              <option value="GATEWAY">Gateway</option>
              <option value="DHCP">DHCP Pool / Server</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Hostname / Label</label>
            <input
              disabled={!canEdit}
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Description</label>
            <input
              disabled={!canEdit}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700"
            >
              Close
            </button>
            {canEdit && (
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold cursor-pointer"
              >
                {saving ? 'Saving...' : 'Save IP'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function SubnetFormModal({
  sites,
  fixedSiteId,
  editingSubnet,
  initialPreset,
  onClose,
  onSaved,
}: {
  sites: Site[];
  fixedSiteId?: string;
  editingSubnet?: Subnet | null;
  initialPreset?: { siteId?: string; cidr?: string; vlanNumber?: number | null } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const isEditing = Boolean(editingSubnet);
  const [siteId, setSiteId] = useState(
    editingSubnet?.siteId || fixedSiteId || initialPreset?.siteId || sites[0]?.id || '',
  );
  const [vlanNumber, setVlanNumber] = useState(
    editingSubnet?.vlanNumber
      ? String(editingSubnet.vlanNumber)
      : initialPreset?.vlanNumber
        ? String(initialPreset.vlanNumber)
        : '',
  );
  const [cidr, setCidr] = useState(editingSubnet?.cidr || initialPreset?.cidr || '');
  const [gateway, setGateway] = useState(editingSubnet?.gateway || '');
  const [dns1, setDns1] = useState(editingSubnet?.dns1 || '');
  const [dns2, setDns2] = useState(editingSubnet?.dns2 || '');
  const [dhcpServer, setDhcpServer] = useState(editingSubnet?.dhcpServer || '');
  const [description, setDescription] = useState(editingSubnet?.description || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = {
        ...(!isEditing ? { siteId } : {}),
        vlanNumber: vlanNumber.trim() ? parseInt(vlanNumber, 10) : null,
        cidr: cidr.trim(),
        gateway: gateway.trim() || null,
        dns1: dns1.trim() || null,
        dns2: dns2.trim() || null,
        dhcpServer: dhcpServer.trim() || null,
        description: description.trim() || null,
      };
      await apiFetch(
        isEditing ? `/ipam/subnets/${editingSubnet!.id}` : '/ipam/subnets',
        {
          method: isEditing ? 'PUT' : 'POST',
          body: JSON.stringify(payload),
        },
      );
      onSaved();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : `Failed to ${isEditing ? 'update' : 'create'} subnet`,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-lg">
            {isEditing ? `${t('ipam.editSubnetTitle')} (${editingSubnet?.cidr})` : t('ipam.addSubnet')}
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

          {!fixedSiteId && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Site *</label>
              <select
                required
                disabled={isEditing}
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-60"
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
              <label className="block text-xs font-semibold text-slate-500 mb-1">Network CIDR *</label>
              <input
                required
                value={cidr}
                onChange={(e) => setCidr(e.target.value)}
                placeholder="172.28.7.0/24"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">VLAN ID</label>
              <input
                type="number"
                value={vlanNumber}
                onChange={(e) => setVlanNumber(e.target.value)}
                placeholder="1211"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Gateway</label>
              <input
                value={gateway}
                onChange={(e) => setGateway(e.target.value)}
                placeholder="172.28.7.254"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">DHCP Server</label>
              <input
                value={dhcpServer}
                onChange={(e) => setDhcpServer(e.target.value)}
                placeholder="172.28.7.2"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">DNS 1</label>
              <input
                value={dns1}
                onChange={(e) => setDns1(e.target.value)}
                placeholder="172.28.9.1"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">DNS 2</label>
              <input
                value={dns2}
                onChange={(e) => setDns2(e.target.value)}
                placeholder="172.26.9.1"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Management VLAN for Core & APs"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 cursor-pointer">
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-blue-600 text-white font-semibold cursor-pointer"
            >
              {saving
                ? isEditing
                  ? t('common.saving')
                  : t('common.creating')
                : isEditing
                  ? t('common.saveChanges')
                  : t('ipam.createSubnetBtn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

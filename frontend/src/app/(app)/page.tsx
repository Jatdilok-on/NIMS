'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Building2,
  Cpu,
  HelpCircle,
  Layers,
  PieChart as PieChartIcon,
  TrendingUp,
  Wifi,
  WifiOff,
  Wrench,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  LoginHeroEmblem,
  TechAccessPointIcon,
  TechApClientIcon,
  TechBarcodeIcon,
  TechDeviceAllIcon,
  TechDocumentIcon,
  TechEsxiIcon,
  TechIpCamIcon,
  TechIpamIcon,
  TechNasIcon,
  TechNvrIcon,
  TechPcIcon,
  TechPlcIcon,
  TechPrinterIcon,
  TechServerIcon,
  TechSiteNodeIcon,
  TechSwitchIcon,
  TechTopologyIcon,
  TechTvIcon,
  TechUpsIcon,
  TechVmIcon,
  TechWlcIcon,
} from '@/components/icons/TechIcons';
import { apiFetch, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { Site } from '@/lib/types';

interface DashboardSummary {
  kpis: {
    totalSites: number;
    totalSwitches: number;
    totalAccessPoints: number;
    totalApClients: number;
    totalWlc: number;
    totalServers: number;
    totalPlc: number;
    totalEsxi: number;
    totalVm: number;
    totalNas: number;
    totalUps: number;
    totalIpCams: number;
    totalPc: number;
    totalNvr: number;
    totalTv?: number;
    totalPrinter?: number;
    totalBarcode?: number;
    totalNetworkDevices: number;
    totalDocuments: number;
    totalNetworkDiagrams: number;
  };
  statusSummary: {
    ONLINE: number;
    OFFLINE: number;
    MAINTENANCE: number;
    UNKNOWN: number;
  };
  charts: {
    devicesBySite: Array<{ siteId: string; siteCode: string; siteName: string; count: number }>;
    devicesByType: Array<{ type: string; category: string; count: number }>;
    devicesByStatus: Array<{ status: string; label: string; count: number }>;
    monthlyAdded: Array<{ month: string; count: number }>;
  };
  recentActivity: Array<{
    id: string;
    username: string;
    action: string;
    module: string;
    siteCode?: string | null;
    deviceName?: string | null;
    result: string;
    createdAt: string;
  }>;
}

const STATUS_COLORS: Record<string, string> = {
  ONLINE: '#10b981',
  OFFLINE: '#ef4444',
  MAINTENANCE: '#f59e0b',
  UNKNOWN: '#64748b',
};

function getActionBadgeClass(action: string): string {
  if (action.startsWith('DELETE')) {
    return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20';
  }
  if (action.startsWith('CREATE') || action.startsWith('IMPORT') || action.startsWith('SYNC')) {
    return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
  }
  if (action.startsWith('UPDATE') || action.startsWith('CHANGE') || action.startsWith('BULK')) {
    return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
  }
  if (action.startsWith('VIEW') || action.startsWith('COPY')) {
    return 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20';
  }
  return 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20';
}

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useI18n();
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadSeq, setReloadSeq] = useState(0);

  const buildInventoryHref = (opts: {
    status?: string;
    category?: string;
    siteId?: string;
  }) => {
    const params = new URLSearchParams();
    const effectiveSiteId = opts.siteId !== undefined ? opts.siteId : selectedSiteId;
    if (effectiveSiteId) params.set('siteId', effectiveSiteId);
    if (opts.category) params.set('category', opts.category);
    if (opts.status) params.set('status', opts.status);
    const qs = params.toString();
    return qs ? `/inventory?${qs}` : '/inventory';
  };

  useEffect(() => {
    apiFetch<{ sites: Site[] }>('/sites')
      .then((res) => setSites(res.sites))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    const q = selectedSiteId ? `?siteId=${encodeURIComponent(selectedSiteId)}` : '';
    apiFetch<DashboardSummary>(`/dashboard/summary${q}`)
      .then((res) => {
        if (!cancelled) setSummary(res);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof ApiError ? err.message : 'Failed to load dashboard summary');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSiteId, reloadSeq]);

  const heroCards = summary
    ? [
        {
          label: t('dashboard.totalSites'),
          value: summary.kpis.totalSites,
          href: '/sites',
          icon: TechSiteNodeIcon,
          orb: 'from-sky-400 via-blue-500 to-indigo-600 shadow-blue-500/30',
          bar: 'from-sky-400 to-blue-600',
          tint: 'from-sky-500/12',
        },
        {
          label: t('dashboard.totalDevices'),
          value: summary.kpis.totalNetworkDevices,
          href: buildInventoryHref({}),
          icon: TechDeviceAllIcon,
          orb: 'from-indigo-400 via-blue-600 to-violet-600 shadow-indigo-500/30',
          bar: 'from-indigo-400 to-violet-600',
          tint: 'from-indigo-500/12',
        },
        {
          label: t('dashboard.diagrams'),
          value: summary.kpis.totalNetworkDiagrams,
          href: '/diagrams',
          icon: TechTopologyIcon,
          orb: 'from-emerald-400 via-teal-500 to-green-600 shadow-emerald-500/30',
          bar: 'from-emerald-400 to-teal-600',
          tint: 'from-emerald-500/12',
        },
        {
          label: t('dashboard.documents'),
          value: summary.kpis.totalDocuments,
          href: '/documents',
          icon: TechDocumentIcon,
          orb: 'from-amber-400 via-orange-500 to-rose-500 shadow-amber-500/30',
          bar: 'from-amber-400 to-orange-600',
          tint: 'from-amber-500/12',
        },
      ]
    : [];

  const categoryCards = summary
    ? [
        {
          category: 'SWITCH',
          label: t('dashboard.switches'),
          value: summary.kpis.totalSwitches,
          icon: TechSwitchIcon,
          orb: 'from-indigo-500 to-blue-600 shadow-indigo-500/25',
          bar: 'bg-indigo-500',
        },
        {
          category: 'ACCESS_POINT',
          label: t('dashboard.accessPoints'),
          value: summary.kpis.totalAccessPoints,
          icon: TechAccessPointIcon,
          orb: 'from-cyan-500 to-teal-600 shadow-cyan-500/25',
          bar: 'bg-cyan-500',
        },
        {
          category: 'AP_CLIENT',
          label: t('dashboard.apClients'),
          value: summary.kpis.totalApClients,
          icon: TechApClientIcon,
          orb: 'from-teal-500 to-emerald-600 shadow-teal-500/25',
          bar: 'bg-teal-500',
        },
        {
          category: 'WLC',
          label: t('dashboard.wlc'),
          value: summary.kpis.totalWlc,
          icon: TechWlcIcon,
          orb: 'from-violet-500 to-purple-600 shadow-violet-500/25',
          bar: 'bg-violet-500',
        },
        {
          category: 'SERVER',
          label: t('dashboard.servers'),
          value: summary.kpis.totalServers,
          icon: TechServerIcon,
          orb: 'from-slate-600 to-slate-800 shadow-slate-500/25',
          bar: 'bg-slate-600',
        },
        {
          category: 'PLC',
          label: 'PLC',
          value: summary.kpis.totalPlc,
          icon: TechPlcIcon,
          orb: 'from-amber-500 to-orange-600 shadow-amber-500/25',
          bar: 'bg-amber-500',
        },
        {
          category: 'ESXI',
          label: 'ESXi Hosts',
          value: summary.kpis.totalEsxi,
          icon: TechEsxiIcon,
          orb: 'from-emerald-500 to-teal-600 shadow-emerald-500/25',
          bar: 'bg-emerald-500',
        },
        {
          category: 'VM',
          label: 'VMs',
          value: summary.kpis.totalVm,
          icon: TechVmIcon,
          orb: 'from-purple-500 to-fuchsia-600 shadow-purple-500/25',
          bar: 'bg-purple-500',
        },
        {
          category: 'NAS',
          label: 'NAS Storage',
          value: summary.kpis.totalNas,
          icon: TechNasIcon,
          orb: 'from-sky-500 to-cyan-600 shadow-sky-500/25',
          bar: 'bg-sky-500',
        },
        {
          category: 'UPS',
          label: 'UPS',
          value: summary.kpis.totalUps,
          icon: TechUpsIcon,
          orb: 'from-lime-500 to-green-600 shadow-lime-500/25',
          bar: 'bg-lime-500',
        },
        {
          category: 'IP_CAM',
          label: 'IP Cameras',
          value: summary.kpis.totalIpCams ?? 0,
          icon: TechIpCamIcon,
          orb: 'from-rose-500 to-pink-600 shadow-rose-500/25',
          bar: 'bg-rose-500',
        },
        {
          category: 'PC',
          label: 'PC / Workstations',
          value: summary.kpis.totalPc ?? 0,
          icon: TechPcIcon,
          orb: 'from-violet-500 to-indigo-600 shadow-violet-500/25',
          bar: 'bg-violet-500',
        },
        {
          category: 'NVR',
          label: 'NVR Recorders',
          value: summary.kpis.totalNvr ?? 0,
          icon: TechNvrIcon,
          orb: 'from-orange-500 to-amber-600 shadow-orange-500/25',
          bar: 'bg-orange-500',
        },
        {
          category: 'TV',
          label: 'TV / Displays',
          value: summary.kpis.totalTv ?? 0,
          icon: TechTvIcon,
          orb: 'from-cyan-500 to-sky-600 shadow-cyan-500/25',
          bar: 'bg-cyan-500',
        },
        {
          category: 'PRINTER',
          label: 'Printers',
          value: summary.kpis.totalPrinter ?? 0,
          icon: TechPrinterIcon,
          orb: 'from-sky-500 to-blue-600 shadow-sky-500/25',
          bar: 'bg-sky-500',
        },
        {
          category: 'BARCODE',
          label: 'Barcode Scanners',
          value: summary.kpis.totalBarcode ?? 0,
          icon: TechBarcodeIcon,
          orb: 'from-teal-500 to-cyan-600 shadow-teal-500/25',
          bar: 'bg-teal-500',
        },
      ]
    : [];

  const totalStatusDevices = summary
    ? summary.statusSummary.ONLINE +
      summary.statusSummary.OFFLINE +
      summary.statusSummary.MAINTENANCE +
      summary.statusSummary.UNKNOWN
    : 0;
  const onlinePct =
    totalStatusDevices > 0 && summary
      ? Math.round((summary.statusSummary.ONLINE / totalStatusDevices) * 100)
      : 100;

  return (
    <div className="space-y-6">
      {/* Elevated NOC Command Hero Banner */}
      <div
        style={{
          background:
            'linear-gradient(135deg, var(--nims-sidebar) 0%, color-mix(in srgb, var(--nims-secondary) 36%, var(--nims-sidebar)) 100%)',
        }}
        className="rounded-3xl p-5 sm:p-6 text-white relative overflow-hidden shadow-xl border border-white/10"
      >
        {/* Geometric grid & glowing radial accents */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(125, 211, 252, 0.22) 1px, transparent 1px), linear-gradient(to bottom, rgba(125, 211, 252, 0.22) 1px, transparent 1px)',
            backgroundSize: '30px 30px',
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-16 h-60 w-60 rounded-full blur-3xl opacity-35 bg-cyan-400"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-16 -bottom-16 h-52 w-52 rounded-full blur-3xl opacity-25 bg-blue-500"
        />

        <div className="relative flex flex-col xl:flex-row xl:items-center xl:justify-between gap-5">
          <div className="flex items-start sm:items-center gap-4">
            <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-slate-900/70 border border-cyan-400/35 flex items-center justify-center shadow-xl shadow-cyan-500/20 shrink-0 backdrop-blur-md">
              <LoginHeroEmblem className="h-11 w-11 sm:h-12 sm:w-12" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
                  {t('dashboard.title')}
                </h1>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-[11px] font-mono font-semibold">
                  <span className="relative h-2 w-2 rounded-full bg-emerald-400 text-emerald-400 nims-pulse-ring" />
                  {onlinePct}% HEALTH
                </span>
              </div>
              <p className="text-xs sm:text-sm text-cyan-100/80 max-w-2xl">
                {t('dashboard.subtitle')}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Quick Navigation Pills */}
            <div className="hidden sm:flex items-center gap-1.5 mr-1">
              {[
                { href: '/sites', label: t('nav.sites'), icon: TechSiteNodeIcon },
                { href: '/inventory', label: t('nav.devices'), icon: TechDeviceAllIcon },
                { href: '/ipam', label: t('nav.ipamShort'), icon: TechIpamIcon },
                { href: '/diagrams', label: t('nav.diagramsShort'), icon: TechTopologyIcon },
              ].map((nav) => {
                const NavIcon = nav.icon;
                return (
                  <Link
                    key={nav.href}
                    href={nav.href}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-medium text-white/90 transition backdrop-blur-sm"
                  >
                    <NavIcon className="h-3.5 w-3.5 text-cyan-300" />
                    <span>{nav.label}</span>
                  </Link>
                );
              })}
            </div>

            {/* Scope Filter */}
            <div className="flex items-center gap-2 rounded-xl bg-slate-950/45 border border-white/15 px-3 py-1.5 backdrop-blur-sm">
              <Building2 className="h-4 w-4 text-cyan-300 shrink-0" />
              <span className="text-[11px] font-mono uppercase tracking-wider text-cyan-200/80 hidden sm:inline">
                {t('dashboard.scope')}
              </span>
              <select
                value={selectedSiteId}
                onChange={(e) => setSelectedSiteId(e.target.value)}
                className="bg-transparent text-xs sm:text-sm font-semibold text-white outline-none cursor-pointer pr-2 [&>option]:bg-slate-900 [&>option]:text-white"
              >
                <option value="">{t('dashboard.allSites')}</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.siteCode} — {s.siteName}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {loadError && !loading ? (
        <div className="p-6 rounded-2xl border border-red-200 dark:border-red-900 bg-red-50/70 dark:bg-red-950/30 text-center space-y-3">
          <div className="text-sm text-red-700 dark:text-red-300 font-medium">{loadError}</div>
          <button
            onClick={() => setReloadSeq((c) => c + 1)}
            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : loading || !summary ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-28 rounded-2xl bg-[var(--nims-surface)] border border-[var(--nims-border)] animate-pulse"
              />
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {Array.from({ length: 14 }).map((_, i) => (
              <div
                key={i}
                className="h-20 rounded-2xl bg-[var(--nims-surface)] border border-[var(--nims-border)] animate-pulse"
              />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Tier 1: Executive Overview Hero Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {heroCards.map((card) => {
              const Icon = card.icon;
              return (
                <Link
                  key={card.label}
                  href={card.href}
                  className="nims-card rounded-2xl p-5 relative overflow-hidden flex items-center justify-between gap-4 group hover:-translate-y-0.5 transition-all"
                >
                  <div
                    aria-hidden="true"
                    className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${card.bar}`}
                  />
                  <div
                    aria-hidden="true"
                    className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${card.tint} via-transparent to-transparent opacity-80`}
                  />
                  <Icon
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-3 -bottom-3 h-20 w-20 opacity-[0.045] dark:opacity-[0.07] group-hover:scale-110 transition-transform duration-300"
                  />

                  <div className="relative min-w-0">
                    <div className="text-xs font-semibold uppercase tracking-wider text-[var(--nims-muted)] truncate flex items-center gap-1">
                      <span>{card.label}</span>
                      <ArrowUpRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-[var(--nims-secondary)]" />
                    </div>
                    <div className="text-3xl font-extrabold mt-1.5 tabular-nums tracking-tight">
                      {card.value}
                    </div>
                  </div>

                  <div
                    className={`relative h-12 w-12 rounded-2xl bg-gradient-to-br ${card.orb} text-white shadow-lg ring-1 ring-white/25 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-200`}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Device Status Telemetry Bar */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                status: 'ONLINE',
                label: t('dashboard.statusOnline'),
                value: summary.statusSummary.ONLINE,
                icon: Wifi,
                orb: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25',
                dot: 'bg-emerald-500 text-emerald-500 nims-pulse-ring',
                text: 'text-emerald-600 dark:text-emerald-400',
                bar: 'from-emerald-400 to-emerald-600',
              },
              {
                status: 'OFFLINE',
                label: t('dashboard.statusOffline'),
                value: summary.statusSummary.OFFLINE,
                icon: WifiOff,
                orb: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/25',
                dot: 'bg-rose-500',
                text: 'text-rose-600 dark:text-rose-400',
                bar: 'from-rose-400 to-red-600',
              },
              {
                status: 'MAINTENANCE',
                label: t('dashboard.statusMaintenance'),
                value: summary.statusSummary.MAINTENANCE,
                icon: Wrench,
                orb: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25',
                dot: 'bg-amber-500',
                text: 'text-amber-600 dark:text-amber-400',
                bar: 'from-amber-400 to-orange-500',
              },
              {
                status: 'UNKNOWN',
                label: t('dashboard.statusUnknown'),
                value: summary.statusSummary.UNKNOWN,
                icon: HelpCircle,
                orb: 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/25',
                dot: 'bg-slate-400',
                text: 'text-slate-600 dark:text-slate-400',
                bar: 'from-slate-400 to-slate-500',
              },
            ].map((st) => {
              const StIcon = st.icon;
              const ratio =
                totalStatusDevices > 0 ? Math.round((st.value / totalStatusDevices) * 100) : 0;
              return (
                <Link
                  key={st.status}
                  href={buildInventoryHref({ status: st.status })}
                  className="block nims-card rounded-2xl px-4 py-3.5 space-y-2.5 group hover:border-[var(--nims-secondary)]/50 hover:-translate-y-0.5 transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`h-8 w-8 rounded-xl border flex items-center justify-center shrink-0 ${st.orb}`}
                      >
                        <StIcon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`relative h-2 w-2 rounded-full ${st.dot}`} />
                          <span className="text-xs sm:text-sm font-semibold truncate">
                            {st.label}
                          </span>
                          <ArrowUpRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-[var(--nims-secondary)] shrink-0" />
                        </div>
                        <div className="text-[10px] font-mono text-[var(--nims-muted)]">
                          {ratio}% OF FLEET
                        </div>
                      </div>
                    </div>
                    <span className={`text-xl font-extrabold tabular-nums ${st.text}`}>
                      {st.value}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-200/70 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${st.bar} transition-all duration-500`}
                      style={{ width: `${ratio}%` }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Tier 2: Hardware Fleet Matrix (14 Categories) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2">
                <span className="h-7 w-7 rounded-lg bg-[var(--nims-secondary)]/12 text-[var(--nims-secondary)] flex items-center justify-center">
                  <Layers className="h-4 w-4" />
                </span>
                <h2 className="text-sm font-bold tracking-tight">
                  {t('dashboard.chartByType')}
                </h2>
              </div>
              <Link
                href={buildInventoryHref({})}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--nims-secondary)] hover:underline"
              >
                <span>{t('inventory.allDevices')}</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7 gap-3">
              {categoryCards.map((card) => {
                const Icon = card.icon;
                const pct =
                  summary.kpis.totalNetworkDevices > 0
                    ? Math.round((card.value / summary.kpis.totalNetworkDevices) * 100)
                    : 0;
                return (
                  <Link
                    key={card.category}
                    href={buildInventoryHref({ category: card.category })}
                    className="nims-card rounded-2xl p-3.5 relative overflow-hidden flex flex-col justify-between gap-2.5 group hover:-translate-y-0.5 transition-all cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div
                        className={`h-9 w-9 rounded-xl bg-gradient-to-br ${card.orb} text-white shadow-md ring-1 ring-white/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-200`}
                      >
                        <Icon className="h-4.5 w-4.5" />
                      </div>
                      <span className="text-[10px] font-mono font-semibold text-[var(--nims-muted)]">
                        {pct}%
                      </span>
                    </div>
                    <div>
                      <div className="text-xl font-extrabold tabular-nums tracking-tight leading-none">
                        {card.value}
                      </div>
                      <div className="text-[11px] font-medium text-[var(--nims-muted)] truncate mt-1">
                        {card.label}
                      </div>
                    </div>
                    <div className="h-1 rounded-full bg-slate-200/70 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${card.bar} transition-all duration-500`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* 4 Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Devices by Site */}
            <div className="nims-card rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <span className="h-8 w-8 rounded-xl bg-sky-500/12 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                    <BarChart3 className="h-4 w-4" />
                  </span>
                  <h2 className="text-sm font-bold">{t('dashboard.chartBySite')}</h2>
                </div>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                  BY SITE
                </span>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.charts.devicesBySite}>
                    <defs>
                      <linearGradient id="nimsSiteBar" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#38bdf8" />
                        <stop offset="100%" stopColor="#1d4ed8" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.18} />
                    <XAxis dataKey="siteCode" fontSize={12} />
                    <YAxis allowDecimals={false} fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--nims-surface)',
                        borderColor: 'var(--nims-border)',
                        borderRadius: '12px',
                        color: 'var(--nims-text)',
                      }}
                    />
                    <Bar
                      dataKey="count"
                      name="Devices"
                      fill="url(#nimsSiteBar)"
                      radius={[8, 8, 0, 0]}
                      className="cursor-pointer"
                      onClick={(entry) => {
                        const raw = entry as unknown as {
                          siteId?: string;
                          payload?: { siteId?: string };
                        };
                        const siteId = raw?.siteId ?? raw?.payload?.siteId;
                        if (siteId) router.push(buildInventoryHref({ siteId }));
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Devices by Type */}
            <div className="nims-card rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <span className="h-8 w-8 rounded-xl bg-indigo-500/12 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                    <Cpu className="h-4 w-4" />
                  </span>
                  <h2 className="text-sm font-bold">{t('dashboard.chartByType')}</h2>
                </div>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                  HARDWARE
                </span>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.charts.devicesByType}>
                    <defs>
                      <linearGradient id="nimsTypeBar" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22d3ee" />
                        <stop offset="100%" stopColor="#4f46e5" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.18} />
                    <XAxis dataKey="type" fontSize={11} />
                    <YAxis allowDecimals={false} fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--nims-surface)',
                        borderColor: 'var(--nims-border)',
                        borderRadius: '12px',
                        color: 'var(--nims-text)',
                      }}
                    />
                    <Bar
                      dataKey="count"
                      name="Count"
                      fill="url(#nimsTypeBar)"
                      radius={[8, 8, 0, 0]}
                      className="cursor-pointer"
                      onClick={(entry) => {
                        const raw = entry as unknown as {
                          category?: string;
                          payload?: { category?: string };
                        };
                        const category = raw?.category ?? raw?.payload?.category;
                        if (category) router.push(buildInventoryHref({ category }));
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Device Status Pie */}
            <div className="nims-card rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <span className="h-8 w-8 rounded-xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <PieChartIcon className="h-4 w-4" />
                  </span>
                  <h2 className="text-sm font-bold">{t('dashboard.chartByStatus')}</h2>
                </div>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  STATUS
                </span>
              </div>
              <div className="h-64 relative">
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-7">
                  <span className="text-2xl font-extrabold tabular-nums">{onlinePct}%</span>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--nims-muted)]">
                    ONLINE
                  </span>
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={summary.charts.devicesByStatus}
                      dataKey="count"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={58}
                      outerRadius={88}
                      paddingAngle={4}
                      className="cursor-pointer"
                      onClick={(entry) => {
                        const raw = entry as unknown as {
                          status?: string;
                          payload?: { status?: string };
                        };
                        const status = raw?.status ?? raw?.payload?.status;
                        if (status) router.push(buildInventoryHref({ status }));
                      }}
                    >
                      {summary.charts.devicesByStatus.map((entry) => (
                        <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || '#64748b'} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--nims-surface)',
                        borderColor: 'var(--nims-border)',
                        borderRadius: '12px',
                        color: 'var(--nims-text)',
                      }}
                    />
                    <Legend
                      wrapperStyle={{ cursor: 'pointer' }}
                      onClick={(entry) => {
                        const raw = entry as unknown as {
                          value?: string;
                          payload?: { status?: string };
                        };
                        const status =
                          raw?.payload?.status ??
                          (typeof raw?.value === 'string' ? raw.value.toUpperCase() : undefined);
                        if (status && STATUS_COLORS[status]) {
                          router.push(buildInventoryHref({ status }));
                        }
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Monthly Additions */}
            <div className="nims-card rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <span className="h-8 w-8 rounded-xl bg-cyan-500/12 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
                    <TrendingUp className="h-4 w-4" />
                  </span>
                  <h2 className="text-sm font-bold">{t('dashboard.chartMonthly')}</h2>
                </div>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                  TIMELINE
                </span>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={summary.charts.monthlyAdded}>
                    <defs>
                      <linearGradient id="nimsMonthlyArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.18} />
                    <XAxis dataKey="month" fontSize={11} />
                    <YAxis allowDecimals={false} fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--nims-surface)',
                        borderColor: 'var(--nims-border)',
                        borderRadius: '12px',
                        color: 'var(--nims-text)',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      name="Added Devices"
                      stroke="#06b6d4"
                      strokeWidth={2.5}
                      fill="url(#nimsMonthlyArea)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="nims-card rounded-2xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2.5">
                <span className="h-8 w-8 rounded-xl bg-blue-500/12 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Activity className="h-4 w-4" />
                </span>
                <h2 className="text-sm font-bold">{t('dashboard.recentActivity')}</h2>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-[var(--nims-border)]">
                {user?.roleCode === 'SUPER_ADMIN' ? 'All Users' : 'My Activity Only'}
              </span>
            </div>
            {summary.recentActivity.length === 0 ? (
              <p className="text-sm text-[var(--nims-muted)]">{t('dashboard.noActivity')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--nims-muted)] border-b border-[var(--nims-border)]">
                      <th className="py-2.5 pr-4">Time</th>
                      <th className="py-2.5 pr-4">User</th>
                      <th className="py-2.5 pr-4">Action</th>
                      <th className="py-2.5 pr-4">Site</th>
                      <th className="py-2.5 pr-4">Device</th>
                      <th className="py-2.5">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--nims-border)]/70">
                    {summary.recentActivity.map((log) => (
                      <tr
                        key={log.id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/35 transition-colors"
                      >
                        <td className="py-2.5 pr-4 text-xs text-[var(--nims-muted)] whitespace-nowrap font-mono">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="h-6 w-6 rounded-lg bg-[var(--nims-secondary)]/15 text-[var(--nims-secondary)] text-[10px] font-bold flex items-center justify-center uppercase shrink-0">
                              {log.username.slice(0, 2)}
                            </span>
                            <span className="font-semibold text-xs sm:text-sm">{log.username}</span>
                          </div>
                        </td>
                        <td className="py-2.5 pr-4">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-md border text-[11px] font-mono font-semibold ${getActionBadgeClass(
                              log.action,
                            )}`}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4">
                          {log.siteCode ? (
                            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-xs font-mono font-semibold">
                              {log.siteCode}
                            </span>
                          ) : (
                            <span className="text-[var(--nims-muted)]">-</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 text-xs sm:text-sm">{log.deviceName || '-'}</td>
                        <td className="py-2.5">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                              log.result === 'SUCCESS'
                                ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400'
                                : 'bg-rose-500/12 text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                log.result === 'SUCCESS' ? 'bg-emerald-500' : 'bg-rose-500'
                              }`}
                            />
                            {log.result}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

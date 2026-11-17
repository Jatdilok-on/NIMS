'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ExternalLink,
  FileText,
  Globe,
  KeyRound,
  LayoutGrid,
  MapPin,
  Network,
  Radio,
  Server,
  Settings,
  Wrench,
} from 'lucide-react';
import { apiFetch, ApiError, getSiteGoogleMapUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { Site, SitePermission } from '@/lib/types';
import { InventoryPanel } from '@/components/inventory/InventoryPanel';
import { IpamPanel } from '@/components/ipam/IpamPanel';
import { CredentialsPanel } from '@/components/credentials/CredentialsPanel';
import { DiagramsPanel } from '@/components/diagram/DiagramsPanel';
import { getDiagramThumbnailSrc } from '@/components/diagram/DiagramViewer';
import { DocumentsPanel } from '@/components/documents/DocumentsPanel';
import { MaintenancePanel } from '@/components/maintenance/MaintenancePanel';
import { SiteAgentsPanel } from '@/components/sites/SiteAgentsPanel';

type SiteTab =
  | 'overview'
  | 'diagram'
  | 'inventory'
  | 'ipam'
  | 'access'
  | 'documents'
  | 'maintenance'
  | 'agents'
  | 'settings';

export default function SiteDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useI18n();
  const siteId = String(params.id);

  const initialTab = (searchParams.get('tab') as SiteTab) || 'overview';
  const initialDeviceId = searchParams.get('deviceId');

  const [tab, setTab] = useState<SiteTab>(initialTab);
  const [site, setSite] = useState<Site | null>(null);
  const [permissions, setPermissions] = useState<SitePermission | null>(null);
  const [deviceCounts, setDeviceCounts] = useState<
    Array<{ category: string; status: string; _count: number }>
  >([]);
  const [loading, setLoading] = useState(true);

  const loadSite = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{
        site: Site;
        permissions: SitePermission;
        deviceCounts: Array<{ category: string; status: string; _count: number }>;
      }>(`/sites/${siteId}`);
      setSite(res.site);
      setPermissions(res.permissions);
      setDeviceCounts(res.deviceCounts);
    } catch {
      setSite(null);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    loadSite();
  }, [loadSite]);

  useEffect(() => {
    const t = searchParams.get('tab') as SiteTab | null;
    if (t) setTab(t);
  }, [searchParams]);

  if (loading) {
    return <div className="p-8 text-center text-sm text-slate-500">Loading site workspace...</div>;
  }

  if (!site || !permissions) {
    return (
      <div className="p-8 text-center text-sm text-red-600">
        Site not found or access denied.
      </div>
    );
  }

  const isIpViewer = user?.roleCode === 'IP_VIEWER';
  const canAccessSiteAgents = user?.roleCode === 'SUPER_ADMIN' || user?.roleCode === 'SITE_ADMIN';
  const siteMapUrl = getSiteGoogleMapUrl(site.location, site.googleMapUrl);
  const locationText =
    site.location && !/^https?:\/\//i.test(site.location.trim()) ? site.location : null;

  const allTabs: Array<{
    id: SiteTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    show: boolean;
  }> = [
    { id: 'overview', label: t('sites.tabOverview'), icon: LayoutGrid, show: true },
    { id: 'diagram', label: t('sites.tabDiagram'), icon: Network, show: permissions.canViewDiagram },
    { id: 'inventory', label: t('sites.tabInventory'), icon: Server, show: permissions.canViewInventory },
    { id: 'ipam', label: t('sites.tabIpam'), icon: Globe, show: permissions.canViewIpam },
    {
      id: 'access',
      label: t('sites.tabAccess'),
      icon: KeyRound,
      show: !isIpViewer && permissions.canViewCredentials,
    },
    { id: 'documents', label: t('sites.tabDocuments'), icon: FileText, show: permissions.canViewDocuments },
    { id: 'maintenance', label: t('sites.tabMaintenance'), icon: Wrench, show: permissions.canViewMaintenance },
    {
      id: 'agents',
      label: t('sites.tabAgents'),
      icon: Radio,
      show: canAccessSiteAgents,
    },
    { id: 'settings', label: t('sites.tabSettings'), icon: Settings, show: permissions.canManageSite || user?.roleCode === 'SUPER_ADMIN' },
  ];
  const tabs = allTabs.filter((tabItem) => tabItem.show);

  return (
    <div className="space-y-5">
      {/* Site Header */}
      <div className="rounded-xl bg-[#0f2942] text-white p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="px-2.5 py-0.5 rounded bg-blue-500/30 border border-blue-400/40 text-xs font-bold">
              {site.siteCode}
            </span>
            <h1 className="text-xl font-bold">{site.siteName}</h1>
            {site.hasLiveAgent && (
              <span
                title="Site Agent online & actively monitoring devices"
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-emerald-200 text-[11px] font-bold"
              >
                <span className="nims-led-core nims-led-online" aria-hidden="true" />
                Agent Live
              </span>
            )}
          </div>
          <p className="text-xs text-blue-200 mt-1">
            {[site.customerName, locationText, site.responsibleEngineer ? `Engineer: ${site.responsibleEngineer}` : null]
              .filter(Boolean)
              .join(' • ')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {siteMapUrl && (
            <a
              href={siteMapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-100 text-xs font-semibold transition"
            >
              <MapPin className="h-3.5 w-3.5" />
              {t('sites.openGoogleMap')}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <button
            onClick={() => router.push('/sites')}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium cursor-pointer"
          >
            {t('sites.allSitesBtn')}
          </button>
        </div>
      </div>

      {/* 8-Menu Site Tabs */}
      <div className="flex overflow-x-auto gap-1.5 pb-1 border-b border-slate-200 dark:border-slate-800">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-t-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                active
                  ? 'bg-white dark:bg-slate-900 text-blue-600 border border-b-0 border-slate-200 dark:border-slate-800'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Active Tab Body */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <h2 className="font-bold text-base">Site Profile</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div><span className="text-xs text-slate-500 block">Site Code</span>{site.siteCode}</div>
              <div><span className="text-xs text-slate-500 block">Site Name</span>{site.siteName}</div>
              <div><span className="text-xs text-slate-500 block">Customer</span>{site.customerName || '-'}</div>
              <div>
                <span className="text-xs text-slate-500 block">Location</span>
                {locationText || (siteMapUrl ? '-' : '-')}
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Google Map Link</span>
                {siteMapUrl ? (
                  <a
                    href={siteMapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    Open in Google Maps
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  '-'
                )}
              </div>
              <div><span className="text-xs text-slate-500 block">Contact Person</span>{site.contactPerson || '-'}</div>
              <div><span className="text-xs text-slate-500 block">Responsible Engineer</span>{site.responsibleEngineer || '-'}</div>
              <div className="sm:col-span-2"><span className="text-xs text-slate-500 block">Address</span>{site.address || '-'}</div>
              <div className="sm:col-span-2"><span className="text-xs text-slate-500 block">Description</span>{site.description || '-'}</div>
            </div>
          </div>

          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
            <h2 className="font-bold text-base">Site Summary</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Total Devices</span>
                <span className="font-bold">{site._count?.devices ?? 0}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Subnets</span>
                <span className="font-bold">{site._count?.subnets ?? 0}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Network Diagrams</span>
                <span className="font-bold">{site._count?.diagrams ?? 0}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Project Documents</span>
                <span className="font-bold">{site._count?.documents ?? 0}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-slate-500">Maintenance Logs</span>
                <span className="font-bold">{site._count?.maintenanceRecords ?? 0}</span>
              </div>
            </div>

            {deviceCounts.length > 0 && (
              <div className="pt-2 space-y-1">
                <div className="text-xs font-semibold uppercase text-slate-500">Breakdown</div>
                {deviceCounts.map((dc, i) => (
                  <div key={i} className="text-xs flex justify-between">
                    <span>{dc.category} ({dc.status})</span>
                    <span className="font-semibold">{dc._count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {permissions.canViewDiagram && site.diagrams && site.diagrams.length > 0 && (
            <div className="lg:col-span-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-base">
                  Network Diagram Previews ({site.diagrams.length})
                </h2>
                <button
                  onClick={() => setTab('diagram')}
                  className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
                >
                  Open Network Diagram Tab →
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {site.diagrams.slice(0, 10).map((d) => {
                  const thumb = getDiagramThumbnailSrc(d);
                  return (
                    <button
                      key={d.id}
                      onClick={() => setTab('diagram')}
                      className="group rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-950 text-left hover:border-blue-500 transition cursor-pointer"
                    >
                      <div className="h-28 w-full flex items-center justify-center overflow-hidden bg-slate-100 dark:bg-slate-900">
                        {thumb ? (
                          <img
                            src={thumb}
                            alt={d.title}
                            loading="lazy"
                            className="w-full h-full object-contain p-1 group-hover:scale-105 transition-transform"
                          />
                        ) : (
                          <Network className="h-7 w-7 text-blue-500" />
                        )}
                      </div>
                      <div className="px-2.5 py-1.5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                        <div className="text-xs font-semibold truncate">{d.title}</div>
                        <div className="text-[10px] text-slate-400">
                          v{d.currentVersion} • {d.fileFormat}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'diagram' && (
        <DiagramsPanel fixedSiteId={site.id} canEdit={permissions.canEditDiagram} />
      )}

      {tab === 'inventory' && (
        <InventoryPanel
          fixedSiteId={site.id}
          canEdit={permissions.canEditInventory}
          initialDeviceId={initialDeviceId}
        />
      )}

      {tab === 'ipam' && (
        <IpamPanel fixedSiteId={site.id} canEdit={permissions.canEditIpam} />
      )}

      {tab === 'access' && !isIpViewer && (
        <CredentialsPanel fixedSiteId={site.id} canEdit={permissions.canEditCredentials} />
      )}

      {tab === 'documents' && (
        <DocumentsPanel
          fixedSiteId={site.id}
          canEdit={permissions.canEditDocuments}
          canDelete={permissions.canDeleteDocuments}
        />
      )}

      {tab === 'maintenance' && (
        <MaintenancePanel siteId={site.id} canEdit={permissions.canEditMaintenance} />
      )}

      {tab === 'agents' && canAccessSiteAgents && (
        <SiteAgentsPanel
          siteId={site.id}
          siteCode={site.siteCode}
          canManage={canAccessSiteAgents}
        />
      )}

      {tab === 'settings' && (
        <SiteSettingsForm site={site} onUpdated={loadSite} />
      )}
    </div>
  );
}

function SiteSettingsForm({ site, onUpdated }: { site: Site; onUpdated: () => void }) {
  const [siteName, setSiteName] = useState(site.siteName);
  const [customerName, setCustomerName] = useState(site.customerName || '');
  const [location, setLocation] = useState(site.location || '');
  const [googleMapUrl, setGoogleMapUrl] = useState(site.googleMapUrl || '');
  const [address, setAddress] = useState(site.address || '');
  const [contactPerson, setContactPerson] = useState(site.contactPerson || '');
  const [responsibleEngineer, setResponsibleEngineer] = useState(site.responsibleEngineer || '');
  const [description, setDescription] = useState(site.description || '');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedMsg('');
    try {
      await apiFetch(`/sites/${site.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          siteName,
          customerName: customerName || null,
          location: location || null,
          googleMapUrl: googleMapUrl.trim() || null,
          address: address || null,
          contactPerson: contactPerson || null,
          responsibleEngineer: responsibleEngineer || null,
          description: description || null,
        }),
      });
      setSavedMsg('Site settings saved.');
      onUpdated();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSave}
      className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 max-w-2xl space-y-4 text-sm"
    >
      <h2 className="font-bold text-base">Site Settings ({site.siteCode})</h2>
      {savedMsg && <div className="text-xs text-emerald-600 font-semibold">{savedMsg}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Site Name</label>
          <input required value={siteName} onChange={(e) => setSiteName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Customer Name</label>
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Location</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Rayong, Thailand" className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Google Map Link</label>
          <div className="flex gap-1.5">
            <input
              type="url"
              value={googleMapUrl}
              onChange={(e) => setGoogleMapUrl(e.target.value)}
              placeholder="https://maps.google.com/... or https://maps.app.goo.gl/..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
            />
            {googleMapUrl.trim() && /^https?:\/\//i.test(googleMapUrl.trim()) && (
              <a
                href={googleMapUrl.trim()}
                target="_blank"
                rel="noopener noreferrer"
                title="Open in Google Maps"
                className="px-2.5 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 inline-flex items-center"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Contact Person</label>
          <input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Responsible Engineer</label>
          <input value={responsibleEngineer} onChange={(e) => setResponsibleEngineer(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Address</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1">Description</label>
        <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
      </div>
      <button type="submit" disabled={saving} className="px-5 py-2 rounded-lg bg-blue-600 text-white font-semibold cursor-pointer">
        {saving ? 'Saving...' : 'Save Site Settings'}
      </button>
    </form>
  );
}

'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  FileSpreadsheet,
  KeyRound,
  Lock,
  MapPin,
  Pencil,
  Plus,
  Search,
  Server,
  ShieldAlert,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  TechDeviceAllIcon,
  TechDocumentIcon,
  TechSiteNodeIcon,
  TechTopologyIcon,
} from '@/components/icons/TechIcons';
import { ConfirmActionModal } from '@/components/common/ConfirmActionModal';
import { ImportSitesModal } from '@/components/sites/ImportSitesModal';
import { apiFetch, ApiError, getSiteGoogleMapUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { CredentialItem, Device, Site } from '@/lib/types';

async function copyTextSafe(value: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = value;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

function suggestSiteCode(siteName: string, existingCodes: string[]): string {
  const used = new Set(existingCodes.map((c) => c.toUpperCase()));
  const asciiBase = siteName
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toUpperCase();

  if (asciiBase.length >= 2) {
    const base = asciiBase.slice(0, 26).replace(/-$/, '');
    const candidateBase = base.length >= 2 ? base : asciiBase.slice(0, 26);
    if (!used.has(candidateBase)) return candidateBase;
    for (let i = 2; i < 1000; i++) {
      const suffix = `-${i}`;
      const candidate = `${candidateBase.slice(0, 32 - suffix.length).replace(/-$/, '')}${suffix}`;
      if (!used.has(candidate)) return candidate;
    }
  }
  return '';
}

export default function SitesPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [sites, setSites] = useState<Site[]>([]);
  const [search, setSearch] = useState('');
  const [quickFilter, setQuickFilter] = useState<
    'ALL' | 'AGENT_LIVE' | 'HAS_DEVICES' | 'HAS_DIAGRAMS' | 'HAS_DOCS'
  >('ALL');
  const [customerFilter, setCustomerFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [sortBy, setSortBy] = useState<'CODE_ASC' | 'NAME_ASC' | 'DEVICES_DESC' | 'AGENT_FIRST'>(
    'CODE_ASC',
  );
  const [showCreate, setShowCreate] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [viewingSite, setViewingSite] = useState<Site | null>(null);
  const [showImport, setShowImport] = useState(false);

  const loadSites = useCallback(async () => {
    const res = await apiFetch<{ sites: Site[] }>('/sites');
    setSites(res.sites);
  }, []);

  useEffect(() => {
    loadSites().catch(() => {});
    const timer = setInterval(() => {
      loadSites().catch(() => {});
    }, 30000);
    return () => clearInterval(timer);
  }, [loadSites]);

  const customerOptions = useMemo(() => {
    return Array.from(
      new Set(sites.map((s) => (s.customerName || '').trim()).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b));
  }, [sites]);

  const locationOptions = useMemo(() => {
    return Array.from(
      new Set(
        sites
          .map((s) => (s.location || '').trim())
          .filter((loc) => Boolean(loc) && !/^https?:\/\//i.test(loc)),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }, [sites]);

  const liveAgentSiteCount = useMemo(
    () => sites.filter((s) => Boolean(s.hasLiveAgent)).length,
    [sites],
  );

  const filteredSites = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = sites.filter((s) => {
      if (q) {
        const haystack = [
          s.siteCode,
          s.siteName,
          s.customerName || '',
          s.location || '',
          s.responsibleEngineer || '',
          s.address || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (customerFilter && (s.customerName || '').trim() !== customerFilter) return false;
      if (locationFilter && (s.location || '').trim() !== locationFilter) return false;
      if (quickFilter === 'AGENT_LIVE' && !s.hasLiveAgent) return false;
      if (quickFilter === 'HAS_DEVICES' && (s._count?.devices ?? 0) === 0) return false;
      if (quickFilter === 'HAS_DIAGRAMS' && (s._count?.diagrams ?? 0) === 0) return false;
      if (quickFilter === 'HAS_DOCS' && (s._count?.documents ?? 0) === 0) return false;
      return true;
    });

    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sortBy === 'AGENT_FIRST') {
        const diff = Number(Boolean(b.hasLiveAgent)) - Number(Boolean(a.hasLiveAgent));
        if (diff !== 0) return diff;
      } else if (sortBy === 'DEVICES_DESC') {
        const diff = (b._count?.devices ?? 0) - (a._count?.devices ?? 0);
        if (diff !== 0) return diff;
      } else if (sortBy === 'NAME_ASC') {
        return a.siteName.localeCompare(b.siteName);
      }
      return a.siteCode.localeCompare(b.siteCode);
    });
    return sorted;
  }, [sites, search, customerFilter, locationFilter, quickFilter, sortBy]);

  const hasActiveFilters =
    Boolean(search.trim()) ||
    quickFilter !== 'ALL' ||
    Boolean(customerFilter) ||
    Boolean(locationFilter) ||
    sortBy !== 'CODE_ASC';

  const resetFilters = () => {
    setSearch('');
    setQuickFilter('ALL');
    setCustomerFilter('');
    setLocationFilter('');
    setSortBy('CODE_ASC');
  };

  const isSuperAdmin = user?.roleCode === 'SUPER_ADMIN';

  const canManageSite = (siteId: string) =>
    isSuperAdmin ||
    Boolean(user?.sitePermissions?.some((p) => p.siteId === siteId && p.canManageSite));

  const canDeleteSite = (siteId: string) =>
    isSuperAdmin || (user?.roleCode === 'SITE_ADMIN' && canManageSite(siteId));

  const [deleteTarget, setDeleteTarget] = useState<Site | null>(null);
  const [deletingSite, setDeletingSite] = useState(false);
  const [deleteSiteError, setDeleteSiteError] = useState<string | null>(null);

  const handleDeleteSite = (site: Site) => {
    setDeleteSiteError(null);
    setDeleteTarget(site);
  };

  const confirmDeleteSite = async () => {
    if (!deleteTarget) return;
    setDeletingSite(true);
    setDeleteSiteError(null);
    try {
      await apiFetch(`/sites/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      loadSites();
    } catch (err) {
      setDeleteSiteError(err instanceof ApiError ? err.message : 'Failed to delete site');
    } finally {
      setDeletingSite(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('sites.title')}</h1>
          <p className="text-sm text-[var(--nims-muted)]">{t('sites.subtitle')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/api/sites/export?format=xlsx"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--nims-border)] bg-[var(--nims-surface)] text-xs font-medium hover:opacity-90"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
            {t('common.exportExcel')}
          </a>
          {isSuperAdmin && (
            <button
              onClick={() => setShowImport(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-semibold hover:bg-blue-100 cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5" />
              {t('common.importExcelCsv')}
            </button>
          )}
          {isSuperAdmin && (
            <button
              onClick={() => setShowCreate(true)}
              style={{ backgroundColor: 'var(--nims-secondary)' }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg hover:opacity-90 text-white text-sm font-semibold cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              {t('sites.addSite')}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('sites.searchPlaceholder')}
              className="w-full pl-9 pr-8 py-2 rounded-lg border border-[var(--nims-border)] bg-[var(--nims-surface)] text-sm"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                title="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {customerOptions.length > 0 && (
            <select
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-[var(--nims-border)] bg-[var(--nims-surface)] text-xs font-medium cursor-pointer"
            >
              <option value="">All Customers ({customerOptions.length})</option>
              {customerOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}

          {locationOptions.length > 0 && (
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-[var(--nims-border)] bg-[var(--nims-surface)] text-xs font-medium cursor-pointer"
            >
              <option value="">All Locations ({locationOptions.length})</option>
              {locationOptions.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          )}

          <select
            value={sortBy}
            onChange={(e) =>
              setSortBy(
                e.target.value as 'CODE_ASC' | 'NAME_ASC' | 'DEVICES_DESC' | 'AGENT_FIRST',
              )
            }
            className="px-3 py-2 rounded-lg border border-[var(--nims-border)] bg-[var(--nims-surface)] text-xs font-medium cursor-pointer"
          >
            <option value="CODE_ASC">Sort: Site Code (A–Z)</option>
            <option value="NAME_ASC">Sort: Site Name (A–Z)</option>
            <option value="DEVICES_DESC">Sort: Most Devices</option>
            <option value="AGENT_FIRST">Sort: Agent Live First</option>
          </select>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'ALL', label: `All (${sites.length})` },
                { id: 'AGENT_LIVE', label: `Agent Live (${liveAgentSiteCount})`, liveDot: true },
                { id: 'HAS_DEVICES', label: 'Has Devices' },
                { id: 'HAS_DIAGRAMS', label: 'Has Diagrams' },
                { id: 'HAS_DOCS', label: 'Has Docs' },
              ] as const
            ).map((chip) => {
              const active = quickFilter === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setQuickFilter(chip.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition cursor-pointer ${
                    active
                      ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                      : 'bg-[var(--nims-surface)] border-[var(--nims-border)] text-[var(--nims-muted)] hover:text-[var(--nims-text)]'
                  }`}
                >
                  {'liveDot' in chip && chip.liveDot && (
                    <span
                      className={
                        liveAgentSiteCount > 0
                          ? 'nims-led-core nims-led-online'
                          : 'nims-led-core nims-led-unknown'
                      }
                      aria-hidden="true"
                    />
                  )}
                  {chip.label}
                </button>
              );
            })}
          </div>

          <div className="text-xs text-[var(--nims-muted)]">
            Showing <strong className="text-[var(--nims-text)]">{filteredSites.length}</strong> of{' '}
            {sites.length} site(s)
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredSites.length === 0 ? (
          <div className="col-span-full rounded-xl bg-[var(--nims-surface)] border border-[var(--nims-border)] p-8 text-center text-sm text-[var(--nims-muted)]">
            {t('sites.empty')}
          </div>
        ) : (
          filteredSites.map((site) => {
            const allowEdit = canManageSite(site.id);
            const allowDelete = canDeleteSite(site.id);

            return (
              <div
                key={site.id}
                className="nims-card rounded-2xl p-5 flex flex-col justify-between gap-3 group relative overflow-hidden"
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-500 via-blue-500 to-cyan-400 opacity-75 group-hover:opacity-100 transition"
                />

                <Link href={`/sites/${site.id}`} className="space-y-2.5 block">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="nims-icon-orb h-11 w-11 text-white font-mono font-bold text-xs shrink-0"
                        style={{
                          background:
                            'linear-gradient(135deg, var(--nims-primary) 0%, var(--nims-secondary) 100%)',
                        }}
                      >
                        {site.siteCode.slice(0, 4)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-base truncate group-hover:text-[var(--nims-secondary)] transition">
                          {site.siteName}
                        </div>
                        <div className="text-xs text-[var(--nims-muted)] font-mono truncate">
                          {site.siteCode} {site.customerName ? `• ${site.customerName}` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {site.hasLiveAgent && (
                        <span
                          title="Site Agent online & actively monitoring devices"
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold tracking-wide"
                        >
                          <span className="nims-led-core nims-led-online" aria-hidden="true" />
                          Agent Live
                        </span>
                      )}
                      <span className="h-8 w-8 rounded-lg bg-sky-500/10 text-sky-500 flex items-center justify-center shrink-0">
                        <TechSiteNodeIcon className="h-4 w-4" />
                      </span>
                    </div>
                  </div>

                  {(site.location || site.googleMapUrl) && (() => {
                    const mapUrl = getSiteGoogleMapUrl(site.location, site.googleMapUrl);
                    const locationIsUrl = Boolean(site.location && /^https?:\/\//i.test(site.location.trim()));
                    return (
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--nims-muted)]">
                        {site.location && !locationIsUrl && (
                          <div className="flex items-center gap-1.5 min-w-0">
                            <MapPin className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                            <span className="truncate">{site.location}</span>
                          </div>
                        )}
                        {mapUrl && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              window.open(mapUrl, '_blank', 'noopener,noreferrer');
                            }}
                            className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-2.5 py-0.5 text-[11px] font-semibold transition cursor-pointer"
                            title={mapUrl}
                          >
                            <MapPin className="h-3 w-3" />
                            Google Map
                            <ExternalLink className="h-2.5 w-2.5" />
                          </button>
                        )}
                      </div>
                    );
                  })()}

                  {site.description && (
                    <p className="text-xs text-[var(--nims-muted)] line-clamp-2">
                      {site.description}
                    </p>
                  )}

                  <div className="grid grid-cols-3 gap-2 pt-2.5 border-t border-[var(--nims-border)] text-xs">
                    <div className="flex items-center gap-1.5 text-[var(--nims-text)]">
                      <TechDeviceAllIcon className="h-3.5 w-3.5 text-blue-500" />
                      <span className="tabular-nums font-medium">{site._count?.devices ?? 0} {t('sites.devices')}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[var(--nims-text)]">
                      <TechTopologyIcon className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="tabular-nums font-medium">{site._count?.diagrams ?? 0} {t('sites.diagrams')}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[var(--nims-text)]">
                      <TechDocumentIcon className="h-3.5 w-3.5 text-amber-500" />
                      <span className="tabular-nums font-medium">{site._count?.documents ?? 0} {t('sites.docsShort')}</span>
                    </div>
                  </div>
                </Link>

                {/* Card Quick Actions */}
                <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-[var(--nims-border)] text-xs">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setViewingSite(site)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 font-semibold transition cursor-pointer"
                      title={t('sites.quickViewTitle')}
                    >
                      <Eye className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                      {t('common.view')}
                    </button>
                    <Link
                      href={`/sites/${site.id}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--nims-border)] hover:bg-slate-50 dark:hover:bg-slate-800 font-medium transition"
                    >
                      {t('common.open')}
                      <ExternalLink className="h-3 w-3 opacity-70" />
                    </Link>
                  </div>

                  {(allowEdit || allowDelete) && (
                    <div className="flex items-center gap-1">
                      {allowEdit && (
                        <button
                          type="button"
                          onClick={() => setEditingSite(site)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-medium cursor-pointer"
                          title={t('sites.editSite')}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          {t('common.edit')}
                        </button>
                      )}
                      {allowDelete && (
                        <button
                          type="button"
                          onClick={() => handleDeleteSite(site)}
                          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 cursor-pointer"
                          title={t('sites.deleteSite')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {showCreate && (
        <SiteFormModal
          mode="CREATE"
          existingCodes={sites.map((s) => s.siteCode)}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            loadSites();
          }}
        />
      )}

      {editingSite && (
        <SiteFormModal
          mode="EDIT"
          initialSite={editingSite}
          existingCodes={sites.filter((s) => s.id !== editingSite.id).map((s) => s.siteCode)}
          onClose={() => setEditingSite(null)}
          onSaved={() => {
            setEditingSite(null);
            loadSites();
          }}
        />
      )}

      {viewingSite && (
        <SiteQuickViewModal
          site={viewingSite}
          canEdit={canManageSite(viewingSite.id)}
          onClose={() => setViewingSite(null)}
          onEdit={() => {
            const target = viewingSite;
            setViewingSite(null);
            setEditingSite(target);
          }}
        />
      )}

      {showImport && (
        <ImportSitesModal
          onClose={() => setShowImport(false)}
          onImported={() => {
            setShowImport(false);
            loadSites();
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmActionModal
          title="Delete Site"
          subtitle="Permanent site removal"
          itemName={`${deleteTarget.siteCode} — ${deleteTarget.siteName}`}
          badgeText={deleteTarget.customerName || undefined}
          details={[
            ...(deleteTarget.location
              ? [{ label: 'Location', value: deleteTarget.location }]
              : []),
            ...(deleteTarget._count
              ? [
                  {
                    label: 'Contents',
                    value: `${deleteTarget._count.devices} devices • ${deleteTarget._count.diagrams} diagrams • ${deleteTarget._count.documents} docs`,
                  },
                ]
              : []),
          ]}
          message="All devices, diagrams, IP subnets, credentials, and documents inside this site will also be deleted."
          variant="danger"
          loading={deletingSite}
          error={deleteSiteError}
          onCancel={() => {
            if (!deletingSite) setDeleteTarget(null);
          }}
          onConfirm={confirmDeleteSite}
        />
      )}
    </div>
  );
}

function SiteFormModal({
  mode,
  initialSite,
  existingCodes,
  onClose,
  onSaved,
}: {
  mode: 'CREATE' | 'EDIT';
  initialSite?: Site;
  existingCodes: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const isEdit = mode === 'EDIT';
  const [siteCode, setSiteCode] = useState(initialSite?.siteCode || '');
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(isEdit);
  const [siteName, setSiteName] = useState(initialSite?.siteName || '');
  const [customerName, setCustomerName] = useState(initialSite?.customerName || '');
  const [location, setLocation] = useState(initialSite?.location || '');
  const [googleMapUrl, setGoogleMapUrl] = useState(initialSite?.googleMapUrl || '');
  const [address, setAddress] = useState(initialSite?.address || '');
  const [contactPerson, setContactPerson] = useState(initialSite?.contactPerson || '');
  const [responsibleEngineer, setResponsibleEngineer] = useState(
    initialSite?.responsibleEngineer || '',
  );
  const [description, setDescription] = useState(initialSite?.description || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSiteNameChange = (nextName: string) => {
    setSiteName(nextName);
    if (!isEdit && !codeManuallyEdited) {
      setSiteCode(suggestSiteCode(nextName, existingCodes));
    }
  };

  const handleSiteCodeChange = (val: string) => {
    setSiteCode(val);
    setCodeManuallyEdited(val.trim().length > 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = {
        siteCode: siteCode.trim() ? siteCode.trim().toUpperCase() : undefined,
        siteName: siteName.trim(),
        customerName: customerName.trim() || null,
        location: location.trim() || null,
        googleMapUrl: googleMapUrl.trim() || null,
        address: address.trim() || null,
        contactPerson: contactPerson.trim() || null,
        responsibleEngineer: responsibleEngineer.trim() || null,
        description: description.trim() || null,
      };

      if (isEdit && initialSite) {
        await apiFetch(`/sites/${initialSite.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/sites', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      onSaved();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : isEdit
            ? 'Failed to update site'
            : 'Failed to create site',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">
            {isEdit ? `${t('sites.editSitePrefix')}${initialSite?.siteCode}` : t('sites.createNewSite')}
          </h3>
          <button onClick={onClose} className="cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 text-sm">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-red-700 text-xs">
              {error}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                {t('sites.siteNameLabel')}
              </label>
              <input
                required
                placeholder={t('sites.siteNamePlaceholder')}
                value={siteName}
                onChange={(e) => handleSiteNameChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                {t('sites.siteCodeLabel')}{isEdit ? '' : t('sites.siteCodeAutoSuffix')}
              </label>
              <input
                required={isEdit}
                placeholder={t('sites.siteCodeAutoPlaceholder')}
                value={siteCode}
                onChange={(e) => handleSiteCodeChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent uppercase"
              />
            </div>
            <input
              placeholder={t('sites.customerName')}
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
            />
            <input
              placeholder={t('sites.locationPlaceholder')}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
            />
            <input
              placeholder={t('sites.contactPerson')}
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
            />
            <input
              placeholder={t('sites.responsibleEngineer')}
              value={responsibleEngineer}
              onChange={(e) => setResponsibleEngineer(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
            />
          </div>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />
            <input
              type="url"
              placeholder={t('sites.googleMapLink')}
              value={googleMapUrl}
              onChange={(e) => setGoogleMapUrl(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
            />
          </div>
          <input
            placeholder={t('sites.address')}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
          />
          <textarea
            rows={2}
            placeholder={t('sites.description')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
          />
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer"
            >
              {saving ? t('common.saving') : isEdit ? t('common.saveChanges') : t('sites.createSiteBtn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SiteQuickViewModal({
  site,
  canEdit,
  onClose,
  onEdit,
}: {
  site: Site;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  const { t } = useI18n();
  const [detail, setDetail] = useState<Site>(site);
  const [canViewCreds, setCanViewCreds] = useState<boolean>(false);
  const [credentials, setCredentials] = useState<CredentialItem[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [revealed, setRevealed] = useState<Record<string, { username: string; password: string }>>(
    {},
  );
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const siteRes = await apiFetch<{
          site: Site;
          permissions: {
            canViewCredentials: boolean;
            canViewInventory: boolean;
          };
        }>(`/sites/${site.id}`);
        if (!active) return;
        setDetail(siteRes.site);
        setCanViewCreds(Boolean(siteRes.permissions?.canViewCredentials));

        const tasks: Array<Promise<void>> = [];
        if (siteRes.permissions?.canViewCredentials) {
          tasks.push(
            apiFetch<{ credentials: CredentialItem[] }>(`/credentials?siteId=${site.id}`).then(
              (res) => {
                if (!active) return;
                const sorted = [...res.credentials].sort((a, b) => {
                  const aVpn = a.loginType === 'VPN' ? 0 : 1;
                  const bVpn = b.loginType === 'VPN' ? 0 : 1;
                  return aVpn - bVpn;
                });
                setCredentials(sorted);
              },
            ),
          );
        }
        if (siteRes.permissions?.canViewInventory) {
          tasks.push(
            apiFetch<{ devices: Device[] }>(`/devices?siteId=${site.id}&pageSize=12`).then(
              (res) => {
                if (active) setDevices(res.devices);
              },
            ),
          );
        }
        await Promise.all(tasks);
      } catch {
        // Fallback to card summary if detail fetch fails
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [site.id]);

  const handleToggleReveal = async (credId: string) => {
    if (revealed[credId]) {
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[credId];
        return next;
      });
      return;
    }
    try {
      const secret = await apiFetch<{ username: string; password: string }>(
        `/credentials/${credId}/reveal`,
        { method: 'POST' },
      );
      setRevealed((prev) => ({ ...prev, [credId]: secret }));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Unable to reveal credential');
    }
  };

  const handleCopyField = async (credId: string, field: 'username' | 'password') => {
    try {
      const res = await apiFetch<{ value: string }>(`/credentials/${credId}/copy`, {
        method: 'POST',
        body: JSON.stringify({ field }),
      });
      await copyTextSafe(res.value);
      const tag = `${credId}:${field}`;
      setCopiedKey(tag);
      setTimeout(() => setCopiedKey((prev) => (prev === tag ? null : prev)), 1500);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Copy failed');
    }
  };

  const mapUrl = getSiteGoogleMapUrl(detail.location, detail.googleMapUrl);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950/60">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="nims-icon-orb h-10 w-10 text-white font-mono font-bold text-xs shrink-0"
              style={{
                background:
                  'linear-gradient(135deg, var(--nims-primary) 0%, var(--nims-secondary) 100%)',
              }}
            >
              {detail.siteCode.slice(0, 4)}
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-base truncate">{detail.siteName}</h3>
              <div className="text-xs text-slate-500 font-mono truncate">
                {detail.siteCode}
                {detail.customerName ? ` • ${detail.customerName}` : ''}
                {detail.location && !/^https?:\/\//i.test(detail.location)
                  ? ` • ${detail.location}`
                  : ''}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {mapUrl && (
              <a
                href={mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold hover:opacity-90"
              >
                <MapPin className="h-3.5 w-3.5" />
                Google Map
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <button onClick={onClose} className="p-1 cursor-pointer">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm">
          {/* Site General Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 p-4 text-xs">
            <div>
              <div className="text-slate-400">{t('sites.customer')}</div>
              <div className="font-semibold mt-0.5">{detail.customerName || '-'}</div>
            </div>
            <div>
              <div className="text-slate-400">{t('sites.contactPerson')}</div>
              <div className="font-semibold mt-0.5">{detail.contactPerson || '-'}</div>
            </div>
            <div>
              <div className="text-slate-400">{t('sites.responsibleEngineer')}</div>
              <div className="font-semibold mt-0.5">{detail.responsibleEngineer || '-'}</div>
            </div>
            <div>
              <div className="text-slate-400">{t('sites.address')}</div>
              <div className="font-semibold mt-0.5">{detail.address || '-'}</div>
            </div>
            {detail.description && (
              <div className="sm:col-span-2 md:col-span-4 pt-2 border-t border-slate-200 dark:border-slate-700">
                <span className="text-slate-400 mr-2">{t('sites.notes')}</span>
                <span>{detail.description}</span>
              </div>
            )}
          </div>

          {/* VPN & Access Credentials */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-blue-600" />
                {t('sites.vpnAndCredentials')} ({canViewCreds ? credentials.length : t('sites.restricted')})
              </h4>
              {canViewCreds && credentials.length > 0 && (
                <Link
                  href={`/sites/${detail.id}`}
                  className="text-xs text-blue-600 hover:underline font-medium"
                >
                  {t('sites.manageInAccessMgmt')}
                </Link>
              )}
            </div>

            {loading ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 text-xs text-slate-500">
                {t('sites.loadingAccess')}
              </div>
            ) : !canViewCreds ? (
              <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
                <Lock className="h-4 w-4 shrink-0" />
                <span>{t('sites.noCredPermission')}</span>
              </div>
            ) : credentials.length === 0 ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 text-xs text-slate-500 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-slate-400" />
                <span>{t('sites.noCredRecorded')}</span>
              </div>
            ) : (
              <div className="space-y-2.5">
                {credentials.map((cred) => {
                  const sec = revealed[cred.id];
                  const isVpn = cred.loginType === 'VPN';
                  return (
                    <div
                      key={cred.id}
                      className={`rounded-xl border p-3.5 text-xs space-y-2 ${
                        isVpn
                          ? 'border-blue-300 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/20'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                              isVpn
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            {cred.loginType}
                          </span>
                          <span className="font-bold text-sm">{cred.deviceName}</span>
                          {cred.managementIp && (
                            <span className="font-mono text-slate-500">
                              {cred.managementIp}
                              {cred.port ? `:${cred.port}` : ''}
                            </span>
                          )}
                          {cred.accessMethod && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px]">
                              {cred.accessMethod}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleToggleReveal(cred.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 font-semibold cursor-pointer"
                        >
                          {sec ? (
                            <>
                              <EyeOff className="h-3.5 w-3.5" />
                              {t('common.hide')}
                            </>
                          ) : (
                            <>
                              <Eye className="h-3.5 w-3.5 text-blue-600" />
                              {t('sites.showUserPass')}
                            </>
                          )}
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 border border-slate-200 dark:border-slate-800">
                          <div className="min-w-0">
                            <span className="text-slate-400 mr-1.5">User:</span>
                            <span className="font-mono font-semibold break-all">
                              {sec ? sec.username : cred.usernameMasked}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopyField(cred.id, 'username')}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 text-[11px] shrink-0 cursor-pointer"
                          >
                            {copiedKey === `${cred.id}:username` ? (
                              <>
                                <Check className="h-3 w-3 text-emerald-600" />
                                {t('common.copied')}
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                {t('common.copy')}
                              </>
                            )}
                          </button>
                        </div>

                        <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 border border-slate-200 dark:border-slate-800">
                          <div className="min-w-0">
                            <span className="text-slate-400 mr-1.5">Pass:</span>
                            <span className="font-mono font-semibold break-all">
                              {sec ? sec.password : cred.passwordMasked}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopyField(cred.id, 'password')}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 text-[11px] shrink-0 cursor-pointer"
                          >
                            {copiedKey === `${cred.id}:password` ? (
                              <>
                                <Check className="h-3 w-3 text-emerald-600" />
                                {t('common.copied')}
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                {t('common.copy')}
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {(cred.url || cred.remark) && (
                        <div className="flex flex-wrap gap-3 text-[11px] text-slate-600 dark:text-slate-300">
                          {cred.url && (
                            <a
                              href={cred.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline inline-flex items-center gap-1"
                            >
                              {cred.url}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          {cred.remark && <span>Remark: {cred.remark}</span>}
                        </div>
                      )}

                      {cred.instructions && cred.instructions.length > 0 && (
                        <div className="pt-1.5 border-t border-slate-200/70 dark:border-slate-800 space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                          {cred.instructions.map((ins) => (
                            <div key={ins.id}>
                              <span className="font-semibold">{ins.title}:</span> {ins.howToConnect}
                              {ins.notes ? ` (${ins.notes})` : ''}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Devices Snapshot */}
          {devices.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-bold text-sm flex items-center gap-2">
                <Server className="h-4 w-4 text-emerald-600" />
                {t('sites.siteDevices')} ({detail._count?.devices ?? devices.length})
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {devices.map((d) => (
                  <div
                    key={d.id}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{d.name}</div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {d.category} {d.model ? `• ${d.model}` : ''}
                      </div>
                    </div>
                    <div className="text-right shrink-0 font-mono text-[11px]">
                      {d.managementIp || '-'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex flex-wrap items-center justify-between gap-2">
          {canEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
            >
              <Pencil className="h-3.5 w-3.5 text-blue-600" />
              {t('sites.editSiteInfo')}
            </button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs cursor-pointer"
            >
              {t('common.close')}
            </button>
            <Link
              href={`/sites/${detail.id}`}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
            >
              {t('sites.openFullWorkspace')}
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

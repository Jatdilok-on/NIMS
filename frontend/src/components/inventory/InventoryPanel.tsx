'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  Download,
  Edit,
  Eye,
  FileSpreadsheet,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { getDeviceLedClass, isDeviceAgentLive } from '@/lib/deviceTelemetry';
import { Device, DeviceCategory, DeviceStatus, Site } from '@/lib/types';
import { DeviceCategoryTechIcon, TechDeviceAllIcon } from '@/components/icons/TechIcons';
import { SearchInputWithClear, SiteQuickPills } from '@/components/common/SiteFilterBar';
import { ImportWizardModal } from './ImportWizardModal';

interface InventoryPanelProps {
  fixedSiteId?: string;
  canEdit?: boolean;
  initialDeviceId?: string | null;
  initialSiteId?: string | null;
  initialCategory?: string | null;
  initialStatus?: string | null;
}

const VALID_STATUSES = new Set<string>(['ONLINE', 'OFFLINE', 'MAINTENANCE', 'UNKNOWN']);

const CATEGORY_LABELS: Record<DeviceCategory, string> = {
  SWITCH: 'Switch',
  ACCESS_POINT: 'Access Point',
  AP_CLIENT: 'AP Client',
  WLC: 'WLC Controller',
  SERVER: 'Server',
  PLC: 'PLC',
  ESXI: 'ESXi Host',
  VM: 'Virtual Machine',
  NAS: 'NAS Storage',
  UPS: 'UPS',
  IP_CAM: 'IP Camera',
  PC: 'PC / Workstation',
  NVR: 'NVR Recorder',
  TV: 'TV / Display',
  PRINTER: 'Printer',
  BARCODE: 'Barcode Scanner',
  HANDHELD: 'Handheld Terminal / PDA',
};

const STATUS_BADGE: Record<DeviceStatus, string> = {
  ONLINE:
    'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:bg-emerald-950/60 dark:border-emerald-500/35 dark:text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.12)]',
  OFFLINE:
    'bg-red-500/10 border-red-500/35 text-red-700 dark:bg-red-950/60 dark:border-red-500/40 dark:text-red-300 shadow-[0_0_12px_rgba(239,68,68,0.15)]',
  MAINTENANCE:
    'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:bg-amber-950/60 dark:border-amber-500/35 dark:text-amber-300',
  UNKNOWN:
    'bg-slate-500/10 border-slate-400/30 text-slate-600 dark:bg-slate-800/80 dark:border-slate-700 dark:text-slate-300',
};

function DeviceStatusPill({
  status,
  live = false,
  canEdit = false,
  onChange,
}: {
  status: DeviceStatus;
  live?: boolean;
  canEdit?: boolean;
  onChange?: (next: DeviceStatus) => void;
}) {
  const ledClass = getDeviceLedClass(status, live);
  const pillContent = (
    <span
      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-[11px] font-bold tracking-wide transition ${STATUS_BADGE[status]}`}
    >
      <span className={ledClass} aria-hidden="true" />
      <span>{status}</span>
      {canEdit && <ChevronDown className="h-3 w-3 opacity-60" />}
    </span>
  );

  if (!canEdit || !onChange) {
    return pillContent;
  }

  return (
    <div className="relative inline-flex items-center" title="Click to change status">
      {pillContent}
      <select
        value={status}
        aria-label="Device status"
        onChange={(e) => onChange(e.target.value as DeviceStatus)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      >
        <option value="ONLINE">ONLINE</option>
        <option value="OFFLINE">OFFLINE</option>
        <option value="MAINTENANCE">MAINTENANCE</option>
        <option value="UNKNOWN">UNKNOWN</option>
      </select>
    </div>
  );
}

export function InventoryPanel({
  fixedSiteId,
  canEdit = true,
  initialDeviceId,
  initialSiteId,
  initialCategory,
  initialStatus,
}: InventoryPanelProps) {
  const normalizedInitialCategory =
    initialCategory && initialCategory in CATEGORY_LABELS ? initialCategory : '';
  const normalizedInitialStatus =
    initialStatus && VALID_STATUSES.has(initialStatus) ? initialStatus : '';

  const { t } = useI18n();
  const [sites, setSites] = useState<Site[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<'20' | '50' | '100' | 'all'>('50');
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const [siteFilter, setSiteFilter] = useState(fixedSiteId || initialSiteId || '');
  const [categoryFilter, setCategoryFilter] = useState<string>(normalizedInitialCategory);
  const [statusFilter, setStatusFilter] = useState<string>(normalizedInitialStatus);
  const [search, setSearch] = useState('');
  const [vlanFilter, setVlanFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [sortBy, setSortBy] = useState('itemNo');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<
    { mode: 'SINGLE'; device: Device } | { mode: 'BULK'; count: number } | null
  >(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkCategory, setBulkCategory] = useState<DeviceCategory>('SWITCH');
  const [bulkStatus, setBulkStatus] = useState<DeviceStatus>('ONLINE');
  const [applyingBulk, setApplyingBulk] = useState(false);

  useEffect(() => {
    if (fixedSiteId) {
      setSiteFilter(fixedSiteId);
    } else if (initialSiteId !== undefined) {
      setSiteFilter(initialSiteId || '');
    }
    if (initialCategory !== undefined) {
      setCategoryFilter(initialCategory && initialCategory in CATEGORY_LABELS ? initialCategory : '');
    }
    if (initialStatus !== undefined) {
      setStatusFilter(initialStatus && VALID_STATUSES.has(initialStatus) ? initialStatus : '');
    }
    setPage(1);
  }, [fixedSiteId, initialSiteId, initialCategory, initialStatus]);

  useEffect(() => {
    apiFetch<{ sites: Site[] }>('/sites')
      .then((res) => setSites(res.sites))
      .catch(() => {});
  }, []);

  const loadDevices = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fixedSiteId || siteFilter) params.set('siteId', fixedSiteId || siteFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());
      if (vlanFilter.trim()) params.set('vlan', vlanFilter.trim());
      if (locationFilter.trim()) params.set('location', locationFilter.trim());
      params.set('page', pageSize === 'all' ? '1' : String(page));
      params.set('pageSize', pageSize);
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);

      const res = await apiFetch<{
        devices: Device[];
        pagination: { total: number; totalPages: number };
      }>(`/devices?${params.toString()}`);
      setDevices(res.devices);
      setTotal(res.pagination.total);
      setTotalPages(res.pagination.totalPages);
    } catch {
      if (!silent) setDevices([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [
    fixedSiteId,
    siteFilter,
    categoryFilter,
    statusFilter,
    search,
    vlanFilter,
    locationFilter,
    page,
    pageSize,
    sortBy,
    sortOrder,
  ]);

  useEffect(() => {
    loadDevices();
    const timer = setInterval(() => {
      loadDevices(true).catch(() => {});
    }, 10000);
    return () => clearInterval(timer);
  }, [loadDevices]);

  useEffect(() => {
    if (initialDeviceId) {
      apiFetch<{ device: Device }>(`/devices/${initialDeviceId}`)
        .then((res) => setSelectedDevice(res.device))
        .catch(() => {});
    }
  }, [initialDeviceId]);

  const handleDelete = (dev: Device) => {
    setDeleteError('');
    setDeleteTarget({ mode: 'SINGLE', device: dev });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      if (deleteTarget.mode === 'SINGLE') {
        await apiFetch(`/devices/${deleteTarget.device.id}`, { method: 'DELETE' });
        setSelectedIds((prev) => prev.filter((id) => id !== deleteTarget.device.id));
      } else {
        await apiFetch('/devices/bulk-delete', {
          method: 'POST',
          body: JSON.stringify({ deviceIds: selectedIds }),
        });
        setSelectedIds([]);
      }
      setDeleteTarget(null);
      await loadDevices();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const handleQuickStatusChange = async (dev: Device, nextStatus: DeviceStatus) => {
    if (dev.status === nextStatus) return;
    try {
      await apiFetch(`/devices/${dev.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus }),
      });
      setDevices((prev) =>
        prev.map((d) => (d.id === dev.id ? { ...d, status: nextStatus } : d)),
      );
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Status update failed');
    }
  };

  const handleBulkUpdate = async (patch: { category?: DeviceCategory; status?: DeviceStatus }) => {
    if (selectedIds.length === 0) return;
    setApplyingBulk(true);
    try {
      await apiFetch('/devices/bulk', {
        method: 'PUT',
        body: JSON.stringify({ deviceIds: selectedIds, ...patch }),
      });
      setSelectedIds([]);
      await loadDevices();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Bulk update failed');
    } finally {
      setApplyingBulk(false);
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    setDeleteError('');
    setDeleteTarget({ mode: 'BULK', count: selectedIds.length });
  };

  const allShownSelected =
    devices.length > 0 && devices.every((d) => selectedIds.includes(d.id));

  const handleExport = (format: 'xlsx' | 'csv' | 'pdf') => {
    const params = new URLSearchParams({ format });
    if (fixedSiteId || siteFilter) params.set('siteId', fixedSiteId || siteFilter);
    if (categoryFilter) params.set('category', categoryFilter);
    window.open(`/api/inventory/export?${params.toString()}`, '_blank');
  };

  const toggleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  return (
    <div className="space-y-4">
      {/* Category Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {[
            { value: '', label: t('inventory.allDevices') },
            { value: 'SWITCH', label: 'Switches' },
            { value: 'ACCESS_POINT', label: 'Access Points' },
            { value: 'AP_CLIENT', label: 'AP Clients' },
            { value: 'WLC', label: 'WLC' },
            { value: 'SERVER', label: 'Servers' },
            { value: 'PLC', label: 'PLC' },
            { value: 'ESXI', label: 'ESXi' },
            { value: 'VM', label: 'VM' },
            { value: 'NAS', label: 'NAS' },
            { value: 'UPS', label: 'UPS' },
            { value: 'IP_CAM', label: 'IP Cameras' },
            { value: 'PC', label: 'PC' },
            { value: 'NVR', label: 'NVR' },
            { value: 'TV', label: 'TV' },
            { value: 'PRINTER', label: 'Printer' },
            { value: 'BARCODE', label: 'Barcode' },
            { value: 'HANDHELD', label: 'Handheld' },
          ].map((tab) => {
            const active = categoryFilter === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => {
                  setCategoryFilter(tab.value);
                  setPage(1);
                }}
                style={
                  active
                    ? {
                        background:
                          'linear-gradient(135deg, var(--nims-primary) 0%, var(--nims-secondary) 100%)',
                        boxShadow: '0 4px 14px -4px var(--nims-glow)',
                      }
                    : undefined
                }
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  active
                    ? 'text-white'
                    : 'bg-[var(--nims-surface)] border border-[var(--nims-border)] hover:border-[var(--nims-secondary)]'
                }`}
              >
                {tab.value ? (
                  <DeviceCategoryTechIcon category={tab.value} className="h-3.5 w-3.5" />
                ) : (
                  <TechDeviceAllIcon className="h-3.5 w-3.5" />
                )}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleExport('xlsx')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium hover:bg-slate-50 cursor-pointer"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
            Excel
          </button>
          <button
            onClick={() => handleExport('csv')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium hover:bg-slate-50 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 text-blue-600" />
            CSV
          </button>
          <button
            onClick={() => handleExport('pdf')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium hover:bg-slate-50 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 text-red-600" />
            PDF
          </button>

          {canEdit && (
            <>
              <button
                onClick={() => setShowImportModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-600 text-blue-600 dark:text-blue-400 text-xs font-semibold hover:bg-blue-50 dark:hover:bg-blue-950/50 cursor-pointer"
              >
                <Upload className="h-3.5 w-3.5" />
                {t('common.importExcelCsv')}
              </button>
              <button
                onClick={() => {
                  setEditingDevice(null);
                  setShowAddModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                {t('inventory.addDevice')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filters Bar */}
      <div className="space-y-2.5 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
          <SearchInputWithClear
            value={search}
            onChange={(val) => {
              setSearch(val);
              setPage(1);
            }}
            placeholder={t('inventory.searchPlaceholder')}
            className="lg:col-span-2"
          />
          {!fixedSiteId && (
            <select
              value={siteFilter}
              onChange={(e) => {
                setSiteFilter(e.target.value);
                setPage(1);
              }}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm cursor-pointer"
            >
              <option value="">{t('common.allSites')}</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.siteCode} — {s.siteName}
                </option>
              ))}
            </select>
          )}
          <input
            type="text"
            value={vlanFilter}
            onChange={(e) => {
              setVlanFilter(e.target.value);
              setPage(1);
            }}
            placeholder="Filter VLAN..."
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
          />
          <input
            type="text"
            value={locationFilter}
            onChange={(e) => {
              setLocationFilter(e.target.value);
              setPage(1);
            }}
            placeholder="Filter Location..."
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
          />
          <div className="flex items-center gap-1.5">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm cursor-pointer"
            >
              <option value="">All Status</option>
              <option value="ONLINE">Online</option>
              <option value="OFFLINE">Offline</option>
              <option value="MAINTENANCE">Maintenance</option>
              <option value="UNKNOWN">Unknown</option>
            </select>
            {(search || siteFilter || categoryFilter || statusFilter || vlanFilter || locationFilter) && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setSiteFilter('');
                  setCategoryFilter('');
                  setStatusFilter('');
                  setVlanFilter('');
                  setLocationFilter('');
                  setPage(1);
                }}
                title="ล้างตัวกรองทั้งหมด"
                className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {!fixedSiteId && sites.length > 1 && (
          <SiteQuickPills
            sites={sites}
            value={siteFilter}
            onChange={(nextSite) => {
              setSiteFilter(nextSite);
              setPage(1);
            }}
            allLabel="ทุก Site"
            hideEmptySites={false}
          />
        )}
      </div>

      {/* Bulk Edit Bar for Super Admin / Site Admin / Network Engineer */}
      {canEdit && selectedIds.length > 0 && (
        <div className="rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="font-semibold text-blue-900 dark:text-blue-200">
            Selected {selectedIds.length} device(s)
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1">
              <select
                value={bulkCategory}
                onChange={(e) => setBulkCategory(e.target.value as DeviceCategory)}
                className="bg-transparent font-medium outline-none"
              >
                {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={applyingBulk}
                onClick={() => handleBulkUpdate({ category: bulkCategory })}
                className="px-2.5 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer disabled:opacity-50"
              >
                Set Type
              </button>
            </div>

            <div className="inline-flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1">
              <select
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value as DeviceStatus)}
                className="bg-transparent font-medium outline-none"
              >
                <option value="ONLINE">ONLINE</option>
                <option value="OFFLINE">OFFLINE</option>
                <option value="MAINTENANCE">MAINTENANCE</option>
                <option value="UNKNOWN">UNKNOWN</option>
              </select>
              <button
                type="button"
                disabled={applyingBulk}
                onClick={() => handleBulkUpdate({ status: bulkStatus })}
                className="px-2.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer disabled:opacity-50"
              >
                Set Status
              </button>
            </div>

            <button
              type="button"
              disabled={applyingBulk}
              onClick={handleBulkDelete}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete ({selectedIds.length})
            </button>

            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="px-2 py-1 text-slate-500 hover:text-slate-700 cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Desktop Table */}
      <div className="hidden md:block rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/70 text-left text-xs uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
                {canEdit && (
                  <th className="pl-4 pr-1 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={allShownSelected}
                      onChange={(e) => {
                        const shown = devices.map((d) => d.id);
                        if (e.target.checked) {
                          setSelectedIds((prev) => Array.from(new Set([...prev, ...shown])));
                        } else {
                          const setShown = new Set(shown);
                          setSelectedIds((prev) => prev.filter((id) => !setShown.has(id)));
                        }
                      }}
                    />
                  </th>
                )}
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort('itemNo')}>
                  No. {sortBy === 'itemNo' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                </th>
                {!fixedSiteId && <th className="px-4 py-3">Site</th>}
                <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('category')}>
                  Type
                </th>
                <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('name')}>
                  Device Name
                </th>
                <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('model')}>
                  Model / Vendor
                </th>
                <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('managementIp')}>
                  Management IP
                </th>
                <th className="px-4 py-3">MAC / SN</th>
                <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('vlan')}>
                  VLAN
                </th>
                <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('location')}>
                  Location
                </th>
                <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('status')}>
                  {t('common.status')}
                </th>
                <th className="px-4 py-3 text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-slate-500">
                    {t('inventory.loading')}
                  </td>
                </tr>
              ) : devices.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-slate-500">
                    {t('inventory.empty')}
                  </td>
                </tr>
              ) : (
                devices.map((dev, idx) => (
                  <tr
                    key={dev.id}
                    className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition ${
                      selectedIds.includes(dev.id) ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
                    }`}
                  >
                    {canEdit && (
                      <td className="pl-4 pr-1 py-2.5">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(dev.id)}
                          onChange={(e) =>
                            setSelectedIds((prev) =>
                              e.target.checked
                                ? [...prev, dev.id]
                                : prev.filter((id) => id !== dev.id),
                            )
                          }
                        />
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-slate-500">
                      {dev.itemNo ??
                        (pageSize === 'all'
                          ? idx + 1
                          : (page - 1) * Number(pageSize) + idx + 1)}
                    </td>
                    {!fixedSiteId && (
                      <td className="px-4 py-2.5">
                        <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs font-semibold">
                          {dev.site?.siteCode}
                        </span>
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-xs font-medium">
                      <span className="inline-flex items-center gap-2">
                        <span className="h-7 w-7 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                          <DeviceCategoryTechIcon category={dev.category} className="h-4 w-4" />
                        </span>
                        <span>{CATEGORY_LABELS[dev.category]}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-semibold">
                      <button
                        onClick={() => setSelectedDevice(dev)}
                        className="text-left hover:text-blue-600 cursor-pointer"
                      >
                        {dev.name}
                      </button>
                    </td>
                    <td className="px-4 py-2.5">
                      <div>{dev.model || '-'}</div>
                      <div className="text-xs text-slate-500">{dev.vendor || ''}</div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">{dev.managementIp || '-'}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      <div>{dev.macAddress || '-'}</div>
                      <div className="text-[11px] text-slate-500">{dev.serialNumber || ''}</div>
                    </td>
                    <td className="px-4 py-2.5 text-xs">{dev.vlan || '-'}</td>
                    <td className="px-4 py-2.5 text-xs">{dev.location || '-'}</td>
                    <td className="px-4 py-2.5">
                      <DeviceStatusPill
                        status={dev.status}
                        live={isDeviceAgentLive(dev)}
                        canEdit={canEdit}
                        onChange={(nextStatus) => handleQuickStatusChange(dev, nextStatus)}
                      />
                      {dev.monitorEnabled === false && (
                        <div className="text-[10px] font-medium text-slate-400 mt-1">
                          Agent Ping: OFF
                        </div>
                      )}
                      {dev.lastPingAt && (
                        <div className="text-[10px] font-mono text-slate-400 mt-1">
                          {dev.lastLatencyMs != null
                            ? `${dev.lastLatencyMs}ms`
                            : dev.status !== 'OFFLINE' && (dev.consecutiveMisses ?? 0) > 0
                            ? `Miss (${dev.consecutiveMisses})`
                            : 'No reply'}
                          {' • '}
                          {new Date(dev.lastPingAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button
                        onClick={() => setSelectedDevice(dev)}
                        title={t('common.viewDetails')}
                        className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      {canEdit && (
                        <>
                          <button
                            onClick={() => {
                              setEditingDevice(dev);
                              setShowAddModal(true);
                            }}
                            title={t('common.edit')}
                            className="p-1.5 rounded hover:bg-blue-50 text-blue-600 cursor-pointer"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(dev)}
                            title={t('common.delete')}
                            className="p-1.5 rounded hover:bg-red-50 text-red-600 cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {devices.map((dev) => (
          <div
            key={dev.id}
            onClick={() => setSelectedDevice(dev)}
            className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold text-sm">{dev.name}</div>
                <div className="text-xs text-slate-500">
                  {CATEGORY_LABELS[dev.category]} • {dev.model || 'Unknown model'}
                </div>
              </div>
              <DeviceStatusPill status={dev.status} live={isDeviceAgentLive(dev)} />
            </div>
            <div className="grid grid-cols-2 gap-1 text-xs text-slate-600 dark:text-slate-400">
              <div>IP: <span className="font-mono">{dev.managementIp || '-'}</span></div>
              <div>VLAN: {dev.vlan || '-'}</div>
              <div>MAC: <span className="font-mono">{dev.macAddress || '-'}</span></div>
              <div>Loc: {dev.location || '-'}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <div className="flex flex-wrap items-center gap-3">
          <span>
            Total: <strong>{total}</strong> devices
          </span>
          <div className="inline-flex items-center gap-1.5">
            <span>Rows / Page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(e.target.value as '20' | '50' | '100' | 'all');
                setPage(1);
              }}
              className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="all">All ({total})</option>
            </select>
            {pageSize !== 'all' && total > Number(pageSize) && (
              <button
                type="button"
                onClick={() => {
                  setPageSize('all');
                  setPage(1);
                }}
                className="px-2.5 py-1 rounded bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-semibold hover:bg-blue-100 cursor-pointer"
              >
                Show All on 1 Page
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled={page <= 1 || pageSize === 'all'}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
          >
            Previous
          </button>
          <span>
            Page {pageSize === 'all' ? 1 : page} / {pageSize === 'all' ? 1 : totalPages}
          </span>
          <button
            disabled={page >= totalPages || pageSize === 'all'}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
          >
            Next
          </button>
        </div>
      </div>

      {/* View Device Detail Modal */}
      {selectedDevice && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <h3 className="font-bold text-lg">{selectedDevice.name}</h3>
                  <p className="text-xs text-slate-500">
                    {selectedDevice.site?.siteCode} • {CATEGORY_LABELS[selectedDevice.category]}
                  </p>
                </div>
                <DeviceStatusPill status={selectedDevice.status} live={isDeviceAgentLive(selectedDevice)} />
              </div>
              <div className="flex items-center gap-2">
                {canEdit && (
                  <>
                    <button
                      onClick={() => {
                        const target = selectedDevice;
                        setSelectedDevice(null);
                        setEditingDevice(target);
                        setShowAddModal(true);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                    >
                      <Edit className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        const target = selectedDevice;
                        setSelectedDevice(null);
                        handleDelete(target);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </>
                )}
                <button
                  onClick={() => setSelectedDevice(null)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-xs text-slate-500 block">Vendor</span>{selectedDevice.vendor || '-'}</div>
                <div><span className="text-xs text-slate-500 block">Model</span>{selectedDevice.model || '-'}</div>
                <div><span className="text-xs text-slate-500 block">Management IP</span><span className="font-mono">{selectedDevice.managementIp || '-'}</span></div>
                <div><span className="text-xs text-slate-500 block">VLAN</span>{selectedDevice.vlan || '-'}</div>
                <div><span className="text-xs text-slate-500 block">MAC Address</span><span className="font-mono">{selectedDevice.macAddress || '-'}</span></div>
                <div><span className="text-xs text-slate-500 block">Serial Number</span><span className="font-mono">{selectedDevice.serialNumber || '-'}</span></div>
                <div><span className="text-xs text-slate-500 block">Location</span>{selectedDevice.location || '-'}</div>
                <div><span className="text-xs text-slate-500 block">Responsible Person</span>{selectedDevice.responsiblePerson || '-'}</div>
              </div>

              {/* Subtype Details */}
              {(selectedDevice.switchDetail ||
                selectedDevice.accessPointDetail ||
                selectedDevice.apClientDetail ||
                selectedDevice.controllerDetail ||
                selectedDevice.serverDetail) && (
                <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                  <div className="text-xs font-semibold uppercase text-slate-500 mb-2">
                    Category Specifications
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 text-xs">
                    {Object.entries(
                      (selectedDevice.switchDetail ||
                        selectedDevice.accessPointDetail ||
                        selectedDevice.apClientDetail ||
                        selectedDevice.controllerDetail ||
                        selectedDevice.serverDetail) as Record<string, unknown>,
                    )
                      .filter(([k, v]) => k !== 'id' && k !== 'deviceId' && v !== null && v !== '')
                      .map(([k, v]) => (
                        <div key={k} className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded">
                          <span className="text-slate-500 block capitalize">
                            {k.replace(/([A-Z])/g, ' $1')}
                          </span>
                          <span className="font-medium">{String(v)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {selectedDevice.remark && (
                <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
                  <span className="text-xs text-slate-500 block">Remark</span>
                  <p className="mt-1">{selectedDevice.remark}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base">
                    {deleteTarget.mode === 'SINGLE'
                      ? 'Confirm Delete Device'
                      : `Delete ${deleteTarget.count} Selected Devices`}
                  </h3>
                  <p className="text-xs text-slate-500">
                    This action cannot be undone and will release linked IPAM allocations.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-sm">
              {deleteError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                  {deleteError}
                </div>
              )}

              {deleteTarget.mode === 'SINGLE' ? (
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-4 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-sm text-slate-900 dark:text-white">
                      {deleteTarget.device.name}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-semibold">
                      {deleteTarget.device.site?.siteCode || '-'} •{' '}
                      {CATEGORY_LABELS[deleteTarget.device.category]}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1 text-slate-600 dark:text-slate-300">
                    <div>
                      <span className="text-slate-400 block">Management IP</span>
                      <span className="font-mono font-semibold">
                        {deleteTarget.device.managementIp || '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Location</span>
                      <span>{deleteTarget.device.location || '-'}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl bg-red-50/70 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-4 text-xs text-red-800 dark:text-red-200">
                  You are about to permanently delete <strong>{deleteTarget.count}</strong> selected
                  device(s) and release any IPAM addresses allocated to them.
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={confirmDelete}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm font-semibold cursor-pointer disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" />
                  {deleting ? 'Deleting...' : t('common.delete')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Device Modal */}
      {showAddModal && (
        <DeviceFormModal
          sites={sites}
          fixedSiteId={fixedSiteId}
          editing={editingDevice}
          onClose={() => setShowAddModal(false)}
          onSaved={() => {
            setShowAddModal(false);
            loadDevices();
          }}
        />
      )}

      {/* Excel Import Wizard */}
      {showImportModal && (
        <ImportWizardModal
          sites={sites}
          fixedSiteId={fixedSiteId}
          onClose={() => setShowImportModal(false)}
          onImported={() => {
            setShowImportModal(false);
            loadDevices();
          }}
        />
      )}
    </div>
  );
}

function DeviceFormModal({
  sites,
  fixedSiteId,
  editing,
  onClose,
  onSaved,
}: {
  sites: Site[];
  fixedSiteId?: string;
  editing: Device | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [siteId, setSiteId] = useState(editing?.siteId || fixedSiteId || sites[0]?.id || '');
  const [category, setCategory] = useState<DeviceCategory>(editing?.category || 'SWITCH');
  const [name, setName] = useState(editing?.name || '');
  const [vendor, setVendor] = useState(editing?.vendor || '');
  const [model, setModel] = useState(editing?.model || '');
  const [macAddress, setMacAddress] = useState(editing?.macAddress || '');
  const [serialNumber, setSerialNumber] = useState(editing?.serialNumber || '');
  const [managementIp, setManagementIp] = useState(editing?.managementIp || '');
  const [vlan, setVlan] = useState(editing?.vlan || '');
  const [location, setLocation] = useState(editing?.location || '');
  const [status, setStatus] = useState<DeviceStatus>(editing?.status || 'UNKNOWN');
  const [monitorEnabled, setMonitorEnabled] = useState<boolean>(
    editing ? editing.monitorEnabled !== false : true,
  );
  const [responsiblePerson, setResponsiblePerson] = useState(editing?.responsiblePerson || '');
  const [remark, setRemark] = useState(editing?.remark || '');

  // Subtype fields
  const sw = (editing?.switchDetail || {}) as Record<string, string | number | undefined>;
  const ap = (editing?.accessPointDetail || {}) as Record<string, string | undefined>;
  const cl = (editing?.apClientDetail || {}) as Record<string, string | undefined>;
  const wl = (editing?.controllerDetail || {}) as Record<string, string | number | undefined>;
  const sv = (editing?.serverDetail || {}) as Record<string, string | undefined>;

  const [rack, setRack] = useState(String(sw.rack || sv.rack || ''));
  const [floor, setFloor] = useState(String(sw.floor || ap.floor || ''));
  const [portCount, setPortCount] = useState(sw.portCount ? String(sw.portCount) : '');
  const [firmwareVersion, setFirmwareVersion] = useState(String(sw.firmwareVersion || ''));
  const [ssid, setSsid] = useState(String(ap.ssid || cl.ssid || ''));
  const [channel, setChannel] = useState(String(ap.channel || ''));
  const [frequency, setFrequency] = useState(String(ap.frequency || cl.frequency || ''));
  const [controller, setController] = useState(String(ap.controller || ''));
  const [connectedAp, setConnectedAp] = useState(String(cl.connectedAp || ''));
  const [wirelessMode, setWirelessMode] = useState(String(cl.wirelessMode || ''));
  const [connectedDevice, setConnectedDevice] = useState(String(cl.connectedDevice || ''));
  const [controllerVersion, setControllerVersion] = useState(String(wl.controllerVersion || ''));
  const [managedApCount, setManagedApCount] = useState(wl.managedApCount ? String(wl.managedApCount) : '');
  const [hostname, setHostname] = useState(String(sv.hostname || ''));
  const [productionIp, setProductionIp] = useState(String(sv.productionIp || ''));
  const [operatingSystem, setOperatingSystem] = useState(String(sv.operatingSystem || ''));
  const [cpu, setCpu] = useState(String(sv.cpu || ''));
  const [ram, setRam] = useState(String(sv.ram || ''));
  const [storage, setStorage] = useState(String(sv.storage || ''));
  const [hypervisor, setHypervisor] = useState(String(sv.hypervisor || ''));
  const [serviceApplication, setServiceApplication] = useState(String(sv.serviceApplication || ''));

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        siteId,
        category,
        name,
        vendor: vendor || null,
        model: model || null,
        macAddress: macAddress || null,
        serialNumber: serialNumber || null,
        managementIp: managementIp || null,
        vlan: vlan || null,
        location: location || null,
        status,
        monitorEnabled,
        responsiblePerson: responsiblePerson || null,
        remark: remark || null,
      };

      if (category === 'SWITCH') {
        payload.switchDetail = {
          managementVlan: vlan || null,
          rack: rack || null,
          floor: floor || null,
          portCount: portCount ? parseInt(portCount, 10) : null,
          firmwareVersion: firmwareVersion || null,
        };
      } else if (category === 'ACCESS_POINT') {
        payload.accessPointDetail = {
          ssid: ssid || null,
          channel: channel || null,
          frequency: frequency || null,
          floor: floor || null,
          controller: controller || null,
        };
      } else if (category === 'AP_CLIENT') {
        payload.apClientDetail = {
          connectedAp: connectedAp || null,
          wirelessMode: wirelessMode || null,
          ssid: ssid || null,
          frequency: frequency || null,
          connectedDevice: connectedDevice || null,
        };
      } else if (category === 'WLC') {
        payload.controllerDetail = {
          controllerVersion: controllerVersion || null,
          managedApCount: managedApCount ? parseInt(managedApCount, 10) : null,
        };
      } else if (['SERVER', 'ESXI', 'VM', 'NAS', 'PC', 'NVR'].includes(category)) {
        payload.serverDetail = {
          hostname: hostname || null,
          manufacturer: vendor || null,
          productionIp: productionIp || null,
          operatingSystem: operatingSystem || null,
          cpu: cpu || null,
          ram: ram || null,
          storage: storage || null,
          hypervisor: hypervisor || null,
          serviceApplication: serviceApplication || null,
          rack: rack || null,
        };
      }

      if (editing) {
        await apiFetch(`/devices/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/devices', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save device');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto border border-slate-200 dark:border-slate-800 shadow-2xl">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-lg">{editing ? 'Edit Device' : 'Add Network Device'}</h3>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-sm">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-red-700 text-xs">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {!fixedSiteId && (
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Site *</label>
                <select
                  required
                  disabled={Boolean(editing)}
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

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Device Type *</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as DeviceCategory)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="SWITCH">Switch</option>
                <option value="ACCESS_POINT">Access Point</option>
                <option value="AP_CLIENT">AP Client / Wireless Bridge</option>
                <option value="WLC">Wireless Controller (WLC)</option>
                <option value="SERVER">Server</option>
                <option value="PLC">PLC / Industrial Controller</option>
                <option value="ESXI">ESXi / Hypervisor Host</option>
                <option value="VM">Virtual Machine (VM)</option>
                <option value="NAS">NAS / Network Storage</option>
                <option value="UPS">UPS / Backup Power</option>
                <option value="IP_CAM">IP Camera (CCTV)</option>
                <option value="PC">PC / Workstation</option>
                <option value="NVR">NVR Recorder</option>
                <option value="TV">TV / Display</option>
                <option value="PRINTER">Printer</option>
                <option value="BARCODE">Barcode Scanner</option>
                <option value="HANDHELD">Handheld Terminal / PDA</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Device Name *</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. BTV-SW-CORE-01"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Vendor</label>
              <input
                list="vendor-suggestions"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="Cisco, Aruba, Huawei, MikroTik..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
              />
              <datalist id="vendor-suggestions">
                <option value="Cisco" />
                <option value="Aruba" />
                <option value="Huawei" />
                <option value="TP-Link" />
                <option value="Ubiquiti" />
                <option value="MikroTik" />
                <option value="Siemens" />
                <option value="Mitsubishi" />
                <option value="Omron" />
                <option value="Allen-Bradley" />
                <option value="VMware" />
                <option value="Synology" />
                <option value="QNAP" />
                <option value="APC" />
                <option value="Eaton" />
                <option value="Vertiv" />
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Model</label>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Management IP</label>
              <input
                value={managementIp}
                onChange={(e) => setManagementIp(e.target.value)}
                placeholder="172.28.7.10"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">MAC Address</label>
              <input
                value={macAddress}
                onChange={(e) => setMacAddress(e.target.value)}
                placeholder="AA:BB:CC:DD:EE:FF"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Serial Number</label>
              <input
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">VLAN</label>
              <input
                value={vlan}
                onChange={(e) => setVlan(e.target.value)}
                placeholder="1211"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Location</label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as DeviceStatus)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="UNKNOWN">Unknown</option>
                <option value="MAINTENANCE">Maintenance</option>
                <option value="ONLINE">Online (Agent Ping)</option>
                <option value="OFFLINE">Offline (Agent Ping)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Responsible Person</label>
              <input
                value={responsiblePerson}
                onChange={(e) => setResponsiblePerson(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 px-3 py-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={monitorEnabled}
                  onChange={(e) => setMonitorEnabled(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300"
                />
                <div className="text-xs leading-relaxed">
                  <div className="font-semibold text-slate-800 dark:text-slate-100">
                    เปิดใช้งาน Site Agent Ping อัตโนมัติ (Agent Monitoring)
                  </div>
                  <div className="text-slate-500 dark:text-slate-400">
                    หากปิดไว้, ไม่มี Management IP, หรือ Site ยังไม่มี Agent ออนไลน์ ระบบจะแสดงสถานะเป็น <strong>UNKNOWN</strong> โดยอัตโนมัติ (ยกเว้น <code>MAINTENANCE</code>)
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Subtype Specific Inputs */}
          {category === 'SWITCH' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <input placeholder="Rack" value={rack} onChange={(e) => setRack(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
              <input placeholder="Floor" value={floor} onChange={(e) => setFloor(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
              <input type="number" placeholder="Port Count" value={portCount} onChange={(e) => setPortCount(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
              <input placeholder="Firmware Version" value={firmwareVersion} onChange={(e) => setFirmwareVersion(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
            </div>
          )}

          {category === 'ACCESS_POINT' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <input placeholder="SSID" value={ssid} onChange={(e) => setSsid(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
              <input placeholder="Channel" value={channel} onChange={(e) => setChannel(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
              <input placeholder="Frequency (2.4/5GHz)" value={frequency} onChange={(e) => setFrequency(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
              <input placeholder="Floor" value={floor} onChange={(e) => setFloor(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
              <input placeholder="Controller" value={controller} onChange={(e) => setController(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
            </div>
          )}

          {category === 'AP_CLIENT' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <input placeholder="Connected AP" value={connectedAp} onChange={(e) => setConnectedAp(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
              <input placeholder="Wireless Mode (Station/Bridge)" value={wirelessMode} onChange={(e) => setWirelessMode(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
              <input placeholder="SSID" value={ssid} onChange={(e) => setSsid(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
              <input placeholder="Frequency" value={frequency} onChange={(e) => setFrequency(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
              <input placeholder="Connected Device" value={connectedDevice} onChange={(e) => setConnectedDevice(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
            </div>
          )}

          {category === 'WLC' && (
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <input placeholder="Controller Version" value={controllerVersion} onChange={(e) => setControllerVersion(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
              <input type="number" placeholder="Managed AP Count" value={managedApCount} onChange={(e) => setManagedApCount(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
            </div>
          )}

          {['SERVER', 'ESXI', 'VM', 'NAS', 'PC', 'NVR'].includes(category) && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <input placeholder="Hostname" value={hostname} onChange={(e) => setHostname(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
              <input placeholder="Production IP" value={productionIp} onChange={(e) => setProductionIp(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-mono" />
              <input placeholder="Operating System" value={operatingSystem} onChange={(e) => setOperatingSystem(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
              <input placeholder="CPU" value={cpu} onChange={(e) => setCpu(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
              <input placeholder="RAM" value={ram} onChange={(e) => setRam(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
              <input placeholder="Storage" value={storage} onChange={(e) => setStorage(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
              <input placeholder="Hypervisor" value={hypervisor} onChange={(e) => setHypervisor(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
              <input placeholder="Service / App" value={serviceApplication} onChange={(e) => setServiceApplication(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
              <input placeholder="Rack" value={rack} onChange={(e) => setRack(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Remark</label>
            <textarea
              rows={2}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Device'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

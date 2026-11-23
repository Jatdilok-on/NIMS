'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Wrench, X } from 'lucide-react';
import { ConfirmActionModal } from '@/components/common/ConfirmActionModal';
import { SearchInputWithClear } from '@/components/common/SiteFilterBar';
import { apiFetch, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

interface MaintenanceItem {
  id: string;
  title: string;
  maintenanceType: string;
  status: string;
  performedAt: string;
  nextScheduledAt?: string | null;
  engineerName?: string | null;
  summary: string;
  findings?: string | null;
  actionsTaken?: string | null;
  device?: { id: string; name: string } | null;
}

export function MaintenancePanel({
  siteId,
  canEdit = true,
}: {
  siteId: string;
  canEdit?: boolean;
}) {
  const { t } = useI18n();
  const [records, setRecords] = useState<MaintenanceItem[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MaintenanceItem | null>(null);
  const [deletingRecord, setDeletingRecord] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadRecords = useCallback(async () => {
    const res = await apiFetch<{ records: MaintenanceItem[] }>(`/maintenance?siteId=${siteId}`);
    setRecords(res.records);
  }, [siteId]);

  useEffect(() => {
    loadRecords().catch(() => {});
  }, [loadRecords]);

  const handleDelete = (item: MaintenanceItem) => {
    setDeleteError(null);
    setDeleteTarget(item);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeletingRecord(true);
    setDeleteError(null);
    try {
      await apiFetch(`/maintenance/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      loadRecords();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Failed to delete maintenance record');
    } finally {
      setDeletingRecord(false);
    }
  };

  const typeOptions = useMemo(
    () => Array.from(new Set(records.map((r) => r.maintenanceType).filter(Boolean))),
    [records],
  );

  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      if (typeFilter && r.maintenanceType !== typeFilter) return false;
      if (!q) return true;
      const hay = [
        r.title,
        r.maintenanceType,
        r.summary,
        r.findings || '',
        r.actionsTaken || '',
        r.engineerName || '',
        r.device?.name || '',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [records, search, typeFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-base">{t('maint.title')}</h3>
          <p className="text-xs text-slate-500">
            {t('maint.subtitle')}
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            {t('maint.addBtn')}
          </button>
        )}
      </div>

      {records.length > 0 && (
        <div className="flex flex-wrap items-center gap-2.5 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
          <SearchInputWithClear
            value={search}
            onChange={setSearch}
            placeholder="ค้นหาหัวข้องานซ่อมบำรุง, อุปกรณ์, อาการ หรือชื่อช่าง..."
            className="flex-1 min-w-[220px]"
          />
          {typeOptions.length > 1 && (
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              aria-label="Filter maintenance type"
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold cursor-pointer"
            >
              <option value="">ทุกประเภท ({records.length})</option>
              {typeOptions.map((tp) => (
                <option key={tp} value={tp}>
                  {tp}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="space-y-3">
        {records.length === 0 ? (
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-500">
            {t('maint.empty')}
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-500">
            ไม่พบประวัติการบำรุงรักษาที่ตรงกับคำค้นหา
          </div>
        ) : (
          filteredRecords.map((r) => (
            <div
              key={r.id}
              className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 flex items-start justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-amber-600" />
                  <span className="font-bold text-sm">{r.title}</span>
                  <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold">
                    {r.maintenanceType}
                  </span>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300">{r.summary}</p>
                {r.actionsTaken && (
                  <p className="text-xs text-slate-500">
                    {t('maint.actionsPrefix')} {r.actionsTaken}
                  </p>
                )}
                <div className="text-xs text-slate-400">
                  {t('maint.dateLabel')} {new Date(r.performedAt).toLocaleDateString()} •{' '}
                  {t('maint.engineerLabel')} {r.engineerName || '-'}
                  {r.device ? ` • ${t('maint.deviceLabel')} ${r.device.name}` : ''}
                </div>
              </div>
              {canEdit && (
                <button
                  onClick={() => handleDelete(r)}
                  className="p-1.5 rounded hover:bg-red-50 text-red-600 cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {showModal && (
        <AddMaintenanceModal
          siteId={siteId}
          onClose={() => setShowModal(false)}
          onCreated={() => {
            setShowModal(false);
            loadRecords();
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmActionModal
          title={t('maint.deleteTitle')}
          subtitle={t('maint.deleteSubtitle')}
          itemName={deleteTarget.title}
          badgeText={deleteTarget.maintenanceType}
          details={[
            ...(deleteTarget.device
              ? [{ label: t('maint.deviceLabel'), value: deleteTarget.device.name }]
              : []),
            ...(deleteTarget.engineerName
              ? [{ label: t('maint.engineerLabel'), value: deleteTarget.engineerName }]
              : []),
          ]}
          message={t('maint.deleteConfirm')}
          variant="danger"
          loading={deletingRecord}
          error={deleteError}
          onCancel={() => {
            if (!deletingRecord) setDeleteTarget(null);
          }}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

function AddMaintenanceModal({
  siteId,
  onClose,
  onCreated,
}: {
  siteId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [maintenanceType, setMaintenanceType] = useState('PREVENTIVE');
  const [summary, setSummary] = useState('');
  const [actionsTaken, setActionsTaken] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/maintenance', {
        method: 'POST',
        body: JSON.stringify({
          siteId,
          title,
          maintenanceType,
          summary,
          actionsTaken: actionsTaken || null,
        }),
      });
      onCreated();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to save record');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base">{t('maint.modalTitle')}</h3>
          <button onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 text-sm">
          <input
            required
            placeholder="Title (e.g. Core Switch Firmware Upgrade)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
          />
          <select
            value={maintenanceType}
            onChange={(e) => setMaintenanceType(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
          >
            <option value="PREVENTIVE">Preventive</option>
            <option value="CORRECTIVE">Corrective</option>
            <option value="FIRMWARE_UPGRADE">Firmware Upgrade</option>
            <option value="HARDWARE_REPLACEMENT">Hardware Replacement</option>
            <option value="INSPECTION">Inspection</option>
            <option value="EMERGENCY">Emergency</option>
          </select>
          <textarea
            required
            rows={3}
            placeholder="Summary of work performed"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
          />
          <textarea
            rows={2}
            placeholder="Actions taken / resolution"
            value={actionsTaken}
            onChange={(e) => setActionsTaken(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border cursor-pointer">
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold cursor-pointer"
            >
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

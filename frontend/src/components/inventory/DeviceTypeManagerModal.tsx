'use client';

import React, { useState } from 'react';
import { Pencil, Plus, Shield, Tag, Trash2, X } from 'lucide-react';
import { DEVICE_ICON_OPTIONS, DeviceCategoryTechIcon } from '@/components/icons/TechIcons';
import { apiFetch, ApiError } from '@/lib/api';
import { DeviceTypeItem } from '@/lib/types';

function toCodeDraft(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^A-Z0-9_]/g, '')
    .replace(/^_+|_+$/g, '');
}

export function DeviceTypeManagerModal({
  deviceTypes,
  onClose,
  onUpdated,
}: {
  deviceTypes: DeviceTypeItem[];
  onClose: () => void;
  onUpdated: () => Promise<void> | void;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeEditedManually, setCodeEditedManually] = useState(false);
  const [iconKey, setIconKey] = useState('HANDHELD');
  const [description, setDescription] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setCode('');
    setCodeEditedManually(false);
    setIconKey('HANDHELD');
    setDescription('');
    setError('');
  };

  const handleStartEdit = (dt: DeviceTypeItem) => {
    setEditingId(dt.id);
    setName(dt.name);
    setCode(dt.code);
    setCodeEditedManually(true);
    setIconKey(dt.iconKey || dt.code);
    setDescription(dt.description || '');
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError('');
    setSaving(true);
    try {
      if (editingId) {
        await apiFetch(`/devices/types/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || null,
            iconKey: iconKey || null,
          }),
        });
      } else {
        await apiFetch('/devices/types', {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            code: code.trim() ? toCodeDraft(code) : undefined,
            description: description.trim() || null,
            iconKey: iconKey || null,
          }),
        });
      }
      resetForm();
      await onUpdated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save device type');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (dt: DeviceTypeItem) => {
    setError('');
    setDeletingId(dt.id);
    try {
      await apiFetch(`/devices/types/${dt.id}`, { method: 'DELETE' });
      if (editingId === dt.id) resetForm();
      await onUpdated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete device type');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="h-9 w-9 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Tag className="h-4.5 w-4.5" />
            </span>
            <div>
              <h3 className="text-base font-bold">Manage Device Types</h3>
              <p className="text-xs text-slate-500">
                Add or customize device categories available across Inventory, Import & Diagrams (Admin / Super Admin)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5 text-sm">
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-3 py-2 text-xs">
              {error}
            </div>
          )}

          {/* Create / Edit Form */}
          <form
            onSubmit={handleSubmit}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                {editingId ? 'Edit Device Type' : 'Add Custom Device Type'}
              </span>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs text-blue-600 hover:underline cursor-pointer"
                >
                  Cancel edit
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  Display Name *
                </label>
                <input
                  required
                  value={name}
                  onChange={(e) => {
                    const nextName = e.target.value;
                    setName(nextName);
                    if (!editingId && !codeEditedManually) {
                      setCode(toCodeDraft(nextName));
                    }
                  }}
                  placeholder="e.g. RFID Reader, Forklift Terminal"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  Category Code *
                </label>
                <input
                  required
                  disabled={Boolean(editingId)}
                  value={code}
                  onChange={(e) => {
                    setCodeEditedManually(true);
                    setCode(toCodeDraft(e.target.value));
                  }}
                  placeholder="e.g. RFID_READER"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  Visual Icon
                </label>
                <div className="flex items-center gap-2">
                  <span className="h-9 w-9 shrink-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center text-blue-600 dark:text-blue-400">
                    <DeviceCategoryTechIcon category={code || iconKey} iconKey={iconKey} className="h-4.5 w-4.5" />
                  </span>
                  <select
                    value={iconKey}
                    onChange={(e) => setIconKey(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  >
                    {DEVICE_ICON_OPTIONS.map((opt) => (
                      <option key={opt.key} value={opt.key}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  Description (Optional)
                </label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Short description of devices in this category..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50 shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Device Type'}
              </button>
            </div>
          </form>

          {/* Existing Device Types Table */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Type</th>
                  <th className="text-left px-3 py-2 font-semibold">Code</th>
                  <th className="text-left px-3 py-2 font-semibold">Devices</th>
                  <th className="text-left px-3 py-2 font-semibold">Kind</th>
                  <th className="text-right px-3 py-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {deviceTypes.map((dt) => {
                  const count = dt._count?.devices ?? 0;
                  return (
                    <tr key={dt.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 shrink-0">
                            <DeviceCategoryTechIcon
                              category={dt.code}
                              iconKey={dt.iconKey}
                              className="h-4 w-4"
                            />
                          </span>
                          <div>
                            <div className="font-semibold text-slate-800 dark:text-slate-100">
                              {dt.name}
                            </div>
                            {dt.description && (
                              <div className="text-[11px] text-slate-500 line-clamp-1">
                                {dt.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                        {dt.code}
                      </td>
                      <td className="px-3 py-2 font-mono">{count}</td>
                      <td className="px-3 py-2">
                        {dt.isSystem ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-semibold">
                            <Shield className="h-2.5 w-2.5" />
                            System
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-semibold">
                            Custom
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(dt)}
                            title="Edit device type"
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          {!dt.isSystem && (
                            <button
                              type="button"
                              disabled={deletingId === dt.id || count > 0}
                              onClick={() => handleDelete(dt)}
                              title={
                                count > 0
                                  ? `In use by ${count} device(s)`
                                  : 'Delete custom device type'
                              }
                              className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/50 text-red-600 disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, X } from 'lucide-react';
import { apiFetch, apiUploadWithProgress, ApiError } from '@/lib/api';
import { FileDropzone } from '@/components/common/FileDropzone';
import { DeviceCategory, Site } from '@/lib/types';

interface PreviewRow {
  rowNumber: number;
  raw: Record<string, string>;
  resolvedSiteId?: string | null;
  resolvedSiteCode?: string | null;
  resolvedCategory?: DeviceCategory | null;
  status: 'READY' | 'DUPLICATE' | 'INVALID';
  issues: string[];
}

const DEVICE_CATEGORY_OPTIONS: Array<{ value: DeviceCategory; label: string }> = [
  { value: 'SWITCH', label: 'Switch' },
  { value: 'ACCESS_POINT', label: 'Access Point' },
  { value: 'AP_CLIENT', label: 'AP Client / Wireless Bridge' },
  { value: 'WLC', label: 'WLC Controller' },
  { value: 'SERVER', label: 'Server' },
  { value: 'PLC', label: 'PLC' },
  { value: 'ESXI', label: 'VMware ESXi Host' },
  { value: 'VM', label: 'Virtual Machine (VM)' },
  { value: 'NAS', label: 'NAS Storage' },
  { value: 'UPS', label: 'UPS' },
  { value: 'IP_CAM', label: 'IP Camera (CCTV)' },
  { value: 'PC', label: 'PC / Workstation' },
  { value: 'NVR', label: 'NVR Recorder' },
  { value: 'TV', label: 'TV / Display' },
  { value: 'PRINTER', label: 'Printer' },
  { value: 'BARCODE', label: 'Barcode Scanner' },
  { value: 'HANDHELD', label: 'Handheld Terminal / PDA' },
];

const TARGET_FIELDS = [
  { value: '', label: '-- Ignore --' },
  { value: 'site', label: 'Target Site (Site / Site Code)' },
  { value: 'itemNo', label: 'No.' },
  { value: 'category', label: 'Inventory Type (Type / Category)' },
  { value: 'name', label: 'Device Name (NAME)' },
  { value: 'model', label: 'Model' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'macAddress', label: 'MAC Address' },
  { value: 'serialNumber', label: 'Serial Number (SN)' },
  { value: 'managementIp', label: 'Management IP' },
  { value: 'vlan', label: 'VLAN' },
  { value: 'location', label: 'Location' },
  { value: 'status', label: 'Status' },
  { value: 'responsiblePerson', label: 'Responsible Person' },
  { value: 'remark', label: 'Remark' },
  { value: 'rack', label: 'Rack' },
  { value: 'floor', label: 'Floor' },
  { value: 'ssid', label: 'SSID' },
  { value: 'connectedAp', label: 'Connected AP' },
  { value: 'hostname', label: 'Hostname' },
  { value: 'operatingSystem', label: 'Operating System' },
];

function inferCategoryClient(rawVal: string | undefined, fallback: DeviceCategory): DeviceCategory {
  const s = (rawVal || '').trim().toLowerCase();
  if (!s) return fallback;
  const upper = s.toUpperCase().replace(/[\s-]+/g, '_');
  if (DEVICE_CATEGORY_OPTIONS.some((o) => o.value === upper)) return upper as DeviceCategory;
  if (s.includes('ap client') || s.includes('ap_client') || s.includes('bridge') || s.includes('cpe')) return 'AP_CLIENT';
  if (s.includes('access point') || s === 'ap') return 'ACCESS_POINT';
  if (s.includes('cam') || s.includes('cctv')) return 'IP_CAM';
  if (s.includes('nvr') || s.includes('recorder')) return 'NVR';
  if (s === 'pc' || s.includes('workstation') || s.includes('desktop')) return 'PC';
  if (s === 'tv' || s.includes('smart tv') || s.includes('television') || s.includes('signage')) return 'TV';
  if (s.includes('printer') || s === 'prt' || s.includes('เครื่องพิมพ์')) return 'PRINTER';
  if (s.includes('handheld') || s === 'pda' || s.includes('rf scanner') || s.includes('แฮนด์เฮลด์')) return 'HANDHELD';
  if (s.includes('barcode') || s.includes('scanner') || s.includes('บาร์โค้ด')) return 'BARCODE';
  if (s.includes('wlc') || s.includes('wireless controller')) return 'WLC';
  if (s.includes('esxi') || s.includes('vmware') || s.includes('hypervisor')) return 'ESXI';
  if (s === 'vm' || s.includes('virtual machine')) return 'VM';
  if (s.includes('server') || s === 'svr') return 'SERVER';
  if (s.includes('plc')) return 'PLC';
  if (s.includes('nas') || s.includes('storage')) return 'NAS';
  if (s.includes('ups')) return 'UPS';
  if (s.includes('switch') || s === 'sw') return 'SWITCH';
  return fallback;
}

function inferSiteClient(rawVal: string | undefined, sites: Site[], fallbackSiteId: string): string {
  const s = (rawVal || '').trim().toLowerCase();
  if (!s) return fallbackSiteId;
  const matched = sites.find(
    (site) => site.siteCode.toLowerCase() === s || site.siteName.toLowerCase() === s,
  );
  return matched ? matched.id : fallbackSiteId;
}

export function ImportWizardModal({
  sites,
  fixedSiteId,
  onClose,
  onImported,
}: {
  sites: Site[];
  fixedSiteId?: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [step, setStep] = useState<'UPLOAD' | 'PREVIEW' | 'SUMMARY'>('UPLOAD');
  const [siteId, setSiteId] = useState(fixedSiteId || 'AUTO');
  const [fallbackSiteId, setFallbackSiteId] = useState(fixedSiteId || sites[0]?.id || '');
  const [category, setCategory] = useState<'AUTO' | DeviceCategory>('AUTO');
  const [fallbackCategory, setFallbackCategory] = useState<DeviceCategory>('SWITCH');
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [defaultVlan, setDefaultVlan] = useState('');
  const [detectedSiteCode, setDetectedSiteCode] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [rowCategories, setRowCategories] = useState<DeviceCategory[]>([]);
  const [rowSites, setRowSites] = useState<string[]>([]);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [summary, setSummary] = useState<{
    totalRows: number;
    importedCount: number;
    skippedDuplicates: number;
    errorCount: number;
    errors: Array<{ rowIndex: number; name?: string; error: string }>;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState('');

  const effectiveFallbackSiteId = fixedSiteId || fallbackSiteId || sites[0]?.id || '';

  const handlePreview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !siteId) return;
    setError('');
    setLoading(true);
    setUploadProgress(0);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('siteId', siteId);
      if (siteId === 'AUTO' && effectiveFallbackSiteId) {
        formData.append('fallbackSiteId', effectiveFallbackSiteId);
      }
      formData.append('category', category);
      formData.append('fallbackCategory', category === 'AUTO' ? fallbackCategory : category);

      const res = await apiUploadWithProgress<{
        headers: string[];
        suggestedMapping: Record<string, string>;
        detectedVlan?: string;
        detectedSiteId?: string | null;
        detectedSiteCode?: string | null;
        previewRows: PreviewRow[];
      }>('/inventory/import/preview', formData, (pct) => {
        setUploadProgress(pct);
      });

      const resolvedFallback = category === 'AUTO' ? fallbackCategory : category;
      const fallbackSite = res.detectedSiteId || effectiveFallbackSiteId;
      setHeaders(res.headers);
      setColumnMapping(res.suggestedMapping);
      setDefaultVlan(res.detectedVlan || '');
      setDetectedSiteCode(res.detectedSiteCode || null);
      setPreviewRows(res.previewRows);
      setRowCategories(res.previewRows.map((r) => r.resolvedCategory || resolvedFallback));
      setRowSites(
        res.previewRows.map(
          (r) => r.resolvedSiteId || (siteId === 'AUTO' ? fallbackSite : siteId),
        ),
      );
      setStep('PREVIEW');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to parse spreadsheet');
    } finally {
      setLoading(false);
      setUploadProgress(null);
    }
  };

  const handleColumnMappingChange = (header: string, nextTarget: string) => {
    const nextMap = { ...columnMapping, [header]: nextTarget };
    setColumnMapping(nextMap);

    if (nextTarget === 'category') {
      const resolvedFallback = category === 'AUTO' ? fallbackCategory : category;
      setRowCategories(
        previewRows.map((r) => inferCategoryClient(r.raw[header], resolvedFallback)),
      );
    } else if (nextTarget === 'site') {
      setRowSites(
        previewRows.map((r) => inferSiteClient(r.raw[header], sites, effectiveFallbackSiteId)),
      );
    }
  };

  const handleConfirm = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch<{
        totalRows: number;
        importedCount: number;
        skippedDuplicates: number;
        errorCount: number;
        errors: Array<{ rowIndex: number; name?: string; error: string }>;
      }>('/inventory/import/confirm', {
        method: 'POST',
        body: JSON.stringify({
          siteId,
          ...(siteId === 'AUTO' && effectiveFallbackSiteId
            ? { fallbackSiteId: effectiveFallbackSiteId }
            : {}),
          category,
          fallbackCategory: category === 'AUTO' ? fallbackCategory : category,
          columnMapping,
          defaultVlan: defaultVlan || undefined,
          skipDuplicates,
          rows: previewRows.map((r) => r.raw),
          rowCategories,
          ...(siteId === 'AUTO' ? { rowSites } : {}),
        }),
      });
      setSummary(res);
      setStep('SUMMARY');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-5xl w-full max-h-[92vh] overflow-y-auto border border-slate-200 dark:border-slate-800 shadow-2xl">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            <h3 className="font-bold text-lg">Import Inventory from Excel / CSV</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-100 cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 text-sm">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-red-700 text-xs">
              {error}
            </div>
          )}

          {step === 'UPLOAD' && (
            <form onSubmit={handlePreview} className="space-y-4">
              {/* Sample Template Download Bar */}
              <div className="rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <div className="font-semibold text-blue-900 dark:text-blue-200">
                    Sample Import File (All 16 Device Types)
                  </div>
                  <div className="text-[11px] text-blue-700/80 dark:text-blue-300/80">
                    Includes Switch, AP, AP Client, WLC, Server, PLC, ESXi, VM, NAS, UPS, IP_CAM, PC, NVR, TV, PRINTER, and BARCODE
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href="/api/inventory/import/template?format=xlsx"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-semibold hover:bg-blue-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Sample Excel (.xlsx)
                  </a>
                  <a
                    href="/api/inventory/import/template?format=csv"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-medium hover:bg-slate-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Sample CSV
                  </a>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {!fixedSiteId && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">
                        Target Site Mode *
                      </label>
                      <select
                        required
                        value={siteId}
                        onChange={(e) => setSiteId(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                      >
                        <option value="AUTO">
                          Auto-Detect from File (&quot;Site&quot; Column or Filename)
                        </option>
                        {sites.map((s) => (
                          <option key={s.id} value={s.id}>
                            Fixed Site: {s.siteCode} — {s.siteName}
                          </option>
                        ))}
                      </select>
                    </div>

                    {siteId === 'AUTO' && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">
                          Fallback Site (if file has no &quot;Site&quot; value)
                        </label>
                        <select
                          value={effectiveFallbackSiteId}
                          onChange={(e) => setFallbackSiteId(e.target.value)}
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
                  </>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">
                    Inventory Type Mode *
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as 'AUTO' | DeviceCategory)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option value="AUTO">
                      Auto-Detect per Row (Use &quot;Type&quot; Column — Mixed Devices)
                    </option>
                    {DEVICE_CATEGORY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        Fixed / Default: {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {category === 'AUTO' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">
                      Fallback Type (if row has no &quot;Type&quot; column)
                    </label>
                    <select
                      value={fallbackCategory}
                      onChange={(e) => setFallbackCategory(e.target.value as DeviceCategory)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                    >
                      {DEVICE_CATEGORY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                  Spreadsheet File (.xlsx, .csv) *
                </label>
                <FileDropzone
                  variant="spreadsheet"
                  accept=".xlsx,.xls,.csv"
                  files={file ? [file] : []}
                  onFilesSelected={(picked) => setFile(picked[0] || null)}
                  onRemoveFile={() => setFile(null)}
                  progress={uploadProgress}
                  progressLabel="Uploading & analyzing spreadsheet..."
                  title="Drop inventory Excel or CSV file here"
                  subtitle="Click the icon or drag & drop to start column mapping"
                  hint="Supports mixed device types via Type / Category column, or assign types per row in Preview"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !file}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50 cursor-pointer"
                >
                  {loading ? `Uploading ${uploadProgress ?? 0}%...` : 'Next: Map & Preview'}
                </button>
              </div>
            </form>
          )}

          {step === 'PREVIEW' && (
            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold text-xs uppercase text-slate-600 dark:text-slate-300">
                      Column Mapping ({previewRows.length} rows detected)
                    </div>
                    {detectedSiteCode && siteId === 'AUTO' && (
                      <span className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold">
                        Filename Site Detected: {detectedSiteCode}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    {!fixedSiteId && siteId === 'AUTO' && (
                      <div className="flex items-center gap-1.5">
                        <span>Set All Rows Site:</span>
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            if (!e.target.value) return;
                            const chosen = e.target.value;
                            setRowSites(previewRows.map(() => chosen));
                          }}
                          className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                        >
                          <option value="">-- Change all --</option>
                          {sites.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.siteCode} — {s.siteName}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <span>Set All Rows Type:</span>
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          if (!e.target.value) return;
                          const chosen = e.target.value as DeviceCategory;
                          setRowCategories(previewRows.map(() => chosen));
                        }}
                        className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      >
                        <option value="">-- Change all --</option>
                        {DEVICE_CATEGORY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span>Default VLAN:</span>
                      <input
                        value={defaultVlan}
                        onChange={(e) => setDefaultVlan(e.target.value)}
                        placeholder="e.g. 1211"
                        className="w-24 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {headers.map((h) => (
                    <div key={h} className="flex items-center gap-2 text-xs">
                      <span className="font-mono bg-white dark:bg-slate-900 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 truncate w-1/2">
                        {h}
                      </span>
                      <select
                        value={columnMapping[h] || ''}
                        onChange={(e) => handleColumnMappingChange(h, e.target.value)}
                        className="w-1/2 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      >
                        {TARGET_FIELDS.map((tf) => (
                          <option key={tf.value} value={tf.value}>
                            {tf.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="max-h-72 overflow-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2 text-left">Row</th>
                      {!fixedSiteId && (
                        <th className="px-3 py-2 text-left">Target Site</th>
                      )}
                      <th className="px-3 py-2 text-left">Inventory Type</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      {headers.slice(0, 5).map((h) => (
                        <th key={h} className="px-3 py-2 text-left">
                          {h}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-left">Validation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {previewRows.slice(0, 100).map((r, idx) => (
                      <tr key={r.rowNumber}>
                        <td className="px-3 py-2">{r.rowNumber}</td>
                        {!fixedSiteId && (
                          <td className="px-3 py-2">
                            {siteId === 'AUTO' ? (
                              <select
                                value={rowSites[idx] || ''}
                                onChange={(e) => {
                                  const nextSite = e.target.value;
                                  setRowSites((prev) =>
                                    prev.map((sId, j) => (j === idx ? nextSite : sId)),
                                  );
                                }}
                                className="px-2 py-1 rounded border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/40 font-semibold text-emerald-700 dark:text-emerald-300"
                              >
                                <option value="">-- Select Site --</option>
                                {sites.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.siteCode}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-semibold">
                                {sites.find((s) => s.id === siteId)?.siteCode || '-'}
                              </span>
                            )}
                          </td>
                        )}
                        <td className="px-3 py-2">
                          <select
                            value={rowCategories[idx] || 'SWITCH'}
                            onChange={(e) => {
                              const nextCat = e.target.value as DeviceCategory;
                              setRowCategories((prev) =>
                                prev.map((c, j) => (j === idx ? nextCat : c)),
                              );
                            }}
                            className="px-2 py-1 rounded border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/40 font-semibold text-blue-700 dark:text-blue-300"
                          >
                            {DEVICE_CATEGORY_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`px-2 py-0.5 rounded-full font-medium ${
                              r.status === 'READY'
                                ? 'bg-emerald-50 text-emerald-700'
                                : r.status === 'DUPLICATE'
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'bg-red-50 text-red-700'
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                        {headers.slice(0, 5).map((h) => (
                          <td key={h} className="px-3 py-2">
                            {r.raw[h] || '-'}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-red-600">{r.issues.join('; ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipDuplicates}
                  onChange={(e) => setSkipDuplicates(e.target.checked)}
                />
                <span>Skip duplicate IP / MAC rows automatically instead of failing</span>
              </label>

              <div className="flex justify-between">
                <button
                  onClick={() => setStep('UPLOAD')}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer"
                >
                  Back
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={loading}
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Importing...' : `Confirm Import (${previewRows.length} rows)`}
                </button>
              </div>
            </div>
          )}

          {step === 'SUMMARY' && summary && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
                <div>
                  <div className="font-bold">Import Completed</div>
                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    Imported: <strong>{summary.importedCount}</strong> • Skipped Duplicates:{' '}
                    <strong>{summary.skippedDuplicates}</strong> • Errors:{' '}
                    <strong>{summary.errorCount}</strong>
                  </div>
                </div>
              </div>

              {summary.errors.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs space-y-1 max-h-48 overflow-y-auto">
                  <div className="font-semibold flex items-center gap-1.5 text-amber-800">
                    <AlertTriangle className="h-4 w-4" />
                    Row Errors
                  </div>
                  {summary.errors.map((e, i) => (
                    <div key={i} className="text-amber-900">
                      Row {e.rowIndex} ({e.name || 'unnamed'}): {e.error}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={onImported}
                  className="px-5 py-2 rounded-lg bg-[#0f2942] text-white font-semibold cursor-pointer"
                >
                  Done & Refresh Inventory
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

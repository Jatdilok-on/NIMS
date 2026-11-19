'use client';

import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Upload, X } from 'lucide-react';
import { apiFetch, apiUploadWithProgress, ApiError } from '@/lib/api';
import { FileDropzone } from '@/components/common/FileDropzone';
import { Site } from '@/lib/types';

interface CredPreviewRow {
  rowNumber: number;
  raw: Record<string, string>;
  status: 'READY' | 'DUPLICATE' | 'INVALID';
  issues: string[];
}

const TARGET_CRED_FIELDS = [
  { value: '', label: '-- Ignore Column --' },
  { value: 'deviceName', label: 'Device Name *' },
  { value: 'deviceModel', label: 'Device Model' },
  { value: 'managementIp', label: 'Management IP' },
  { value: 'loginType', label: 'Login Type (SSH/HTTPS/RDP...)' },
  { value: 'username', label: 'Username *' },
  { value: 'password', label: 'Password *' },
  { value: 'port', label: 'Port' },
  { value: 'url', label: 'Management URL' },
  { value: 'accessMethod', label: 'Access Method' },
  { value: 'howToConnect', label: 'How To Connect' },
  { value: 'steps', label: 'Connection Steps' },
  { value: 'remark', label: 'Remark' },
];

export function ImportCredentialsModal({
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
  const [step, setStep] = useState<'UPLOAD' | 'PREVIEW' | 'RESULT'>('UPLOAD');
  const [siteId, setSiteId] = useState(fixedSiteId || sites[0]?.id || '');
  React.useEffect(() => {
    if (!siteId && sites.length > 0) {
      setSiteId(fixedSiteId || sites[0].id);
    }
  }, [siteId, fixedSiteId, sites]);
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [previewRows, setPreviewRows] = useState<CredPreviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{
    totalRows: number;
    importedCount: number;
    skippedDuplicates: number;
    errorCount: number;
    errors: Array<{ rowIndex: number; name?: string; error: string }>;
  } | null>(null);

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

      const res = await apiUploadWithProgress<{
        headers: string[];
        suggestedMapping: Record<string, string>;
        totalRows: number;
        previewRows: CredPreviewRow[];
      }>('/credentials/import/preview', formData, (pct) => {
        setUploadProgress(pct);
      });

      setHeaders(res.headers);
      setColumnMapping(res.suggestedMapping);
      setPreviewRows(res.previewRows);
      setStep('PREVIEW');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to parse spreadsheet');
    } finally {
      setLoading(false);
      setUploadProgress(null);
    }
  };

  const handleConfirmImport = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch<{
        totalRows: number;
        importedCount: number;
        skippedDuplicates: number;
        errorCount: number;
        errors: Array<{ rowIndex: number; name?: string; error: string }>;
      }>('/credentials/import/confirm', {
        method: 'POST',
        body: JSON.stringify({
          siteId,
          columnMapping,
          skipDuplicates,
          rows: previewRows.map((r) => r.raw),
        }),
      });
      setResult(res);
      setStep('RESULT');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const readyCount = previewRows.filter((r) => r.status === 'READY').length;
  const dupCount = previewRows.filter((r) => r.status === 'DUPLICATE').length;
  const invalidCount = previewRows.filter((r) => r.status === 'INVALID').length;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="h-5 w-5 text-sky-500" />
            <div>
              <h3 className="font-bold text-base">Import Access Credentials (Excel / CSV)</h3>
              <p className="text-xs text-slate-500">
                Usernames and passwords are encrypted with AES-256-GCM before storage
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-5 text-sm">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {step === 'UPLOAD' && (
            <form onSubmit={handlePreview} className="space-y-4">
              {!fixedSiteId && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">
                    Target Site *
                  </label>
                  <select
                    required
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
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-500">
                    Credentials Spreadsheet (.xlsx, .csv) *
                  </label>
                  <a
                    href={`/api/credentials/export?template=true&format=xlsx${siteId ? `&siteId=${encodeURIComponent(siteId)}` : ''}`}
                    className="text-xs font-semibold text-sky-600 hover:underline"
                  >
                    Download Excel Template
                  </a>
                </div>
                <FileDropzone
                  variant="spreadsheet"
                  accept=".xlsx,.xls,.csv"
                  files={file ? [file] : []}
                  onFilesSelected={(picked) => setFile(picked[0] || null)}
                  onRemoveFile={() => setFile(null)}
                  progress={uploadProgress}
                  progressLabel="Uploading & parsing spreadsheet..."
                  title="Drop credentials Excel/CSV file or click to browse"
                  subtitle="Expected columns: Device Name, Login Type, Username, Password, Management IP, Port, URL"
                  hint="Supported formats: .xlsx, .xls, .csv (Max 15 MB)"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !file}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50 cursor-pointer"
                >
                  <Upload className="h-4 w-4" />
                  {loading ? `Uploading ${uploadProgress ?? 0}%...` : 'Next: Map & Preview'}
                </button>
              </div>
            </form>
          )}

          {step === 'PREVIEW' && (
            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl space-y-3">
                <div className="font-semibold text-xs uppercase text-slate-600 dark:text-slate-300">
                  Column Mapping ({previewRows.length} rows detected)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {headers.map((h) => (
                    <div key={h} className="flex items-center gap-2 text-xs">
                      <span className="font-medium truncate w-32" title={h}>
                        {h}
                      </span>
                      <span className="text-slate-400">→</span>
                      <select
                        value={columnMapping[h] || ''}
                        onChange={(e) =>
                          setColumnMapping((prev) => ({ ...prev, [h]: e.target.value }))
                        }
                        className="flex-1 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      >
                        {TARGET_CRED_FIELDS.map((tf) => (
                          <option key={tf.value} value={tf.value}>
                            {tf.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-xs">
                  <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
                    Ready: {readyCount}
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 font-semibold">
                    Duplicates: {dupCount}
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-800 font-semibold">
                    Invalid: {invalidCount}
                  </span>
                </div>

                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skipDuplicates}
                    onChange={(e) => setSkipDuplicates(e.target.checked)}
                  />
                  Skip duplicate Device + Login Type entries
                </label>
              </div>

              <div className="max-h-64 overflow-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left">Row</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      {headers.slice(0, 5).map((h) => (
                        <th key={h} className="px-3 py-2 text-left">
                          {h}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-left">Issues</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {previewRows.slice(0, 100).map((r) => (
                      <tr key={r.rowNumber}>
                        <td className="px-3 py-1.5 text-slate-500">{r.rowNumber}</td>
                        <td className="px-3 py-1.5">
                          <span
                            className={`px-2 py-0.5 rounded-full font-semibold ${
                              r.status === 'READY'
                                ? 'bg-emerald-100 text-emerald-700'
                                : r.status === 'DUPLICATE'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                        {headers.slice(0, 5).map((h) => (
                          <td key={h} className="px-3 py-1.5 truncate max-w-[140px]">
                            {columnMapping[h] === 'password' && r.raw[h]
                              ? '••••••••'
                              : r.raw[h]}
                          </td>
                        ))}
                        <td className="px-3 py-1.5 text-red-600">{r.issues.join('; ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between">
                <button
                  type="button"
                  onClick={() => setStep('UPLOAD')}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleConfirmImport}
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Encrypting & Importing...' : `Import ${previewRows.length} Rows`}
                </button>
              </div>
            </div>
          )}

          {step === 'RESULT' && result && (
            <div className="text-center space-y-4 py-4">
              <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
              <h4 className="text-lg font-bold">Credentials Import Completed</h4>
              <div className="flex justify-center gap-4 text-sm">
                <div>
                  Imported: <strong className="text-emerald-600">{result.importedCount}</strong>
                </div>
                <div>
                  Skipped Duplicates:{' '}
                  <strong className="text-amber-600">{result.skippedDuplicates}</strong>
                </div>
                <div>
                  Errors: <strong className="text-red-600">{result.errorCount}</strong>
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="text-left max-h-40 overflow-auto bg-red-50 dark:bg-red-950/30 p-3 rounded-lg text-xs text-red-700 dark:text-red-300">
                  {result.errors.map((e, i) => (
                    <div key={i}>
                      Row {e.rowIndex} ({e.name || 'Unnamed'}): {e.error}
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={onImported}
                className="px-6 py-2 rounded-lg bg-blue-600 text-white font-semibold cursor-pointer"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

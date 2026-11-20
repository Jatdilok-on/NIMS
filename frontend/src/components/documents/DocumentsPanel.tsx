'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Folder,
  History,
  Loader2,
  Pencil,
  Presentation,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { apiFetch, apiUploadWithProgress, ApiError, formatBytes } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { ConfirmActionModal } from '@/components/common/ConfirmActionModal';
import {
  FileDropzone,
  MultiFileQueue,
  QueuedUploadItem,
  stripFileExtension,
} from '@/components/common/FileDropzone';
import { DocumentCategory, DocumentItem, Site } from '@/lib/types';

interface SpreadsheetCellPreview {
  text: string;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
  bg?: string;
}

interface SpreadsheetSheetPreview {
  name: string;
  totalRows: number;
  totalCols: number;
  truncatedRows: boolean;
  truncatedCols: boolean;
  rows: SpreadsheetCellPreview[][];
}

interface WordRunPreview {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  href?: string;
  imageDataUrl?: string;
}

type WordBlockPreview =
  | {
      type: 'heading';
      level: 1 | 2 | 3 | 4;
      align?: 'left' | 'center' | 'right';
      runs: WordRunPreview[];
    }
  | {
      type: 'paragraph';
      isList?: boolean;
      listLevel?: number;
      align?: 'left' | 'center' | 'right';
      runs: WordRunPreview[];
    }
  | {
      type: 'table';
      rows: Array<{
        isHeader?: boolean;
        cells: Array<{
          colSpan?: number;
          bg?: string;
          blocks: Array<{
            align?: 'left' | 'center' | 'right';
            runs: WordRunPreview[];
          }>;
        }>;
      }>;
    };

type StructuredPreviewPayload =
  | { kind: 'spreadsheet'; fileName: string; sheets: SpreadsheetSheetPreview[] }
  | { kind: 'word'; fileName: string; blocks: WordBlockPreview[]; truncated: boolean }
  | { kind: 'slides'; fileName: string; slides: Array<{ slideNumber: number; lines: string[] }> }
  | { kind: 'unsupported'; fileName: string; reason: 'LEGACY_OFFICE' | 'UNSUPPORTED'; message: string };

function getDocExt(fileName: string): string {
  const idx = fileName.lastIndexOf('.');
  return idx >= 0 ? fileName.slice(idx).toLowerCase() : '';
}

function isStructuredOfficePreview(doc: DocumentItem, fileNameOverride?: string): boolean {
  const ext = getDocExt(fileNameOverride || doc.originalFileName);
  return ['.docx', '.xlsx', '.csv', '.pptx', '.doc', '.xls', '.ppt'].includes(ext);
}

function inferPreviewMimeType(fileName: string, fallback: string): string {
  const ext = getDocExt(fileName);
  switch (ext) {
    case '.pdf':
      return 'application/pdf';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    case '.txt':
    case '.cfg':
    case '.conf':
    case '.xml':
    case '.drawio':
      return 'text/plain; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    default:
      return fallback;
  }
}

function toExcelColumnLetter(zeroIndex: number): string {
  let n = zeroIndex + 1;
  let col = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    col = String.fromCharCode(65 + rem) + col;
    n = Math.floor((n - 1) / 26);
  }
  return col;
}

function alignClass(align?: 'left' | 'center' | 'right'): string {
  if (align === 'center') return 'text-center';
  if (align === 'right') return 'text-right';
  return 'text-left';
}

function renderWordRuns(runs: WordRunPreview[]) {
  if (runs.length === 0) {
    return <span>{'\u00A0'}</span>;
  }
  return runs.map((run, idx) => {
    if (run.imageDataUrl) {
      return (
        <img
          key={idx}
          src={run.imageDataUrl}
          alt="Embedded document image"
          className="inline-block max-w-full h-auto my-2 rounded border border-slate-200 dark:border-slate-700"
        />
      );
    }
    const cls = [
      run.bold ? 'font-bold' : '',
      run.italic ? 'italic' : '',
      run.underline ? 'underline' : '',
      run.strike ? 'line-through' : '',
    ]
      .filter(Boolean)
      .join(' ');
    const style = run.color ? { color: run.color } : undefined;
    if (run.href) {
      return (
        <a
          key={idx}
          href={run.href}
          target="_blank"
          rel="noopener noreferrer"
          className={`text-blue-600 dark:text-blue-400 underline ${cls}`}
          style={style}
        >
          {run.text}
        </a>
      );
    }
    return (
      <span key={idx} className={`whitespace-pre-wrap ${cls}`} style={style}>
        {run.text}
      </span>
    );
  });
}

function OfficePreviewPane({
  doc,
  versionNumber,
}: {
  doc: DocumentItem;
  versionNumber: number | null;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<StructuredPreviewPayload | null>(null);
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);
  const [sheetSearch, setSheetSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPayload(null);
    setActiveSheetIdx(0);
    setSheetSearch('');

    const qs = versionNumber !== null ? `?version=${versionNumber}` : '';
    apiFetch<{ preview: StructuredPreviewPayload }>(`/documents/${doc.id}/preview${qs}`)
      .then((res) => {
        if (!cancelled) {
          setPayload(res.preview);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Failed to load document preview');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [doc.id, versionNumber]);

  const downloadHref = `/api/documents/${doc.id}/download${versionNumber !== null ? `?version=${versionNumber}` : ''}`;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-500 text-xs">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        <span>กำลังโหลดตัวอย่างเอกสาร...</span>
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
        <p className="text-sm text-red-600 dark:text-red-400">{error || 'Unable to preview document'}</p>
        <a
          href={downloadHref}
          className="inline-block px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold"
        >
          Download {doc.originalFileName}
        </a>
      </div>
    );
  }

  if (payload.kind === 'unsupported') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center max-w-md mx-auto">
        <FileText className="h-10 w-10 text-slate-400" />
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{payload.message}</p>
        {payload.reason === 'LEGACY_OFFICE' && (
          <p className="text-xs text-slate-500">
            แนะนำให้บันทึกไฟล์เป็น <code>.docx</code> หรือ <code>.xlsx</code> แล้วอัปโหลดใหม่เพื่อให้เปิดดูบนหน้าเว็บได้ทันที
          </p>
        )}
        <a
          href={downloadHref}
          className="inline-block px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold"
        >
          Download {payload.fileName}
        </a>
      </div>
    );
  }

  if (payload.kind === 'spreadsheet') {
    const sheets = payload.sheets;
    const sheet = sheets[activeSheetIdx] || sheets[0];
    if (!sheet) {
      return (
        <div className="flex items-center justify-center h-full text-sm text-slate-500">
          ไฟล์ Excel นี้ไม่มีข้อมูลชีต
        </div>
      );
    }

    const q = sheetSearch.trim().toLowerCase();
    const indexedRows = sheet.rows
      .map((cells, idx) => ({ rowNumber: idx + 1, cells }))
      .filter(({ cells }) => !q || cells.some((c) => c.text.toLowerCase().includes(q)));

    const maxCols = Math.max(1, ...sheet.rows.map((r) => r.length));

    return (
      <div className="flex flex-col h-full w-full bg-white dark:bg-slate-900">
        {/* Toolbar: Sheet Tabs + Search */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80">
          <div className="flex flex-wrap items-center gap-1.5">
            <FileSpreadsheet className="h-4 w-4 text-emerald-600 shrink-0 mr-1" />
            {sheets.map((s, idx) => (
              <button
                key={`${s.name}-${idx}`}
                type="button"
                onClick={() => setActiveSheetIdx(idx)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  idx === activeSheetIdx
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={sheetSearch}
                onChange={(e) => setSheetSearch(e.target.value)}
                placeholder="ค้นหาในชีต..."
                className="pl-8 pr-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs w-44 sm:w-56"
              />
            </div>
            <span className="text-[11px] text-slate-500 whitespace-nowrap">
              {indexedRows.length} / {sheet.totalRows} rows
            </span>
          </div>
        </div>

        {(sheet.truncatedRows || sheet.truncatedCols) && (
          <div className="px-4 py-1.5 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900 text-[11px] text-amber-800 dark:text-amber-200">
            แสดงตัวอย่างสูงสุด {sheet.rows.length} แถว / {maxCols} คอลัมน์ (จากทั้งหมด {sheet.totalRows} แถว) — กด Download เพื่อดูข้อมูลครบทั้งหมด
          </div>
        )}

        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse text-xs font-sans">
            <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="w-11 px-2 py-1.5 border border-slate-200 dark:border-slate-700 text-center font-mono text-[10px]">
                  #
                </th>
                {Array.from({ length: maxCols }).map((_, cIdx) => (
                  <th
                    key={cIdx}
                    className="px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 text-center font-mono text-[11px] font-semibold min-w-[90px]"
                  >
                    {toExcelColumnLetter(cIdx)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {indexedRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={maxCols + 1}
                    className="px-4 py-8 text-center text-slate-400"
                  >
                    ไม่พบข้อมูลในชีตนี้
                  </td>
                </tr>
              ) : (
                indexedRows.map(({ rowNumber, cells }) => (
                  <tr
                    key={rowNumber}
                    className="hover:bg-blue-50/40 dark:hover:bg-blue-950/20"
                  >
                    <td className="px-2 py-1.5 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-center font-mono text-[10px] text-slate-500">
                      {rowNumber}
                    </td>
                    {Array.from({ length: maxCols }).map((_, cIdx) => {
                      const cell = cells[cIdx];
                      return (
                        <td
                          key={cIdx}
                          className={`px-2.5 py-1.5 border border-slate-200 dark:border-slate-800 whitespace-pre-wrap break-words text-slate-800 dark:text-slate-100 ${
                            cell?.bold ? 'font-bold' : ''
                          } ${alignClass(cell?.align)}`}
                          style={cell?.bg ? { backgroundColor: cell.bg, color: '#0f172a' } : undefined}
                        >
                          {cell?.text || ''}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (payload.kind === 'slides') {
    return (
      <div className="w-full h-full overflow-y-auto p-4 sm:p-6 space-y-4">
        {payload.slides.map((s) => (
          <div
            key={s.slideNumber}
            className="max-w-3xl mx-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-2"
          >
            <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
              <Presentation className="h-3.5 w-3.5" />
              Slide {s.slideNumber}
            </div>
            {s.lines.length === 0 ? (
              <p className="text-xs text-slate-400 italic">(No text content)</p>
            ) : (
              <ul className="space-y-1 text-sm text-slate-800 dark:text-slate-100">
                {s.lines.map((line, i) => (
                  <li key={i} className={i === 0 ? 'font-bold text-base' : ''}>
                    {line}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Word (.docx)
  return (
    <div className="w-full h-full overflow-y-auto p-4 sm:p-6">
      <div className="max-w-3xl mx-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 sm:p-10 space-y-3 text-sm text-slate-800 dark:text-slate-100 leading-relaxed">
        {payload.truncated && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            เอกสารมีความยาวมาก ระบบแสดงตัวอย่างบางส่วน — กด Download เพื่อเปิดอ่านฉบับเต็ม
          </div>
        )}
        {payload.blocks.length === 0 ? (
          <div className="text-center text-slate-400 py-8">ไม่พบเนื้อหาข้อความในไฟล์ Word นี้</div>
        ) : (
          payload.blocks.map((block, bIdx) => {
            if (block.type === 'heading') {
              const sizeCls =
                block.level === 1
                  ? 'text-xl font-bold text-slate-900 dark:text-white pt-2'
                  : block.level === 2
                    ? 'text-lg font-bold text-slate-900 dark:text-white pt-1.5'
                    : block.level === 3
                      ? 'text-base font-bold text-slate-800 dark:text-slate-100 pt-1'
                      : 'text-sm font-bold text-slate-800 dark:text-slate-100';
              return (
                <div key={bIdx} className={`${sizeCls} ${alignClass(block.align)}`}>
                  {renderWordRuns(block.runs)}
                </div>
              );
            }

            if (block.type === 'table') {
              return (
                <div key={bIdx} className="overflow-x-auto my-3">
                  <table className="w-full border-collapse text-xs">
                    <tbody>
                      {block.rows.map((row, rIdx) => (
                        <tr
                          key={rIdx}
                          className={
                            row.isHeader
                              ? 'bg-slate-100 dark:bg-slate-800 font-semibold'
                              : ''
                          }
                        >
                          {row.cells.map((cell, cIdx) => (
                            <td
                              key={cIdx}
                              colSpan={cell.colSpan}
                              className="border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 align-top"
                              style={
                                cell.bg ? { backgroundColor: cell.bg, color: '#0f172a' } : undefined
                              }
                            >
                              {cell.blocks.map((cb, cbIdx) => (
                                <div key={cbIdx} className={alignClass(cb.align)}>
                                  {renderWordRuns(cb.runs)}
                                </div>
                              ))}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            }

            if (block.isList) {
              const indentPx = (block.listLevel || 0) * 18;
              return (
                <div
                  key={bIdx}
                  className={`flex items-start gap-2 ${alignClass(block.align)}`}
                  style={{ paddingLeft: `${indentPx + 8}px` }}
                >
                  <span className="text-slate-400 select-none mt-0.5">•</span>
                  <div className="flex-1 min-w-0">{renderWordRuns(block.runs)}</div>
                </div>
              );
            }

            return (
              <p key={bIdx} className={alignClass(block.align)}>
                {renderWordRuns(block.runs)}
              </p>
            );
          })
        )}
      </div>
    </div>
  );
}

const DOC_CATEGORIES: Array<{ value: '' | DocumentCategory; label: string }> = [
  { value: '', label: 'All Folders' },
  { value: 'NETWORK_DESIGN', label: 'Network Design' },
  { value: 'NETWORK_DIAGRAM', label: 'Network Diagram' },
  { value: 'CONFIGURATION_BACKUP', label: 'Configuration Backup' },
  { value: 'IP_ADDRESS_PLAN', label: 'IP Address Plan' },
  { value: 'PROJECT_SPECIFICATION', label: 'Project Specification' },
  { value: 'INSTALLATION_REPORT', label: 'Installation Report' },
  { value: 'MAINTENANCE_REPORT', label: 'Maintenance Report' },
  { value: 'USER_MANUAL', label: 'User Manual' },
  { value: 'VENDOR_DOCUMENTS', label: 'Vendor Documents' },
  { value: 'OTHER', label: 'Other' },
];

export function DocumentsPanel({
  fixedSiteId,
  canEdit = true,
  canDelete = true,
}: {
  fixedSiteId?: string;
  canEdit?: boolean;
  canDelete?: boolean;
}) {
  const { t } = useI18n();
  const [sites, setSites] = useState<Site[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [category, setCategory] = useState<'' | DocumentCategory>('');
  const [search, setSearch] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);
  const [previewVersion, setPreviewVersion] = useState<number | null>(null);
  const [editingDoc, setEditingDoc] = useState<DocumentItem | null>(null);
  const [replaceDoc, setReplaceDoc] = useState<DocumentItem | null>(null);
  const [versionDoc, setVersionDoc] = useState<DocumentItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentItem | null>(null);
  const [deletingDoc, setDeletingDoc] = useState(false);
  const [deleteDocError, setDeleteDocError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ sites: Site[] }>('/sites')
      .then((res) => setSites(res.sites))
      .catch(() => {});
  }, []);

  const loadDocuments = useCallback(async () => {
    const params = new URLSearchParams();
    if (fixedSiteId) params.set('siteId', fixedSiteId);
    if (category) params.set('category', category);
    if (search.trim()) params.set('search', search.trim());
    const res = await apiFetch<{ documents: DocumentItem[] }>(`/documents?${params.toString()}`);
    setDocuments(res.documents);
  }, [fixedSiteId, category, search]);

  useEffect(() => {
    loadDocuments().catch(() => {});
  }, [loadDocuments]);

  const handleDelete = (doc: DocumentItem) => {
    setDeleteDocError(null);
    setDeleteTarget(doc);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeletingDoc(true);
    setDeleteDocError(null);
    try {
      await apiFetch(`/documents/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      loadDocuments();
    } catch (err) {
      setDeleteDocError(err instanceof ApiError ? err.message : 'Delete failed');
    } finally {
      setDeletingDoc(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('docs.searchPlaceholder')}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
          />
        </div>

        {canEdit && (
          <button
            onClick={() => setShowUpload(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
          >
            <Upload className="h-4 w-4" />
            {t('docs.uploadBtn')}
          </button>
        )}
      </div>

      {/* Folder Pills */}
      <div className="flex flex-wrap gap-1.5">
        {DOC_CATEGORIES.map((c) => (
          <button
            key={c.value}
            onClick={() => setCategory(c.value)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
              category === c.value
                ? 'bg-[#0f2942] text-white'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50'
            }`}
          >
            <Folder className="h-3.5 w-3.5" />
            {c.value === '' ? t('docs.allFolders') : c.label}
          </button>
        ))}
      </div>

      {/* Documents List */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/70 text-left text-xs uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <th className="px-4 py-3">{t('docs.colName')}</th>
                {!fixedSiteId && <th className="px-4 py-3">{t('docs.colSite')}</th>}
                <th className="px-4 py-3">{t('docs.colFolder')}</th>
                <th className="px-4 py-3">{t('docs.colProject')}</th>
                <th className="px-4 py-3">{t('docs.colVersion')}</th>
                <th className="px-4 py-3">{t('docs.colSize')}</th>
                <th className="px-4 py-3">{t('docs.colUpdated')}</th>
                <th className="px-4 py-3 text-right">{t('docs.colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {documents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    {t('docs.empty')}
                  </td>
                </tr>
              ) : (
                documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewVersion(null);
                          setPreviewDoc(doc);
                        }}
                        title="คลิกเพื่อเปิดดูไฟล์ (Preview)"
                        className="flex items-center gap-2 text-left group cursor-pointer"
                      >
                        <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:underline">
                            {doc.documentName}
                          </div>
                          <div className="text-xs text-slate-500">{doc.originalFileName}</div>
                        </div>
                      </button>
                    </td>
                    {!fixedSiteId && (
                      <td className="px-4 py-3 text-xs font-semibold">{doc.site?.siteCode}</td>
                    )}
                    <td className="px-4 py-3 text-xs">{doc.category.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3 text-xs">{doc.projectName || '-'}</td>
                    <td className="px-4 py-3 text-xs font-mono">v{doc.currentVersion}</td>
                    <td className="px-4 py-3 text-xs">{formatBytes(doc.fileSize)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(doc.updatedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => {
                          setPreviewVersion(null);
                          setPreviewDoc(doc);
                        }}
                        title="Preview"
                        className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <a
                        href={`/api/documents/${doc.id}/download`}
                        title="Download"
                        className="inline-block p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                      <button
                        onClick={() => setVersionDoc(doc)}
                        title="Version History"
                        className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <History className="h-4 w-4" />
                      </button>
                      {canEdit && (
                        <>
                          <button
                            onClick={() => setEditingDoc(doc)}
                            title="แก้ไขข้อมูล / ย้ายที่อยู่ไฟล์ (Site / Folder)"
                            className="p-1.5 rounded hover:bg-amber-50 dark:hover:bg-amber-950/40 text-amber-600 dark:text-amber-400 cursor-pointer"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setReplaceDoc(doc)}
                            title="Replace / New Version"
                            className="p-1.5 rounded hover:bg-blue-50 text-blue-600 cursor-pointer"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </button>
                        </>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(doc)}
                          title="Delete"
                          className="p-1.5 rounded hover:bg-red-50 text-red-600 cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800">
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <div className="font-bold text-sm">{previewDoc.documentName}</div>
                <div className="text-xs text-slate-500">
                  {previewDoc.originalFileName} • v
                  {previewVersion !== null
                    ? `${previewVersion}.0`
                    : previewDoc.currentVersion}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`/api/documents/${previewDoc.id}/download${
                    previewVersion !== null ? `?version=${previewVersion}` : ''
                  }`}
                  className="px-3 py-1 rounded bg-blue-600 text-white text-xs font-semibold"
                >
                  {t('docs.download')}
                </a>
                <button
                  onClick={() => {
                    setPreviewDoc(null);
                    setPreviewVersion(null);
                  }}
                  className="cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-100 dark:bg-slate-950 overflow-auto flex items-center justify-center">
              {previewDoc.mimeType.startsWith('image/') ? (
                <img
                  src={`/api/documents/${previewDoc.id}/download?inline=1${
                    previewVersion !== null ? `&version=${previewVersion}` : ''
                  }`}
                  alt={previewDoc.documentName}
                  className="max-w-full max-h-full object-contain"
                />
              ) : isStructuredOfficePreview(previewDoc) ? (
                <OfficePreviewPane doc={previewDoc} versionNumber={previewVersion} />
              ) : previewDoc.mimeType === 'application/pdf' ||
                previewDoc.mimeType.startsWith('text/') ||
                previewDoc.mimeType.startsWith('application/json') ? (
                <iframe
                  src={`/api/documents/${previewDoc.id}/download?inline=1${
                    previewVersion !== null ? `&version=${previewVersion}` : ''
                  }`}
                  className="w-full h-full border-0"
                  title={previewDoc.documentName}
                />
              ) : (
                <div className="text-center space-y-2 p-6">
                  <p className="text-sm text-slate-600">
                    Direct browser preview is not available for {previewDoc.documentType} files.
                  </p>
                  <a
                    href={`/api/documents/${previewDoc.id}/download${
                      previewVersion !== null ? `?version=${previewVersion}` : ''
                    }`}
                    className="inline-block px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold"
                  >
                    Download {previewDoc.originalFileName}
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Version History Modal */}
      {versionDoc && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 space-y-4 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base">Version History — {versionDoc.documentName}</h3>
              <button onClick={() => setVersionDoc(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs max-h-72 overflow-y-auto">
              {(versionDoc.versions || []).map((v) => (
                <div key={v.id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <div className="font-semibold">
                      v{v.versionLabel} ({v.originalFileName})
                    </div>
                    <div className="text-slate-500">
                      {v.changeNote || '-'} • {formatBytes(v.fileSize)} •{' '}
                      {new Date(v.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewVersion(v.versionNumber);
                        setPreviewDoc({
                          ...versionDoc,
                          originalFileName: v.originalFileName,
                          mimeType: inferPreviewMimeType(v.originalFileName, versionDoc.mimeType),
                          documentType:
                            getDocExt(v.originalFileName).replace('.', '').toUpperCase() ||
                            versionDoc.documentType,
                        });
                        setVersionDoc(null);
                      }}
                      className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs cursor-pointer"
                    >
                      Preview
                    </button>
                    <a
                      href={`/api/documents/${versionDoc.id}/download?version=${v.versionNumber}`}
                      className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs"
                    >
                      Download
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Edit Document Location / Metadata Modal */}
      {editingDoc && (
        <EditDocumentModal
          doc={editingDoc}
          sites={sites}
          fixedSiteId={fixedSiteId}
          onClose={() => setEditingDoc(null)}
          onSaved={() => {
            setEditingDoc(null);
            loadDocuments();
          }}
        />
      )}

      {/* Upload / Replace Modals */}
      {(showUpload || replaceDoc) && (
        <UploadDocumentModal
          sites={sites}
          fixedSiteId={fixedSiteId}
          replacing={replaceDoc}
          onClose={() => {
            setShowUpload(false);
            setReplaceDoc(null);
          }}
          onSuccess={() => {
            setShowUpload(false);
            setReplaceDoc(null);
            loadDocuments();
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmActionModal
          title="Delete Document"
          subtitle="Permanent document & version history removal"
          itemName={deleteTarget.documentName}
          badgeText={deleteTarget.category}
          details={[
            ...(deleteTarget.site
              ? [{ label: 'Site', value: `${deleteTarget.site.siteCode} — ${deleteTarget.site.siteName}` }]
              : []),
            { label: 'Version', value: `v${deleteTarget.currentVersion}` },
          ]}
          message={`Delete document "${deleteTarget.documentName}" and all uploaded versions?`}
          variant="danger"
          loading={deletingDoc}
          error={deleteDocError}
          onCancel={() => {
            if (!deletingDoc) setDeleteTarget(null);
          }}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

function EditDocumentModal({
  doc,
  sites,
  fixedSiteId,
  onClose,
  onSaved,
}: {
  doc: DocumentItem;
  sites: Site[];
  fixedSiteId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [siteId, setSiteId] = useState(doc.siteId);
  const [category, setCategory] = useState<DocumentCategory>(doc.category);
  const [documentName, setDocumentName] = useState(doc.documentName);
  const [projectName, setProjectName] = useState(doc.projectName || '');
  const [responsiblePerson, setResponsiblePerson] = useState(doc.responsiblePerson || '');
  const [description, setDescription] = useState(doc.description || '');
  const [remark, setRemark] = useState(doc.remark || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!documentName.trim()) {
      setError('กรุณาระบุชื่อเอกสาร');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/documents/${doc.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          siteId,
          category,
          documentName: documentName.trim(),
          projectName: projectName.trim() || null,
          responsiblePerson: responsiblePerson.trim() || null,
          description: description.trim() || null,
          remark: remark.trim() || null,
        }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update document');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-xl w-full max-h-[92vh] overflow-y-auto border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base">แก้ไขข้อมูล & ที่อยู่ไฟล์เอกสาร</h3>
            <p className="text-xs text-slate-500">
              ย้าย Site / Folder ที่เก็บ, เปลี่ยนชื่อเอกสาร หรืออัปเดตผู้รับผิดชอบ
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="cursor-pointer p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs space-y-0.5">
          <div className="text-slate-500">ไฟล์ต้นฉบับ: <span className="font-semibold text-slate-700 dark:text-slate-200">{doc.originalFileName}</span></div>
          {doc.filePath && (
            <div className="text-slate-400 font-mono text-[11px] truncate" title={doc.filePath}>
              Path: {doc.filePath}
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/40 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 text-sm">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              ชื่อเอกสาร (Document Name) *
            </label>
            <input
              required
              value={documentName}
              onChange={(e) => setDocumentName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {!fixedSiteId && (
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  ที่อยู่ Site (ย้าย Site)
                </label>
                <select
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

            <div className={fixedSiteId ? 'sm:col-span-2' : ''}>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                โฟลเดอร์เก็บไฟล์ (Folder)
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as DocumentCategory)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                {DOC_CATEGORIES.filter((c) => c.value).map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Project Name
              </label>
              <input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="เช่น ASRS Phase 2"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                ผู้รับผิดชอบ (Responsible Person)
              </label>
              <input
                value={responsiblePerson}
                onChange={(e) => setResponsiblePerson(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              รายละเอียด (Description)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              หมายเหตุ (Remark)
            </label>
            <input
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UploadDocumentModal({
  sites,
  fixedSiteId,
  replacing,
  onClose,
  onSuccess,
}: {
  sites: Site[];
  fixedSiteId?: string;
  replacing: DocumentItem | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [siteId, setSiteId] = useState(replacing?.siteId || fixedSiteId || sites[0]?.id || '');
  useEffect(() => {
    if (!siteId && !replacing && sites.length > 0) {
      setSiteId(fixedSiteId || sites[0].id);
    }
  }, [siteId, replacing, fixedSiteId, sites]);
  const [category, setCategory] = useState<DocumentCategory>(
    replacing?.category || 'NETWORK_DESIGN',
  );
  const [projectName, setProjectName] = useState(replacing?.projectName || '');
  const [version, setVersion] = useState(
    replacing ? `${replacing.versionNumber + 1}.0` : '1.0',
  );
  const [responsiblePerson, setResponsiblePerson] = useState(replacing?.responsiblePerson || '');
  const [description, setDescription] = useState(replacing?.description || '');
  const [changeNote, setChangeNote] = useState('');
  const [queue, setQueue] = useState<QueuedUploadItem[]>([]);
  const [uploading, setUploading] = useState(false);

  const handleFilesSelected = (picked: File[]) => {
    if (replacing) {
      const f = picked[0];
      if (!f) return;
      setQueue([
        {
          id: `${f.name}-${Date.now()}`,
          file: f,
          customName: replacing.documentName,
          progress: 0,
          status: 'pending',
        },
      ]);
      return;
    }

    setQueue((prev) => [
      ...prev,
      ...picked.map((f, i) => ({
        id: `${f.name}-${f.size}-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        file: f,
        customName: stripFileExtension(f.name),
        progress: 0,
        status: 'pending' as const,
      })),
    ]);
  };

  const handleRenameItem = (id: string, name: string) => {
    setQueue((prev) => prev.map((it) => (it.id === id ? { ...it, customName: name } : it)));
  };

  const handleRemoveItem = (id: string) => {
    setQueue((prev) => prev.filter((it) => it.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pendingItems = queue.filter((it) => it.status !== 'done');
    if (pendingItems.length === 0) return;
    setUploading(true);

    let hasFailure = false;
    for (const item of pendingItems) {
      setQueue((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, status: 'uploading', progress: 0, error: undefined } : it,
        ),
      );
      try {
        const fd = new FormData();
        fd.append('file', item.file);
        fd.append('version', version);
        if (replacing) {
          if (changeNote) fd.append('changeNote', changeNote);
          await apiUploadWithProgress(`/documents/${replacing.id}/replace`, fd, (pct) => {
            setQueue((prev) =>
              prev.map((it) => (it.id === item.id ? { ...it, progress: pct } : it)),
            );
          });
        } else {
          fd.append('siteId', siteId);
          fd.append('documentName', item.customName.trim() || item.file.name);
          fd.append('category', category);
          if (projectName) fd.append('projectName', projectName);
          if (responsiblePerson) fd.append('responsiblePerson', responsiblePerson);
          if (description) fd.append('description', description);
          await apiUploadWithProgress('/documents/upload', fd, (pct) => {
            setQueue((prev) =>
              prev.map((it) => (it.id === item.id ? { ...it, progress: pct } : it)),
            );
          });
        }
        setQueue((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, status: 'done', progress: 100 } : it)),
        );
      } catch (err) {
        hasFailure = true;
        const msg = err instanceof ApiError ? err.message : 'Upload failed';
        setQueue((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, status: 'error', error: msg } : it)),
        );
      }
    }

    setUploading(false);
    if (!hasFailure) {
      onSuccess();
    }
  };

  const overallPercent =
    queue.length > 0
      ? Math.round(queue.reduce((acc, item) => acc + item.progress, 0) / queue.length)
      : 0;
  const remainingCount = queue.filter((it) => it.status !== 'done').length;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base">
              {replacing
                ? `Upload New Version for "${replacing.documentName}"`
                : 'Upload Project Documents'}
            </h3>
            {!replacing && (
              <p className="text-xs text-slate-500">
                Select one or multiple files, customize all names together, and track real-time upload progress
              </p>
            )}
          </div>
          <button onClick={onClose} disabled={uploading} className="cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-sm">
          {!replacing && (
            <>
              {!fixedSiteId && (
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
              )}
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as DocumentCategory)}
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                >
                  {DOC_CATEGORIES.filter((c) => c.value).map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Project Name"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  placeholder="Version (e.g. 1.0)"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
                />
                <input
                  placeholder="Responsible Person"
                  value={responsiblePerson}
                  onChange={(e) => setResponsiblePerson(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
                />
              </div>
              <textarea
                rows={2}
                placeholder="Description (optional, applies to uploaded documents)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
              />
            </>
          )}

          {replacing && (
            <>
              <input
                placeholder="New Version Label"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
              />
              <input
                placeholder="Change Note"
                value={changeNote}
                onChange={(e) => setChangeNote(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
              />
            </>
          )}

          <FileDropzone
            multiple={!replacing}
            disabled={uploading}
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.svg,.zip,.json,.xml,.cfg,.conf"
            files={queue.map((q) => q.file)}
            onFilesSelected={handleFilesSelected}
            compact={queue.length > 0}
            title={
              replacing
                ? 'Drop replacement file or click to browse'
                : 'Drop multiple documents here or click to browse'
            }
            subtitle={
              replacing
                ? 'Select a single file for the new version'
                : 'Upload PDF, Office, Config, Images, Archives simultaneously'
            }
            hint="Max 100 MB per file"
          />

          <MultiFileQueue
            items={queue}
            onRenameItem={handleRenameItem}
            onRemoveItem={handleRemoveItem}
            onBatchRename={setQueue}
            disabled={uploading}
            namePlaceholder="Document display name..."
          />

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={uploading}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading || remainingCount === 0}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold cursor-pointer"
            >
              <Upload className="h-4 w-4" />
              {uploading
                ? `Uploading ${overallPercent}%...`
                : replacing
                  ? 'Upload New Version'
                  : `Upload ${remainingCount || ''} File${remainingCount === 1 ? '' : 's'}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardPaste,
  CloudUpload,
  FileSpreadsheet,
  FileText,
  FileUp,
  Loader2,
  Sparkles,
  Tag,
  X,
} from 'lucide-react';
import { formatBytes } from '@/lib/api';

export interface QueuedUploadItem {
  id: string;
  file: File;
  customName: string;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}

export function stripFileExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx > 0 ? filename.slice(0, idx) : filename;
}

export function getFileExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx > 0 ? filename.slice(idx) : '';
}

function matchesAccept(file: File, accept?: string): boolean {
  if (!accept || !accept.trim()) return true;
  const rules = accept
    .split(',')
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);
  if (rules.length === 0) return true;
  const name = file.name.toLowerCase();
  const mime = (file.type || '').toLowerCase();
  return rules.some((rule) => {
    if (rule.startsWith('.')) return name.endsWith(rule);
    if (rule.endsWith('/*')) return mime.startsWith(rule.slice(0, -1));
    return mime === rule;
  });
}

function buildPastedImageFile(blob: File): File {
  const mime = (blob.type || 'image/png').toLowerCase();
  const ext =
    mime.includes('jpeg') || mime.includes('jpg')
      ? 'jpg'
      : mime.includes('svg')
        ? 'svg'
        : mime.includes('webp')
          ? 'webp'
          : 'png';
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
  return new File([blob], `pasted-${stamp}.${ext}`, { type: blob.type || 'image/png' });
}

interface FileDropzoneProps {
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  files?: File[];
  onFilesSelected: (files: File[]) => void;
  onRemoveFile?: (index: number) => void;
  title?: string;
  subtitle?: string;
  hint?: string;
  progress?: number | null;
  progressLabel?: string;
  variant?: 'default' | 'spreadsheet';
  compact?: boolean;
  enablePaste?: boolean;
}

/**
 * Custom high-tech file dropzone that replaces the native browser
 * "Choose File / No file chosen" control with a drag-and-drop card and upload progress bar.
 */
export function FileDropzone({
  accept,
  multiple = false,
  disabled = false,
  files = [],
  onFilesSelected,
  onRemoveFile,
  title,
  subtitle,
  hint,
  progress = null,
  progressLabel,
  variant = 'default',
  compact = false,
  enablePaste = true,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [justPastedCount, setJustPastedCount] = useState<number | null>(null);
  const onFilesSelectedRef = useRef(onFilesSelected);
  onFilesSelectedRef.current = onFilesSelected;

  const handleFiles = (fileList: FileList | File[] | null) => {
    if (!fileList) return;
    const raw = Array.isArray(fileList) ? fileList : Array.from(fileList);
    const picked = raw.filter((f) => matchesAccept(f, accept));
    if (picked.length === 0) return;
    onFilesSelectedRef.current(multiple ? picked : [picked[0]]);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  useEffect(() => {
    if (!enablePaste || disabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const cb = e.clipboardData;
      if (!cb) return;

      const collected: File[] = [];
      if (cb.files && cb.files.length > 0) {
        for (const f of Array.from(cb.files)) {
          if (matchesAccept(f, accept)) {
            collected.push(
              f.name === 'image.png' || /^blob/i.test(f.name) ? buildPastedImageFile(f) : f,
            );
          }
        }
      } else if (cb.items && cb.items.length > 0) {
        for (const item of Array.from(cb.items)) {
          if (item.kind === 'file') {
            const rawFile = item.getAsFile();
            if (!rawFile) continue;
            const normalized =
              rawFile.type.startsWith('image/') && (!rawFile.name || rawFile.name === 'image.png')
                ? buildPastedImageFile(rawFile)
                : rawFile;
            if (matchesAccept(normalized, accept)) {
              collected.push(normalized);
            }
          }
        }
      }

      if (collected.length > 0) {
        e.preventDefault();
        const picked = multiple ? collected : [collected[0]];
        onFilesSelectedRef.current(picked);
        setJustPastedCount(picked.length);
        window.setTimeout(() => setJustPastedCount(null), 2500);
      }
    };

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [enablePaste, disabled, accept, multiple]);

  const IconComponent = variant === 'spreadsheet' ? FileSpreadsheet : CloudUpload;

  return (
    <div className="space-y-2.5">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
      />

      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (!disabled) {
            handleFiles(e.dataTransfer.files);
          }
        }}
        className={`group relative overflow-hidden rounded-2xl border-2 border-dashed transition-all cursor-pointer select-none ${
          compact ? 'px-4 py-4' : 'px-5 py-6'
        } ${
          isDragging
            ? 'border-sky-500 bg-sky-500/10 scale-[1.01] shadow-lg shadow-sky-500/10'
            : files.length > 0
              ? 'border-sky-400/70 bg-gradient-to-br from-sky-500/5 via-blue-500/5 to-cyan-500/5 hover:border-sky-500'
              : 'border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 hover:border-sky-500 hover:bg-sky-500/5'
        } ${disabled ? 'opacity-60 pointer-events-none' : ''}`}
      >
        <div className="flex flex-col items-center text-center gap-2.5">
          <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-md shadow-sky-500/25 group-hover:scale-105 transition-transform">
            <IconComponent className="h-6 w-6" />
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-cyan-400 text-[#0f2942] shadow">
              <Sparkles className="h-2.5 w-2.5" />
            </span>
          </div>

          <div className="space-y-0.5">
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {title || (multiple ? 'Drop multiple files here or click to browse' : 'Drop file here or click to browse')}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {subtitle || (multiple ? 'Select multiple files at once • Supports drag & drop' : 'Click icon above or drag and drop a file')}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-sky-600 dark:text-sky-400 shadow-sm group-hover:bg-sky-50 dark:group-hover:bg-sky-950/50 transition">
              <FileUp className="h-3.5 w-3.5" />
              {files.length > 0
                ? multiple
                  ? `+ Add More Files (${files.length} selected)`
                  : 'Change File'
                : multiple
                  ? 'Choose Files'
                  : 'Choose File'}
            </span>
            {enablePaste && (
              <span className="inline-flex items-center gap-1 rounded-xl bg-sky-500/10 border border-sky-400/30 px-2.5 py-1.5 text-[11px] font-semibold text-sky-700 dark:text-sky-300">
                <ClipboardPaste className="h-3.5 w-3.5" />
                {justPastedCount ? `Pasted ${justPastedCount} file(s)!` : 'Ctrl+V Paste Supported'}
              </span>
            )}
          </div>

          {hint && <div className="text-[11px] text-slate-400 dark:text-slate-500">{hint}</div>}
        </div>
      </div>

      {/* Selected file preview pill(s) when caller wants compact inline display */}
      {files.length > 0 && onRemoveFile && (
        <div className="space-y-1.5">
          {files.map((f, idx) => (
            <div
              key={`${f.name}-${f.size}-${idx}`}
              className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <span className="font-medium truncate">{f.name}</span>
                <span className="text-slate-400 shrink-0 font-mono">({formatBytes(f.size)})</span>
              </div>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onRemoveFile(idx)}
                  className="p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                  title="Remove file"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Optional upload progress bar */}
      {progress !== null && progress !== undefined && (
        <div className="rounded-xl border border-sky-200 dark:border-sky-800/70 bg-sky-50/70 dark:bg-sky-950/30 p-3 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-sky-700 dark:text-sky-300">{progressLabel || 'Uploading file...'}</span>
            <span className="font-mono text-sky-600 dark:text-sky-400 tabular-nums">{progress}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-500 via-blue-500 to-cyan-400 transition-all duration-150"
              style={{ width: `${Math.max(2, Math.min(100, progress))}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface MultiFileQueueProps {
  items: QueuedUploadItem[];
  onRenameItem: (id: string, name: string) => void;
  onRemoveItem: (id: string) => void;
  onBatchRename: (items: QueuedUploadItem[]) => void;
  disabled?: boolean;
  namePlaceholder?: string;
}

/**
 * Editable multi-file queue with batch naming (numbered or prefix) and per-file upload % bars.
 */
export function MultiFileQueue({
  items,
  onRenameItem,
  onRemoveItem,
  onBatchRename,
  disabled = false,
  namePlaceholder = 'Display name...',
}: MultiFileQueueProps) {
  const [batchBaseName, setBatchBaseName] = useState('');

  if (items.length === 0) return null;

  const overallProgress = Math.round(
    items.reduce((acc, item) => acc + item.progress, 0) / items.length,
  );
  const completedCount = items.filter((item) => item.status === 'done').length;
  const anyUploadingOrDone = items.some(
    (item) => item.status === 'uploading' || item.status === 'done' || item.status === 'error',
  );

  const applyNumbered = () => {
    const base = batchBaseName.trim();
    if (!base) return;
    onBatchRename(
      items.map((item, idx) => ({
        ...item,
        customName: items.length === 1 ? base : `${base} - ${String(idx + 1).padStart(2, '0')}`,
      })),
    );
  };

  const applyPrefix = () => {
    const prefix = batchBaseName.trim();
    if (!prefix) return;
    onBatchRename(
      items.map((item) => {
        const cleanBase = stripFileExtension(item.file.name);
        return {
          ...item,
          customName: `${prefix} ${cleanBase}`,
        };
      }),
    );
  };

  const resetOriginalNames = () => {
    onBatchRename(
      items.map((item) => ({
        ...item,
        customName: stripFileExtension(item.file.name),
      })),
    );
  };

  return (
    <div className="space-y-3">
      {/* Batch naming bar when 2+ files queued */}
      {items.length > 1 && !disabled && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/50 p-3 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5 text-sky-500" />
              Batch Rename ({items.length} files selected)
            </span>
            <button
              type="button"
              onClick={resetOriginalNames}
              className="text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
            >
              Reset names
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={batchBaseName}
              onChange={(e) => setBatchBaseName(e.target.value)}
              placeholder="Base name or prefix (e.g. Site-Plan or BTV-Doc)"
              className="flex-1 min-w-[180px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
            />
            <button
              type="button"
              onClick={applyNumbered}
              disabled={!batchBaseName.trim()}
              className="px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer"
            >
              Name 01, 02...
            </button>
            <button
              type="button"
              onClick={applyPrefix}
              disabled={!batchBaseName.trim()}
              className="px-2.5 py-1.5 rounded-lg border border-sky-500/40 text-sky-600 dark:text-sky-400 hover:bg-sky-500/10 disabled:opacity-40 text-xs font-semibold cursor-pointer"
            >
              + Add Prefix
            </button>
          </div>
        </div>
      )}

      {/* Overall progress summary */}
      {anyUploadingOrDone && (
        <div className="rounded-xl border border-sky-200 dark:border-sky-800/70 bg-sky-50/70 dark:bg-sky-950/30 p-3 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-sky-700 dark:text-sky-300">
              Overall Upload ({completedCount}/{items.length} files completed)
            </span>
            <span className="font-mono text-sky-600 dark:text-sky-400 tabular-nums">
              {overallProgress}%
            </span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-500 via-blue-500 to-emerald-400 transition-all duration-150"
              style={{ width: `${Math.max(2, Math.min(100, overallProgress))}%` }}
            />
          </div>
        </div>
      )}

      {/* Per-file editable cards */}
      <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
        {items.map((item, idx) => {
          const ext = getFileExtension(item.file.name);
          return (
            <div
              key={item.id}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 space-y-2"
            >
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                  {item.status === 'done' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : item.status === 'error' ? (
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  ) : item.status === 'uploading' ? (
                    <Loader2 className="h-4 w-4 animate-spin text-sky-500" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                </div>

                <div className="flex-1 min-w-0 flex items-center gap-1.5">
                  <span className="text-[11px] font-mono text-slate-400 shrink-0">
                    #{idx + 1}
                  </span>
                  <input
                    type="text"
                    disabled={disabled || item.status === 'uploading' || item.status === 'done'}
                    value={item.customName}
                    onChange={(e) => onRenameItem(item.id, e.target.value)}
                    placeholder={namePlaceholder}
                    className="flex-1 min-w-0 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 text-xs font-medium focus:outline-none focus:border-sky-500"
                  />
                  {ext && (
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-500 shrink-0 uppercase">
                      {ext.replace('.', '')}
                    </span>
                  )}
                </div>

                <span className="text-[11px] font-mono text-slate-400 shrink-0">
                  {formatBytes(item.file.size)}
                </span>

                {!disabled && item.status !== 'uploading' && (
                  <button
                    type="button"
                    onClick={() => onRemoveItem(item.id)}
                    className="p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer shrink-0"
                    title="Remove file"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {(item.status === 'uploading' || item.status === 'done' || item.status === 'error') && (
                <div className="space-y-1 pl-10">
                  <div className="flex items-center justify-between text-[11px]">
                    <span
                      className={
                        item.status === 'error'
                          ? 'text-red-500 font-medium'
                          : item.status === 'done'
                            ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                            : 'text-sky-600 dark:text-sky-400 font-medium'
                      }
                    >
                      {item.status === 'error'
                        ? item.error || 'Upload failed'
                        : item.status === 'done'
                          ? 'Completed'
                          : `Uploading (${item.file.name})`}
                    </span>
                    <span className="font-mono font-semibold tabular-nums">
                      {item.progress}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-150 ${
                        item.status === 'error'
                          ? 'bg-red-500'
                          : item.status === 'done'
                            ? 'bg-emerald-500'
                            : 'bg-gradient-to-r from-sky-500 to-cyan-400'
                      }`}
                      style={{ width: `${Math.max(2, item.progress)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


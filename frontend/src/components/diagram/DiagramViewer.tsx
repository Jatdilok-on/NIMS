'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  Eye,
  FileText,
  History,
  Maximize2,
  Minimize2,
  Network,
  Pencil,
  RotateCcw,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { apiFetch, apiUploadWithProgress, ApiError } from '@/lib/api';
import { FileDropzone } from '@/components/common/FileDropzone';
import { DiagramItem } from '@/lib/types';

export function getDiagramThumbnailSrc(d: DiagramItem): string | null {
  if (['PNG', 'JPG', 'SVG'].includes(d.fileFormat) && d.filePath) {
    return `/api/diagrams/${d.id}/file?v=${d.currentVersion}`;
  }
  if (d.fileFormat === 'VSDX' && d.previewSvgPath) {
    return `/api/diagrams/${d.id}/preview-svg?v=${d.currentVersion}`;
  }
  return null;
}

export function DiagramViewer({
  diagram,
  allDiagrams = [],
  canEdit,
  onOpenEditor,
  onRestored,
  onSelectDiagram,
}: {
  diagram: DiagramItem;
  allDiagrams?: DiagramItem[];
  canEdit: boolean;
  onOpenEditor: () => void;
  onRestored: () => void;
  onSelectDiagram?: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<number | null>(null);
  const [showEditInfoModal, setShowEditInfoModal] = useState(false);
  const [showNewVersionModal, setShowNewVersionModal] = useState(false);

  const viewingVersionObj =
    previewVersion !== null
      ? diagram.versions?.find((v) => v.version === previewVersion) ?? null
      : null;
  const activeFormat = viewingVersionObj?.fileFormat ?? diagram.fileFormat;
  const activeVersionNumber = viewingVersionObj?.version ?? diagram.currentVersion;
  const isViewingHistorical =
    previewVersion !== null && previewVersion !== diagram.currentVersion;

  const isPdf = activeFormat === 'PDF';
  const isVsdx = activeFormat === 'VSDX';
  const isImage = ['PNG', 'JPG', 'SVG'].includes(activeFormat);

  const fileUrl =
    isViewingHistorical
      ? `/api/diagrams/${diagram.id}/file?version=${activeVersionNumber}&v=${diagram.currentVersion}`
      : `/api/diagrams/${diagram.id}/file?v=${diagram.currentVersion}`;
  const downloadUrl =
    isViewingHistorical
      ? `/api/diagrams/${diagram.id}/file?version=${activeVersionNumber}&download=1`
      : `/api/diagrams/${diagram.id}/file?v=${diagram.currentVersion}&download=1`;
  const previewSrc =
    isVsdx && !isViewingHistorical
      ? `/api/diagrams/${diagram.id}/preview-svg?v=${diagram.currentVersion}`
      : fileUrl;

  const currentIdx = allDiagrams.findIndex((d) => d.id === diagram.id);
  const hasMultiple = allDiagrams.length > 1 && Boolean(onSelectDiagram);
  const goPrev = () => {
    if (!hasMultiple || !onSelectDiagram) return;
    const prevIdx = currentIdx > 0 ? currentIdx - 1 : allDiagrams.length - 1;
    onSelectDiagram(allDiagrams[prevIdx].id);
  };
  const goNext = () => {
    if (!hasMultiple || !onSelectDiagram) return;
    const nextIdx = currentIdx >= 0 && currentIdx < allDiagrams.length - 1 ? currentIdx + 1 : 0;
    onSelectDiagram(allDiagrams[nextIdx].id);
  };

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setShowVersions(false);
    setPreviewVersion(null);
  }, [diagram.id]);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setPreviewVersion(null);
  }, [diagram.currentVersion]);

  useEffect(() => {
    if (!hasMultiple || showEditInfoModal || showNewVersionModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    setDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handlePointerUp = () => setDragging(false);

  const handleRestoreVersion = async (version: number) => {
    if (!confirm(`Restore diagram to version ${version}?`)) return;
    try {
      await apiFetch(`/diagrams/${diagram.id}/restore/${version}`, { method: 'POST' });
      setShowVersions(false);
      onRestored();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Restore failed');
    }
  };

  return (
    <div
      ref={containerRef}
      className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col"
    >
      {/* Toolbar */}
      <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-slate-900">
        <div>
          <div className="font-bold text-sm">{diagram.title}</div>
          <div className="text-xs text-slate-500">
            {diagram.site?.siteCode} • Format: {activeFormat} • Version v{activeVersionNumber}
            {diagram.description ? ` • ${diagram.description}` : ''}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {hasMultiple && (
            <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden mr-1">
              <button
                onClick={goPrev}
                title="Previous Diagram (←)"
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-2 text-xs font-mono font-semibold text-slate-600 dark:text-slate-300">
                {(currentIdx >= 0 ? currentIdx : 0) + 1} / {allDiagrams.length}
              </span>
              <button
                onClick={goNext}
                title="Next Diagram (→)"
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {!isPdf && (
            <>
              <button
                onClick={() => setZoom((z) => Math.min(4, +(z + 0.2).toFixed(2)))}
                title="Zoom In"
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 cursor-pointer"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                onClick={() => setZoom((z) => Math.max(0.25, +(z - 0.2).toFixed(2)))}
                title="Zoom Out"
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 cursor-pointer"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <button
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
                title="Reset View"
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 cursor-pointer"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <span className="text-xs font-mono px-1.5">{Math.round(zoom * 100)}%</span>
            </>
          )}

          <button
            onClick={toggleFullscreen}
            title="Full Screen"
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 cursor-pointer"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>

          <button
            onClick={() => setShowVersions((v) => !v)}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium cursor-pointer ${
              showVersions
                ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
            }`}
          >
            <History className="h-3.5 w-3.5" />
            Versions ({diagram.versions?.length || 1})
          </button>

          {canEdit && (
            <>
              <button
                onClick={() => setShowEditInfoModal(true)}
                title="Edit diagram title & description"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-medium cursor-pointer"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit Info
              </button>
              <button
                onClick={() => setShowNewVersionModal(true)}
                title="Upload or paste a new diagram image/file as the next version"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
              >
                <Upload className="h-3.5 w-3.5" />
                + New Version (v{diagram.currentVersion + 1})
              </button>
            </>
          )}

          {(diagram.filePath || viewingVersionObj?.filePath) && (
            <a
              href={downloadUrl}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </a>
          )}

          {(diagram.kind === 'EDITOR' || diagram.canvasData) && (
            <button
              onClick={onOpenEditor}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
            >
              <Edit3 className="h-3.5 w-3.5" />
              {canEdit ? 'Open in Editor' : 'Interactive View'}
            </button>
          )}
        </div>
      </div>

      {/* Historical version banner */}
      {isViewingHistorical && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900 dark:text-amber-200">
          <div>
            Previewing historical version <strong>v{activeVersionNumber}</strong> ({activeFormat}) — Current active version is{' '}
            <strong>v{diagram.currentVersion}</strong>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPreviewVersion(null)}
              className="px-2.5 py-1 rounded border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 font-medium cursor-pointer"
            >
              Back to v{diagram.currentVersion}
            </button>
            {canEdit && (
              <button
                onClick={() => handleRestoreVersion(activeVersionNumber)}
                className="px-2.5 py-1 rounded bg-blue-600 text-white font-semibold cursor-pointer"
              >
                Restore v{activeVersionNumber} as Current
              </button>
            )}
          </div>
        </div>
      )}

      {/* Version Drawer */}
      {showVersions && diagram.versions && (
        <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 max-h-64 overflow-y-auto text-xs space-y-2">
          <div className="flex items-center justify-between gap-2 pb-1">
            <span className="font-semibold text-slate-600 dark:text-slate-300">
              Version History ({diagram.versions.length})
            </span>
            {canEdit && (
              <button
                onClick={() => setShowNewVersionModal(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
              >
                <Upload className="h-3 w-3" />
                Add Version v{diagram.currentVersion + 1}
              </button>
            )}
          </div>
          {diagram.versions.map((v) => {
            const isCurrent = v.version === diagram.currentVersion;
            const isSelected =
              previewVersion === v.version || (previewVersion === null && isCurrent);
            const canPreviewVer =
              Boolean(v.filePath) && ['PNG', 'JPG', 'SVG', 'PDF'].includes(v.fileFormat);

            return (
              <div
                key={v.id}
                className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded border ${
                  isSelected
                    ? 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-300 dark:border-blue-800'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold">v{v.version}</span>
                    {isCurrent && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-bold">
                        CURRENT
                      </span>
                    )}
                    {isSelected && !isCurrent && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 text-[10px] font-bold">
                        PREVIEWING
                      </span>
                    )}
                    <span>• {v.fileFormat}</span>
                    <span>• {v.changeNote || 'Saved'}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {new Date(v.createdAt).toLocaleString()}
                    {v.createdBy ? ` • by ${v.createdBy.fullName || v.createdBy.username}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {canPreviewVer && (
                    <button
                      onClick={() => setPreviewVersion(isCurrent ? null : v.version)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded border font-medium cursor-pointer ${
                        isSelected
                          ? 'border-blue-500 bg-blue-600 text-white'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100'
                      }`}
                    >
                      <Eye className="h-3 w-3" />
                      {isSelected ? 'Viewing' : 'View'}
                    </button>
                  )}
                  {v.filePath && (
                    <a
                      href={`/api/diagrams/${diagram.id}/file?version=${v.version}&download=1`}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 font-medium"
                    >
                      <Download className="h-3 w-3" />
                    </a>
                  )}
                  {canEdit && !isCurrent && (
                    <button
                      onClick={() => handleRestoreVersion(v.version)}
                      className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium cursor-pointer"
                    >
                      Restore
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Viewport */}
      <div className="relative">
        {hasMultiple && (
          <>
            <button
              onClick={goPrev}
              title="Previous Diagram (←)"
              className="absolute left-3 top-1/2 -translate-y-1/2 z-20 h-10 w-10 rounded-full bg-slate-900/60 hover:bg-slate-900/85 text-white shadow-lg flex items-center justify-center backdrop-blur-sm transition cursor-pointer"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={goNext}
              title="Next Diagram (→)"
              className="absolute right-3 top-1/2 -translate-y-1/2 z-20 h-10 w-10 rounded-full bg-slate-900/60 hover:bg-slate-900/85 text-white shadow-lg flex items-center justify-center backdrop-blur-sm transition cursor-pointer"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}

        {isPdf ? (
          <div className="h-[68vh] w-full bg-slate-100 dark:bg-slate-950">
            <iframe
              src={`${fileUrl}#toolbar=1&navpanes=1&scrollbar=1`}
              className="w-full h-full border-0"
              title={diagram.title}
            />
          </div>
        ) : isImage || isVsdx ? (
          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            className="h-[66vh] w-full bg-slate-100 dark:bg-slate-950 overflow-hidden relative select-none touch-none cursor-grab active:cursor-grabbing flex items-center justify-center"
          >
            <img
              src={previewSrc}
              alt={diagram.title}
              draggable={false}
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'center center',
                transition: dragging ? 'none' : 'transform 0.1s ease-out',
              }}
              className="max-w-full max-h-full object-contain pointer-events-none"
            />
          </div>
        ) : (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm text-slate-500">
              Format <strong>{diagram.fileFormat}</strong> ready.
            </p>
            {diagram.canvasData && (
              <button
                onClick={onOpenEditor}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold cursor-pointer"
              >
                Open Converted Topology in Web Editor
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bottom Thumbnail Filmstrip for quick slide switching */}
      {hasMultiple && onSelectDiagram && (
        <div className="px-3 py-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center gap-2 overflow-x-auto">
          {allDiagrams.map((item) => {
            const thumb = getDiagramThumbnailSrc(item);
            const active = item.id === diagram.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectDiagram(item.id)}
                className={`group shrink-0 w-28 rounded-lg border overflow-hidden text-left transition cursor-pointer ${
                  active
                    ? 'border-blue-600 ring-2 ring-blue-500/30 bg-white dark:bg-slate-800'
                    : 'border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-950 opacity-75 hover:opacity-100'
                }`}
              >
                <div className="h-14 w-full bg-slate-100 dark:bg-slate-950 flex items-center justify-center overflow-hidden">
                  {thumb ? (
                    <img src={thumb} alt={item.title} className="w-full h-full object-cover" />
                  ) : item.fileFormat === 'PDF' ? (
                    <FileText className="h-5 w-5 text-red-500" />
                  ) : (
                    <Network className="h-5 w-5 text-blue-500" />
                  )}
                </div>
                <div className="px-1.5 py-1 text-[10px] font-semibold truncate">{item.title}</div>
              </button>
            );
          })}
        </div>
      )}

      {showEditInfoModal && (
        <EditDiagramInfoModal
          diagram={diagram}
          onClose={() => setShowEditInfoModal(false)}
          onSaved={() => {
            setShowEditInfoModal(false);
            onRestored();
          }}
        />
      )}

      {showNewVersionModal && (
        <UploadNewVersionModal
          diagram={diagram}
          onClose={() => setShowNewVersionModal(false)}
          onUploaded={() => {
            setShowNewVersionModal(false);
            setPreviewVersion(null);
            onRestored();
          }}
        />
      )}
    </div>
  );
}

export function EditDiagramInfoModal({
  diagram,
  onClose,
  onSaved,
}: {
  diagram: DiagramItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(diagram.title);
  const [description, setDescription] = useState(diagram.description || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Diagram title is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/diagrams/${diagram.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
        }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update diagram details');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md p-6 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base">Edit Diagram Details</h3>
            <p className="text-xs text-slate-500">
              {diagram.site?.siteCode} • v{diagram.currentVersion} ({diagram.fileFormat})
            </p>
          </div>
          <button onClick={onClose} className="p-1 cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 p-2 rounded-lg">
              {error}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold mb-1">Diagram Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Optional description or location notes..."
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function UploadNewVersionModal({
  diagram,
  onClose,
  onUploaded,
}: {
  diagram: DiagramItem;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const nextVer = diagram.currentVersion + 1;
  const [title, setTitle] = useState(diagram.title);
  const [changeNote, setChangeNote] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = files[0];
    if (!file) {
      setError('Please drop, choose, or Ctrl+V paste a diagram image/file');
      return;
    }
    setUploading(true);
    setProgress(0);
    setError('');
    try {
      const fd = new FormData();
      fd.append('siteId', diagram.siteId);
      fd.append('diagramId', diagram.id);
      fd.append('title', title.trim() || diagram.title);
      if (changeNote.trim()) {
        fd.append('changeNote', changeNote.trim());
      }
      fd.append('file', file);
      await apiUploadWithProgress('/diagrams/upload', fd, setProgress);
      onUploaded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to upload new version');
    } finally {
      setUploading(false);
      setProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg p-6 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base">
              Upload New Version (v{diagram.currentVersion} → v{nextVer})
            </h3>
            <p className="text-xs text-slate-500">
              {diagram.title} • {diagram.site?.siteCode} • Previous versions remain saved in history
            </p>
          </div>
          <button onClick={onClose} className="p-1 cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 p-2 rounded-lg">
              {error}
            </div>
          )}

          <FileDropzone
            accept=".png,.jpg,.jpeg,.svg,.pdf,.drawio,.xml,.vsdx"
            multiple={false}
            enablePaste={true}
            disabled={uploading}
            files={files}
            onFilesSelected={(picked) => setFiles(picked.slice(0, 1))}
            onRemoveFile={() => setFiles([])}
            title={`Drop, choose, or Ctrl+V paste diagram for v${nextVer}`}
            subtitle="PNG, JPG, SVG, PDF, Draw.io (.drawio/.xml), or Visio (.vsdx)"
            progress={progress}
            progressLabel={`Uploading v${nextVer}...`}
          />

          <div>
            <label className="block text-xs font-semibold mb-1">Diagram Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Version Note (optional)</label>
            <input
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
              placeholder={`e.g. Updated switch IP / new layout (v${nextVer})`}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading || files.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5" />
              {uploading ? 'Uploading...' : `Upload as v${nextVer}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

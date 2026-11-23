'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, FileText, Network, Pencil, PenTool, Plus, Trash2, Upload, X } from 'lucide-react';
import { apiFetch, apiUploadWithProgress, ApiError, formatBytes } from '@/lib/api';
import {
  SearchInputWithClear,
  SiteQuickPills,
  SiteSelectControl,
} from '@/components/common/SiteFilterBar';
import {
  FileDropzone,
  MultiFileQueue,
  QueuedUploadItem,
  stripFileExtension,
} from '@/components/common/FileDropzone';
import { ConfirmActionModal } from '@/components/common/ConfirmActionModal';
import { Device, DiagramItem, Site } from '@/lib/types';
import {
  DiagramViewer,
  EditDiagramInfoModal,
  getDiagramThumbnailSrc,
  UploadNewVersionModal,
} from './DiagramViewer';
import { DiagramEditor } from './DiagramEditor';
import { useI18n } from '@/lib/i18n';

export function DiagramsPanel({
  fixedSiteId,
  canEdit = true,
}: {
  fixedSiteId?: string;
  canEdit?: boolean;
}) {
  const { t } = useI18n();
  const [sites, setSites] = useState<Site[]>([]);
  const [diagrams, setDiagrams] = useState<DiagramItem[]>([]);
  const [search, setSearch] = useState('');
  const [siteFilter, setSiteFilter] = useState('');
  const [kindFilter, setKindFilter] = useState<'ALL' | 'EDITOR' | 'UPLOADED'>('ALL');
  const [activeDiagram, setActiveDiagram] = useState<DiagramItem | null>(null);
  const [mode, setMode] = useState<'LIST' | 'VIEW' | 'EDIT'>('LIST');
  const [siteDevices, setSiteDevices] = useState<Device[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editingInfoDiagram, setEditingInfoDiagram] = useState<DiagramItem | null>(null);
  const [newVersionDiagram, setNewVersionDiagram] = useState<DiagramItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DiagramItem | null>(null);
  const [deletingDiagram, setDeletingDiagram] = useState(false);
  const [deleteDiagramError, setDeleteDiagramError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ sites: Site[] }>('/sites')
      .then((res) => setSites(res.sites))
      .catch(() => {});
  }, []);

  const loadDiagrams = useCallback(async () => {
    const q = fixedSiteId ? `?siteId=${fixedSiteId}` : '';
    const res = await apiFetch<{ diagrams: DiagramItem[] }>(`/diagrams${q}`);
    setDiagrams(res.diagrams);
  }, [fixedSiteId]);

  useEffect(() => {
    loadDiagrams().catch(() => {});
  }, [loadDiagrams]);

  const openDiagram = async (id: string, targetMode: 'VIEW' | 'EDIT') => {
    const res = await apiFetch<{ diagram: DiagramItem }>(`/diagrams/${id}`);
    const devRes = await apiFetch<{ devices: Device[] }>(
      `/devices?siteId=${res.diagram.siteId}&pageSize=200`,
    );
    setSiteDevices(devRes.devices);
    setActiveDiagram(res.diagram);
    setMode(targetMode);
  };

  const handleDelete = (d: DiagramItem) => {
    setDeleteDiagramError(null);
    setDeleteTarget(d);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeletingDiagram(true);
    setDeleteDiagramError(null);
    try {
      await apiFetch(`/diagrams/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      loadDiagrams();
    } catch (err) {
      setDeleteDiagramError(err instanceof ApiError ? err.message : 'Failed to delete diagram');
    } finally {
      setDeletingDiagram(false);
    }
  };

  if (mode === 'VIEW' && activeDiagram) {
    return (
      <div className="space-y-3">
        <button
          onClick={() => {
            setMode('LIST');
            setActiveDiagram(null);
          }}
          className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
        >
          {t('diagrams.backToList')}
        </button>
        <DiagramViewer
          diagram={activeDiagram}
          allDiagrams={diagrams}
          canEdit={canEdit}
          onOpenEditor={() => setMode('EDIT')}
          onRestored={() => {
            openDiagram(activeDiagram.id, 'VIEW');
            loadDiagrams();
          }}
          onSelectDiagram={(id) => {
            const target = diagrams.find((item) => item.id === id);
            openDiagram(id, target?.kind === 'EDITOR' && !target.filePath ? 'EDIT' : 'VIEW');
          }}
        />
      </div>
    );
  }

  if (mode === 'EDIT' && activeDiagram) {
    return (
      <DiagramEditor
        diagram={activeDiagram}
        siteDevices={siteDevices}
        canEdit={canEdit}
        onSaved={() => {
          openDiagram(activeDiagram.id, 'EDIT');
          loadDiagrams();
        }}
        onClose={() => {
          setMode('LIST');
          setActiveDiagram(null);
        }}
      />
    );
  }

  const diagramCountsBySite = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of diagrams) {
      map.set(d.siteId, (map.get(d.siteId) || 0) + 1);
    }
    return map;
  }, [diagrams]);

  const filteredDiagrams = useMemo(() => {
    const q = search.trim().toLowerCase();
    return diagrams.filter((d) => {
      if (!fixedSiteId && siteFilter && d.siteId !== siteFilter) return false;
      if (kindFilter !== 'ALL' && d.kind !== kindFilter) return false;
      if (!q) return true;
      const hay = [
        d.title,
        d.description || '',
        d.filePath || '',
        d.fileFormat,
        d.kind,
        d.site?.siteCode || '',
        d.site?.siteName || '',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [diagrams, fixedSiteId, siteFilter, kindFilter, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-base">{t('diagrams.panelTitle')}</h2>
          <p className="text-xs text-slate-500">
            {t('diagrams.panelSubtitle')}
          </p>
        </div>

        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowUploadModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-blue-600 text-blue-600 dark:text-blue-400 text-xs font-semibold cursor-pointer"
            >
              <Upload className="h-4 w-4" />
              {t('diagrams.uploadBtn')}
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              {t('diagrams.newBtn')}
            </button>
          </div>
        )}
      </div>

      {/* Search & Site / Kind Filters */}
      <div className="flex flex-wrap items-center gap-2.5 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
        <SearchInputWithClear
          value={search}
          onChange={setSearch}
          placeholder="ค้นหาชื่อผังเครือข่าย, ชื่อไฟล์, Site หรือคำอธิบาย..."
          className="flex-1 min-w-[220px]"
        />
        {!fixedSiteId && (
          <SiteSelectControl
            sites={sites}
            value={siteFilter}
            onChange={setSiteFilter}
            countsBySite={diagramCountsBySite}
            totalCount={diagrams.length}
            className="min-w-[200px]"
          />
        )}
        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value as 'ALL' | 'EDITOR' | 'UPLOADED')}
          aria-label="Filter diagram type"
          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold cursor-pointer"
        >
          <option value="ALL">ทุกประเภท ({diagrams.length})</option>
          <option value="EDITOR">{t('diagrams.webEditor')}</option>
          <option value="UPLOADED">{t('diagrams.uploaded')}</option>
        </select>
      </div>

      {!fixedSiteId && (
        <SiteQuickPills
          sites={sites}
          value={siteFilter}
          onChange={setSiteFilter}
          countsBySite={diagramCountsBySite}
          totalCount={diagrams.length}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {diagrams.length === 0 ? (
          <div className="col-span-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-500">
            {t('diagrams.empty')}
          </div>
        ) : filteredDiagrams.length === 0 ? (
          <div className="col-span-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-500 space-y-2">
            <div>ไม่พบผังเครือข่ายที่ตรงกับคำค้นหา</div>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setSiteFilter('');
                setKindFilter('ALL');
              }}
              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
            >
              แสดงทั้งหมด ({diagrams.length})
            </button>
          </div>
        ) : (
          filteredDiagrams.map((d) => {
            const thumbSrc = getDiagramThumbnailSrc(d);
            const nodeCount = Array.isArray(d.canvasData?.nodes) ? d.canvasData.nodes.length : 0;
            const edgeCount = Array.isArray(d.canvasData?.edges) ? d.canvasData.edges.length : 0;
            const handleOpenPrimary = () =>
              openDiagram(d.id, d.kind === 'UPLOADED' ? 'VIEW' : 'EDIT');

            return (
              <div
                key={d.id}
                className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col justify-between hover:shadow-md transition"
              >
                <div>
                  {/* Diagram Thumbnail Preview */}
                  <div
                    onClick={handleOpenPrimary}
                    className="h-44 w-full bg-slate-100 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800 relative group cursor-pointer overflow-hidden flex items-center justify-center"
                  >
                    {thumbSrc ? (
                      <img
                        src={thumbSrc}
                        alt={d.title}
                        loading="lazy"
                        className="w-full h-full object-contain p-1.5 group-hover:scale-[1.03] transition-transform"
                      />
                    ) : d.fileFormat === 'PDF' ? (
                      <div className="flex flex-col items-center gap-1.5 text-slate-500">
                        <FileText className="h-9 w-9 text-red-500" />
                        <span className="text-[11px] font-semibold">{t('diagrams.pdfClickPreview')}</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1.5 text-slate-500">
                        <Network className="h-9 w-9 text-blue-500" />
                        <span className="text-[11px] font-semibold">
                          Interactive Topology ({nodeCount} nodes • {edgeCount} links)
                        </span>
                      </div>
                    )}
                    <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 text-[10px] font-bold shadow-sm">
                      {d.fileFormat}
                    </span>
                  </div>

                  <div className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-sm truncate" title={d.title}>
                          {d.title}
                        </div>
                        <div className="text-xs text-slate-500">
                          {d.site?.siteCode} • v{d.currentVersion} • {d.fileFormat}
                        </div>
                      </div>
                      <span className="shrink-0 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold">
                        {d.kind === 'EDITOR' ? t('diagrams.webEditor') : t('diagrams.uploaded')}
                      </span>
                    </div>
                    {d.description && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                        {d.description}
                      </p>
                    )}
                    <div className="text-[11px] text-slate-400">
                      Updated {new Date(d.updatedAt).toLocaleString()}
                      {d.fileSize ? ` • ${formatBytes(d.fileSize)}` : ''}
                    </div>
                  </div>
                </div>

                <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {d.kind === 'UPLOADED' && (
                      <button
                        onClick={() => openDiagram(d.id, 'VIEW')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0f2942] text-white text-xs font-medium cursor-pointer"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Preview
                      </button>
                    )}
                    {(d.kind === 'EDITOR' || d.canvasData) && (
                      <button
                        onClick={() => openDiagram(d.id, 'EDIT')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium cursor-pointer"
                      >
                        <PenTool className="h-3.5 w-3.5" />
                        {canEdit ? 'Edit Canvas' : 'Open Canvas'}
                      </button>
                    )}
                    {canEdit && (
                      <>
                        <button
                          onClick={() => setEditingInfoDiagram(d)}
                          title="Edit diagram title & description"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        {d.kind === 'UPLOADED' && (
                          <button
                            onClick={() => setNewVersionDiagram(d)}
                            title={`Upload or paste new version (v${d.currentVersion + 1})`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer"
                          >
                            <Upload className="h-3.5 w-3.5" />
                            + v{d.currentVersion + 1}
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  {canEdit && (
                    <button
                      onClick={() => handleDelete(d)}
                      title="Delete diagram"
                      className="p-1.5 rounded hover:bg-red-50 text-red-600 cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Create New Interactive Diagram Modal */}
      {showCreateModal && (
        <CreateEditorModal
          sites={sites}
          fixedSiteId={fixedSiteId}
          onClose={() => setShowCreateModal(false)}
          onCreated={(diag) => {
            setShowCreateModal(false);
            loadDiagrams();
            openDiagram(diag.id, 'EDIT');
          }}
        />
      )}

      {/* Upload Diagram Modal */}
      {showUploadModal && (
        <UploadDiagramModal
          sites={sites}
          fixedSiteId={fixedSiteId}
          onClose={() => setShowUploadModal(false)}
          onUploaded={(diag) => {
            setShowUploadModal(false);
            loadDiagrams();
            openDiagram(diag.id, 'VIEW');
          }}
        />
      )}

      {/* Edit Diagram Title & Description Modal */}
      {editingInfoDiagram && (
        <EditDiagramInfoModal
          diagram={editingInfoDiagram}
          onClose={() => setEditingInfoDiagram(null)}
          onSaved={() => {
            setEditingInfoDiagram(null);
            loadDiagrams();
          }}
        />
      )}

      {/* Add New Version to Existing Diagram Modal */}
      {newVersionDiagram && (
        <UploadNewVersionModal
          diagram={newVersionDiagram}
          onClose={() => setNewVersionDiagram(null)}
          onUploaded={() => {
            const targetId = newVersionDiagram.id;
            setNewVersionDiagram(null);
            loadDiagrams();
            openDiagram(targetId, 'VIEW');
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmActionModal
          title="Delete Network Diagram"
          subtitle="Permanent diagram & version removal"
          itemName={deleteTarget.title}
          badgeText={deleteTarget.fileFormat}
          details={[
            ...(deleteTarget.site
              ? [{ label: 'Site', value: `${deleteTarget.site.siteCode} — ${deleteTarget.site.siteName}` }]
              : []),
            { label: 'Version', value: `v${deleteTarget.currentVersion}` },
          ]}
          message={`Are you sure you want to delete diagram "${deleteTarget.title}"?`}
          variant="danger"
          loading={deletingDiagram}
          error={deleteDiagramError}
          onCancel={() => {
            if (!deletingDiagram) setDeleteTarget(null);
          }}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

function CreateEditorModal({
  sites,
  fixedSiteId,
  onClose,
  onCreated,
}: {
  sites: Site[];
  fixedSiteId?: string;
  onClose: () => void;
  onCreated: (d: DiagramItem) => void;
}) {
  const [siteId, setSiteId] = useState(fixedSiteId || sites[0]?.id || '');
  React.useEffect(() => {
    if (!siteId && sites.length > 0) {
      setSiteId(fixedSiteId || sites[0].id);
    }
  }, [siteId, fixedSiteId, sites]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiFetch<{ diagram: DiagramItem }>('/diagrams', {
        method: 'POST',
        body: JSON.stringify({
          siteId,
          title,
          description: description || null,
          canvasData: { nodes: [], edges: [] },
        }),
      });
      onCreated(res.diagram);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to create diagram');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base">New Interactive Network Diagram</h3>
          <button onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleCreate} className="space-y-3 text-sm">
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
          <input
            required
            placeholder="Diagram Title (e.g. Core & Wireless Topology)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
          />
          <textarea
            rows={2}
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold cursor-pointer"
            >
              {saving ? 'Creating...' : 'Create & Open Editor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UploadDiagramModal({
  sites,
  fixedSiteId,
  onClose,
  onUploaded,
}: {
  sites: Site[];
  fixedSiteId?: string;
  onClose: () => void;
  onUploaded: (d: DiagramItem) => void;
}) {
  const [siteId, setSiteId] = useState(fixedSiteId || sites[0]?.id || '');
  React.useEffect(() => {
    if (!siteId && sites.length > 0) {
      setSiteId(fixedSiteId || sites[0].id);
    }
  }, [siteId, fixedSiteId, sites]);
  const [description, setDescription] = useState('');
  const [queue, setQueue] = useState<QueuedUploadItem[]>([]);
  const [uploading, setUploading] = useState(false);

  const handleFilesSelected = (picked: File[]) => {
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

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const pendingItems = queue.filter((it) => it.status !== 'done');
    if (pendingItems.length === 0) return;
    setUploading(true);

    let lastDiagram: DiagramItem | null = null;
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
        fd.append('siteId', siteId);
        fd.append('title', item.customName.trim() || item.file.name);
        if (description) fd.append('description', description);
        const res = await apiUploadWithProgress<{ diagram: DiagramItem }>(
          '/diagrams/upload',
          fd,
          (pct) => {
            setQueue((prev) =>
              prev.map((it) => (it.id === item.id ? { ...it, progress: pct } : it)),
            );
          },
        );
        lastDiagram = res.diagram;
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
    if (!hasFailure && lastDiagram) {
      onUploaded(lastDiagram);
    }
  };

  const overallPercent =
    queue.length > 0
      ? Math.round(queue.reduce((acc, item) => acc + item.progress, 0) / queue.length)
      : 0;
  const remainingCount = queue.filter((it) => it.status !== 'done').length;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base">Upload Network Diagrams</h3>
            <p className="text-xs text-slate-500">
              Supports multiple diagram files (.png, .jpg, .svg, .pdf, .drawio, .xml, .vsdx)
            </p>
          </div>
          <button onClick={onClose} disabled={uploading} className="cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleUpload} className="space-y-3 text-sm">
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

          <FileDropzone
            multiple
            disabled={uploading}
            accept=".png,.jpg,.jpeg,.svg,.pdf,.drawio,.xml,.vsdx"
            files={queue.map((q) => q.file)}
            onFilesSelected={handleFilesSelected}
            compact={queue.length > 0}
            title="Drop diagram files here, click to browse, or press Ctrl+V"
            subtitle="Paste screenshot/image directly (Ctrl+V) or select multiple files at once"
            hint="Supported: PNG, JPG, SVG, PDF, Draw.io (.drawio/.xml), Visio (.vsdx)"
          />

          <MultiFileQueue
            items={queue}
            onRenameItem={(id, name) =>
              setQueue((prev) => prev.map((it) => (it.id === id ? { ...it, customName: name } : it)))
            }
            onRemoveItem={(id) => setQueue((prev) => prev.filter((it) => it.id !== id))}
            onBatchRename={setQueue}
            disabled={uploading}
            namePlaceholder="Diagram title..."
          />

          <textarea
            rows={2}
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
          />
          <div className="flex justify-end gap-2">
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
                : `Upload ${remainingCount || ''} Diagram${remainingCount === 1 ? '' : 's'}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

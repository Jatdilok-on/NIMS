'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Download,
  Eye,
  FileText,
  Folder,
  History,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { apiFetch, apiUploadWithProgress, ApiError, formatBytes } from '@/lib/api';
import {
  FileDropzone,
  MultiFileQueue,
  QueuedUploadItem,
  stripFileExtension,
} from '@/components/common/FileDropzone';
import { DocumentCategory, DocumentItem, Site } from '@/lib/types';

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
  const [sites, setSites] = useState<Site[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [category, setCategory] = useState<'' | DocumentCategory>('');
  const [search, setSearch] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);
  const [replaceDoc, setReplaceDoc] = useState<DocumentItem | null>(null);
  const [versionDoc, setVersionDoc] = useState<DocumentItem | null>(null);

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

  const handleDelete = async (doc: DocumentItem) => {
    if (!confirm(`Delete document "${doc.documentName}" and all versions?`)) return;
    try {
      await apiFetch(`/documents/${doc.id}`, { method: 'DELETE' });
      loadDocuments();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Delete failed');
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
            placeholder="Search documents, project name, filename..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
          />
        </div>

        {canEdit && (
          <button
            onClick={() => setShowUpload(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
          >
            <Upload className="h-4 w-4" />
            Upload Document
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
            {c.label}
          </button>
        ))}
      </div>

      {/* Documents List */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/70 text-left text-xs uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <th className="px-4 py-3">Document Name</th>
                {!fixedSiteId && <th className="px-4 py-3">Site</th>}
                <th className="px-4 py-3">Folder</th>
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3">Version</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {documents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    No documents found in this folder.
                  </td>
                </tr>
              ) : (
                documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                        <div>
                          <div className="font-semibold">{doc.documentName}</div>
                          <div className="text-xs text-slate-500">{doc.originalFileName}</div>
                        </div>
                      </div>
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
                        onClick={() => setPreviewDoc(doc)}
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
                        <button
                          onClick={() => setReplaceDoc(doc)}
                          title="Replace / New Version"
                          className="p-1.5 rounded hover:bg-blue-50 text-blue-600 cursor-pointer"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </button>
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
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800">
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <div className="font-bold text-sm">{previewDoc.documentName}</div>
                <div className="text-xs text-slate-500">
                  {previewDoc.originalFileName} • v{previewDoc.currentVersion}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`/api/documents/${previewDoc.id}/download`}
                  className="px-3 py-1 rounded bg-blue-600 text-white text-xs font-semibold"
                >
                  Download
                </a>
                <button onClick={() => setPreviewDoc(null)}>
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-100 dark:bg-slate-950 overflow-auto flex items-center justify-center">
              {previewDoc.mimeType.startsWith('image/') ? (
                <img
                  src={`/api/documents/${previewDoc.id}/download?inline=1`}
                  alt={previewDoc.documentName}
                  className="max-w-full max-h-full object-contain"
                />
              ) : previewDoc.mimeType === 'application/pdf' ||
                previewDoc.mimeType.startsWith('text/') ? (
                <iframe
                  src={`/api/documents/${previewDoc.id}/download?inline=1`}
                  className="w-full h-full border-0"
                  title={previewDoc.documentName}
                />
              ) : (
                <div className="text-center space-y-2 p-6">
                  <p className="text-sm text-slate-600">
                    Direct browser preview is not available for {previewDoc.documentType} files.
                  </p>
                  <a
                    href={`/api/documents/${previewDoc.id}/download`}
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
                  <a
                    href={`/api/documents/${versionDoc.id}/download?version=${v.versionNumber}`}
                    className="px-2.5 py-1 rounded border border-slate-300 text-xs"
                  >
                    Download
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
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

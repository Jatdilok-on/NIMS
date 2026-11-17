'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileSpreadsheet,
  Pencil,
  Plus,
  Search,
  Shield,
  Sparkles,
  Trash2,
  Upload,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { apiFetch, apiUploadWithProgress, ApiError } from '@/lib/api';
import { ConfirmActionModal } from '@/components/common/ConfirmActionModal';
import { FileDropzone } from '@/components/common/FileDropzone';
import { useAuth } from '@/lib/auth-context';
import { RoleCode, Site, SitePermission } from '@/lib/types';

const ROLE_OPTIONS: Array<{ code: RoleCode; label: string }> = [
  { code: 'SUPER_ADMIN', label: 'Super Admin' },
  { code: 'SITE_ADMIN', label: 'Site Admin' },
  { code: 'NETWORK_ENGINEER', label: 'Network Engineer' },
  { code: 'VIEWER', label: 'Viewer (Read-only)' },
  { code: 'IP_VIEWER', label: 'IP Viewer (Restricted — No Creds)' },
];

interface ManagedUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  isActive: boolean;
  mustChangePassword?: boolean;
  lastLoginAt?: string | null;
  role: { id: string; code: RoleCode; name: string };
  sitePermissions: SitePermission[];
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | RoleCode>('ALL');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [bulkRoleCode, setBulkRoleCode] = useState<RoleCode>('NETWORK_ENGINEER');
  const [updatingRoleUserId, setUpdatingRoleUserId] = useState<string | null>(null);
  const [applyingBulkRole, setApplyingBulkRole] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);
  const [deleteUserError, setDeleteUserError] = useState<string | null>(null);
  const [permModalState, setPermModalState] = useState<{
    mode: 'SINGLE' | 'BULK';
    users: ManagedUser[];
  } | null>(null);

  const loadData = useCallback(async () => {
    const [uRes, sRes] = await Promise.all([
      apiFetch<{ users: ManagedUser[] }>('/users'),
      apiFetch<{ sites: Site[] }>('/sites'),
    ]);
    setUsers(uRes.users);
    setSites(sRes.sites);
    setSelectedUserIds((prev) =>
      prev.filter((id) =>
        uRes.users.some((u) => u.id === id && u.role.code !== 'SUPER_ADMIN'),
      ),
    );
  }, []);

  useEffect(() => {
    loadData().catch(() => {});
  }, [loadData]);

  const toggleActive = async (u: ManagedUser) => {
    try {
      await apiFetch(`/users/${u.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !u.isActive }),
      });
      loadData();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Status update failed');
    }
  };

  const handleRoleChange = async (u: ManagedUser, nextRoleCode: RoleCode) => {
    if (u.role.code === nextRoleCode) return;
    setUpdatingRoleUserId(u.id);
    try {
      await apiFetch(`/users/${u.id}`, {
        method: 'PUT',
        body: JSON.stringify({ roleCode: nextRoleCode, syncSitePermissions: true }),
      });
      await loadData();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to change role');
    } finally {
      setUpdatingRoleUserId(null);
    }
  };

  const handleBulkRoleChange = async () => {
    if (selectedUserIds.length === 0) return;
    setApplyingBulkRole(true);
    try {
      await apiFetch('/users/bulk-role', {
        method: 'PUT',
        body: JSON.stringify({
          userIds: selectedUserIds,
          roleCode: bulkRoleCode,
          syncSitePermissions: true,
        }),
      });
      await loadData();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Bulk role update failed');
    } finally {
      setApplyingBulkRole(false);
    }
  };

  const handleDelete = (u: ManagedUser) => {
    setDeleteUserError(null);
    setDeleteTarget(u);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeletingUser(true);
    setDeleteUserError(null);
    try {
      await apiFetch(`/users/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      loadData();
    } catch (err) {
      setDeleteUserError(err instanceof ApiError ? err.message : 'Delete failed');
    } finally {
      setDeletingUser(false);
    }
  };

  const configurableUsers = users.filter((u) => u.role.code !== 'SUPER_ADMIN');
  const filteredUsers = users.filter((u) => {
    if (roleFilter !== 'ALL' && u.role.code !== roleFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return `${u.username} ${u.fullName} ${u.email} ${u.role.name}`.toLowerCase().includes(q);
  });
  const visibleConfigurable = filteredUsers.filter((u) => u.role.code !== 'SUPER_ADMIN');
  const allVisibleSelected =
    visibleConfigurable.length > 0 &&
    visibleConfigurable.every((u) => selectedUserIds.includes(u.id));

  const toggleSelectUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  const toggleSelectAllVisible = (checked: boolean) => {
    const visibleIds = visibleConfigurable.map((u) => u.id);
    if (checked) {
      setSelectedUserIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    } else {
      const visibleSet = new Set(visibleIds);
      setSelectedUserIds((prev) => prev.filter((id) => !visibleSet.has(id)));
    }
  };

  const openSinglePermissions = (u: ManagedUser) => {
    setPermModalState({ mode: 'SINGLE', users: [u] });
  };

  const openBulkPermissions = () => {
    const chosen = configurableUsers.filter((u) => selectedUserIds.includes(u.id));
    if (chosen.length === 0) return;
    setPermModalState({ mode: 'BULK', users: chosen });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">User Management & RBAC</h1>
          <p className="text-sm text-slate-500">
            Configure roles (Super Admin, Site Admin, Network Engineer, Viewer, IP Viewer) and per-site module permissions
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedUserIds.length > 0 && (
            <>
              <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs">
                <select
                  value={bulkRoleCode}
                  onChange={(e) => setBulkRoleCode(e.target.value as RoleCode)}
                  className="bg-transparent font-medium py-0.5 outline-none"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleBulkRoleChange}
                  disabled={applyingBulkRole}
                  className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50 cursor-pointer"
                >
                  {applyingBulkRole ? 'Applying...' : `Set Role (${selectedUserIds.length})`}
                </button>
              </div>
              <button
                onClick={openBulkPermissions}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-sm cursor-pointer"
              >
                <Users className="h-4 w-4" />
                Bulk Site Permissions ({selectedUserIds.length})
              </button>
            </>
          )}
          <button
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-sm font-semibold hover:bg-blue-100 cursor-pointer"
          >
            <Upload className="h-4 w-4" />
            Import Excel/CSV
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Add User
          </button>
        </div>
      </div>

      {/* Filter & Multi-user Bulk Bar */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[260px]">
          <div className="relative flex-1 max-w-xs">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, username, email..."
              className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as 'ALL' | RoleCode)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
          >
            <option value="ALL">All Roles ({users.length})</option>
            <option value="SUPER_ADMIN">Super Admin</option>
            <option value="SITE_ADMIN">Site Admin</option>
            <option value="NETWORK_ENGINEER">Network Engineer</option>
            <option value="VIEWER">Viewer</option>
            <option value="IP_VIEWER">IP Viewer</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {configurableUsers.length > 0 && (
            <button
              type="button"
              onClick={() => toggleSelectAllVisible(!allVisibleSelected)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium cursor-pointer"
            >
              <CheckSquare className="h-3.5 w-3.5 text-blue-600" />
              {allVisibleSelected
                ? 'Unselect All Shown'
                : `Select All Configurable (${visibleConfigurable.length})`}
            </button>
          )}
          {selectedUserIds.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedUserIds([])}
              className="px-2.5 py-1.5 rounded-lg text-slate-500 hover:text-slate-700 cursor-pointer"
            >
              Clear ({selectedUserIds.length})
            </button>
          )}
        </div>
      </div>

      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/70 text-left text-xs uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <th className="pl-4 pr-2 py-3 w-8">
                  <input
                    type="checkbox"
                    disabled={visibleConfigurable.length === 0}
                    checked={allVisibleSelected}
                    onChange={(e) => toggleSelectAllVisible(e.target.checked)}
                    title="Select all configurable users for bulk site permission assignment"
                  />
                </th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Assigned Sites</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last Login</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredUsers.map((u) => {
                const isSuper = u.role.code === 'SUPER_ADMIN';
                const isSelected = selectedUserIds.includes(u.id);
                return (
                <tr
                  key={u.id}
                  className={isSelected ? 'bg-blue-50/50 dark:bg-blue-950/20' : undefined}
                >
                  <td className="pl-4 pr-2 py-3">
                    {!isSuper && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectUser(u.id)}
                      />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold flex flex-wrap items-center gap-1.5">
                      <span>{u.fullName}</span>
                      {u.mustChangePassword && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-[10px] font-semibold">
                          First-Login Pwd Change
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      @{u.username} • {u.email}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {u.id === currentUser?.id ? (
                      <span
                        title="Your current active Super Admin account"
                        className="px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-xs font-semibold inline-block"
                      >
                        {u.role.name} (You)
                      </span>
                    ) : (
                      <select
                        value={u.role.code}
                        disabled={updatingRoleUserId === u.id}
                        onChange={(e) => handleRoleChange(u, e.target.value as RoleCode)}
                        title="Change user role"
                        className="px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-semibold cursor-pointer disabled:opacity-50"
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r.code} value={r.code}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {isSuper ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold">
                        All Sites (Unrestricted)
                      </span>
                    ) : u.sitePermissions.length === 0 ? (
                      <span className="text-slate-400">None assigned</span>
                    ) : sites.length > 0 && u.sitePermissions.length >= sites.length ? (
                      <button
                        type="button"
                        onClick={() => openSinglePermissions(u)}
                        title={u.sitePermissions.map((sp) => sp.site?.siteCode).join(', ')}
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold cursor-pointer hover:bg-emerald-100"
                      >
                        All Sites ({u.sitePermissions.length})
                      </button>
                    ) : u.sitePermissions.length > 4 ? (
                      <div
                        className="flex flex-wrap items-center gap-1"
                        title={u.sitePermissions.map((sp) => sp.site?.siteCode).join(', ')}
                      >
                        {u.sitePermissions.slice(0, 3).map((sp) => (
                          <span
                            key={sp.siteId}
                            className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-medium"
                          >
                            {sp.site?.siteCode}
                          </span>
                        ))}
                        <button
                          type="button"
                          onClick={() => openSinglePermissions(u)}
                          className="px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold cursor-pointer hover:bg-blue-100"
                        >
                          +{u.sitePermissions.length - 3} more ({u.sitePermissions.length})
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1">
                        {u.sitePermissions.map((sp) => (
                          <span
                            key={sp.siteId}
                            className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-medium"
                          >
                            {sp.site?.siteCode}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(u)}
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold cursor-pointer ${
                        u.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                      }`}
                    >
                      {u.isActive ? 'Active' : 'Disabled'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => setEditingUser(u)}
                      title="Edit user info, role, or reset password"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium mr-1 cursor-pointer"
                    >
                      <Pencil className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" />
                      Edit
                    </button>
                    {!isSuper && (
                      <button
                        onClick={() => openSinglePermissions(u)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium mr-1 cursor-pointer"
                      >
                        <Shield className="h-3.5 w-3.5 text-blue-600" />
                        Site Permissions
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(u)}
                      className="p-1.5 rounded hover:bg-red-50 text-red-600 cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {deleteTarget && (
        <ConfirmActionModal
          title="Delete User"
          subtitle="Permanent account removal"
          itemName={deleteTarget.fullName || deleteTarget.username}
          badgeText={deleteTarget.role?.name}
          details={[
            { label: 'Username', value: deleteTarget.username },
            ...(deleteTarget.email
              ? [{ label: 'Email', value: deleteTarget.email }]
              : []),
          ]}
          message={`Are you sure you want to delete user "${deleteTarget.username}"? This action cannot be undone.`}
          variant="danger"
          loading={deletingUser}
          error={deleteUserError}
          onCancel={() => {
            if (!deletingUser) setDeleteTarget(null);
          }}
          onConfirm={confirmDelete}
        />
      )}

      {showCreate && (
        <CreateUserModal
          sites={sites}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            loadData();
          }}
        />
      )}

      {showImport && (
        <ImportUsersModal
          onClose={() => setShowImport(false)}
          onImported={() => {
            setShowImport(false);
            loadData();
          }}
        />
      )}

      {editingUser && (
        <EditUserModal
          user={editingUser}
          isSelf={editingUser.id === currentUser?.id}
          onClose={() => setEditingUser(null)}
          onSaved={() => {
            setEditingUser(null);
            loadData();
          }}
        />
      )}

      {permModalState && (
        <SitePermissionsModal
          mode={permModalState.mode}
          targetUsers={permModalState.users}
          allUsers={configurableUsers}
          sites={sites}
          onClose={() => setPermModalState(null)}
          onSwitchUser={(nextUser) =>
            setPermModalState({ mode: 'SINGLE', users: [nextUser] })
          }
          onSaved={async (advanceToNextUser) => {
            await loadData();
            if (advanceToNextUser) {
              setPermModalState({ mode: 'SINGLE', users: [advanceToNextUser] });
            } else {
              setPermModalState(null);
            }
          }}
        />
      )}
    </div>
  );
}

function buildDefaultSitePermission(siteId: string, roleCode: RoleCode): SitePermission {
  const canEdit = roleCode === 'SITE_ADMIN' || roleCode === 'NETWORK_ENGINEER';
  const isSiteAdmin = roleCode === 'SITE_ADMIN';
  const isIpViewer = roleCode === 'IP_VIEWER';
  return {
    siteId,
    canViewInventory: true,
    canEditInventory: !isIpViewer && canEdit,
    canViewDiagram: true,
    canEditDiagram: !isIpViewer && canEdit,
    canViewIpam: true,
    canEditIpam: !isIpViewer && canEdit,
    canViewDocuments: true,
    canEditDocuments: !isIpViewer && canEdit,
    canDeleteDocuments: !isIpViewer && isSiteAdmin,
    canViewCredentials: !isIpViewer && isSiteAdmin,
    canEditCredentials: !isIpViewer && isSiteAdmin,
    canViewMaintenance: true,
    canEditMaintenance: !isIpViewer && canEdit,
    canManageSite: !isIpViewer && isSiteAdmin,
  };
}

function CreateUserModal({
  sites,
  onClose,
  onCreated,
}: {
  sites: Site[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleCode, setRoleCode] = useState<RoleCode>('NETWORK_ENGINEER');
  const [mustChangePassword, setMustChangePassword] = useState(true);
  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [siteFilter, setSiteFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const sitePermissions = selectedSites.map((siteId) =>
        buildDefaultSitePermission(siteId, roleCode),
      );

      await apiFetch('/users', {
        method: 'POST',
        body: JSON.stringify({
          username,
          fullName,
          email,
          password,
          roleCode,
          mustChangePassword,
          sitePermissions,
        }),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">Create User</h3>
          <button onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 text-sm">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-red-700 text-xs">
              {error}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <input required placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
            <input required placeholder="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
            <input required type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
            <input required type="password" minLength={10} placeholder="Password (min 10 chars)" value={password} onChange={(e) => setPassword(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Role</label>
            <select
              value={roleCode}
              onChange={(e) => setRoleCode(e.target.value as RoleCode)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
            >
              <option value="SUPER_ADMIN">Super Admin</option>
              <option value="SITE_ADMIN">Site Admin</option>
              <option value="NETWORK_ENGINEER">Network Engineer</option>
              <option value="VIEWER">Viewer (Read-only)</option>
              <option value="IP_VIEWER">IP Viewer (Restricted — No Credentials)</option>
            </select>
          </div>

          {roleCode !== 'SUPER_ADMIN' && (() => {
            const filteredSites = sites.filter(
              (s) =>
                !siteFilter.trim() ||
                `${s.siteCode} ${s.siteName}`.toLowerCase().includes(siteFilter.toLowerCase()),
            );
            const allSelected =
              filteredSites.length > 0 &&
              filteredSites.every((s) => selectedSites.includes(s.id));

            return (
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-slate-500">
                    Assign Sites ({selectedSites.length}/{sites.length})
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => {
                        const visibleIds = filteredSites.map((s) => s.id);
                        if (e.target.checked) {
                          setSelectedSites((prev) => Array.from(new Set([...prev, ...visibleIds])));
                        } else {
                          const visibleSet = new Set(visibleIds);
                          setSelectedSites((prev) => prev.filter((id) => !visibleSet.has(id)));
                        }
                      }}
                    />
                    <span>All Sites ({filteredSites.length})</span>
                  </label>
                </div>
                {sites.length > 8 && (
                  <input
                    value={siteFilter}
                    onChange={(e) => setSiteFilter(e.target.value)}
                    placeholder="Filter sites..."
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
                  />
                )}
                <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto p-2 rounded-lg border border-slate-200 dark:border-slate-700">
                  {filteredSites.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedSites.includes(s.id)}
                        onChange={(e) =>
                          setSelectedSites((prev) =>
                            e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id),
                          )
                        }
                      />
                      <span className="truncate" title={`${s.siteCode} — ${s.siteName}`}>
                        {s.siteCode} — {s.siteName}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })()}

          <label className="flex items-center gap-2 text-xs font-medium cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={mustChangePassword}
              onChange={(e) => setMustChangePassword(e.target.checked)}
            />
            <span>Require password change on first login</span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-lg bg-blue-600 text-white font-semibold cursor-pointer">
              {saving ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

type PermissionPreset = 'VIEW_ONLY' | 'ENGINEER' | 'FULL';

function sanitizePermissionForUi(sp: SitePermission, roleCode?: RoleCode): SitePermission {
  if (!roleCode) return sp;
  const isIpViewer = roleCode === 'IP_VIEWER';
  const readOnly = isIpViewer || roleCode === 'VIEWER';
  return {
    ...sp,
    canEditInventory: readOnly ? false : sp.canEditInventory,
    canEditDiagram: readOnly ? false : sp.canEditDiagram,
    canEditIpam: readOnly ? false : sp.canEditIpam,
    canEditDocuments: readOnly ? false : sp.canEditDocuments,
    canDeleteDocuments: readOnly ? false : sp.canDeleteDocuments,
    canViewCredentials: isIpViewer ? false : sp.canViewCredentials,
    canEditCredentials: readOnly ? false : sp.canEditCredentials,
    canEditMaintenance: readOnly ? false : sp.canEditMaintenance,
    canManageSite: roleCode === 'SITE_ADMIN' || roleCode === 'SUPER_ADMIN' ? sp.canManageSite : false,
  };
}

function buildPresetSitePermission(
  siteId: string,
  preset: PermissionPreset,
  roleCode?: RoleCode,
): SitePermission {
  const isFull = preset === 'FULL';
  const isEng = preset === 'ENGINEER';
  const base: SitePermission = {
    siteId,
    canViewInventory: true,
    canEditInventory: isEng || isFull,
    canViewDiagram: true,
    canEditDiagram: isEng || isFull,
    canViewIpam: true,
    canEditIpam: isEng || isFull,
    canViewDocuments: true,
    canEditDocuments: isEng || isFull,
    canDeleteDocuments: isFull,
    canViewCredentials: isFull,
    canEditCredentials: isFull,
    canViewMaintenance: true,
    canEditMaintenance: isEng || isFull,
    canManageSite: isFull,
  };
  return sanitizePermissionForUi(base, roleCode);
}

function SitePermissionsModal({
  mode,
  targetUsers,
  allUsers,
  sites,
  onClose,
  onSwitchUser,
  onSaved,
}: {
  mode: 'SINGLE' | 'BULK';
  targetUsers: ManagedUser[];
  allUsers: ManagedUser[];
  sites: Site[];
  onClose: () => void;
  onSwitchUser: (u: ManagedUser) => void;
  onSaved: (advanceToNextUser?: ManagedUser) => void | Promise<void>;
}) {
  const isBulk = mode === 'BULK';
  const primaryUser = !isBulk ? targetUsers[0] : null;
  const singleRole = primaryUser?.role.code;

  const buildInitialMap = useCallback((): Record<string, SitePermission> => {
    if (!primaryUser) return {};
    const map: Record<string, SitePermission> = {};
    for (const p of primaryUser.sitePermissions) {
      map[p.siteId] = { ...p };
    }
    return map;
  }, [primaryUser]);

  const [permsMap, setPermsMap] = useState<Record<string, SitePermission>>(buildInitialMap);
  const [bulkMode, setBulkMode] = useState<'replace' | 'merge' | 'remove'>('merge');
  const [siteFilter, setSiteFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ASSIGNED' | 'UNASSIGNED'>('ALL');
  const [copySourceUserId, setCopySourceUserId] = useState('');
  const [statusBanner, setStatusBanner] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPermsMap(buildInitialMap());
    setStatusFilter('ALL');
    setStatusBanner('');
    setCopySourceUserId('');
  }, [buildInitialMap]);

  const isIpViewer = !isBulk && singleRole === 'IP_VIEWER';
  const isReadOnlyRole = !isBulk && (singleRole === 'IP_VIEWER' || singleRole === 'VIEWER');

  const isFlagDisabledForRole = (flag: keyof SitePermission): boolean => {
    if (isBulk) return bulkMode === 'remove';
    if (isIpViewer && (flag === 'canViewCredentials' || flag === 'canEditCredentials')) return true;
    if (isReadOnlyRole && String(flag).startsWith('canEdit')) return true;
    return false;
  };

  const toggleSite = (siteId: string, enabled: boolean) => {
    setPermsMap((prev) => {
      const next = { ...prev };
      if (!enabled) {
        delete next[siteId];
      } else {
        next[siteId] = buildDefaultSitePermission(siteId, singleRole || 'NETWORK_ENGINEER');
      }
      return next;
    });
  };

  const toggleAllSites = (enabled: boolean, targetSites: Site[]) => {
    setPermsMap((prev) => {
      const next = { ...prev };
      for (const s of targetSites) {
        if (!enabled) {
          delete next[s.id];
        } else if (!next[s.id]) {
          next[s.id] = buildDefaultSitePermission(s.id, singleRole || 'NETWORK_ENGINEER');
        }
      }
      return next;
    });
  };

  const toggleFlag = (siteId: string, flag: keyof SitePermission) => {
    if (isFlagDisabledForRole(flag)) return;
    setPermsMap((prev) => {
      const base = prev[siteId] || buildDefaultSitePermission(siteId, singleRole || 'NETWORK_ENGINEER');
      return {
        ...prev,
        [siteId]: {
          ...base,
          [flag]: !base[flag],
        },
      };
    });
  };

  const toggleColumnForSites = (
    flag: keyof SitePermission,
    checked: boolean,
    targetSiteIds: string[],
  ) => {
    if (isFlagDisabledForRole(flag)) return;
    setPermsMap((prev) => {
      const next = { ...prev };
      for (const siteId of targetSiteIds) {
        if (!next[siteId]) continue;
        next[siteId] = { ...next[siteId], [flag]: checked };
      }
      return next;
    });
  };

  const toggleAllFlagsForRow = (siteId: string, enableAll: boolean) => {
    setPermsMap((prev) => {
      const base = prev[siteId] || buildDefaultSitePermission(siteId, singleRole || 'NETWORK_ENGINEER');
      const updated = { ...base };
      for (const f of flagCols) {
        if (!isFlagDisabledForRole(f.key)) {
          (updated as unknown as Record<string, boolean>)[String(f.key)] = enableAll;
        }
      }
      return { ...prev, [siteId]: sanitizePermissionForUi(updated, singleRole) };
    });
  };

  const applyPreset = (preset: PermissionPreset, scopeSites: Site[]) => {
    setPermsMap((prev) => {
      const next = { ...prev };
      const assignedInScope = scopeSites.filter((s) => Boolean(next[s.id]));
      const targetList =
        Object.keys(prev).length === 0 || (siteFilter.trim() && assignedInScope.length === 0)
          ? scopeSites
          : assignedInScope.length > 0
            ? assignedInScope
            : sites.filter((s) => Boolean(next[s.id]));

      for (const s of targetList) {
        next[s.id] = buildPresetSitePermission(s.id, preset, singleRole);
      }
      setStatusBanner(
        `Applied "${
          preset === 'FULL'
            ? 'Full Access'
            : preset === 'ENGINEER'
              ? 'Engineer (No Creds)'
              : 'View Only'
        }" to ${targetList.length} sites`,
      );
      return next;
    });
  };

  const handleCopyFromUser = () => {
    const source = allUsers.find((u) => u.id === copySourceUserId);
    if (!source) return;
    const copied: Record<string, SitePermission> = {};
    for (const sp of source.sitePermissions) {
      copied[sp.siteId] = sanitizePermissionForUi({ ...sp }, singleRole);
    }
    setPermsMap(copied);
    setStatusBanner(
      `Copied ${source.sitePermissions.length} sites & permissions from ${source.fullName} (@${source.username})`,
    );
  };

  const persistPermissions = async () => {
    const list = Object.values(permsMap);
    if (isBulk) {
      await apiFetch('/users/bulk-site-permissions', {
        method: 'PUT',
        body: JSON.stringify({
          userIds: targetUsers.map((u) => u.id),
          mode: bulkMode,
          sitePermissions: bulkMode === 'remove' ? [] : list,
          siteIds: list.map((p) => p.siteId),
        }),
      });
    } else if (primaryUser) {
      await apiFetch(`/users/${primaryUser.id}/site-permissions`, {
        method: 'PUT',
        body: JSON.stringify({ sitePermissions: list }),
      });
    }
  };

  const handleSave = async (advanceUser?: ManagedUser) => {
    if (isBulk && Object.keys(permsMap).length === 0 && bulkMode !== 'replace') {
      alert('Please select at least 1 site to add/update/remove.');
      return;
    }
    setSaving(true);
    try {
      await persistPermissions();
      await onSaved(advanceUser);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const flagCols: Array<{ key: keyof SitePermission; label: string }> = [
    { key: 'canViewInventory', label: 'View Inv' },
    { key: 'canEditInventory', label: 'Edit Inv' },
    { key: 'canViewDiagram', label: 'View Diag' },
    { key: 'canEditDiagram', label: 'Edit Diag' },
    { key: 'canViewIpam', label: 'View IPAM' },
    { key: 'canEditIpam', label: 'Edit IPAM' },
    { key: 'canViewDocuments', label: 'View Docs' },
    { key: 'canEditDocuments', label: 'Edit Docs' },
    { key: 'canViewCredentials', label: 'View Creds' },
    { key: 'canEditCredentials', label: 'Edit Creds' },
  ];

  const currentIdx = primaryUser ? allUsers.findIndex((u) => u.id === primaryUser.id) : -1;
  const prevUser = !isBulk && currentIdx > 0 ? allUsers[currentIdx - 1] : null;
  const nextUser =
    !isBulk && currentIdx >= 0 && currentIdx < allUsers.length - 1 ? allUsers[currentIdx + 1] : null;

  const copyCandidates = allUsers.filter(
    (u) => (!primaryUser || u.id !== primaryUser.id) && u.sitePermissions.length > 0,
  );

  const assignedCount = Object.keys(permsMap).length;
  const searchMatchedSites = sites.filter(
    (s) =>
      !siteFilter.trim() ||
      `${s.siteCode} ${s.siteName}`.toLowerCase().includes(siteFilter.toLowerCase()),
  );
  const filteredSites = searchMatchedSites.filter((s) => {
    const isAssigned = Boolean(permsMap[s.id]);
    if (statusFilter === 'ASSIGNED') return isAssigned;
    if (statusFilter === 'UNASSIGNED') return !isAssigned;
    return true;
  });

  const allShownSelected =
    filteredSites.length > 0 && filteredSites.every((s) => Boolean(permsMap[s.id]));
  const shownAssignedIds = filteredSites.filter((s) => Boolean(permsMap[s.id])).map((s) => s.id);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-6xl w-full max-h-[92vh] flex flex-col border border-slate-200 dark:border-slate-800 p-5 space-y-3">
        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {isBulk ? (
              <Users className="h-5 w-5 text-emerald-600 shrink-0" />
            ) : (
              <UserCheck className="h-5 w-5 text-blue-600 shrink-0" />
            )}
            <div className="min-w-0">
              <h3 className="font-bold text-base truncate">
                {isBulk
                  ? `Bulk Site Permissions (${targetUsers.length} Users Selected)`
                  : `Per-Site Permissions — ${primaryUser?.fullName} (${primaryUser?.role.name})`}
              </h3>
              {isBulk ? (
                <div className="text-xs text-slate-500 truncate">
                  Target: {targetUsers.map((u) => `@${u.username}`).join(', ')}
                </div>
              ) : (
                allUsers.length > 1 && (
                  <div className="text-xs text-slate-500">
                    User {currentIdx + 1} of {allUsers.length} • @{primaryUser?.username}
                  </div>
                )
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isBulk && allUsers.length > 1 && (
              <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-xs">
                <button
                  type="button"
                  disabled={!prevUser || saving}
                  onClick={() => prevUser && onSwitchUser(prevUser)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Prev
                </button>
                <button
                  type="button"
                  disabled={!nextUser || saving}
                  onClick={() => nextUser && onSwitchUser(nextUser)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 border-l border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <button onClick={onClose} className="p-1 cursor-pointer">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Role / Bulk notices */}
        {isBulk ? (
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold text-slate-700 dark:text-slate-200">Apply Mode:</span>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="bulkMode"
                  checked={bulkMode === 'merge'}
                  onChange={() => setBulkMode('merge')}
                />
                <span>Add / Update checked sites</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="bulkMode"
                  checked={bulkMode === 'replace'}
                  onChange={() => setBulkMode('replace')}
                />
                <span>Replace ALL sites</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer text-red-600 dark:text-red-400">
                <input
                  type="radio"
                  name="bulkMode"
                  checked={bulkMode === 'remove'}
                  onChange={() => setBulkMode('remove')}
                />
                <span>Remove checked sites</span>
              </label>
            </div>
            <span className="text-[11px] text-slate-500">
              Viewer / IP Viewer restrictions are enforced automatically per user
            </span>
          </div>
        ) : (
          isReadOnlyRole && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              {isIpViewer
                ? 'IP Viewer role automatically locks out credential viewing/editing and all write operations.'
                : 'Viewer role is read-only — write/edit operations are automatically locked.'}
            </div>
          )
        )}

        {/* Quick Tools: Copy From User + 1-Click Presets */}
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 p-2.5 flex flex-wrap items-center justify-between gap-2.5 text-xs">
          {/* Copy from existing user */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 font-semibold text-slate-600 dark:text-slate-300">
              <Copy className="h-3.5 w-3.5 text-blue-600" />
              Copy from:
            </span>
            <select
              value={copySourceUserId}
              onChange={(e) => setCopySourceUserId(e.target.value)}
              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 max-w-[220px]"
            >
              <option value="">-- Select template user --</option>
              {copyCandidates.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} (@{u.username} • {u.sitePermissions.length} sites)
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!copySourceUserId || bulkMode === 'remove'}
              onClick={handleCopyFromUser}
              className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-40 cursor-pointer"
            >
              Copy
            </button>
          </div>

          {/* 1-Click Presets */}
          {bulkMode !== 'remove' && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 font-semibold text-slate-600 dark:text-slate-300">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                Quick Preset:
              </span>
              <button
                type="button"
                onClick={() => applyPreset('VIEW_ONLY', filteredSites)}
                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium cursor-pointer"
              >
                View Only
              </button>
              {!isReadOnlyRole && (
                <>
                  <button
                    type="button"
                    onClick={() => applyPreset('ENGINEER', filteredSites)}
                    className="px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 hover:bg-blue-100 font-medium cursor-pointer"
                  >
                    Engineer (No Creds)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('FULL', filteredSites)}
                    className="px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 font-medium cursor-pointer"
                  >
                    Full Access (+ Creds)
                  </button>
                </>
              )}
              {assignedCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setPermsMap({});
                    setStatusBanner('Cleared all selected sites');
                  }}
                  className="px-2.5 py-1 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 font-medium cursor-pointer"
                >
                  Clear All
                </button>
              )}
            </div>
          )}
        </div>

        {statusBanner && (
          <div className="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
            <span>{statusBanner}</span>
            <button onClick={() => setStatusBanner('')} className="text-[11px] underline cursor-pointer">
              Dismiss
            </button>
          </div>
        )}

        {/* Site search & status tabs */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={siteFilter}
                onChange={(e) => setSiteFilter(e.target.value)}
                placeholder="Filter sites..."
                className="w-56 pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
              />
            </div>

            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
              {(
                [
                  { id: 'ALL', label: `All (${searchMatchedSites.length})` },
                  {
                    id: 'ASSIGNED',
                    label: `Assigned (${searchMatchedSites.filter((s) => Boolean(permsMap[s.id])).length})`,
                  },
                  {
                    id: 'UNASSIGNED',
                    label: `Unassigned (${searchMatchedSites.filter((s) => !permsMap[s.id]).length})`,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-2.5 py-1.5 font-medium cursor-pointer ${
                    statusFilter === tab.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="text-slate-500">
            Selected: <strong>{assignedCount}</strong> / {sites.length} sites
          </div>
        </div>

        {/* Permissions Matrix */}
        <div className="overflow-auto flex-1 min-h-0 border border-slate-200 dark:border-slate-800 rounded-xl">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-20 shadow-xs">
              <tr className="border-b border-slate-200 dark:border-slate-700 text-left">
                <th className="sticky left-0 bg-slate-50 dark:bg-slate-800 z-30 py-2.5 pl-3 pr-3 min-w-[230px]">
                  <label className="inline-flex items-center gap-2 cursor-pointer font-semibold">
                    <input
                      type="checkbox"
                      checked={allShownSelected}
                      onChange={(e) => toggleAllSites(e.target.checked, filteredSites)}
                    />
                    <span>All Shown ({filteredSites.length})</span>
                  </label>
                </th>
                {bulkMode !== 'remove' && (
                  <>
                    <th className="py-2 px-2 text-center border-r border-slate-200 dark:border-slate-700">
                      <span className="text-[11px] font-semibold">Row All</span>
                    </th>
                    {flagCols.map((f) => {
                      const colDisabled =
                        shownAssignedIds.length === 0 || isFlagDisabledForRole(f.key);
                      const allColChecked =
                        shownAssignedIds.length > 0 &&
                        shownAssignedIds.every((id) => Boolean(permsMap[id]?.[f.key]));
                      return (
                        <th key={String(f.key)} className="py-2 px-2 text-center whitespace-nowrap">
                          <label className="inline-flex flex-col items-center gap-1 cursor-pointer">
                            <span>{f.label}</span>
                            <input
                              type="checkbox"
                              disabled={colDisabled}
                              checked={allColChecked}
                              onChange={(e) =>
                                toggleColumnForSites(f.key, e.target.checked, shownAssignedIds)
                              }
                              title={`Toggle ${f.label} for ${shownAssignedIds.length} shown assigned sites`}
                            />
                          </label>
                        </th>
                      );
                    })}
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredSites.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-8 text-center text-slate-400">
                    No sites match the current filter.
                  </td>
                </tr>
              ) : (
                filteredSites.map((s) => {
                  const active = Boolean(permsMap[s.id]);
                  const enabledFlags = flagCols.filter((f) => !isFlagDisabledForRole(f.key));
                  const rowAllChecked =
                    active &&
                    enabledFlags.length > 0 &&
                    enabledFlags.every((f) => Boolean(permsMap[s.id]?.[f.key]));

                  return (
                    <tr
                      key={s.id}
                      className={`hover:bg-blue-50/40 dark:hover:bg-slate-800/50 ${
                        active ? '' : 'opacity-65'
                      }`}
                    >
                      <td className="sticky left-0 bg-white dark:bg-slate-900 z-10 py-2 pl-3 pr-3 font-semibold whitespace-nowrap">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={active}
                            onChange={(e) => toggleSite(s.id, e.target.checked)}
                          />
                          <span className="truncate max-w-[230px]" title={`${s.siteCode} — ${s.siteName}`}>
                            {s.siteCode} — {s.siteName}
                          </span>
                        </label>
                      </td>
                      {bulkMode !== 'remove' && (
                        <>
                          <td className="py-2 px-2 text-center border-r border-slate-100 dark:border-slate-800">
                            <input
                              type="checkbox"
                              checked={rowAllChecked}
                              onChange={(e) => toggleAllFlagsForRow(s.id, e.target.checked)}
                              title="Toggle all permissions for this site"
                            />
                          </td>
                          {flagCols.map((f) => {
                            const disabled = !active || isFlagDisabledForRole(f.key);
                            return (
                              <td key={String(f.key)} className="py-2 px-2 text-center">
                                <input
                                  type="checkbox"
                                  disabled={disabled}
                                  checked={Boolean(permsMap[s.id]?.[f.key])}
                                  onChange={() => toggleFlag(s.id, f.key)}
                                />
                              </td>
                            );
                          })}
                        </>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Modal Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="text-xs text-slate-500">
            Tip: Click <strong>Copy from</strong> or a <strong>Quick Preset</strong> to fill all sites at once.
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm cursor-pointer"
            >
              Cancel
            </button>
            {!isBulk && nextUser && (
              <button
                onClick={() => handleSave(nextUser)}
                disabled={saving}
                className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm disabled:opacity-50 cursor-pointer"
              >
                {saving ? 'Saving...' : 'Save & Next User'}
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => handleSave()}
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm disabled:opacity-50 cursor-pointer"
            >
              {saving
                ? 'Saving...'
                : isBulk
                  ? `Apply to ${targetUsers.length} Users`
                  : 'Save Permissions'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditUserModal({
  user,
  isSelf,
  onClose,
  onSaved,
}: {
  user: ManagedUser;
  isSelf: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState(user.fullName);
  const [email, setEmail] = useState(user.email);
  const [roleCode, setRoleCode] = useState<RoleCode>(user.role.code);
  const [syncSitePermissions, setSyncSitePermissions] = useState(true);
  const [password, setPassword] = useState('');
  const [mustChangePassword, setMustChangePassword] = useState(Boolean(user.mustChangePassword));
  const [isActive, setIsActive] = useState(user.isActive);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await apiFetch(`/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          roleCode: isSelf ? undefined : roleCode,
          syncSitePermissions,
          password: password.trim() ? password : undefined,
          mustChangePassword,
          isActive: isSelf ? undefined : isActive,
        }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg">Edit User — @{user.username}</h3>
            <p className="text-xs text-slate-500">Update user profile, role, or reset password</p>
          </div>
          <button onClick={onClose} className="cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-sm">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-red-700 text-xs">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Full Name *</label>
            <input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Email *</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Role</label>
            <select
              value={roleCode}
              disabled={isSelf}
              onChange={(e) => setRoleCode(e.target.value as RoleCode)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-60"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </select>
            {isSelf && (
              <p className="text-[11px] text-slate-400 mt-1">
                You cannot change your own Super Admin role.
              </p>
            )}
            {!isSelf && roleCode !== user.role.code && user.sitePermissions.length > 0 && (
              <label className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300 mt-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={syncSitePermissions}
                  onChange={(e) => setSyncSitePermissions(e.target.checked)}
                />
                <span>Update assigned sites ({user.sitePermissions.length}) to new role defaults</span>
              </label>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              New Password (leave blank to keep current)
            </label>
            <input
              type="password"
              minLength={10}
              placeholder="Min 10 characters if resetting"
              value={password}
              onChange={(e) => {
                const nextPwd = e.target.value;
                setPassword(nextPwd);
                if (nextPwd.trim()) setMustChangePassword(true);
              }}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
            />
          </div>

          {!isSelf && (
            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={mustChangePassword}
                onChange={(e) => setMustChangePassword(e.target.checked)}
              />
              <span>Require password change on next login</span>
            </label>
          )}

          {!isSelf && (
            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <span>Account Active (allow login)</span>
            </label>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const USER_TARGET_FIELDS = [
  { value: '', label: '-- Ignore --' },
  { value: 'username', label: 'Username *' },
  { value: 'fullName', label: 'Full Name *' },
  { value: 'email', label: 'Email *' },
  { value: 'password', label: 'Password' },
  { value: 'roleCode', label: 'Role' },
  { value: 'siteCodes', label: 'Site Codes (e.g. AAI, AMW or ALL)' },
  { value: 'isActive', label: 'Status (ACTIVE / INACTIVE)' },
];

interface UserPreviewRow {
  rowNumber: number;
  raw: Record<string, string>;
  resolvedRole?: RoleCode;
  resolvedSiteCount?: number;
  isActive?: boolean;
  status: 'READY' | 'DUPLICATE' | 'INVALID';
  issues: string[];
}

function inferRoleClient(rawVal: string | undefined, fallback: RoleCode): RoleCode {
  const s = (rawVal || '').trim().toLowerCase();
  if (!s) return fallback;
  const upper = s.toUpperCase().replace(/[\s-]+/g, '_');
  if (ROLE_OPTIONS.some((r) => r.code === upper)) return upper as RoleCode;
  if (s.includes('super')) return 'SUPER_ADMIN';
  if (s.includes('site admin') || s === 'admin' || s === 'administrator') return 'SITE_ADMIN';
  if (s.includes('network') || s.includes('engineer')) return 'NETWORK_ENGINEER';
  if (s.includes('ip viewer') || s.includes('ip only')) return 'IP_VIEWER';
  if (s.includes('viewer') || s.includes('read')) return 'VIEWER';
  return fallback;
}

function ImportUsersModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const [step, setStep] = useState<'UPLOAD' | 'PREVIEW' | 'SUMMARY'>('UPLOAD');
  const [file, setFile] = useState<File | null>(null);
  const [defaultRoleCode, setDefaultRoleCode] = useState<RoleCode>('VIEWER');
  const [defaultPassword, setDefaultPassword] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [previewRows, setPreviewRows] = useState<UserPreviewRow[]>([]);
  const [rowRoles, setRowRoles] = useState<RoleCode[]>([]);
  const [mustChangePassword, setMustChangePassword] = useState(true);
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

  const handlePreview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    if (defaultPassword && defaultPassword.length < 10) {
      setError('Default password (if specified) must be at least 10 characters');
      return;
    }
    setError('');
    setLoading(true);
    setUploadProgress(0);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('defaultRoleCode', defaultRoleCode);
      if (defaultPassword) {
        formData.append('defaultPassword', defaultPassword);
      }

      const res = await apiUploadWithProgress<{
        headers: string[];
        suggestedMapping: Record<string, string>;
        previewRows: UserPreviewRow[];
      }>('/users/import/preview', formData, (pct) => setUploadProgress(pct));

      setHeaders(res.headers);
      setColumnMapping(res.suggestedMapping);
      setPreviewRows(res.previewRows);
      setRowRoles(res.previewRows.map((r) => r.resolvedRole || defaultRoleCode));
      setStep('PREVIEW');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to parse users spreadsheet');
    } finally {
      setLoading(false);
      setUploadProgress(null);
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
      }>('/users/import/confirm', {
        method: 'POST',
        body: JSON.stringify({
          columnMapping,
          defaultRoleCode,
          ...(defaultPassword ? { defaultPassword } : {}),
          mustChangePassword,
          skipDuplicates,
          rows: previewRows.map((r) => r.raw),
          rowRoles,
        }),
      });
      setSummary(res);
      setStep('SUMMARY');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'User import failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-5xl w-full max-h-[92vh] overflow-y-auto border border-slate-200 dark:border-slate-800 shadow-2xl">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="h-5 w-5 text-blue-600" />
            <h3 className="font-bold text-lg">Import Users &amp; RBAC from Excel / CSV</h3>
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
              <div className="rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <div className="font-semibold text-blue-900 dark:text-blue-200">
                    Sample User Import Template (All Roles + Site Codes)
                  </div>
                  <div className="text-[11px] text-blue-700/80 dark:text-blue-300/80">
                    Columns: Username, Full Name, Email, Password (min 10 chars), Role, Site Codes (e.g. AAI, AMW or ALL), Status
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href="/api/users/import/template?format=xlsx"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-semibold hover:bg-blue-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Sample Excel (.xlsx)
                  </a>
                  <a
                    href="/api/users/import/template?format=csv"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-medium hover:bg-slate-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Sample CSV
                  </a>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">
                    Default Role (when Role column is blank)
                  </label>
                  <select
                    value={defaultRoleCode}
                    onChange={(e) => setDefaultRoleCode(e.target.value as RoleCode)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">
                    Default Initial Password (optional fallback, min 10 chars)
                  </label>
                  <input
                    type="password"
                    value={defaultPassword}
                    onChange={(e) => setDefaultPassword(e.target.value)}
                    placeholder="Used if row Password is blank"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
                  />
                </div>
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
                  progressLabel="Parsing users spreadsheet..."
                  title="Drop users Excel or CSV file here"
                  subtitle="Click or drag & drop to preview accounts & site permissions"
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
                  <div className="font-semibold text-xs uppercase text-slate-600 dark:text-slate-300">
                    Column Mapping ({previewRows.length} users detected)
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span>Set All Rows Role:</span>
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        if (!e.target.value) return;
                        const next = e.target.value as RoleCode;
                        setRowRoles(previewRows.map(() => next));
                      }}
                      className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    >
                      <option value="">-- Change all --</option>
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r.code} value={r.code}>
                          {r.label}
                        </option>
                      ))}
                    </select>
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
                        onChange={(e) => {
                          const nextTarget = e.target.value;
                          setColumnMapping((prev) => ({ ...prev, [h]: nextTarget }));
                          if (nextTarget === 'roleCode') {
                            setRowRoles(
                              previewRows.map((r) => inferRoleClient(r.raw[h], defaultRoleCode)),
                            );
                          }
                        }}
                        className="w-1/2 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      >
                        {USER_TARGET_FIELDS.map((tf) => (
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
                      <th className="px-3 py-2 text-left">Role</th>
                      <th className="px-3 py-2 text-left">Sites Assigned</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      {headers.slice(0, 4).map((h) => (
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
                        <td className="px-3 py-2">
                          <select
                            value={rowRoles[idx] || defaultRoleCode}
                            onChange={(e) => {
                              const nextRole = e.target.value as RoleCode;
                              setRowRoles((prev) =>
                                prev.map((cur, j) => (j === idx ? nextRole : cur)),
                              );
                            }}
                            className="px-2 py-1 rounded border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/40 font-semibold text-blue-700 dark:text-blue-300"
                          >
                            {ROLE_OPTIONS.map((opt) => (
                              <option key={opt.code} value={opt.code}>
                                {opt.code}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 font-mono">{r.resolvedSiteCount ?? 0}</td>
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
                        {headers.slice(0, 4).map((h) => (
                          <td key={h} className="px-3 py-2">
                            {columnMapping[h] === 'password'
                              ? r.raw[h]
                                ? '••••••••••'
                                : '(default)'
                              : r.raw[h] || '-'}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-red-600">{r.issues.join('; ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skipDuplicates}
                    onChange={(e) => setSkipDuplicates(e.target.checked)}
                  />
                  <span>Skip duplicate usernames / emails automatically instead of failing</span>
                </label>
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mustChangePassword}
                    onChange={(e) => setMustChangePassword(e.target.checked)}
                  />
                  <span>Require imported users to change password on first login</span>
                </label>
              </div>

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
                  {loading ? 'Importing...' : `Confirm Import (${previewRows.length} users)`}
                </button>
              </div>
            </div>
          )}

          {step === 'SUMMARY' && summary && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
                <div>
                  <div className="font-bold">User Import Completed</div>
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
                  Done &amp; Refresh Users
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

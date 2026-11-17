'use client';

import React from 'react';
import { useAuth } from '@/lib/auth-context';
import { DocumentsPanel } from '@/components/documents/DocumentsPanel';

export default function DocumentsPage() {
  const { user } = useAuth();
  const canEdit =
    user?.roleCode === 'SUPER_ADMIN' ||
    user?.roleCode === 'SITE_ADMIN' ||
    user?.roleCode === 'NETWORK_ENGINEER';
  const canDelete = user?.roleCode === 'SUPER_ADMIN' || user?.roleCode === 'SITE_ADMIN';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Project Document Management</h1>
        <p className="text-sm text-slate-500">
          Centralized version-controlled document repository organized by site and folder category
        </p>
      </div>
      <DocumentsPanel canEdit={canEdit} canDelete={canDelete} />
    </div>
  );
}

'use client';

import React from 'react';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { DocumentsPanel } from '@/components/documents/DocumentsPanel';

export default function DocumentsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const canEdit =
    user?.roleCode === 'SUPER_ADMIN' ||
    ((user?.roleCode === 'SITE_ADMIN' || user?.roleCode === 'NETWORK_ENGINEER') &&
      Boolean(user?.sitePermissions?.some((p) => p.canEditDocuments)));
  const canDelete =
    user?.roleCode === 'SUPER_ADMIN' ||
    ((user?.roleCode === 'SITE_ADMIN' || user?.roleCode === 'NETWORK_ENGINEER') &&
      Boolean(user?.sitePermissions?.some((p) => p.canDeleteDocuments)));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('docs.title')}</h1>
        <p className="text-sm text-slate-500">
          {t('docs.subtitle')}
        </p>
      </div>
      <DocumentsPanel canEdit={canEdit} canDelete={canDelete} />
    </div>
  );
}

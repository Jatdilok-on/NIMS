'use client';

import React from 'react';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { DiagramsPanel } from '@/components/diagram/DiagramsPanel';

export default function DiagramsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const canEdit =
    user?.roleCode === 'SUPER_ADMIN' ||
    ((user?.roleCode === 'SITE_ADMIN' || user?.roleCode === 'NETWORK_ENGINEER') &&
      Boolean(user?.sitePermissions?.some((p) => p.canEditDiagram)));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('diagrams.title')}</h1>
        <p className="text-sm text-slate-500">
          {t('diagrams.subtitle')}
        </p>
      </div>
      <DiagramsPanel canEdit={canEdit} />
    </div>
  );
}

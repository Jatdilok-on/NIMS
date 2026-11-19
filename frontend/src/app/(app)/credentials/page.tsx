'use client';

import React from 'react';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { CredentialsPanel } from '@/components/credentials/CredentialsPanel';

export default function CredentialsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  if (user?.roleCode === 'IP_VIEWER') {
    return <CredentialsPanel canEdit={false} />;
  }
  const canEdit =
    user?.roleCode === 'SUPER_ADMIN' ||
    user?.roleCode === 'SITE_ADMIN' ||
    user?.roleCode === 'NETWORK_ENGINEER';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('vault.title')}</h1>
        <p className="text-sm text-slate-500">
          {t('vault.subtitle')}
        </p>
      </div>
      <CredentialsPanel canEdit={canEdit} />
    </div>
  );
}

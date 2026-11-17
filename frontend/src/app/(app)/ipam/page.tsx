'use client';

import React from 'react';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { IpamPanel } from '@/components/ipam/IpamPanel';

export default function IpamPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const canEdit =
    user?.roleCode === 'SUPER_ADMIN' ||
    user?.roleCode === 'SITE_ADMIN' ||
    user?.roleCode === 'NETWORK_ENGINEER';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('ipam.title')}</h1>
        <p className="text-sm text-slate-500">{t('ipam.subtitle')}</p>
      </div>
      <IpamPanel canEdit={canEdit} />
    </div>
  );
}

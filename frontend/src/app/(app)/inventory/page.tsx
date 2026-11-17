'use client';

import React from 'react';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { InventoryPanel } from '@/components/inventory/InventoryPanel';

export default function InventoryPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const canEdit =
    user?.roleCode === 'SUPER_ADMIN' ||
    user?.roleCode === 'SITE_ADMIN' ||
    user?.roleCode === 'NETWORK_ENGINEER';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('inventory.title')}</h1>
        <p className="text-sm text-slate-500">{t('inventory.subtitle')}</p>
      </div>
      <InventoryPanel canEdit={canEdit} />
    </div>
  );
}

'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { InventoryPanel } from '@/components/inventory/InventoryPanel';

function InventoryPageContent() {
  const { user } = useAuth();
  const { t } = useI18n();
  const searchParams = useSearchParams();

  const initialSiteId = searchParams.get('siteId');
  const initialCategory = searchParams.get('category');
  const initialStatus = searchParams.get('status');
  const initialDeviceId = searchParams.get('deviceId');

  const canEdit =
    user?.roleCode === 'SUPER_ADMIN' ||
    ((user?.roleCode === 'SITE_ADMIN' || user?.roleCode === 'NETWORK_ENGINEER') &&
      Boolean(user?.sitePermissions?.some((p) => p.canEditInventory)));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('inventory.title')}</h1>
        <p className="text-sm text-slate-500">{t('inventory.subtitle')}</p>
      </div>
      <InventoryPanel
        canEdit={canEdit}
        initialSiteId={initialSiteId}
        initialCategory={initialCategory}
        initialStatus={initialStatus}
        initialDeviceId={initialDeviceId}
      />
    </div>
  );
}

export default function InventoryPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-slate-500">Loading inventory...</div>}>
      <InventoryPageContent />
    </Suspense>
  );
}

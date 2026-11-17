'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { AppShell } from '@/components/layout/AppShell';

export default function ProtectedAppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading, needsSetup } = useAuth();
  const { t } = useI18n();

  useEffect(() => {
    if (!loading) {
      if (needsSetup) router.replace('/setup');
      else if (!user) router.replace('/login');
    }
  }, [loading, needsSetup, user, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--nims-bg)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[var(--nims-muted)]">{t('header.loadingWorkspace')}</p>
        </div>
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}

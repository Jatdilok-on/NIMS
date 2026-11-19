'use client';

import React from 'react';
import { useAuth } from '@/lib/auth-context';
import { CredentialsPanel } from '@/components/credentials/CredentialsPanel';

export default function CredentialsPage() {
  const { user } = useAuth();
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
        <h1 className="text-2xl font-bold tracking-tight">Access Management & Credentials Vault</h1>
        <p className="text-sm text-slate-500">
          AES-256-GCM encrypted login credentials, connection procedures, and audit-logged access
        </p>
      </div>
      <CredentialsPanel canEdit={canEdit} />
    </div>
  );
}

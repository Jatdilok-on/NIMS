'use client';

import React from 'react';
import { useAuth } from '@/lib/auth-context';
import { DiagramsPanel } from '@/components/diagram/DiagramsPanel';

export default function DiagramsPage() {
  const { user } = useAuth();
  const canEdit =
    user?.roleCode === 'SUPER_ADMIN' ||
    user?.roleCode === 'SITE_ADMIN' ||
    user?.roleCode === 'NETWORK_ENGINEER';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Network Diagrams & Topology Engine</h1>
        <p className="text-sm text-slate-500">
          Interactive web topology editor linked to live device inventory, plus high-res PNG/PDF/Draw.io/Visio preview
        </p>
      </div>
      <DiagramsPanel canEdit={canEdit} />
    </div>
  );
}

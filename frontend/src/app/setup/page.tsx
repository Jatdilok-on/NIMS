'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, CheckCircle2, Network, Shield } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { PreferenceControls } from '@/components/layout/PreferenceControls';

export default function SetupPage() {
  const router = useRouter();
  const { needsSetup, loading, refreshUser } = useAuth();
  const { t } = useI18n();
  const [organizationName, setOrganizationName] = useState('NIMS Enterprise');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [createSampleSites, setCreateSampleSites] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && !needsSetup) {
      router.replace('/login');
    }
  }, [loading, needsSetup, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 10) {
      setError('Password must be at least 10 characters');
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch('/setup/init', {
        method: 'POST',
        body: JSON.stringify({
          organizationName,
          fullName,
          username,
          email,
          password,
          createSampleSites,
        }),
      });
      await refreshUser();
      router.replace('/login');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Initialization failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative"
      style={{
        background: 'linear-gradient(135deg, var(--nims-sidebar) 0%, var(--nims-primary) 55%, #071321 100%)',
      }}
    >
      <div className="fixed top-4 right-4 z-40">
        <PreferenceControls variant="floating" />
      </div>
      <div className="w-full max-w-lg rounded-2xl bg-[var(--nims-surface)] text-[var(--nims-text)] shadow-2xl border border-[var(--nims-border)] overflow-hidden">
        <div style={{ backgroundColor: 'var(--nims-sidebar)' }} className="px-8 py-6 text-white flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-white/10 border border-white/25 flex items-center justify-center">
            <Network className="h-6 w-6 text-blue-300" />
          </div>
          <div>
            <h1 className="text-xl font-bold">{t('setup.title')}</h1>
            <p className="text-xs text-blue-200">{t('setup.subtitle')}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase text-[var(--nims-muted)] mb-1">
              {t('setup.orgName')}
            </label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                required
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--nims-border)] bg-[var(--nims-surface)] text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-[var(--nims-muted)] mb-1">
                {t('setup.fullName')}
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Network Administrator"
                className="w-full px-3 py-2 rounded-lg border border-[var(--nims-border)] bg-[var(--nims-surface)] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-[var(--nims-muted)] mb-1">
                {t('setup.username')}
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="sysadmin"
                className="w-full px-3 py-2 rounded-lg border border-[var(--nims-border)] bg-[var(--nims-surface)] text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-[var(--nims-muted)] mb-1">
              {t('setup.email')}
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="netadmin@company.local"
              className="w-full px-3 py-2 rounded-lg border border-[var(--nims-border)] bg-[var(--nims-surface)] text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-[var(--nims-muted)] mb-1">
                {t('setup.password')}
              </label>
              <input
                type="password"
                required
                minLength={10}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--nims-border)] bg-[var(--nims-surface)] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-[var(--nims-muted)] mb-1">
                {t('setup.confirmPassword')}
              </label>
              <input
                type="password"
                required
                minLength={10}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--nims-border)] bg-[var(--nims-surface)] text-sm"
              />
            </div>
          </div>

          <label className="flex items-center gap-2.5 text-sm pt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={createSampleSites}
              onChange={(e) => setCreateSampleSites(e.target.checked)}
              className="rounded border-slate-300"
            />
            <span>{t('setup.sampleSites')}</span>
          </label>

          <button
            type="submit"
            disabled={submitting}
            style={{ backgroundColor: 'var(--nims-secondary)' }}
            className="w-full py-2.5 px-4 rounded-lg text-white font-semibold text-sm flex items-center justify-center gap-2 transition hover:opacity-90 cursor-pointer"
          >
            <Shield className="h-4 w-4" />
            {submitting ? t('setup.submitting') : t('setup.submit')}
          </button>

          <div className="flex items-center gap-2 text-xs text-slate-500 pt-1">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>This setup wizard automatically locks permanently after the first Super Admin is created.</span>
          </div>
        </form>
      </div>
    </div>
  );
}

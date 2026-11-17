'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2, Lock, User } from 'lucide-react';
import { LoginHeroEmblem } from '@/components/icons/TechIcons';
import { apiFetch, ApiError } from '@/lib/api';
import { APP_META } from '@/lib/appMeta';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { PreferenceControls } from '@/components/layout/PreferenceControls';

export default function LoginPage() {
  const router = useRouter();
  const { user, needsSetup, loading, organizationName, refreshUser } = useAuth();
  const { t } = useI18n();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading) {
      if (needsSetup) router.replace('/setup');
      else if (user) router.replace('/');
    }
  }, [loading, needsSetup, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      await refreshUser();
      router.replace('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden"
      style={{
        background:
          'radial-gradient(circle at 20% 18%, color-mix(in srgb, var(--nims-secondary) 32%, var(--nims-sidebar)) 0%, var(--nims-sidebar) 48%, #020617 100%)',
      }}
    >
      {/* Subtle cyber engineering grid + ambient glows */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(56, 189, 248, 0.14) 1px, transparent 1px), linear-gradient(to bottom, rgba(56, 189, 248, 0.14) 1px, transparent 1px)',
          backgroundSize: '38px 38px',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-36 -right-32 h-[28rem] w-[28rem] rounded-full blur-3xl opacity-30"
        style={{ background: 'var(--nims-secondary)' }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-36 -left-32 h-[28rem] w-[28rem] rounded-full blur-3xl opacity-25 bg-cyan-500"
      />

      <div className="fixed top-4 right-4 z-40">
        <PreferenceControls variant="floating" />
      </div>

      <div className="relative z-10 w-full max-w-[430px] rounded-3xl bg-[var(--nims-surface)]/95 backdrop-blur-2xl text-[var(--nims-text)] shadow-[0_24px_64px_-16px_rgba(2,6,23,0.65)] border border-white/15 dark:border-[var(--nims-border)] overflow-hidden">
        {/* Top luminous gradient hairline */}
        <div
          aria-hidden="true"
          className="h-1 w-full bg-gradient-to-r from-sky-400 via-blue-500 to-cyan-400"
        />

        {/* Brand Header */}
        <div
          style={{
            background:
              'linear-gradient(145deg, var(--nims-sidebar) 0%, color-mix(in srgb, var(--nims-secondary) 38%, var(--nims-sidebar)) 100%)',
          }}
          className="px-7 sm:px-8 pt-7 pb-6 text-white relative overflow-hidden"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-cyan-400/10 blur-2xl"
          />

          <div className="relative flex items-start justify-between gap-3">
            <div className="flex items-center gap-4">
              <div className="relative h-16 w-16 rounded-2xl bg-gradient-to-br from-slate-900/90 via-slate-800/80 to-sky-950/80 border border-sky-400/35 flex items-center justify-center shadow-xl shadow-sky-500/20 shrink-0">
                <LoginHeroEmblem className="h-12 w-12" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-extrabold tracking-wider">NIMS</h1>
                  <span className="text-[10px] font-mono font-semibold uppercase px-2 py-0.5 rounded-full bg-cyan-400/15 text-cyan-200 border border-cyan-300/30">
                    NOC
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-slate-200 border border-white/15">
                    {APP_META.version}
                  </span>
                </div>
                <p className="text-xs text-cyan-200/85 mt-1 font-medium">
                  {organizationName || APP_META.shortName}
                </p>
              </div>
            </div>

            <span className="inline-flex items-center gap-1.5 text-[10px] font-mono px-2 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 shrink-0">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              ONLINE
            </span>
          </div>

          <p className="relative mt-4 text-xs sm:text-[13px] text-slate-200/85 leading-relaxed">
            {t('auth.subtitle')}
          </p>
        </div>

        {/* Sign-in Form */}
        <form onSubmit={handleSubmit} className="p-7 sm:p-8 space-y-5">
          {error && (
            <div className="rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-3.5 py-3 text-xs sm:text-sm text-red-700 dark:text-red-300 flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--nims-muted)] mb-1.5">
                {t('auth.usernameLabel')}
              </label>
              <div className="relative group">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--nims-muted)] group-focus-within:text-[var(--nims-secondary)] transition-colors" />
                <input
                  type="text"
                  required
                  autoFocus
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t('auth.usernamePlaceholder')}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[var(--nims-border)] bg-[var(--nims-surface)] text-sm focus:outline-none focus:border-[var(--nims-secondary)] focus:ring-4 focus:ring-[var(--nims-glow)] transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--nims-muted)] mb-1.5">
                {t('auth.passwordLabel')}
              </label>
              <div className="relative group">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--nims-muted)] group-focus-within:text-[var(--nims-secondary)] transition-colors" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('auth.passwordPlaceholder')}
                  className="w-full pl-10 pr-11 py-2.5 rounded-xl border border-[var(--nims-border)] bg-[var(--nims-surface)] text-sm focus:outline-none focus:border-[var(--nims-secondary)] focus:ring-4 focus:ring-[var(--nims-glow)] transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-[var(--nims-muted)] hover:text-[var(--nims-text)] hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            style={{
              background:
                'linear-gradient(135deg, var(--nims-secondary) 0%, color-mix(in srgb, var(--nims-secondary) 70%, #06b6d4) 100%)',
              boxShadow: '0 10px 24px -6px var(--nims-glow)',
            }}
            className="w-full py-3 px-4 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60 cursor-pointer"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t('auth.signingIn')}</span>
              </>
            ) : (
              <>
                <span>{t('auth.signIn')}</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>

          {/* System Name & Version Only */}
          <div className="pt-3 border-t border-[var(--nims-border)]/70 flex items-center justify-between gap-2 text-[11px] text-[var(--nims-muted)]">
            <span className="font-medium truncate">{APP_META.name}</span>
            <span className="font-mono font-semibold text-[var(--nims-text)]/80 shrink-0">
              {APP_META.version}
            </span>
          </div>
        </form>
      </div>

      {/* Author & License Attribution */}
      <div className="relative z-10 mt-4 text-center text-[11px] text-slate-400/80">
        {APP_META.license}
      </div>
    </div>
  );
}

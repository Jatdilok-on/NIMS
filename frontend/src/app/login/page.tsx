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
  const { user, needsSetup, loading, refreshUser } = useAuth();
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
      className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden select-none"
      style={{
        background:
          'radial-gradient(ellipse 80% 60% at 50% 0%, color-mix(in srgb, var(--nims-secondary) 28%, #071329) 0%, #040917 55%, #02050d 100%)',
      }}
    >
      {/* Perspective cyber engineering grid with radial fade */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-35"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(56, 189, 248, 0.16) 1px, transparent 1px), linear-gradient(to bottom, rgba(56, 189, 248, 0.16) 1px, transparent 1px)',
          backgroundSize: '42px 42px',
          maskImage: 'radial-gradient(circle at 50% 45%, black 25%, transparent 78%)',
          WebkitMaskImage: 'radial-gradient(circle at 50% 45%, black 25%, transparent 78%)',
        }}
      />

      {/* Ambient futuristic aura orbs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[30rem] w-[42rem] rounded-full blur-[120px] opacity-30"
        style={{ background: 'linear-gradient(90deg, var(--nims-secondary), #06b6d4)' }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-44 -left-32 h-[26rem] w-[26rem] rounded-full blur-[110px] opacity-20 bg-indigo-500"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-44 -right-32 h-[26rem] w-[26rem] rounded-full blur-[110px] opacity-20 bg-cyan-400"
      />

      {/* Faint decorative network topology lines */}
      <svg
        aria-hidden="true"
        viewBox="0 0 1200 800"
        fill="none"
        className="pointer-events-none absolute inset-0 w-full h-full opacity-[0.12]"
      >
        <path
          d="M120 180 L340 280 L520 140 L760 240 L1040 160"
          stroke="#38bdf8"
          strokeWidth="1"
          strokeDasharray="4 6"
        />
        <path
          d="M160 640 L410 540 L680 650 L980 520 L1110 620"
          stroke="#22d3ee"
          strokeWidth="1"
          strokeDasharray="4 6"
        />
        <circle cx="340" cy="280" r="3" fill="#38bdf8" />
        <circle cx="760" cy="240" r="3" fill="#22d3ee" />
        <circle cx="410" cy="540" r="3" fill="#38bdf8" />
        <circle cx="980" cy="520" r="3" fill="#22d3ee" />
      </svg>

      {/* Theme & Language Floating Controls */}
      <div className="fixed top-4 right-4 z-40">
        <PreferenceControls variant="floating" />
      </div>

      {/* Futuristic Luminous Glass Card */}
      <div className="relative z-10 w-full max-w-[410px] p-[1px] rounded-[28px] bg-gradient-to-b from-sky-400/50 via-blue-500/20 to-cyan-400/35 shadow-[0_32px_90px_-18px_rgba(2,6,23,0.92),0_0_50px_-15px_var(--nims-glow)]">
        <div className="relative rounded-[27px] bg-[#071124]/88 backdrop-blur-2xl text-slate-100 overflow-hidden">
          {/* Top laser highlight */}
          <div
            aria-hidden="true"
            className="h-[2px] w-full bg-gradient-to-r from-transparent via-cyan-300 to-transparent opacity-90"
          />

          {/* Subtle corner HUD brackets */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-3.5 left-3.5 h-3.5 w-3.5 border-t border-l border-cyan-400/45 rounded-tl-md"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-3.5 right-3.5 h-3.5 w-3.5 border-t border-r border-cyan-400/45 rounded-tr-md"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-3.5 left-3.5 h-3.5 w-3.5 border-b border-l border-sky-400/30 rounded-bl-md"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-3.5 right-3.5 h-3.5 w-3.5 border-b border-r border-sky-400/30 rounded-br-md"
          />

          {/* Minimal Futuristic Emblem + NIMS Header */}
          <div className="relative px-8 pt-9 pb-5 flex flex-col items-center text-center">
            <div className="relative flex items-center justify-center mb-4">
              {/* Soft glow halo */}
              <div
                aria-hidden="true"
                className="absolute h-24 w-24 rounded-full bg-cyan-400/20 blur-xl"
              />
              {/* Orbiting dashed ring */}
              <div
                aria-hidden="true"
                className="absolute h-[84px] w-[84px] rounded-full border border-dashed border-sky-400/40 motion-safe:animate-[spin_28s_linear_infinite]"
              />
              {/* Emblem pod */}
              <div className="relative h-16 w-16 rounded-2xl bg-gradient-to-br from-slate-900/95 via-slate-800/80 to-sky-950/90 border border-sky-300/35 flex items-center justify-center shadow-[0_0_28px_rgba(56,189,248,0.28),inset_0_1px_0_rgba(255,255,255,0.16)]">
                <LoginHeroEmblem className="h-11 w-11" />
              </div>
            </div>

            <h1 className="text-[26px] font-black tracking-[0.32em] pl-[0.32em] bg-gradient-to-r from-white via-sky-100 to-cyan-300 bg-clip-text text-transparent drop-shadow-[0_2px_12px_rgba(56,189,248,0.3)]">
              NIMS
            </h1>

            {/* Glowing hairline separator */}
            <div
              aria-hidden="true"
              className="mt-5 h-px w-full bg-gradient-to-r from-transparent via-sky-400/35 to-transparent"
            />
          </div>

          {/* Sign-in Form */}
          <form onSubmit={handleSubmit} className="px-8 pb-8 pt-2 space-y-5 select-text">
            {error && (
              <div className="rounded-xl bg-red-950/60 border border-red-500/40 px-3.5 py-3 text-xs sm:text-sm text-red-200 flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 mb-2">
                  {t('auth.usernameLabel')}
                </label>
                <div className="relative group">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-cyan-300 transition-colors" />
                  <input
                    type="text"
                    required
                    autoFocus
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t('auth.usernamePlaceholder')}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-700/70 bg-slate-900/75 text-sm text-slate-100 placeholder:text-slate-500 shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)] focus:outline-none focus:border-cyan-400/80 focus:bg-slate-900/95 focus:ring-4 focus:ring-cyan-400/15 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 mb-2">
                  {t('auth.passwordLabel')}
                </label>
                <div className="relative group">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-cyan-300 transition-colors" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('auth.passwordPlaceholder')}
                    className="w-full pl-10 pr-11 py-3 rounded-xl border border-slate-700/70 bg-slate-900/75 text-sm text-slate-100 placeholder:text-slate-500 shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)] focus:outline-none focus:border-cyan-400/80 focus:bg-slate-900/95 focus:ring-4 focus:ring-cyan-400/15 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-cyan-200 hover:bg-slate-800/80 transition cursor-pointer"
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
                  'linear-gradient(135deg, var(--nims-secondary) 0%, color-mix(in srgb, var(--nims-secondary) 55%, #06b6d4) 100%)',
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,0.28), 0 12px 28px -6px var(--nims-glow)',
              }}
              className="group relative w-full py-3.5 px-4 rounded-xl text-white font-semibold text-sm tracking-wide flex items-center justify-center gap-2 overflow-hidden transition-all duration-200 hover:brightness-110 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0 cursor-pointer"
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent"
              />
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{t('auth.signingIn')}</span>
                </>
              ) : (
                <>
                  <span>{t('auth.signIn')}</span>
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Author & License Attribution */}
      <div className="relative z-10 mt-5 text-center text-[11px] tracking-wide text-slate-400/65">
        {APP_META.license}
      </div>
    </div>
  );
}

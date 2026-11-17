'use client';

import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, Lock, LogOut, X } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';

export function ChangePasswordModal({
  forced = false,
  onClose,
}: {
  forced?: boolean;
  onClose?: () => void;
}) {
  const { user, refreshUser, logout } = useAuth();
  const { t } = useI18n();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 10) {
      setError(t('auth.pwdMinLengthErr'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('auth.pwdMismatchErr'));
      return;
    }
    if (newPassword === currentPassword) {
      setError(t('auth.pwdSameErr'));
      return;
    }

    setSaving(true);
    try {
      await apiFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setSuccess(true);
      await refreshUser();
      if (!forced && onClose) {
        setTimeout(() => onClose(), 700);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[var(--nims-surface)] text-[var(--nims-text)] rounded-3xl max-w-md w-full border border-[var(--nims-border)] shadow-2xl overflow-hidden">
        <div
          style={{
            background:
              'linear-gradient(135deg, var(--nims-sidebar) 0%, color-mix(in srgb, var(--nims-secondary) 38%, var(--nims-sidebar)) 100%)',
          }}
          className="px-6 py-5 text-white flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-white/12 border border-white/25 flex items-center justify-center shrink-0">
              <KeyRound className="h-5 w-5 text-cyan-300" />
            </div>
            <div>
              <h3 className="font-bold text-base">
                {forced ? t('auth.firstLoginTitle') : t('auth.changePasswordTitle')}
              </h3>
              <p className="text-xs text-cyan-200/85">
                @{user?.username} • {user?.fullName}
              </p>
            </div>
          </div>
          {!forced && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-sm">
          {forced && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
              {t('auth.firstLoginNotice')}
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-3.5 py-2.5 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-3.5 py-2.5 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{t('auth.pwdUpdatedMsg')}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[var(--nims-muted)] mb-1">
              {forced ? t('auth.tempPasswordLabel') : t('auth.currentPasswordLabel')} *
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--nims-muted)]" />
              <input
                type={showCurrent ? 'text' : 'password'}
                required
                autoFocus
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full pl-9 pr-10 py-2 rounded-xl border border-[var(--nims-border)] bg-transparent focus:outline-none focus:border-[var(--nims-secondary)]"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowCurrent((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[var(--nims-muted)] hover:text-[var(--nims-text)] cursor-pointer"
              >
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--nims-muted)] mb-1">
              {t('auth.newPasswordLabel')} *
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--nims-muted)]" />
              <input
                type={showNew ? 'text' : 'password'}
                required
                minLength={10}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t('auth.newPasswordPlaceholder')}
                className="w-full pl-9 pr-10 py-2 rounded-xl border border-[var(--nims-border)] bg-transparent focus:outline-none focus:border-[var(--nims-secondary)]"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowNew((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[var(--nims-muted)] hover:text-[var(--nims-text)] cursor-pointer"
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--nims-muted)] mb-1">
              {t('auth.confirmNewPasswordLabel')} *
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--nims-muted)]" />
              <input
                type={showNew ? 'text' : 'password'}
                required
                minLength={10}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-[var(--nims-border)] bg-transparent focus:outline-none focus:border-[var(--nims-secondary)]"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            {forced ? (
              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[var(--nims-border)] text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                {t('header.signOut')}
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-[var(--nims-border)] text-xs font-medium cursor-pointer"
              >
                {t('common.cancel')}
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold disabled:opacity-60 cursor-pointer"
            >
              {saving ? t('common.saving') : t('auth.setNewPasswordBtn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

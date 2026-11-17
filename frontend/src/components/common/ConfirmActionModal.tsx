'use client';

import React, { useEffect } from 'react';
import { AlertTriangle, RotateCcw, Trash2, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export interface ConfirmActionDetail {
  label: string;
  value: string;
}

export interface ConfirmActionModalProps {
  title: string;
  subtitle?: string;
  itemName?: string;
  badgeText?: string;
  details?: ConfirmActionDetail[];
  message?: string;
  variant?: 'danger' | 'warning';
  confirmLabel?: string;
  loadingLabel?: string;
  loading?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}

/**
 * Centered confirmation modal replacing native browser confirm() dialogs
 * for destructive delete and restore actions across NIMS panels.
 */
export function ConfirmActionModal({
  title,
  subtitle,
  itemName,
  badgeText,
  details = [],
  message,
  variant = 'danger',
  confirmLabel,
  loadingLabel,
  loading = false,
  error,
  onCancel,
  onConfirm,
}: ConfirmActionModalProps) {
  const { t } = useI18n();
  const isWarning = variant === 'warning';

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [loading, onCancel]);

  const resolvedConfirmLabel =
    confirmLabel ?? (isWarning ? 'Restore' : t('common.delete'));
  const resolvedLoadingLabel =
    loadingLabel ?? (isWarning ? 'Restoring...' : 'Deleting...');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={() => {
        if (!loading) onCancel();
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                isWarning
                  ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400'
                  : 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400'
              }`}
            >
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                {title}
              </h3>
              {subtitle && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {(itemName || badgeText || details.length > 0) && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                {itemName && (
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 break-all">
                    {itemName}
                  </p>
                )}
                {badgeText && (
                  <span className="shrink-0 rounded-full bg-slate-200/80 dark:bg-slate-700 px-2.5 py-0.5 text-[11px] font-medium text-slate-700 dark:text-slate-200">
                    {badgeText}
                  </span>
                )}
              </div>
              {details.length > 0 && (
                <div className="grid grid-cols-1 gap-1.5 pt-1 border-t border-slate-200/70 dark:border-slate-700/70 text-xs">
                  {details.map((d) => (
                    <div
                      key={`${d.label}-${d.value}`}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="text-slate-500 dark:text-slate-400 shrink-0">
                        {d.label}
                      </span>
                      <span className="font-medium text-slate-800 dark:text-slate-200 text-right break-all">
                        {d.value}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {message && (
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
              {message}
            </p>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80">
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 cursor-pointer"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 cursor-pointer ${
              isWarning
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {isWarning ? (
              <RotateCcw className="h-4 w-4" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {loading ? resolvedLoadingLabel : resolvedConfirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Globe2, Palette } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { SUPPORTED_LANGUAGES, useI18n } from '@/lib/i18n';
import { NIMS_THEMES, ThemeId } from '@/lib/themes';

export function PreferenceControls({ variant = 'header' }: { variant?: 'header' | 'floating' }) {
  const { theme, setTheme } = useAuth();
  const { lang, setLang, t } = useI18n();
  const [openMenu, setOpenMenu] = useState<'lang' | 'theme' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const currentLang = SUPPORTED_LANGUAGES.find((l) => l.code === lang) ?? SUPPORTED_LANGUAGES[0];
  const currentTheme = NIMS_THEMES.find((th) => th.id === theme) ?? NIMS_THEMES[0];

  const buttonClass =
    variant === 'floating'
      ? 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white border border-white/20 text-xs font-medium backdrop-blur transition cursor-pointer'
      : 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--nims-border)] bg-[var(--nims-surface)] hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium transition cursor-pointer';

  return (
    <div ref={containerRef} className="relative flex items-center gap-2">
      {/* Language Selector */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpenMenu(openMenu === 'lang' ? null : 'lang')}
          title={t('header.language')}
          className={buttonClass}
        >
          <Globe2 className="h-3.5 w-3.5 shrink-0" />
          <span>{currentLang.shortLabel}</span>
          <ChevronDown className="h-3 w-3 opacity-70" />
        </button>

        {openMenu === 'lang' && (
          <div className="absolute right-0 mt-2 w-44 rounded-xl bg-[var(--nims-surface)] text-[var(--nims-text)] border border-[var(--nims-border)] shadow-xl py-1.5 z-50">
            <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--nims-muted)]">
              {t('header.language')}
            </div>
            {SUPPORTED_LANGUAGES.map((item) => (
              <button
                key={item.code}
                type="button"
                onClick={() => {
                  setLang(item.code);
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-2 text-left text-xs flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <span className="font-medium">{item.label}</span>
                {lang === item.code && <Check className="h-3.5 w-3.5 text-blue-600" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Multi-Theme Selector */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpenMenu(openMenu === 'theme' ? null : 'theme')}
          title={t('header.theme')}
          className={buttonClass}
        >
          <span
            className="h-3 w-3 rounded-full border border-white/40 shrink-0"
            style={{ backgroundColor: currentTheme.accentHex }}
          />
          <Palette className="h-3.5 w-3.5 shrink-0 hidden sm:inline" />
          <span className="hidden md:inline max-w-[110px] truncate">{currentTheme.name}</span>
          <ChevronDown className="h-3 w-3 opacity-70" />
        </button>

        {openMenu === 'theme' && (
          <div className="absolute right-0 mt-2 w-56 rounded-xl bg-[var(--nims-surface)] text-[var(--nims-text)] border border-[var(--nims-border)] shadow-xl py-1.5 z-50">
            <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--nims-muted)]">
              {t('header.theme')}
            </div>
            {NIMS_THEMES.map((item) => {
              const labelKey = `theme.${item.id}` as Parameters<typeof t>[0];
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setTheme(item.id as ThemeId);
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="flex items-center -space-x-1 shrink-0">
                      <span
                        className="h-3.5 w-3.5 rounded-full border border-slate-300 dark:border-slate-600"
                        style={{ backgroundColor: item.sidebarHex }}
                      />
                      <span
                        className="h-3.5 w-3.5 rounded-full border border-slate-300 dark:border-slate-600"
                        style={{ backgroundColor: item.accentHex }}
                      />
                    </span>
                    <span className="truncate font-medium">{t(labelKey)}</span>
                  </span>
                  {theme === item.id && <Check className="h-3.5 w-3.5 text-blue-600 shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

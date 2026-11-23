'use client';

import React from 'react';
import { Building2, Search, X } from 'lucide-react';
import { Site } from '@/lib/types';

export function SearchInputWithClear({
  value,
  onChange,
  placeholder,
  className = '',
  inputClassName = '',
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  className?: string;
  inputClassName?: string;
  ariaLabel?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
        className={`w-full pl-9 pr-8 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:border-blue-500 transition ${inputClassName}`}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          title="ล้างคำค้นหา"
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function SiteSelectControl({
  sites,
  value,
  onChange,
  countsBySite,
  totalCount,
  allLabel = 'ทุก Site',
  className = '',
}: {
  sites: Site[];
  value: string;
  onChange: (nextSiteId: string) => void;
  countsBySite?: Map<string, number>;
  totalCount?: number;
  allLabel?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Filter by Site"
        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold cursor-pointer"
      >
        <option value="">
          {allLabel}
          {totalCount !== undefined ? ` (${totalCount})` : ''}
        </option>
        {sites.map((s) => {
          const count = countsBySite?.get(s.id);
          return (
            <option key={s.id} value={s.id}>
              {s.siteCode} — {s.siteName}
              {count !== undefined ? ` (${count})` : ''}
            </option>
          );
        })}
      </select>
    </div>
  );
}

export function SiteQuickPills({
  sites,
  value,
  onChange,
  countsBySite,
  totalCount,
  allLabel = 'ทั้งหมด',
  hideEmptySites = true,
}: {
  sites: Site[];
  value: string;
  onChange: (nextSiteId: string) => void;
  countsBySite?: Map<string, number>;
  totalCount?: number;
  allLabel?: string;
  hideEmptySites?: boolean;
}) {
  const pillSites = hideEmptySites && countsBySite
    ? sites.filter((s) => (countsBySite.get(s.id) ?? 0) > 0)
    : sites;

  if (pillSites.length <= 1) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange('')}
        className={`px-3 py-1 rounded-full text-xs font-semibold transition cursor-pointer ${
          value === ''
            ? 'bg-[#0f2942] text-white shadow-sm'
            : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
        }`}
      >
        {allLabel}
        {totalCount !== undefined ? ` (${totalCount})` : ''}
      </button>
      {pillSites.map((s) => {
        const count = countsBySite?.get(s.id);
        const active = value === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(active ? '' : s.id)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition cursor-pointer ${
              active
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            {s.siteCode}
            {count !== undefined ? ` (${count})` : ''}
          </button>
        );
      })}
    </div>
  );
}

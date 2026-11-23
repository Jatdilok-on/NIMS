'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ClipboardCheck, KeyRound, LogOut, Menu, Search, ShieldAlert, X } from 'lucide-react';
import {
  DeviceCategoryTechIcon,
  TechAuditIcon,
  TechDashboardIcon,
  TechDeviceAllIcon,
  TechDocumentIcon,
  TechIpamIcon,
  TechLogoMark,
  TechSettingsIcon,
  TechSiteNodeIcon,
  TechTopologyIcon,
  TechUsersIcon,
  TechVaultIcon,
} from '@/components/icons/TechIcons';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { apiFetch } from '@/lib/api';
import { APP_META } from '@/lib/appMeta';
import { Device } from '@/lib/types';
import { PreferenceControls } from './PreferenceControls';
import { ChangePasswordModal } from '@/components/auth/ChangePasswordModal';

function RunbookMenuIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return <ClipboardCheck className={className} />;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, organizationName, logout } = useAuth();
  const { t } = useI18n();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{
    devices: Device[];
    subnets: Array<{ id: string; cidr: string; vlanNumber?: number | null; site?: { id: string; siteCode: string } }>;
    documents?: Array<{
      id: string;
      siteId: string;
      documentName: string;
      originalFileName: string;
      documentType: string;
      site?: { id: string; siteCode: string };
    }>;
    diagrams?: Array<{
      id: string;
      siteId: string;
      title: string;
      kind: string;
      site?: { id: string; siteCode: string };
    }>;
  } | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await apiFetch<{
          devices: Device[];
          subnets: Array<{ id: string; cidr: string; vlanNumber?: number | null; site?: { id: string; siteCode: string } }>;
          documents?: Array<{
            id: string;
            siteId: string;
            documentName: string;
            originalFileName: string;
            documentType: string;
            site?: { id: string; siteCode: string };
          }>;
          diagrams?: Array<{
            id: string;
            siteId: string;
            title: string;
            kind: string;
            site?: { id: string; siteCode: string };
          }>;
        }>(`/devices/global-search?q=${encodeURIComponent(q)}`);
        setSearchResults(res);
      } catch {
        setSearchResults(null);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  if (!user) return null;

  const isSuperAdmin = user.roleCode === 'SUPER_ADMIN';
  const isSiteAdmin = user.roleCode === 'SITE_ADMIN';
  const isIpViewer = user.roleCode === 'IP_VIEWER';

  const navItems = [
    { href: '/', label: t('nav.dashboard'), icon: TechDashboardIcon, show: true },
    { href: '/sites', label: t('nav.sites'), icon: TechSiteNodeIcon, show: true },
    { href: '/inventory', label: t('nav.inventory'), icon: TechDeviceAllIcon, show: true },
    { href: '/ipam', label: t('nav.ipam'), icon: TechIpamIcon, show: true },
    { href: '/diagrams', label: t('nav.diagrams'), icon: TechTopologyIcon, show: true },
    { href: '/documents', label: t('nav.documents'), icon: TechDocumentIcon, show: true },
    { href: '/credentials', label: t('nav.credentials'), icon: TechVaultIcon, show: !isIpViewer },
    { href: '/runbook', label: t('nav.runbook'), icon: RunbookMenuIcon, show: true },
    { href: '/audit-logs', label: t('nav.auditLogs'), icon: TechAuditIcon, show: isSuperAdmin || isSiteAdmin },
    { href: '/users', label: t('nav.users'), icon: TechUsersIcon, show: isSuperAdmin },
    { href: '/settings', label: t('nav.settings'), icon: TechSettingsIcon, show: isSuperAdmin },
  ].filter((item) => item.show);

  const initials = (user.fullName || user.username)
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  return (
    <div className="min-h-screen flex bg-[var(--nims-bg)] text-[var(--nims-text)] print:block print:bg-white print:text-slate-900">
      {/* Desktop Command Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:h-screen lg:sticky lg:top-0 bg-[var(--nims-sidebar)] text-white shrink-0 border-r border-[var(--nims-sidebar-border)] overflow-hidden print:hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -left-16 h-60 w-60 rounded-full blur-3xl opacity-25"
          style={{ background: 'var(--nims-secondary)' }}
        />

        <div className="relative h-16 px-4 flex items-center justify-between gap-2 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center shadow-lg shadow-sky-500/15 shrink-0">
              <TechLogoMark className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="font-bold text-sm tracking-wider flex items-center gap-1.5">
                <span>NIMS</span>
                <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-cyan-400/15 text-cyan-300 border border-cyan-400/30">
                  NOC
                </span>
              </div>
              <div className="text-[11px] text-slate-300/80 truncate">{organizationName}</div>
            </div>
          </div>
        </div>

        <nav className="relative flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={
                  active
                    ? {
                        background:
                          'linear-gradient(90deg, var(--nims-secondary) 0%, color-mix(in srgb, var(--nims-secondary) 75%, #06b6d4) 100%)',
                        boxShadow: '0 6px 18px -6px var(--nims-glow)',
                      }
                    : undefined
                }
                className={`group relative flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  active
                    ? 'text-white font-semibold'
                    : 'text-slate-300/90 hover:bg-white/8 hover:text-white hover:translate-x-0.5'
                }`}
              >
                <span
                  className={`h-7 w-7 rounded-lg flex items-center justify-center transition ${
                    active
                      ? 'bg-white/18 text-white'
                      : 'bg-white/5 text-slate-300 group-hover:bg-white/12 group-hover:text-cyan-300'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                </span>
                <span className="truncate">{item.label}</span>
                {active && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-white shadow-sm shadow-white" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="relative p-3.5 border-t border-white/10 bg-black/20 shrink-0">
          <div className="flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="h-9 w-9 rounded-xl flex items-center justify-center text-xs font-bold text-white shrink-0 border border-white/20"
                style={{
                  background:
                    'linear-gradient(135deg, var(--nims-secondary) 0%, #0ea5e9 100%)',
                }}
              >
                {initials || 'OP'}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold truncate">{user.fullName}</div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-300/90 truncate">
                  {user.roleName}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setShowChangePassword(true)}
                title={t('auth.changePasswordTitle')}
                className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/15 transition cursor-pointer"
              >
                <KeyRound className="h-4 w-4" />
              </button>
              <button
                onClick={logout}
                title={t('header.signOut')}
                className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/15 transition cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-400/85">
            <span className="truncate">© {APP_META.author}</span>
            <span className="font-mono shrink-0">{APP_META.version}</span>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex print:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-[var(--nims-sidebar)] text-white flex flex-col z-10 h-full border-r border-white/10">
            <div className="h-16 px-4 flex items-center justify-between border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <TechLogoMark className="h-6 w-6" />
                <span className="font-bold text-sm tracking-wide">NIMS NOC</span>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active =
                  item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={active ? { backgroundColor: 'var(--nims-secondary)' } : undefined}
                    className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium ${
                      active ? 'text-white shadow-md' : 'text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="p-4 border-t border-white/10 flex items-center justify-between gap-2 shrink-0">
              <div className="text-xs min-w-0">
                <div className="font-semibold truncate">{user.fullName}</div>
                <div className="text-blue-300 truncate">{user.roleName}</div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setShowChangePassword(true);
                  }}
                  title={t('auth.changePasswordTitle')}
                  className="p-2 rounded bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={logout}
                  className="px-3 py-1.5 rounded bg-red-600/80 text-xs font-medium cursor-pointer"
                >
                  {t('header.signOut')}
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Column */}
      <div className="flex-1 flex flex-col min-w-0 nims-cyber-bg print:bg-none">
        <header className="h-16 nims-glass-header border-b border-[var(--nims-border)] px-4 lg:px-6 flex items-center justify-between gap-3 sticky top-0 z-30 print:hidden">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl border border-[var(--nims-border)] bg-[var(--nims-surface)] hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Global Command Search */}
            <div className="relative flex-1 max-w-xl">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--nims-muted)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('header.searchPlaceholder')}
                className="w-full pl-10 pr-9 py-2 rounded-xl bg-[var(--nims-surface)]/80 border border-[var(--nims-border)] focus:border-[var(--nims-secondary)] focus:ring-2 focus:ring-[var(--nims-glow)] text-sm focus:outline-none transition"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults(null);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}

              {searchResults && (
                <div className="absolute left-0 right-0 mt-2 rounded-2xl bg-[var(--nims-surface)] shadow-2xl border border-[var(--nims-border)] max-h-96 overflow-y-auto z-50">
                  <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--nims-muted)] border-b border-[var(--nims-border)] flex justify-between">
                    <span>{t('header.searchResults')}</span>
                    {searching && <span>{t('header.searching')}</span>}
                  </div>
                  {searchResults.devices.length === 0 &&
                  searchResults.subnets.length === 0 &&
                  (searchResults.documents?.length ?? 0) === 0 &&
                  (searchResults.diagrams?.length ?? 0) === 0 ? (
                    <div className="p-4 text-sm text-[var(--nims-muted)] text-center">
                      {t('header.noSearchResults')}
                    </div>
                  ) : (
                    <div className="divide-y divide-[var(--nims-border)]">
                      {searchResults.devices.map((dev) => (
                        <button
                          key={dev.id}
                          onClick={() => {
                            setSearchResults(null);
                            setSearchQuery('');
                            router.push(`/sites/${dev.siteId}?tab=inventory&deviceId=${dev.id}`);
                          }}
                          className="w-full text-left px-4 py-2.5 hover:bg-slate-500/8 flex items-center justify-between gap-3 cursor-pointer transition"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="h-8 w-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                              <DeviceCategoryTechIcon category={dev.category} className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold truncate">
                                {dev.name}{' '}
                                <span className="text-xs font-normal text-[var(--nims-muted)]">
                                  ({dev.model || dev.category})
                                </span>
                              </div>
                              <div className="text-xs text-[var(--nims-muted)] font-mono truncate">
                                IP: {dev.managementIp || '-'} • MAC: {dev.macAddress || '-'} • {dev.location || '-'}
                              </div>
                            </div>
                          </div>
                          <span className="px-2 py-0.5 rounded-md bg-blue-500/12 text-blue-500 text-xs font-semibold shrink-0">
                            {dev.site?.siteCode}
                          </span>
                        </button>
                      ))}
                      {searchResults.subnets.map((sub) => (
                        <button
                          key={sub.id}
                          onClick={() => {
                            setSearchResults(null);
                            setSearchQuery('');
                            router.push(`/sites/${sub.site?.id}?tab=ipam`);
                          }}
                          className="w-full text-left px-4 py-2.5 hover:bg-slate-500/8 flex items-center justify-between gap-3 cursor-pointer transition"
                        >
                          <div className="flex items-center gap-3">
                            <span className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                              <TechIpamIcon className="h-4 w-4" />
                            </span>
                            <div>
                              <div className="text-sm font-semibold font-mono">Subnet {sub.cidr}</div>
                              <div className="text-xs text-[var(--nims-muted)]">
                                VLAN {sub.vlanNumber || '-'}
                              </div>
                            </div>
                          </div>
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/12 text-emerald-500 text-xs font-semibold">
                            {sub.site?.siteCode}
                          </span>
                        </button>
                      ))}
                      {(searchResults.diagrams ?? []).map((diag) => (
                        <button
                          key={diag.id}
                          onClick={() => {
                            setSearchResults(null);
                            setSearchQuery('');
                            router.push(`/sites/${diag.siteId}?tab=diagram`);
                          }}
                          className="w-full text-left px-4 py-2.5 hover:bg-slate-500/8 flex items-center justify-between gap-3 cursor-pointer transition"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="h-8 w-8 rounded-lg bg-violet-500/10 text-violet-500 flex items-center justify-center shrink-0">
                              <TechTopologyIcon className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold truncate">{diag.title}</div>
                              <div className="text-xs text-[var(--nims-muted)]">
                                Diagram ({diag.kind})
                              </div>
                            </div>
                          </div>
                          <span className="px-2 py-0.5 rounded-md bg-violet-500/12 text-violet-500 text-xs font-semibold shrink-0">
                            {diag.site?.siteCode}
                          </span>
                        </button>
                      ))}
                      {(searchResults.documents ?? []).map((doc) => (
                        <button
                          key={doc.id}
                          onClick={() => {
                            setSearchResults(null);
                            setSearchQuery('');
                            router.push(`/sites/${doc.siteId}?tab=documents`);
                          }}
                          className="w-full text-left px-4 py-2.5 hover:bg-slate-500/8 flex items-center justify-between gap-3 cursor-pointer transition"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="h-8 w-8 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                              <TechDocumentIcon className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold truncate">{doc.documentName}</div>
                              <div className="text-xs text-[var(--nims-muted)] truncate">
                                {doc.documentType} • {doc.originalFileName}
                              </div>
                            </div>
                          </div>
                          <span className="px-2 py-0.5 rounded-md bg-teal-500/12 text-teal-600 dark:text-teal-400 text-xs font-semibold shrink-0">
                            {doc.site?.siteCode}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {isIpViewer && (
              <span className="hidden md:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">
                <ShieldAlert className="h-3.5 w-3.5" />
                {t('header.ipViewerMode')}
              </span>
            )}
            <PreferenceControls variant="header" />
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 pb-20 lg:pb-6 overflow-x-hidden print:p-0 print:overflow-visible">{children}</main>

        {/* Mobile Bottom Navigation */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 nims-glass-header border-t border-[var(--nims-border)] flex justify-around py-1.5 z-30 print:hidden">
          {[
            { href: '/', label: t('nav.home'), icon: TechDashboardIcon },
            { href: '/sites', label: t('nav.sites'), icon: TechSiteNodeIcon },
            { href: '/inventory', label: t('nav.devices'), icon: TechDeviceAllIcon },
            { href: '/ipam', label: t('nav.ipamShort'), icon: TechIpamIcon },
            { href: '/diagrams', label: t('nav.diagramsShort'), icon: TechTopologyIcon },
          ].map((item) => {
            const Icon = item.icon;
            const active =
              item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl text-[11px] font-medium transition ${
                  active ? 'text-[var(--nims-secondary)]' : 'text-[var(--nims-muted)]'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {(user.mustChangePassword || showChangePassword) && (
        <ChangePasswordModal
          forced={Boolean(user.mustChangePassword)}
          onClose={() => setShowChangePassword(false)}
        />
      )}
    </div>
  );
}

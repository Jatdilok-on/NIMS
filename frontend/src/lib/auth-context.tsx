'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiFetch } from './api';
import { UserProfile } from './types';
import { getThemeDefinition, isValidThemeId, ThemeId } from './themes';

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  needsSetup: boolean;
  organizationName: string;
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  toggleTheme: () => void;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [organizationName, setOrganizationName] = useState('NIMS Enterprise');
  const [theme, setThemeState] = useState<ThemeId>('light');

  const applyTheme = useCallback((nextTheme: ThemeId) => {
    const def = getThemeDefinition(nextTheme);
    setThemeState(def.id);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', def.id);
      document.documentElement.classList.toggle('dark', def.isDark);
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('nims_theme', def.id);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    const current = getThemeDefinition(theme);
    applyTheme(current.isDark ? 'light' : 'dark');
  }, [theme, applyTheme]);

  const refreshUser = useCallback(async () => {
    try {
      const [setupResult, meResult] = await Promise.allSettled([
        apiFetch<{ needsSetup: boolean; organizationName: string }>('/setup/status'),
        apiFetch<{ user: UserProfile }>('/auth/me'),
      ]);

      if (setupResult.status === 'fulfilled') {
        setNeedsSetup(setupResult.value.needsSetup);
        if (setupResult.value.organizationName) {
          setOrganizationName(setupResult.value.organizationName);
        }
        if (setupResult.value.needsSetup) {
          setUser(null);
          return;
        }
      }

      if (meResult.status === 'fulfilled') {
        setUser(meResult.value.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const savedTheme =
      typeof localStorage !== 'undefined' ? localStorage.getItem('nims_theme') : null;
    if (isValidThemeId(savedTheme)) {
      applyTheme(savedTheme);
    } else {
      applyTheme('light');
    }
    refreshUser();
  }, [applyTheme, refreshUser]);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    } finally {
      setUser(null);
      window.location.href = '/login';
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        needsSetup,
        organizationName,
        theme,
        setTheme: applyTheme,
        toggleTheme,
        refreshUser,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

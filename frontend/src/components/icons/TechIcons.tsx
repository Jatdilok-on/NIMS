'use client';

import React, { useId } from 'react';
import { DeviceCategory } from '@/lib/types';

export interface TechIconProps {
  className?: string;
}

export function TechLogoMark({ className = 'w-6 h-6' }: TechIconProps) {
  const uid = useId().replace(/:/g, '');
  const gradId = `nims-logo-${uid}`;
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="4" y1="3" x2="28" y2="29" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="55%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <path
        d="M16 2.5L27.5 9.15V22.85L16 29.5L4.5 22.85V9.15L16 2.5Z"
        fill={`url(#${gradId})`}
        fillOpacity="0.16"
        stroke={`url(#${gradId})`}
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M16 7.5V16M16 16L9.5 20M16 16L22.5 20M9.5 11.5L16 16L22.5 11.5"
        stroke={`url(#${gradId})`}
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="16" cy="7.5" r="2" fill="#38bdf8" />
      <circle cx="9.5" cy="11.5" r="1.75" fill="#60a5fa" />
      <circle cx="22.5" cy="11.5" r="1.75" fill="#22d3ee" />
      <circle cx="9.5" cy="20" r="1.75" fill="#38bdf8" />
      <circle cx="22.5" cy="20" r="1.75" fill="#60a5fa" />
      <circle cx="16" cy="16" r="2.6" fill="#ffffff" stroke={`url(#${gradId})`} strokeWidth="1.5" />
    </svg>
  );
}

export function LoginHeroEmblem({ className = 'w-12 h-12' }: TechIconProps) {
  const uid = useId().replace(/:/g, '');
  const outerGrad = `login-outer-${uid}`;
  const innerGrad = `login-inner-${uid}`;
  const glowGrad = `login-glow-${uid}`;
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={outerGrad} x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="50%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
        <linearGradient id={innerGrad} x1="16" y1="14" x2="48" y2="50" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#e0f2fe" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
        <radialGradient id={glowGrad} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#0284c7" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="29" fill={`url(#${glowGrad})`} />
      <circle
        cx="32"
        cy="32"
        r="26"
        stroke={`url(#${outerGrad})`}
        strokeWidth="1.2"
        strokeDasharray="3 3"
        strokeOpacity="0.55"
      />
      <path
        d="M32 8L52.8 20V44L32 56L11.2 44V20L32 8Z"
        fill={`url(#${outerGrad})`}
        fillOpacity="0.16"
        stroke={`url(#${outerGrad})`}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M32 14.5L47.2 23.25V40.75L32 49.5L16.8 40.75V23.25L32 14.5Z"
        fill="#0f172a"
        fillOpacity="0.55"
        stroke="#7dd3fc"
        strokeOpacity="0.4"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <path
        d="M32 19V32M32 32L20.5 38.5M32 32L43.5 38.5M20.5 25.5L32 32L43.5 25.5M20.5 25.5V38.5M43.5 25.5V38.5"
        stroke={`url(#${innerGrad})`}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="19" r="3" fill="#38bdf8" stroke="#ffffff" strokeWidth="1.2" />
      <circle cx="20.5" cy="25.5" r="2.6" fill="#818cf8" stroke="#ffffff" strokeWidth="1.1" />
      <circle cx="43.5" cy="25.5" r="2.6" fill="#22d3ee" stroke="#ffffff" strokeWidth="1.1" />
      <circle cx="20.5" cy="38.5" r="2.6" fill="#38bdf8" stroke="#ffffff" strokeWidth="1.1" />
      <circle cx="43.5" cy="38.5" r="2.6" fill="#60a5fa" stroke="#ffffff" strokeWidth="1.1" />
      <circle cx="32" cy="32" r="4.8" fill="#ffffff" stroke={`url(#${outerGrad})`} strokeWidth="2.2" />
      <circle cx="32" cy="32" r="1.8" fill="#0284c7" />
    </svg>
  );
}

export function TechDashboardIcon({ className = 'w-5 h-5' }: TechIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="3" width="8" height="9" rx="2.2" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13" y="3" width="8" height="5.5" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13" y="11" width="8" height="10" rx="2.2" fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3" y="14.5" width="8" height="6.5" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5.5 9.5L7.5 6.8L9 8.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.5 17.5V15.5M18.5 17.5V13.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function TechSiteNodeIcon({ className = 'w-5 h-5' }: TechIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 20.5H20M6 20.5V7.5C6 6.4 6.9 5.5 8 5.5H13.5C14.6 5.5 15.5 6.4 15.5 7.5V20.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 6H15V20H6.5V6Z"
        fill="currentColor"
        fillOpacity="0.16"
      />
      <path
        d="M15.5 11H18C18.8 11 19.5 11.7 19.5 12.5V20.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M9 9.2H12.5M9 12.5H12.5M9 15.8H12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="10.75" cy="3" r="1.15" fill="currentColor" />
      <path d="M10.75 4.2V5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function TechSwitchIcon({ className = 'w-5 h-5' }: TechIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="2.5" y="7" width="19" height="10" rx="2.5" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="1.6" />
      <rect x="5" y="10.5" width="2.2" height="3" rx="0.5" fill="currentColor" />
      <rect x="8.2" y="10.5" width="2.2" height="3" rx="0.5" fill="currentColor" />
      <rect x="11.4" y="10.5" width="2.2" height="3" rx="0.5" fill="currentColor" />
      <rect x="14.6" y="10.5" width="2.2" height="3" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="19" cy="12" r="1.25" fill="currentColor" />
      <path d="M6.5 4.2L9 4.2M15 19.8L17.5 19.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function TechAccessPointIcon({ className = 'w-5 h-5' }: TechIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M5.2 10.5C7.1 8.5 9.4 7.5 12 7.5C14.6 7.5 16.9 8.5 18.8 10.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M7.8 13C9 11.8 10.4 11.2 12 11.2C13.6 11.2 15 11.8 16.2 13"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <rect x="4" y="15.5" width="16" height="4.5" rx="2.25" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="17.75" r="1.2" fill="currentColor" />
      <circle cx="16.5" cy="17.75" r="0.8" fill="currentColor" fillOpacity="0.7" />
    </svg>
  );
}

export function TechApClientIcon({ className = 'w-5 h-5' }: TechIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4.5 13.5C4.5 9.1 8.1 5.5 12.5 5.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M7.8 13.5C7.8 10.9 9.9 8.8 12.5 8.8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <rect x="11.5" y="11" width="8.5" height="9" rx="2" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.6" />
      <path d="M14.2 14.5H17.3M14.2 17H16.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="7.5" cy="17.5" r="1.4" fill="currentColor" />
      <path d="M9 17.5H11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function TechWlcIcon({ className = 'w-5 h-5' }: TechIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="12.5" width="18" height="7.5" rx="2.2" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="7" cy="16.25" r="1.2" fill="currentColor" />
      <path d="M10.5 16.25H17.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 12.5V8.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="7.2" r="1.4" fill="currentColor" />
      <path d="M8.5 5.5C9.5 4.4 10.7 3.8 12 3.8C13.3 3.8 14.5 4.4 15.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5.8 7.6C7.5 5.7 9.6 4.7 12 4.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeOpacity="0.65" />
    </svg>
  );
}

export function TechServerIcon({ className = 'w-5 h-5' }: TechIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="7" rx="2" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3.5" y="13.5" width="17" height="7" rx="2" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="7" cy="7" r="1.15" fill="currentColor" />
      <circle cx="7" cy="17" r="1.15" fill="currentColor" />
      <path d="M11 7H17.5M11 17H17.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function TechDeviceAllIcon({ className = 'w-5 h-5' }: TechIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="6.5" y="6.5" width="11" height="11" rx="2.5" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.6" />
      <rect x="10" y="10" width="4" height="4" rx="1" fill="currentColor" />
      <path
        d="M9.5 3.5V6.5M14.5 3.5V6.5M9.5 17.5V20.5M14.5 17.5V20.5M3.5 9.5H6.5M3.5 14.5H6.5M17.5 9.5H20.5M17.5 14.5H20.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function TechTopologyIcon({ className = 'w-5 h-5' }: TechIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 6.5V11M12 11L6.5 16.5M12 11L17.5 16.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <rect x="9.5" y="3" width="5" height="4" rx="1.2" fill="currentColor" fillOpacity="0.22" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3.5" y="16.5" width="5.5" height="4" rx="1.2" fill="currentColor" fillOpacity="0.22" stroke="currentColor" strokeWidth="1.5" />
      <rect x="15" y="16.5" width="5.5" height="4" rx="1.2" fill="currentColor" fillOpacity="0.22" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="11.2" r="2" fill="currentColor" />
    </svg>
  );
}

export function TechIpamIcon({ className = 'w-5 h-5' }: TechIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeWidth="1.6" />
      <ellipse cx="12" cy="12" rx="3.8" ry="8.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4 9.5H20M4 14.5H20" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="17.8" cy="6.2" r="2" fill="currentColor" />
    </svg>
  );
}

export function TechDocumentIcon({ className = 'w-5 h-5' }: TechIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M6.5 3.5H14L18.5 8V19.5C18.5 20.3 17.8 21 17 21H6.5C5.7 21 5 20.3 5 19.5V5C5 4.2 5.7 3.5 6.5 3.5Z"
        fill="currentColor"
        fillOpacity="0.15"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M14 3.5V8H18.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8.5 12H15M8.5 15.5H13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function TechVaultIcon({ className = 'w-5 h-5' }: TechIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 2.8L19.5 6V11.8C19.5 16.4 16.3 20 12 21.4C7.7 20 4.5 16.4 4.5 11.8V6L12 2.8Z"
        fill="currentColor"
        fillOpacity="0.16"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10.8" r="2.1" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 12.9V16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function TechAuditIcon({ className = 'w-5 h-5' }: TechIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="3" fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M5.5 12.5H8.5L10.5 8.5L13.5 15.5L15.5 11.5H18.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TechUsersIcon({ className = 'w-5 h-5' }: TechIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="9.5" cy="8.5" r="3" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M4 19C4 16 6.4 14 9.5 14C12.6 14 15 16 15 19"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="16.5" cy="9.5" r="2.2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M16.5 14.2C18.6 14.5 20.2 16.2 20.2 18.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function TechSettingsIcon({ className = 'w-5 h-5' }: TechIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 3.2L14 4.8L16.5 4.4L17.4 6.8L19.8 7.7L19.4 10.2L21 12L19.4 13.8L19.8 16.3L17.4 17.2L16.5 19.6L14 19.2L12 20.8L10 19.2L7.5 19.6L6.6 17.2L4.2 16.3L4.6 13.8L3 12L4.6 10.2L4.2 7.7L6.6 6.8L7.5 4.4L10 4.8L12 3.2Z"
        fill="currentColor"
        fillOpacity="0.14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3.1" fill="currentColor" fillOpacity="0.22" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function TechPlcIcon({ className = 'w-5 h-5' }: TechIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2.5" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7.5 8.5H16.5M7.5 12H13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="7.5" cy="16" r="1.1" fill="currentColor" />
      <circle cx="11" cy="16" r="1.1" fill="currentColor" />
      <circle cx="14.5" cy="16" r="1.1" stroke="currentColor" strokeWidth="1.2" />
      <path d="M9 2V4M15 2V4M9 20V22M15 20V22" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function TechEsxiIcon({ className = 'w-5 h-5' }: TechIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2.5" fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeWidth="1.6" />
      <rect x="5.5" y="7" width="5.5" height="4" rx="1" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="1.2" />
      <rect x="13" y="7" width="5.5" height="4" rx="1" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5.5 15.5H18.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="7" cy="17.5" r="0.9" fill="currentColor" />
      <circle cx="10" cy="17.5" r="0.9" fill="currentColor" />
    </svg>
  );
}

export function TechVmIcon({ className = 'w-5 h-5' }: TechIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="4" y="4" width="11" height="11" rx="2.2" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="1.6" />
      <rect x="9" y="9" width="11" height="11" rx="2.2" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="14.5" cy="14.5" r="1.4" fill="currentColor" />
    </svg>
  );
}

export function TechNasIcon({ className = 'w-5 h-5' }: TechIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="4" y="4.5" width="16" height="15" rx="2.5" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 7.5V16.5M12 7.5V16.5M16 7.5V16.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="14.5" r="1" fill="currentColor" />
      <circle cx="12" cy="14.5" r="1" fill="currentColor" />
      <circle cx="16" cy="14.5" r="1" fill="currentColor" />
    </svg>
  );
}

export function TechUpsIcon({ className = 'w-5 h-5' }: TechIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="6" y="3" width="12" height="18" rx="2.5" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12.8 7.5L9.8 12.5H12.5L11.2 16.5L14.4 11.5H11.8L12.8 7.5Z" fill="currentColor" stroke="currentColor" strokeWidth="0.9" strokeLinejoin="round" />
    </svg>
  );
}

export function TechIpCamIcon({ className = 'w-5 h-5' }: TechIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 9.5L15.5 6.5L18.5 12L7 15L4 9.5Z" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="17.5" cy="10.2" r="2" fill="currentColor" />
      <path d="M9.5 14.3V18.5H5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="5" cy="18.5" r="1.2" fill="currentColor" />
    </svg>
  );
}

export function TechPcIcon({ className = 'w-5 h-5' }: TechIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="4" width="18" height="12" rx="2" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 20H16M12 16V20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function TechNvrIcon({ className = 'w-5 h-5' }: TechIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="6.5" width="18" height="11" rx="2" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="7.5" cy="12" r="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12.5 10.5H17.5M12.5 13.5H17.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function TechTvIcon({ className = 'w-5 h-5' }: TechIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="2.5" y="4.5" width="19" height="12.5" rx="2" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 20H17M9.5 17V20M14.5 17V20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function TechPrinterIcon({ className = 'w-5 h-5' }: TechIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M7 8V4.5C7 3.95 7.45 3.5 8 3.5H16C16.55 3.5 17 3.95 17 4.5V8" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3.5" y="8" width="17" height="8" rx="2" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="1.6" />
      <rect x="7" y="13.5" width="10" height="7" rx="1" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17" cy="11" r="1" fill="currentColor" />
    </svg>
  );
}

export function TechBarcodeIcon({ className = 'w-5 h-5' }: TechIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 8V5.5C4 4.67 4.67 4 5.5 4H8M16 4H18.5C19.33 4 20 4.67 20 5.5V8M20 16V18.5C20 19.33 19.33 20 18.5 20H16M8 20H5.5C4.67 20 4 19.33 4 18.5V16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M7 8V16M9.5 8V16M11.5 8V16M14 8V16M16.5 8V16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function DeviceCategoryTechIcon({
  category,
  className = 'w-5 h-5',
}: {
  category: DeviceCategory | string;
  className?: string;
}) {
  switch (category) {
    case 'SWITCH':
      return <TechSwitchIcon className={className} />;
    case 'ACCESS_POINT':
      return <TechAccessPointIcon className={className} />;
    case 'AP_CLIENT':
      return <TechApClientIcon className={className} />;
    case 'WLC':
      return <TechWlcIcon className={className} />;
    case 'SERVER':
      return <TechServerIcon className={className} />;
    case 'PLC':
      return <TechPlcIcon className={className} />;
    case 'ESXI':
      return <TechEsxiIcon className={className} />;
    case 'VM':
      return <TechVmIcon className={className} />;
    case 'NAS':
      return <TechNasIcon className={className} />;
    case 'UPS':
      return <TechUpsIcon className={className} />;
    case 'IP_CAM':
      return <TechIpCamIcon className={className} />;
    case 'PC':
      return <TechPcIcon className={className} />;
    case 'NVR':
      return <TechNvrIcon className={className} />;
    case 'TV':
      return <TechTvIcon className={className} />;
    case 'PRINTER':
      return <TechPrinterIcon className={className} />;
    case 'BARCODE':
      return <TechBarcodeIcon className={className} />;
    default:
      return <TechDeviceAllIcon className={className} />;
  }
}

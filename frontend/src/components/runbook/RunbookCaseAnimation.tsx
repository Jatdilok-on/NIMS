'use client';

import React, { useEffect, useId, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Film,
  Pause,
  Play,
  RotateCcw,
  Wrench,
} from 'lucide-react';
import type { FlowNode } from './RunbookVisualDiagram';

interface PingRule {
  condition: string;
  meaning: string;
}

interface EquipmentCaseConfig {
  titleTh: string;
  titleEn: string;
}

const CASE_TITLES: Record<string, EquipmentCaseConfig> = {
  SRM: {
    titleTh: 'เครน Miniload (SRM) & Wireless Bridge',
    titleEn: 'SRM Miniload Crane & Wireless Bridge',
  },
  AMR: {
    titleTh: 'รถ AMR / AGV & Wi-Fi Roaming',
    titleEn: 'AMR / AGV & Wi-Fi Roaming',
  },
  SHU: {
    titleTh: 'รถ Pallet Shuttle (SHU) ในซอย Rack',
    titleEn: 'Deep-Lane Pallet Shuttle (SHU)',
  },
  RGV: {
    titleTh: 'รถลำเลียงบนรางคู่ (RGV) & AP Client',
    titleEn: 'Rail Guided Vehicle (RGV) & AP Client',
  },
  PLC_MAIN: {
    titleTh: 'ตู้ควบคุม PLC Main & Core Managed Switch',
    titleEn: 'PLC Main Cabinet & Core Managed Switch',
  },
  ACCESS_POINT: {
    titleTh: 'ตัวกระจายสัญญาณ Access Point (AP) & PoE Switch',
    titleEn: 'Industrial Access Point (AP) & PoE Switch',
  },
  AP_CLIENT: {
    titleTh: 'AP Client / Wireless Bridge & PLC ปลายทาง',
    titleEn: 'AP Client / Wireless Bridge & End PLC',
  },
};

function getNormalizedEquipmentKey(guideId: string, iconType: string): string {
  const upper = (guideId || '').toUpperCase();
  if (upper in CASE_TITLES) return upper;
  if (upper.includes('SRM') || iconType === 'CRANE') return 'SRM';
  if (upper.includes('AMR') || upper.includes('AGV') || iconType === 'AMR') return 'AMR';
  if (upper.includes('SHU') || upper.includes('SHUTTLE') || iconType === 'SHUTTLE') return 'SHU';
  if (upper.includes('RGV')) return 'RGV';
  if (upper.includes('PLC') || iconType === 'PLC') return 'PLC_MAIN';
  if (upper.includes('CLIENT') || iconType === 'CLIENT') return 'AP_CLIENT';
  if (upper.includes('AP') || iconType === 'AP') return 'ACCESS_POINT';
  return 'PLC_MAIN';
}

function matchNetworkRuleForNode(
  failedNode: FlowNode | null,
  failedIdx: number | null,
  totalNodes: number,
  rules: PingRule[],
): PingRule | null {
  if (!failedNode || failedIdx === null || rules.length === 0) return null;
  const labelLower = failedNode.label.toLowerCase();

  // 1. Direct keyword match against rule condition
  for (const r of rules) {
    const cond = r.condition.toLowerCase();
    if (
      (failedNode.roleKind === 'AP' && /bridge\s*ap|\bap\b/.test(cond) && /ไม่เจอ|fail|down/.test(cond)) ||
      (failedNode.roleKind === 'CLIENT' && /bridge\s*cl|client|rutx|hap|phoenix/.test(cond) && /ไม่เจอ|fail|down/.test(cond)) ||
      (failedNode.roleKind === 'PLC' && /plc/.test(cond) && /ไม่เจอ|fail|down/.test(cond)) ||
      (failedNode.roleKind === 'VEHICLE' && /amr|rgv|shuttle|รถ/.test(cond) && /ไม่เจอ|fail|down/.test(cond)) ||
      (failedNode.roleKind === 'SWITCH' && /switch/.test(cond) && /ไม่เจอ|fail|down/.test(cond))
    ) {
      return r;
    }
    const words = labelLower.split(/[\s()/]+/).filter((w) => w.length >= 3);
    if (words.some((w) => cond.includes(w))) {
      return r;
    }
  }

  // 2. Positional fallback aligned with stage order
  if (failedIdx === 0) return rules[0] || null;
  if (failedIdx >= totalNodes - 1) return rules[rules.length - 1] || null;
  const mappedIdx = Math.min(rules.length - 1, Math.max(0, failedIdx - 1));
  return rules[mappedIdx] || null;
}

type VisualFaultStage = 'NONE' | 'UPSTREAM' | 'AP' | 'CLIENT' | 'ENDPOINT';

function resolveFaultStage(
  failedNode: FlowNode | null,
  failedIdx: number | null,
  totalNodes: number,
): VisualFaultStage {
  if (!failedNode || failedIdx === null) return 'NONE';
  if (failedNode.roleKind === 'CORE' || failedNode.roleKind === 'SWITCH') return 'UPSTREAM';
  if (failedNode.roleKind === 'AP') return 'AP';
  if (failedNode.roleKind === 'CLIENT') return 'CLIENT';
  if (failedIdx === 0 && totalNodes > 2) return 'UPSTREAM';
  return 'ENDPOINT';
}

function RealisticEquipmentSvg({
  eqKey,
  faultStage,
  playing,
}: {
  eqKey: string;
  faultStage: VisualFaultStage;
  playing: boolean;
}) {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setTick((t) => (t + 1) % 120);
    }, 55);
    return () => window.clearInterval(timer);
  }, [playing]);

  const phase = tick / 120;
  const wave = (Math.sin(phase * Math.PI * 2) + 1) * 0.5;
  const packetT = playing ? (tick % 36) / 36 : 0.5;
  const isNormal = faultStage === 'NONE';

  // Common SVG gradients & realistic materials
  const defs = (
    <defs>
      <linearGradient id={`${uid}-metal`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#334155" />
        <stop offset="100%" stopColor="#0f172a" />
      </linearGradient>
      <linearGradient id={`${uid}-amber`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#fbbf24" />
        <stop offset="100%" stopColor="#d97706" />
      </linearGradient>
      <linearGradient id={`${uid}-wood`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#d97706" />
        <stop offset="100%" stopColor="#92400e" />
      </linearGradient>
      <linearGradient id={`${uid}-ap-white`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="100%" stopColor="#dbeafe" />
      </linearGradient>
      <filter id={`${uid}-shadow`} x="-10%" y="-10%" width="125%" height="130%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#0f172a" floodOpacity="0.16" />
      </filter>
    </defs>
  );

  // 1. SRM (Miniload Stacker Crane + High-Bay Rack + Bridge AP & Bridge CL + PLC Main)
  if (eqKey === 'SRM') {
    const craneX = isNormal ? 245 + wave * 185 : 310;
    const forkY = isNormal ? 142 - wave * 54 : 124;
    const mainFault = faultStage === 'UPSTREAM';
    const apFault = faultStage === 'AP';
    const clientFault = faultStage === 'CLIENT';
    const plcFault = faultStage === 'ENDPOINT';
    const rfOk = !mainFault && !apFault && !clientFault;

    return (
      <svg viewBox="0 0 720 230" className="w-full h-48 sm:h-56 select-none">
        {defs}
        <rect x="8" y="8" width="704" height="214" rx="14" fill="#f8fafc" className="dark:fill-slate-950/80" stroke="#cbd5e1" strokeOpacity="0.6" />

        {/* Left: PLC Main Cabinet + Managed Switch */}
        <g transform="translate(24, 96)" filter={`url(#${uid}-shadow)`}>
          <rect x="0" y="0" width="84" height="106" rx="8" fill={`url(#${uid}-metal)`} stroke={mainFault ? '#ef4444' : '#475569'} strokeWidth="1.8" />
          <text x="42" y="15" textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#94a3b8" className="font-mono">
            PLC MAIN
          </text>
          {/* Switch strip */}
          <rect x="8" y="22" width="68" height="20" rx="3" fill="#1e293b" stroke="#334155" />
          {[15, 25, 35, 45, 55, 65].map((px, i) => (
            <rect key={px} x={px} y="27" width="6" height="8" rx="1" fill={mainFault ? '#ef4444' : i < 4 ? '#10b981' : '#334155'} />
          ))}
          {/* PLC CPU */}
          <rect x="8" y="48" width="68" height="48" rx="4" fill="#1e293b" stroke="#334155" />
          <circle cx="20" cy="62" r="4" fill={mainFault ? '#ef4444' : '#10b981'} />
          <text x="30" y="65" fontSize="7.5" fill="#e2e8f0" className="font-mono">RUN</text>
          <circle cx="20" cy="78" r="4" fill={mainFault ? '#ef4444' : '#334155'} />
          <text x="30" y="81" fontSize="7.5" fill={mainFault ? '#fca5a5' : '#64748b'} className="font-mono">ERR</text>
        </g>

        {/* Cat6 PoE Cable from PLC Main Switch -> Bridge AP */}
        <path
          d="M 66 96 L 66 44 L 122 44"
          fill="none"
          stroke={mainFault || apFault ? '#ef4444' : '#2563eb'}
          strokeWidth="2.8"
          strokeDasharray={mainFault ? '5 4' : undefined}
        />
        {!mainFault && !apFault && playing && (
          <circle cx={66 + 56 * packetT} cy="44" r="3.8" fill="#38bdf8" />
        )}

        {/* Wall-Mounted Directional Bridge AP Panel */}
        <g transform="translate(122, 22)" filter={`url(#${uid}-shadow)`}>
          {/* Wall mount bracket */}
          <rect x="-8" y="14" width="10" height="16" rx="2" fill="#475569" />
          {/* Panel antenna housing */}
          <rect x="0" y="0" width="54" height="44" rx="8" fill={`url(#${uid}-ap-white)`} stroke={apFault ? '#ef4444' : '#2563eb'} strokeWidth="2" />
          <rect x="10" y="8" width="34" height="22" rx="4" fill="#eff6ff" stroke="#93c5fd" />
          <circle cx="16" cy="36" r="3" fill={apFault || mainFault ? '#ef4444' : '#10b981'} />
          <text x="32" y="39" textAnchor="middle" fontSize="7" fontWeight="800" fill="#1e3a8a" className="font-mono">
            Bridge AP
          </text>
        </g>

        {/* High-Bay Steel Pallet Racks */}
        <g>
          {/* Steel Uprights */}
          {[200, 265, 330, 395, 460, 525].map((ux) => (
            <rect key={ux} x={ux} y="56" width="4" height="142" fill="#475569" fillOpacity="0.45" />
          ))}
          {/* Horizontal Shelf Beams & Real Wooden Pallets + Cartons */}
          {[88, 128, 168].map((ry) => (
            <g key={ry}>
              <rect x="200" y={ry + 16} width="329" height="4" rx="1" fill="#ea580c" fillOpacity="0.7" />
              {[210, 275, 340, 405, 470].map((px) => (
                <g key={px}>
                  {/* Wooden Pallet */}
                  <rect x={px} y={ry + 11} width="48" height="5" rx="1" fill={`url(#${uid}-wood)`} />
                  {/* Cardboard Cartons */}
                  <rect x={px + 2} y={ry - 3} width="20" height="14" rx="2" fill="#d97706" fillOpacity="0.35" stroke="#b45309" strokeOpacity="0.55" />
                  <rect x={px + 25} y={ry - 5} width="20" height="16" rx="2" fill="#3b82f6" fillOpacity="0.28" stroke="#2563eb" strokeOpacity="0.5" />
                </g>
              ))}
            </g>
          ))}
        </g>

        {/* Top Guide Rail & Floor Crane Rail */}
        <rect x="192" y="48" width="350" height="5" rx="2" fill="#1e293b" />
        <rect x="192" y="196" width="350" height="7" rx="2" fill="#0f172a" />

        {/* Realistic SRM Miniload Stacker Crane */}
        <g transform={`translate(${craneX}, 0)`} filter={`url(#${uid}-shadow)`}>
          {/* Lattice Twin Mast */}
          <rect x="-10" y="53" width="6" height="134" fill={`url(#${uid}-amber)`} />
          <rect x="4" y="53" width="6" height="134" fill={`url(#${uid}-amber)`} />
          {[68, 92, 116, 140, 164].map((my) => (
            <line key={my} x1="-6" y1={my} x2="6" y2={my + 10} stroke="#78350f" strokeWidth="1.5" />
          ))}

          {/* Top Mast Wireless Bridge CL Panel */}
          <rect x="-24" y="24" width="48" height="28" rx="6" fill={`url(#${uid}-ap-white)`} stroke={clientFault ? '#ef4444' : '#0284c7'} strokeWidth="2" />
          <circle cx="-13" cy="38" r="3.2" fill={clientFault || apFault || mainFault ? '#ef4444' : '#10b981'} />
          <text x="6" y="41" textAnchor="middle" fontSize="7" fontWeight="800" fill="#0f172a" className="font-mono">
            Bridge CL
          </text>

          {/* Elevating Telescopic Fork Carriage + Tote Box */}
          <rect x="-22" y={forkY} width="44" height="12" rx="3" fill="#1e293b" stroke="#f59e0b" strokeWidth="1.2" />
          <rect x="-16" y={forkY - 13} width="32" height="13" rx="2.5" fill="#2563eb" stroke="#93c5fd" strokeWidth="1" />

          {/* Crane Base Bogie + Steel Wheels + Onboard PLC */}
          <rect x="-30" y="178" width="60" height="18" rx="4" fill="#0f172a" stroke={plcFault ? '#ef4444' : '#f59e0b'} strokeWidth="1.6" />
          <circle cx="-18" cy="197" r="5" fill="#475569" stroke="#fbbf24" strokeWidth="1.5" />
          <circle cx="18" cy="197" r="5" fill="#475569" stroke="#fbbf24" strokeWidth="1.5" />
          <circle cx="20" cy="187" r="3.5" fill={plcFault ? '#ef4444' : '#10b981'} />
          <text x="-4" y="190" textAnchor="middle" fontSize="7.5" fontWeight="800" fill="#fde68a" className="font-mono">
            SRM PLC
          </text>
        </g>

        {/* Wireless Bridge RF Beam (Bridge AP <-> Bridge CL) */}
        <line
          x1="176"
          y1="38"
          x2={craneX - 24}
          y2="38"
          stroke={rfOk ? '#10b981' : '#ef4444'}
          strokeWidth="2.6"
          strokeDasharray="6 5"
          className={rfOk && playing ? 'nims-runbook-dash' : ''}
        />
        {rfOk && playing && (
          <circle cx={176 + (craneX - 24 - 176) * packetT} cy="38" r="4.2" fill="#10b981" />
        )}
        {(apFault || clientFault) && (
          <g transform={`translate(${(176 + craneX - 24) / 2}, 38)`}>
            <circle r="10" fill="#ef4444" />
            <path d="M-4 -4 L4 4 M4 -4 L-4 4" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
          </g>
        )}

        {/* Right Side: Real-Time Crane PLC Cabinet Status */}
        <g transform="translate(566, 62)" filter={`url(#${uid}-shadow)`}>
          <rect x="0" y="0" width="128" height="132" rx="10" fill={`url(#${uid}-metal)`} stroke={plcFault ? '#ef4444' : '#334155'} strokeWidth="1.8" />
          <text x="64" y="18" textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#94a3b8" className="font-mono">
            PLC บนเครน
          </text>
          <rect x="12" y="28" width="104" height="90" rx="6" fill="#1e293b" />
          <circle cx="26" cy="48" r="4.5" fill={rfOk && !plcFault ? '#10b981' : '#64748b'} />
          <text x="38" y="51" fontSize="8" fill="#e2e8f0" className="font-mono">POWER 24V</text>
          <circle cx="26" cy="70" r="4.5" fill={plcFault ? '#f59e0b' : rfOk ? '#10b981' : '#64748b'} />
          <text x="38" y="73" fontSize="8" fill="#e2e8f0" className="font-mono">LAN LINK</text>
          <circle cx="26" cy="92" r="4.5" fill={plcFault ? '#ef4444' : '#334155'} />
          <text x="38" y="95" fontSize="8" fill={plcFault ? '#fca5a5' : '#64748b'} className="font-mono">SF / E-STOP</text>
        </g>
      </svg>
    );
  }

  // 2. AMR (Autonomous Mobile Robot with LiDAR Scanner Dome, Lifting Deck, Safety Bumper & Ceiling APs)
  if (eqKey === 'AMR') {
    const amrX = isNormal ? 140 + wave * 360 : 350;
    const apFault = faultStage === 'AP' || faultStage === 'UPSTREAM';
    const unitFault = faultStage === 'ENDPOINT' || faultStage === 'CLIENT';
    const nearestApX = amrX < 330 ? 185 : 495;
    const linkBroken = apFault && nearestApX === 495;

    return (
      <svg viewBox="0 0 720 230" className="w-full h-48 sm:h-56 select-none">
        {defs}
        <rect x="8" y="8" width="704" height="214" rx="14" fill="#f8fafc" className="dark:fill-slate-950/80" stroke="#cbd5e1" strokeOpacity="0.6" />

        {/* Ceiling Truss & Dual Enterprise Wi-Fi 6 APs */}
        <rect x="36" y="20" width="648" height="8" rx="3" fill="#1e293b" />
        {[
          { x: 185, label: 'AP-01', off: false },
          { x: 495, label: 'AP-02', off: apFault },
        ].map((ap) => (
          <g key={ap.label} transform={`translate(${ap.x}, 32)`} filter={`url(#${uid}-shadow)`}>
            <rect x="-46" y="0" width="92" height="28" rx="8" fill={`url(#${uid}-ap-white)`} stroke={ap.off ? '#ef4444' : '#0284c7'} strokeWidth="2" />
            <line x1="-30" y1="0" x2="-34" y2="-12" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="30" y1="0" x2="34" y2="-12" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="-26" cy="14" r="3.5" fill={ap.off ? '#ef4444' : '#10b981'} />
            <text x="6" y="17.5" textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#0f172a" className="font-mono">
              {ap.label}
            </text>
          </g>
        ))}

        {/* Warehouse Floor Guide Tape & QR Floor Markers */}
        <rect x="64" y="166" width="592" height="12" rx="6" fill="#10b981" fillOpacity="0.16" />
        <line x1="72" y1="172" x2="648" y2="172" stroke="#10b981" strokeWidth="2" strokeDasharray="8 6" />
        {[140, 290, 440, 590].map((qx) => (
          <rect key={qx} x={qx} y="168" width="8" height="8" rx="1.5" fill="#0f172a" fillOpacity="0.35" />
        ))}

        {/* Dynamic Wi-Fi Link */}
        <line
          x1={nearestApX}
          y1="60"
          x2={amrX}
          y2="132"
          stroke={linkBroken ? '#ef4444' : '#10b981'}
          strokeWidth="2.4"
          strokeDasharray="5 5"
          className={!linkBroken && playing ? 'nims-runbook-dash' : ''}
        />
        {!linkBroken && playing && (
          <circle
            cx={nearestApX + (amrX - nearestApX) * packetT}
            cy={60 + (132 - 60) * packetT}
            r="4.2"
            fill="#10b981"
          />
        )}
        {linkBroken && (
          <g transform={`translate(${(nearestApX + amrX) / 2}, 96)`}>
            <circle r="10" fill="#ef4444" />
            <path d="M-4 -4 L4 4 M4 -4 L-4 4" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
          </g>
        )}

        {/* Obstacle Carton for Endpoint/Bumper Case */}
        {unitFault && (
          <g transform="translate(455, 134)">
            <rect x="-18" y="-12" width="36" height="34" rx="4" fill={`url(#${uid}-wood)`} stroke="#f59e0b" strokeWidth="1.8" />
            <text x="0" y="9" textAnchor="middle" fontSize="8" fontWeight="800" fill="#ffffff" className="font-mono">
              OBST
            </text>
          </g>
        )}

        {/* Realistic Low-Profile AMR Robot */}
        <g transform={`translate(${amrX}, 148)`} filter={`url(#${uid}-shadow)`}>
          {/* 2D LiDAR Laser Scan Fan */}
          <path d="M 38 4 L 92 -18 A 56 56 0 0 1 92 22 Z" fill={unitFault ? '#ef4444' : '#10b981'} fillOpacity="0.2" />
          {/* Carried Tote/Payload on Lift Table */}
          <rect x="-26" y="-30" width="52" height="18" rx="4" fill="#2563eb" stroke="#93c5fd" strokeWidth="1.2" />
          <rect x="-32" y="-12" width="64" height="5" rx="2" fill="#475569" />
          {/* AMR Main Industrial Body */}
          <rect x="-42" y="-7" width="84" height="28" rx="8" fill={`url(#${uid}-metal)`} stroke={linkBroken ? '#ef4444' : unitFault ? '#f59e0b' : '#10b981'} strokeWidth="2" />
          {/* Yellow/Black Hazard Bumper Strip */}
          <rect x="36" y="-2" width="7" height="18" rx="2" fill="#facc15" />
          {/* Recessed LiDAR Dome */}
          <rect x="28" y="-1" width="8" height="10" rx="2" fill="#38bdf8" />
          {/* Drive Wheels */}
          <circle cx="-22" cy="22" r="6" fill="#1e293b" stroke="#64748b" strokeWidth="2" />
          <circle cx="22" cy="22" r="6" fill="#1e293b" stroke="#64748b" strokeWidth="2" />
          {/* Status LED Strip */}
          <rect x="-24" y="4" width="38" height="4" rx="2" fill={linkBroken ? '#ef4444' : unitFault ? '#f59e0b' : '#10b981'} />
          <text x="-4" y="-18" textAnchor="middle" fontSize="8" fontWeight="800" fill="#ffffff" className="font-mono">
            AMR
          </text>
        </g>
      </svg>
    );
  }

  // 3. SHU (Deep-Lane Radio Pallet Shuttle inside Steel C-Channel Rack)
  if (eqKey === 'SHU') {
    const shuX = isNormal ? 210 + wave * 280 : 410;
    const apFault = faultStage === 'AP' || faultStage === 'UPSTREAM';
    const rfFault = faultStage === 'CLIENT';
    const unitFault = faultStage === 'ENDPOINT';

    return (
      <svg viewBox="0 0 720 230" className="w-full h-48 sm:h-56 select-none">
        {defs}
        <rect x="8" y="8" width="704" height="214" rx="14" fill="#f8fafc" className="dark:fill-slate-950/80" stroke="#cbd5e1" strokeOpacity="0.6" />

        {/* Aisle-Head AP */}
        <g transform="translate(46, 52)" filter={`url(#${uid}-shadow)`}>
          <rect x="0" y="0" width="88" height="36" rx="8" fill={`url(#${uid}-ap-white)`} stroke={apFault ? '#ef4444' : '#0284c7'} strokeWidth="2" />
          <circle cx="14" cy="18" r="3.5" fill={apFault ? '#ef4444' : '#10b981'} />
          <text x="52" y="21" textAnchor="middle" fontSize="9" fontWeight="800" fill="#0f172a" className="font-mono">
            Aisle AP
          </text>
        </g>

        {/* Deep-Lane Steel C-Channel Rack */}
        <g>
          {[84, 152].map((ry) => (
            <g key={ry}>
              <rect x="166" y={ry + 18} width="516" height="10" rx="2" fill="#334155" fillOpacity="0.25" stroke="#475569" strokeOpacity="0.4" />
              {/* Stored Wooden Pallets at Rack Ends */}
              {[180, 620].map((px) => (
                <g key={px}>
                  <rect x={px} y={ry + 12} width="46" height="5" rx="1" fill={`url(#${uid}-wood)`} />
                  <rect x={px + 3} y={ry - 6} width="40" height="18" rx="2" fill="#0ea5e9" fillOpacity="0.22" stroke="#0284c7" strokeOpacity="0.45" />
                </g>
              ))}
            </g>
          ))}
        </g>

        {/* RF Signal inside deep lane */}
        <line
          x1="134"
          y1="70"
          x2={shuX - 36}
          y2="146"
          stroke={apFault || rfFault ? '#ef4444' : '#06b6d4'}
          strokeWidth="2.4"
          strokeDasharray="5 5"
          className={!apFault && !rfFault && playing ? 'nims-runbook-dash' : ''}
        />
        {!apFault && !rfFault && playing && (
          <circle
            cx={134 + (shuX - 36 - 134) * packetT}
            cy={70 + (146 - 70) * packetT}
            r="4"
            fill="#06b6d4"
          />
        )}
        {(apFault || rfFault) && (
          <g transform={`translate(${(134 + shuX - 36) / 2}, 108)`}>
            <circle r="10" fill="#ef4444" />
            <path d="M-4 -4 L4 4 M4 -4 L-4 4" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
          </g>
        )}

        {/* Realistic Low-Profile Radio Pallet Shuttle */}
        <g transform={`translate(${shuX}, 152)`} filter={`url(#${uid}-shadow)`}>
          {/* Pallet Carried Above Shuttle */}
          <rect x="-28" y="-28" width="56" height="6" rx="1" fill={`url(#${uid}-wood)`} />
          <rect x="-24" y="-46" width="48" height="18" rx="3" fill="#38bdf8" fillOpacity="0.85" stroke="#0284c7" />
          {/* Shuttle Steel Body */}
          <rect x="-38" y="-12" width="76" height="22" rx="5" fill={`url(#${uid}-metal)`} stroke={rfFault || apFault ? '#ef4444' : unitFault ? '#f59e0b' : '#06b6d4'} strokeWidth="2" />
          {/* Flanged Steel Rail Rollers */}
          {[-26, -10, 10, 26].map((wx) => (
            <circle key={wx} cx={wx} cy="12" r="4" fill="#64748b" stroke="#cbd5e1" strokeWidth="1" />
          ))}
          {/* Stub Wi-Fi Antenna */}
          <line x1="-28" y1="-12" x2="-28" y2="-22" stroke="#ec4899" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="-28" cy="-22" r="2.5" fill="#ec4899" />
          {/* Optical Pallet Sensor + Battery LED */}
          <circle cx="24" cy="-1" r="3.5" fill={unitFault ? '#f59e0b' : '#10b981'} />
          <text x="-2" y="2" textAnchor="middle" fontSize="8" fontWeight="800" fill="#ffffff" className="font-mono">
            SHU-01
          </text>
        </g>
      </svg>
    );
  }

  // 4. RGV (Twin-Rail Transfer Car with Roller Conveyor & Onboard MikroTik/Phoenix AP Client)
  if (eqKey === 'RGV') {
    const rgvX = isNormal ? 160 + wave * 380 : 360;
    const apFault = faultStage === 'AP' || faultStage === 'UPSTREAM';
    const clientFault = faultStage === 'CLIENT';
    const plcFault = faultStage === 'ENDPOINT';

    return (
      <svg viewBox="0 0 720 230" className="w-full h-48 sm:h-56 select-none">
        {defs}
        <rect x="8" y="8" width="704" height="214" rx="14" fill="#f8fafc" className="dark:fill-slate-950/80" stroke="#cbd5e1" strokeOpacity="0.6" />

        {/* Overhead AP */}
        <g transform="translate(360, 24)" filter={`url(#${uid}-shadow)`}>
          <rect x="-52" y="0" width="104" height="30" rx="8" fill={`url(#${uid}-ap-white)`} stroke={apFault ? '#ef4444' : '#0284c7'} strokeWidth="2" />
          <circle cx="-34" cy="15" r="3.5" fill={apFault ? '#ef4444' : '#10b981'} />
          <text x="8" y="18.5" textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#0f172a" className="font-mono">
            Zone AP
          </text>
        </g>

        {/* Heavy-Duty Twin I-Beam Steel Rails + Sleepers */}
        <rect x="44" y="156" width="632" height="5" rx="1.5" fill="#475569" />
        <rect x="44" y="182" width="632" height="5" rx="1.5" fill="#475569" />
        {Array.from({ length: 18 }).map((_, i) => (
          <rect key={i} x={60 + i * 35} y="156" width="4" height="31" fill="#94a3b8" fillOpacity="0.45" />
        ))}

        {/* RF Link AP <-> RGV Onboard Client */}
        <line
          x1="360"
          y1="54"
          x2={rgvX + 26}
          y2="108"
          stroke={apFault || clientFault ? '#ef4444' : '#8b5cf6'}
          strokeWidth="2.4"
          strokeDasharray="6 5"
          className={!apFault && !clientFault && playing ? 'nims-runbook-dash' : ''}
        />
        {!apFault && !clientFault && playing && (
          <circle
            cx={360 + (rgvX + 26 - 360) * packetT}
            cy={54 + (108 - 54) * packetT}
            r="4.2"
            fill="#8b5cf6"
          />
        )}
        {(apFault || clientFault) && (
          <g transform={`translate(${(360 + rgvX + 26) / 2}, 81)`}>
            <circle r="10" fill="#ef4444" />
            <path d="M-4 -4 L4 4 M4 -4 L-4 4" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
          </g>
        )}

        {/* Realistic RGV Transfer Car */}
        <g transform={`translate(${rgvX}, 152)`} filter={`url(#${uid}-shadow)`}>
          {/* Steel Chassis + Safety Bumpers */}
          <rect x="-58" y="0" width="116" height="28" rx="6" fill="#5b21b6" stroke={plcFault ? '#ef4444' : '#ddd6fe'} strokeWidth="1.6" />
          <rect x="-62" y="6" width="6" height="16" rx="2" fill="#facc15" />
          <rect x="56" y="6" width="6" height="16" rx="2" fill="#facc15" />
          {/* Powered Roller Conveyor Deck + Pallet */}
          <rect x="-46" y="-8" width="66" height="8" rx="2" fill="#1e293b" />
          {[-38, -26, -14, -2, 10].map((rx) => (
            <circle key={rx} cx={rx} cy="-4" r="2.5" fill="#94a3b8" />
          ))}
          <rect x="-40" y="-14" width="52" height="5" rx="1" fill={`url(#${uid}-wood)`} />
          <rect x="-36" y="-32" width="44" height="18" rx="2.5" fill="#c4b5fd" stroke="#7c3aed" />

          {/* Flanged Rail Wheels */}
          <circle cx="-36" cy="30" r="6" fill="#334155" stroke="#cbd5e1" strokeWidth="1.5" />
          <circle cx="36" cy="30" r="6" fill="#334155" stroke="#cbd5e1" strokeWidth="1.5" />

          {/* Onboard Industrial AP Client (Twin SMA Antennas) */}
          <rect x="20" y="-44" width="34" height="22" rx="4" fill="#0f172a" stroke={clientFault ? '#ef4444' : '#10b981'} strokeWidth="1.6" />
          <line x1="26" y1="-44" x2="24" y2="-56" stroke="#38bdf8" strokeWidth="2.2" strokeLinecap="round" />
          <line x1="48" y1="-44" x2="50" y2="-56" stroke="#38bdf8" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="27" cy="-33" r="3" fill={clientFault ? '#ef4444' : '#10b981'} />
          <text x="39" y="-30" textAnchor="middle" fontSize="6.5" fontWeight="800" fill="#e2e8f0" className="font-mono">
            CLI
          </text>
          <text x="-12" y="17" textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#ffffff" className="font-mono">
            RGV-01
          </text>
        </g>
      </svg>
    );
  }

  // 5. ACCESS_POINT (PoE Managed Switch -> Cat6 UTP -> Enterprise Wi-Fi 6 AP -> Clients)
  if (eqKey === 'ACCESS_POINT') {
    const swFault = faultStage === 'UPSTREAM';
    const apFault = faultStage === 'AP';
    const wlcFault = faultStage === 'CLIENT' || faultStage === 'ENDPOINT';
    const poeOk = !swFault && !apFault;

    return (
      <svg viewBox="0 0 720 230" className="w-full h-48 sm:h-56 select-none">
        {defs}
        <rect x="8" y="8" width="704" height="214" rx="14" fill="#f8fafc" className="dark:fill-slate-950/80" stroke="#cbd5e1" strokeOpacity="0.6" />

        {/* Realistic 1U Managed PoE Switch */}
        <g transform="translate(30, 74)" filter={`url(#${uid}-shadow)`}>
          <rect x="0" y="0" width="168" height="82" rx="8" fill={`url(#${uid}-metal)`} stroke={swFault ? '#ef4444' : '#475569'} strokeWidth="1.8" />
          <text x="84" y="18" textAnchor="middle" fontSize="9" fontWeight="800" fill="#7dd3fc" className="font-mono">
            POE ACCESS SWITCH
          </text>
          {/* 8 RJ45 Ports + PoE LEDs */}
          <rect x="14" y="28" width="140" height="38" rx="4" fill="#1e293b" stroke="#334155" />
          {Array.from({ length: 6 }).map((_, i) => (
            <g key={i} transform={`translate(${22 + i * 21}, 36)`}>
              <rect x="0" y="6" width="14" height="12" rx="1.5" fill="#0f172a" stroke="#475569" />
              <circle cx="7" cy="2" r="2.5" fill={i === 0 ? (poeOk ? '#10b981' : '#ef4444') : i < 4 ? '#10b981' : '#334155'} />
            </g>
          ))}
          <text x="84" y="76" textAnchor="middle" fontSize="7.5" fill="#94a3b8" className="font-mono">
            Port 1 PoE: {poeOk ? '30W ACTIVE' : 'NO POE'}
          </text>
        </g>

        {/* Cat6 UTP Cable */}
        <line
          x1="198"
          y1="115"
          x2="316"
          y2="115"
          stroke={poeOk ? '#2563eb' : '#ef4444'}
          strokeWidth="3.2"
          strokeDasharray={!poeOk ? '5 4' : undefined}
        />
        {poeOk && playing && <circle cx={198 + 118 * packetT} cy="115" r="4.2" fill="#38bdf8" />}
        {!poeOk && (
          <g transform="translate(257, 115)">
            <circle r="10" fill="#ef4444" />
            <path d="M-4 -4 L4 4 M4 -4 L-4 4" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
          </g>
        )}

        {/* Realistic Enterprise / Industrial Ceiling AP */}
        <g transform="translate(316, 68)" filter={`url(#${uid}-shadow)`}>
          <rect x="0" y="0" width="112" height="94" rx="18" fill={`url(#${uid}-ap-white)`} stroke={apFault ? '#ef4444' : wlcFault ? '#f59e0b' : '#0284c7'} strokeWidth="2.2" />
          <line x1="24" y1="0" x2="18" y2="-18" stroke="#334155" strokeWidth="3" strokeLinecap="round" />
          <line x1="88" y1="0" x2="94" y2="-18" stroke="#334155" strokeWidth="3" strokeLinecap="round" />
          <circle cx="56" cy="40" r="14" fill="#eff6ff" stroke="#93c5fd" strokeWidth="1.5" />
          <circle cx="56" cy="40" r="6" fill={apFault || swFault ? '#334155' : wlcFault ? '#f59e0b' : '#10b981'} />
          <text x="56" y="70" textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#0f172a" className="font-mono">
            Wi-Fi 6 AP
          </text>
          <text x="56" y="83" textAnchor="middle" fontSize="7.5" fill="#475569" className="font-mono">
            {apFault || swFault ? 'LED DARK' : wlcFault ? 'AMBER (NO WLC)' : 'GREEN OK'}
          </text>
        </g>

        {/* RF Waves to Clients */}
        {poeOk && !wlcFault && (
          <g>
            <line x1="428" y1="98" x2="554" y2="66" stroke="#10b981" strokeWidth="2.2" strokeDasharray="5 5" className={playing ? 'nims-runbook-dash' : ''} />
            <line x1="428" y1="130" x2="554" y2="162" stroke="#10b981" strokeWidth="2.2" strokeDasharray="5 5" className={playing ? 'nims-runbook-dash' : ''} />
            {playing && (
              <>
                <circle cx={428 + 126 * packetT} cy={98 - 32 * packetT} r="3.8" fill="#10b981" />
                <circle cx={428 + 126 * packetT} cy={130 + 32 * packetT} r="3.8" fill="#10b981" />
              </>
            )}
          </g>
        )}

        {[
          { y: 44, label: 'AMR / Handheld' },
          { y: 138, label: 'Bridge Client' },
        ].map((cl) => (
          <g key={cl.label} transform={`translate(554, ${cl.y})`} filter={`url(#${uid}-shadow)`}>
            <rect x="0" y="0" width="124" height="44" rx="10" fill={`url(#${uid}-metal)`} />
            <circle cx="16" cy="22" r="4" fill={poeOk && !wlcFault ? '#10b981' : '#ef4444'} />
            <text x="70" y="25" textAnchor="middle" fontSize="9" fontWeight="700" fill="#e2e8f0" className="font-mono">
              {cl.label}
            </text>
          </g>
        ))}
      </svg>
    );
  }

  // 6. AP_CLIENT (Fixed AP <-> Ruggedized AP Client w/ Twin Antennas -> Short Cat6 -> End PLC)
  if (eqKey === 'AP_CLIENT') {
    const apFault = faultStage === 'AP' || faultStage === 'UPSTREAM';
    const clientFault = faultStage === 'CLIENT';
    const lanFault = faultStage === 'ENDPOINT';
    const rfOk = !apFault && !clientFault;

    return (
      <svg viewBox="0 0 720 230" className="w-full h-48 sm:h-56 select-none">
        {defs}
        <rect x="8" y="8" width="704" height="214" rx="14" fill="#f8fafc" className="dark:fill-slate-950/80" stroke="#cbd5e1" strokeOpacity="0.6" />

        {/* Fixed AP */}
        <g transform="translate(36, 70)" filter={`url(#${uid}-shadow)`}>
          <rect x="0" y="0" width="112" height="88" rx="16" fill={`url(#${uid}-ap-white)`} stroke={apFault ? '#ef4444' : '#0284c7'} strokeWidth="2" />
          <circle cx="56" cy="34" r="7" fill={apFault ? '#ef4444' : '#10b981'} />
          <text x="56" y="60" textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#0f172a" className="font-mono">
            Fixed AP
          </text>
          <text x="56" y="74" textAnchor="middle" fontSize="7.5" fill="#475569" className="font-mono">
            {apFault ? 'AP OFFLINE' : 'Ping OK'}
          </text>
        </g>

        {/* RF Link */}
        <line
          x1="148"
          y1="114"
          x2="278"
          y2="114"
          stroke={rfOk ? '#10b981' : '#ef4444'}
          strokeWidth="2.6"
          strokeDasharray="6 5"
          className={rfOk && playing ? 'nims-runbook-dash' : ''}
        />
        {rfOk && playing && <circle cx={148 + 130 * packetT} cy="114" r="4.2" fill="#10b981" />}
        {!rfOk && (
          <g transform="translate(213, 114)">
            <circle r="10" fill="#ef4444" />
            <path d="M-4 -4 L4 4 M4 -4 L-4 4" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
          </g>
        )}

        {/* Ruggedized AP Client (hAP ax2 / RUTX10 / Phoenix) */}
        <g transform="translate(278, 66)" filter={`url(#${uid}-shadow)`}>
          <line x1="26" y1="0" x2="20" y2="-22" stroke="#334155" strokeWidth="3.2" strokeLinecap="round" />
          <line x1="116" y1="0" x2="122" y2="-22" stroke="#334155" strokeWidth="3.2" strokeLinecap="round" />
          <rect x="0" y="0" width="142" height="96" rx="10" fill={`url(#${uid}-metal)`} stroke={clientFault ? '#ef4444' : '#10b981'} strokeWidth="2" />
          <text x="71" y="22" textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#ffffff" className="font-mono">
            AP CLIENT / BRIDGE
          </text>
          <text x="71" y="36" textAnchor="middle" fontSize="7.5" fill="#94a3b8" className="font-mono">
            RUTX10 / hAP ax2 / Phoenix
          </text>
          {/* 24VDC + WLAN + ETH LEDs */}
          <rect x="14" y="48" width="114" height="34" rx="5" fill="#1e293b" />
          <circle cx="30" cy="65" r="4" fill={clientFault ? '#ef4444' : '#10b981'} />
          <text x="48" y="68" fontSize="7.5" fill="#cbd5e1" className="font-mono">24V</text>
          <circle cx="76" cy="65" r="4" fill={rfOk ? '#10b981' : '#ef4444'} />
          <text x="98" y="68" fontSize="7.5" fill="#cbd5e1" className="font-mono">RF</text>
        </g>

        {/* Short LAN Patch Cord */}
        <line
          x1="420"
          y1="114"
          x2="532"
          y2="114"
          stroke={!rfOk ? '#94a3b8' : lanFault ? '#ef4444' : '#2563eb'}
          strokeWidth="3.2"
          strokeDasharray={lanFault ? '5 4' : undefined}
        />
        {rfOk && !lanFault && playing && <circle cx={420 + 112 * packetT} cy="114" r="4.2" fill="#38bdf8" />}
        {lanFault && (
          <g transform="translate(476, 114)">
            <circle r="10" fill="#ef4444" />
            <path d="M-4 -4 L4 4 M4 -4 L-4 4" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
          </g>
        )}

        {/* End PLC */}
        <g transform="translate(532, 70)" filter={`url(#${uid}-shadow)`}>
          <rect x="0" y="0" width="146" height="88" rx="10" fill="#1e293b" stroke={lanFault ? '#ef4444' : '#3b82f6'} strokeWidth="2" />
          <text x="73" y="24" textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#ffffff" className="font-mono">
            END PLC / DEVICE
          </text>
          <circle cx="28" cy="54" r="4.5" fill={lanFault || !rfOk ? '#ef4444' : '#10b981'} />
          <text x="40" y="57" fontSize="8" fill="#e2e8f0" className="font-mono">
            {lanFault ? 'ETH LINK DOWN' : !rfOk ? 'NO UPSTREAM' : 'ETH + RUN OK'}
          </text>
        </g>
      </svg>
    );
  }

  // 7. PLC_MAIN (19" Managed Core Switch + Fiber Uplink + Siemens-Style S7 Modular PLC Cabinet)
  const swFault = faultStage === 'UPSTREAM' || faultStage === 'AP';
  const plcFault = faultStage === 'ENDPOINT' || faultStage === 'CLIENT';

  return (
    <svg viewBox="0 0 720 230" className="w-full h-48 sm:h-56 select-none">
      {defs}
      <rect x="8" y="8" width="704" height="214" rx="14" fill="#f8fafc" className="dark:fill-slate-950/80" stroke="#cbd5e1" strokeOpacity="0.6" />

      {/* Core Managed Switch */}
      <g transform="translate(32, 66)" filter={`url(#${uid}-shadow)`}>
        <rect x="0" y="0" width="196" height="96" rx="10" fill={`url(#${uid}-metal)`} stroke={swFault ? '#ef4444' : '#475569'} strokeWidth="1.8" />
        <text x="98" y="18" textAnchor="middle" fontSize="9" fontWeight="800" fill="#7dd3fc" className="font-mono">
          CORE / ACCESS SWITCH
        </text>
        <rect x="14" y="28" width="168" height="44" rx="4" fill="#1e293b" stroke="#334155" />
        {Array.from({ length: 7 }).map((_, i) => (
          <g key={i} transform={`translate(${22 + i * 22}, 36)`}>
            <rect x="0" y="7" width="14" height="12" rx="1.5" fill="#0f172a" stroke="#475569" />
            <circle cx="7" cy="2" r="2.5" fill={i === 0 ? (swFault ? '#ef4444' : '#10b981') : i < 5 ? '#10b981' : '#334155'} />
          </g>
        ))}
        <text x="98" y="85" textAnchor="middle" fontSize="7.5" fill="#94a3b8" className="font-mono">
          Link/ACT: {swFault ? 'PORT DARK' : '1Gbps FULL'}
        </text>
      </g>

      {/* Cat6 Patch Cord */}
      <line
        x1="228"
        y1="114"
        x2="334"
        y2="114"
        stroke={swFault ? '#ef4444' : '#2563eb'}
        strokeWidth="3.2"
        strokeDasharray={swFault ? '5 4' : undefined}
      />
      {!swFault && playing && <circle cx={228 + 106 * packetT} cy="114" r="4.2" fill="#38bdf8" />}
      {swFault && (
        <g transform="translate(281, 114)">
          <circle r="10" fill="#ef4444" />
          <path d="M-4 -4 L4 4 M4 -4 L-4 4" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
        </g>
      )}

      {/* Modular Industrial PLC Main Rack (24V PSU + CPU + I/O Cards) */}
      <g transform="translate(334, 34)" filter={`url(#${uid}-shadow)`}>
        <rect x="0" y="0" width="350" height="162" rx="10" fill={`url(#${uid}-metal)`} stroke={plcFault ? '#ef4444' : '#334155'} strokeWidth="2" />
        <text x="175" y="18" textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#e2e8f0" className="font-mono">
          PLC MAIN CABINET (DIN-RAIL RACK)
        </text>
        {/* 24VDC PSU Module */}
        <rect x="14" y="28" width="76" height="120" rx="5" fill="#1e293b" stroke="#475569" />
        <text x="52" y="45" textAnchor="middle" fontSize="8" fontWeight="700" fill="#94a3b8" className="font-mono">PSU 24V</text>
        <circle cx="52" cy="74" r="5" fill="#10b981" />
        <text x="52" y="92" textAnchor="middle" fontSize="7" fill="#6ee7b7" className="font-mono">DC OK</text>

        {/* CPU Module */}
        <rect x="98" y="28" width="124" height="120" rx="5" fill="#1e293b" stroke={plcFault ? '#ef4444' : '#3b82f6'} strokeWidth="1.5" />
        <text x="160" y="45" textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#7dd3fc" className="font-mono">PLC CPU</text>
        <circle cx="118" cy="68" r="4.5" fill={plcFault ? '#f59e0b' : '#10b981'} />
        <text x="130" y="71" fontSize="8" fill="#e2e8f0" className="font-mono">RUN</text>
        <circle cx="118" cy="88" r="4.5" fill={plcFault ? '#ef4444' : '#334155'} />
        <text x="130" y="91" fontSize="8" fill={plcFault ? '#fca5a5' : '#64748b'} className="font-mono">SF / ERR</text>
        <circle cx="118" cy="108" r="4.5" fill={swFault ? '#ef4444' : '#10b981'} />
        <text x="130" y="111" fontSize="8" fill="#e2e8f0" className="font-mono">ETH LINK</text>

        {/* I/O Cards */}
        {[230, 286].map((ix, idx) => (
          <g key={ix}>
            <rect x={ix} y="28" width="48" height="120" rx="5" fill="#1e293b" stroke="#475569" />
            <text x={ix + 24} y="45" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#94a3b8" className="font-mono">
              I/O {idx + 1}
            </text>
            {[62, 78, 94, 110].map((ly) => (
              <circle key={ly} cx={ix + 16} cy={ly} r="2.5" fill={plcFault ? '#f59e0b' : '#10b981'} />
            ))}
          </g>
        ))}
      </g>
    </svg>
  );
}

export function RunbookCaseAnimation({
  guideId,
  iconType,
  isTh,
  diagramNodes = [],
  failedIdx = null,
  failedNode = null,
  networkMatrix = [],
  onSyncFailedIdx,
}: {
  guideId: string;
  iconType: string;
  isTh: boolean;
  diagramNodes?: FlowNode[];
  failedIdx?: number | null;
  failedNode?: FlowNode | null;
  networkMatrix?: PingRule[];
  onSyncFailedIdx?: (idx: number | null) => void;
}) {
  const eqKey = getNormalizedEquipmentKey(guideId, iconType);
  const titleCfg = CASE_TITLES[eqKey] || CASE_TITLES.PLC_MAIN;
  const [playing, setPlaying] = useState(true);

  const faultStage = useMemo(
    () => resolveFaultStage(failedNode, failedIdx, diagramNodes.length),
    [failedNode, failedIdx, diagramNodes.length],
  );

  const matchedRule = useMemo(
    () => matchNetworkRuleForNode(failedNode, failedIdx, diagramNodes.length, networkMatrix),
    [failedNode, failedIdx, diagramNodes.length, networkMatrix],
  );

  return (
    <div className="rounded-2xl border border-slate-200/90 dark:border-slate-700/80 bg-white dark:bg-slate-900 p-4 space-y-3 break-inside-avoid">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-100">
          <span className="h-7 w-7 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Film className="h-4 w-4" />
          </span>
          <span>
            {isTh
              ? `รูปประกอบการแก้ไขเคส: ${titleCfg.titleTh}`
              : `Animated Case Illustration: ${titleCfg.titleEn}`}
          </span>
          {failedNode && failedIdx !== null && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/25 text-red-600 dark:text-red-400 text-[10px] font-mono font-semibold">
              {isTh
                ? `ด่าน ${failedIdx + 1}: ${failedNode.label}`
                : `Stage ${failedIdx + 1}: ${failedNode.label}`}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 print:hidden">
          {failedIdx !== null && onSyncFailedIdx && (
            <button
              type="button"
              onClick={() => onSyncFailedIdx(null)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:border-blue-400 transition cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" />
              <span>{isTh ? 'กลับสู่ปกติ' : 'Reset'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:border-blue-400 transition cursor-pointer"
          >
            {playing ? <Pause className="h-3 w-3 text-blue-600" /> : <Play className="h-3 w-3 text-emerald-600" />}
            <span>{playing ? (isTh ? 'หยุดภาพ' : 'Pause') : isTh ? 'เล่นภาพ' : 'Play'}</span>
          </button>
        </div>
      </div>

      {/* 1-to-1 Buttons Matching the Exact Stages of This Guide */}
      <div className="flex flex-wrap gap-1.5 print:hidden">
        <button
          type="button"
          onClick={() => onSyncFailedIdx?.(null)}
          className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition cursor-pointer ${
            failedIdx === null
              ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
              : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          {isTh ? '0. ปกติ (ทุกจุดผ่าน)' : '0. Normal (All OK)'}
        </button>
        {diagramNodes.map((node, idx) => {
          const active = failedIdx === idx;
          return (
            <button
              key={`${node.label}-${idx}`}
              type="button"
              onClick={() => onSyncFailedIdx?.(active ? null : idx)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition cursor-pointer ${
                active
                  ? 'bg-red-600 border-red-600 text-white shadow-xs'
                  : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {`${idx + 1}. ${node.label} ${isTh ? 'ไม่เจอ' : 'Fail'}`}
            </button>
          );
        })}
      </div>

      {/* Realistic Hardware SVG Simulation */}
      <RealisticEquipmentSvg eqKey={eqKey} faultStage={faultStage} playing={playing} />

      {/* Synchronized Diagnostic Banner Using Actual Guide Rule */}
      {failedNode && failedIdx !== null ? (
        <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/75 dark:bg-red-950/30 p-3 text-xs flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold text-red-700 dark:text-red-300">
              {matchedRule
                ? matchedRule.condition
                : isTh
                  ? `จุดที่ขาด (ด่าน ${failedIdx + 1}): ${failedNode.label}`
                  : `Failure at Stage ${failedIdx + 1}: ${failedNode.label}`}
            </div>
            <div className="text-slate-700 dark:text-slate-200 leading-relaxed">
              <span className="font-semibold">{isTh ? 'วิเคราะห์ & วิธีแก้: ' : 'Action: '}</span>
              {matchedRule
                ? matchedRule.meaning
                : isTh
                  ? failedNode.hintTh
                  : failedNode.hintEn}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/25 p-3 text-xs flex items-start gap-2.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-slate-800 dark:text-slate-100">
              {isTh
                ? 'สถานะปกติ: ทุกด่านในเส้นทางเชื่อมต่อและทำงานสมบูรณ์'
                : 'Normal Status: All stages in the path are connected and healthy'}
            </div>
            <div className="text-slate-600 dark:text-slate-300 mt-0.5 flex items-center gap-1">
              <Wrench className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <span>
                {isTh
                  ? 'คลิกที่จุดในแผนภาพด้านบน หรือปุ่มด่านด้านบน เพื่อจำลองอาการเสียจริงตามข้อในคู่มือ'
                  : 'Click any stage in the diagram or buttons above to simulate the exact guide failure case.'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

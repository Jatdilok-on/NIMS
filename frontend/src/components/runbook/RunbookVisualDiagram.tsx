'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  Cpu,
  HardDrive,
  Info,
  Network,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Server,
  Wifi,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';

export interface FlowNode {
  label: string;
  linkTypeBefore: 'LAN' | 'WIFI' | null;
  roleKind: 'CORE' | 'SWITCH' | 'AP' | 'CLIENT' | 'PLC' | 'VEHICLE' | 'ENDPOINT';
  hintTh: string;
  hintEn: string;
}

function classifyNode(rawLabel: string): Omit<FlowNode, 'label' | 'linkTypeBefore'> {
  const lower = rawLabel.toLowerCase();
  if (/server|wcs|wms|nvr|core|gateway/.test(lower)) {
    return {
      roleKind: 'CORE',
      hintTh:
        'ถ้าจุดนี้ Ping ไม่เจอ: ตรวจสอบไฟตู้ Server / Core Switch หรือสาย Fiber Uplink หลัก (แจ้งทีม Network / Server)',
      hintEn: 'If unreachable here: verify Main Server, Core Switch power, and core uplink fiber.',
    };
  }
  if (/switch|poe/.test(lower)) {
    return {
      roleKind: 'SWITCH',
      hintTh:
        'ถ้าจุดนี้ไม่ตอบ: ดูไฟตู้ Rack โซนนั้นว่าไฟ/UPS ติดอยู่หรือไม่ และสาย Fiber Uplink เข้า Switch ติดไหม',
      hintEn: 'Check Zone Rack UPS/power and Switch uplink/PoE status LEDs.',
    };
  }
  if (/bridge\s*ap|access\s*point|sundray|\bap\b/.test(lower) && !/client/.test(lower)) {
    return {
      roleKind: 'AP',
      hintTh:
        'ถ้าตัว AP / Bridge AP ไม่ตอบ: ดูไฟ LED บนตัว AP (ถ้าดับมืด = ไม่มีไฟ PoE จาก Switch / สาย UTP หลุด) แล้วแจ้งทีม Network เช็กพอร์ต',
      hintEn:
        'If AP/Bridge AP fails: check AP LED (dark = no PoE from Switch / loose UTP) and escalate PoE port check.',
    };
  }
  if (/client|bridge\s*cl|rutx10|teltonika|mikrotik|hap\s*ax2|phoenix|wlan/.test(lower)) {
    return {
      roleKind: 'CLIENT',
      hintTh:
        'AP ฝั่งนิ่งปกติแต่จุดนี้หลุด: เช็กไฟเลี้ยงบนรถ/เครน (24VDC), ไฟบนตัว hAP ax2 / Phoenix WLAN / RUTX10, เสา Wi-Fi หลวม, หน้าจาน Bridge ถูกบัง หรือจุดอับสัญญาณ',
      hintEn:
        'Fixed AP OK but client unreachable: inspect vehicle DC power, hAP ax2 / Phoenix WLAN / RUTX10 LEDs, Wi-Fi antennas, dish line-of-sight, or track dead zone.',
    };
  }
  if (/(amr|rgv|รถ)/.test(lower) && !/shuttle|บนรถ/.test(lower)) {
    return {
      roleKind: 'VEHICLE',
      hintTh:
        'ถ้ารถ AMR/RGV ไม่ตอบ: เช็กหน้าจอ/E-Stop/Bumper/ไฟเลี้ยงบนตัวรถก่อน ถ้าดับหลายคันโซนเดียวกันให้เช็ก Access Point จุดนั้น',
      hintEn:
        'Check AMR/RGV E-Stop, bumper safety, and power first. If multiple units drop in one aisle/rail, check the zone AP.',
    };
  }
  if (/plc/.test(lower)) {
    return {
      roleKind: 'PLC',
      hintTh:
        'ถ้า PLC ไม่ตอบ (ทั้งที่ AP/Client/Switch ก่อนหน้ายังดี): ตรวจไฟ POWER/RUN ที่ตัว PLC และขยับ/เปลี่ยนสาย LAN เส้นสั้นที่เสียบเข้าพอร์ต PLC',
      hintEn:
        'Upstream links OK but PLC unreachable: check PLC POWER/RUN LEDs and reseat/swap the short LAN patch cable.',
    };
  }
  return {
    roleKind: 'ENDPOINT',
    hintTh: 'ตรวจไฟเลี้ยงตัวอุปกรณ์, ไฟพอร์ตสาย LAN และสายเชื่อมต่อหน้างานก่อนส่งต่อทีม Network',
    hintEn: 'Verify device power, LAN Link LED, and local patch cable before escalating.',
  };
}

export function parsePathToNodes(pathText: string): FlowNode[] {
  const normalized = (pathText || '')
    .replace(/~+\s*[^~→]+~+/g, ' ~~ ')
    .replace(/ลิงก์ไร้สาย/g, ' ~~ ')
    .trim();

  if (!normalized || normalized === '-') return [];

  const tokens = normalized
    .split(/(\s*~~\s*|\s*→\s*|\s*->\s*)/)
    .filter((t) => t.trim().length > 0);
  const nodes: FlowNode[] = [];
  let pendingLink: 'LAN' | 'WIFI' | null = null;

  for (const token of tokens) {
    const trimmed = token.trim();
    if (trimmed === '→' || trimmed === '->') {
      pendingLink = 'LAN';
      continue;
    }
    if (trimmed === '~~') {
      pendingLink = 'WIFI';
      continue;
    }

    const cleanLabel = trimmed.replace(/^~+|~+$/g, '').trim();
    if (!cleanLabel) continue;

    let linkType = pendingLink;
    if (nodes.length > 0 && linkType === 'LAN') {
      const prevLower = nodes[nodes.length - 1].label.toLowerCase();
      const curLower = cleanLabel.toLowerCase();
      const prevIsFixedAp =
        /access\s*point|bridge\s*ap|\bap\b/.test(prevLower) && !/client/.test(prevLower);
      const curIsWirelessPeer =
        /bridge\s*cl|ap\s*client|client|rutx10|mikrotik|hap\s*ax2|phoenix|wlan|amr|rgv|wifi|ไร้สาย/.test(
          curLower,
        );
      if (prevIsFixedAp && curIsWirelessPeer) {
        linkType = 'WIFI';
      }
    }

    const meta = classifyNode(cleanLabel);
    nodes.push({
      label: cleanLabel,
      linkTypeBefore: nodes.length === 0 ? null : linkType || 'LAN',
      ...meta,
    });
    pendingLink = null;
  }

  return nodes;
}

function nodeIcon(kind: FlowNode['roleKind']) {
  switch (kind) {
    case 'CORE':
      return <Server className="h-5 w-5" />;
    case 'SWITCH':
      return <Network className="h-5 w-5" />;
    case 'AP':
      return <Wifi className="h-5 w-5" />;
    case 'CLIENT':
      return <Radio className="h-5 w-5" />;
    case 'PLC':
      return <Cpu className="h-5 w-5" />;
    case 'VEHICLE':
      return <Bot className="h-5 w-5" />;
    default:
      return <HardDrive className="h-5 w-5" />;
  }
}

export function RunbookVisualDiagram({
  guideId,
  pathText,
  isTh,
  direction: controlledDirection,
  onDirectionChange,
  failedIdx: controlledFailedIdx,
  onFailedIdxChange,
}: {
  guideId: string;
  pathText: string;
  isTh: boolean;
  direction?: 'PING' | 'FIELD';
  onDirectionChange?: (dir: 'PING' | 'FIELD') => void;
  failedIdx?: number | null;
  onFailedIdxChange?: (idx: number | null, node: FlowNode | null) => void;
}) {
  const rawNodes = useMemo(() => parsePathToNodes(pathText), [pathText]);
  const [internalDirection, setInternalDirection] = useState<'PING' | 'FIELD'>('PING');
  const [internalFailedIdx, setInternalFailedIdx] = useState<number | null>(null);

  const direction = controlledDirection ?? internalDirection;
  const failedIdx = controlledFailedIdx !== undefined ? controlledFailedIdx : internalFailedIdx;

  const setDirection = (next: 'PING' | 'FIELD') => {
    if (onDirectionChange) onDirectionChange(next);
    else setInternalDirection(next);
  };

  const setFailedIdx = (nextOrUpdater: number | null | ((cur: number | null) => number | null), currentNodes: FlowNode[]) => {
    const nextVal =
      typeof nextOrUpdater === 'function' ? nextOrUpdater(failedIdx) : nextOrUpdater;
    if (onFailedIdxChange) {
      onFailedIdxChange(nextVal, nextVal !== null ? currentNodes[nextVal] ?? null : null);
    } else {
      setInternalFailedIdx(nextVal);
    }
  };

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [scanStep, setScanStep] = useState<number>(0);

  useEffect(() => {
    if (controlledFailedIdx === undefined) {
      setInternalFailedIdx(null);
    }
    setScanStep(0);
  }, [guideId, pathText, direction, controlledFailedIdx]);

  const nodes = useMemo(() => {
    if (direction === 'PING' || rawNodes.length <= 1) return rawNodes;
    const reversed = [...rawNodes].reverse();
    return reversed.map((node, idx) => {
      if (idx === 0) return { ...node, linkTypeBefore: null };
      const origRightIdx = rawNodes.length - idx;
      return { ...node, linkTypeBefore: rawNodes[origRightIdx].linkTypeBefore };
    });
  }, [rawNodes, direction]);

  // Smooth sequential step-tracer animation when no failure point is pinned
  useEffect(() => {
    if (!isPlaying || failedIdx !== null || nodes.length === 0) return;
    const timer = window.setInterval(() => {
      setScanStep((prev) => (prev + 1) % nodes.length);
    }, 1250);
    return () => window.clearInterval(timer);
  }, [isPlaying, failedIdx, nodes.length]);

  if (nodes.length === 0) return null;

  const selectedNode = failedIdx !== null ? nodes[failedIdx] : null;

  return (
    <div className="space-y-4">
      {/* Interactive Animated Connection Path Diagram */}
      <div className="rounded-2xl border border-slate-200/90 dark:border-slate-700/80 bg-gradient-to-br from-slate-50/90 via-white to-blue-50/50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800/60 p-4 sm:p-5 space-y-4 shadow-xs break-inside-avoid">
        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-100">
            <span className="h-7 w-7 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Network className="h-4 w-4" />
            </span>
            <div>
              <div>
                {isTh
                  ? 'แผนภาพลำดับการเช็ก (คลิกที่จุดที่ Ping ไม่เจอ / ดับ เพื่อดูวิธีตรวจสอบ)'
                  : 'Interactive Triage Map (Click the node where Ping stops to see what to check)'}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Play / Pause & Reset Controls */}
            <div className="inline-flex items-center gap-1 print:hidden">
              <button
                type="button"
                onClick={() => setIsPlaying((p) => !p)}
                title={isPlaying ? 'Pause animation' : 'Play animation'}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition cursor-pointer ${
                  isPlaying && failedIdx === null
                    ? 'border-blue-200 dark:border-blue-800 bg-blue-50/80 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                }`}
              >
                {isPlaying ? (
                  <>
                    <Pause className="h-3 w-3" />
                    <span>{isTh ? 'หยุดเคลื่อนไหว' : 'Pause'}</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3 w-3" />
                    <span>{isTh ? 'เล่นภาพเคลื่อนไหว' : 'Animate'}</span>
                  </>
                )}
              </button>

              {failedIdx !== null && (
                <button
                  type="button"
                  onClick={() => setFailedIdx(null, nodes)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600 hover:border-blue-300 transition cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>{isTh ? 'รีเซ็ต' : 'Reset'}</span>
                </button>
              )}
            </div>

            {/* Ping vs Field Walk-up Direction Switcher */}
            <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-0.5 text-[11px] font-semibold print:hidden">
              <button
                type="button"
                onClick={() => setDirection('PING')}
                className={`px-2.5 py-1 rounded-lg cursor-pointer transition ${
                  direction === 'PING'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {isTh ? '🖥️ Ping จากคอมฯ (ต้นทาง → ปลายทาง)' : '🖥️ Ping Order (Source → End)'}
              </button>
              <button
                type="button"
                onClick={() => setDirection('FIELD')}
                className={`px-2.5 py-1 rounded-lg cursor-pointer transition ${
                  direction === 'FIELD'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {isTh ? '🚶 เดินดูหน้างาน (ตัวเครื่อง → Switch)' : '🚶 Floor Check (Unit → Switch)'}
              </button>
            </div>

            <div className="flex items-center gap-3 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-5 h-0.5 bg-blue-500 rounded-full" />
                {isTh ? 'สาย LAN / Fiber' : 'Wired LAN'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-5 border-t-2 border-dashed border-emerald-500" />
                {isTh ? 'สัญญาณ Wi-Fi / Bridge' : 'Wireless RF'}
              </span>
            </div>
          </div>
        </div>

        {/* Visual Animated Node Chain */}
        <div className="overflow-x-auto pb-1 print:overflow-visible">
          <div className="flex items-center justify-start lg:justify-between gap-1 min-w-[640px] py-3 px-1 print:min-w-0 print:w-full print:flex-nowrap print:justify-between print:gap-1 print:py-1.5">
            {nodes.map((node, idx) => {
              const isFailed = failedIdx === idx;
              const isPassed = failedIdx !== null && idx < failedIdx;
              const isAfterFail = failedIdx !== null && idx > failedIdx;
              const isScanning = failedIdx === null && isPlaying && scanStep === idx;
              const isScanReached = failedIdx === null && isPlaying && idx <= scanStep;
              const isWifiHop = node.linkTypeBefore === 'WIFI';

              // Link state entering node[idx]
              const linkIsBroken = failedIdx !== null && idx === failedIdx;
              const linkIsHealthy = failedIdx !== null && idx < failedIdx;
              const linkIsDead = failedIdx !== null && idx > failedIdx;
              const linkIsActiveFlow =
                isPlaying &&
                ((failedIdx === null && (scanStep === idx || scanStep === idx - 1)) || linkIsHealthy);

              const strokeColor = linkIsBroken
                ? '#ef4444'
                : linkIsHealthy
                  ? '#10b981'
                  : linkIsDead
                    ? '#cbd5e1'
                    : isWifiHop
                      ? '#10b981'
                      : '#3b82f6';

              return (
                <React.Fragment key={`${node.label}-${idx}`}>
                  {idx > 0 && (
                    <div className="flex-1 min-w-[64px] print:min-w-[26px] print:px-0.5 flex flex-col items-center justify-center px-1.5">
                      {/* Hop Type Badge */}
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-bold mb-1.5 px-2 py-0.5 rounded-full whitespace-nowrap transition-colors ${
                          linkIsBroken
                            ? 'bg-red-500/12 text-red-600 dark:text-red-400'
                            : linkIsHealthy
                              ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                              : linkIsDead
                                ? 'text-slate-400'
                                : isWifiHop
                                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                  : 'bg-blue-500/10 text-blue-700 dark:text-blue-400'
                        }`}
                      >
                        {linkIsBroken ? (
                          <span>✕ {isTh ? 'ขาดช่วงนี้' : 'Broken'}</span>
                        ) : isWifiHop ? (
                          <span>📶 {isTh ? 'Wi-Fi / คลื่น' : 'Wi-Fi'}</span>
                        ) : (
                          <span>🔌 {isTh ? 'สาย LAN' : 'LAN'}</span>
                        )}
                      </span>

                      {/* Animated SVG Cable / Wireless Wave Track */}
                      <div className="w-full relative h-5 flex items-center">
                        <svg
                          viewBox="0 0 100 20"
                          preserveAspectRatio="none"
                          className="flex-1 h-5 overflow-visible"
                        >
                          {/* Subtle Base Track */}
                          <line
                            x1="0"
                            y1="10"
                            x2="100"
                            y2="10"
                            stroke={strokeColor}
                            strokeOpacity={linkIsDead ? 0.35 : 0.25}
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeDasharray={isWifiHop ? '5 5' : undefined}
                          />

                          {/* Animated Flowing Pulse Stroke */}
                          {!linkIsDead && !linkIsBroken && (
                            <line
                              x1="0"
                              y1="10"
                              x2="100"
                              y2="10"
                              stroke={strokeColor}
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeDasharray={isWifiHop ? '5 5' : '8 16'}
                              className={isPlaying ? 'nims-runbook-dash' : ''}
                            />
                          )}

                          {/* Broken Link Dashed Lead */}
                          {linkIsBroken && (
                            <line
                              x1="0"
                              y1="10"
                              x2="50"
                              y2="10"
                              stroke="#ef4444"
                              strokeWidth="2.5"
                              strokeDasharray="4 4"
                            />
                          )}
                        </svg>

                        {/* Crisp Non-Stretched Arrowhead */}
                        <svg
                          viewBox="0 0 10 20"
                          className="w-2.5 h-5 shrink-0 -ml-0.5"
                        >
                          <polygon
                            points="0,5.5 9,10 0,14.5"
                            fill={strokeColor}
                            opacity={linkIsDead ? 0.45 : 0.95}
                          />
                        </svg>

                        {/* Perfect Circle Broken Link X Marker (Never Stretched) */}
                        {linkIsBroken && (
                          <span
                            aria-hidden="true"
                            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-4.5 w-4.5 rounded-full bg-red-500 text-white flex items-center justify-center shadow-xs pointer-events-none"
                          >
                            <X className="h-2.5 w-2.5 stroke-[3]" />
                          </span>
                        )}

                        {/* Smooth Glowing Packet Orb Traveling Along the Link */}
                        {isPlaying && !linkIsDead && !linkIsBroken && (
                          <span
                            aria-hidden="true"
                            className={`nims-runbook-packet print:hidden absolute top-1/2 h-2.5 w-2.5 rounded-full pointer-events-none ${
                              linkIsHealthy || isWifiHop
                                ? 'bg-emerald-400 shadow-[0_0_10px_2px_rgba(16,185,129,0.75)]'
                                : isScanning || linkIsActiveFlow
                                  ? 'bg-blue-500 shadow-[0_0_10px_2px_rgba(59,130,246,0.75)]'
                                  : 'bg-sky-400/85 shadow-[0_0_8px_1px_rgba(56,189,248,0.6)]'
                            }`}
                            style={{
                              animationDelay: `${(idx - 1) * 0.32}s`,
                            }}
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Interactive Stage Card */}
                  <button
                    type="button"
                    onClick={() => setFailedIdx((cur) => (cur === idx ? null : idx), nodes)}
                    className={`group relative flex flex-col items-center text-center w-38 shrink-0 print:w-auto print:flex-1 print:min-w-0 print:p-2 print:rounded-xl rounded-2xl border p-3 transition-all duration-300 cursor-pointer ${
                      isFailed
                        ? 'nims-runbook-fail-ring border-red-500 bg-red-50/95 dark:bg-red-950/55 shadow-md scale-[1.03]'
                        : isPassed
                          ? 'border-emerald-400 bg-emerald-50/80 dark:bg-emerald-950/35 shadow-xs'
                          : isAfterFail
                            ? 'border-slate-200 dark:border-slate-800 opacity-50 bg-white/55 dark:bg-slate-900/55'
                            : isScanning
                              ? 'border-blue-500 bg-white dark:bg-slate-900 shadow-[0_10px_28px_-10px_rgba(37,99,235,0.45)] ring-2 ring-blue-500/25 -translate-y-0.5'
                              : isScanReached
                                ? 'border-blue-300/80 dark:border-blue-700/70 bg-white/95 dark:bg-slate-900 shadow-xs'
                                : 'border-slate-200/90 dark:border-slate-700 bg-white/90 dark:bg-slate-900 hover:border-blue-400 hover:shadow-sm hover:-translate-y-0.5'
                    }`}
                  >
                    {/* Step Number Badge */}
                    <span
                      className={`absolute -top-2.5 -left-2.5 h-6 w-6 rounded-full text-[11px] font-bold flex items-center justify-center shadow-xs transition-colors ${
                        isFailed
                          ? 'bg-red-600 text-white'
                          : isPassed
                            ? 'bg-emerald-600 text-white'
                            : isScanning
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-800 dark:bg-slate-700 text-white'
                      }`}
                    >
                      {idx + 1}
                    </span>

                    {/* Live Scan Ping Pulse Dot */}
                    {isScanning && (
                      <span
                        aria-hidden="true"
                        className="print:hidden absolute top-2 right-2 h-2 w-2 rounded-full bg-blue-500 text-blue-500 nims-pulse-ring"
                      />
                    )}

                    {/* Node Icon Pod */}
                    <div
                      className={`h-10 w-10 rounded-xl flex items-center justify-center mb-2 transition-transform duration-300 ${
                        isScanning ? 'scale-110' : 'group-hover:scale-105'
                      } ${
                        isFailed
                          ? 'bg-red-100 text-red-600 dark:bg-red-900/60 dark:text-red-300'
                          : isPassed
                            ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/60 dark:text-emerald-300'
                            : isScanning
                              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
                              : 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300'
                      }`}
                    >
                      {nodeIcon(node.roleKind)}
                    </div>

                    <div className="text-[11.5px] font-bold leading-snug text-slate-800 dark:text-slate-100">
                      {node.label}
                    </div>

                    <div className="mt-1.5 text-[10px] font-semibold">
                      {isFailed ? (
                        <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                          <XCircle className="h-3 w-3" />
                          {isTh ? 'ขาดตรงนี้' : 'Failed Here'}
                        </span>
                      ) : isPassed ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />
                          Ping OK
                        </span>
                      ) : isAfterFail ? (
                        <span className="text-slate-400">
                          {isTh ? 'สัญญาณมาไม่ถึง' : 'Unreachable'}
                        </span>
                      ) : isScanning ? (
                        <span className="text-blue-600 dark:text-blue-400">
                          {direction === 'PING'
                            ? isTh
                              ? 'กำลังตรวจขั้นตอนนี้...'
                              : 'Checking...'
                            : isTh
                              ? 'จุดตรวจหน้างาน...'
                              : 'Inspecting...'}
                        </span>
                      ) : (
                        <span className="text-slate-400 group-hover:text-blue-500 transition-colors">
                          {isTh ? 'คลิกทดสอบอาการ' : 'Click to inspect'}
                        </span>
                      )}
                    </div>
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Interactive Hint Box when a node is clicked */}
        {selectedNode ? (
          <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/85 dark:bg-red-950/35 p-3.5 text-xs flex items-start gap-2.5">
            <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-red-700 dark:text-red-300">
                {isTh
                  ? `จุดที่ขาด (ด่าน ${failedIdx! + 1}): ${selectedNode.label}`
                  : `Failure at Stage ${failedIdx! + 1}: ${selectedNode.label}`}
              </div>
              <div className="text-slate-700 dark:text-slate-200 mt-0.5 leading-relaxed">
                {isTh ? selectedNode.hintTh : selectedNode.hintEn}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 text-blue-500 shrink-0" />
            <span>
              {isTh
                ? 'เคล็ดลับ: กดคลิกที่อุปกรณ์ตัวที่ไม่ตอบในแผนภาพด้านบน ระบบจะจำลองให้เห็นทันทีว่าต้องเริ่มตรวจที่สายหรือคลื่นช่วงไหน'
                : 'Tip: Click any node above that fails Ping to highlight exactly which wired or wireless hop to inspect.'}
            </span>
          </div>
        )}
      </div>

      {/* LED Visual Status Reference Strip */}
      <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 print:p-3 break-inside-avoid">
        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2.5 flex items-center gap-1.5">
          <Wrench className="h-3.5 w-3.5 text-blue-600" />
          {isTh
            ? 'คู่มือดูสีไฟ LED หน้าเครื่องจริง (เช็กหน้างานใน 5 วินาที)'
            : 'Quick Hardware LED Visual Guide (5-Second Field Check)'}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-4 gap-2.5 print:gap-2 text-xs">
          <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/25 border border-emerald-200/70 dark:border-emerald-900/50">
            <span className="relative flex h-3.5 w-3.5 mt-0.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500" />
            </span>
            <div>
              <div className="font-bold text-emerald-700 dark:text-emerald-300">
                {isTh ? 'เขียวติด / กระพริบ' : 'Green Solid / Blink'}
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-300">
                {isTh ? 'POWER/RUN ปกติ & สาย LAN กำลังส่งข้อมูล' : 'Power normal & LAN link active'}
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/25 border border-amber-200/70 dark:border-amber-900/50">
            <span className="relative flex h-3.5 w-3.5 mt-0.5 shrink-0">
              <span className="animate-pulse relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-500" />
            </span>
            <div>
              <div className="font-bold text-amber-700 dark:text-amber-300">
                {isTh ? 'ส้ม / กระพริบถี่' : 'Amber / Fast Blink'}
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-300">
                {isTh ? 'กำลังบูต, หา Controller หรือ Bridge คู่ไม่เจอ' : 'Booting or lost AP controller / bridge peer'}
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-red-50/60 dark:bg-red-950/25 border border-red-200/70 dark:border-red-900/50">
            <span className="inline-flex rounded-full h-3.5 w-3.5 bg-red-600 mt-0.5 shrink-0 shadow-sm shadow-red-500/40" />
            <div>
              <div className="font-bold text-red-700 dark:text-red-300">
                {isTh ? 'สีแดงติดค้าง (ERR/SF)' : 'Solid Red (ERR / SF)'}
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-300">
                {isTh ? 'ตัวเครื่อง Error, กด E-Stop หรือ Safety ล็อก' : 'Hardware fault, E-Stop, or safety alarm'}
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <span className="inline-flex rounded-full h-3.5 w-3.5 bg-slate-400 dark:bg-slate-600 mt-0.5 shrink-0" />
            <div>
              <div className="font-bold text-slate-700 dark:text-slate-200">
                {isTh ? 'ไฟดับมืดสนิท' : 'Completely Dark'}
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-300">
                {isTh ? 'เบรกเกอร์ดับ, สายหลวม หรือพอร์ต PoE ไม่จ่ายไฟ' : 'No power, loose RJ45, or PoE port disabled'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  Camera,
  CheckCircle2,
  Cpu,
  HardDrive,
  Info,
  Network,
  Radio,
  Server,
  TrainFront,
  Wifi,
  Wrench,
  XCircle,
} from 'lucide-react';
import { getDeviceLedClass, isDeviceAgentLive } from '@/lib/deviceTelemetry';
import { Device, DeviceCategory, DeviceStatus } from '@/lib/types';

interface FlowNode {
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
      hintTh: 'ถ้าจุดนี้ Ping ไม่เจอ: ตรวจสอบไฟตู้ Server / Core Switch หรือสาย Fiber Uplink หลัก (แจ้งทีม Network / Server)',
      hintEn: 'If unreachable here: verify Main Server, Core Switch power, and core uplink fiber.',
    };
  }
  if (/switch|poe/.test(lower)) {
    return {
      roleKind: 'SWITCH',
      hintTh: 'ถ้าจุดนี้ไม่ตอบ: ดูไฟตู้ Rack โซนนั้นว่าไฟ/UPS ติดอยู่หรือไม่ และสาย Fiber Uplink เข้า Switch ติดไหม',
      hintEn: 'Check Zone Rack UPS/power and Switch uplink/PoE status LEDs.',
    };
  }
  if (/bridge\s*ap|access\s*point|sundray|\bap\b/.test(lower) && !/client/.test(lower)) {
    return {
      roleKind: 'AP',
      hintTh: 'ถ้าตัว AP / Bridge AP ไม่ตอบ: ดูไฟ LED บนตัว AP (ถ้าดับมืด = ไม่มีไฟ PoE จาก Switch / สาย UTP หลุด) แล้วแจ้งทีม Network เช็กพอร์ต',
      hintEn: 'If AP/Bridge AP fails: check AP LED (dark = no PoE from Switch / loose UTP) and escalate PoE port check.',
    };
  }
  if (/client|bridge\s*cl|rutx10|teltonika/.test(lower)) {
    return {
      roleKind: 'CLIENT',
      hintTh: 'AP ฝั่งนิ่งปกติแต่จุดนี้หลุด: เช็กไฟเลี้ยงบนรถ/เครน, เสา Wi-Fi หลวม, หน้าจาน Bridge ถูกบัง หรือจุดอับสัญญาณในซอย',
      hintEn: 'Fixed AP OK but client unreachable: inspect vehicle power, Wi-Fi antennas, dish line-of-sight, or aisle dead zone.',
    };
  }
  if (/amr|รถ/.test(lower) && !/shuttle|บนรถ/.test(lower)) {
    return {
      roleKind: 'VEHICLE',
      hintTh: 'ถ้ารถ AMR ไม่ตอบ: เช็กหน้าจอ/E-Stop/Bumper/แบตเตอรี่บนตัวรถก่อน ถ้าดับหลายคันโซนเดียวกันให้เช็ก Access Point จุดนั้น',
      hintEn: 'Check AMR E-Stop, bumper safety, and battery first. If multiple units drop in one aisle, check the zone AP.',
    };
  }
  if (/plc/.test(lower)) {
    return {
      roleKind: 'PLC',
      hintTh: 'ถ้า PLC ไม่ตอบ (ทั้งที่ AP/Client/Switch ก่อนหน้ายังดี): ตรวจไฟ POWER/RUN ที่ตัว PLC และขยับ/เปลี่ยนสาย LAN เส้นสั้นที่เสียบเข้าพอร์ต PLC',
      hintEn: 'Upstream links OK but PLC unreachable: check PLC POWER/RUN LEDs and reseat/swap the short LAN patch cable.',
    };
  }
  return {
    roleKind: 'ENDPOINT',
    hintTh: 'ตรวจไฟเลี้ยงตัวอุปกรณ์, ไฟพอร์ตสาย LAN และสายเชื่อมต่อหน้างานก่อนส่งต่อทีม Network',
    hintEn: 'Verify device power, LAN Link LED, and local patch cable before escalating.',
  };
}

function parsePathToNodes(pathText: string): FlowNode[] {
  const normalized = (pathText || '')
    .replace(/~+\s*[^~→]+~+/g, ' ~~ ')
    .replace(/ลิงก์ไร้สาย/g, ' ~~ ')
    .trim();

  if (!normalized || normalized === '-') return [];

  // Split keeping delimiter information (`~~` indicates wireless hop; `→`/`->` wired hop)
  const tokens = normalized.split(/(\s*~~\s*|\s*→\s*|\s*->\s*)/).filter((t) => t.trim().length > 0);
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

    // Infer wireless link automatically when connecting from AP -> Client/AMR/Bridge CL even if arrow was `→`
    let linkType = pendingLink;
    if (nodes.length > 0 && linkType === 'LAN') {
      const prevLower = nodes[nodes.length - 1].label.toLowerCase();
      const curLower = cleanLabel.toLowerCase();
      const prevIsFixedAp =
        (/access\s*point|bridge\s*ap|\bap\b/.test(prevLower) && !/client/.test(prevLower));
      const curIsWirelessPeer =
        /bridge\s*cl|ap\s*client|client|rutx10|amr|wifi|ไร้สาย/.test(curLower);
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

const ROLE_CATEGORY_MAP: Record<FlowNode['roleKind'], DeviceCategory[]> = {
  CORE: ['SERVER', 'NVR'],
  SWITCH: ['SWITCH'],
  AP: ['ACCESS_POINT', 'WLC'],
  CLIENT: ['AP_CLIENT'],
  PLC: ['PLC'],
  VEHICLE: ['PC', 'PLC', 'AP_CLIENT'],
  ENDPOINT: ['BARCODE', 'PLC', 'IP_CAM', 'PRINTER', 'UPS', 'NAS', 'VM', 'ESXI'],
};

function matchLiveStageDevices(
  roleKind: FlowNode['roleKind'],
  nodeLabel: string,
  siteDevices?: Device[],
): Device[] {
  if (!siteDevices || siteDevices.length === 0) return [];
  const lower = nodeLabel.toLowerCase();
  const candidates = siteDevices.filter((d) => isDeviceAgentLive(d));
  if (candidates.length === 0) return [];

  if (/barcode|scanner/.test(lower)) {
    return candidates.filter((d) => d.category === 'BARCODE');
  }
  if (/cam|cctv/.test(lower)) {
    return candidates.filter((d) => d.category === 'IP_CAM' || d.category === 'NVR');
  }
  const allowedCats = ROLE_CATEGORY_MAP[roleKind] || [];
  return candidates.filter((d) => allowedCats.includes(d.category));
}

export function RunbookVisualDiagram({
  guideId,
  pathText,
  isTh,
  siteDevices,
}: {
  guideId: string;
  pathText: string;
  isTh: boolean;
  siteDevices?: Device[];
}) {
  const rawNodes = useMemo(() => parsePathToNodes(pathText), [pathText]);
  const [direction, setDirection] = useState<'PING' | 'FIELD'>('PING');
  const [failedIdx, setFailedIdx] = useState<number | null>(null);

  useEffect(() => {
    setFailedIdx(null);
  }, [guideId, pathText, direction]);

  const nodes = useMemo(() => {
    if (direction === 'PING' || rawNodes.length <= 1) return rawNodes;
    const reversed = [...rawNodes].reverse();
    return reversed.map((node, idx) => {
      if (idx === 0) return { ...node, linkTypeBefore: null };
      // When reversed, the link before `reversed[idx]` was the link originally before `rawNodes[rawNodes.length - idx]`
      const origRightIdx = rawNodes.length - idx;
      return { ...node, linkTypeBefore: rawNodes[origRightIdx].linkTypeBefore };
    });
  }, [rawNodes, direction]);

  if (nodes.length === 0) return null;

  const selectedNode = failedIdx !== null ? nodes[failedIdx] : null;

  return (
    <div className="space-y-4">
      {/* Interactive Connection Path Diagram */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-slate-50 via-white to-blue-50/40 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800/60 p-4 space-y-3 break-inside-avoid">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
            <Network className="h-4 w-4 text-blue-600" />
            <span>
              {isTh
                ? 'แผนภาพลำดับการเช็ก (คลิกที่จุดที่ Ping ไม่เจอ / ดับ เพื่อดูวิธีตรวจสอบ)'
                : 'Interactive Triage Map (Click the node where Ping stops to see what to check)'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Ping vs Field Walk-up Direction Switcher */}
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-0.5 text-[11px] font-semibold print:hidden">
              <button
                type="button"
                onClick={() => setDirection('PING')}
                className={`px-2.5 py-1 rounded-md cursor-pointer transition ${
                  direction === 'PING'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {isTh ? '🖥️ Ping จากคอมฯ (ต้นทาง → ปลายทาง)' : '🖥️ Ping Order (Source → End)'}
              </button>
              <button
                type="button"
                onClick={() => setDirection('FIELD')}
                className={`px-2.5 py-1 rounded-md cursor-pointer transition ${
                  direction === 'FIELD'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {isTh ? '🚶 เดินดูหน้างาน (ตัวเครื่อง → Switch)' : '🚶 Floor Check (Unit → Switch)'}
              </button>
            </div>

            <div className="flex items-center gap-3 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-5 h-0.5 bg-blue-500" />
                {isTh ? 'สาย LAN / Fiber' : 'Wired LAN'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-5 border-t-2 border-dashed border-emerald-500" />
                {isTh ? 'สัญญาณ Wi-Fi / Bridge' : 'Wireless RF'}
              </span>
            </div>
          </div>
        </div>

        {/* Visual Node Chain */}
        <div className="overflow-x-auto pb-1 print:overflow-visible">
          <div className="flex items-center justify-start lg:justify-between gap-1 min-w-[600px] py-2 print:min-w-0 print:flex-wrap print:gap-2">
            {nodes.map((node, idx) => {
              const isFailed = failedIdx === idx;
              const isPassed = failedIdx !== null && idx < failedIdx;
              const isAfterFail = failedIdx !== null && idx > failedIdx;
              const isWifiHop = node.linkTypeBefore === 'WIFI';

              return (
                <React.Fragment key={`${node.label}-${idx}`}>
                  {idx > 0 && (
                    <div className="flex-1 min-w-[44px] flex flex-col items-center justify-center px-1">
                      <span
                        className={`text-[10px] font-bold mb-1 whitespace-nowrap ${
                          isWifiHop
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-blue-600 dark:text-blue-400'
                        }`}
                      >
                        {isWifiHop ? (isTh ? '📶 Wi-Fi / คลื่น' : '📶 Wi-Fi') : isTh ? '🔌 สาย LAN' : '🔌 LAN'}
                      </span>
                      <div className="w-full relative flex items-center">
                        {isWifiHop ? (
                          <div
                            className={`w-full border-t-2 border-dashed ${
                              isFailed
                                ? 'border-red-500'
                                : isPassed
                                  ? 'border-emerald-500'
                                  : 'border-emerald-400/80'
                            }`}
                          />
                        ) : (
                          <div
                            className={`w-full h-0.5 ${
                              isFailed
                                ? 'bg-red-500'
                                : isPassed
                                  ? 'bg-emerald-500'
                                  : 'bg-blue-400/80'
                            }`}
                          />
                        )}
                        <span
                          className={`ml-0.5 text-[10px] font-bold ${
                            isFailed ? 'text-red-500' : 'text-slate-400'
                          }`}
                        >
                          ▶
                        </span>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setFailedIdx((cur) => (cur === idx ? null : idx))}
                    className={`group relative flex flex-col items-center text-center w-36 shrink-0 rounded-xl border p-2.5 transition cursor-pointer ${
                      isFailed
                        ? 'border-red-500 bg-red-50 dark:bg-red-950/50 ring-2 ring-red-400/40 shadow-sm'
                        : isPassed
                          ? 'border-emerald-400 bg-emerald-50/70 dark:bg-emerald-950/30'
                          : isAfterFail
                            ? 'border-slate-200 dark:border-slate-800 opacity-55 bg-white/60 dark:bg-slate-900/60'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-blue-400 hover:shadow-sm'
                    }`}
                  >
                    <span className="absolute -top-2 -left-2 h-5 w-5 rounded-full bg-slate-800 dark:bg-slate-700 text-white text-[10px] font-bold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    {(() => {
                      const liveDevs = matchLiveStageDevices(node.roleKind, node.label, siteDevices);
                      if (liveDevs.length === 0) return null;
                      const offlineCount = liveDevs.filter((d) => d.status === 'OFFLINE').length;
                      const onlineCount = liveDevs.filter((d) => d.status === 'ONLINE').length;
                      const badgeStatus: DeviceStatus =
                        offlineCount > 0 ? 'OFFLINE' : onlineCount > 0 ? 'ONLINE' : 'MAINTENANCE';
                      const tooltip = liveDevs
                        .slice(0, 6)
                        .map(
                          (d) =>
                            `${d.name} (${d.managementIp || '-'}): ${d.status}${
                              d.lastLatencyMs != null ? ` ${d.lastLatencyMs}ms` : ''
                            }`,
                        )
                        .join('\n');
                      return (
                        <span
                          title={tooltip}
                          className={`absolute -top-2 -right-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold border shadow-xs ${
                            offlineCount > 0
                              ? 'bg-red-50 border-red-300 text-red-700 dark:bg-red-950 dark:border-red-700 dark:text-red-300'
                              : 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950 dark:border-emerald-700 dark:text-emerald-300'
                          }`}
                        >
                          <span className={getDeviceLedClass(badgeStatus, true)} />
                          <span>
                            {offlineCount > 0
                              ? `${offlineCount} OFF`
                              : `${onlineCount} LIVE`}
                          </span>
                        </span>
                      );
                    })()}

                    <div
                      className={`h-9 w-9 rounded-lg flex items-center justify-center mb-1.5 ${
                        isFailed
                          ? 'bg-red-100 text-red-600 dark:bg-red-900/60 dark:text-red-300'
                          : isPassed
                            ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/60 dark:text-emerald-300'
                            : 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300'
                      }`}
                    >
                      {nodeIcon(node.roleKind)}
                    </div>

                    <div className="text-[11px] font-bold leading-tight text-slate-800 dark:text-slate-100">
                      {node.label}
                    </div>

                    <div className="mt-1.5 text-[10px] font-semibold">
                      {isFailed ? (
                        <span className="inline-flex items-center gap-0.5 text-red-600 dark:text-red-400">
                          <XCircle className="h-3 w-3" />
                          {isTh ? 'ขาดตรงนี้' : 'Failed Here'}
                        </span>
                      ) : isPassed ? (
                        <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />
                          Ping OK
                        </span>
                      ) : (
                        <span className="text-slate-400 group-hover:text-blue-500">
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
          <div className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50/80 dark:bg-red-950/35 p-3 text-xs flex items-start gap-2.5">
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
          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
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
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 break-inside-avoid">
        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2.5 flex items-center gap-1.5">
          <Wrench className="h-3.5 w-3.5 text-blue-600" />
          {isTh
            ? 'คู่มือดูสีไฟ LED หน้าเครื่องจริง (เช็กหน้างานใน 5 วินาที)'
            : 'Quick Hardware LED Visual Guide (5-Second Field Check)'}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
          <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/25 border border-emerald-200/70 dark:border-emerald-900/50">
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

          <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-amber-50/60 dark:bg-amber-950/25 border border-amber-200/70 dark:border-amber-900/50">
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

          <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-red-50/60 dark:bg-red-950/25 border border-red-200/70 dark:border-red-900/50">
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

          <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
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

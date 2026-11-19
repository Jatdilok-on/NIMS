'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Camera,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Cpu,
  HardDrive,
  Network,
  Pencil,
  Plus,
  Radio,
  RotateCcw,
  Server,
  TrainFront,
  Trash2,
  Wifi,
  Wrench,
  X,
} from 'lucide-react';
import { ConfirmActionModal } from '@/components/common/ConfirmActionModal';
import { apiFetch, ApiError, copyTextSafe } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { Device, Site } from '@/lib/types';

type RunbookIconType =
  | 'CRANE'
  | 'AMR'
  | 'SHUTTLE'
  | 'PLC'
  | 'AP'
  | 'CLIENT'
  | 'SWITCH'
  | 'SERVER'
  | 'CAMERA'
  | 'OTHER';

type PingStageResult = 'UNCHECKED' | 'OK' | 'FAIL';

interface PingRule {
  condition: string;
  meaning: string;
}

interface RunbookGuide {
  id: string;
  codeBadge: string;
  iconType: RunbookIconType;
  thTitle: string;
  enTitle: string;
  thPath: string;
  enPath: string;
  thPhysical: string[];
  enPhysical: string[];
  thNetworkMatrix: PingRule[];
  enNetworkMatrix: PingRule[];
  thSelfFix: string[];
  enSelfFix: string[];
  thEscalate: string[];
  enEscalate: string[];
  updatedBy?: string | null;
  updatedAt?: string | null;
}

const ICON_OPTIONS: Array<{ type: RunbookIconType; label: string }> = [
  { type: 'CRANE', label: 'Crane' },
  { type: 'AMR', label: 'AMR / AGV' },
  { type: 'SHUTTLE', label: 'Shuttle' },
  { type: 'PLC', label: 'PLC' },
  { type: 'AP', label: 'AP / Wi-Fi' },
  { type: 'CLIENT', label: 'Client / Bridge' },
  { type: 'SWITCH', label: 'Switch' },
  { type: 'SERVER', label: 'Server' },
  { type: 'CAMERA', label: 'Camera' },
  { type: 'OTHER', label: 'Tool / Other' },
];

const PHYSICAL_ITEMS = [
  { key: 'power', th: 'ไฟเลี้ยง Power / RUN ติดปกติ (ไม่ดับ)', en: 'Power / RUN LED is ON normally' },
  { key: 'estop', th: 'ไม่ติด E-Stop / Safety Bumper / Error หน้าตู้', en: 'No E-Stop / Safety Lock / Cabinet Error' },
  { key: 'lan', th: 'ไฟพอร์ตสาย LAN (Link/ACT) ติดหรือกระพริบ', en: 'LAN Port Link/ACT LED is ON/Blinking' },
  { key: 'rf', th: 'เสา Wi-Fi แน่น / หน้าจาน Bridge ไม่ถูกบังแนวคลื่น', en: 'Wi-Fi antenna tight / Bridge LoS unobstructed' },
];

function renderGuideIcon(iconType: RunbookIconType, className = 'h-4 w-4') {
  switch (iconType) {
    case 'CRANE':
      return <HardDrive className={className} />;
    case 'AMR':
      return <Bot className={className} />;
    case 'SHUTTLE':
      return <TrainFront className={className} />;
    case 'PLC':
      return <Cpu className={className} />;
    case 'AP':
      return <Wifi className={className} />;
    case 'CLIENT':
      return <Radio className={className} />;
    case 'SWITCH':
      return <Network className={className} />;
    case 'SERVER':
      return <Server className={className} />;
    case 'CAMERA':
      return <Camera className={className} />;
    default:
      return <Wrench className={className} />;
  }
}

function linesToArray(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function TroubleshootingRunbook() {
  const { user } = useAuth();
  const { lang, t } = useI18n();
  const isTh = lang === 'th';

  const canEdit =
    user?.roleCode === 'SUPER_ADMIN' ||
    user?.roleCode === 'SITE_ADMIN' ||
    user?.roleCode === 'NETWORK_ENGINEER';
  const canResetDefaults =
    user?.roleCode === 'SUPER_ADMIN' || user?.roleCode === 'SITE_ADMIN';

  const [viewMode, setViewMode] = useState<'GUIDE' | 'TICKET'>('GUIDE');
  const [guides, setGuides] = useState<RunbookGuide[]>([]);
  const [selectedGuideId, setSelectedGuideId] = useState<string>('SRM');
  const [loadingGuides, setLoadingGuides] = useState(true);

  // Modal state for Easy Add / Edit
  const [editingGuide, setEditingGuide] = useState<RunbookGuide | 'NEW' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RunbookGuide | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Escalation Ticket Builder state
  const [sites, setSites] = useState<Site[]>([]);
  const [siteDevices, setSiteDevices] = useState<Device[]>([]);
  const [siteId, setSiteId] = useState('');
  const [deviceType, setDeviceType] = useState<string>('SRM');
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [customUnit, setCustomUnit] = useState('');
  const [scope, setScope] = useState<'SINGLE' | 'ZONE' | 'FACTORY'>('SINGLE');
  const [physChecks, setPhysChecks] = useState<Record<string, boolean>>({
    power: false,
    estop: false,
    lan: false,
    rf: false,
  });
  const [pingStages, setPingStages] = useState<{
    s1: { status: PingStageResult; ms: string };
    s2: { status: PingStageResult; ms: string };
    s3: { status: PingStageResult; ms: string };
    s4: { status: PingStageResult; ms: string };
  }>({
    s1: { status: 'UNCHECKED', ms: '' },
    s2: { status: 'UNCHECKED', ms: '' },
    s3: { status: 'UNCHECKED', ms: '' },
    s4: { status: 'UNCHECKED', ms: '' },
  });
  const [notes, setNotes] = useState('');
  const [copied, setCopied] = useState(false);

  const loadGuides = useCallback(async () => {
    try {
      const res = await apiFetch<{ guides: RunbookGuide[] }>('/runbook');
      const list = res.guides || [];
      setGuides(list);
      if (list.length > 0) {
        setSelectedGuideId((prev) =>
          list.some((g) => g.id === prev) ? prev : list[0].id,
        );
        setDeviceType((prev) =>
          list.some((g) => g.id === prev) ? prev : list[0].id,
        );
      }
    } catch {
      // ignore
    } finally {
      setLoadingGuides(false);
    }
  }, []);

  useEffect(() => {
    loadGuides();
    apiFetch<{ sites: Site[] }>('/sites')
      .then((res) => setSites(res.sites || []))
      .catch(() => {});
  }, [loadGuides]);

  useEffect(() => {
    if (!siteId) {
      setSiteDevices([]);
      return;
    }
    apiFetch<{ devices: Device[] }>(`/devices?siteId=${encodeURIComponent(siteId)}`)
      .then((res) => setSiteDevices(res.devices || []))
      .catch(() => setSiteDevices([]));
  }, [siteId]);

  const activeGuide = useMemo(
    () => guides.find((g) => g.id === selectedGuideId) || guides[0] || null,
    [guides, selectedGuideId],
  );

  const selectedSite = useMemo(() => sites.find((s) => s.id === siteId) || null, [sites, siteId]);
  const selectedDevice = useMemo(
    () => siteDevices.find((d) => d.id === selectedDeviceId) || null,
    [siteDevices, selectedDeviceId],
  );

  const autoDiagnosis = useMemo(() => {
    const { s1, s2, s3, s4 } = pingStages;
    if (s1.status === 'FAIL') {
      return isTh
        ? '🔴 ตัดวงระดับ Core/Gateway/PLC Main: เช็กไฟ Rack, Core/Access Switch และสายหลักก่อน'
        : '🔴 Core / Gateway / PLC Main unreachable: check main rack power, switches, and uplink first.';
    }
    if (s1.status === 'OK' && s2.status === 'FAIL') {
      return isTh
        ? '🟠 ด่าน Access Point / Bridge AP ไม่ตอบ: ส่งต่อทีม Network เช็กพอร์ต Switch PoE / สาย UTP หรือ AP ตัวนั้น'
        : '🟠 Access Point / Bridge AP unreachable: escalate to Network Team to check Switch PoE port / UTP cable.';
    }
    if (s2.status === 'OK' && s3.status === 'FAIL') {
      return isTh
        ? '🟡 ลิงก์ไร้สายถึง AP Client / Bridge CL ขาด: เช็กไฟบนรถ/เครน, เสา Wi-Fi, มุมจาน Bridge หรือจุดอับสัญญาณโซนนั้น'
        : '🟡 Wireless link to Client/Bridge broken: verify onboard power, antenna, LoS, or zone RF coverage.';
    }
    if (s3.status === 'OK' && s4.status === 'FAIL') {
      return isTh
        ? '🔵 Wi-Fi/Bridge มาถึงรถแล้ว แต่ End Device (PLC/Barcode) ไม่ตอบ: เช็กสาย LAN บนตัวรถ/เครน และไฟเลี้ยงตัวอุปกรณ์'
        : '🔵 Wireless link OK, End Device down: check short LAN patch cable and power on the crane/shuttle.';
    }
    if (s1.status === 'OK' && s2.status === 'OK' && s3.status === 'OK' && s4.status === 'OK') {
      return isTh
        ? '🟢 Ping ครบ 4 ด่านปกติ: Network ไม่ขาด — ให้ตรวจ E-Stop, Safety, PLC Program หรือระบบ WCS/WMS แทน'
        : '🟢 All 4 Ping stages pass: Network path is healthy — check E-Stop, safety interlocks, PLC or WCS/WMS.';
    }
    return isTh
      ? 'ℹ️ กรุณาเลือกผล Ping อย่างน้อยด่านที่ตรวจสอบ เพื่อช่วยระบุจุดที่น่าจะเสียให้อัตโนมัติ'
      : 'ℹ️ Mark the Ping stages you tested to receive an automatic layer-by-layer isolation hint.';
  }, [pingStages, isTh]);

  const formattedSummary = useMemo(() => {
    const siteLabel = selectedSite ? `${selectedSite.siteCode} (${selectedSite.siteName})` : '-';
    const guideObj = guides.find((g) => g.id === deviceType);
    const typeLabel = guideObj ? (isTh ? guideObj.thTitle : guideObj.enTitle) : deviceType;
    const unitLabel = selectedDevice
      ? `${selectedDevice.name} [${selectedDevice.managementIp || 'No IP'}]`
      : customUnit.trim() || '-';
    const scopeLabel =
      scope === 'SINGLE'
        ? t('runbook.scopeSingle')
        : scope === 'ZONE'
          ? t('runbook.scopeZone')
          : t('runbook.scopeFactory');

    const fmtPing = (label: string, p: { status: PingStageResult; ms: string }) => {
      const icon = p.status === 'OK' ? '✅ OK' : p.status === 'FAIL' ? '❌ Timeout' : '⬜ N/A';
      const msPart = p.status === 'OK' && p.ms.trim() ? ` (${p.ms.trim()}ms)` : '';
      return `- ${label}: ${icon}${msPart}`;
    };

    const checkedPhys = PHYSICAL_ITEMS.map(
      (item) => `${physChecks[item.key] ? '✅' : '⬜'} ${isTh ? item.th : item.en}`,
    ).join('\n');

    return [
      `[NIMS IT Service → Network Escalation]`,
      `Site: ${siteLabel}`,
      `System/Type: ${typeLabel}`,
      `Unit / IP: ${unitLabel}`,
      `Scope: ${scopeLabel}`,
      ``,
      `Physical Inspection:`,
      checkedPhys,
      ``,
      `4-Stage Ping Triage:`,
      fmtPing('1. Gateway / PLC Main', pingStages.s1),
      fmtPing('2. Access Point / Bridge AP', pingStages.s2),
      fmtPing('3. AP Client (RUTX10) / Bridge CL', pingStages.s3),
      fmtPing('4. End Device (PLC / AMR / Barcode)', pingStages.s4),
      ``,
      `Assessment: ${autoDiagnosis}`,
      ...(notes.trim() ? [`Notes: ${notes.trim()}`] : []),
    ].join('\n');
  }, [
    selectedSite,
    guides,
    deviceType,
    selectedDevice,
    customUnit,
    scope,
    t,
    physChecks,
    isTh,
    pingStages,
    autoDiagnosis,
    notes,
  ]);

  const handleCopySummary = async () => {
    try {
      await copyTextSafe(formattedSummary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // ignore clipboard errors
    }
  };

  const resetBuilder = () => {
    setSelectedDeviceId('');
    setCustomUnit('');
    setScope('SINGLE');
    setPhysChecks({ power: false, estop: false, lan: false, rf: false });
    setPingStages({
      s1: { status: 'UNCHECKED', ms: '' },
      s2: { status: 'UNCHECKED', ms: '' },
      s3: { status: 'UNCHECKED', ms: '' },
      s4: { status: 'UNCHECKED', ms: '' },
    });
    setNotes('');
  };

  const confirmDeleteGuide = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setActionError(null);
    try {
      const res = await apiFetch<{ guides: RunbookGuide[] }>(
        `/runbook/${encodeURIComponent(deleteTarget.id)}`,
        { method: 'DELETE' },
      );
      setGuides(res.guides || []);
      if (res.guides?.length > 0) {
        setSelectedGuideId(res.guides[0].id);
      }
      setDeleteTarget(null);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to delete guide');
    } finally {
      setDeleting(false);
    }
  };

  const confirmResetDefaults = async () => {
    setResetting(true);
    setActionError(null);
    try {
      const res = await apiFetch<{ guides: RunbookGuide[] }>('/runbook/reset-defaults', {
        method: 'POST',
      });
      setGuides(res.guides || []);
      if (res.guides?.length > 0) {
        setSelectedGuideId(res.guides[0].id);
      }
      setShowResetConfirm(false);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to reset defaults');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
            <ClipboardCheck className="h-6 w-6 text-blue-600" />
            {t('runbook.title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-3xl">{t('runbook.subtitle')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canEdit && viewMode === 'GUIDE' && (
            <button
              type="button"
              onClick={() => setEditingGuide('NEW')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              {t('runbook.addGuide')}
            </button>
          )}
          {canResetDefaults && viewMode === 'GUIDE' && (
            <button
              type="button"
              onClick={() => {
                setActionError(null);
                setShowResetConfirm(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t('runbook.resetDefaults')}
            </button>
          )}
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setViewMode('GUIDE')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md cursor-pointer transition ${
                viewMode === 'GUIDE'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Wrench className="h-3.5 w-3.5" />
              {t('runbook.tabGuide')}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('TICKET')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md cursor-pointer transition ${
                viewMode === 'TICKET'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Network className="h-3.5 w-3.5" />
              {t('runbook.tabTicket')}
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'GUIDE' ? (
        <>
          {/* Step 0: Scope Triage */}
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            <h2 className="text-sm font-bold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              {t('runbook.step0Title')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-lg border border-blue-200 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/30">
                <div className="font-bold text-blue-700 dark:text-blue-300 mb-1">
                  1. {t('runbook.scopeSingle')}
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  {isTh
                    ? 'เช่น AMR 1 คัน หรือ SRM 01 ตัวเดียว → มักเกิดจากไฟเครื่อง/แบต/E-Stop, สาย LAN เส้นสั้นบนตัวเครื่อง, หรือ AP Client ตัวนั้นหลุด'
                    : 'e.g. 1 AMR or 1 SRM crane → usually isolated to unit power/E-Stop, onboard patch cable, or that specific AP Client.'}
                </p>
              </div>
              <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/30">
                <div className="font-bold text-amber-700 dark:text-amber-300 mb-1">
                  2. {t('runbook.scopeZone')}
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  {isTh
                    ? 'เช่น AMR หยุดพร้อมกันหลายคัน หรือ Shuttle หยุดทั้งโซน → มักเกิดจาก Access Point โซนนั้นดับ, Access Switch, หรือ PLC Main'
                    : 'e.g. multiple AMRs or entire Shuttle aisle offline → check zone Access Point (PoE), zone Access Switch, or PLC Main.'}
                </p>
              </div>
              <div className="p-3 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/30">
                <div className="font-bold text-red-700 dark:text-red-300 mb-1">
                  3. {t('runbook.scopeFactory')}
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  {isTh
                    ? 'ทุกโซนหยุดพร้อมกัน → รีบตรวจ Core Switch, Gateway (เช่น .80.1 / .81.1 / .88.1) และ Server WMS / WCS ก่อน'
                    : 'All zones down together → inspect Core Switch, VLAN Gateways, and WMS / WCS host server first.'}
                </p>
              </div>
            </div>
          </div>

          {/* Step 1: 4-Stage Sequential Ping */}
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            <div>
              <h2 className="text-sm font-bold flex items-center gap-2">
                <Server className="h-4 w-4 text-cyan-600" />
                {t('runbook.step1Title')}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">{t('runbook.step1Hint')}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
              {[
                {
                  step: '1',
                  title: 'Gateway / PLC Main',
                  sub: isTh ? 'เช็ก Core / Switch หลักและเส้นสายตู้ควบคุม' : 'Verify core switch & wired main PLC',
                  color: 'border-slate-300 dark:border-slate-700',
                },
                {
                  step: '2',
                  title: 'Access Point / Bridge AP',
                  sub: isTh ? 'เช็กไฟ PoE และตัวกระจายสัญญาณฝั่งผนัง' : 'Verify PoE & fixed AP/Bridge side',
                  color: 'border-cyan-300 dark:border-cyan-800',
                },
                {
                  step: '3',
                  title: 'AP Client / Bridge CL',
                  sub: isTh ? 'เช็กลิงก์ Wi-Fi ถึงตัวรับบนเครน / รถ Shuttle' : 'Verify wireless reach to moving vehicle',
                  color: 'border-amber-300 dark:border-amber-800',
                },
                {
                  step: '4',
                  title: 'End Device (PLC / AMR / Barcode)',
                  sub: isTh ? 'เช็กสายบนตัวรถ/เครน และไฟเลี้ยงปลายทาง' : 'Verify onboard LAN & device health',
                  color: 'border-emerald-300 dark:border-emerald-800',
                },
              ].map((s, idx) => (
                <div
                  key={s.step}
                  className={`relative rounded-lg border ${s.color} p-3 bg-slate-50/60 dark:bg-slate-800/40`}
                >
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-blue-600 text-white text-[11px] font-bold">
                      {s.step}
                    </span>
                    {idx < 3 && <ArrowRight className="hidden lg:block h-4 w-4 text-slate-400" />}
                  </div>
                  <div className="font-bold mt-2">{s.title}</div>
                  <div className="text-slate-500 dark:text-slate-400 mt-0.5">{s.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Step 2: Per-Device Check Selector & Card */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold flex items-center gap-2">
              <Wrench className="h-4 w-4 text-blue-600" />
              {t('runbook.step2Title')}
            </h2>

            <div className="flex flex-wrap gap-2">
              {guides.map((item) => {
                const active = activeGuide?.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedGuideId(item.id)}
                    className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                      active
                        ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {renderGuideIcon(item.iconType)}
                    <span>{isTh ? item.thTitle : item.enTitle}</span>
                  </button>
                );
              })}
            </div>

            {loadingGuides ? (
              <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center text-xs text-slate-400">
                Loading runbook guides...
              </div>
            ) : activeGuide ? (
              <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-mono text-[11px] font-bold">
                        {activeGuide.codeBadge}
                      </span>
                      {activeGuide.updatedBy && (
                        <span className="text-[11px] text-slate-400">
                          {t('runbook.updatedBy')}: {activeGuide.updatedBy}
                          {activeGuide.updatedAt
                            ? ` • ${new Date(activeGuide.updatedAt).toLocaleString()}`
                            : ''}
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg font-bold mt-1">
                      {isTh ? activeGuide.thTitle : activeGuide.enTitle}
                    </h3>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">
                      Path: {isTh ? activeGuide.thPath : activeGuide.enPath}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {canEdit && (
                      <>
                        <button
                          type="button"
                          onClick={() => setEditingGuide(activeGuide)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer"
                        >
                          <Pencil className="h-3.5 w-3.5 text-blue-600" />
                          {t('runbook.editGuide')}
                        </button>
                        {guides.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              setActionError(null);
                              setDeleteTarget(activeGuide);
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {t('runbook.deleteGuide')}
                          </button>
                        )}
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setDeviceType(activeGuide.id);
                        setViewMode('TICKET');
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                    >
                      <Network className="h-3.5 w-3.5" />
                      {t('runbook.tabTicket')}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      {t('runbook.physicalLabel')}
                    </h4>
                    <ul className="space-y-2 text-xs">
                      {(isTh ? activeGuide.thPhysical : activeGuide.enPhysical).map((line, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800"
                        >
                          <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                          <span className="leading-relaxed">{line}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      {t('runbook.networkLabel')}
                    </h4>
                    <div className="space-y-2 text-xs">
                      {(isTh ? activeGuide.thNetworkMatrix : activeGuide.enNetworkMatrix).map(
                        (row, i) => (
                          <div
                            key={i}
                            className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-800/30"
                          >
                            <div className="font-bold text-slate-800 dark:text-slate-100">
                              {row.condition}
                            </div>
                            <div className="text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                              → {row.meaning}
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
                  <div className="rounded-lg p-3.5 bg-emerald-50/60 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-900/60 text-xs space-y-1.5">
                    <div className="font-bold text-emerald-700 dark:text-emerald-300">
                      🛠️ {t('runbook.actionSelf')}
                    </div>
                    {(isTh ? activeGuide.thSelfFix : activeGuide.enSelfFix).map((item, idx) => (
                      <div key={idx} className="text-slate-700 dark:text-slate-200">
                        • {item}
                      </div>
                    ))}
                  </div>

                  <div className="rounded-lg p-3.5 bg-amber-50/60 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-900/60 text-xs space-y-1.5">
                    <div className="font-bold text-amber-700 dark:text-amber-300">
                      📩 {t('runbook.actionEscalate')}
                    </div>
                    {(isTh ? activeGuide.thEscalate : activeGuide.enEscalate).map((item, idx) => (
                      <div key={idx} className="text-slate-700 dark:text-slate-200">
                        • {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </>
      ) : (
        /* Interactive 4-Stage Escalation Ticket Builder */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold">{t('runbook.step3Title')}</h2>
              <button
                type="button"
                onClick={resetBuilder}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t('runbook.resetForm')}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-slate-600 dark:text-slate-300">
                  {t('runbook.siteSelect')}
                </label>
                <select
                  value={siteId}
                  onChange={(e) => {
                    setSiteId(e.target.value);
                    setSelectedDeviceId('');
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value="">-- {t('runbook.siteSelect')} --</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.siteCode} — {s.siteName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-600 dark:text-slate-300">
                  {t('runbook.deviceTypeLabel')}
                </label>
                <select
                  value={deviceType}
                  onChange={(e) => setDeviceType(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  {guides.map((g) => (
                    <option key={g.id} value={g.id}>
                      {isTh ? g.thTitle : g.enTitle}
                    </option>
                  ))}
                </select>
              </div>

              {siteDevices.length > 0 && (
                <div>
                  <label className="block font-semibold mb-1 text-slate-600 dark:text-slate-300">
                    {t('runbook.deviceSelect')}
                  </label>
                  <select
                    value={selectedDeviceId}
                    onChange={(e) => setSelectedDeviceId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  >
                    <option value="">-- {t('runbook.deviceSelect')} --</option>
                    {siteDevices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.managementIp || 'No IP'}) [{d.status}]
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className={siteDevices.length > 0 ? '' : 'sm:col-span-2'}>
                <label className="block font-semibold mb-1 text-slate-600 dark:text-slate-300">
                  {t('runbook.customUnit')}
                </label>
                <input
                  value={customUnit}
                  onChange={(e) => setCustomUnit(e.target.value)}
                  placeholder="e.g. SRM-02 / AMR #24 / 192.168.88.42"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                />
              </div>
            </div>

            <div className="text-xs">
              <div className="font-semibold mb-1.5 text-slate-600 dark:text-slate-300">
                {t('runbook.scopeLabel')}
              </div>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['SINGLE', t('runbook.scopeSingle')],
                    ['ZONE', t('runbook.scopeZone')],
                    ['FACTORY', t('runbook.scopeFactory')],
                  ] as const
                ).map(([val, lbl]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setScope(val)}
                    className={`px-3 py-1.5 rounded-lg border font-semibold cursor-pointer ${
                      scope === val
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-xs space-y-2">
              <div className="font-semibold text-slate-600 dark:text-slate-300">
                {t('runbook.physChecks')}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PHYSICAL_ITEMS.map((item) => (
                  <label
                    key={item.key}
                    className="flex items-start gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={Boolean(physChecks[item.key])}
                      onChange={(e) =>
                        setPhysChecks((prev) => ({ ...prev, [item.key]: e.target.checked }))
                      }
                    />
                    <span>{isTh ? item.th : item.en}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="text-xs space-y-2">
              <div className="font-semibold text-slate-600 dark:text-slate-300">
                {t('runbook.ping4Title')}
              </div>
              {(
                [
                  ['s1', '1. Gateway / PLC Main'],
                  ['s2', '2. Access Point / Bridge AP'],
                  ['s3', '3. AP Client (RUTX10) / Bridge CL'],
                  ['s4', '4. End Device (PLC / AMR / Barcode)'],
                ] as const
              ).map(([stageKey, stageLabel]) => {
                const st = pingStages[stageKey];
                return (
                  <div
                    key={stageKey}
                    className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700"
                  >
                    <span className="font-medium">{stageLabel}</span>
                    <div className="flex items-center gap-1.5">
                      {(['OK', 'FAIL', 'UNCHECKED'] as const).map((statusVal) => (
                        <button
                          key={statusVal}
                          type="button"
                          onClick={() =>
                            setPingStages((prev) => ({
                              ...prev,
                              [stageKey]: { ...prev[stageKey], status: statusVal },
                            }))
                          }
                          className={`px-2 py-1 rounded text-[11px] font-bold border cursor-pointer ${
                            st.status === statusVal
                              ? statusVal === 'OK'
                                ? 'bg-emerald-600 border-emerald-600 text-white'
                                : statusVal === 'FAIL'
                                  ? 'bg-red-600 border-red-600 text-white'
                                  : 'bg-slate-600 border-slate-600 text-white'
                              : 'border-slate-200 dark:border-slate-700 text-slate-500'
                          }`}
                        >
                          {statusVal === 'OK'
                            ? 'Reply OK'
                            : statusVal === 'FAIL'
                              ? 'Timeout'
                              : 'N/A'}
                        </button>
                      ))}
                      {st.status === 'OK' && (
                        <input
                          value={st.ms}
                          onChange={(e) =>
                            setPingStages((prev) => ({
                              ...prev,
                              [stageKey]: { ...prev[stageKey], ms: e.target.value },
                            }))
                          }
                          placeholder="ms"
                          className="w-14 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-transparent text-[11px] font-mono text-center"
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-xs">
              <label className="block font-semibold mb-1 text-slate-600 dark:text-slate-300">
                {t('runbook.notesLabel')}
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={
                  isTh
                    ? 'เช่น รถหยุดที่ซอย B3 เสา 14 เวลา 14:10 น. ไฟตัว AP กระพริบสีส้ม'
                    : 'e.g. Stopped at Aisle B3 Pillar 14 at 14:10, AP LED blinking amber'
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
          </div>

          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-2">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {t('runbook.diagnosisLabel')}
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs font-medium leading-relaxed">
                {autoDiagnosis}
              </div>
            </div>

            <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  Escalation Ticket Preview
                </span>
                <button
                  type="button"
                  onClick={handleCopySummary}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? t('runbook.copiedSummary') : t('runbook.copySummary')}
                </button>
              </div>
              <pre className="p-3 rounded-lg bg-slate-950 text-slate-100 text-[11px] font-mono whitespace-pre-wrap overflow-x-auto leading-relaxed">
                {formattedSummary}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Easy Add / Edit Guide Modal */}
      {editingGuide && (
        <RunbookEditorModal
          initialGuide={editingGuide === 'NEW' ? null : editingGuide}
          onClose={() => setEditingGuide(null)}
          onSaved={(nextGuides, focusId) => {
            setGuides(nextGuides);
            if (focusId) setSelectedGuideId(focusId);
            setEditingGuide(null);
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <ConfirmActionModal
          title={t('runbook.deleteConfirmTitle')}
          itemName={isTh ? deleteTarget.thTitle : deleteTarget.enTitle}
          badgeText={deleteTarget.codeBadge}
          message={t('runbook.deleteConfirmDesc')}
          confirmLabel={t('runbook.deleteGuide')}
          variant="danger"
          loading={deleting}
          error={actionError}
          onCancel={() => {
            if (!deleting) {
              setDeleteTarget(null);
              setActionError(null);
            }
          }}
          onConfirm={confirmDeleteGuide}
        />
      )}

      {/* Reset Defaults Confirmation Modal */}
      {showResetConfirm && (
        <ConfirmActionModal
          title={t('runbook.resetConfirmTitle')}
          message={t('runbook.resetConfirmDesc')}
          confirmLabel={t('runbook.resetDefaults')}
          variant="danger"
          loading={resetting}
          error={actionError}
          onCancel={() => {
            if (!resetting) {
              setShowResetConfirm(false);
              setActionError(null);
            }
          }}
          onConfirm={confirmResetDefaults}
        />
      )}
    </div>
  );
}

function RunbookEditorModal({
  initialGuide,
  onClose,
  onSaved,
}: {
  initialGuide: RunbookGuide | null;
  onClose: () => void;
  onSaved: (guides: RunbookGuide[], focusId?: string) => void;
}) {
  const { t } = useI18n();
  const isNew = !initialGuide;

  const [thTitle, setThTitle] = useState(initialGuide?.thTitle || '');
  const [codeBadge, setCodeBadge] = useState(initialGuide?.codeBadge || '');
  const [iconType, setIconType] = useState<RunbookIconType>(initialGuide?.iconType || 'OTHER');
  const [thPath, setThPath] = useState(initialGuide?.thPath || '');
  const [thPhysicalText, setThPhysicalText] = useState(
    (initialGuide?.thPhysical || []).join('\n'),
  );
  const [pingRules, setPingRules] = useState<PingRule[]>(
    initialGuide?.thNetworkMatrix?.length
      ? initialGuide.thNetworkMatrix.map((r) => ({ ...r }))
      : [{ condition: '', meaning: '' }],
  );
  const [thSelfFixText, setThSelfFixText] = useState(
    (initialGuide?.thSelfFix || []).join('\n'),
  );
  const [thEscalateText, setThEscalateText] = useState(
    (initialGuide?.thEscalate || []).join('\n'),
  );

  // Optional English override
  const [showEnglishOverride, setShowEnglishOverride] = useState(false);
  const [enTitle, setEnTitle] = useState(
    initialGuide && initialGuide.enTitle !== initialGuide.thTitle ? initialGuide.enTitle : '',
  );
  const [enPath, setEnPath] = useState(
    initialGuide && initialGuide.enPath !== initialGuide.thPath ? initialGuide.enPath : '',
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!thTitle.trim() || !codeBadge.trim()) {
      setError('กรุณากรอกชื่อหัวข้อและป้ายย่อ (Title & Badge)');
      return;
    }

    setSaving(true);
    setError('');

    const cleanMatrix = pingRules
      .map((r) => ({ condition: r.condition.trim(), meaning: r.meaning.trim() }))
      .filter((r) => r.condition && r.meaning);

    const payload = {
      codeBadge: codeBadge.trim(),
      iconType,
      thTitle: thTitle.trim(),
      enTitle: enTitle.trim(),
      thPath: thPath.trim(),
      enPath: enPath.trim(),
      thPhysical: linesToArray(thPhysicalText),
      enPhysical: [],
      thNetworkMatrix: cleanMatrix,
      enNetworkMatrix: [],
      thSelfFix: linesToArray(thSelfFixText),
      enSelfFix: [],
      thEscalate: linesToArray(thEscalateText),
      enEscalate: [],
    };

    try {
      if (isNew) {
        const res = await apiFetch<{ guide: RunbookGuide; guides: RunbookGuide[] }>('/runbook', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        onSaved(res.guides, res.guide.id);
      } else {
        const res = await apiFetch<{ guide: RunbookGuide; guides: RunbookGuide[] }>(
          `/runbook/${encodeURIComponent(initialGuide.id)}`,
          {
            method: 'PUT',
            body: JSON.stringify(payload),
          },
        );
        onSaved(res.guides, res.guide.id);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save runbook guide');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Wrench className="h-5 w-5 text-blue-600" />
            {isNew ? t('runbook.modalAddTitle') : t('runbook.modalEditTitle')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1">{t('runbook.fieldTitle')}</label>
              <input
                required
                value={thTitle}
                onChange={(e) => setThTitle(e.target.value)}
                placeholder="เช่น กล้องวงจรปิดคลังสินค้า (IP Cam)"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">{t('runbook.fieldBadge')}</label>
              <input
                required
                value={codeBadge}
                onChange={(e) => setCodeBadge(e.target.value)}
                placeholder="เช่น CCTV • Camera"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold mb-1.5">{t('runbook.fieldIcon')}</label>
            <div className="flex flex-wrap gap-1.5">
              {ICON_OPTIONS.map((opt) => (
                <button
                  key={opt.type}
                  type="button"
                  onClick={() => setIconType(opt.type)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border font-medium cursor-pointer ${
                    iconType === opt.type
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {renderGuideIcon(opt.type, 'h-3.5 w-3.5')}
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block font-semibold mb-1">{t('runbook.fieldPath')}</label>
            <input
              value={thPath}
              onChange={(e) => setThPath(e.target.value)}
              placeholder="เช่น Core Switch → Access Switch (PoE) → กล้อง CCTV"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent font-mono"
            />
          </div>

          <div>
            <label className="block font-semibold mb-1">{t('runbook.fieldPhysical')}</label>
            <textarea
              rows={3}
              value={thPhysicalText}
              onChange={(e) => setThPhysicalText(e.target.value)}
              placeholder={'ตรวจสอบไฟสถานะ IR / Power ที่ตัวกล้อง\nตรวจสอบหัวสาย LAN PoE และสายไม่ขาด/หลวม'}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent leading-relaxed"
            />
          </div>

          {/* Easy Ping Matrix Row Builder */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-semibold">{t('runbook.fieldPingMatrix')}</label>
              <button
                type="button"
                onClick={() =>
                  setPingRules((prev) => [...prev, { condition: '', meaning: '' }])
                }
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold cursor-pointer hover:bg-blue-100"
              >
                <Plus className="h-3.5 w-3.5" />
                {t('runbook.addPingRule')}
              </button>
            </div>
            <div className="space-y-2">
              {pingRules.map((rule, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-start p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30"
                >
                  <input
                    value={rule.condition}
                    onChange={(e) =>
                      setPingRules((prev) =>
                        prev.map((r, i) => (i === idx ? { ...r, condition: e.target.value } : r)),
                      )
                    }
                    placeholder={t('runbook.pingCondPlaceholder')}
                    className="sm:col-span-5 px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                  <input
                    value={rule.meaning}
                    onChange={(e) =>
                      setPingRules((prev) =>
                        prev.map((r, i) => (i === idx ? { ...r, meaning: e.target.value } : r)),
                      )
                    }
                    placeholder={t('runbook.pingMeanPlaceholder')}
                    className="sm:col-span-6 px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setPingRules((prev) =>
                        prev.length > 1 ? prev.filter((_, i) => i !== idx) : [{ condition: '', meaning: '' }],
                      )
                    }
                    className="sm:col-span-1 p-1.5 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center justify-center cursor-pointer"
                    title="Remove rule"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1">{t('runbook.fieldSelfFix')}</label>
              <textarea
                rows={3}
                value={thSelfFixText}
                onChange={(e) => setThSelfFixText(e.target.value)}
                placeholder={'ขยับ/เปลี่ยนสาย LAN ฝั่งหน้างาน\nตรวจปลั๊กไฟและรีบูตอุปกรณ์ 1 ครั้ง'}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent leading-relaxed"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">{t('runbook.fieldEscalate')}</label>
              <textarea
                rows={3}
                value={thEscalateText}
                onChange={(e) => setThEscalateText(e.target.value)}
                placeholder={'ไฟพอร์ต Switch PoE ดับหรือ Ping ไม่เจอหลังเปลี่ยนสาย\nIP ชนหรืออุปกรณ์หลุดเป็นช่วงทุกวัน'}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent leading-relaxed"
              />
            </div>
          </div>

          {/* Optional English override collapse */}
          <div className="border-t border-slate-100 dark:border-slate-800 pt-2">
            <button
              type="button"
              onClick={() => setShowEnglishOverride((v) => !v)}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              {showEnglishOverride ? '▾ ' : '▸ '}
              {t('runbook.optionalEn')}
            </button>
            {showEnglishOverride && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                <input
                  value={enTitle}
                  onChange={(e) => setEnTitle(e.target.value)}
                  placeholder="English Title (optional)"
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                />
                <input
                  value={enPath}
                  onChange={(e) => setEnPath(e.target.value)}
                  placeholder="English Connection Path (optional)"
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent font-mono"
                />
              </div>
            )}
          </div>

          {error && (
            <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold cursor-pointer"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50 cursor-pointer"
            >
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Film,
  Pause,
  Play,
  Wrench,
} from 'lucide-react';

type CaseScenarioId = 'NORMAL' | 'CASE_1' | 'CASE_2';

interface ScenarioMeta {
  id: CaseScenarioId;
  labelTh: string;
  labelEn: string;
  summaryTh: string;
  summaryEn: string;
  actionTh: string;
  actionEn: string;
  severity: 'ok' | 'warn' | 'fail';
}

interface EquipmentCaseConfig {
  titleTh: string;
  titleEn: string;
  scenarios: ScenarioMeta[];
}

const CASE_CONFIGS: Record<string, EquipmentCaseConfig> = {
  SRM: {
    titleTh: 'จำลองเคสหน้างาน: เครน SRM & Wireless Bridge',
    titleEn: 'Field Case Simulation: SRM Crane & Wireless Bridge',
    scenarios: [
      {
        id: 'NORMAL',
        labelTh: '1. ปกติ (วิ่งรับ-ส่ง)',
        labelEn: '1. Normal Operation',
        summaryTh: 'เครนวิ่งตามราง, Bridge AP ↔ Bridge CL เชื่อมต่อสีเขียว, PLC RUN ปกติ',
        summaryEn: 'Crane moving, Bridge AP ↔ Bridge CL green, PLC RUN solid.',
        actionTh: 'ไม่ต้องแก้ไข — ระบบทำงานปกติ',
        actionEn: 'No action needed — normal operation.',
        severity: 'ok',
      },
      {
        id: 'CASE_1',
        labelTh: '2. Bridge หลุด / บังคลื่น',
        labelEn: '2. Bridge Link Drop',
        summaryTh: 'AP ฝั่งผนังปกติ แต่หน้าจาน Bridge CL บนเครนเอียง/ถูกบังคลื่น หรือไฟ 24VDC ดับ',
        summaryEn: 'Fixed AP OK, but crane Bridge CL misaligned/blocked or lost 24VDC.',
        actionTh: 'เช็กไฟ 24VDC ที่ตัว Bridge CL, เช็กสายอากาศไม่ให้หลวม และดูแนวหน้าจานให้ตรงกับ AP',
        actionEn: 'Check 24VDC power on Bridge CL, antenna tightness, and line-of-sight.',
        severity: 'fail',
      },
      {
        id: 'CASE_2',
        labelTh: '3. PLC บนเครน Error / E-Stop',
        labelEn: '3. PLC Error / E-Stop',
        summaryTh: 'Wi-Fi Bridge เชื่อมต่อปกติ (Ping CL เจอ) แต่เครนหยุดและไฟ SF/ERR สีแดงติดที่ตู้ PLC',
        summaryEn: 'Bridge OK (Ping CL OK), but crane halted with red SF/ERR LED on PLC.',
        actionTh: 'ตรวจปุ่ม E-Stop / ประตู Safety รอบราง จดรหัส Error หน้าตู้ PLC และเช็กสาย LAN เส้นสั้นเข้า PLC',
        actionEn: 'Check E-Stop / safety doors, note PLC fault code, and reseat short PLC LAN cable.',
        severity: 'warn',
      },
    ],
  },
  AMR: {
    titleTh: 'จำลองเคสหน้างาน: รถ AMR & Wi-Fi Roaming',
    titleEn: 'Field Case Simulation: AMR & Wi-Fi Roaming',
    scenarios: [
      {
        id: 'NORMAL',
        labelTh: '1. ปกติ (Roaming ลื่น)',
        labelEn: '1. Normal Roaming',
        summaryTh: 'AMR วิ่งสแกน LiDAR และสลับเกาะ AP-01 → AP-02 อัตโนมัติไม่สะดุด',
        summaryEn: 'AMR navigating with LiDAR and roaming smoothly AP-01 → AP-02.',
        actionTh: 'ไม่ต้องแก้ไข — Wi-Fi Roaming ปกติ',
        actionEn: 'No action needed — roaming healthy.',
        severity: 'ok',
      },
      {
        id: 'CASE_1',
        labelTh: '2. AP โซนดับ / จุดอับคลื่น',
        labelEn: '2. Zone AP Down / Dead Spot',
        summaryTh: 'AP-02 โซนกลางดับ (ไม่มี PoE) ทำให้ AMR หยุดกลางทางและขึ้นเตือนหลุดเครือข่าย',
        summaryEn: 'Zone AP-02 offline (no PoE), causing AMR to stop in mid-aisle.',
        actionTh: 'เช็กถ้าหยุดหลายคันในโซนเดียวกัน ให้แจ้งทีม Network เช็กพอร์ต PoE ของ AP-02 ทันที',
        actionEn: 'If multiple AMRs stop in the same zone, escalate AP-02 PoE switch port check.',
        severity: 'fail',
      },
      {
        id: 'CASE_2',
        labelTh: '3. ติด Bumper / E-Stop',
        labelEn: '3. Bumper / E-Stop Triggered',
        summaryTh: 'สัญญาณ Wi-Fi ปกติ แต่มีสิ่งกีดขวางหน้า LiDAR หรือกันชน Safety ทำงาน',
        summaryEn: 'Wi-Fi healthy, but obstacle in LiDAR zone or safety bumper triggered.',
        actionTh: 'เคลียร์สิ่งกีดขวางหน้ารถ ตรวจปุ่ม E-Stop และกดปุ่ม Reset บนตัวรถ AMR',
        actionEn: 'Clear obstacle, release E-Stop, and press Reset on the AMR unit.',
        severity: 'warn',
      },
    ],
  },
  SHU: {
    titleTh: 'จำลองเคสหน้างาน: รถ Shuttle (SHU) ในซอย Rack',
    titleEn: 'Field Case Simulation: Deep-Lane Pallet Shuttle (SHU)',
    scenarios: [
      {
        id: 'NORMAL',
        labelTh: '1. ปกติ (วิ่งในซอย Rack)',
        labelEn: '1. Normal Shuttle Run',
        summaryTh: 'Shuttle วิ่งรับ-ส่งพาเลทในซอยลึก เชื่อมต่อ Wi-Fi กับ AP หัวซอยปกติ',
        summaryEn: 'Shuttle operating in deep rack lane with steady AP link.',
        actionTh: 'ไม่ต้องแก้ไข — ระบบปกติ',
        actionEn: 'No action needed.',
        severity: 'ok',
      },
      {
        id: 'CASE_1',
        labelTh: '2. สัญญาณขาดกลางซอย Rack',
        labelEn: '2. Deep-Lane RF Drop',
        summaryTh: 'โครงเหล็ก/พาเลทบังคลื่นเมื่อรถวิ่งเข้าซอยลึก ทำให้สัญญาณหลุดกลางซอย',
        summaryEn: 'Rack steel/pallets attenuate RF deep inside lane, dropping connection.',
        actionTh: 'เช็กเสาอากาศบนตัว Shuttle และตรวจ AP หัวซอยว่าไม่ถูกบังหรือหลุดจาก Switch',
        actionEn: 'Inspect Shuttle antenna and aisle-head AP line-of-sight / uplink.',
        severity: 'fail',
      },
      {
        id: 'CASE_2',
        labelTh: '3. แบตเตอรี่อ่อน / เซนเซอร์ค้าง',
        labelEn: '3. Low Battery / Sensor Hold',
        summaryTh: 'รถหยุดนิ่งกลางซอยและไฟแบตเตอรี่กระพริบส้ม/แดง',
        summaryEn: 'Shuttle stopped mid-lane with amber/red battery alert.',
        actionTh: 'นำรถออกมาชาร์จแบตเตอรี่และเช็กเซนเซอร์ตรวจจับพาเลทที่หัวรถ',
        actionEn: 'Dock Shuttle for battery charge and inspect pallet sensors.',
        severity: 'warn',
      },
    ],
  },
  RGV: {
    titleTh: 'จำลองเคสหน้างาน: รถ RGV & AP Client บนราง',
    titleEn: 'Field Case Simulation: Rail Guided Vehicle (RGV)',
    scenarios: [
      {
        id: 'NORMAL',
        labelTh: '1. ปกติ (วิ่งบนรางคู่)',
        labelEn: '1. Normal Rail Transfer',
        summaryTh: 'RGV วิ่งรับส่งบนราง โมดูล hAP ax2 / Phoenix / RUTX10 เชื่อมต่อ AP ปกติ',
        summaryEn: 'RGV moving along rail with healthy onboard AP Client link.',
        actionTh: 'ไม่ต้องแก้ไข — ระบบปกติ',
        actionEn: 'No action needed.',
        severity: 'ok',
      },
      {
        id: 'CASE_1',
        labelTh: '2. AP Client บนรถดับ / สายหลวม',
        labelEn: '2. Onboard Client Power/LAN Drop',
        summaryTh: 'AP ฝั่งผนังปกติ แต่ไฟเลี้ยง 24VDC เข้าตัว hAP ax2 / RUTX10 ดับ หรือสายเข้า PLC หลวม',
        summaryEn: 'Fixed AP OK, but onboard 24VDC power off or short LAN patch loose.',
        actionTh: 'ดูไฟ Power/WLAN บนตัว Client และขยับปลั๊ก LAN ที่ต่อไปยังตู้ PLC บนรถ RGV',
        actionEn: 'Check Client Power/WLAN LEDs and reseat LAN cable to RGV PLC.',
        severity: 'fail',
      },
      {
        id: 'CASE_2',
        labelTh: '3. สะดุดช่วงรอยต่อ AP',
        labelEn: '3. AP Handoff Delay',
        summaryTh: 'รถชะงักช่วงเปลี่ยนโซนระหว่าง AP-01 กับ AP-02 (ไฟ WLAN กระพริบส้ม)',
        summaryEn: 'Brief pause during AP-01 → AP-02 handoff (amber WLAN blink).',
        actionTh: 'บันทึกตำแหน่งระยะรางที่รถชอบหลุด แล้วแจ้งทีม Network ปรับกำลังส่ง/ช่องสัญญาณ Roaming',
        actionEn: 'Note exact rail position and escalate to Network team for roaming tuning.',
        severity: 'warn',
      },
    ],
  },
  PLC_MAIN: {
    titleTh: 'จำลองเคสหน้างาน: ตู้ควบคุม PLC Main & Core Switch',
    titleEn: 'Field Case Simulation: PLC Main Cabinet & Core Switch',
    scenarios: [
      {
        id: 'NORMAL',
        labelTh: '1. ปกติ (RUN + Link เขียว)',
        labelEn: '1. Normal (RUN + Link Green)',
        summaryTh: 'เบรกเกอร์ ON, PLC ไฟ POWER/RUN เขียว, พอร์ต Switch กระพริบส่งข้อมูลปกติ',
        summaryEn: 'Breaker ON, PLC POWER/RUN green, Switch port Link/ACT blinking.',
        actionTh: 'ไม่ต้องแก้ไข — ระบบปกติ',
        actionEn: 'No action needed.',
        severity: 'ok',
      },
      {
        id: 'CASE_1',
        labelTh: '2. สาย LAN / พอร์ต Switch ดับ',
        labelEn: '2. LAN Port / Patch Cord Down',
        summaryTh: 'PLC ยังมีไฟ RUN แต่ไฟพอร์ต LAN (Link/ACT) ดับมืด Ping PLC Main ไม่เจอ',
        summaryEn: 'PLC powered on, but LAN Link/ACT LED dark — PLC Main unreachable.',
        actionTh: 'ขยับหรือลองเปลี่ยนสาย LAN ระหว่าง Core Switch ↔ PLC Main แล้วเช็กไฟ Link ติดไหม',
        actionEn: 'Reseat or swap Cat6 patch cord between Switch and PLC Main.',
        severity: 'fail',
      },
      {
        id: 'CASE_2',
        labelTh: '3. PLC ขึ้นไฟแดง SF / ERR',
        labelEn: '3. PLC Red SF / ERR Fault',
        summaryTh: 'Ping PLC Main เจอ แต่หน้าตู้ PLC ขึ้นไฟแดง SF/ERR ค้าง หยุดสั่งงานทั้งโซน',
        summaryEn: 'Ping OK, but PLC CPU displays solid red SF/ERR fault.',
        actionTh: 'เช็กไฟจ่าย 24VDC ในตู้, ตรวจ E-Stop หลัก และจด Error Code ก่อนติดต่อทีม Automation/PLC',
        actionEn: 'Check 24VDC PSU, main E-Stop, and record fault code for Automation team.',
        severity: 'warn',
      },
    ],
  },
  ACCESS_POINT: {
    titleTh: 'จำลองเคสหน้างาน: ตัวกระจายสัญญาณ Access Point (AP)',
    titleEn: 'Field Case Simulation: Industrial Access Point (AP)',
    scenarios: [
      {
        id: 'NORMAL',
        labelTh: '1. ปกติ (PoE + คลื่น RF ปกติ)',
        labelEn: '1. Normal (PoE + RF Active)',
        summaryTh: 'Switch จ่ายไฟ PoE ปกติ ตัว AP ไฟเขียว กระจายคลื่นให้ลูกข่ายครบ',
        summaryEn: 'Switch PoE active, AP LED green, broadcasting RF cells normally.',
        actionTh: 'ไม่ต้องแก้ไข — ระบบปกติ',
        actionEn: 'No action needed.',
        severity: 'ok',
      },
      {
        id: 'CASE_1',
        labelTh: '2. AP ไฟดับมืด (ไม่มีไฟ PoE)',
        labelEn: '2. AP Dark (No PoE Power)',
        summaryTh: 'ไฟบนตัว AP ดับสนิทเพราะสาย UTP หลวมหรือพอร์ต PoE บน Switch ตัดไฟ',
        summaryEn: 'AP completely dark due to loose UTP or disabled Switch PoE port.',
        actionTh: 'เช็กสาย UTP ที่หัว AP/Switch และแจ้งทีม Network รีเซ็ตพอร์ต PoE บน Switch',
        actionEn: 'Check UTP cable and ask Network team to bounce the PoE switch port.',
        severity: 'fail',
      },
      {
        id: 'CASE_2',
        labelTh: '3. AP กระพริบส้ม (บูต/หลุด WLC)',
        labelEn: '3. AP Amber Blink (Lost WLC)',
        summaryTh: 'AP มีไฟเลี้ยงเข้า แต่ไฟสถานะกระพริบส้มตลอด ไม่สามารถเชื่อม WLC ได้',
        summaryEn: 'AP powered, but amber LED blinking — unable to reach WLC.',
        actionTh: 'ตรวจสาย Uplink จาก Switch ไป Core/WLC และแจ้งทีม Network ตรวจสอบ VLAN/Controller',
        actionEn: 'Check Switch uplink and escalate WLC/VLAN reachability to Network team.',
        severity: 'warn',
      },
    ],
  },
  AP_CLIENT: {
    titleTh: 'จำลองเคสหน้างาน: AP Client / Wireless Bridge',
    titleEn: 'Field Case Simulation: AP Client / Wireless Bridge',
    scenarios: [
      {
        id: 'NORMAL',
        labelTh: '1. ปกติ (Wireless + LAN ครบ)',
        labelEn: '1. Normal (Wireless + LAN OK)',
        summaryTh: 'AP ↔ AP Client เชื่อมต่อสีเขียว และส่งข้อมูลผ่านสาย LAN สั้นเข้า PLC ปกติ',
        summaryEn: 'AP ↔ AP Client link green, forwarding traffic over short LAN to PLC.',
        actionTh: 'ไม่ต้องแก้ไข — ระบบปกติ',
        actionEn: 'No action needed.',
        severity: 'ok',
      },
      {
        id: 'CASE_1',
        labelTh: '2. Client หลุดจาก AP / ไฟ 24V ดับ',
        labelEn: '2. Client Offline / 24VDC Lost',
        summaryTh: 'Ping AP เจอ แต่ Ping AP Client ไม่เจอ — ไฟ 24VDC ดับหรือเสา Wi-Fi หลวม',
        summaryEn: 'AP reachable, Client unreachable — 24VDC lost or loose Wi-Fi antenna.',
        actionTh: 'เช็กไฟเลี้ยง 24VDC เข้าตัว Client และขันขั้วเสาอากาศ Wi-Fi ให้แน่น',
        actionEn: 'Verify 24VDC power input and tighten Wi-Fi antenna connectors.',
        severity: 'fail',
      },
      {
        id: 'CASE_2',
        labelTh: '3. Client เจอ แต่ PLC ปลายทางหลุด',
        labelEn: '3. Client OK, End PLC Unreachable',
        summaryTh: 'ลิงก์ Wi-Fi ถึงตัว Client เขียวปกติ แต่สาย LAN เส้นสั้นเข้า PLC หลุด/เสีย',
        summaryEn: 'Wi-Fi link to Client OK, but short LAN patch to PLC is disconnected.',
        actionTh: 'เปลี่ยนสาย LAN เส้นสั้นระหว่าง AP Client ↔ PLC และดูไฟพอร์ต ETH ติดไหม',
        actionEn: 'Swap short LAN patch cord between AP Client and PLC and check ETH LED.',
        severity: 'warn',
      },
    ],
  },
};

function getNormalizedEquipmentKey(guideId: string, iconType: string): string {
  const upper = (guideId || '').toUpperCase();
  if (upper in CASE_CONFIGS) return upper;
  if (upper.includes('SRM') || iconType === 'CRANE') return 'SRM';
  if (upper.includes('AMR') || upper.includes('AGV') || iconType === 'AMR') return 'AMR';
  if (upper.includes('SHU') || upper.includes('SHUTTLE') || iconType === 'SHUTTLE') return 'SHU';
  if (upper.includes('RGV')) return 'RGV';
  if (upper.includes('PLC') || iconType === 'PLC') return 'PLC_MAIN';
  if (upper.includes('CLIENT') || iconType === 'CLIENT') return 'AP_CLIENT';
  if (upper.includes('AP') || iconType === 'AP') return 'ACCESS_POINT';
  return 'PLC_MAIN';
}

function EquipmentCaseSvg({
  eqKey,
  scenario,
  playing,
}: {
  eqKey: string;
  scenario: CaseScenarioId;
  playing: boolean;
}) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setTick((t) => (t + 1) % 120);
    }, 60);
    return () => window.clearInterval(timer);
  }, [playing]);

  const phase = tick / 120; // 0..1 smooth cycle
  const wave = (Math.sin(phase * Math.PI * 2) + 1) * 0.5; // 0..1

  const isOk = scenario === 'NORMAL';
  const isCase1 = scenario === 'CASE_1';
  const isCase2 = scenario === 'CASE_2';

  // Common animated packet x/y helper
  const packetT = playing ? (tick % 40) / 40 : 0.5;

  if (eqKey === 'SRM') {
    const craneX = isOk ? 210 + wave * 200 : 285;
    const forkY = isOk ? 135 - wave * 48 : 120;
    const rfBroken = isCase1;
    const plcErr = isCase2;

    return (
      <svg viewBox="0 0 680 210" className="w-full h-44 sm:h-52 select-none">
        {/* Background Rack Bay */}
        <rect x="16" y="16" width="648" height="178" rx="14" fill="#f8fafc" className="dark:fill-slate-950/70" stroke="#cbd5e1" strokeOpacity="0.6" />
        {/* Overhead Ceiling AP-Wall */}
        <rect x="74" y="28" width="92" height="28" rx="8" fill="#0f172a" />
        <circle cx="88" cy="42" r="4" fill="#10b981" />
        <text x="128" y="45" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#e2e8f0" className="font-mono">
          Bridge AP
        </text>

        {/* High-Bay Racks */}
        {[68, 104, 140].map((ry) => (
          <g key={ry}>
            <rect x="180" y={ry + 18} width="320" height="3.5" rx="1.5" fill="#94a3b8" fillOpacity="0.45" />
            {[195, 255, 315, 375, 435].map((rx) => (
              <rect key={rx} x={rx} y={ry} width="42" height="16" rx="3" fill="#3b82f6" fillOpacity="0.16" stroke="#3b82f6" strokeOpacity="0.35" />
            ))}
          </g>
        ))}

        {/* Floor Rail */}
        <rect x="175" y="172" width="335" height="6" rx="3" fill="#334155" />

        {/* Moving SRM Crane */}
        <g transform={`translate(${craneX}, 0)`}>
          <rect x="-8" y="48" width="16" height="122" rx="3" fill="#f59e0b" />
          {/* Bridge CL on top of crane */}
          <rect x="-24" y="34" width="48" height="18" rx="5" fill="#0f172a" stroke={rfBroken ? '#ef4444' : '#10b981'} strokeWidth="1.8" />
          <text x="0" y="46" textAnchor="middle" fontSize="8" fontWeight="800" fill="#ffffff" className="font-mono">
            Bridge CL
          </text>
          {/* Fork Carriage */}
          <rect x="-18" y={forkY} width="36" height="14" rx="3" fill="#1e293b" />
          <rect x="-12" y={forkY - 12} width="24" height="11" rx="2" fill="#fbbf24" />
          {/* Crane Base + PLC */}
          <rect x="-24" y="156" width="48" height="16" rx="4" fill="#0f172a" />
          <circle cx="14" cy="164" r="4" fill={plcErr ? '#ef4444' : '#10b981'} />
          <text x="-4" y="167" textAnchor="middle" fontSize="7.5" fontWeight="800" fill="#fde68a" className="font-mono">
            SRM
          </text>
        </g>

        {/* RF Link: Bridge AP <-> Bridge CL */}
        <line
          x1="166"
          y1="42"
          x2={craneX - 24}
          y2="42"
          stroke={rfBroken ? '#ef4444' : '#10b981'}
          strokeWidth="2.4"
          strokeDasharray="6 5"
          className={!rfBroken && playing ? 'nims-runbook-dash' : ''}
        />
        {!rfBroken && playing && (
          <circle
            cx={166 + (craneX - 24 - 166) * packetT}
            cy="42"
            r="4.2"
            fill="#10b981"
          />
        )}
        {rfBroken && (
          <g transform={`translate(${(166 + craneX - 24) / 2}, 42)`}>
            <circle r="10" fill="#ef4444" />
            <path d="M-4 -4 L4 4 M4 -4 L-4 4" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
          </g>
        )}

        {/* Right Side: PLC Status Callout */}
        <rect x="530" y="54" width="118" height="92" rx="10" fill="#0f172a" />
        <text x="589" y="74" textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#94a3b8" className="font-mono">
          PLC ON CRANE
        </text>
        <circle cx="552" cy="96" r="5" fill={rfBroken ? '#64748b' : '#10b981'} />
        <text x="564" y="99" fontSize="9" fill="#e2e8f0" className="font-mono">
          POWER / RUN
        </text>
        <circle cx="552" cy="120" r="5" fill={plcErr ? '#ef4444' : '#334155'} />
        <text x="564" y="123" fontSize="9" fill={plcErr ? '#fca5a5' : '#64748b'} className="font-mono">
          SF / ERR / E-STOP
        </text>
      </svg>
    );
  }

  if (eqKey === 'AMR') {
    const amrX = isOk ? 130 + wave * 360 : 320;
    const ap2Down = isCase1;
    const estop = isCase2;

    return (
      <svg viewBox="0 0 680 210" className="w-full h-44 sm:h-52 select-none">
        <rect x="16" y="16" width="648" height="178" rx="14" fill="#f8fafc" className="dark:fill-slate-950/70" stroke="#cbd5e1" strokeOpacity="0.6" />
        {/* Ceiling AP-01 & AP-02 */}
        <g transform="translate(160, 42)">
          <rect x="-42" y="-14" width="84" height="26" rx="8" fill="#0284c7" />
          <circle cx="-26" cy="-1" r="3.5" fill="#34d399" />
          <text x="6" y="3" textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#ffffff" className="font-mono">
            AP-01
          </text>
        </g>
        <g transform="translate(470, 42)">
          <rect x="-42" y="-14" width="84" height="26" rx="8" fill={ap2Down ? '#334155' : '#0284c7'} />
          <circle cx="-26" cy="-1" r="3.5" fill={ap2Down ? '#ef4444' : '#34d399'} />
          <text x="6" y="3" textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#ffffff" className="font-mono">
            AP-02 {ap2Down ? '(OFF)' : ''}
          </text>
        </g>

        {/* Floor Guide Path */}
        <rect x="75" y="148" width="530" height="8" rx="4" fill="#10b981" fillOpacity="0.2" />
        <line x1="80" y1="152" x2="600" y2="152" stroke="#10b981" strokeWidth="2" strokeDasharray="8 6" />

        {/* Dynamic RF Link from nearest AP */}
        {(() => {
          const targetApX = amrX < 315 ? 160 : 470;
          const broken = amrX >= 315 && ap2Down;
          return (
            <g>
              <line
                x1={targetApX}
                y1="56"
                x2={amrX}
                y2="126"
                stroke={broken ? '#ef4444' : '#10b981'}
                strokeWidth="2.2"
                strokeDasharray="5 5"
                className={!broken && playing ? 'nims-runbook-dash' : ''}
              />
              {!broken && playing && (
                <circle
                  cx={targetApX + (amrX - targetApX) * packetT}
                  cy={56 + (126 - 56) * packetT}
                  r="4"
                  fill="#10b981"
                />
              )}
              {broken && (
                <g transform={`translate(${(targetApX + amrX) / 2}, 90)`}>
                  <circle r="10" fill="#ef4444" />
                  <path d="M-4 -4 L4 4 M4 -4 L-4 4" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
                </g>
              )}
            </g>
          );
        })()}

        {/* Obstacle for Case 2 */}
        {estop && (
          <g transform="translate(410, 128)">
            <rect x="-14" y="-12" width="28" height="28" rx="4" fill="#f59e0b" fillOpacity="0.25" stroke="#f59e0b" strokeWidth="2" />
            <text x="0" y="5" textAnchor="middle" fontSize="9" fontWeight="800" fill="#b45309">
              BOX
            </text>
          </g>
        )}

        {/* AMR Robot */}
        <g transform={`translate(${amrX}, 136)`}>
          <path d="M 28 0 L 66 -16 A 40 40 0 0 1 66 16 Z" fill={estop ? '#ef4444' : '#10b981'} fillOpacity="0.22" />
          <rect x="-32" y="-16" width="64" height="32" rx="10" fill="#0f172a" stroke={ap2Down ? '#ef4444' : estop ? '#f59e0b' : '#10b981'} strokeWidth="2.2" />
          <text x="0" y="4" textAnchor="middle" fontSize="10" fontWeight="800" fill="#ffffff" className="font-mono">
            AMR
          </text>
          <circle cx="-20" cy="-8" r="3.5" fill={ap2Down ? '#ef4444' : '#10b981'} />
        </g>
      </svg>
    );
  }

  if (eqKey === 'SHU') {
    const shuX = isOk ? 180 + wave * 280 : 380;
    const rfDrop = isCase1;
    const battWarn = isCase2;

    return (
      <svg viewBox="0 0 680 210" className="w-full h-44 sm:h-52 select-none">
        <rect x="16" y="16" width="648" height="178" rx="14" fill="#f8fafc" className="dark:fill-slate-950/70" stroke="#cbd5e1" strokeOpacity="0.6" />
        {/* Aisle-Head AP */}
        <rect x="42" y="54" width="84" height="30" rx="8" fill="#0284c7" />
        <text x="84" y="73" textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#ffffff" className="font-mono">
          Aisle AP
        </text>

        {/* Deep-Lane Rack Channels */}
        {[82, 134].map((ry) => (
          <g key={ry}>
            <rect x="150" y={ry + 18} width="490" height="8" rx="3" fill="#334155" fillOpacity="0.22" />
            <rect x="166" y={ry - 2} width="42" height="18" rx="3" fill="#06b6d4" fillOpacity="0.2" stroke="#0891b2" strokeOpacity="0.4" />
            <rect x="578" y={ry - 2} width="42" height="18" rx="3" fill="#06b6d4" fillOpacity="0.2" stroke="#0891b2" strokeOpacity="0.4" />
          </g>
        ))}

        {/* RF Signal inside deep lane */}
        <line
          x1="126"
          y1="69"
          x2={shuX - 28}
          y2="138"
          stroke={rfDrop ? '#ef4444' : '#06b6d4'}
          strokeWidth="2.2"
          strokeDasharray="5 5"
          className={!rfDrop && playing ? 'nims-runbook-dash' : ''}
        />
        {!rfDrop && playing && (
          <circle
            cx={126 + (shuX - 28 - 126) * packetT}
            cy={69 + (138 - 69) * packetT}
            r="4"
            fill="#06b6d4"
          />
        )}
        {rfDrop && (
          <g transform={`translate(${(126 + shuX - 28) / 2}, 103)`}>
            <circle r="10" fill="#ef4444" />
            <path d="M-4 -4 L4 4 M4 -4 L-4 4" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
          </g>
        )}

        {/* Shuttle Unit */}
        <g transform={`translate(${shuX}, 144)`}>
          <rect x="-24" y="-22" width="48" height="16" rx="3" fill="#38bdf8" stroke="#0284c7" />
          <rect x="-32" y="-6" width="64" height="16" rx="5" fill="#0f172a" stroke={rfDrop ? '#ef4444' : battWarn ? '#f59e0b' : '#06b6d4'} strokeWidth="2" />
          <text x="0" y="5" textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#ffffff" className="font-mono">
            SHU-01
          </text>
          <circle cx="22" cy="1" r="3" fill={battWarn ? '#f59e0b' : '#10b981'} />
        </g>
      </svg>
    );
  }

  if (eqKey === 'RGV') {
    const rgvX = isOk ? 140 + wave * 360 : 340;
    const clientDown = isCase1;
    const handoffWarn = isCase2;

    return (
      <svg viewBox="0 0 680 210" className="w-full h-44 sm:h-52 select-none">
        <rect x="16" y="16" width="648" height="178" rx="14" fill="#f8fafc" className="dark:fill-slate-950/70" stroke="#cbd5e1" strokeOpacity="0.6" />
        {/* Wall AP */}
        <rect x="292" y="28" width="96" height="28" rx="8" fill="#0284c7" />
        <text x="340" y="46" textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#ffffff" className="font-mono">
          Zone AP
        </text>

        {/* Twin Steel Rails */}
        <rect x="64" y="142" width="552" height="5" rx="2" fill="#475569" />
        <rect x="64" y="164" width="552" height="5" rx="2" fill="#475569" />

        {/* RF Link AP <-> RGV Client */}
        <line
          x1="340"
          y1="56"
          x2={rgvX + 20}
          y2="112"
          stroke={clientDown ? '#ef4444' : handoffWarn ? '#f59e0b' : '#8b5cf6'}
          strokeWidth="2.3"
          strokeDasharray="6 5"
          className={!clientDown && playing ? 'nims-runbook-dash' : ''}
        />
        {!clientDown && playing && (
          <circle
            cx={340 + (rgvX + 20 - 340) * packetT}
            cy={56 + (112 - 56) * packetT}
            r="4"
            fill={handoffWarn ? '#f59e0b' : '#8b5cf6'}
          />
        )}
        {clientDown && (
          <g transform={`translate(${(340 + rgvX + 20) / 2}, 84)`}>
            <circle r="10" fill="#ef4444" />
            <path d="M-4 -4 L4 4 M4 -4 L-4 4" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
          </g>
        )}

        {/* RGV Rail Car */}
        <g transform={`translate(${rgvX}, 148)`}>
          <rect x="-46" y="-14" width="92" height="32" rx="8" fill="#6d28d9" stroke="#ffffff" strokeWidth="1.5" />
          <text x="-10" y="5" textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#ffffff" className="font-mono">
            RGV-01
          </text>
          {/* Onboard AP Client */}
          <rect x="10" y="-36" width="38" height="20" rx="5" fill="#0f172a" stroke={clientDown ? '#ef4444' : handoffWarn ? '#f59e0b' : '#10b981'} strokeWidth="1.6" />
          <text x="29" y="-23" textAnchor="middle" fontSize="7.5" fontWeight="800" fill="#e2e8f0" className="font-mono">
            Client
          </text>
        </g>
      </svg>
    );
  }

  if (eqKey === 'ACCESS_POINT') {
    const poeDown = isCase1;
    const wlcWarn = isCase2;

    return (
      <svg viewBox="0 0 680 210" className="w-full h-44 sm:h-52 select-none">
        <rect x="16" y="16" width="648" height="178" rx="14" fill="#f8fafc" className="dark:fill-slate-950/70" stroke="#cbd5e1" strokeOpacity="0.6" />
        {/* PoE Switch */}
        <rect x="46" y="68" width="136" height="74" rx="10" fill="#0f172a" />
        <text x="114" y="90" textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#7dd3fc" className="font-mono">
          PoE SWITCH
        </text>
        <rect x="64" y="106" width="100" height="20" rx="4" fill="#1e293b" />
        <circle cx="80" cy="116" r="4" fill={poeDown ? '#ef4444' : '#10b981'} />
        <text x="122" y="119" textAnchor="middle" fontSize="8" fill="#cbd5e1" className="font-mono">
          PoE Port {poeDown ? 'OFF' : 'ON'}
        </text>

        {/* UTP Cable */}
        <line
          x1="182"
          y1="105"
          x2="310"
          y2="105"
          stroke={poeDown ? '#ef4444' : '#3b82f6'}
          strokeWidth="3"
          strokeDasharray={poeDown ? '5 5' : undefined}
        />
        {!poeDown && playing && (
          <circle cx={182 + (310 - 182) * packetT} cy="105" r="4.5" fill="#38bdf8" />
        )}
        {poeDown && (
          <g transform="translate(246, 105)">
            <circle r="10" fill="#ef4444" />
            <path d="M-4 -4 L4 4 M4 -4 L-4 4" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
          </g>
        )}

        {/* Access Point Unit */}
        <rect x="310" y="74" width="104" height="62" rx="12" fill={poeDown ? '#334155' : '#0284c7'} stroke="#ffffff" strokeWidth="1.5" />
        <circle cx="332" cy="96" r="5" fill={poeDown ? '#1e293b' : wlcWarn ? '#f59e0b' : '#34d399'} />
        <text x="370" y="100" textAnchor="middle" fontSize="10" fontWeight="800" fill="#ffffff" className="font-mono">
          AP
        </text>
        <text x="362" y="120" textAnchor="middle" fontSize="8" fill="#e0f2fe" className="font-mono">
          {poeDown ? 'NO POWER' : wlcWarn ? 'NO WLC' : 'WIFI 6 OK'}
        </text>

        {/* RF Waves to Clients */}
        {!poeDown && !wlcWarn && (
          <g>
            <line x1="414" y1="92" x2="540" y2="68" stroke="#10b981" strokeWidth="2.2" strokeDasharray="5 5" className={playing ? 'nims-runbook-dash' : ''} />
            <line x1="414" y1="116" x2="540" y2="144" stroke="#10b981" strokeWidth="2.2" strokeDasharray="5 5" className={playing ? 'nims-runbook-dash' : ''} />
            {playing && (
              <>
                <circle cx={414 + 126 * packetT} cy={92 - 24 * packetT} r="3.8" fill="#10b981" />
                <circle cx={414 + 126 * packetT} cy={116 + 28 * packetT} r="3.8" fill="#10b981" />
              </>
            )}
          </g>
        )}
        <rect x="540" y="50" width="90" height="34" rx="8" fill="#0f172a" />
        <text x="585" y="71" textAnchor="middle" fontSize="9" fontWeight="700" fill={poeDown || wlcWarn ? '#fca5a5' : '#6ee7b7'} className="font-mono">
          Client 01
        </text>
        <rect x="540" y="126" width="90" height="34" rx="8" fill="#0f172a" />
        <text x="585" y="147" textAnchor="middle" fontSize="9" fontWeight="700" fill={poeDown || wlcWarn ? '#fca5a5' : '#6ee7b7'} className="font-mono">
          Client 02
        </text>
      </svg>
    );
  }

  if (eqKey === 'AP_CLIENT') {
    const rfBroken = isCase1;
    const lanBroken = isCase2;

    return (
      <svg viewBox="0 0 680 210" className="w-full h-44 sm:h-52 select-none">
        <rect x="16" y="16" width="648" height="178" rx="14" fill="#f8fafc" className="dark:fill-slate-950/70" stroke="#cbd5e1" strokeOpacity="0.6" />
        {/* Fixed AP */}
        <rect x="44" y="72" width="110" height="64" rx="12" fill="#0284c7" />
        <circle cx="64" cy="96" r="4.5" fill="#34d399" />
        <text x="106" y="100" textAnchor="middle" fontSize="10" fontWeight="800" fill="#ffffff" className="font-mono">
          Fixed AP
        </text>
        <text x="99" y="120" textAnchor="middle" fontSize="8" fill="#e0f2fe" className="font-mono">
          Ping OK
        </text>

        {/* RF Link */}
        <line
          x1="154"
          y1="104"
          x2="282"
          y2="104"
          stroke={rfBroken ? '#ef4444' : '#10b981'}
          strokeWidth="2.5"
          strokeDasharray="6 5"
          className={!rfBroken && playing ? 'nims-runbook-dash' : ''}
        />
        {!rfBroken && playing && <circle cx={154 + 128 * packetT} cy="104" r="4" fill="#10b981" />}
        {rfBroken && (
          <g transform="translate(218, 104)">
            <circle r="10" fill="#ef4444" />
            <path d="M-4 -4 L4 4 M4 -4 L-4 4" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
          </g>
        )}

        {/* AP Client */}
        <rect x="282" y="68" width="128" height="72" rx="12" fill="#0f172a" stroke={rfBroken ? '#ef4444' : '#10b981'} strokeWidth="2" />
        <text x="346" y="92" textAnchor="middle" fontSize="10" fontWeight="800" fill="#ffffff" className="font-mono">
          AP Client
        </text>
        <circle cx="306" cy="116" r="4" fill={rfBroken ? '#ef4444' : '#10b981'} />
        <text x="352" y="120" textAnchor="middle" fontSize="8" fill="#94a3b8" className="font-mono">
          {rfBroken ? '24VDC / RF OFF' : 'WLAN LINK OK'}
        </text>

        {/* Short LAN Cable to End PLC */}
        <line
          x1="410"
          y1="104"
          x2="520"
          y2="104"
          stroke={rfBroken ? '#94a3b8' : lanBroken ? '#ef4444' : '#3b82f6'}
          strokeWidth="3"
        />
        {!rfBroken && !lanBroken && playing && <circle cx={410 + 110 * packetT} cy="104" r="4" fill="#3b82f6" />}
        {lanBroken && (
          <g transform="translate(465, 104)">
            <circle r="10" fill="#ef4444" />
            <path d="M-4 -4 L4 4 M4 -4 L-4 4" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
          </g>
        )}

        {/* End PLC */}
        <rect x="520" y="72" width="114" height="64" rx="12" fill="#1e293b" stroke={lanBroken ? '#ef4444' : '#3b82f6'} strokeWidth="1.8" />
        <text x="577" y="100" textAnchor="middle" fontSize="10" fontWeight="800" fill="#ffffff" className="font-mono">
          End PLC
        </text>
        <text x="577" y="118" textAnchor="middle" fontSize="8" fill={lanBroken || rfBroken ? '#fca5a5' : '#6ee7b7'} className="font-mono">
          {lanBroken ? 'Check Patch Cord' : rfBroken ? 'No Upstream' : 'RUN OK'}
        </text>
      </svg>
    );
  }

  // Default / PLC_MAIN
  const lanDown = isCase1;
  const cpuFault = isCase2;

  return (
    <svg viewBox="0 0 680 210" className="w-full h-44 sm:h-52 select-none">
      <rect x="16" y="16" width="648" height="178" rx="14" fill="#f8fafc" className="dark:fill-slate-950/70" stroke="#cbd5e1" strokeOpacity="0.6" />
      {/* Core Switch */}
      <rect x="46" y="64" width="144" height="80" rx="12" fill="#0f172a" />
      <text x="118" y="88" textAnchor="middle" fontSize="10" fontWeight="800" fill="#7dd3fc" className="font-mono">
        CORE SWITCH
      </text>
      <rect x="64" y="104" width="108" height="24" rx="5" fill="#1e293b" />
      <circle cx="80" cy="116" r="4" fill={lanDown ? '#ef4444' : '#10b981'} />
      <text x="124" y="119" textAnchor="middle" fontSize="8" fill="#cbd5e1" className="font-mono">
        Link/ACT {lanDown ? 'DARK' : 'BLINK'}
      </text>

      {/* Patch Cord */}
      <line
        x1="190"
        y1="104"
        x2="360"
        y2="104"
        stroke={lanDown ? '#ef4444' : '#3b82f6'}
        strokeWidth="3.2"
        strokeDasharray={lanDown ? '5 5' : undefined}
      />
      {!lanDown && playing && <circle cx={190 + 170 * packetT} cy="104" r="4.5" fill="#3b82f6" />}
      {lanDown && (
        <g transform="translate(275, 104)">
          <circle r="10" fill="#ef4444" />
          <path d="M-4 -4 L4 4 M4 -4 L-4 4" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
        </g>
      )}

      {/* PLC Main Cabinet */}
      <rect x="360" y="42" width="272" height="126" rx="12" fill="#0f172a" stroke={cpuFault ? '#ef4444' : '#334155'} strokeWidth="2" />
      <text x="496" y="64" textAnchor="middle" fontSize="10" fontWeight="800" fill="#e2e8f0" className="font-mono">
        PLC MAIN CABINET
      </text>
      <g transform="translate(382, 82)">
        <circle cx="8" cy="8" r="5" fill="#10b981" />
        <text x="22" y="11.5" fontSize="9.5" fill="#e2e8f0" className="font-mono">
          POWER (24VDC)
        </text>
        <circle cx="8" cy="32" r="5" fill={cpuFault ? '#f59e0b' : '#10b981'} />
        <text x="22" y="35.5" fontSize="9.5" fill="#e2e8f0" className="font-mono">
          CPU RUN
        </text>
        <circle cx="8" cy="56" r="5" fill={cpuFault ? '#ef4444' : '#334155'} />
        <text x="22" y="59.5" fontSize="9.5" fill={cpuFault ? '#fca5a5' : '#64748b'} className="font-mono">
          SF / ERR FAULT
        </text>
      </g>
    </svg>
  );
}

export function RunbookCaseAnimation({
  guideId,
  iconType,
  isTh,
}: {
  guideId: string;
  iconType: string;
  isTh: boolean;
}) {
  const eqKey = getNormalizedEquipmentKey(guideId, iconType);
  const config = CASE_CONFIGS[eqKey] || CASE_CONFIGS.PLC_MAIN;
  const [scenario, setScenario] = useState<CaseScenarioId>('NORMAL');
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    setScenario('NORMAL');
  }, [guideId]);

  const activeScenario =
    config.scenarios.find((s) => s.id === scenario) || config.scenarios[0];

  return (
    <div className="rounded-2xl border border-slate-200/90 dark:border-slate-700/80 bg-white dark:bg-slate-900 p-4 space-y-3 break-inside-avoid">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-100">
          <span className="h-7 w-7 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Film className="h-4 w-4" />
          </span>
          <span>
            {isTh
              ? `รูปประกอบการแก้ไขเคส: ${config.titleTh}`
              : `Animated Case Illustration: ${config.titleEn}`}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="print:hidden inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:border-blue-400 transition cursor-pointer"
        >
          {playing ? <Pause className="h-3 w-3 text-blue-600" /> : <Play className="h-3 w-3 text-emerald-600" />}
          <span>{playing ? (isTh ? 'หยุดภาพ' : 'Pause') : isTh ? 'เล่นภาพ' : 'Play'}</span>
        </button>
      </div>

      {/* Case Scenario Tabs */}
      <div className="flex flex-wrap gap-1.5 print:hidden">
        {config.scenarios.map((sc) => {
          const active = scenario === sc.id;
          return (
            <button
              key={sc.id}
              type="button"
              onClick={() => setScenario(sc.id)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition cursor-pointer ${
                active
                  ? sc.severity === 'fail'
                    ? 'bg-red-600 border-red-600 text-white shadow-xs'
                    : sc.severity === 'warn'
                      ? 'bg-amber-500 border-amber-500 text-white shadow-xs'
                      : 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                  : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {isTh ? sc.labelTh : sc.labelEn}
            </button>
          );
        })}
      </div>

      {/* Animated SVG Canvas */}
      <EquipmentCaseSvg eqKey={eqKey} scenario={scenario} playing={playing} />

      {/* Action / Diagnostic Banner */}
      <div
        className={`rounded-xl border p-3 text-xs flex items-start gap-2.5 ${
          activeScenario.severity === 'fail'
            ? 'border-red-200 dark:border-red-900/60 bg-red-50/75 dark:bg-red-950/30'
            : activeScenario.severity === 'warn'
              ? 'border-amber-200 dark:border-amber-900/60 bg-amber-50/75 dark:bg-amber-950/30'
              : 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/25'
        }`}
      >
        {activeScenario.severity === 'ok' ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
        ) : activeScenario.severity === 'warn' ? (
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        ) : (
          <Wrench className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
        )}
        <div className="space-y-0.5">
          <div className="font-bold text-slate-800 dark:text-slate-100">
            {isTh ? activeScenario.summaryTh : activeScenario.summaryEn}
          </div>
          <div className="text-slate-600 dark:text-slate-300">
            <span className="font-semibold">{isTh ? 'วิธีแก้หน้างาน: ' : 'Action: '}</span>
            {isTh ? activeScenario.actionTh : activeScenario.actionEn}
          </div>
        </div>
      </div>
    </div>
  );
}

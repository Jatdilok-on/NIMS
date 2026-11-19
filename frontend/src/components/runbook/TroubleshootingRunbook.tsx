'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Cpu,
  HardDrive,
  Network,
  Radio,
  RotateCcw,
  Server,
  TrainFront,
  Wifi,
  Wrench,
} from 'lucide-react';
import { apiFetch, copyTextSafe } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Device, Site } from '@/lib/types';

type GuideDeviceKey = 'SRM' | 'AMR' | 'SHU' | 'PLC_MAIN' | 'ACCESS_POINT' | 'AP_CLIENT';
type PingStageResult = 'UNCHECKED' | 'OK' | 'FAIL';

interface LocalizedGuideEntry {
  key: GuideDeviceKey;
  codeBadge: string;
  thTitle: string;
  enTitle: string;
  thPath: string;
  enPath: string;
  thPhysical: string[];
  enPhysical: string[];
  thNetworkMatrix: Array<{ condition: string; meaning: string }>;
  enNetworkMatrix: Array<{ condition: string; meaning: string }>;
  thSelfFix: string[];
  enSelfFix: string[];
  thEscalate: string[];
  enEscalate: string[];
}

const GUIDE_DATA: LocalizedGuideEntry[] = [
  {
    key: 'SRM',
    codeBadge: 'SRM • Crane',
    thTitle: 'SRM (เครน Miniload)',
    enTitle: 'SRM (Miniload Crane)',
    thPath: 'PLC Main → Bridge AP (ฝั่งผนัง/เสา) → Bridge CL (ฝั่งเครน) → PLC บนเครน',
    enPath: 'PLC Main → Bridge AP (Fixed Side) → Bridge CL (Crane Side) → Onboard Crane PLC',
    thPhysical: [
      'ตรวจสอบเบรกเกอร์ / ตู้ไฟหลักของเครน และถามหน้างานว่าเพิ่งกด E-Stop หรือเปิดประตู Safety รอบรางหรือไม่',
      'ดูไฟตู้ PLC บนเครน: POWER / RUN ต้องติดเขียว (หากขึ้น SF/ERR สีแดง ให้จดรหัส Error)',
      'ดูไฟสัญญาณบนตัว Wireless Bridge CL ที่ติดอยู่บนเครน (Power, LAN Link, ระดับขีดสัญญาณ Signal)',
    ],
    enPhysical: [
      'Check crane main breaker / panel power and confirm if E-Stop or safety gate interlock was triggered.',
      'Check PLC LEDs on the crane: POWER / RUN should be green (note any red SF/ERR fault code).',
      'Verify Wireless Bridge CL LEDs on the crane: Power, LAN Link, and wireless signal bars.',
    ],
    thNetworkMatrix: [
      {
        condition: 'Ping PLC Main เจอ ✅ แต่ Bridge AP ไม่เจอ ❌',
        meaning: 'ปัญหาอยู่ระหว่าง Access Switch → สาย UTP/PoE → ตัว Bridge AP ฝั่งผนัง',
      },
      {
        condition: 'Ping Bridge AP เจอ ✅ แต่ Bridge CL ไม่เจอ ❌',
        meaning: 'คู่ Wireless Bridge หลุด: ไฟฝั่งเครนดับ, จาน Bridge เคลื่อนไม่ตรงแนว, หรือมีพาเลท/โครงเหล็กบังคลื่น',
      },
      {
        condition: 'Ping Bridge AP & CL เจอ ✅ แต่ PLC เครนไม่เจอ ❌',
        meaning: 'Wi-Fi Bridge เชื่อมปกติ! ปัญหาอยู่ที่สาย LAN เส้นสั้นบนเครน (จาก CL เข้า PLC) หรือตัว PLC บนเครนดับ/ค้าง',
      },
    ],
    enNetworkMatrix: [
      {
        condition: 'PLC Main OK ✅ but Bridge AP Timeout ❌',
        meaning: 'Issue between Access Switch, PoE/UTP cable, and the fixed Bridge AP unit.',
      },
      {
        condition: 'Bridge AP OK ✅ but Bridge CL Timeout ❌',
        meaning: 'Wireless bridge link down: crane panel off, dish misaligned, or physical line-of-sight obstruction.',
      },
      {
        condition: 'Bridge AP & CL OK ✅ but Crane PLC Timeout ❌',
        meaning: 'Bridge is healthy; check short patch cable from CL to PLC or crane PLC power/boot status.',
      },
    ],
    thSelfFix: [
      'ขยับ/เปลี่ยนสาย LAN เส้นสั้นระหว่าง Bridge CL กับ PLC บนตัวเครน (ถ้าไฟพอร์ตไม่ขึ้น)',
      'ตรวจเช็กไฟเลี้ยงและเบรกเกอร์/E-Stop ตู้เครนกับทีมหน้างาน',
    ],
    enSelfFix: [
      'Reseat or test the short LAN cable between Bridge CL and crane PLC if Link LED is dark.',
      'Verify crane cabinet breaker and E-Stop release with floor operators.',
    ],
    thEscalate: [
      'Ping Bridge AP ไม่ตอบหรือพอร์ต Switch PoE ดับ (ให้ทีม Network เช็ก Switch / สาย UTP / PoE)',
      'Bridge AP↔CL สัญญาณแกว่ง หลุดซ้ำทุกครั้งที่เครนวิ่งเข้าจุดเดิม',
    ],
    enEscalate: [
      'Bridge AP unreachable or switch PoE port down.',
      'Bridge AP↔CL flaps repeatedly when crane reaches a specific aisle position.',
    ],
  },
  {
    key: 'AMR',
    codeBadge: 'AMR • AGV',
    thTitle: 'AMR (รถขนส่งอัตโนมัติ)',
    enTitle: 'AMR (Autonomous Mobile Robot)',
    thPath: 'Switch → Access Point (โซน AMR) → การ์ด Wi-Fi บนรถ AMR',
    enPath: 'Switch → Access Point (AMR SSID) → Onboard AMR Wi-Fi Module',
    thPhysical: [
      'ดูหน้าจอ/ไฟสถานะบนรถ AMR: เช็กว่าติด Alarm, Bumper ชนสิ่งกีดขวาง, E-Stop ค้าง, หรือแบตเตอรี่ต่ำ (<15%) หรือไม่',
      'ดูว่ามีอาการค้างแค่ **คันเดียว** หรือหยุดพร้อมกัน **หลายคันในโซนเดียว**',
      'จดตำแหน่งจุดที่รถหยุด (เลขเสา / ซอย / หน้าจุดชาร์จ)',
    ],
    enPhysical: [
      'Check onboard AMR display/LEDs for Obstacle/Bumper fault, E-Stop lock, or critical low battery.',
      'Confirm whether only ONE AMR stopped or MULTIPLE AMRs stopped in the same aisle.',
      'Record the exact aisle / pillar location where the vehicle disconnected.',
    ],
    thNetworkMatrix: [
      {
        condition: 'ดับทั้งโซนหลายคันพร้อมกันในจุดเดียว ❌',
        meaning: 'Access Point จุดนั้นอาจ Offline หรือสาย PoE เข้า Switch หลุด (เปิด NIMS เช็กสถานะ AP โซนนั้นได้ทันที)',
      },
      {
        condition: 'รถวิ่งได้แต่ Ping สะดุด (Request timed out สลับ ms สูง) ⚠️',
        meaning: 'สัญญาณ Wi-Fi อ่อน / จุดอับสัญญาณ / การย้ายเกาะ AP (Roaming) ช้า',
      },
      {
        condition: 'Ping รถเจอปกติ ms ต่ำ ✅ แต่รถไม่ยอมเดิน',
        meaning: 'Network ปกติ — มักเป็นที่ Safety บนรถ, แผนที่/Task ในระบบ RCS/WCS ค้าง',
      },
    ],
    enNetworkMatrix: [
      {
        condition: 'Multiple AMRs drop in the same zone ❌',
        meaning: 'Local Access Point or Switch PoE uplink down (verify AP status in NIMS).',
      },
      {
        condition: 'Intermittent timeouts / high latency while moving ⚠️',
        meaning: 'Weak Wi-Fi coverage (dead spot) or slow AP roaming handoff.',
      },
      {
        condition: 'Low-latency Ping OK ✅ but AMR does not move',
        meaning: 'Network is healthy; check vehicle safety interlocks or WCS/RCS fleet dispatcher.',
      },
    ],
    thSelfFix: [
      'เคลียร์สิ่งกีดขวาง / ปลด E-Stop / รีสตาร์ตรถกรณีค้างคันเดียวและไฟ Alarm ขึ้นที่ตัวรถ',
      'เช็กใน NIMS → Site → Inventory / IPAM ว่า Access Point บริเวณนั้นยัง Online ครบทุกตัว',
    ],
    enSelfFix: [
      'Clear obstacles, release E-Stop, or reboot vehicle if isolated to a single AMR with onboard alarm.',
      'Verify in NIMS Inventory/IPAM that all zone Access Points remain ONLINE.',
    ],
    thEscalate: [
      'AP โซน AMR ขึ้น OFFLINE หรือรีบูตเองบ่อย',
      'AMR หลุด/สะดุดซ้ำที่ตำแหน่งเดิมทุกครั้ง (แจ้งทีม Network เช็ก RSSI / Channel / Roaming)',
    ],
    enEscalate: [
      'Zone Access Point is OFFLINE or rebooting.',
      'AMR drops repeatedly at the same aisle coordinate (Network team to tune RSSI / roaming / channel).',
    ],
  },
  {
    key: 'SHU',
    codeBadge: 'SHU • Shuttle',
    thTitle: 'SHU (รถ Shuttle ในชั้น Racking)',
    enTitle: 'SHU (4-Way Shuttle Car)',
    thPath: 'PLC Main → Sundray AP (SSID: SHU) → AP Client บนรถ (RUTX10) → PLC & Barcode บนรถ',
    enPath: 'PLC Main → Sundray AP (SHU SSID) → Onboard Client (RUTX10) → Onboard PLC & Barcode',
    thPhysical: [
      'ตรวจแบตเตอรี่รถและเบรกเกอร์เลี้ยงชุดควบคุม (RUTX10 + PLC + Barcode)',
      'ดูเสาอากาศ Wi-Fi บนตัวรถ Shuttle ว่าหลวม, หัก, หรือเอียงหลุดขั้วหรือไม่',
      'ดูไฟ LAN บน Teltonika / AP Client บนรถ ว่าติดครบ 2 เส้น (เส้นเข้า PLC รถ และเส้นเข้า Barcode Reader)',
    ],
    enPhysical: [
      'Check shuttle battery level and control breaker feeding AP Client, PLC, and Barcode Reader.',
      'Inspect onboard Wi-Fi antennas for loose SMA connectors or physical damage.',
      'Verify LAN Link LEDs on the onboard router/client for both PLC and Barcode Reader ports.',
    ],
    thNetworkMatrix: [
      {
        condition: 'Ping AP Client บนรถไม่เจอ ❌ (แต่ PLC Main & AP โซน SHU ปกติ ✅)',
        meaning: 'Wi-Fi บนรถหลุด / รถดับ / เสาหลวม / หรือรถเข้าไปในช่อง Racking ที่มีจุดอับสัญญาณ',
      },
      {
        condition: 'Ping AP Client บนรถเจอ ✅ แต่ PLC บนรถ หรือ Barcode ไม่เจอ ❌',
        meaning: 'Wi-Fi มาถึงตัวรถแล้ว! ปัญหาอยู่บนตัวรถเอง (เช็กสาย LAN เส้นสั้น หรือไฟเลี้ยงตัว PLC / Barcode)',
      },
      {
        condition: 'Ping เจอครบทุกตัว ✅ แต่ Barcode ไม่อ่าน/ไม่ส่งค่า',
        meaning: 'เช็กหน้าเลนส์สแกนเนอร์, Trigger จาก PLC รถ, หรือ WCS Port',
      },
    ],
    enNetworkMatrix: [
      {
        condition: 'Onboard AP Client Timeout ❌ (PLC Main & AP OK ✅)',
        meaning: 'Shuttle off, Wi-Fi antenna/client issue, or deep-aisle RF dead zone.',
      },
      {
        condition: 'Onboard AP Client OK ✅ but Onboard PLC or Barcode Timeout ❌',
        meaning: 'Wi-Fi reached the shuttle! Inspect onboard LAN cables or PLC/Barcode power.',
      },
      {
        condition: 'All onboard IPs Ping OK ✅ but Barcode fails to scan',
        meaning: 'Check scanner lens, PLC trigger, or WCS socket service.',
      },
    ],
    thSelfFix: [
      'ขันเสาอากาศบนรถให้แน่น, ตรวจเช็กสาย LAN ระหว่าง AP Client → PLC / Barcode บนตัวรถ',
      'รีบูตรถ 1 รอบเมื่อรถค้างคันเดียวและไฟไม่ตอบสนอง',
    ],
    enSelfFix: [
      'Tighten loose Wi-Fi antennas and check onboard LAN patch cables to PLC and Barcode.',
      'Power-cycle the single affected shuttle after confirming battery charge.',
    ],
    thEscalate: [
      'รถหลุดทุกคันในชั้น/ซอยเดียวกัน หรือ AP โซน SHU ขึ้น OFFLINE',
      'รถอยู่นิ่งใช้ได้แต่พอวิ่งเข้าซอยลึกแล้ว Ping RUTX10 ขาดประจำ (ส่ง Network ปรับจุดวาง AP)',
    ],
    enEscalate: [
      'All shuttles in an aisle drop simultaneously or SHU Access Point goes OFFLINE.',
      'Shuttles work near aisle entry but consistently drop inside deep racking lanes.',
    ],
  },
  {
    key: 'PLC_MAIN',
    codeBadge: 'PLC • Main',
    thTitle: 'PLC Main (ตู้ควบคุมหลักประจำโซน)',
    enTitle: 'PLC Main (Zone Master Controller)',
    thPath: 'Dell Server (WCS) → Core Switch → Access Switch → สาย UTP → PLC Main',
    enPath: 'Dell Server (WCS) → Core Switch → Access Switch → UTP Cable → PLC Main',
    thPhysical: [
      'ตรวจหน้าตู้คอนโทรล: ไฟ POWER และ RUN ต้องติดเขียวคงที่ (ห้ามมีไฟ ERR/SF/FAULT สีแดง)',
      'ก้มดูที่พอร์ต Ethernet ของ PLC: ไฟ Link (เขียว/ส้ม) ต้องติดและกระพริบตอนรับ-ส่งข้อมูล',
      'เช็กหัว RJ45 ที่ตัว PLC และปลายสายที่ Switch ว่าคลิปล็อกหลวมหรือไม่',
    ],
    enPhysical: [
      'Inspect control cabinet: POWER and RUN LEDs must be solid green without red ERR/SF fault LEDs.',
      'Check Ethernet port Link/ACT LED directly on the PLC module.',
      'Verify RJ45 latch integrity at both the PLC cabinet and Access Switch patch panel.',
    ],
    thNetworkMatrix: [
      {
        condition: 'ไฟพอร์ต Ethernet บน PLC ดับสนิท ❌',
        meaning: 'Layer 1 ขาด: สาย UTP ขาด/หัวหลวม, พอร์ต Switch ปิดอยู่, หรือการ์ด LAN PLC เสีย',
      },
      {
        condition: 'Ping Gateway ได้ ✅ แต่ Ping PLC Main ไม่เจอ ❌ (ไฟพอร์ตติด)',
        meaning: 'อาจติด VLAN พอร์ตผิด, IP/Subnet Mask ใน PLC โดนเปลี่ยน, หรือ Firewall/WCS วงอื่นบล็อก',
      },
      {
        condition: 'Ping PLC Main เจอ ✅ แต่สั่งงานโซนไม่ได้',
        meaning: 'เช็กสถานะ RUN/STOP Switch บนตัว PLC และสถานะเชื่อมต่อฝั่ง WCS Server',
      },
    ],
    enNetworkMatrix: [
      {
        condition: 'Ethernet Link LED on PLC is completely OFF ❌',
        meaning: 'Layer-1 break: bad UTP cable/RJ45, disabled switch port, or faulty PLC port.',
      },
      {
        condition: 'Gateway OK ✅, PLC Link LED ON, but Ping Timeout ❌',
        meaning: 'Check switch VLAN assignment, PLC IP/Subnet config, or routing between WCS & PLC VLAN.',
      },
      {
        condition: 'PLC Main Ping OK ✅ but zone automation stalled',
        meaning: 'Check PLC RUN/STOP mode and WCS communication service.',
      },
    ],
    thSelfFix: [
      'ลองขยับหัวสาย LAN ทั้ง 2 ฝั่ง (PLC และ Patch Panel) หรือเปลี่ยนสาย Patch Cord เส้นใหม่ฝั่งตู้',
      'เช็กว่าสายหลุดจากการทำความสะอาด/ซ่อมบำรุงหน้างานหรือไม่',
    ],
    enSelfFix: [
      'Reseat or swap the UTP patch cord inside the cabinet.',
      'Verify the PLC RUN switch wasn’t turned to STOP during maintenance.',
    ],
    thEscalate: [
      'เปลี่ยนสายแล้วยังไฟ Link ไม่ติด หรือ Ping Gateway วง PLC ไม่เจอ (ทีม Network เช็ก Port Switch / VLAN)',
    ],
    enEscalate: [
      'Link LED stays off after cable swap, or Ping fails with Link UP (Network team to verify switch port/VLAN).',
    ],
  },
  {
    key: 'ACCESS_POINT',
    codeBadge: 'AP • Wi-Fi',
    thTitle: 'Access Point (ตัวปล่อยสัญญาณ Wi-Fi เช่น Sundray)',
    enTitle: 'Access Point (Zone Wi-Fi — e.g. Sundray NAP)',
    thPath: 'Access Switch (PoE) → สาย UTP (Cat6) → Access Point → ปล่อย SSID (AMR / SHU)',
    enPath: 'Access Switch (PoE) → UTP Cable → Access Point → SSID Broadcast',
    thPhysical: [
      'เงยดูไฟ LED บนตัว Access Point: ดับสนิท = ไม่มีไฟ PoE เข้า / สีส้ม-กระพริบถี่ = กำลังบูตหรือหา Controller ไม่เจอ',
      'เปิด NIMS → เมนู IPAM / Inventory / Diagram เช็กว่า AP ในโซนนั้นดับ **1 ตัว** หรือดับ **ยกแผงทั้ง Switch**',
      'ตรวจดูว่าไม่มีคนถอดปลั๊ก/สาย LAN ที่ตู้ Switch ประจำโซน',
    ],
    enPhysical: [
      'Check AP ceiling/wall LED: dark = no PoE power; amber/fast blink = booting or lost controller link.',
      'Check NIMS Inventory/Diagram to see if ONE AP is offline or an entire Switch bank of APs went down.',
      'Inspect patch panel / Access Switch inside zone rack for unplugged cables.',
    ],
    thNetworkMatrix: [
      {
        condition: 'AP ดับ 1 ตัว และไฟตัวเครื่องดับสนิท ❌',
        meaning: 'สาย UTP จาก Access Switch หลุด/ขาด หรือ PoE พอร์ตนั้นจ่ายไฟไม่ได้',
      },
      {
        condition: 'AP ดับหลายตัวพร้อมกันบน Access Switch ตัวเดียวกัน ❌',
        meaning: 'Switch โซนนั้นดับ / ไฟตู้ Rack ดับ / หรือสาย Fiber Uplink กลับ Core Switch ขาด',
      },
      {
        condition: 'Ping AP เจอ ✅ แต่รถ AMR/SHU เกาะไม่ได้ ❌',
        meaning: 'AP อาจปล่อย SSID ไม่ครบ, Controller Offline, หรือรหัส Wi-Fi / VLAN ผิด',
      },
    ],
    enNetworkMatrix: [
      {
        condition: 'Single AP dark & Ping Timeout ❌',
        meaning: 'UTP cable fault or PoE budget/port down on the Access Switch.',
      },
      {
        condition: 'Multiple APs on the same Access Switch down ❌',
        meaning: 'Zone Access Switch lost power or Core Switch fiber uplink dropped.',
      },
      {
        condition: 'AP Ping OK ✅ but vehicles cannot associate ❌',
        meaning: 'Check SSID broadcast profile, VLAN tagging, or Wireless Controller connectivity.',
      },
    ],
    thSelfFix: [
      'ตรวจสอบสาย LAN หน้าตู้ Rack ของโซนนั้นว่ามีสายหลวม/หลุดหรือไม่ และเช็กไฟเลี้ยงตู้ Rack (UPS/Breaker)',
    ],
    enSelfFix: [
      'Verify zone rack UPS/power and check for visibly loose patch cords.',
    ],
    thEscalate: [
      'ไฟ Rack ติดปกติแต่ AP ไม่มีไฟ PoE / Ping ไม่เจอ → ส่ง Network Reset พอร์ต PoE หรือเช็ก Switch / สาย UTP',
      'AP Ping เจอแต่ไม่ปล่อย SSID หรือรถ Roaming ไม่สลับ AP',
    ],
    enEscalate: [
      'Rack has power but AP shows no PoE or stays unreachable (Network team to bounce PoE port / trace cable).',
      'AP reachable via Ping but SSID missing or roaming fails.',
    ],
  },
  {
    key: 'AP_CLIENT',
    codeBadge: 'Client / Bridge',
    thTitle: 'AP Client / Wireless Bridge (EST350 CL / Teltonika RUTX10)',
    enTitle: 'AP Client / Wireless Bridge (EST350 CL / Teltonika)',
    thPath: 'Access Point / Bridge AP ~~~~~ ลิงก์ไร้สาย ~~~~~ AP Client / Bridge CL → อุปกรณ์บนรถ/เครน',
    enPath: 'Fixed AP / Bridge AP ~~~~~ Wireless Link ~~~~~ Client / Bridge CL → Onboard Devices',
    thPhysical: [
      'ตรวจไฟเลี้ยง DC/PoE ที่เข้าตัว AP Client หรือ Bridge (บนเครน/รถ Shuttle)',
      'กรณี Wireless Bridge (EST350): ตรวจมุมหันของจานทั้ง 2 ฝั่งตรงกัน และไม่มีพาเลท/รถโฟล์คลิฟท์/เหล็กมาขวางทางคลื่น',
      'กรณี AP Client (Teltonika RUTX10): ตรวจขั้วเสาอากาศ Wi-Fi ทั้ง 2 เสา และไฟพอร์ต LAN ที่ต่อเข้า PLC/Barcode',
    ],
    enPhysical: [
      'Verify DC/PoE power input to the onboard AP Client or Bridge unit.',
      'For PTP Wireless Bridges (EST350): verify dish alignment and clear physical line-of-sight.',
      'For Vehicle Wi-Fi Clients (Teltonika): check dual Wi-Fi antenna tightness and onboard LAN LEDs.',
    ],
    thNetworkMatrix: [
      {
        condition: 'Ping AP ฝั่งนิ่งเจอ ✅ แต่ AP Client ฝั่งเคลื่อนที่ไม่เจอ ❌',
        meaning: 'การเชื่อมไร้สายหลุด: ไฟฝั่งรถ/เครนดับ, จานเบี้ยว, เสาหลุด, หรืออยู่ในจุดอับสัญญาณ',
      },
      {
        condition: 'Ping AP Client เจอ ✅ (Latency < 20ms) แต่ Ping PLC/Barcode หลังมันไม่เจอ ❌',
        meaning: 'ลิงก์ Wi-Fi ใช้ได้สมบูรณ์! ปัญหาอยู่ที่ฝั่งมีสาย LAN บนรถ/เครนหลังตัว Client เท่านั้น',
      },
      {
        condition: 'Ping AP Client ได้บ้างขาดบ้าง / Latency พุ่ง > 100ms ⚠️',
        meaning: 'สัญญาณกวน (Interference), ช่องสัญญาณชน, หรือจานรับ-ส่งเหลื่อมมุม',
      },
    ],
    enNetworkMatrix: [
      {
        condition: 'Fixed AP OK ✅, Moving Client/Bridge Timeout ❌',
        meaning: 'Wireless drop: client power loss, loose antenna, dish misalignment, or RF shadow.',
      },
      {
        condition: 'AP Client OK ✅ (<20ms) but behind-client PLC/Barcode Timeout ❌',
        meaning: 'Wireless link is healthy! Fault is strictly in onboard wired LAN or end-device power.',
      },
      {
        condition: 'High packet loss or >100ms latency spikes ⚠️',
        meaning: 'RF interference, co-channel congestion, or partial beam misalignment.',
      },
    ],
    thSelfFix: [
      'รีสตาร์ตไฟเลี้ยงตัว AP Client / ขันเสาอากาศ / ตรวจเคลียร์สิ่งกีดขวางหน้าจาน Bridge และสาย LAN บนรถ',
    ],
    enSelfFix: [
      'Power-cycle the client/bridge, tighten antennas, clear line-of-sight, and reseat onboard LAN cords.',
    ],
    thEscalate: [
      'รีบูตและเช็กไฟ/สายครบแล้วยังเชื่อม AP ไม่ได้ หรือ Latency แกว่งรุนแรง (ให้ทีม Network รีโมตดู Signal RSSI / SNR / Channel)',
    ],
    enEscalate: [
      'Client stays disconnected or shows severe latency jitter after physical checks (Network team to inspect RSSI / SNR / Channel).',
    ],
  },
];

const PHYSICAL_ITEMS = [
  { key: 'power', th: 'ไฟเลี้ยง Power / RUN ติดปกติ (ไม่ดับ)', en: 'Power / RUN LED is ON normally' },
  { key: 'estop', th: 'ไม่ติด E-Stop / Safety Bumper / Error หน้าตู้', en: 'No E-Stop / Safety Lock / Cabinet Error' },
  { key: 'lan', th: 'ไฟพอร์ตสาย LAN (Link/ACT) ติดหรือกระพริบ', en: 'LAN Port Link/ACT LED is ON/Blinking' },
  { key: 'rf', th: 'เสา Wi-Fi แน่น / หน้าจาน Bridge ไม่ถูกบังแนวคลื่น', en: 'Wi-Fi antenna tight / Bridge LoS unobstructed' },
];

export function TroubleshootingRunbook() {
  const { lang, t } = useI18n();
  const isTh = lang === 'th';

  const [viewMode, setViewMode] = useState<'GUIDE' | 'TICKET'>('GUIDE');
  const [selectedGuide, setSelectedGuide] = useState<GuideDeviceKey>('SRM');

  // Escalation Ticket Builder state
  const [sites, setSites] = useState<Site[]>([]);
  const [siteDevices, setSiteDevices] = useState<Device[]>([]);
  const [siteId, setSiteId] = useState('');
  const [deviceType, setDeviceType] = useState<GuideDeviceKey>('SRM');
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

  useEffect(() => {
    apiFetch<{ sites: Site[] }>('/sites')
      .then((res) => setSites(res.sites || []))
      .catch(() => {});
  }, []);

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
    () => GUIDE_DATA.find((g) => g.key === selectedGuide) || GUIDE_DATA[0],
    [selectedGuide],
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
      `System/Type: ${deviceType}`,
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
    selectedDevice,
    customUnit,
    scope,
    t,
    deviceType,
    physChecks,
    isTh,
    pingStages,
    autoDiagnosis,
    notes,
  ]);

  const handleCopySummary = async () => {
    const ok = await copyTextSafe(formattedSummary);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
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

  const iconForGuide = (key: GuideDeviceKey) => {
    switch (key) {
      case 'SRM':
        return <HardDrive className="h-4 w-4" />;
      case 'AMR':
        return <Bot className="h-4 w-4" />;
      case 'SHU':
        return <TrainFront className="h-4 w-4" />;
      case 'PLC_MAIN':
        return <Cpu className="h-4 w-4" />;
      case 'ACCESS_POINT':
        return <Wifi className="h-4 w-4" />;
      case 'AP_CLIENT':
        return <Radio className="h-4 w-4" />;
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

        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-0.5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setViewMode('GUIDE')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md cursor-pointer transition ${
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
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md cursor-pointer transition ${
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
                  title: isTh ? 'Gateway / PLC Main' : 'Gateway / PLC Main',
                  sub: isTh ? 'เช็ก Core / Switch หลักและเส้นสายตู้ควบคุม' : 'Verify core switch & wired main PLC',
                  color: 'border-slate-300 dark:border-slate-700',
                },
                {
                  step: '2',
                  title: isTh ? 'Access Point / Bridge AP' : 'Access Point / Bridge AP',
                  sub: isTh ? 'เช็กไฟ PoE และตัวกระจายสัญญาณฝั่งผนัง' : 'Verify PoE & fixed AP/Bridge side',
                  color: 'border-cyan-300 dark:border-cyan-800',
                },
                {
                  step: '3',
                  title: isTh ? 'AP Client / Bridge CL' : 'AP Client / Bridge CL',
                  sub: isTh ? 'เช็กลิงก์ Wi-Fi ถึงตัวรับบนเครน / รถ Shuttle' : 'Verify wireless reach to moving vehicle',
                  color: 'border-amber-300 dark:border-amber-800',
                },
                {
                  step: '4',
                  title: isTh ? 'End Device (PLC / AMR / Barcode)' : 'End Device (PLC / AMR / Barcode)',
                  sub: isTh ? 'เช็กสายบนตัวรถ/เครน และไฟเลี้ยงปลายทาง' : 'Verify onboard LAN & device health',
                  color: 'border-emerald-300 dark:border-emerald-800',
                },
              ].map((s, idx) => (
                <div key={s.step} className={`relative rounded-lg border ${s.color} p-3 bg-slate-50/60 dark:bg-slate-800/40`}>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-blue-600 text-white text-[11px] font-bold">
                      {s.step}
                    </span>
                    {idx < 3 && (
                      <ArrowRight className="hidden lg:block h-4 w-4 text-slate-400" />
                    )}
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
              {GUIDE_DATA.map((item) => {
                const active = selectedGuide === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSelectedGuide(item.key)}
                    className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                      active
                        ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {iconForGuide(item.key)}
                    <span>{isTh ? item.thTitle : item.enTitle}</span>
                  </button>
                );
              })}
            </div>

            <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-mono text-[11px] font-bold">
                    {activeGuide.codeBadge}
                  </span>
                  <h3 className="text-lg font-bold mt-1">
                    {isTh ? activeGuide.thTitle : activeGuide.enTitle}
                  </h3>
                  <div className="text-xs text-slate-500 font-mono mt-0.5">
                    Path: {isTh ? activeGuide.thPath : activeGuide.enPath}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDeviceType(activeGuide.key);
                    setViewMode('TICKET');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                >
                  <Network className="h-3.5 w-3.5" />
                  {t('runbook.tabTicket')}
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Physical Check */}
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

                {/* Network Matrix */}
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
                  onChange={(e) => setDeviceType(e.target.value as GuideDeviceKey)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  {GUIDE_DATA.map((g) => (
                    <option key={g.key} value={g.key}>
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

            {/* Scope */}
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

            {/* Physical Checkboxes */}
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

            {/* 4-Stage Ping Check */}
            <div className="text-xs space-y-2">
              <div className="font-semibold text-slate-600 dark:text-slate-300">
                {t('runbook.ping4Title')}
              </div>
              {(
                [
                  ['s1', isTh ? '1. Gateway / PLC Main' : '1. Gateway / PLC Main'],
                  ['s2', isTh ? '2. Access Point / Bridge AP' : '2. Access Point / Bridge AP'],
                  ['s3', isTh ? '3. AP Client (RUTX10) / Bridge CL' : '3. AP Client / Bridge CL'],
                  ['s4', isTh ? '4. End Device (PLC / AMR / Barcode)' : '4. End Device (PLC / AMR / Barcode)'],
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

          {/* Right Preview + Auto Diagnosis + Copy */}
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
    </div>
  );
}

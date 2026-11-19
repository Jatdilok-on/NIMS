import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import { ensureDir } from './storage';

export type RunbookIconType =
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

export interface RunbookPingRule {
  condition: string;
  meaning: string;
}

export interface RunbookGuide {
  id: string;
  codeBadge: string;
  iconType: RunbookIconType;
  thTitle: string;
  enTitle: string;
  thPath: string;
  enPath: string;
  thPhysical: string[];
  enPhysical: string[];
  thNetworkMatrix: RunbookPingRule[];
  enNetworkMatrix: RunbookPingRule[];
  thSelfFix: string[];
  enSelfFix: string[];
  thEscalate: string[];
  enEscalate: string[];
  imageFile?: string | null;
  updatedBy?: string | null;
  updatedAt?: string | null;
}

export const DEFAULT_RUNBOOK_GUIDES: RunbookGuide[] = [
  {
    id: 'SRM',
    codeBadge: 'SRM • Crane',
    iconType: 'CRANE',
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
    id: 'AMR',
    codeBadge: 'AMR • AGV',
    iconType: 'AMR',
    thTitle: 'AMR (รถขนส่งอัตโนมัติ)',
    enTitle: 'AMR (Autonomous Mobile Robot)',
    thPath: 'Switch → Access Point (โซน AMR) → การ์ด Wi-Fi บนรถ AMR',
    enPath: 'Switch → Access Point (AMR SSID) → Onboard AMR Wi-Fi Module',
    thPhysical: [
      'ดูหน้าจอ/ไฟสถานะบนรถ AMR: เช็กว่าติด Alarm, Bumper ชนสิ่งกีดขวาง, E-Stop ค้าง, หรือแบตเตอรี่ต่ำ (<15%) หรือไม่',
      'ดูว่ามีอาการค้างแค่ คันเดียว หรือหยุดพร้อมกัน หลายคันในโซนเดียว',
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
    id: 'SHU',
    codeBadge: 'SHU • Shuttle',
    iconType: 'SHUTTLE',
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
    id: 'PLC_MAIN',
    codeBadge: 'PLC • Main',
    iconType: 'PLC',
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
    id: 'ACCESS_POINT',
    codeBadge: 'AP • Wi-Fi',
    iconType: 'AP',
    thTitle: 'Access Point (ตัวปล่อยสัญญาณ Wi-Fi เช่น Sundray)',
    enTitle: 'Access Point (Zone Wi-Fi — e.g. Sundray NAP)',
    thPath: 'Access Switch (PoE) → สาย UTP (Cat6) → Access Point → ปล่อย SSID (AMR / SHU)',
    enPath: 'Access Switch (PoE) → UTP Cable → Access Point → SSID Broadcast',
    thPhysical: [
      'เงยดูไฟ LED บนตัว Access Point: ดับสนิท = ไม่มีไฟ PoE เข้า / สีส้ม-กระพริบถี่ = กำลังบูตหรือหา Controller ไม่เจอ',
      'เปิด NIMS → เมนู IPAM / Inventory / Diagram เช็กว่า AP ในโซนนั้นดับ 1 ตัว หรือดับ ยกแผงทั้ง Switch',
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
    enSelfFix: ['Verify zone rack UPS/power and check for visibly loose patch cords.'],
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
    id: 'AP_CLIENT',
    codeBadge: 'Client / Bridge',
    iconType: 'CLIENT',
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

function getRunbookFilePath(): string {
  const dir = path.resolve(env.storageRoot, 'runbook');
  ensureDir(dir);
  return path.join(dir, 'guides.json');
}

function writeGuidesAtomic(guides: RunbookGuide[]): void {
  const targetPath = getRunbookFilePath();
  const tempPath = `${targetPath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(guides, null, 2), 'utf8');
  fs.renameSync(tempPath, targetPath);
}

export function loadRunbookGuides(): RunbookGuide[] {
  const targetPath = getRunbookFilePath();
  if (!fs.existsSync(targetPath)) {
    const initial = DEFAULT_RUNBOOK_GUIDES.map((g) => ({ ...g }));
    writeGuidesAtomic(initial);
    return initial;
  }
  try {
    const raw = fs.readFileSync(targetPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as RunbookGuide[];
    }
  } catch {
    // Fall back safely to defaults if file was corrupted
  }
  const initial = DEFAULT_RUNBOOK_GUIDES.map((g) => ({ ...g }));
  writeGuidesAtomic(initial);
  return initial;
}

export function saveRunbookGuides(guides: RunbookGuide[]): RunbookGuide[] {
  writeGuidesAtomic(guides);
  return guides;
}

export function resetRunbookGuides(): RunbookGuide[] {
  const fresh = DEFAULT_RUNBOOK_GUIDES.map((g) => ({ ...g }));
  writeGuidesAtomic(fresh);
  return fresh;
}

# NIMS – ภาพรวมระบบ, สถาปัตยกรรม, โครงสร้างเซิร์ฟเวอร์ และ Flow การทำงาน

**NIMS (Network Infrastructure Management System)** คือระบบบริหารจัดการโครงสร้างพื้นฐานเครือข่ายแบบรวมศูนย์ (On-Premise) ที่รวมการเก็บข้อมูลอุปกรณ์, IPAM, ผัง Network Diagram แบบโต้ตอบได้, ห้องนิรภัยรหัสผ่านแบบเข้ารหัส, เอกสารโครงการ และ **ระบบตรวจเช็กสถานะอุปกรณ์อัตโนมัติ (Site Ping Agents)** ทั้งในวง LAN เดียวกันและข้ามวง Network ไว้ในระบบเดียว

---

## 1. ปัญหาเดิม vs สิ่งที่ NIMS เข้ามาแก้ปัญหา

| ปัญหาเดิม (Before) | โซลูชันใน NIMS (After) |
| :--- | :--- |
| ข้อมูลอุปกรณ์และ IP กระจัดกระจายในไฟล์ Excel / รูปภาพ / PDF | รวมศูนย์ในฐานข้อมูลเดียว พร้อมตรวจสอบ IP/MAC ซ้ำอัตโนมัติ (IPAM + Inventory 16 ประเภท) |
| ผัง Network Diagram เป็นภาพนิ่ง ไม่รู้ว่าตัวไหนล่ม | ผัง **Interactive Network Diagram** ผูกกับ Inventory จริง แสดงไฟกระพริบ Up/Down และแสงวิ่งบนสายแบบเรียลไทม์ |
| Server กลางออกอินเทอร์เน็ตไม่ได้ และลูกค้าไม่อนุญาตให้เปิด Port Firewall | ใช้สถาปัตยกรรม **Outbound-Only Site Agent + Notebook Bridge + Cloudflare Relay** ไม่ต้องเปิด Port / Port Forward ที่ Router ลูกค้าเลย |
| การใช้รหัสผ่านร่วมกันไม่มีประวัติตรวจสอบ | **Credentials Vault** เข้ารหัส AES-256-GCM + **RBAC 5 ระดับ** + **Audit Log** บันทึกทุกการเข้าดูและคัดลอก |

---

## 2. เทคโนโลยีที่ใช้รันระบบ, เซิร์ฟเวอร์ และฐานข้อมูล (Runtime, Server & Database)

### 2.1 ระบบรันผ่านอะไร และใช้ Server ตัวไหน
ตัวระบบออกแบบให้ติดตั้งบน **Windows Server (On-Premise)** และทำงานผ่าน **Node.js Runtime** โดยตรง (รองรับการรันแบบไม่ต้องพึ่งอินเทอร์เน็ต และมี Docker Compose เป็นทางเลือกเสริม):

| ส่วนประกอบ (Component) | เทคโนโลยี / ซอฟต์แวร์ที่ใช้ | หน้าที่และพอร์ตการทำงาน |
| :--- | :--- | :--- |
| **HTTPS Reverse Proxy** | **Caddy Web Server** (`caddy_windows_amd64`) | รับการเชื่อมต่อ HTTPS หลักที่พอร์ต **`3000`** (`tls internal`) และกระจายทราฟฟิกไปยัง Frontend และ Backend API |
| **Web Frontend Server** | **Next.js 15** (React 19 + TypeScript + Tailwind CSS + React Flow) | ให้บริการหน้าเว็บ Portal, Dashboard, IPAM และ Network Diagram Editor (รันภายในหลัง Proxy) |
| **Backend API Server** | **Node.js + Express + TypeScript** | จัดการ REST API, Authentication, RBAC, AES-256-GCM Vault, Visio/Excel/PDF Engine และรับผลจาก Site Agents (พอร์ตภายใน **`4000`**) |
| **Process & Auto-Start** | **Windows Task Scheduler** (`NIMS Production Server`, `NIMS HTTPS Proxy`) + `scripts/run-nims.mjs` | สั่งเปิด Frontend, Backend และ Caddy อัตโนมัติตั้งแต่บูตเครื่อง Server |
| **Cloud Relay (สำหรับข้ามวง)** | **Cloudflare Workers** + **Cloudflare D1** | จุดพักรับ-ส่งผล Ping ผ่าน HTTPS 443 (เฉพาะเส้นทาง `/api/agents/runtime/*` และ `/bridge/*`) |
| **Bridge & Probe Agents** | **Node.js Standalone Scripts** (`nims-relay-bridge.mjs`, `nims-agent.mjs`) | รันเบื้องหลังอัตโนมัติผ่าน Windows Task Scheduler (`NIMS-Relay-Bridge`, `NIMS-SiteAgent-*`) |

### 2.2 ใช้ Database ยังไง และจัดเก็บข้อมูลอย่างไร
1. **ฐานข้อมูลหลัก (On-Premise Database):**
   - ใช้ **MongoDB Community Server** ตั้งค่าเป็น **Single-Node Replica Set (`rs0`)** ฟังเฉพาะภายในเครื่อง (`127.0.0.1:27017` — ปิดพอร์ตจากภายนอกด้วย Windows Firewall)
   - เชื่อมต่อผ่าน **Prisma ORM (`@prisma/client`)** จัดการโครงสร้าง Collection หลักครบวงจร เช่น `Sites`, `Devices` (16 ประเภท), `Subnets`, `IPAllocations`, `Diagrams` (เก็บประวัติเวอร์ชัน), `Documents`, `Credentials`, `MaintenanceRecords`, `SiteAgents`, `Users`, `Roles`, `UserSitePermissions` และ `AuditLogs`
   - **การป้องกันข้อมูลสำคัญ:** รหัสผ่านผู้ใช้ Hash ด้วย `bcrypt` และรหัสผ่านอุปกรณ์ใน Credentials Vault เข้ารหัสระดับ Field ด้วย **AES-256-GCM** (แยก Encryption Key ไว้ใน `.env` ของ Server)
2. **การจัดเก็บไฟล์และระบบสำรองข้อมูล (File Storage & Backup):**
   - ไฟล์ Diagram (`.png`, `.pdf`, `.vsdx`, `.drawio`) และเอกสารโครงการ เก็บแยกโฟลเดอร์ตาม `Site` บน Local Disk / NAS และเสิร์ฟผ่าน API ที่ตรวจสิทธิ์ RBAC ทุกครั้ง
   - รองรับ **Backup & Restore** แบบ ZIP Snapshot รวมทั้งข้อมูล MongoDB + ไฟล์อัปโหลดทั้งหมด + SHA-256 Manifest (กดสำรองเองหรือตั้งเวลาอัตโนมัติ)
3. **ฐานข้อมูลชั่วคราวบน Cloud (เฉพาะโหมด Cross-Network Relay):**
   - ใช้ **Cloudflare D1 (SQLite)** เก็บเฉพาะ 2 ตาราง คือ `relay_targets` (รายชื่อ IP เป้าหมาย) และ `relay_reports` (ผล Ping ล่าสุด)
   - อ้างอิงด้วยค่า **SHA-256 Hash ของ Agent Token** เท่านั้น (ไม่เก็บ Token จริง และลบทิ้งทันทีเมื่อ Bridge ดึงผลส่งเข้า MongoDB บน NIMS Server สำเร็จ)

```mermaid
flowchart TB
    USR["ผู้ใช้งาน (Browser PC / Mobile)"] -->|"HTTPS :3000"| CADDY["Caddy HTTPS Reverse Proxy"]
    CADDY -->|"หน้าเว็บ"| FE["Next.js 15 Frontend"]
    CADDY -->|"/api/*"| BE["Node.js + Express Backend (:4000)"]
    BE -->|"Prisma ORM"| MONGO[("MongoDB Replica Set rs0 (127.0.0.1:27017)")]
    BE -->|"Read / Write"| DISK["Local Storage / NAS (Diagrams, Docs, Backups)"]
```

---

## 3. สถาปัตยกรรมเครือข่าย (Network Topology Architecture)

ระบบรองรับการมอนิเตอร์อุปกรณ์ได้ 2 รูปแบบพร้อมกันบน Server เดียว:
1. **Same LAN Mode:** Site ที่อยู่ในวงเครือข่ายเดียวกับ NIMS Server (Agent ส่งผลเข้า Server ตรง)
2. **Cross-Network / Air-Gapped Mode:** Site อยู่คนละวง/คนละสาขา และ NIMS Server ออกเน็ตไม่ได้ (ใช้ Notebook ตัวกลาง + Cloudflare Workers & D1 เป็นสะพานส่งข้อมูลขาออกล้วน)

```mermaid
flowchart LR
    subgraph REMOTE["Site ปลายทาง (คนละวง Network / หลัง NAT ลูกค้า)"]
        R_DEV["Switch / AP / PLC / Server / CCTV"]
        R_AGT["Remote Site Agent (nims-agent.mjs)"]
        R_DEV <-->|"Ping (ICMP / TCP)"| R_AGT
    end

    subgraph CLOUD["Cloudflare Free Tier (Public HTTPS 443)"]
        CF_W["Cloudflare Worker (nims-relay)"]
        CF_D1["Cloudflare D1 SQLite"]
        CF_W <--> CF_D1
    end

    subgraph OFFICE["วง LAN ภายใน (Server ออกเน็ตไม่ได้)"]
        NB["Notebook ตัวกลาง (Bridge: nims-relay-bridge.mjs)"]
        NIMS_SRV["NIMS Server (191.20.110.191:3000 - Caddy + Next.js + Express + MongoDB)"]
        LAN_AGT["Local Site Agent (วง LAN เดียวกัน)"]
        LAN_DEV["อุปกรณ์ในวง Server"]
    end

    R_AGT -->|"1. HTTPS GET / POST (Outbound 443)"| CF_W
    NB -->|"2. HTTPS GET / POST (Outbound 443)"| CF_W
    NB -->|"3. LAN HTTPS (191.20.110.191:3000)"| NIMS_SRV
    LAN_DEV <-->|"Ping"| LAN_AGT
    LAN_AGT -->|"LAN HTTPS"| NIMS_SRV
```

---

## 4. Flow การทำงานทั้งหมด (End-to-End Workflows)

### 4.1 การทำงานของระบบหลัก (Core Web Portal Flow)

```mermaid
flowchart TD
    U["ผู้ดูแลระบบ / ทีมวิศวกร"] --> LOGIN["1. เข้าสู่ระบบ (JWT HttpOnly Cookie + RBAC)"]
    LOGIN --> DASH["2. NOC Dashboard (สรุป KPI, Online/Offline, คลิกกรองได้ทันที)"]
    DASH --> SITE["3. เลือก Site Workspace (8 แท็บต่อ Site)"]
    SITE --> INV["Device Inventory (16 ประเภท + Import Excel/CSV)"]
    SITE --> IPAM["IPAM (คำนวณ Subnet, จับคู่ IP อัตโนมัติ)"]
    SITE --> DIAG["Network Diagram (วาดผัง + ไฟกระพริบ Live Up/Down)"]
    SITE --> VAULT["Credentials Vault (เข้ารหัส AES-256-GCM + Audit Log)"]
    SITE --> AGT["Site Agents (สร้าง Token + โหลด 1-Click Installer)"]
```

### 4.2 Flow การทำงานของ Cross-Network Site Agent (คนละวงเน็ต & Server ไม่ออกเน็ต)

```mermaid
sequenceDiagram
    autonumber
    participant S as "NIMS Server (LAN Only)"
    participant B as "Notebook ตัวกลาง (Bridge)"
    participant CF as "Cloudflare Worker + D1"
    participant RA as "Agent ที่ Site ปลายทาง"
    participant LD as "อุปกรณ์หน้างาน (LAN ปลายทาง)"

    Note over S,B: ทุกรอบ 120 วินาที (หรือเมื่อแก้ไขรายการอุปกรณ์)
    B->>S: GET /api/agents/runtime/targets (Header: x-relay-sync=1)
    S-->>B: รายชื่ออุปกรณ์ + IP ที่ต้อง Ping
    B->>CF: POST /bridge/targets (Auth: x-bridge-secret, เก็บด้วย SHA-256 Token Hash)

    Note over RA,LD: ทุกรอบ 60 วินาที (กำหนดได้ 10-3600 วิ)
    RA->>CF: GET /api/agents/runtime/targets (Bearer Token)
    CF-->>RA: ส่งรายชื่อ IP เป้าหมายให้ Agent
    RA->>LD: Ping ICMP / TCP Fallback (เช่น 192.168.x.x)
    LD-->>RA: ตอบกลับ Alive + Latency (ms)
    RA->>CF: POST /api/agents/runtime/report (ส่งผล UP/DOWN + Latency)
    CF-->>RA: บันทึกลง D1 ตาราง relay_reports

    Note over B,S: ทุกรอบ 15 วินาที
    B->>CF: GET /bridge/reports (ดึงผลค้างส่งทั้งหมด)
    CF-->>B: ส่งรายการผล Ping ล่าสุด
    B->>S: POST /api/agents/runtime/report (ส่งเข้า NIMS Server ในวง LAN)
    S-->>B: อัปเดต MongoDB + Audit Log (ONLINE/OFFLINE)
    B->>CF: POST /bridge/reports/ack (ลบคิวที่ส่งสำเร็จแล้ว)
```

### 4.3 Flow การแสดงผลสถานะ Real-Time บนหน้าเว็บ
1. **ประมวลผลสถานะ (`evaluateDevicePingOutcome`):**
   - ถ้า Ping ผ่าน → อัปเดตอุปกรณ์เป็น `ONLINE`, รีเซ็ตจำนวนครั้งที่พลาด, บันทึก `lastLatencyMs` และ `lastPingAt`
   - ถ้า Ping ไม่ผ่าน → นับ `consecutiveMisses` เพิ่มขึ้นทีละ 1; เมื่อพลาดครบตามค่า `Offline Misses` (ค่าเริ่มต้น `3` ครั้ง) จึงเปลี่ยนสถานะเป็น `OFFLINE` พร้อมบันทึก `DEVICE_STATUS_TRANSITION` ลง Audit Log *(อุปกรณ์ที่ตั้ง `MAINTENANCE` ไว้จะไม่ถูกเขียนทับ)*
2. **การแสดงผลบนหน้าจอ (อัปเดตอัตโนมัติทุก 10 วินาที):**
   - **Sites / Device Inventory:** แสดงไฟ LED กระพริบสีเขียว (`ONLINE`) / สีแดง (`OFFLINE`) คู่กับค่า Ping (`ms`)
   - **Network Diagram:**
     - สาย **Link Cable** ที่เชื่อมอุปกรณ์ที่มี Agent จะมี **แสงวิ่ง + Halo เรืองกระพริบ** (เขียวเมื่อ `UP`, แดงกระพริบถี่เมื่อ `DOWN`)
     - ตัว **Node บนผัง** และ **Device / Node Inspector** แสดงไฟกระพริบ `UP • ONLINE` / `DOWN • OFFLINE` พร้อม Latency และเวลา Ping ล่าสุด

---

## 5. ระบบความปลอดภัย (Security Architecture)

1. **Zero Inbound Firewall Ports:** ทั้งเครื่อง Server, Notebook ตัวกลาง และเครื่อง Agent หน้างาน **ไม่ต้องเปิด Port ขาเข้าจากอินเทอร์เน็ต** และไม่ต้องขอแก้ไข Router ของลูกค้า
2. **Token & Secret Isolation:**
   - Agent Token (`nims_agt_...`) เก็บเฉพาะ **SHA-256 Hash** ทั้งใน MongoDB และบน Cloudflare D1 (ไม่เก็บ Token ดิบไว้บน Cloud)
   - ช่องทางควบคุม Bridge (`/bridge/*`) แยกสิทธิ์ด้วย `BRIDGE_SECRET` แบบ Constant-Time Comparison
   - หน้าเว็บหลัก/Login/ฐานข้อมูลของ NIMS **ไม่ถูกเปิดออกอินเทอร์เน็ต** — มีเฉพาะข้อมูล Target IP และผล Ping ที่วิ่งผ่าน Cloud Relay
3. **Data Protection:** รหัสผ่านผู้ใช้ Hash ด้วย `bcrypt`, ข้อมูลใน Credentials Vault เข้ารหัสด้วย **AES-256-GCM**, Session ใช้ **HttpOnly Cookie + CSRF**, และตรวจสิทธิ์ **RBAC ราย Site** ทุก API

---

## 6. ความสามารถในการรองรับ (Capacity & Scalability)

### 6.1 Site ในวง LAN / VPN เดียวกัน (Direct LAN Mode)
- **ไม่จำกัดจำนวนด้วยโควตา Cloud** (ขึ้นกับสเปกเครื่อง NIMS Server และ MongoDB)
- API `POST /api/agents/runtime/report` รองรับสูงสุด **`5,000` อุปกรณ์ต่อรอบรายงาน** และอัปเดตฐานข้อมูลแบบ Batch
- **รองรับได้ ~100+ Sites** (หลายพันอุปกรณ์) บน Server มาตรฐาน

### 6.2 Site คนละวง Network (Cross-Network ผ่าน Cloudflare Workers + D1 แพ็กเกจ Free)

Cloudflare แพ็กเกจ **Free (0 บาท/เดือน)** ให้โควตา:
- **Cloudflare Workers:** `100,000` Requests / วัน
- **Cloudflare D1 (SQLite):** `100,000` Rows Written / วัน และ `5,000,000` Rows Read / วัน

> เหตุผลที่ระบบใช้ **Cloudflare D1** แทน KV: เพราะ Workers KV Free เขียนได้แค่วันละ `1,000` ครั้ง (ใช้ได้ไม่ถึง 1 Site) แต่ **D1 Free เขียนได้ถึงวันละ `100,000` แถว** และระบบ Sync รายชื่ออุปกรณ์เฉพาะตอนมีการเปลี่ยนแปลง

#### ตารางประเมินจำนวน Site ที่รองรับได้ (Cloudflare Free Tier)

| รอบการ Ping ของแต่ละ Site (`Poll Interval`) | รอบดึงผลของ Bridge (`BRIDGE_POLL_SEC`) | ปริมาณ Request ต่อ 1 Site / วัน | **จำนวน Remote Sites ที่รองรับได้ (Free Tier)** | หมายเหตุการใช้งาน |
| :---: | :---: | :---: | :---: | :--- |
| **ทุก 60 วินาที** *(ค่าเริ่มต้น)* | 15 วินาที | ~4,320 req/วัน *(+5,760 req คงที่จาก Bridge)* | **~15 – 20 Sites** | แนะนำสำหรับใช้งานทั่วไป ปลอดภัยไม่ชนเพดาน 100k req/วัน |
| **ทุก 120 วินาที** *(2 นาที)* | 30 วินาที | ~2,160 req/วัน *(+2,880 req คงที่จาก Bridge)* | **~40 – 45 Sites** | เหมาะเมื่อมีสาขาเยอะขึ้นและรับดีเลย์ 2 นาทีได้ |
| **ทุก 300 วินาที** *(5 นาที)* | 60 วินาที | ~864 req/วัน *(+1,440 req คงที่จาก Bridge)* | **~100+ Sites** | สำหรับเน้นเฝ้าระวังระดับสาขาจำนวนมาก |

> **กรณีขยายเกิน 100 Sites หรือต้องการ Ping ถี่ทุก 10–30 วินาที:**
> - อัปเกรด Cloudflare Workers เป็นแพ็กเกจ **Paid (\$5/เดือน ≈ 170 บาท)** จะได้ **10,000,000 Requests/เดือน** + D1 **50,000,000 Rows Written/เดือน** → ขยายรองรับได้ **หลายร้อย Sites** ทันทีโดยไม่ต้องแก้โค้ดระบบเลยครับ

---

## 7. สรุปจุดเด่นและคุณค่าของระบบ (Key Takeaways & Business Value)

1. **ประหยัดงบประมาณและลดเวลาติดตั้ง:** ใช้โครงสร้างที่มีอยู่ (On-Premise Server + Cloudflare Free Tier 0 บาท) ไม่ต้องซื้อ IP Public หรือเช่า VPN Tunnel รายสาขา
2. **ปลอดภัยและไม่กระทบระบบเครือข่ายลูกค้า (Zero Router Config):** ไม่ต้องขอเปิด Port ขาเข้าหรือแก้ Firewall/Router ของลูกค้าทั้งฝั่งต้นทางและปลายทาง
3. **ติดตั้งและขยายสาขาได้แบบ 1-Click:** สร้าง Agent บนหน้าเว็บ → ดาวน์โหลดไฟล์ `.bat` ไปดับเบิลคลิกที่เครื่องกลางและเครื่องปลายทาง → ติดตั้ง Runtime, Auto-Start และรันเบื้องหลังอัตโนมัติ
4. **ติดตามปัญหาเชิงรุกแบบ Real-Time:** คลิกเจาะลึกจาก NOC Dashboard ไปยังอุปกรณ์ที่มีปัญหาได้ทันที และเห็นไฟกระพริบแจ้งเตือน Up/Down บนผัง Network Diagram แบบเรียลไทม์
5. **รองรับการเติบโตในอนาคต (Scalable):** รองรับทั้งวง LAN (`100+` Sites) และ Remote ข้ามวง (`15–45+` Sites ฟรี, ขยายได้เป็นหลักร้อย Sites ด้วยงบเพียง ~\$5/เดือน)

> 🌐 **Language:** **🇹🇭 ภาษาไทย** | [🇺🇸 English](README.en.md)

# NIMS – ระบบบริหารจัดการโครงสร้างพื้นฐานเครือข่าย (Network Infrastructure Management System)

เว็บแอปพลิเคชันสำหรับบริหารจัดการระบบเครือข่ายหลายสาขาแบบรวมศูนย์ (On-Premise) ครอบคลุมตั้งแต่ผังเครือข่าย (Network Diagrams), การจัดการ IP Address (IPAM), คลังอุปกรณ์ (Device Inventory), ห้องนิรภัยเก็บรหัสผ่านแบบเข้ารหัส, เอกสารโครงการ, ประวัติการบำรุงรักษา, สิทธิ์การใช้งาน (RBAC) และ Audit Log

---

## ความสามารถหลักของระบบ

- **บริหารจัดการหลายสาขา (Multi-Site Organization)**
  - จัดการ Site ได้ไม่จำกัดพร้อมกำหนดสิทธิ์การเข้าถึงแยกราย Site และ Workspace 8 แท็บต่อ Site (ภาพรวม, ผังเครือข่าย, คลังอุปกรณ์, IPAM, จัดการรหัสผ่าน, เอกสารโครงการ, ประวัติซ่อมบำรุง, ตั้งค่า Site)
  - มีหน้าต่าง Quick View สำหรับดูรายละเอียด Site, ลิงก์ Google Map และข้อมูล VPN / รหัสผ่านได้อย่างรวดเร็ว

- **แดชบอร์ดและสถิติภาพรวม (NOC Dashboard & Analytics)**
  - แสดง KPI ภาพรวมทั้งองค์กรหรือกรองแยกตาม Site (จำนวน Site, อุปกรณ์ทั้งหมด, ผังเครือข่าย, เอกสาร และอุปกรณ์แยกทั้ง 16 ประเภท)
  - แสดงสถานะอุปกรณ์ (`ONLINE`, `OFFLINE`, `MAINTENANCE`, `UNKNOWN`), กราฟแท่ง, กราฟวงกลม, แนวโน้มการเพิ่มรายเดือน และ Recent Activity ที่จำกัดให้เห็นเฉพาะกิจกรรมของตนเอง (ยกเว้น `SUPER_ADMIN` ที่ดูได้ทั้งหมด)

- **คลังอุปกรณ์และการนำเข้า/ส่งออก (Device Inventory & Import/Export)**
  - รองรับอุปกรณ์ **16 ประเภท**: `SWITCH`, `ACCESS_POINT`, `AP_CLIENT`, `WLC`, `SERVER`, `PLC`, `ESXI`, `VM`, `NAS`, `UPS`, `IP_CAM`, `PC`, `NVR`, `TV`, `PRINTER`, `BARCODE`
  - ตรวจจับ IP และ MAC ซ้ำซ้อนภายในแต่ละ Site พร้อมค้นหาทั้งระบบ (Global Search)
  - นำเข้าจาก `.xlsx` / `.csv` (รองรับไฟล์ CSV ภาษาไทยทั้ง UTF-8 และ Windows-874/TIS-620) สามารถแยก Device Type หลายชนิดในไฟล์เดียว และตรวจจับ Target Site อัตโนมัติจากคอลัมน์หรือชื่อไฟล์
  - รองรับแก้ไข/ลบหลายรายการพร้อมกัน (Bulk Edit / Bulk Delete), แสดงผลทั้งหมดในหน้าเดียว และส่งออกเป็น `.xlsx`, `.csv`, `.pdf`

- **การจัดการ IP Address (IPAM)**
  - จัดการ VLAN และ Subnet คำนวณ Mask, Network, Broadcast, ช่วง IP ใช้งานอัตโนมัติ พร้อมตาราง IP Grid แบบ Interactive
  - แสดงสถานะจาก Site Agent แบบเรียลไทม์บนตาราง IP (`ONLINE` ไฟเขียวกระพริบ, `OFFLINE` แดงทึบ, `MAINTENANCE`, `UNKNOWN`) พร้อมส่งออก CSV/Excel/PDF
  - เชื่อมโยง IP ของอุปกรณ์จาก Device Inventory เข้าสู่ Subnet ให้อัตโนมัติ มีระบบตรวจจับ IP ที่ยังไม่มี Subnet รองรับ และปุ่ม Auto-Create `/24` Subnets & Sync รวมถึงแก้ไขข้อมูล Subnet (`Edit Subnet`) ได้โดยตรง

- **เครื่องมือจัดการและวาดผังเครือข่าย (Network Diagram Engine)**
  - รองรับการอัปโหลดและพรีวิวไฟล์ `PNG`, `JPG`, `SVG`, `PDF` (หลายหน้า), `.drawio`, `.xml` และ Visio `.vsdx` (แปลงเป็น SVG อัตโนมัติฝั่ง Server) รวมถึงเก็บประวัติเวอร์ชันและกู้คืนเวอร์ชันเดิมได้
  - ตัวแก้ไขผังเครือข่ายบนเว็บ (`@xyflow/react`) ลากวางอุปกรณ์จริงจาก Inventory หรือ Shape มาตรฐาน เชื่อมสาย LAN/Fiber/Wireless ระบุพอร์ต/VLAN/ความเร็ว ตั้งภาพพื้นหลัง (Floor Plan) แบบตรึงพิกัด เดินเส้นหลบอุปกรณ์อัตโนมัติ (Orthogonal Routing) Sync สถานะกลับสู่ Inventory แบบเรียลไทม์ และส่งออกเป็น `PNG` ความละเอียดสูงแบบเต็มผัง (ไม่ติด MiniMap/Controls), `.drawio` หรือ `.json`

- **ห้องนิรภัยเก็บรหัสผ่าน (Access Management / Credentials Vault)**
  - เข้ารหัสชื่อผู้ใช้และรหัสผ่านด้วย **AES-256-GCM** แยกคีย์ `CREDENTIALS_ENCRYPTION_KEY` บันทึกประวัติทุกครั้งที่มีการกดดูหรือคัดลอก (รองรับ Copy All และคัดลอกบน `http://` LAN ได้) และบังคับบล็อกสิทธิ์ `IP_VIEWER` (`403`) จากฝั่ง Backend

- **เอกสารโครงการ (Project Documents) และประวัติบำรุงรักษา (Maintenance History)**
  - จัดเก็บเอกสารแยกหมวดหมู่ มีระบบอัปเดตเวอร์ชันและดาวน์โหลดย้อนหลัง รวมถึงบันทึกประวัติงานซ่อมบำรุง/อัปเกรดเฟิร์มแวร์

- **ระบบผู้ใช้งาน, สิทธิ์ (RBAC), ความปลอดภัย และ Audit Logs**
  - รองรับ Role 5 ระดับ: `SUPER_ADMIN`, `SITE_ADMIN`, `NETWORK_ENGINEER`, `VIEWER`, `IP_VIEWER` พร้อมกำหนดสิทธิ์ราย Site และรายโมดูล (รองรับ Bulk Assign) และการบังคับสิทธิ์ฝั่ง UI + API
  - รองรับการเพิ่มผู้ใช้งานจำนวนมากด้วยการ Import Excel / CSV และบังคับเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งแรก (`First-Login Password Change`)
  - รองรับเปลี่ยนภาษาหน้าเว็บครบ **4 ภาษา** (`ไทย`, `English`, `中文`, `日本語`) ครอบคลุมทุกโมดูลหลัก (Dashboard, Sites, Inventory, IPAM, Diagrams, Access & Vault, Documents, Maintenance, Site Agents, Users, Audit Logs, Settings) และธีมสีหลายรูปแบบ
  - เสริมความปลอดภัยระดับ Production ด้วย HttpOnly Cookie Authentication, การตรวจจับ Origin ป้องกัน CSRF, CSP/XSS Sanitization และการจำกัดขนาด/ชนิดไฟล์อัปโหลด

- **ระบบมอนิเตอร์สถานะอุปกรณ์แบบเรียลไทม์ (Site Ping Agents & Cross-Network Relay)**
  - ติดตั้ง Agent (`nims-agent.mjs`) ผ่านหน้า **Sites → Site Agents → + Add Site Agent** ได้ทั้งแบบ **LAN Direct** และ **Remote (Cross-Network)** พร้อมตัวดาวน์โหลด 1-Click Installer ทั้งฝั่ง Agent และฝั่ง Relay Bridge
  - Ping อุปกรณ์ภายในแต่ละ Site อัตโนมัติ พร้อมแสดงไฟ LED กระพริบ Up/Down, Latency (`ms`), แสงวิ่งบนสาย Link Cable ในหน้า Network Diagram, จุดสถานะบนหน้า IPAM และรีเซ็ตสถานะ Ping ค้างอัตโนมัติเมื่อหยุด/ลบ Agent
  - สำหรับ **Site คนละวงเน็ต (Cross-Network)** ใช้ **Notebook Bridge (`agent/relay/nims-relay-bridge.mjs`) + Cloudflare Workers & D1 Relay** สำหรับกรณี Server ออกเน็ตไม่ได้และไม่ต้องการเปิด Port Firewall
  - ดูผังสถาปัตยกรรม, Flow การทำงานทั้งหมด, ตารางสิทธิ์ RBAC และตัวเลขการรองรับ (Capacity) ได้ที่ [docs/PRESENTATION_FLOW.md](docs/PRESENTATION_FLOW.md)

- **สำรองและกู้คืนข้อมูล (Backup & Restore)**
  - สร้างไฟล์สำรองแบบ ZIP ที่รวม Snapshot ฐานข้อมูล MongoDB, ไฟล์อัปโหลดทั้งหมด และ SHA-256 Manifest ทั้งแบบกดสำรองเองและตั้งเวลาอัตโนมัติ (รายวัน/รายสัปดาห์/รายเดือน)

---

## โครงสร้างโปรเจกต์

- `backend/` — Node.js + Express + TypeScript + Prisma ORM + MongoDB REST API (พอร์ต `4000`)
- `frontend/` — Next.js App Router + React + TypeScript + Tailwind CSS + React Flow (พอร์ต `3000`)
- `agent/` — Site Ping Agent แบบ Zero-Dependency ([agent/README.md](agent/README.md)) และชุด Cloudflare Workers + D1 Relay Bridge ([agent/relay/README.md](agent/relay/README.md))
- `scripts/` — สคริปต์จัดการระบบและ Production:
  - `run-nims.mjs` — รันระบบด้วย Node.js โดยตรง (ไม่ต้องใช้ Docker)
  - `deploy-windows-server.ps1` — ติดตั้งและสร้าง Windows Scheduled Task `"NIMS Production Server"` สำหรับ Production
  - `harden-windows-lan.ps1` / `harden-lan.bat` — ตั้งค่า Firewall/NTFS ACL/TLS/CORS สำหรับ LAN Production และรองรับ Proxy (`Caddyfile.lan.example`)
- `start-nims.ps1` / `start-nims.bat` — สคริปต์เปิดใช้งานด่วนบน Windows
- `docs/` — เอกสารเพิ่มเติม: [PRESENTATION_FLOW.md](docs/PRESENTATION_FLOW.md) *(ผังสถาปัตยกรรม, Flow การทำงาน & Capacity สำหรับนำเสนอ)*, [ARCHITECTURE.md](docs/ARCHITECTURE.md), [INSTALLATION.md](docs/INSTALLATION.md), [BACKUP_RESTORE.md](docs/BACKUP_RESTORE.md), [API.md](docs/API.md)
- `docker-compose.yml` — สำหรับรันด้วย Docker Compose (MongoDB 7 + Backend + Frontend)
- `.env.example` — เทมเพลตการตั้งค่า Environment

---

## การติดตั้งและเริ่มต้นใช้งาน (Node.js + MongoDB ไม่ต้องใช้ Docker)

1. ติดตั้ง **MongoDB Community Server** และเปิดโหมด Single-Node Replica Set (`rs0`) ในไฟล์ `mongod.cfg` *(จำเป็นสำหรับ Prisma ORM บน MongoDB)*:
   - เพิ่มค่า `replication: { replSetName: "rs0" }` ใน `mongod.cfg` แล้ว Restart Service `MongoDB`
2. ติดตั้ง Dependencies, สร้างไฟล์ `.env`, ตั้งค่า Replica Set (`rs0`), Push Schema และ Seed ข้อมูลตั้งต้น:
   ```bash
   npm run install:all
   npm run setup:db
   ```
3. รันระบบในโหมดพัฒนา (Development):
   ```bash
   npm run dev
   ```
   หรือ Build และรันในโหมดใช้งานจริง (Production):
   ```bash
   npm run build
   npm start
   ```
4. เปิดเบราว์เซอร์ไปที่ `http://localhost:3000/setup` เพื่อสร้างบัญชี **Super Admin** คนแรกอย่างปลอดภัย
5. รันชุดทดสอบ Backend (Unit & Integration Tests):
   ```bash
   npm test
   ```

---

## การติดตั้งบน Windows Server และการอัปเดตแพตช์ (Production & Patch Upgrade)

### 1. ติดตั้ง Production Server ครั้งแรก (Windows Startup Task)
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-windows-server.ps1 -InstallStartupTask -OpenFirewall
```
*(หากต้องการ Lock Firewall / NTFS Permissions / TLS Proxy บนวง LAN เพิ่มเติม ให้รัน `scripts\harden-windows-lan.ps1` ตามด้วย)*

### 2. อัปเดตแพตช์ลง Server จริง (`C:\nims-production-offline`)
นำไฟล์ `nims-production-patch.zip` ไปวางไว้ที่ `C:\nims-production-patch.zip` บน Server จากนั้นเปิด **Windows PowerShell (Run as Administrator)** แล้วรัน:
```powershell
$wd = "C:\nims-production-offline"
Stop-ScheduledTask -TaskName "NIMS Production Server" -ErrorAction SilentlyContinue
Stop-ScheduledTask -TaskName "NIMS HTTPS Proxy" -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*nims*" -or $_.CommandLine -like "*next*" -or $_.CommandLine -like "*dist/index.js*" -or $_.CommandLine -like "*dist\index.js*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
Remove-Item (Join-Path $wd "frontend\.next") -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $wd "backend\dist") -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive -Path "C:\nims-production-patch.zip" -DestinationPath $wd -Force
Start-ScheduledTask -TaskName "NIMS Production Server"
Start-ScheduledTask -TaskName "NIMS HTTPS Proxy"
Start-Sleep -Seconds 4
Get-NetTCPConnection -LocalPort 3000,3001,4000 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalAddress, LocalPort, State, OwningProcess
```
*(คำสั่งนี้จะเก็บ `.env`, `node_modules`, `data/` และฐานข้อมูลเดิมบน Server ไว้ครบ จากนั้นกด `Ctrl+F5` บนเบราว์เซอร์หลังพอร์ต `3000`, `3001`, `4000` แสดงสถานะ `Listen`)*

---

## ผู้พัฒนาและลิขสิทธิ์ (Author & License)

- **Developed & Maintained by:** AUTOMOTIONWORKS
- **Copyright & License:** © 2026 AUTOMOTIONWORKS. All Rights Reserved. กรุณาดูรายละเอียดในไฟล์ [LICENSE](LICENSE)

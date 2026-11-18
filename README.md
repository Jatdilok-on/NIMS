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
  - เชื่อมโยง IP ของอุปกรณ์จาก Device Inventory เข้าสู่ Subnet ให้อัตโนมัติ มีระบบตรวจจับ IP ที่ยังไม่มี Subnet รองรับ และปุ่ม Auto-Create `/24` Subnets & Sync รวมถึงแก้ไขข้อมูล Subnet (`Edit Subnet`) ได้โดยตรง

- **เครื่องมือจัดการและวาดผังเครือข่าย (Network Diagram Engine)**
  - รองรับการอัปโหลดและพรีวิวไฟล์ `PNG`, `JPG`, `SVG`, `PDF` (หลายหน้า), `.drawio`, `.xml` และ Visio `.vsdx` (แปลงเป็น SVG อัตโนมัติฝั่ง Server) รวมถึงเก็บประวัติเวอร์ชันและกู้คืนเวอร์ชันเดิมได้
  - ตัวแก้ไขผังเครือข่ายบนเว็บ (`@xyflow/react`) ลากวางอุปกรณ์จริงจาก Inventory หรือ Shape มาตรฐาน เชื่อมสาย LAN/Fiber/Wireless ระบุพอร์ต/VLAN/ความเร็ว ตั้งภาพพื้นหลัง (Floor Plan) แบบตรึงพิกัด เดินเส้นหลบอุปกรณ์อัตโนมัติ (Orthogonal Routing) Sync สถานะกลับสู่ Inventory แบบเรียลไทม์ และส่งออกเป็น `PNG` / `.drawio` / `.json`

- **ห้องนิรภัยเก็บรหัสผ่าน (Access Management / Credentials Vault)**
  - เข้ารหัสชื่อผู้ใช้และรหัสผ่านด้วย **AES-256-GCM** แยกคีย์ `CREDENTIALS_ENCRYPTION_KEY` บันทึกประวัติทุกครั้งที่มีการกดดูหรือคัดลอก และบังคับบล็อกสิทธิ์ `IP_VIEWER` (`403`) จากฝั่ง Backend

- **เอกสารโครงการ (Project Documents) และประวัติบำรุงรักษา (Maintenance History)**
  - จัดเก็บเอกสารแยกหมวดหมู่ มีระบบอัปเดตเวอร์ชันและดาวน์โหลดย้อนหลัง รวมถึงบันทึกประวัติงานซ่อมบำรุง/อัปเกรดเฟิร์มแวร์

- **ระบบผู้ใช้งาน, สิทธิ์ (RBAC) และ Audit Logs**
  - รองรับ Role 5 ระดับ: `SUPER_ADMIN`, `SITE_ADMIN`, `NETWORK_ENGINEER`, `VIEWER`, `IP_VIEWER` พร้อมกำหนดสิทธิ์ราย Site และรายโมดูล (รองรับ Bulk Assign)
  - รองรับการเพิ่มผู้ใช้งานจำนวนมากด้วยการ Import Excel / CSV และบังคับเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งแรก (`First-Login Password Change`)
  - รองรับเปลี่ยนภาษาหน้าเว็บ 4 ภาษา (`ไทย`, `English`, `中文`, `日本語`) และธีมสีหลายรูปแบบ

- **ระบบมอนิเตอร์สถานะอุปกรณ์แบบเรียลไทม์ (Site Ping Agents & Cross-Network Relay)**
  - ติดตั้ง Agent (`nims-agent.mjs`) แบบ 1-Click เพื่อ Ping อุปกรณ์ภายในแต่ละ Site อัตโนมัติ พร้อมแสดงไฟ LED กระพริบ Up/Down, Latency (`ms`) และแสงวิ่งบนสาย Link Cable ในหน้า Network Diagram
  - รองรับทั้ง Site วง LAN เดียวกัน และ **Site คนละวงเน็ต (Cross-Network)** โดยใช้ **Notebook Bridge + Cloudflare Workers & D1 Relay** สำหรับกรณี Server ออกเน็ตไม่ได้และไม่ต้องการเปิด Port Firewall
  - ดูผังสถาปัตยกรรม, Flow การทำงานทั้งหมด และตัวเลขการรองรับ (Capacity) สำหรับนำเสนอได้ที่ [docs/PRESENTATION_FLOW.md](docs/PRESENTATION_FLOW.md)

- **สำรองและกู้คืนข้อมูล (Backup & Restore)**
  - สร้างไฟล์สำรองแบบ ZIP ที่รวม Snapshot ฐานข้อมูล MongoDB, ไฟล์อัปโหลดทั้งหมด และ SHA-256 Manifest ทั้งแบบกดสำรองเองและตั้งเวลาอัตโนมัติ (รายวัน/รายสัปดาห์/รายเดือน)

---

## โครงสร้างโปรเจกต์

- `backend/` — Node.js + Express + TypeScript + Prisma ORM + MongoDB REST API (พอร์ต `4000`)
- `frontend/` — Next.js App Router + React + TypeScript + Tailwind CSS + React Flow (พอร์ต `3000`)
- `scripts/run-nims.mjs` — สคริปต์รันระบบด้วย Node.js โดยตรง (ไม่ต้องใช้ Docker)
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

---

## ผู้พัฒนาและลิขสิทธิ์ (Author & License)

- **Developed & Maintained by:** AUTOMOTIONWORKS
- **Copyright & License:** © 2026 AUTOMOTIONWORKS. All Rights Reserved. กรุณาดูรายละเอียดในไฟล์ [LICENSE](LICENSE)

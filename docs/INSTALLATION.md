# คู่มือการติดตั้งและนำระบบ NIMS ขึ้นใช้งาน (Installation & Deployment Guide)

## 1. ความต้องการของระบบ (Prerequisites)

- **เครื่องเซิร์ฟเวอร์ (On-Premise):** Windows 10/11, Windows Server 2019/2022 หรือ Ubuntu/Debian/RHEL Linux Server
- **Runtime:** Node.js v20+ (แนะนำ LTS v20 / v22 / v24 พร้อม `npm`)
- **ฐานข้อมูล:** MongoDB Community Server 7+ (ตั้งค่าเป็น Single-Node Replica Set ชื่อ `rs0` ตามข้อกำหนดของ Prisma ORM) หรือ MongoDB Atlas
- **ทางเลือก Container (ไม่บังคับ):** Docker Engine 24+ และ Docker Compose v2+

---

## 2. เปิดใช้งาน Single-Node Replica Set (`rs0`) บน MongoDB

Prisma ORM จำเป็นต้องใช้ MongoDB Replica Set (หากไม่ได้เปิด จะพบ error `P2031`):

1. เปิดไฟล์ตั้งค่า MongoDB (`C:\Program Files\MongoDB\Server\<version>\bin\mongod.cfg` บน Windows หรือ `/etc/mongod.conf` บน Linux) แล้วเพิ่มส่วนนี้:
   ```yaml
   replication:
     replSetName: "rs0"
   ```
2. รีสตาร์ตบริการ MongoDB (`Restart-Service MongoDB` ใน PowerShell สิทธิ์ Administrator บน Windows หรือ `sudo systemctl restart mongod` บน Linux)
3. สั่ง Initialize Replica Set ครั้งแรกผ่าน Node.js (ไม่ต้องใช้ `mongosh`):
   ```bash
   npm run mongo:init-rs
   ```
   *(หรือรัน `npm run setup:db` โดยตรง ซึ่งจะตั้งค่า `rs0` ให้อัตโนมัติอยู่แล้ว)*

---

## 3. ตั้งค่าไฟล์ `.env` และคีย์เข้ารหัส (Environment & Secrets)

คัดลอก `.env.example` เป็น `.env` (หรือรัน `npm run setup:db` เพื่อสร้าง `.env` พร้อมสุ่มคีย์ความปลอดภัยให้อัตโนมัติ):
- `DATABASE_URL` — เช่น `mongodb://127.0.0.1:27017/nims?replicaSet=rs0&directConnection=true`
- `JWT_SECRET` — คีย์ Hex 64 ตัวอักษร สำหรับเซ็น Session Token ของผู้ใช้งาน
- `CREDENTIALS_ENCRYPTION_KEY` — คีย์ Hex 64 ตัวอักษร สำหรับเข้ารหัส Username/Password ใน Vault ด้วย **AES-256-GCM**
- `NODE_ENV` — ใช้ `production` เมื่อเปิดใช้งานจริงบน Server
- `CORS_ORIGIN` — URL ของหน้าเว็บที่ผู้ใช้เข้าใช้งาน เช่น `http://192.168.1.10:3000` หรือ `https://192.168.1.10:3001`
- `COOKIE_SECURE` — ตั้ง `true` เมื่อใช้งานผ่าน HTTPS และ `false` เมื่อใช้งานผ่าน HTTP ภายใน LAN
- `STORAGE_ROOT` / `BACKUP_ROOT` — โฟลเดอร์เก็บไฟล์อัปโหลด (ผัง/เอกสาร) และไฟล์สำรองข้อมูล `.zip`

คำสั่งสุ่มคีย์ 64-hex ด้วย Node.js:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> **สำคัญมาก:** ห้ามเก็บ `CREDENTIALS_ENCRYPTION_KEY` ไว้ในฐานข้อมูล ให้สำรองไฟล์ `.env` หรือคีย์นี้ไว้แยกต่างหากในที่ปลอดภัย มิฉะนั้นจะไม่สามารถถอดรหัส Vault เมื่อย้ายเครื่องหรือกู้คืน Backup ได้

---

## 4. การติดตั้งและรันระบบ (Node.js โดยตรง — ไม่ต้องใช้ Docker)

1. ตรวจสอบว่า Service **MongoDB** กำลังทำงานอยู่ (`net start MongoDB` บน Windows หรือ `systemctl start mongod` บน Linux)
2. ติดตั้ง Dependencies, สร้าง `.env` (ถ้ายังไม่มี), Push Schema และ Seed ข้อมูลตั้งต้น:
   ```bash
   npm run install:all
   npm run setup:db
   ```
3. รันใน **โหมดพัฒนา (Development)** *(Hot-Reload ทั้ง Backend และ Frontend)*:
   ```bash
   npm run dev
   ```
   หรือ Build และรันใน **โหมดใช้งานจริง (Production)**:
   ```bash
   npm run build
   npm start
   ```
   *(บน Windows สามารถใช้สคริปต์ลัด `.\start-nims.ps1` หรือ `.\start-nims.ps1 -Mode start` สำหรับโหมด Production ได้)*

---

## 4ข. ทางเลือก: รันด้วย Docker Compose

1. คัดลอก `.env.example` เป็น `.env` แล้วกรอก `JWT_SECRET` และ `CREDENTIALS_ENCRYPTION_KEY`
2. Build และเปิดใช้งาน Container:
   ```bash
   docker compose up -d --build
   ```
   *(Container ของ Backend จะรัน `npx prisma db push` ให้อัตโนมัติเมื่อเริ่มต้น)*

---

## 5. การติดตั้งและอัปเดตบน Windows Server (Production & Patch Upgrade)

### ก. ติดตั้ง Production Server แบบอัตโนมัติ (Windows Scheduled Task)
รันใน **Windows PowerShell (Run as Administrator)** ภายในโฟลเดอร์โปรเจกต์:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-windows-server.ps1 -InstallStartupTask -OpenFirewall
```
สคริปต์จะตรวจสอบ MongoDB, สร้าง/รักษา `.env` เดิม, ข้าม `npm install`/`build` ให้อัตโนมัติหากเป็นแพ็กเกจ Offline, เปิด Firewall พอร์ต `3000`, และลงทะเบียน Windows Scheduled Task ชื่อ `"NIMS Production Server"` ให้รันอัตโนมัติเมื่อเปิดเครื่อง Server

หากต้องการตั้งค่าความปลอดภัยระดับ LAN เพิ่มเติม (จำกัด Firewall เฉพาะพอร์ตเว็บ, ล็อกสิทธิ์โฟลเดอร์ `.env`/`data`, หรือตั้งค่า Reverse Proxy HTTPS):
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\harden-windows-lan.ps1
```

### ข. อัปเดตแพตช์ลง Server จริง (`C:\nims-production-offline`)
เมื่อมีไฟล์ `nims-production-patch.zip` ใหม่ ให้นำไปวางไว้ที่ `C:\nims-production-patch.zip` บนเครื่อง Server จากนั้นเปิด **PowerShell (Run as Administrator)** แล้วรัน:
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
*(ขั้นตอนนี้อัปเดตเฉพาะโค้ดและไฟล์ Build โดยเก็บ `.env`, `node_modules`, `data/` และฐานข้อมูลเดิมไว้ทั้งหมด)*

---

## 6. การสร้างบัญชี Super Admin ครั้งแรก

ระบบจะไม่ฝัง Username/Password เริ่มต้นไว้ในโค้ดเพื่อความปลอดภัย ให้เลือกสร้างบัญชีผู้ดูแลคนแรกจาก 1 ใน 2 วิธี:

### วิธีที่ 1: ผ่านหน้าเว็บ Setup Wizard (แนะนำ)
1. เปิดเบราว์เซอร์ไปที่ `http://<SERVER_IP>:3000/setup`
2. กรอกชื่อองค์กร, ชื่อ-นามสกุล, Username, Email และรหัสผ่านที่มีความปลอดภัยสูง (อย่างน้อย 10 ตัวอักษร)
3. เมื่อสร้างเสร็จแล้ว หน้า `/setup` จะถูกล็อกถาวร (`403 Forbidden`)

### วิธีที่ 2: ผ่านคำสั่ง CLI Seed
```bash
cd backend
INITIAL_ADMIN_USERNAME=netadmin \
INITIAL_ADMIN_EMAIL=netadmin@company.local \
INITIAL_ADMIN_PASSWORD="ChangeMeStrong#2026" \
npm run seed:admin
```

---

## 7. ตั้งค่า HTTPS Reverse Proxy (แนะนำสำหรับใช้งานจริง)

ติดตั้ง Caddy, Nginx หรือ IIS Reverse Proxy ไว้หน้าพอร์ต `3000` (ดูตัวอย่างใน `scripts/Caddyfile.lan.example`) และอัปเดตใน `.env`:
- `COOKIE_SECURE=true`
- `CORS_ORIGIN=https://<SERVER_IP_OR_DOMAIN>`

---

## 8. ติดตั้งระบบมอนิเตอร์หน้างาน (Site Ping Agent & Cross-Network Relay)

- **Site วง LAN เดียวกับ Server หรือยิงตรงเข้า Server:** ดูคู่มือภาษาไทยใน [agent/README.md](../agent/README.md)
- **Site คนละวงเน็ต / Server ออกอินเทอร์เน็ตไม่ได้ (Cloudflare D1 Relay + Notebook Bridge):** ดูคู่มือภาษาไทยใน [agent/relay/README.md](../agent/relay/README.md)

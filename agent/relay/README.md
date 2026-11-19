# NIMS Cloudflare D1 HTTPS Relay (For Air-Gapped / Offline NIMS Server)

ชุดนี้ใช้สำหรับกรณีที่ **NIMS Server ออกอินเทอร์เน็ตไม่ได้** แต่มี **Notebook ตัวกลาง** ที่อยู่วง LAN เดียวกับ Server และออกอินเทอร์เน็ตฝั่งลูกค้าได้ (โดยไม่ต้อง Port Forward Router ลูกค้า)

---

## 1. สร้างฐานข้อมูล Cloudflare D1 (ฟรี 100,000 rows/วัน)
1. ใน Cloudflare Dashboard เมนูซ้ายคลิก **Storage & databases** → **D1 SQL database** → กด **Create** ตั้งชื่อ `nims-relay-db`
2. เปิดเข้าไปที่ `nims-relay-db` → แท็บ **Console** → วางคำสั่ง SQL จาก `schema.sql` แล้วกด **Execute**

## 2. สร้าง Cloudflare Worker
1. ไปที่ **Workers & Pages** → กดปุ่มสีฟ้า **Create application** → **Start with Hello World!** → ตั้งชื่อ `nims-relay` → **Deploy**
2. กด **Edit code** → ลบโค้ดตัวอย่างออกแล้ววางโค้ดจาก `cloudflare-worker.js` → กด **Deploy**
3. ไปที่แท็บ **Settings → Bindings / Variables and Secrets** ของ Worker `nims-relay`:
   - **Add binding** → เลือก **D1 database** → Variable name = `DB` → เลือก `nims-relay-db`
   - **Add variable / secret** → Name = `BRIDGE_SECRET` → ตั้งรหัสลับยาว ๆ ไว้ 1 ชุด
4. ทดสอบเปิดใน Browser: `https://nims-relay.<subdomain>.workers.dev/health` (ต้องขึ้น `{"ok":true,"service":"nims-cloudflare-relay"}`)

## 3. รัน Bridge บน Notebook ตัวกลาง (อยู่ในวง LAN เดียวกับ NIMS Server)

### วิธีที่ 1: ดาวน์โหลดสคริปต์ 1-Click Bridge จากหน้าเว็บ NIMS (แนะนำ)
1. เข้าเว็บ NIMS → **Sites** → แท็บ **Site Agents** → **+ Add Site Agent** → เลือกแท็บ **Remote (Cross-Network)**
2. ในส่วน **Step 1: Notebook Bridge** กรอก URL ของ Cloudflare Worker และ `BRIDGE_SECRET` แล้วกดดาวน์โหลด **1-Click Bridge Installer (`install-bridge.bat`)** ไปรันบน Notebook ตัวกลางได้เลย

### วิธีที่ 2: ติดตั้งจากโฟลเดอร์ `agent/relay/` ด้วยตนเอง
1. ก๊อปปี้โฟลเดอร์ `agent/relay/` ไปวางบน Notebook (เช่น `C:\nims-bridge`) แล้วเปลี่ยนชื่อ `nims-relay-bridge.env.example` เป็น `nims-relay-bridge.env`
2. กรอกค่าใน `nims-relay-bridge.env`:
   - `NIMS_URL=https://191.20.110.191:3000`
   - `NIMS_ALLOW_INSECURE_TLS=true`
   - `RELAY_URL=https://nims-relay.<subdomain>.workers.dev`
   - `BRIDGE_SECRET=<รหัสลับเดียวกับ Worker>`
   - *(เลือกใส่หรือไม่ใส่ก็ได้)* `NIMS_AGENT_TOKENS=<Token คั่นด้วย ,>` — หากเว้นว่าง Bridge จะดึงเฉพาะ Token ของ Remote Agent ที่เปิดใช้งานอยู่จาก Server อัตโนมัติ และหยุดส่งข้อมูลให้ Agent ที่ถูกลบ/ปิดใช้งานทันที
3. เลือกวิธีรันบน Notebook:
   - **แบบรันเบื้องหลังอัตโนมัติ (แนะนำ):** ดับเบิลคลิก **`install-bridge-background.bat`** (ซ่อนหน้าต่างทำงาน, ตั้งเปิดเครื่องรันเองอัตโนมัติ และสร้าง `view-bridge-log.bat` / `uninstall-bridge.bat` ให้พร้อม)
   - **แบบดูหน้าต่าง Console สด:** ดับเบิลคลิก **`start-bridge.bat`** หรือรัน `node nims-relay-bridge.mjs`

## 4. ติดตั้ง Agent ที่เครื่อง Site ปลายทาง (Site อื่น ๆ)
ดาวน์โหลด **Step 2: 1-Click Remote Agent Installer** จากหน้า **+ Add Site Agent → Remote** ไปรันบนเครื่องปลายทาง หรือวาง `agent/nims-agent.mjs` แล้วตั้ง `nims-agent.env`:
```env
NIMS_URL=https://nims-relay.<subdomain>.workers.dev
NIMS_AGENT_TOKEN=<Token ของ Site นั้น>
```
แล้วรัน `node nims-agent.mjs` — ผล Ping ของ Site ปลายทางจะไหลเข้า Cloudflare Worker และถูก Notebook ดึงมาโชว์บน Server `191.20.110.191` อัตโนมัติ! (หากกด Pause/Delete Agent ในหน้าเว็บ ข้อมูลค้างใน Worker/DB จะถูกล้างและสถานะ Ping บน Server จะถูกรีเซ็ตให้อัตโนมัติ)

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
1. ก๊อปปี้ `nims-relay-bridge.mjs` และ `nims-relay-bridge.env.example` ไปวางในโฟลเดอร์บน Notebook แล้วเปลี่ยนชื่อ `.env.example` เป็น `nims-relay-bridge.env`
2. กรอกค่าใน `nims-relay-bridge.env`:
   - `NIMS_URL=https://191.20.110.191:3000`
   - `NIMS_ALLOW_INSECURE_TLS=true`
   - `RELAY_URL=https://nims-relay.<subdomain>.workers.dev`
   - `BRIDGE_SECRET=<รหัสลับเดียวกับ Worker>`
   - `NIMS_AGENT_TOKENS=<Token ของแต่ละ Site ที่สร้างใน NIMS คั่นด้วยเครื่องหมาย ,>`
3. รันบน Notebook:
   ```powershell
   node nims-relay-bridge.mjs
   ```

## 4. ติดตั้ง Agent ที่เครื่อง Site ปลายทาง (Site อื่น ๆ)
วาง `agent/nims-agent.mjs` บนเครื่องของ Site ปลายทาง แล้วตั้ง `nims-agent.env`:
```env
NIMS_URL=https://nims-relay.<subdomain>.workers.dev
NIMS_AGENT_TOKEN=<Token ของ Site นั้น>
```
แล้วรัน `node nims-agent.mjs` — ผล Ping ของ Site ปลายทางจะไหลเข้า Cloudflare Worker และถูก Notebook ดึงมาโชว์บน Server `191.20.110.191` อัตโนมัติ!

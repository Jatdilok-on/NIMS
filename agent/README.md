# NIMS Site Ping Agent

โปรแกรม **Site Ping Agent** แบบไฟล์เดียวไม่ต้องติดตั้ง Library เพิ่ม (`npm install` ไม่จำเป็น ใช้แค่ **Node.js 18+**) สำหรับนำไปวางรันในวง LAN ของแต่ละ Site / โรงงานลูกค้า เพื่อ Ping ตรวจสอบสถานะ **UP / DOWN** ของอุปกรณ์ภายในไซต์นั้นแล้วส่งผลกลับมายัง NIMS Server ส่วนกลางผ่าน HTTP/HTTPS

## ข้อดีสำหรับหน้างานแยกวง / คนละสถานที่
- **ไม่ต้องเปิด Port Firewall ขาเข้า** เข้าไปที่ไซต์ลูกค้า (Agent เป็นฝ่ายส่งผล HTTPS ขาออกกลับมาอย่างเดียว)
- **IP ซ้ำกันระหว่างคนละ Site ไม่ชน** เพราะ Agent ผูกกับ Token ของ Site ตัวเอง
- มีระบบ **Consecutive Miss Threshold** (เช่น Ping ไม่ตอบ 3 รอบติดค่อยเปลี่ยนเป็น `OFFLINE`) ป้องกันสถานะแกว่ง
- อุปกรณ์ที่ตั้งสถานะเป็น `MAINTENANCE` จะไม่ถูกเขียนทับเป็น `ONLINE` / `OFFLINE` โดยอัตโนมัติ

---

## วิธีติดตั้งและรันใช้งาน (3 ขั้นตอน)

1. เข้าเว็บ NIMS -> เปิดเมนู **Sites** -> เลือกไซต์ที่ต้องการ -> แท็บ **Site Agents**
2. กด **+ Add Site Agent** ตั้งชื่อ Agent (เช่น `Rayong-Plant-Probe`) แล้วคัดลอก **Agent Token** หรือกดดาวน์โหลดไฟล์ `nims-agent.mjs` และ `nims-agent.env`
3. นำไฟล์ทั้ง 2 ไปวางในโฟลเดอร์เดียวกันบนเครื่อง Server / Mini PC หน้างาน แล้วรันคำสั่ง:

### ทดสอบยิง 1 รอบ (`--once`)
```bash
node nims-agent.mjs --once
```

### รันต่อเนื่องหน้างาน (ใช้ PM2 หรือ Terminal)
```bash
node nims-agent.mjs
```
หรือแนะนำให้รันด้วย **PM2** เพื่อเปิดเครื่องแล้วรันอัตโนมัติ:
```bash
npm install -g pm2
pm2 start nims-agent.mjs --name nims-site-agent
pm2 save
```

---

## ตัวแปรตั้งค่าใน `nims-agent.env`

```env
NIMS_URL=http://191.20.110.191:3000
NIMS_AGENT_TOKEN=nims_agt_xxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ตัวเลือกเพิ่มเติม (ไม่บังคับ)
NIMS_PING_TIMEOUT_MS=2000
NIMS_CONCURRENCY=15
# หากบางเครื่องปิด ICMP Ping ให้ลองเช็ค TCP Port แทนเมื่อ Ping ไม่ตอบ
NIMS_FALLBACK_TCP_PORTS=22,80,443,3389,502,9100
# เปิดเป็น true กรณี NIMS Server ใช้ HTTPS Self-Signed Certificate ในวง LAN
NIMS_ALLOW_INSECURE_TLS=false
```

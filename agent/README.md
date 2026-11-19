> 🌐 **Language:** **🇹🇭 ภาษาไทย** | [🇺🇸 English](README.en.md)

# NIMS Site Ping Agent

โปรแกรม **Site Ping Agent** แบบไฟล์เดียวไม่ต้องติดตั้ง Library เพิ่ม (`npm install` ไม่จำเป็น ใช้แค่ **Node.js 18+**) สำหรับนำไปวางรันในวง LAN ของแต่ละ Site / โรงงานลูกค้า เพื่อ Ping ตรวจสอบสถานะ **UP / DOWN** ของอุปกรณ์ภายในไซต์นั้นแล้วส่งผลกลับมายัง NIMS Server ส่วนกลางผ่าน HTTP/HTTPS

## จุดเด่นสำหรับการมอนิเตอร์หน้างาน (LAN & Cross-Network)
- **รองรับทั้งวง LAN เดียวกัน และคนละวงเน็ต (Cross-Network)** ผ่านตัวเลือกในหน้า **+ Add Site Agent** เดียวกัน
- **ไม่ต้องเปิด Port Firewall ขาเข้า** เข้าไปที่ไซต์ลูกค้า (Agent เป็นฝ่ายส่งผล HTTP/HTTPS ขาออกกลับมาอย่างเดียว หรือส่งผ่าน Cloudflare Relay สำหรับเครื่อง Server ที่ออกเน็ตไม่ได้ ดูเพิ่มใน [agent/relay/README.md](relay/README.md))
- **IP ซ้ำกันระหว่างคนละ Site ไม่ชน** เพราะ Agent ผูกกับ Token ของ Site ตัวเอง
- มีระบบ **Consecutive Miss Threshold** (เช่น Ping ไม่ตอบ 3 รอบติดค่อยเปลี่ยนเป็น `OFFLINE`) ป้องกันสถานะแกว่ง
- หาก Agent หยุดส่งผลหรือถูกลบ สถานะ Ping ค้างเดิมของอุปกรณ์ใน Site จะถูกรีเซ็ตกลับเป็นปกติอัตโนมัติ
- อุปกรณ์ที่ตั้งสถานะเป็น `MAINTENANCE` จะไม่ถูกเขียนทับเป็น `ONLINE` / `OFFLINE` โดยอัตโนมัติ

---

## วิธีติดตั้งและรันใช้งาน

### วิธีที่ 1: ติดตั้งแบบ 1-Click Installer จากหน้าเว็บ (แนะนำ)
1. เข้าเว็บ NIMS -> เปิดเมนู **Sites** -> เลือกไซต์ที่ต้องการ -> แท็บ **Site Agents**
2. กด **+ Add Site Agent** ตั้งชื่อ Agent และเลือกโหมดการเชื่อมต่อ (**LAN Direct** หรือ **Remote Cross-Network**)
3. กดดาวน์โหลด **1-Click Installer (`.bat`)** แล้วนำไปวางบนเครื่องหน้างานและดับเบิลคลิกเพื่อติดตั้งและรันเบื้องหลังอัตโนมัติ

### วิธีที่ 2: รันด้วย Node.js ด้วยตนเอง (`nims-agent.mjs` + `nims-agent.env`)
1. คัดลอก **Agent Token** หรือกดดาวน์โหลดไฟล์ `nims-agent.mjs` และ `nims-agent.env` จากหน้า **Site Agents**
2. นำไฟล์ทั้ง 2 ไปวางในโฟลเดอร์เดียวกันบนเครื่อง Server / Mini PC หน้างาน แล้วรันคำสั่ง:

### ทดสอบยิง 1 รอบ (`--once`)
```bash
node nims-agent.mjs --once
```

### รันต่อเนื่องหน้างาน (ใช้ PM2 หรือ Terminal)
```bash
node nims-agent.mjs
```
*(สามารถระบุไฟล์ config แยกได้ด้วย `--config path/to/nims-agent.env`)*
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

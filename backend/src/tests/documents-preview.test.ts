import ExcelJS from 'exceljs';
import archiver from 'archiver';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { DocumentCategory, RoleCode } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import { env } from '../config/env';
import { hashToken } from '../lib/crypto';
import { generateDocumentPreview } from '../lib/documentPreview';
import { prisma } from '../lib/prisma';
import { buildContentDispositionHeader, normalizeUtf8FileName } from '../lib/storage';

async function buildSampleDocxBuffer(): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('data', (c: Buffer) => chunks.push(c));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);

    const relsXml = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/nims" TargetMode="External"/>
</Relationships>`;

    const docXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>คู่มือเปลี่ยน IP Address</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr>
      <w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">ขั้นตอนที่ 1: </w:t></w:r>
      <w:r><w:t>ตรวจสอบ Switch หลัก</w:t></w:r>
    </w:p>
    <w:tbl>
      <w:tr>
        <w:trPr><w:tblHeader/></w:trPr>
        <w:tc><w:p><w:r><w:t>Device</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>IP</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>RGV-01</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:hyperlink r:id="rId1"><w:r><w:t>192.168.10.21</w:t></w:r></w:hyperlink></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`;

    archive.append(relsXml, { name: 'word/_rels/document.xml.rels' });
    archive.append(docXml, { name: 'word/document.xml' });
    archive.finalize();
  });
}

describe('UTF-8 Filename Normalization & Office Document Preview', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('decodes Multer latin1-garbled Thai filenames back to UTF-8 without altering valid Unicode', () => {
    const originalThai = 'MRK - Replace IP Address - เปลี่ยน IP AddressRev1.0.docx';
    const garbledFromMulter = Buffer.from(originalThai, 'utf8').toString('latin1');
    expect(garbledFromMulter).not.toBe(originalThai);

    expect(normalizeUtf8FileName(garbledFromMulter)).toBe(originalThai);
    expect(normalizeUtf8FileName(originalThai)).toBe(originalThai);
    expect(normalizeUtf8FileName('VNC_Password_Rotation_2_Weeks.xlsx')).toBe(
      'VNC_Password_Rotation_2_Weeks.xlsx',
    );

    const header = buildContentDispositionHeader('attachment', garbledFromMulter);
    expect(header).toContain("filename*=UTF-8''");
    expect(header).toContain(encodeURIComponent('เปลี่ยน'));
  });

  it('generates multi-sheet spreadsheet preview for XLSX files', async () => {
    const wb = new ExcelJS.Workbook();
    const s1 = wb.addWorksheet('IP Plan');
    s1.addRow(['Device', 'IP Address', 'หมายเหตุ']);
    s1.getRow(1).font = { bold: true };
    s1.addRow(['PLC-Main', '192.168.80.10', { formula: '1+1', result: 2 }]);
    const s2 = wb.addWorksheet('Notes');
    s2.addRow(['การหมุนรหัสผ่าน VNC']);

    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const preview = await generateDocumentPreview(buf, 'VNC_Password_Rotation.xlsx');

    expect(preview.kind).toBe('spreadsheet');
    if (preview.kind === 'spreadsheet') {
      expect(preview.sheets).toHaveLength(2);
      expect(preview.sheets[0].name).toBe('IP Plan');
      expect(preview.sheets[0].rows[0][2].text).toBe('หมายเหตุ');
      expect(preview.sheets[0].rows[0][0].bold).toBe(true);
      expect(preview.sheets[0].rows[1][2].text).toBe('2');
      expect(preview.sheets[1].rows[0][0].text).toBe('การหมุนรหัสผ่าน VNC');
    }
  });

  it('generates structured block preview for DOCX files with headings, lists, and tables', async () => {
    const buf = await buildSampleDocxBuffer();
    const preview = await generateDocumentPreview(buf, 'เปลี่ยน IP Address.docx');

    expect(preview.kind).toBe('word');
    if (preview.kind === 'word') {
      expect(preview.blocks[0]).toMatchObject({ type: 'heading', level: 1 });
      expect(preview.blocks[1]).toMatchObject({ type: 'paragraph', isList: true });
      if (preview.blocks[1].type === 'paragraph') {
        expect(preview.blocks[1].runs[0]).toMatchObject({ text: 'ขั้นตอนที่ 1: ', bold: true });
        expect(preview.blocks[1].runs[1].text).toBe('ตรวจสอบ Switch หลัก');
      }
      expect(preview.blocks[2].type).toBe('table');
      if (preview.blocks[2].type === 'table') {
        expect(preview.blocks[2].rows[0].isHeader).toBe(true);
        expect(preview.blocks[2].rows[1].cells[1].blocks[0].runs[0]).toMatchObject({
          text: '192.168.10.21',
          href: 'https://example.com/nims',
        });
      }
    }
  });

  it('returns clear LEGACY_OFFICE notice for old binary .xls and .doc formats', async () => {
    const xlsPreview = await generateDocumentPreview(Buffer.from('dummy'), 'legacy.xls');
    expect(xlsPreview.kind).toBe('unsupported');
    if (xlsPreview.kind === 'unsupported') {
      expect(xlsPreview.reason).toBe('LEGACY_OFFICE');
    }
  });

  it('allows updating document location (siteId/category) and name via PUT /api/documents/:id with RBAC', async () => {
    const app = createApp();
    const rawJwt = jwt.sign(
      { sub: 'u-doc-1', sid: 'sess-doc-1', role: RoleCode.SITE_ADMIN },
      env.jwtSecret,
      { expiresIn: '1h' },
    );

    vi.spyOn(prisma.session, 'findUnique').mockResolvedValue({
      id: 'sess-doc-1',
      userId: 'u-doc-1',
      tokenHash: hashToken(rawJwt),
      ipAddress: '127.0.0.1',
      userAgent: 'vitest',
      expiresAt: new Date(Date.now() + 3600_000),
      revokedAt: null,
      createdAt: new Date(),
      user: {
        id: 'u-doc-1',
        username: 'siteadmin',
        email: 'sa@nims.local',
        fullName: 'Site Admin',
        passwordHash: 'hash',
        roleId: 'role-sa',
        isActive: true,
        mustChangePassword: false,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        role: {
          id: 'role-sa',
          code: RoleCode.SITE_ADMIN,
          name: 'Site Admin',
          description: null,
          isSystem: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        sitePermissions: [
          { siteId: 'site-1', canEditDocuments: true, canViewDocuments: true },
          { siteId: 'site-2', canEditDocuments: false, canViewDocuments: true },
        ],
      },
    } as never);

    vi.spyOn(prisma.document, 'findUnique').mockResolvedValue({
      id: 'doc-1',
      siteId: 'site-1',
      documentName: 'Old Name',
      documentType: 'XLSX',
      category: DocumentCategory.NETWORK_DESIGN,
      filePath: 'sites/AAI/documents/missing.xlsx',
      originalFileName: 'test.xlsx',
      site: { id: 'site-1', siteCode: 'AAI' },
      versions: [],
    } as never);

    // Moving to unauthorized target site must be denied (403)
    const deniedMove = await request(app)
      .put('/api/documents/doc-1')
      .set('Authorization', `Bearer ${rawJwt}`)
      .send({ siteId: 'site-2' });
    expect(deniedMove.status).toBe(403);

    // Updating folder/category & document name within allowed site succeeds (200)
    const updSpy = vi.spyOn(prisma.document, 'update').mockResolvedValue({ id: 'doc-1' } as never);
    vi.spyOn(prisma.document, 'findUniqueOrThrow').mockResolvedValue({
      id: 'doc-1',
      siteId: 'site-1',
      documentName: 'เปลี่ยนชื่อเอกสารแล้ว',
      originalFileName: 'test.xlsx',
      category: DocumentCategory.INSTALLATION_REPORT,
      site: { id: 'site-1', siteCode: 'AAI', siteName: 'AAI Site' },
      uploadedBy: { id: 'u-doc-1', username: 'siteadmin', fullName: 'Site Admin' },
      versions: [],
    } as never);
    vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as never);

    const okRes = await request(app)
      .put('/api/documents/doc-1')
      .set('Authorization', `Bearer ${rawJwt}`)
      .send({
        documentName: 'เปลี่ยนชื่อเอกสารแล้ว',
        category: DocumentCategory.INSTALLATION_REPORT,
      });

    expect(okRes.status).toBe(200);
    expect(okRes.body.document.category).toBe(DocumentCategory.INSTALLATION_REPORT);
    expect(okRes.body.document.documentName).toBe('เปลี่ยนชื่อเอกสารแล้ว');
    expect(updSpy).toHaveBeenCalledTimes(1);
  });
});

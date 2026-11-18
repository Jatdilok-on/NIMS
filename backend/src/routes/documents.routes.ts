import path from 'path';
import { Router } from 'express';
import multer from 'multer';
import { DocumentCategory, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { getPermittedSiteIds, hasSitePermission } from '../middleware/rbac';
import {
  ALLOWED_DOCUMENT_EXTENSIONS,
  deleteStoredFile,
  isAllowedExtension,
  readStoredFile,
  resolveSafeMimeType,
  saveSiteFile,
} from '../lib/storage';
import { recordAuditLog } from '../lib/audit';

const router = Router();
router.use(authenticate);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

router.get('/', async (req, res, next) => {
  try {
    const siteId = typeof req.query.siteId === 'string' ? req.query.siteId : undefined;
    const category =
      typeof req.query.category === 'string' && req.query.category in DocumentCategory
        ? (req.query.category as DocumentCategory)
        : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    const permitted = getPermittedSiteIds(req.user!, 'canViewDocuments');
    if (siteId && permitted !== null && !permitted.includes(siteId)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const where: Prisma.DocumentWhereInput = {};
    if (siteId) where.siteId = siteId;
    else if (permitted !== null) where.siteId = { in: permitted };
    if (category) where.category = category;
    if (search) {
      where.OR = [
        { documentName: { contains: search, mode: 'insensitive' } },
        { projectName: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { originalFileName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const documents = await prisma.document.findMany({
      where,
      include: {
        site: { select: { id: true, siteCode: true, siteName: true } },
        uploadedBy: { select: { id: true, username: true, fullName: true } },
        versions: {
          orderBy: { versionNumber: 'desc' },
          include: { uploadedBy: { select: { id: true, username: true, fullName: true } } },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({ documents });
  } catch (err) {
    next(err);
  }
});

router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Document file is required' });
      return;
    }

    const siteId = String(req.body.siteId || '');
    if (!siteId) {
      res.status(400).json({ error: 'siteId is required' });
      return;
    }
    if (!hasSitePermission(req.user!, siteId, 'canEditDocuments')) {
      res.status(403).json({ error: 'Permission denied to upload documents to this site' });
      return;
    }
    if (!isAllowedExtension(req.file.originalname, ALLOWED_DOCUMENT_EXTENSIONS)) {
      res.status(400).json({ error: 'File type is not permitted' });
      return;
    }

    const site = await prisma.site.findUnique({ where: { id: siteId } });
    if (!site) {
      res.status(404).json({ error: 'Site not found' });
      return;
    }

    const projectId = req.body.projectId ? String(req.body.projectId).trim() : null;
    if (projectId) {
      const project = await prisma.project.findFirst({ where: { id: projectId, siteId } });
      if (!project) {
        res.status(400).json({ error: 'Referenced projectId does not belong to this site' });
        return;
      }
    }

    const categoryRaw = String(req.body.category || 'OTHER');
    const category =
      categoryRaw in DocumentCategory
        ? (categoryRaw as DocumentCategory)
        : DocumentCategory.OTHER;

    const documentName = String(req.body.documentName || req.file.originalname).trim();
    const versionLabel = String(req.body.version || '1.0').trim();
    const ext = path.extname(req.file.originalname).replace('.', '').toUpperCase() || 'FILE';
    const safeMime = resolveSafeMimeType(req.file.originalname);

    const saved = saveSiteFile(
      site.siteCode,
      'documents',
      req.file.originalname,
      req.file.buffer,
    );

    const created = await prisma.document.create({
      data: {
        siteId,
        projectId,
        documentName,
        documentType: ext,
        category,
        projectName: req.body.projectName ? String(req.body.projectName).trim() : null,
        description: req.body.description ? String(req.body.description).trim() : null,
        currentVersion: versionLabel,
        versionNumber: 1,
        filePath: saved.relativePath,
        originalFileName: req.file!.originalname,
        mimeType: safeMime,
        fileSize: saved.fileSize,
        uploadedById: req.user!.id,
        responsiblePerson: req.body.responsiblePerson
          ? String(req.body.responsiblePerson).trim()
          : null,
        remark: req.body.remark ? String(req.body.remark).trim() : null,
      },
    });

    await prisma.documentVersion.create({
      data: {
        documentId: created.id,
        versionNumber: 1,
        versionLabel,
        filePath: saved.relativePath,
        originalFileName: req.file!.originalname,
        mimeType: safeMime,
        fileSize: saved.fileSize,
        changeNote: req.body.changeNote ? String(req.body.changeNote) : 'Initial upload',
        uploadedById: req.user!.id,
      },
    });

    const doc = await prisma.document.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        site: { select: { id: true, siteCode: true, siteName: true } },
        uploadedBy: { select: { id: true, username: true, fullName: true } },
        versions: true,
      },
    });

    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'UPLOAD_DOCUMENT',
      module: 'DOCUMENT',
      siteId: site.id,
      siteCode: site.siteCode,
      details: { documentId: doc.id, documentName: doc.documentName, category: doc.category },
    });

    res.status(201).json({ document: doc });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/replace', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Replacement file is required' });
      return;
    }

    const existing = await prisma.document.findUnique({
      where: { id: String(req.params.id) },
      include: { site: { select: { siteCode: true } } },
    });
    if (!existing) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    if (!hasSitePermission(req.user!, existing.siteId, 'canEditDocuments')) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }
    if (!isAllowedExtension(req.file.originalname, ALLOWED_DOCUMENT_EXTENSIONS)) {
      res.status(400).json({ error: 'File type is not permitted' });
      return;
    }

    const nextVerNum = existing.versionNumber + 1;
    const nextVerLabel = req.body.version
      ? String(req.body.version).trim()
      : `${nextVerNum}.0`;
    const ext = path.extname(req.file.originalname).replace('.', '').toUpperCase() || 'FILE';
    const safeMime = resolveSafeMimeType(req.file.originalname);

    const saved = saveSiteFile(
      existing.site.siteCode,
      'documents',
      req.file.originalname,
      req.file.buffer,
    );

    const doc = await prisma.document.update({
      where: { id: existing.id },
      data: {
        documentType: ext,
        currentVersion: nextVerLabel,
        versionNumber: nextVerNum,
        filePath: saved.relativePath,
        originalFileName: req.file!.originalname,
        mimeType: safeMime,
        fileSize: saved.fileSize,
        uploadedById: req.user!.id,
      },
    });

    await prisma.documentVersion.create({
      data: {
        documentId: existing.id,
        versionNumber: nextVerNum,
        versionLabel: nextVerLabel,
        filePath: saved.relativePath,
        originalFileName: req.file!.originalname,
        mimeType: safeMime,
        fileSize: saved.fileSize,
        changeNote: req.body.changeNote
          ? String(req.body.changeNote)
          : `Replaced file (v${nextVerLabel})`,
        uploadedById: req.user!.id,
      },
    });

    const updated = await prisma.document.findUniqueOrThrow({
      where: { id: doc.id },
      include: {
        site: { select: { id: true, siteCode: true, siteName: true } },
        versions: { orderBy: { versionNumber: 'desc' } },
      },
    });

    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'REPLACE_DOCUMENT',
      module: 'DOCUMENT',
      siteId: existing.siteId,
      siteCode: existing.site.siteCode,
      details: { documentId: existing.id, version: nextVerLabel },
    });

    res.json({ document: updated });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/download', async (req, res, next) => {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id },
      include: { site: { select: { siteCode: true } } },
    });
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    if (!hasSitePermission(req.user!, doc.siteId, 'canViewDocuments')) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    let versionParam: number | null = null;
    if (req.query.version !== undefined) {
      const parsedVer = parseInt(String(req.query.version), 10);
      if (Number.isNaN(parsedVer) || parsedVer < 1) {
        res.status(400).json({ error: 'Invalid document version parameter' });
        return;
      }
      versionParam = parsedVer;
    }
    let targetPath = doc.filePath;
    let targetName = doc.originalFileName;

    if (versionParam !== null) {
      const ver = await prisma.documentVersion.findUnique({
        where: { documentId_versionNumber: { documentId: doc.id, versionNumber: versionParam } },
      });
      if (!ver) {
        res.status(404).json({ error: 'Document version not found' });
        return;
      }
      targetPath = ver.filePath;
      targetName = ver.originalFileName;
    }

    const buf = readStoredFile(targetPath);
    const inline = req.query.inline === '1';
    const targetExt = path.extname(targetName).toLowerCase();
    const safeMime = resolveSafeMimeType(targetName);
    const isPdf = targetExt === '.pdf';
    const isSvg = targetExt === '.svg';
    const allowInline =
      inline &&
      (isPdf ||
        isSvg ||
        safeMime.startsWith('image/') ||
        safeMime.startsWith('text/') ||
        safeMime.startsWith('application/json'));

    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: inline ? 'PREVIEW_DOCUMENT' : 'DOWNLOAD_DOCUMENT',
      module: 'DOCUMENT',
      siteId: doc.siteId,
      siteCode: doc.site.siteCode,
      details: { documentId: doc.id, documentName: doc.documentName },
    });

    res.setHeader('Content-Type', safeMime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (allowInline) {
      res.setHeader(
        'Content-Security-Policy',
        isPdf
          ? "default-src 'none'; script-src 'none'; object-src 'self'"
          : "default-src 'none'; sandbox; style-src 'unsafe-inline'; img-src 'self' data:",
      );
    }
    res.setHeader(
      'Content-Disposition',
      `${allowInline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(targetName)}"`,
    );
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id },
      include: { site: { select: { siteCode: true } }, versions: true },
    });
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    if (!hasSitePermission(req.user!, doc.siteId, 'canDeleteDocuments')) {
      res.status(403).json({ error: 'Permission denied to delete documents' });
      return;
    }

    for (const v of doc.versions) {
      deleteStoredFile(v.filePath);
    }
    deleteStoredFile(doc.filePath);

    await prisma.document.delete({ where: { id: doc.id } });

    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'DELETE_DOCUMENT',
      module: 'DOCUMENT',
      siteId: doc.siteId,
      siteCode: doc.site.siteCode,
      details: { documentId: doc.id, documentName: doc.documentName },
    });

    res.json({ message: 'Document deleted' });
  } catch (err) {
    next(err);
  }
});

export default router;

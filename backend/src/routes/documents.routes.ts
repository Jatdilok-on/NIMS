import path from 'path';
import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { DocumentCategory, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { getPermittedSiteIds, hasSitePermission } from '../middleware/rbac';
import {
  ALLOWED_DOCUMENT_EXTENSIONS,
  buildContentDispositionHeader,
  deleteStoredFile,
  isAllowedExtension,
  normalizeUtf8FileName,
  readStoredFile,
  resolveSafeMimeType,
  saveSiteFile,
} from '../lib/storage';
import { generateDocumentPreview } from '../lib/documentPreview';
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

    const normalizedDocs = documents.map((d) => {
      const fixedDocName = normalizeUtf8FileName(d.documentName);
      const fixedOrigName = normalizeUtf8FileName(d.originalFileName);
      if (fixedDocName !== d.documentName || fixedOrigName !== d.originalFileName) {
        // Silently repair legacy mojibake rows once in background
        prisma.document
          .update({
            where: { id: d.id },
            data: { documentName: fixedDocName, originalFileName: fixedOrigName },
          })
          .catch(() => {});
      }
      return {
        ...d,
        documentName: fixedDocName,
        originalFileName: fixedOrigName,
        versions: d.versions.map((v) => {
          const fixedVerName = normalizeUtf8FileName(v.originalFileName);
          if (fixedVerName !== v.originalFileName) {
            prisma.documentVersion
              .update({
                where: { id: v.id },
                data: { originalFileName: fixedVerName },
              })
              .catch(() => {});
          }
          return { ...v, originalFileName: fixedVerName };
        }),
      };
    });

    res.json({ documents: normalizedDocs });
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
    const originalName = normalizeUtf8FileName(req.file.originalname);
    if (!isAllowedExtension(originalName, ALLOWED_DOCUMENT_EXTENSIONS)) {
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

    const documentName = normalizeUtf8FileName(
      String(req.body.documentName || originalName).trim(),
    );
    const versionLabel = String(req.body.version || '1.0').trim();
    const ext = path.extname(originalName).replace('.', '').toUpperCase() || 'FILE';
    const safeMime = resolveSafeMimeType(originalName);

    const saved = saveSiteFile(
      site.siteCode,
      'documents',
      originalName,
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
        originalFileName: originalName,
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
        originalFileName: originalName,
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
    const originalName = normalizeUtf8FileName(req.file.originalname);
    if (!isAllowedExtension(originalName, ALLOWED_DOCUMENT_EXTENSIONS)) {
      res.status(400).json({ error: 'File type is not permitted' });
      return;
    }

    const nextVerNum = existing.versionNumber + 1;
    const nextVerLabel = req.body.version
      ? String(req.body.version).trim()
      : `${nextVerNum}.0`;
    const ext = path.extname(originalName).replace('.', '').toUpperCase() || 'FILE';
    const safeMime = resolveSafeMimeType(originalName);

    const saved = saveSiteFile(
      existing.site.siteCode,
      'documents',
      originalName,
      req.file.buffer,
    );

    const doc = await prisma.document.update({
      where: { id: existing.id },
      data: {
        documentType: ext,
        currentVersion: nextVerLabel,
        versionNumber: nextVerNum,
        filePath: saved.relativePath,
        originalFileName: originalName,
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
        originalFileName: originalName,
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
      buildContentDispositionHeader(allowInline ? 'inline' : 'attachment', targetName),
    );
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/preview', async (req, res, next) => {
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
    let targetName = normalizeUtf8FileName(doc.originalFileName);
    if (versionParam !== null) {
      const ver = await prisma.documentVersion.findUnique({
        where: { documentId_versionNumber: { documentId: doc.id, versionNumber: versionParam } },
      });
      if (!ver) {
        res.status(404).json({ error: 'Document version not found' });
        return;
      }
      targetPath = ver.filePath;
      targetName = normalizeUtf8FileName(ver.originalFileName);
    }

    const buf = readStoredFile(targetPath);
    const preview = await generateDocumentPreview(buf, targetName);

    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'PREVIEW_DOCUMENT',
      module: 'DOCUMENT',
      siteId: doc.siteId,
      siteCode: doc.site.siteCode,
      details: { documentId: doc.id, documentName: normalizeUtf8FileName(doc.documentName) },
    });

    res.json({ preview });
  } catch (err) {
    next(err);
  }
});

const updateDocumentSchema = z.object({
  siteId: z.string().min(1).optional(),
  category: z.nativeEnum(DocumentCategory).optional(),
  documentName: z.string().trim().min(1).max(200).optional(),
  projectName: z.string().trim().max(200).optional().nullable(),
  description: z.string().trim().max(1000).optional().nullable(),
  responsiblePerson: z.string().trim().max(160).optional().nullable(),
  remark: z.string().trim().max(1000).optional().nullable(),
});

async function handleUpdateDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = updateDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid document payload' });
      return;
    }

    const existing = await prisma.document.findUnique({
      where: { id: String(req.params.id) },
      include: { site: { select: { id: true, siteCode: true } }, versions: true },
    });
    if (!existing) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    if (!hasSitePermission(req.user!, existing.siteId, 'canEditDocuments')) {
      res.status(403).json({ error: 'Permission denied to edit documents in this site' });
      return;
    }

    const payload = parsed.data;
    let targetSiteId = existing.siteId;
    let targetSiteCode = existing.site.siteCode;
    let movedFilePath = existing.filePath;
    const versionRelocations: Array<{ id: string; nextPath: string; oldPath: string }> = [];
    const oldPathsToRemove: string[] = [];

    if (payload.siteId && payload.siteId !== existing.siteId) {
      if (!hasSitePermission(req.user!, payload.siteId, 'canEditDocuments')) {
        res.status(403).json({ error: 'Permission denied for target site' });
        return;
      }
      const targetSite = await prisma.site.findUnique({
        where: { id: payload.siteId },
        select: { id: true, siteCode: true },
      });
      if (!targetSite) {
        res.status(404).json({ error: 'Target site not found' });
        return;
      }
      targetSiteId = targetSite.id;
      targetSiteCode = targetSite.siteCode;

      // Relocate stored files to target site folder so site cleanup never orphans/removes moved docs
      try {
        const currentBuf = readStoredFile(existing.filePath);
        const relocated = saveSiteFile(
          targetSiteCode,
          'documents',
          normalizeUtf8FileName(existing.originalFileName),
          currentBuf,
        );
        movedFilePath = relocated.relativePath;
        if (existing.filePath !== movedFilePath) {
          oldPathsToRemove.push(existing.filePath);
        }
      } catch {
        // Keep existing relative path if file is missing on disk
      }

      for (const ver of existing.versions) {
        if (ver.filePath === existing.filePath) {
          versionRelocations.push({
            id: ver.id,
            nextPath: movedFilePath,
            oldPath: ver.filePath,
          });
          continue;
        }
        try {
          const vBuf = readStoredFile(ver.filePath);
          const vRelocated = saveSiteFile(
            targetSiteCode,
            'documents',
            normalizeUtf8FileName(ver.originalFileName),
            vBuf,
          );
          versionRelocations.push({
            id: ver.id,
            nextPath: vRelocated.relativePath,
            oldPath: ver.filePath,
          });
          if (ver.filePath !== vRelocated.relativePath) {
            oldPathsToRemove.push(ver.filePath);
          }
        } catch {
          // ignore missing historical file
        }
      }
    }

    await prisma.document.update({
      where: { id: existing.id },
      data: {
        siteId: targetSiteId,
        ...(targetSiteId !== existing.siteId ? { projectId: null } : {}),
        ...(movedFilePath !== existing.filePath ? { filePath: movedFilePath } : {}),
        ...(payload.category !== undefined ? { category: payload.category } : {}),
        ...(payload.documentName !== undefined
          ? { documentName: normalizeUtf8FileName(payload.documentName) }
          : {}),
        ...(payload.projectName !== undefined
          ? { projectName: payload.projectName || null }
          : {}),
        ...(payload.description !== undefined
          ? { description: payload.description || null }
          : {}),
        ...(payload.responsiblePerson !== undefined
          ? { responsiblePerson: payload.responsiblePerson || null }
          : {}),
        ...(payload.remark !== undefined ? { remark: payload.remark || null } : {}),
      },
    });

    for (const rel of versionRelocations) {
      await prisma.documentVersion.update({
        where: { id: rel.id },
        data: { filePath: rel.nextPath },
      });
    }
    for (const oldPath of oldPathsToRemove) {
      deleteStoredFile(oldPath);
    }

    const updated = await prisma.document.findUniqueOrThrow({
      where: { id: existing.id },
      include: {
        site: { select: { id: true, siteCode: true, siteName: true } },
        uploadedBy: { select: { id: true, username: true, fullName: true } },
        versions: {
          orderBy: { versionNumber: 'desc' },
          include: { uploadedBy: { select: { id: true, username: true, fullName: true } } },
        },
      },
    });

    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'UPDATE_DOCUMENT',
      module: 'DOCUMENT',
      siteId: updated.siteId,
      siteCode: targetSiteCode,
      details: {
        documentId: updated.id,
        documentName: updated.documentName,
        category: updated.category,
        movedFromSite: existing.siteId !== updated.siteId ? existing.site.siteCode : undefined,
      },
    });

    res.json({
      document: {
        ...updated,
        documentName: normalizeUtf8FileName(updated.documentName),
        originalFileName: normalizeUtf8FileName(updated.originalFileName),
        versions: updated.versions.map((v) => ({
          ...v,
          originalFileName: normalizeUtf8FileName(v.originalFileName),
        })),
      },
    });
  } catch (err) {
    next(err);
  }
}

router.put('/:id', handleUpdateDocument);
router.patch('/:id', handleUpdateDocument);

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

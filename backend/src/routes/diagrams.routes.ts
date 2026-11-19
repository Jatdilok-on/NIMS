import path from 'path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { DiagramFileFormat, DiagramKind } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { getPermittedSiteIds, hasSitePermission, requireSitePermission } from '../middleware/rbac';
import {
  ALLOWED_DIAGRAM_EXTENSIONS,
  deleteStoredFile,
  isAllowedExtension,
  readStoredFile,
  saveSiteFile,
} from '../lib/storage';
import {
  convertVsdxToSvg,
  exportReactFlowToDrawioXml,
  parseDrawioToReactFlow,
  ReactFlowExportEdge,
  ReactFlowExportNode,
} from '../lib/visio';
import { recordAuditLog } from '../lib/audit';
import { syncDiagramNodesToInventory } from '../lib/deviceService';

const router = Router();
router.use(authenticate);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

function detectDiagramFormat(filename: string): DiagramFileFormat {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.png':
      return DiagramFileFormat.PNG;
    case '.jpg':
    case '.jpeg':
      return DiagramFileFormat.JPG;
    case '.svg':
      return DiagramFileFormat.SVG;
    case '.pdf':
      return DiagramFileFormat.PDF;
    case '.drawio':
      return DiagramFileFormat.DRAWIO;
    case '.xml':
      return DiagramFileFormat.XML;
    case '.vsdx':
      return DiagramFileFormat.VSDX;
    default:
      return DiagramFileFormat.JSON;
  }
}

function detectContentTypeForFormat(
  format: DiagramFileFormat,
  fallback?: string | null,
): string {
  switch (format) {
    case DiagramFileFormat.PNG:
      return 'image/png';
    case DiagramFileFormat.JPG:
      return 'image/jpeg';
    case DiagramFileFormat.SVG:
      return 'image/svg+xml';
    case DiagramFileFormat.PDF:
      return 'application/pdf';
    case DiagramFileFormat.DRAWIO:
    case DiagramFileFormat.XML:
      return 'application/xml';
    case DiagramFileFormat.VSDX:
      return 'application/vnd.ms-visio.drawing';
    case DiagramFileFormat.JSON:
      return 'application/json';
    default:
      return fallback || 'application/octet-stream';
  }
}

async function enrichCanvasWithLiveInventory(canvasData: unknown, siteId?: string) {
  if (!canvasData || typeof canvasData !== 'object') return canvasData;
  const cd = canvasData as {
    nodes?: Array<{ id: string; data?: Record<string, unknown>; [k: string]: unknown }>;
    edges?: unknown[];
    [k: string]: unknown;
  };
  if (!Array.isArray(cd.nodes) || cd.nodes.length === 0) return canvasData;

  const deviceIds = cd.nodes
    .map((n) => n.data?.deviceId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  if (deviceIds.length === 0) return canvasData;

  const devices = await prisma.device.findMany({
    where: { id: { in: deviceIds }, ...(siteId ? { siteId } : {}) },
    select: {
      id: true,
      name: true,
      model: true,
      vendor: true,
      managementIp: true,
      macAddress: true,
      serialNumber: true,
      location: true,
      vlan: true,
      status: true,
      category: true,
    },
  });
  const devMap = new Map(devices.map((d) => [d.id, d]));

  return {
    ...cd,
    nodes: cd.nodes.map((node) => {
      const devId = node.data?.deviceId;
      if (typeof devId === 'string' && devMap.has(devId)) {
        const d = devMap.get(devId)!;
        return {
          ...node,
          data: {
            ...node.data,
            label: d.name,
            model: d.model,
            vendor: d.vendor,
            ipAddress: d.managementIp,
            macAddress: d.macAddress,
            serialNumber: d.serialNumber,
            location: d.location,
            vlan: d.vlan,
            status: d.status,
            category: d.category,
          },
        };
      }
      return node;
    }),
  };
}

const createEditorDiagramSchema = z.object({
  siteId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
  canvasData: z.record(z.any()),
  changeNote: z.string().max(500).optional(),
});

const updateEditorDiagramSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  canvasData: z.record(z.any()).optional(),
  changeNote: z.string().max(500).optional(),
});

router.get('/', async (req, res, next) => {
  try {
    const siteId = typeof req.query.siteId === 'string' ? req.query.siteId : undefined;
    const permitted = getPermittedSiteIds(req.user!, 'canViewDiagram');

    if (siteId && permitted !== null && !permitted.includes(siteId)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const diagrams = await prisma.diagram.findMany({
      where: siteId ? { siteId } : permitted !== null ? { siteId: { in: permitted } } : {},
      include: {
        site: { select: { id: true, siteCode: true, siteName: true } },
        createdBy: { select: { id: true, username: true, fullName: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({ diagrams });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const diagram = await prisma.diagram.findUnique({
      where: { id: req.params.id },
      include: {
        site: { select: { id: true, siteCode: true, siteName: true } },
        createdBy: { select: { id: true, username: true, fullName: true } },
        versions: {
          orderBy: { version: 'desc' },
          include: { createdBy: { select: { id: true, username: true, fullName: true } } },
        },
      },
    });

    if (!diagram) {
      res.status(404).json({ error: 'Diagram not found' });
      return;
    }
    if (!hasSitePermission(req.user!, diagram.siteId, 'canViewDiagram')) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const enrichedCanvas = await enrichCanvasWithLiveInventory(diagram.canvasData, diagram.siteId);
    res.json({ diagram: { ...diagram, canvasData: enrichedCanvas } });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  requireSitePermission('canEditDiagram', (req) => req.body?.siteId),
  async (req, res, next) => {
    try {
      const body = createEditorDiagramSchema.parse(req.body);
      const site = await prisma.site.findUniqueOrThrow({ where: { id: body.siteId } });

      let finalCanvasData: Record<string, unknown> = body.canvasData;
      let syncedDevicesCount = 0;
      if (hasSitePermission(req.user!, body.siteId, 'canEditInventory')) {
        const synced = await syncDiagramNodesToInventory(body.siteId, body.canvasData);
        finalCanvasData = synced.canvasData;
        syncedDevicesCount = synced.syncedCount;
      }

      const diagram = await prisma.diagram.create({
        data: {
          siteId: body.siteId,
          title: body.title.trim(),
          description: body.description?.trim() || null,
          kind: DiagramKind.EDITOR,
          fileFormat: DiagramFileFormat.JSON,
          currentVersion: 1,
          canvasData: finalCanvasData as object,
          createdById: req.user!.id,
        },
      });

      await prisma.diagramVersion.create({
        data: {
          diagramId: diagram.id,
          version: 1,
          fileFormat: DiagramFileFormat.JSON,
          canvasData: finalCanvasData as object,
          changeNote: body.changeNote || 'Initial diagram created',
          createdById: req.user!.id,
        },
      });

      await recordAuditLog({
        req,
        userId: req.user!.id,
        username: req.user!.username,
        action: 'CREATE_DIAGRAM',
        module: 'DIAGRAM',
        siteId: site.id,
        siteCode: site.siteCode,
        details: { diagramId: diagram.id, title: diagram.title, syncedDevicesCount },
      });

      res.status(201).json({ diagram, syncedDevicesCount });
    } catch (err) {
      next(err);
    }
  },
);

router.put('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.diagram.findUnique({
      where: { id: req.params.id },
      include: { site: { select: { siteCode: true } } },
    });
    if (!existing) {
      res.status(404).json({ error: 'Diagram not found' });
      return;
    }
    if (!hasSitePermission(req.user!, existing.siteId, 'canEditDiagram')) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }

    const body = updateEditorDiagramSchema.parse(req.body);
    const nextVersion = existing.currentVersion + 1;

    let finalCanvasData: object | undefined = body.canvasData;
    let syncedDevicesCount = 0;
    if (body.canvasData && hasSitePermission(req.user!, existing.siteId, 'canEditInventory')) {
      const synced = await syncDiagramNodesToInventory(existing.siteId, body.canvasData);
      finalCanvasData = synced.canvasData as object;
      syncedDevicesCount = synced.syncedCount;
    }

    const updated = await prisma.diagram.update({
      where: { id: existing.id },
      data: {
        title: body.title?.trim(),
        description: body.description,
        canvasData: finalCanvasData ?? (existing.canvasData as object),
        currentVersion: finalCanvasData ? nextVersion : existing.currentVersion,
      },
    });

    if (finalCanvasData) {
      await prisma.diagramVersion.create({
        data: {
          diagramId: updated.id,
          version: nextVersion,
          fileFormat: updated.fileFormat,
          canvasData: finalCanvasData,
          changeNote: body.changeNote || `Updated to version ${nextVersion}`,
          createdById: req.user!.id,
        },
      });
    }

    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'EDIT_DIAGRAM',
      module: 'DIAGRAM',
      siteId: existing.siteId,
      siteCode: existing.site.siteCode,
      details: { diagramId: updated.id, version: updated.currentVersion, syncedDevicesCount },
    });

    res.json({ diagram: updated, syncedDevicesCount });
  } catch (err) {
    next(err);
  }
});

router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Diagram file is required' });
      return;
    }

    const siteId = String(req.body.siteId || '');
    const rawTitle = req.body.title !== undefined ? String(req.body.title).trim() : '';
    const hasDescriptionField = req.body.description !== undefined;
    const descriptionInput = req.body.description ? String(req.body.description) : null;
    const existingDiagramId = req.body.diagramId ? String(req.body.diagramId) : null;
    const changeNote = req.body.changeNote ? String(req.body.changeNote).trim() : undefined;

    if (!siteId) {
      res.status(400).json({ error: 'siteId is required' });
      return;
    }
    if (!hasSitePermission(req.user!, siteId, 'canEditDiagram')) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }
    if (!isAllowedExtension(req.file.originalname, ALLOWED_DIAGRAM_EXTENSIONS)) {
      res.status(400).json({ error: 'Unsupported diagram file format' });
      return;
    }

    const existing = existingDiagramId
      ? await prisma.diagram.findUnique({ where: { id: existingDiagramId } })
      : null;
    if (existingDiagramId && (!existing || existing.siteId !== siteId)) {
      res.status(404).json({ error: 'Target diagram not found in this site' });
      return;
    }

    const site = await prisma.site.findUniqueOrThrow({ where: { id: siteId } });
    const format = detectDiagramFormat(req.file.originalname);
    const title = rawTitle || existing?.title || req.file.originalname;
    const description = hasDescriptionField
      ? descriptionInput
      : (existing?.description ?? null);
    const saved = saveSiteFile(
      site.siteCode,
      'diagrams',
      req.file.originalname,
      req.file.buffer,
    );

    let previewSvgPath: string | null = null;
    let parsedCanvasData: object | undefined = undefined;

    if (format === DiagramFileFormat.VSDX) {
      const svgStr = await convertVsdxToSvg(req.file.buffer);
      const svgSaved = saveSiteFile(
        site.siteCode,
        'diagrams',
        `${path.basename(req.file.originalname, '.vsdx')}-preview.svg`,
        Buffer.from(svgStr, 'utf8'),
      );
      previewSvgPath = svgSaved.relativePath;
    } else if (format === DiagramFileFormat.DRAWIO || format === DiagramFileFormat.XML) {
      try {
        parsedCanvasData = parseDrawioToReactFlow(req.file.buffer.toString('utf8'));
      } catch {
        // Non-mxGraph XML; keep raw file
      }
    }

    let diagram;
    if (existing) {
      const nextVer = existing.currentVersion + 1;
      diagram = await prisma.diagram.update({
        where: { id: existing.id },
        data: {
          title: title.trim(),
          description,
          fileFormat: format,
          filePath: saved.relativePath,
          previewSvgPath,
          canvasData: parsedCanvasData ?? (existing.canvasData as object | undefined),
          mimeType: req.file!.mimetype,
          fileSize: saved.fileSize,
          currentVersion: nextVer,
        },
      });
      await prisma.diagramVersion.create({
        data: {
          diagramId: diagram.id,
          version: nextVer,
          fileFormat: format,
          filePath: saved.relativePath,
          canvasData: parsedCanvasData,
          changeNote: changeNote || `Uploaded version ${nextVer}`,
          createdById: req.user!.id,
        },
      });
    } else {
      diagram = await prisma.diagram.create({
        data: {
          siteId,
          title: title.trim(),
          description,
          kind: DiagramKind.UPLOADED,
          fileFormat: format,
          currentVersion: 1,
          filePath: saved.relativePath,
          previewSvgPath,
          canvasData: parsedCanvasData,
          mimeType: req.file!.mimetype,
          fileSize: saved.fileSize,
          createdById: req.user!.id,
        },
      });
      await prisma.diagramVersion.create({
        data: {
          diagramId: diagram.id,
          version: 1,
          fileFormat: format,
          filePath: saved.relativePath,
          canvasData: parsedCanvasData,
          changeNote: changeNote || 'Initial upload',
          createdById: req.user!.id,
        },
      });
    }

    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'UPLOAD_DIAGRAM',
      module: 'DIAGRAM',
      siteId: site.id,
      siteCode: site.siteCode,
      details: { diagramId: diagram.id, format, fileSize: saved.fileSize },
    });

    res.status(201).json({ diagram });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/file', async (req, res, next) => {
  try {
    const diagram = await prisma.diagram.findUnique({ where: { id: req.params.id } });
    if (!diagram) {
      res.status(404).json({ error: 'Diagram file not found' });
      return;
    }
    if (!hasSitePermission(req.user!, diagram.siteId, 'canViewDiagram')) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    let targetFilePath = diagram.filePath;
    let targetContentType = detectContentTypeForFormat(diagram.fileFormat, diagram.mimeType);

    if (req.query.version !== undefined) {
      const versionNum = parseInt(String(req.query.version), 10);
      if (Number.isNaN(versionNum)) {
        res.status(400).json({ error: 'Invalid version parameter' });
        return;
      }
      const ver = await prisma.diagramVersion.findUnique({
        where: { diagramId_version: { diagramId: diagram.id, version: versionNum } },
      });
      if (!ver || !ver.filePath) {
        res.status(404).json({ error: 'Diagram version file not found' });
        return;
      }
      targetFilePath = ver.filePath;
      targetContentType = detectContentTypeForFormat(ver.fileFormat, diagram.mimeType);
    }

    if (!targetFilePath) {
      res.status(404).json({ error: 'Diagram file not found' });
      return;
    }

    const buf = readStoredFile(targetFilePath);
    res.setHeader('Content-Type', targetContentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.query.download === '1') {
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${path.basename(targetFilePath)}"`,
      );
    } else {
      if (targetContentType.includes('svg') || targetContentType.includes('xml')) {
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'none'; sandbox; style-src 'unsafe-inline'; img-src 'self' data:",
        );
      }
      res.setHeader('Content-Disposition', 'inline');
    }
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/preview-svg', async (req, res, next) => {
  try {
    const diagram = await prisma.diagram.findUnique({ where: { id: req.params.id } });
    if (!diagram || !diagram.previewSvgPath) {
      res.status(404).json({ error: 'Preview SVG not available' });
      return;
    }
    if (!hasSitePermission(req.user!, diagram.siteId, 'canViewDiagram')) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    const buf = readStoredFile(diagram.previewSvgPath);
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; sandbox; style-src 'unsafe-inline'; img-src 'self' data:",
    );
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

router.post('/parse-import', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Import file (.drawio, .xml, .json) is required' });
      return;
    }
    const ext = path.extname(req.file.originalname).toLowerCase();
    const rawText = req.file.buffer.toString('utf8');

    if (ext === '.json') {
      let parsed: {
        nodes?: unknown[];
        edges?: unknown[];
        backgroundImage?: string | null;
      };
      try {
        parsed = JSON.parse(rawText);
      } catch {
        res.status(400).json({ error: 'Invalid JSON syntax in diagram file' });
        return;
      }
      if (!Array.isArray(parsed.nodes)) {
        res.status(400).json({ error: 'Invalid NIMS JSON diagram (missing nodes array)' });
        return;
      }
      res.json({
        nodes: parsed.nodes,
        edges: Array.isArray(parsed.edges) ? parsed.edges : [],
        backgroundImage: typeof parsed.backgroundImage === 'string' ? parsed.backgroundImage : null,
      });
      return;
    }

    if (ext === '.drawio' || ext === '.xml') {
      const parsed = parseDrawioToReactFlow(rawText);
      res.json({
        nodes: parsed.nodes,
        edges: parsed.edges,
        backgroundImage: null,
      });
      return;
    }

    res.status(400).json({ error: 'Unsupported import format. Use .drawio, .xml, or .json' });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/export/json', async (req, res, next) => {
  try {
    const diagram = await prisma.diagram.findUnique({ where: { id: req.params.id } });
    if (!diagram) {
      res.status(404).json({ error: 'Diagram not found' });
      return;
    }
    if (!hasSitePermission(req.user!, diagram.siteId, 'canViewDiagram')) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    const cd = await enrichCanvasWithLiveInventory(diagram.canvasData, diagram.siteId);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${diagram.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.nims.json"`,
    );
    res.send(JSON.stringify(cd || { nodes: [], edges: [] }, null, 2));
  } catch (err) {
    next(err);
  }
});

router.get('/:id/export/drawio', async (req, res, next) => {
  try {
    const diagram = await prisma.diagram.findUnique({ where: { id: req.params.id } });
    if (!diagram) {
      res.status(404).json({ error: 'Diagram not found' });
      return;
    }
    if (!hasSitePermission(req.user!, diagram.siteId, 'canViewDiagram')) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const cd = (await enrichCanvasWithLiveInventory(diagram.canvasData, diagram.siteId)) as {
      nodes?: ReactFlowExportNode[];
      edges?: ReactFlowExportEdge[];
    } | null;

    const xml = exportReactFlowToDrawioXml(
      diagram.title,
      cd?.nodes || [],
      cd?.edges || [],
    );

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${diagram.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.drawio"`,
    );
    res.send(xml);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/restore/:version', async (req, res, next) => {
  try {
    const diagram = await prisma.diagram.findUnique({
      where: { id: req.params.id },
      include: { site: { select: { siteCode: true } } },
    });
    if (!diagram) {
      res.status(404).json({ error: 'Diagram not found' });
      return;
    }
    if (!hasSitePermission(req.user!, diagram.siteId, 'canEditDiagram')) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }

    const versionNum = parseInt(req.params.version, 10);
    if (Number.isNaN(versionNum) || versionNum < 1) {
      res.status(400).json({ error: 'Invalid diagram version number' });
      return;
    }
    const targetVer = await prisma.diagramVersion.findUnique({
      where: { diagramId_version: { diagramId: diagram.id, version: versionNum } },
    });
    if (!targetVer) {
      res.status(404).json({ error: 'Diagram version not found' });
      return;
    }

    const nextVer = diagram.currentVersion + 1;
    const isJsonVersion = targetVer.fileFormat === DiagramFileFormat.JSON;
    const restoredFilePath = isJsonVersion ? null : (targetVer.filePath ?? diagram.filePath);
    const restoredMimeType = isJsonVersion
      ? null
      : detectContentTypeForFormat(targetVer.fileFormat, diagram.mimeType);
    let restoredSize: number | null = isJsonVersion ? null : diagram.fileSize;
    let restoredPreviewSvgPath: string | null = null;

    if (!isJsonVersion && restoredFilePath) {
      try {
        const fileBuf = readStoredFile(restoredFilePath);
        restoredSize = fileBuf.length;
        if (targetVer.fileFormat === DiagramFileFormat.VSDX) {
          const previewSvg = await convertVsdxToSvg(fileBuf);
          if (previewSvg) {
            const savedPreview = saveSiteFile(
              diagram.site.siteCode,
              'diagrams',
              `${diagram.title}-preview-v${nextVer}.svg`,
              Buffer.from(previewSvg, 'utf8'),
            );
            restoredPreviewSvgPath = savedPreview.relativePath;
          } else {
            restoredPreviewSvgPath = diagram.previewSvgPath;
          }
        }
      } catch {
        // Fallback to existing fileSize if version file size unavailable
      }
    }
    const restored = await prisma.diagram.update({
      where: { id: diagram.id },
      data: {
        kind: isJsonVersion ? DiagramKind.EDITOR : DiagramKind.UPLOADED,
        fileFormat: targetVer.fileFormat,
        canvasData: isJsonVersion ? ((targetVer.canvasData ?? { nodes: [], edges: [] }) as object) : null,
        filePath: restoredFilePath,
        mimeType: restoredMimeType,
        fileSize: restoredSize,
        previewSvgPath: restoredPreviewSvgPath,
        currentVersion: nextVer,
      },
    });
    await prisma.diagramVersion.create({
      data: {
        diagramId: diagram.id,
        version: nextVer,
        fileFormat: targetVer.fileFormat,
        canvasData: targetVer.canvasData ?? undefined,
        filePath: targetVer.filePath,
        changeNote: `Restored from version ${versionNum}`,
        createdById: req.user!.id,
      },
    });

    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'RESTORE_DIAGRAM_VERSION',
      module: 'DIAGRAM',
      siteId: diagram.siteId,
      siteCode: diagram.site.siteCode,
      details: { diagramId: diagram.id, restoredFrom: versionNum, newVersion: nextVer },
    });

    res.json({ diagram: restored });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const diagram = await prisma.diagram.findUnique({
      where: { id: req.params.id },
      include: {
        site: { select: { siteCode: true } },
        versions: { select: { filePath: true } },
      },
    });
    if (!diagram) {
      res.status(404).json({ error: 'Diagram not found' });
      return;
    }
    if (!hasSitePermission(req.user!, diagram.siteId, 'canEditDiagram')) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }

    const filePathsToDelete = new Set<string>();
    if (diagram.filePath) filePathsToDelete.add(diagram.filePath);
    if (diagram.previewSvgPath) filePathsToDelete.add(diagram.previewSvgPath);
    for (const v of diagram.versions) {
      if (v.filePath) filePathsToDelete.add(v.filePath);
    }

    await prisma.diagram.delete({ where: { id: diagram.id } });
    for (const relPath of filePathsToDelete) {
      deleteStoredFile(relPath);
    }
    await recordAuditLog({
      req,
      userId: req.user!.id,
      username: req.user!.username,
      action: 'DELETE_DIAGRAM',
      module: 'DIAGRAM',
      siteId: diagram.siteId,
      siteCode: diagram.site.siteCode,
      details: { diagramId: diagram.id, title: diagram.title },
    });
    res.json({ message: 'Diagram deleted' });
  } catch (err) {
    next(err);
  }
});

export default router;

import path from 'path';
import { Readable } from 'stream';
import ExcelJS from 'exceljs';
import unzipper from 'unzipper';
import { XMLParser } from 'fast-xml-parser';
import { decodeCsvBufferToUtf8 } from './excel';

export interface SpreadsheetCellPreview {
  text: string;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
  bg?: string;
}

export interface SpreadsheetSheetPreview {
  name: string;
  totalRows: number;
  totalCols: number;
  truncatedRows: boolean;
  truncatedCols: boolean;
  rows: SpreadsheetCellPreview[][];
}

export interface WordRunPreview {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  href?: string;
  imageDataUrl?: string;
}

export type WordBlockPreview =
  | {
      type: 'heading';
      level: 1 | 2 | 3 | 4;
      align?: 'left' | 'center' | 'right';
      runs: WordRunPreview[];
    }
  | {
      type: 'paragraph';
      isList?: boolean;
      listLevel?: number;
      align?: 'left' | 'center' | 'right';
      runs: WordRunPreview[];
    }
  | {
      type: 'table';
      rows: Array<{
        isHeader?: boolean;
        cells: Array<{
          colSpan?: number;
          bg?: string;
          blocks: Array<{
            align?: 'left' | 'center' | 'right';
            runs: WordRunPreview[];
          }>;
        }>;
      }>;
    };

export type DocumentPreviewPayload =
  | {
      kind: 'spreadsheet';
      fileName: string;
      sheets: SpreadsheetSheetPreview[];
    }
  | {
      kind: 'word';
      fileName: string;
      blocks: WordBlockPreview[];
      truncated: boolean;
    }
  | {
      kind: 'slides';
      fileName: string;
      slides: Array<{
        slideNumber: number;
        lines: string[];
      }>;
    }
  | {
      kind: 'unsupported';
      fileName: string;
      reason: 'LEGACY_OFFICE' | 'UNSUPPORTED';
      message: string;
    };

const MAX_PREVIEW_SHEETS = 20;
const MAX_PREVIEW_ROWS = 500;
const MAX_PREVIEW_COLS = 40;
const MAX_XML_BYTES = 20 * 1024 * 1024;
const MAX_WORD_BLOCKS = 1500;
const MAX_EMBEDDED_IMAGES = 30;
const MAX_SINGLE_IMAGE_BYTES = 3 * 1024 * 1024;

const orderedXmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  preserveOrder: true,
  trimValues: false,
  parseTagValue: false,
});

function sanitizeHexColor(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.trim().replace(/^#/, '');
  // ARGB (8 hex chars from ExcelJS) -> strip leading alpha if opaque
  const six =
    cleaned.length === 8 ? cleaned.slice(2) : cleaned.length === 6 ? cleaned : '';
  if (!/^[0-9a-fA-F]{6}$/.test(six)) return undefined;
  if (six.toUpperCase() === '000000' || six.toUpperCase() === 'FFFFFF' || six.toUpperCase() === 'AUTO') {
    return undefined;
  }
  return `#${six}`;
}

function formatExcelCellValue(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    const hasTime =
      value.getUTCHours() !== 0 ||
      value.getUTCMinutes() !== 0 ||
      value.getUTCSeconds() !== 0;
    return hasTime ? value.toISOString().slice(0, 16).replace('T', ' ') : value.toISOString().slice(0, 10);
  }
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text || '').join('');
    }
    if ('result' in value) {
      return value.result !== undefined && value.result !== null
        ? formatExcelCellValue(value.result as ExcelJS.CellValue)
        : '';
    }
    if ('text' in value && typeof value.text === 'string') {
      return value.text;
    }
    if ('hyperlink' in value && typeof value.hyperlink === 'string') {
      return value.hyperlink;
    }
    if ('error' in value && value.error) {
      return String(value.error);
    }
    return '';
  }
  return String(value);
}

async function buildSpreadsheetPreview(
  buffer: Buffer,
  fileName: string,
  ext: string,
): Promise<DocumentPreviewPayload> {
  const wb = new ExcelJS.Workbook();
  if (ext === '.csv') {
    const utf8Csv = decodeCsvBufferToUtf8(buffer);
    await wb.csv.read(Readable.from([utf8Csv]));
  } else {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  }

  const sheets: SpreadsheetSheetPreview[] = [];
  for (const ws of wb.worksheets.slice(0, MAX_PREVIEW_SHEETS)) {
    const actualRows = ws.rowCount || 0;
    const actualCols = Math.max(ws.columnCount || 0, 1);
    const cappedRows = Math.min(actualRows, MAX_PREVIEW_ROWS);
    const cappedCols = Math.min(actualCols, MAX_PREVIEW_COLS);

    const rows: SpreadsheetCellPreview[][] = [];
    for (let r = 1; r <= cappedRows; r++) {
      const row = ws.getRow(r);
      const rowCells: SpreadsheetCellPreview[] = [];
      for (let c = 1; c <= cappedCols; c++) {
        const cell = row.getCell(c);
        const text = formatExcelCellValue(cell.value);
        const hAlign = cell.alignment?.horizontal;
        const align: 'left' | 'center' | 'right' | undefined =
          hAlign === 'center' || hAlign === 'right' || hAlign === 'left' ? hAlign : undefined;
        const fill = cell.fill;
        const bg =
          fill && fill.type === 'pattern' && 'fgColor' in fill
            ? sanitizeHexColor(fill.fgColor?.argb)
            : undefined;
        rowCells.push({
          text,
          ...(cell.font?.bold ? { bold: true } : {}),
          ...(align ? { align } : {}),
          ...(bg ? { bg } : {}),
        });
      }
      rows.push(rowCells);
    }

    sheets.push({
      name: ws.name || `Sheet ${sheets.length + 1}`,
      totalRows: actualRows,
      totalCols: actualCols,
      truncatedRows: actualRows > MAX_PREVIEW_ROWS,
      truncatedCols: actualCols > MAX_PREVIEW_COLS,
      rows,
    });
  }

  return {
    kind: 'spreadsheet',
    fileName,
    sheets,
  };
}

type OrderedXmlNode = Record<string, unknown>;

function nodeTagName(node: OrderedXmlNode): string | null {
  for (const key of Object.keys(node)) {
    if (key !== ':@' && key !== '#text') {
      return key;
    }
  }
  return null;
}

function nodeChildren(node: OrderedXmlNode, tagName?: string): OrderedXmlNode[] {
  const key = tagName || nodeTagName(node);
  if (!key) return [];
  const val = node[key];
  return Array.isArray(val) ? (val as OrderedXmlNode[]) : [];
}

function nodeAttrs(node: OrderedXmlNode): Record<string, string> {
  const raw = node[':@'];
  return raw && typeof raw === 'object' ? (raw as Record<string, string>) : {};
}

function findChild(children: OrderedXmlNode[], tagName: string): OrderedXmlNode | undefined {
  return children.find((c) => tagName in c);
}

function collectText(nodes: OrderedXmlNode[]): string {
  let out = '';
  for (const node of nodes) {
    if (typeof node['#text'] === 'string' || typeof node['#text'] === 'number') {
      out += String(node['#text']);
    }
    const tag = nodeTagName(node);
    if (tag) {
      out += collectText(nodeChildren(node, tag));
    }
  }
  return out;
}

function normalizeAlign(val?: string): 'left' | 'center' | 'right' | undefined {
  if (val === 'center') return 'center';
  if (val === 'right' || val === 'end') return 'right';
  if (val === 'left' || val === 'start') return 'left';
  return undefined;
}

function extractInlineImageRelId(node: OrderedXmlNode): string | null {
  const attrs = nodeAttrs(node);
  for (const key of Object.keys(attrs)) {
    if ((key === '@_r:embed' || key === '@_r:id') && attrs[key]) {
      return attrs[key];
    }
  }
  for (const child of nodeChildren(node)) {
    const found = extractInlineImageRelId(child);
    if (found) return found;
  }
  return null;
}

const SAFE_DOCX_IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

function extractWordRuns(
  nodes: OrderedXmlNode[],
  relTargets: Map<string, string>,
  imageDataMap: Map<string, string>,
  href?: string,
): WordRunPreview[] {
  const runs: WordRunPreview[] = [];

  for (const node of nodes) {
    const tag = nodeTagName(node);
    if (!tag) continue;

    if (tag === 'w:hyperlink') {
      const attrs = nodeAttrs(node);
      const rId = attrs['@_r:id'];
      const targetUrl = rId ? relTargets.get(rId) : undefined;
      const safeHref =
        targetUrl && /^https?:\/\//i.test(targetUrl) ? targetUrl : href;
      runs.push(
        ...extractWordRuns(nodeChildren(node, tag), relTargets, imageDataMap, safeHref),
      );
      continue;
    }

    if (tag !== 'w:r') {
      // Recurse into containers like w:ins, w:smartTag, w:sdtContent
      if (tag !== 'w:pPr') {
        runs.push(
          ...extractWordRuns(nodeChildren(node, tag), relTargets, imageDataMap, href),
        );
      }
      continue;
    }

    const rChildren = nodeChildren(node, 'w:r');
    const rPr = findChild(rChildren, 'w:rPr');
    const rPrChildren = rPr ? nodeChildren(rPr, 'w:rPr') : [];
    const checkFlag = (flagTag: string): boolean => {
      const found = findChild(rPrChildren, flagTag);
      if (!found) return false;
      const val = nodeAttrs(found)['@_w:val'];
      return val !== '0' && val !== 'false';
    };

    const bold = checkFlag('w:b');
    const italic = checkFlag('w:i');
    const underline = (() => {
      const found = findChild(rPrChildren, 'w:u');
      if (!found) return false;
      const val = nodeAttrs(found)['@_w:val'];
      return val !== 'none' && val !== '0';
    })();
    const strike = checkFlag('w:strike');
    const colorNode = findChild(rPrChildren, 'w:color');
    const color = sanitizeHexColor(colorNode ? nodeAttrs(colorNode)['@_w:val'] : undefined);

    for (const rc of rChildren) {
      const rcTag = nodeTagName(rc);
      if (!rcTag) continue;
      if (rcTag === 'w:t' || rcTag === 'w:delText') {
        const text = collectText(nodeChildren(rc, rcTag));
        if (text) {
          runs.push({
            text,
            ...(bold ? { bold: true } : {}),
            ...(italic ? { italic: true } : {}),
            ...(underline ? { underline: true } : {}),
            ...(strike ? { strike: true } : {}),
            ...(color ? { color } : {}),
            ...(href ? { href } : {}),
          });
        }
      } else if (rcTag === 'w:br') {
        runs.push({ text: '\n' });
      } else if (rcTag === 'w:tab') {
        runs.push({ text: '    ' });
      } else if (rcTag === 'w:drawing' || rcTag === 'w:pict') {
        const embedId = extractInlineImageRelId(rc);
        if (embedId) {
          const dataUrl = imageDataMap.get(embedId);
          if (dataUrl) {
            runs.push({ text: '', imageDataUrl: dataUrl });
          }
        }
      }
    }
  }

  return runs;
}

function parseParagraphBlock(
  pNode: OrderedXmlNode,
  relTargets: Map<string, string>,
  imageDataMap: Map<string, string>,
): WordBlockPreview {
  const children = nodeChildren(pNode, 'w:p');
  const pPr = findChild(children, 'w:pPr');
  const pPrChildren = pPr ? nodeChildren(pPr, 'w:pPr') : [];
  const pStyleNode = findChild(pPrChildren, 'w:pStyle');
  const styleVal = (pStyleNode ? nodeAttrs(pStyleNode)['@_w:val'] || '' : '').toLowerCase();

  const jcNode = findChild(pPrChildren, 'w:jc');
  const align = normalizeAlign(jcNode ? nodeAttrs(jcNode)['@_w:val'] : undefined);

  const numPrNode = findChild(pPrChildren, 'w:numPr');
  let isList = false;
  let listLevel = 0;
  if (numPrNode) {
    isList = true;
    const ilvlNode = findChild(nodeChildren(numPrNode, 'w:numPr'), 'w:ilvl');
    if (ilvlNode) {
      const parsedLvl = parseInt(nodeAttrs(ilvlNode)['@_w:val'] || '0', 10);
      if (Number.isFinite(parsedLvl) && parsedLvl >= 0) {
        listLevel = Math.min(parsedLvl, 4);
      }
    }
  } else if (styleVal.includes('list')) {
    isList = true;
  }

  const runs = extractWordRuns(children, relTargets, imageDataMap);

  let headingLevel: 1 | 2 | 3 | 4 | null = null;
  if (styleVal === 'title' || styleVal === 'heading1' || styleVal === '1') {
    headingLevel = 1;
  } else if (styleVal === 'subtitle' || styleVal === 'heading2' || styleVal === '2') {
    headingLevel = 2;
  } else if (styleVal === 'heading3' || styleVal === '3') {
    headingLevel = 3;
  } else if (/heading\s*[4-6]/.test(styleVal) || styleVal === '4') {
    headingLevel = 4;
  }

  if (headingLevel) {
    return {
      type: 'heading',
      level: headingLevel,
      ...(align ? { align } : {}),
      runs,
    };
  }

  return {
    type: 'paragraph',
    ...(isList ? { isList: true, listLevel } : {}),
    ...(align ? { align } : {}),
    runs,
  };
}

function parseTableBlock(
  tblNode: OrderedXmlNode,
  relTargets: Map<string, string>,
  imageDataMap: Map<string, string>,
): WordBlockPreview {
  const rows: Array<{
    isHeader?: boolean;
    cells: Array<{
      colSpan?: number;
      bg?: string;
      blocks: Array<{
        align?: 'left' | 'center' | 'right';
        runs: WordRunPreview[];
      }>;
    }>;
  }> = [];

  for (const trNode of nodeChildren(tblNode, 'w:tbl')) {
    if (nodeTagName(trNode) !== 'w:tr') continue;
    const trChildren = nodeChildren(trNode, 'w:tr');
    const trPr = findChild(trChildren, 'w:trPr');
    const isHeader = Boolean(
      trPr && findChild(nodeChildren(trPr, 'w:trPr'), 'w:tblHeader'),
    );

    const cells: Array<{
      colSpan?: number;
      bg?: string;
      blocks: Array<{
        align?: 'left' | 'center' | 'right';
        runs: WordRunPreview[];
      }>;
    }> = [];

    for (const tcNode of trChildren) {
      if (nodeTagName(tcNode) !== 'w:tc') continue;
      const tcChildren = nodeChildren(tcNode, 'w:tc');
      const tcPr = findChild(tcChildren, 'w:tcPr');
      const tcPrChildren = tcPr ? nodeChildren(tcPr, 'w:tcPr') : [];
      const gridSpanNode = findChild(tcPrChildren, 'w:gridSpan');
      const rawSpan = gridSpanNode ? parseInt(nodeAttrs(gridSpanNode)['@_w:val'] || '1', 10) : 1;
      const colSpan = Number.isFinite(rawSpan) && rawSpan > 1 ? rawSpan : undefined;
      const shdNode = findChild(tcPrChildren, 'w:shd');
      const bg = sanitizeHexColor(shdNode ? nodeAttrs(shdNode)['@_w:fill'] : undefined);

      const cellBlocks: Array<{
        align?: 'left' | 'center' | 'right';
        runs: WordRunPreview[];
      }> = [];
      for (const child of tcChildren) {
        if (nodeTagName(child) === 'w:p') {
          const parsedP = parseParagraphBlock(child, relTargets, imageDataMap);
          if (parsedP.type !== 'table') {
            cellBlocks.push({
              ...(parsedP.align ? { align: parsedP.align } : {}),
              runs: parsedP.runs,
            });
          }
        }
      }

      cells.push({
        ...(colSpan ? { colSpan } : {}),
        ...(bg ? { bg } : {}),
        blocks: cellBlocks,
      });
    }

    if (cells.length > 0) {
      rows.push({
        ...(isHeader ? { isHeader: true } : {}),
        cells,
      });
    }
  }

  return {
    type: 'table',
    rows,
  };
}

interface BoundedZipEntry {
  path: string;
  vars?: { uncompressedSize?: number };
  buffer: () => Promise<Buffer>;
  stream?: () => NodeJS.ReadableStream;
}

async function readZipEntryBounded(
  entry: BoundedZipEntry,
  maxBytes: number,
): Promise<Buffer | null> {
  const declaredSize = Number(entry.vars?.uncompressedSize || 0);
  if (declaredSize > maxBytes) {
    return null;
  }
  if (typeof entry.stream !== 'function') {
    const buf = await entry.buffer();
    return buf.length > maxBytes ? null : buf;
  }
  return new Promise<Buffer | null>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;
    const stream = entry.stream!() as NodeJS.ReadableStream & { destroy?: () => void };
    stream.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        if (!settled) {
          settled = true;
          stream.destroy?.();
          resolve(null);
        }
        return;
      }
      chunks.push(chunk);
    });
    stream.on('error', (err: unknown) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
    stream.on('end', () => {
      if (!settled) {
        settled = true;
        resolve(Buffer.concat(chunks, total));
      }
    });
  });
}

async function buildDocxPreview(
  buffer: Buffer,
  fileName: string,
): Promise<DocumentPreviewPayload> {
  const dir = await unzipper.Open.buffer(buffer);
  const filesByPath = new Map(dir.files.map((f) => [f.path.replace(/\\/g, '/'), f]));
  const filesByPathLower = new Map(
    dir.files.map((f) => [f.path.replace(/\\/g, '/').toLowerCase(), f]),
  );

  const docEntry = filesByPath.get('word/document.xml');
  if (!docEntry) {
    return {
      kind: 'unsupported',
      fileName,
      reason: 'UNSUPPORTED',
      message: 'Could not read document body from DOCX archive.',
    };
  }

  const docXmlBuf = await readZipEntryBounded(docEntry, MAX_XML_BYTES);
  if (!docXmlBuf) {
    return {
      kind: 'unsupported',
      fileName,
      reason: 'UNSUPPORTED',
      message: 'Document XML exceeds safe in-browser preview size limit.',
    };
  }

  // Load relationships for external hyperlinks & embedded media
  const relTargets = new Map<string, string>();
  const imageDataMap = new Map<string, string>();
  const relsEntry = filesByPath.get('word/_rels/document.xml.rels');
  if (relsEntry) {
    const relsBuf = await readZipEntryBounded(relsEntry, MAX_XML_BYTES);
    if (relsBuf) {
      const relNodes = orderedXmlParser.parse(relsBuf.toString('utf8')) as OrderedXmlNode[];
      const root = findChild(relNodes, 'Relationships');
      if (root) {
        let loadedImages = 0;
        for (const rel of nodeChildren(root, 'Relationships')) {
          if (nodeTagName(rel) !== 'Relationship') continue;
          const attrs = nodeAttrs(rel);
          const id = attrs['@_Id'];
          const target = attrs['@_Target'];
          const type = attrs['@_Type'] || '';
          if (!id || !target) continue;
          relTargets.set(id, target);
          if (
            type.endsWith('/image') &&
            loadedImages < MAX_EMBEDDED_IMAGES &&
            !target.includes('..')
          ) {
            const mediaPath = target.startsWith('/')
              ? target.slice(1)
              : `word/${target.replace(/^\.\//, '')}`;
            const mediaEntry =
              filesByPath.get(mediaPath) ?? filesByPathLower.get(mediaPath.toLowerCase());
            const ext = path.extname(mediaPath).toLowerCase();
            const mime = SAFE_DOCX_IMAGE_MIME[ext];
            if (mediaEntry && mime) {
              const imgBuf = await readZipEntryBounded(mediaEntry, MAX_SINGLE_IMAGE_BYTES);
              if (imgBuf) {
                imageDataMap.set(id, `data:${mime};base64,${imgBuf.toString('base64')}`);
                loadedImages++;
              }
            }
          }
        }
      }
    }
  }

  const parsedDoc = orderedXmlParser.parse(docXmlBuf.toString('utf8')) as OrderedXmlNode[];
  const docRoot = findChild(parsedDoc, 'w:document');
  const bodyNode = docRoot ? findChild(nodeChildren(docRoot, 'w:document'), 'w:body') : undefined;
  if (!bodyNode) {
    return { kind: 'word', fileName, blocks: [], truncated: false };
  }

  const blocks: WordBlockPreview[] = [];
  let truncated = false;

  for (const child of nodeChildren(bodyNode, 'w:body')) {
    if (blocks.length >= MAX_WORD_BLOCKS) {
      truncated = true;
      break;
    }
    const tag = nodeTagName(child);
    if (tag === 'w:p') {
      blocks.push(parseParagraphBlock(child, relTargets, imageDataMap));
    } else if (tag === 'w:tbl') {
      blocks.push(parseTableBlock(child, relTargets, imageDataMap));
    } else if (tag === 'w:sdt') {
      const sdtContent = findChild(nodeChildren(child, 'w:sdt'), 'w:sdtContent');
      if (sdtContent) {
        for (const inner of nodeChildren(sdtContent, 'w:sdtContent')) {
          if (blocks.length >= MAX_WORD_BLOCKS) {
            truncated = true;
            break;
          }
          const innerTag = nodeTagName(inner);
          if (innerTag === 'w:p') {
            blocks.push(parseParagraphBlock(inner, relTargets, imageDataMap));
          } else if (innerTag === 'w:tbl') {
            blocks.push(parseTableBlock(inner, relTargets, imageDataMap));
          }
        }
      }
    }
  }

  return {
    kind: 'word',
    fileName,
    blocks,
    truncated,
  };
}

async function buildPptxPreview(
  buffer: Buffer,
  fileName: string,
): Promise<DocumentPreviewPayload> {
  const dir = await unzipper.Open.buffer(buffer);
  const slideEntries = dir.files
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/i.test(f.path.replace(/\\/g, '/')))
    .sort((a, b) => {
      const numA = parseInt(a.path.match(/slide(\d+)\.xml$/i)?.[1] || '0', 10);
      const numB = parseInt(b.path.match(/slide(\d+)\.xml$/i)?.[1] || '0', 10);
      return numA - numB;
    })
    .slice(0, 60);

  const slides: Array<{ slideNumber: number; lines: string[] }> = [];
  for (const entry of slideEntries) {
    const buf = await readZipEntryBounded(entry, MAX_XML_BYTES);
    if (!buf) continue;
    const parsed = orderedXmlParser.parse(buf.toString('utf8')) as OrderedXmlNode[];
    const lines: string[] = [];
    const walkParagraphs = (nodes: OrderedXmlNode[]) => {
      for (const n of nodes) {
        const tag = nodeTagName(n);
        if (!tag) continue;
        if (tag === 'a:p') {
          const text = collectText(nodeChildren(n, tag)).trim();
          if (text) lines.push(text);
        } else {
          walkParagraphs(nodeChildren(n, tag));
        }
      }
    };
    walkParagraphs(parsed);
    const num = parseInt(entry.path.match(/slide(\d+)\.xml$/i)?.[1] || String(slides.length + 1), 10);
    slides.push({ slideNumber: num, lines });
  }

  return { kind: 'slides', fileName, slides };
}

export async function generateDocumentPreview(
  buffer: Buffer,
  fileName: string,
): Promise<DocumentPreviewPayload> {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.xlsx' || ext === '.csv') {
    return buildSpreadsheetPreview(buffer, fileName, ext);
  }
  if (ext === '.docx') {
    return buildDocxPreview(buffer, fileName);
  }
  if (ext === '.pptx') {
    return buildPptxPreview(buffer, fileName);
  }
  if (ext === '.doc' || ext === '.xls' || ext === '.ppt') {
    return {
      kind: 'unsupported',
      fileName,
      reason: 'LEGACY_OFFICE',
      message: `Legacy ${ext.toUpperCase()} binary format requires saving as ${ext.toUpperCase()}X for direct preview, or download to open locally.`,
    };
  }
  return {
    kind: 'unsupported',
    fileName,
    reason: 'UNSUPPORTED',
    message: `Direct structured preview is not available for ${ext || 'this'} file type.`,
  };
}

import { inflateRawSync } from 'zlib';
import unzipper from 'unzipper';
import { XMLParser } from 'fast-xml-parser';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
});

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

interface VisioShape {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
}

function extractText(node: unknown): string {
  if (!node) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join(' ').trim();
  if (typeof node === 'object') {
    const rec = node as Record<string, unknown>;
    if ('#text' in rec) return String(rec['#text']);
    return Object.values(rec).map(extractText).join(' ').trim();
  }
  return '';
}

function getCellValue(shape: Record<string, unknown>, cellName: string, fallback = 0): number {
  const cells = shape.Cell;
  if (!cells) return fallback;
  const arr = Array.isArray(cells) ? cells : [cells];
  for (const c of arr) {
    if (c && typeof c === 'object' && (c as Record<string, unknown>)['@_N'] === cellName) {
      const val = Number((c as Record<string, unknown>)['@_V']);
      if (!Number.isNaN(val)) return val;
    }
  }
  return fallback;
}

const MAX_VSDX_PAGE_BYTES = 10 * 1024 * 1024;
const MAX_DRAWIO_INFLATE_BYTES = 10 * 1024 * 1024;

async function readZipEntryBounded(
  entry: unzipper.File,
  maxBytes: number,
): Promise<Buffer> {
  const declaredSize = Number(entry.vars?.uncompressedSize || 0);
  if (declaredSize > maxBytes) {
    throw new Error(`Archive entry "${entry.path}" exceeds maximum allowed size`);
  }
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;
    const stream = entry.stream();
    stream.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        if (!settled) {
          settled = true;
          stream.destroy();
          reject(new Error(`Archive entry "${entry.path}" exceeded ${maxBytes} bytes`));
        }
        return;
      }
      chunks.push(chunk);
    });
    stream.on('error', (err) => {
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

/**
 * Converts a .vsdx OOXML file buffer into an SVG string preview by parsing page XML shapes & connectors.
 */
export async function convertVsdxToSvg(buffer: Buffer): Promise<string> {
  const directory = await unzipper.Open.buffer(buffer);
  const pageEntry =
    directory.files.find((f) => /^visio\/pages\/page1\.xml$/i.test(f.path)) ||
    directory.files.find((f) => /^visio\/pages\/page\d+\.xml$/i.test(f.path));

  if (!pageEntry) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="400" viewBox="0 0 900 400">
      <rect width="900" height="400" fill="#f8fafc" stroke="#cbd5e1"/>
      <text x="450" y="190" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#1e3a5f">Visio (.vsdx) Preview</text>
      <text x="450" y="220" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#64748b">No renderable page XML found; download the original .vsdx file to inspect.</text>
    </svg>`;
  }

  const xmlText = (await readZipEntryBounded(pageEntry, MAX_VSDX_PAGE_BYTES)).toString('utf8');
  const parsed = xmlParser.parse(xmlText);
  const pageContents = parsed?.PageContents;
  const rawShapes = pageContents?.Shapes?.Shape;
  const shapeArr = rawShapes ? (Array.isArray(rawShapes) ? rawShapes : [rawShapes]) : [];

  // Visio coordinates are in inches; scale 96 px per inch
  const SCALE = 96;
  const shapes: VisioShape[] = [];
  let maxX = 11 * SCALE;
  let maxY = 8.5 * SCALE;

  for (const s of shapeArr) {
    if (!s || typeof s !== 'object') continue;
    const rec = s as Record<string, unknown>;
    const id = String(rec['@_ID'] || shapes.length + 1);
    const pinX = getCellValue(rec, 'PinX', 2) * SCALE;
    const pinY = getCellValue(rec, 'PinY', 2) * SCALE;
    const w = Math.max(40, getCellValue(rec, 'Width', 1.4) * SCALE);
    const h = Math.max(28, getCellValue(rec, 'Height', 0.7) * SCALE);
    const text = extractText(rec.Text).slice(0, 80);

    shapes.push({ id, x: pinX, y: pinY, w, h, text });
    maxX = Math.max(maxX, pinX + w);
    maxY = Math.max(maxY, pinY + h);
  }

  const width = Math.ceil(maxX + 80);
  const height = Math.ceil(maxY + 80);

  const svgNodes = shapes
    .map((sh) => {
      // Visio Y origin is bottom-left
      const rx = Math.round(sh.x - sh.w / 2 + 40);
      const ry = Math.round(height - sh.y - sh.h / 2 - 40);
      const label = sh.text || `Shape ${sh.id}`;
      return `<g>
        <rect x="${rx}" y="${ry}" width="${Math.round(sh.w)}" height="${Math.round(sh.h)}" rx="6" fill="#eff6ff" stroke="#1e3a5f" stroke-width="1.5"/>
        <text x="${Math.round(rx + sh.w / 2)}" y="${Math.round(ry + sh.h / 2 + 4)}" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#0f172a">${escapeXml(label)}</text>
      </g>`;
    })
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#ffffff"/>
    <g>${svgNodes || `<text x="40" y="60" font-family="sans-serif" font-size="14" fill="#475569">Visio file loaded (${shapes.length} shapes)</text>`}</g>
  </svg>`;
}

export interface ReactFlowExportNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: {
    label?: string;
    deviceType?: string;
    ipAddress?: string;
    vlan?: string;
    [key: string]: unknown;
  };
}

export interface ReactFlowExportEdge {
  id: string;
  source: string;
  target: string;
  data?: {
    label?: string;
    cableType?: string;
    color?: string;
    vlan?: string;
    sourcePort?: string;
    targetPort?: string;
    speed?: string;
    [key: string]: unknown;
  };
}

/**
 * Parses .drawio / mxGraph XML into React Flow nodes and edges.
 */
export function parseDrawioToReactFlow(xmlContent: string): {
  nodes: ReactFlowExportNode[];
  edges: ReactFlowExportEdge[];
} {
  const parsed = xmlParser.parse(xmlContent);
  const diagram = parsed?.mxfile?.diagram;
  const firstDiagram = Array.isArray(diagram) ? diagram[0] : diagram;
  let model = firstDiagram?.mxGraphModel || parsed?.mxGraphModel;

  // Handle standard Draw.io compressed diagram payload (base64 + raw deflate + URI encoded)
  if (!model && firstDiagram && typeof firstDiagram['#text'] === 'string') {
    try {
      const compressed = Buffer.from(firstDiagram['#text'].trim(), 'base64');
      const inflated = inflateRawSync(compressed, { maxOutputLength: MAX_DRAWIO_INFLATE_BYTES }).toString('utf8');
      const decoded = decodeURIComponent(inflated);
      const innerParsed = xmlParser.parse(decoded);
      model = innerParsed?.mxGraphModel || innerParsed;
    } catch {
      // Fallback: ignore if not deflate-compressed mxGraphModel
    }
  }

  const cellsRaw = model?.root?.mxCell;
  const cells = cellsRaw ? (Array.isArray(cellsRaw) ? cellsRaw : [cellsRaw]) : [];

  const nodes: ReactFlowExportNode[] = [];
  const edges: ReactFlowExportEdge[] = [];

  for (const c of cells) {
    if (!c || typeof c !== 'object') continue;
    const cell = c as Record<string, unknown>;
    const id = String(cell['@_id'] ?? '');
    if (!id || id === '0' || id === '1') continue;

    const value = String(cell['@_value'] ?? '').replace(/<[^>]+>/g, ' ').trim();
    const isEdge = cell['@_edge'] === '1';
    const isVertex = cell['@_vertex'] === '1';

    if (isEdge && cell['@_source'] && cell['@_target']) {
      edges.push({
        id: `e-${id}`,
        source: String(cell['@_source']),
        target: String(cell['@_target']),
        data: {
          label: value || undefined,
          cableType: 'LAN',
          color: '#2563eb',
        },
      });
    } else if (isVertex) {
      const geo = (cell.mxGeometry || {}) as Record<string, unknown>;
      const x = Number(geo['@_x'] ?? 100);
      const y = Number(geo['@_y'] ?? 100);
      nodes.push({
        id,
        type: 'networkDevice',
        position: { x: Number.isNaN(x) ? 100 : x, y: Number.isNaN(y) ? 100 : y },
        data: {
          label: value || `Node ${id}`,
          deviceType: 'switch',
        },
      });
    }
  }

  return { nodes, edges };
}

/**
 * Exports React Flow canvas nodes & edges into valid .drawio XML.
 */
export function exportReactFlowToDrawioXml(
  title: string,
  nodes: ReactFlowExportNode[],
  edges: ReactFlowExportEdge[],
): string {
  const vertexCells = nodes
    .map((n) => {
      const label = [n.data?.label, n.data?.ipAddress].filter(Boolean).join('\n');
      const x = Math.round(n.position?.x ?? 0);
      const y = Math.round(n.position?.y ?? 0);
      return `        <mxCell id="${escapeXml(n.id)}" value="${escapeXml(label)}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#eff6ff;strokeColor=#1e3a5f;" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="140" height="64" as="geometry"/>
        </mxCell>`;
    })
    .join('\n');

  const edgeCells = edges
    .map((e) => {
      const parts = [e.data?.sourcePort, e.data?.targetPort].filter(Boolean).join(' ↔ ');
      const label = [e.data?.label, parts, e.data?.speed, e.data?.vlan ? `VLAN ${e.data.vlan}` : '']
        .filter(Boolean)
        .join(' | ');
      const stroke = e.data?.color || '#2563eb';
      return `        <mxCell id="${escapeXml(e.id)}" value="${escapeXml(label)}" style="endArrow=none;html=1;strokeColor=${escapeXml(stroke)};strokeWidth=2;" edge="1" parent="1" source="${escapeXml(e.source)}" target="${escapeXml(e.target)}">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="NIMS" modified="${new Date().toISOString()}" agent="NIMS Diagram Engine" version="1.0">
  <diagram id="nims-diagram" name="${escapeXml(title)}">
    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1600" pageHeight="900">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
${vertexCells}
${edgeCells}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
}

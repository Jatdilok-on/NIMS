import { Node, Position } from '@xyflow/react';

export interface ObstacleRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Point {
  x: number;
  y: number;
}

const DEFAULT_NODE_WIDTH = 172;
const DEFAULT_NODE_HEIGHT = 84;
const PORT_STUB = 22;
const CORNER_RADIUS = 8;

function isShapeOrNote(node: Node): boolean {
  const dt = (node.data as { deviceType?: string } | undefined)?.deviceType;
  if (!dt) return false;
  return dt === 'note' || dt.startsWith('zone_') || dt.startsWith('shape_');
}

function getDirectionVector(pos: Position): Point {
  switch (pos) {
    case Position.Top:
      return { x: 0, y: -1 };
    case Position.Bottom:
      return { x: 0, y: 1 };
    case Position.Left:
      return { x: -1, y: 0 };
    case Position.Right:
      return { x: 1, y: 0 };
  }
}

export function buildObstacleRects(
  nodes: Node[],
  sourceId: string,
  targetId: string,
  otherPad = 10,
  endpointPad = 4,
): ObstacleRect[] {
  const rects: ObstacleRect[] = [];
  for (const n of nodes) {
    if (isShapeOrNote(n)) continue;
    const isEndpoint = n.id === sourceId || n.id === targetId;
    const pad = isEndpoint ? Math.min(endpointPad, otherPad) : otherPad;
    const w =
      n.measured?.width ??
      (typeof n.width === 'number' && n.width > 0 ? n.width : DEFAULT_NODE_WIDTH);
    const h =
      n.measured?.height ??
      (typeof n.height === 'number' && n.height > 0 ? n.height : DEFAULT_NODE_HEIGHT);

    rects.push({
      x1: n.position.x - pad,
      y1: n.position.y - pad,
      x2: n.position.x + w + pad,
      y2: n.position.y + h + pad,
    });
  }
  return rects;
}

function pointInsideAnyObstacle(p: Point, obstacles: ObstacleRect[]): boolean {
  const eps = 0.5;
  return obstacles.some(
    (r) => p.x > r.x1 + eps && p.x < r.x2 - eps && p.y > r.y1 + eps && p.y < r.y2 - eps,
  );
}

/**
 * Checks whether an axis-aligned segment passes strictly through the interior of any obstacle.
 * Touching or running along the padded boundary (x1, x2, y1, y2) is allowed.
 */
function segmentHitsObstacles(a: Point, b: Point, obstacles: ObstacleRect[]): boolean {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  const eps = 0.5;

  for (const r of obstacles) {
    if (Math.abs(a.x - b.x) < eps) {
      // Vertical segment at x = a.x
      if (a.x > r.x1 + eps && a.x < r.x2 - eps && maxY > r.y1 + eps && minY < r.y2 - eps) {
        return true;
      }
    } else if (Math.abs(a.y - b.y) < eps) {
      // Horizontal segment at y = a.y
      if (a.y > r.y1 + eps && a.y < r.y2 - eps && maxX > r.x1 + eps && minX < r.x2 - eps) {
        return true;
      }
    } else {
      // Diagonal fallback check (bounding box overlap)
      if (maxX > r.x1 + eps && minX < r.x2 - eps && maxY > r.y1 + eps && minY < r.y2 - eps) {
        return true;
      }
    }
  }
  return false;
}

export function pathHitsObstacles(pts: Point[], obstacles: ObstacleRect[]): boolean {
  for (let i = 0; i < pts.length - 1; i++) {
    if (segmentHitsObstacles(pts[i], pts[i + 1], obstacles)) {
      return true;
    }
  }
  return false;
}

function dedupeSortedCoords(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) {
    if (out.length === 0 || Math.abs(v - out[out.length - 1]) > 2) {
      out.push(v);
    }
  }
  return out;
}

function simplifyOrthogonalPoints(raw: Point[]): Point[] {
  const pts: Point[] = [];
  for (const p of raw) {
    if (pts.length === 0) {
      pts.push(p);
      continue;
    }
    const last = pts[pts.length - 1];
    if (Math.abs(p.x - last.x) < 0.5 && Math.abs(p.y - last.y) < 0.5) {
      continue;
    }
    pts.push(p);
  }

  let changed = true;
  while (changed && pts.length >= 3) {
    changed = false;
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const c = pts[i + 1];
      const sameX = Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - c.x) < 0.5;
      const sameY = Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - c.y) < 0.5;
      if (sameX || sameY) {
        pts.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return pts;
}

function buildRoundedSvgPath(pts: Point[], radius = CORNER_RADIUS): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;
  if (pts.length === 2) return `M ${pts[0].x},${pts[0].y} L ${pts[1].x},${pts[1].y}`;

  const parts: string[] = [`M ${pts[0].x},${pts[0].y}`];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const next = pts[i + 1];

    const v1x = curr.x - prev.x;
    const v1y = curr.y - prev.y;
    const len1 = Math.hypot(v1x, v1y);

    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;
    const len2 = Math.hypot(v2x, v2y);

    const r = Math.min(radius, len1 / 2, len2 / 2);
    if (r < 1) {
      parts.push(`L ${curr.x},${curr.y}`);
      continue;
    }

    const p1x = curr.x - (v1x / len1) * r;
    const p1y = curr.y - (v1y / len1) * r;
    const p2x = curr.x + (v2x / len2) * r;
    const p2y = curr.y + (v2y / len2) * r;

    parts.push(`L ${p1x},${p1y} Q ${curr.x},${curr.y} ${p2x},${p2y}`);
  }
  const last = pts[pts.length - 1];
  parts.push(`L ${last.x},${last.y}`);
  return parts.join(' ');
}

function findLabelPoint(pts: Point[]): Point {
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1) return pts[0];

  let bestIdx = 0;
  let bestLen = -1;
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    // Prefer middle segments over the tiny stub right against the port handle
    const bonus = i > 0 && i < pts.length - 2 ? 25 : 0;
    if (len + bonus > bestLen) {
      bestLen = len + bonus;
      bestIdx = i;
    }
  }
  return {
    x: (pts[bestIdx].x + pts[bestIdx + 1].x) / 2,
    y: (pts[bestIdx].y + pts[bestIdx + 1].y) / 2,
  };
}

function aStarHananRoute(
  start: Point,
  end: Point,
  obstacles: ObstacleRect[],
  initialDir: Point,
): Point[] | null {
  const rawXs: number[] = [start.x, end.x, (start.x + end.x) / 2];
  const rawYs: number[] = [start.y, end.y, (start.y + end.y) / 2];

  let minX = Math.min(start.x, end.x);
  let maxX = Math.max(start.x, end.x);
  let minY = Math.min(start.y, end.y);
  let maxY = Math.max(start.y, end.y);

  for (const r of obstacles) {
    rawXs.push(r.x1, r.x2);
    rawYs.push(r.y1, r.y2);
    if (r.x1 < minX) minX = r.x1;
    if (r.x2 > maxX) maxX = r.x2;
    if (r.y1 < minY) minY = r.y1;
    if (r.y2 > maxY) maxY = r.y2;
  }

  rawXs.push(minX - 36, maxX + 36);
  rawYs.push(minY - 36, maxY + 36);

  const xs = dedupeSortedCoords(rawXs);
  const ys = dedupeSortedCoords(rawYs);

  const findNearestIdx = (arr: number[], target: number) => {
    let best = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < arr.length; i++) {
      const diff = Math.abs(arr[i] - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = i;
      }
    }
    return best;
  };

  const sx = findNearestIdx(xs, start.x);
  const sy = findNearestIdx(ys, start.y);
  const gx = findNearestIdx(xs, end.x);
  const gy = findNearestIdx(ys, end.y);

  // Direction state: 0 = H, 1 = V
  const initDirCode = Math.abs(initialDir.x) > Math.abs(initialDir.y) ? 0 : 1;
  const cols = xs.length;
  const totalStates = cols * ys.length * 2;
  const stateIdx = (ix: number, iy: number, dir: number) => (iy * cols + ix) * 2 + dir;

  const gScore = new Float64Array(totalStates).fill(Infinity);
  const cameFrom = new Int32Array(totalStates).fill(-1);
  const closed = new Uint8Array(totalStates);

  // Small binary min-heap on [fScore, state]
  const heapF: number[] = [];
  const heapS: number[] = [];
  const pushHeap = (f: number, s: number) => {
    heapF.push(f);
    heapS.push(s);
    let i = heapF.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapF[p] <= heapF[i]) break;
      [heapF[p], heapF[i]] = [heapF[i], heapF[p]];
      [heapS[p], heapS[i]] = [heapS[i], heapS[p]];
      i = p;
    }
  };
  const popHeap = (): number => {
    const top = heapS[0];
    const lastF = heapF.pop()!;
    const lastS = heapS.pop()!;
    if (heapF.length > 0) {
      heapF[0] = lastF;
      heapS[0] = lastS;
      let i = 0;
      const n = heapF.length;
      while (true) {
        let smallest = i;
        const l = i * 2 + 1;
        const r = i * 2 + 2;
        if (l < n && heapF[l] < heapF[smallest]) smallest = l;
        if (r < n && heapF[r] < heapF[smallest]) smallest = r;
        if (smallest === i) break;
        [heapF[i], heapF[smallest]] = [heapF[smallest], heapF[i]];
        [heapS[i], heapS[smallest]] = [heapS[smallest], heapS[i]];
        i = smallest;
      }
    }
    return top;
  };

  const s0 = stateIdx(sx, sy, initDirCode);
  const s1 = stateIdx(sx, sy, 1 - initDirCode);
  gScore[s0] = 0;
  gScore[s1] = 20;
  const h0 = Math.abs(xs[sx] - xs[gx]) + Math.abs(ys[sy] - ys[gy]);
  pushHeap(h0, s0);
  pushHeap(h0 + 20, s1);

  const BEND_COST = 45;
  const DIRS: Array<[number, number, number]> = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 1],
    [0, -1, 1],
  ];

  let goalState = -1;
  let guard = 0;
  while (heapF.length > 0 && guard++ < 25000) {
    const curr = popHeap();
    if (closed[curr]) continue;
    closed[curr] = 1;

    const dir = curr & 1;
    const cell = curr >> 1;
    const cx = cell % cols;
    const cy = Math.floor(cell / cols);

    if (cx === gx && cy === gy) {
      goalState = curr;
      break;
    }

    const currPt: Point = { x: xs[cx], y: ys[cy] };
    for (const [dx, dy, nextDir] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= ys.length) continue;

      const nextPt: Point = { x: xs[nx], y: ys[ny] };
      if (segmentHitsObstacles(currPt, nextPt, obstacles)) continue;

      const stepDist = Math.abs(nextPt.x - currPt.x) + Math.abs(nextPt.y - currPt.y);
      const bendPenalty = nextDir !== dir ? BEND_COST : 0;
      const tentative = gScore[curr] + stepDist + bendPenalty;
      const ns = stateIdx(nx, ny, nextDir);

      if (tentative < gScore[ns]) {
        gScore[ns] = tentative;
        cameFrom[ns] = curr;
        const h = Math.abs(nextPt.x - xs[gx]) + Math.abs(nextPt.y - ys[gy]);
        pushHeap(tentative + h, ns);
      }
    }
  }

  if (goalState === -1) return null;

  const rev: Point[] = [];
  let trace = goalState;
  while (trace !== -1) {
    const cell = trace >> 1;
    const ix = cell % cols;
    const iy = Math.floor(cell / cols);
    rev.push({ x: xs[ix], y: ys[iy] });
    trace = cameFrom[trace];
  }
  rev.reverse();
  if (rev.length > 0) {
    rev[0] = start;
    rev[rev.length - 1] = end;
  }
  return rev;
}

export function computeSmartOrthogonalEdgePath({
  sourceId,
  targetId,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  nodes,
  parallelShift = 0,
}: {
  sourceId: string;
  targetId: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  nodes: Node[];
  parallelShift?: number;
}): { path: string; labelX: number; labelY: number; avoidedObstacle: boolean } {
  const srcVec = getDirectionVector(sourcePosition);
  const tgtVec = getDirectionVector(targetPosition);
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;

  const isFacing = srcVec.x === -tgtVec.x && srcVec.y === -tgtVec.y;
  const isPerpendicular = srcVec.x * tgtVec.x + srcVec.y * tgtVec.y === 0;
  const facingDist = dx * srcVec.x + dy * srcVec.y;
  const fwdSrc = dx * srcVec.x + dy * srcVec.y;
  const fwdTgt = -dx * tgtVec.x + -dy * tgtVec.y;

  // Shrink port stubs automatically when nodes are placed close together so stubs never overshoot
  let srcStub = PORT_STUB;
  let tgtStub = PORT_STUB;
  if (isFacing && facingDist > 0) {
    const clamped = Math.max(2, Math.min(PORT_STUB, facingDist * 0.38));
    srcStub = clamped;
    tgtStub = clamped;
  } else if (isPerpendicular) {
    if (fwdSrc > 0) srcStub = Math.max(3, Math.min(PORT_STUB, fwdSrc * 0.45));
    if (fwdTgt > 0) tgtStub = Math.max(3, Math.min(PORT_STUB, fwdTgt * 0.45));
  }

  const pStart: Point = {
    x: sourceX + srcVec.x * srcStub,
    y: sourceY + srcVec.y * srcStub,
  };
  const pEnd: Point = {
    x: targetX + tgtVec.x * tgtStub,
    y: targetY + tgtVec.y * tgtStub,
  };

  // Clamp parallel shift inside tight facing gaps so parallel lines don't flip backward
  const effectiveShift =
    isFacing && facingDist > 0
      ? Math.max(-facingDist * 0.22, Math.min(facingDist * 0.22, parallelShift))
      : parallelShift;

  const tightObstacles = buildObstacleRects(nodes, sourceId, targetId, 4, 2);
  const normalObstacles = buildObstacleRects(nodes, sourceId, targetId, 10, 4);
  const routeObstacles =
    pointInsideAnyObstacle(pStart, normalObstacles) || pointInsideAnyObstacle(pEnd, normalObstacles)
      ? tightObstacles
      : normalObstacles;

  // Helper: ensure candidate exits source & enters target in the port's forward direction
  const respectsPortDirections = (pts: Point[]): boolean => {
    if (pts.length < 2) return true;
    const first = pts[1];
    const lastPrev = pts[pts.length - 2];
    const dotOut = (first.x - sourceX) * srcVec.x + (first.y - sourceY) * srcVec.y;
    const dotIn = (lastPrev.x - targetX) * tgtVec.x + (lastPrev.y - targetY) * tgtVec.y;
    return dotOut >= -0.5 && dotIn >= -0.5;
  };

  // Fast-path: crisp straight line when facing ports are aligned & unobstructed
  const alignedFacing =
    isFacing &&
    facingDist > 0 &&
    effectiveShift === 0 &&
    ((srcVec.x === 0 && Math.abs(dx) < 1.5) || (srcVec.y === 0 && Math.abs(dy) < 1.5));
  if (alignedFacing) {
    const straightPts = [{ x: sourceX, y: sourceY }, { x: targetX, y: targetY }];
    if (!segmentHitsObstacles(pStart, pEnd, tightObstacles)) {
      const lbl = findLabelPoint(straightPts);
      return {
        path: buildRoundedSvgPath(straightPts),
        labelX: lbl.x,
        labelY: lbl.y,
        avoidedObstacle: false,
      };
    }
  }

  // Fast-path: crisp 1-bend L-route for perpendicular ports with positive forward clearance
  const simpleCandidates: Point[][] = [];
  if (isPerpendicular && fwdSrc >= 4 && fwdTgt >= 4 && effectiveShift === 0) {
    const lCorner: Point =
      srcVec.x !== 0 ? { x: targetX, y: sourceY } : { x: sourceX, y: targetY };
    simpleCandidates.push([lCorner]);
  }

  // Standard 3/4-segment orthogonal routes matching port directions
  const midX = (pStart.x + pEnd.x) / 2 + effectiveShift;
  const midY = (pStart.y + pEnd.y) / 2 + effectiveShift;

  const candVFirst: Point[] = [
    pStart,
    { x: pStart.x, y: midY },
    { x: pEnd.x, y: midY },
    pEnd,
  ];
  const candHFirst: Point[] = [
    pStart,
    { x: midX, y: pStart.y },
    { x: midX, y: pEnd.y },
    pEnd,
  ];

  // Prefer horizontal-midpoint first when leaving/entering Left/Right, else vertical-midpoint first
  const horizPorts =
    (sourcePosition === Position.Left || sourcePosition === Position.Right) &&
    (targetPosition === Position.Left || targetPosition === Position.Right);
  simpleCandidates.push(...(horizPorts ? [candHFirst, candVFirst] : [candVFirst, candHFirst]));

  const candidateCheckObstacles =
    isFacing && facingDist > 0 && facingDist < 52 ? tightObstacles : routeObstacles;

  for (const cand of simpleCandidates) {
    const fullPts = simplifyOrthogonalPoints([
      { x: sourceX, y: sourceY },
      ...cand,
      { x: targetX, y: targetY },
    ]);
    if (!respectsPortDirections(fullPts)) continue;
    // Check interior path excluding port entry/exit stubs directly attached to source/target
    const checkPts =
      fullPts.length >= 4
        ? fullPts.slice(1, fullPts.length - 1)
        : fullPts.length === 3
        ? [pStart, fullPts[1], pEnd]
        : [pStart, pEnd];
    if (!pathHitsObstacles(checkPts, candidateCheckObstacles)) {
      const lbl = findLabelPoint(fullPts);
      return {
        path: buildRoundedSvgPath(fullPts),
        labelX: lbl.x,
        labelY: lbl.y,
        avoidedObstacle: false,
      };
    }
  }

  // Run Hanan-Grid A* obstacle-avoiding router (gradually relaxing padding for tightly packed nodes)
  const routed =
    aStarHananRoute(pStart, pEnd, routeObstacles, srcVec) ??
    aStarHananRoute(pStart, pEnd, tightObstacles, srcVec) ??
    aStarHananRoute(pStart, pEnd, buildObstacleRects(nodes, sourceId, targetId, 1, 1), srcVec);
  if (routed && routed.length >= 2) {
    const fullPts = simplifyOrthogonalPoints([
      { x: sourceX, y: sourceY },
      ...routed,
      { x: targetX, y: targetY },
    ]);
    const lbl = findLabelPoint(fullPts);
    return {
      path: buildRoundedSvgPath(fullPts),
      labelX: lbl.x,
      labelY: lbl.y,
      avoidedObstacle: true,
    };
  }

  // Safe deterministic fallback if completely boxed in
  const fallbackCand =
    simpleCandidates.find((cand) =>
      respectsPortDirections(
        simplifyOrthogonalPoints([{ x: sourceX, y: sourceY }, ...cand, { x: targetX, y: targetY }]),
      ),
    ) || (horizPorts ? candHFirst : candVFirst);
  const fallbackPts = simplifyOrthogonalPoints([
    { x: sourceX, y: sourceY },
    ...fallbackCand,
    { x: targetX, y: targetY },
  ]);
  const lbl = findLabelPoint(fallbackPts);
  return {
    path: buildRoundedSvgPath(fallbackPts),
    labelX: lbl.x,
    labelY: lbl.y,
    avoidedObstacle: false,
  };
}

'use client';

import React from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  EdgeProps,
  Handle,
  NodeProps,
  NodeResizer,
  Position,
  useEdges,
  useNodes,
} from '@xyflow/react';
import { computeSmartOrthogonalEdgePath } from './edgeRouting';
import {
  Cloud,
  Globe,
  HardDrive,
  Laptop,
  Radio,
  Router,
  Server,
  Shield,
  StickyNote,
  Wifi,
} from 'lucide-react';
import {
  TechBarcodeIcon,
  TechEsxiIcon,
  TechIpCamIcon,
  TechNasIcon,
  TechNvrIcon,
  TechPcIcon,
  TechPlcIcon,
  TechPrinterIcon,
  TechTvIcon,
  TechUpsIcon,
  TechVmIcon,
} from '@/components/icons/TechIcons';

export interface NetworkNodeData {
  label: string;
  deviceType: string;
  deviceId?: string;
  model?: string;
  ipAddress?: string;
  macAddress?: string;
  serialNumber?: string;
  location?: string;
  vlan?: string;
  status?: string;
  noteText?: string;
  customIconUrl?: string;
  fillColor?: string;
  fillOpacity?: number;
  borderColor?: string;
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'none';
  borderWidth?: number;
  textColor?: string;
  labelAlign?: 'top-left' | 'center';
  [key: string]: unknown;
}

export function isGeneralShapeType(deviceType?: string | null): boolean {
  return Boolean(deviceType && (deviceType.startsWith('zone_') || deviceType.startsWith('shape_')));
}

function hexToRgba(hex: string, opacityPct: number): string {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return `rgba(59, 130, 246, ${Math.max(0, Math.min(100, opacityPct)) / 100})`;
  }
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const a = Math.max(0, Math.min(100, opacityPct)) / 100;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

const NODE_META: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; bg: string; border: string }
> = {
  switch: { icon: HardDrive, bg: 'bg-blue-50 dark:bg-blue-950/70', border: 'border-blue-600' },
  router: { icon: Router, bg: 'bg-indigo-50 dark:bg-indigo-950/70', border: 'border-indigo-600' },
  firewall: { icon: Shield, bg: 'bg-red-50 dark:bg-red-950/70', border: 'border-red-600' },
  access_point: { icon: Wifi, bg: 'bg-cyan-50 dark:bg-cyan-950/70', border: 'border-cyan-600' },
  server: { icon: Server, bg: 'bg-slate-100 dark:bg-slate-800', border: 'border-slate-700' },
  cloud: { icon: Cloud, bg: 'bg-sky-50 dark:bg-sky-950/70', border: 'border-sky-500' },
  internet: { icon: Globe, bg: 'bg-emerald-50 dark:bg-emerald-950/70', border: 'border-emerald-600' },
  plc: { icon: TechPlcIcon, bg: 'bg-amber-50 dark:bg-amber-950/70', border: 'border-amber-600' },
  esxi: { icon: TechEsxiIcon, bg: 'bg-emerald-50 dark:bg-emerald-950/70', border: 'border-emerald-600' },
  vm: { icon: TechVmIcon, bg: 'bg-purple-50 dark:bg-purple-950/70', border: 'border-purple-600' },
  nas: { icon: TechNasIcon, bg: 'bg-sky-50 dark:bg-sky-950/70', border: 'border-sky-600' },
  ups: { icon: TechUpsIcon, bg: 'bg-lime-50 dark:bg-lime-950/70', border: 'border-lime-600' },
  ip_cam: { icon: TechIpCamIcon, bg: 'bg-rose-50 dark:bg-rose-950/70', border: 'border-rose-600' },
  pc: { icon: TechPcIcon, bg: 'bg-violet-50 dark:bg-violet-950/70', border: 'border-violet-600' },
  nvr: { icon: TechNvrIcon, bg: 'bg-orange-50 dark:bg-orange-950/70', border: 'border-orange-600' },
  tv: { icon: TechTvIcon, bg: 'bg-cyan-50 dark:bg-cyan-950/70', border: 'border-cyan-600' },
  printer: { icon: TechPrinterIcon, bg: 'bg-sky-50 dark:bg-sky-950/70', border: 'border-sky-600' },
  barcode: { icon: TechBarcodeIcon, bg: 'bg-teal-50 dark:bg-teal-950/70', border: 'border-teal-600' },
  wireless_bridge: { icon: Radio, bg: 'bg-teal-50 dark:bg-teal-950/70', border: 'border-teal-600' },
  client: { icon: Laptop, bg: 'bg-violet-50 dark:bg-violet-950/70', border: 'border-violet-600' },
  custom_icon: { icon: HardDrive, bg: 'bg-slate-50 dark:bg-slate-800', border: 'border-slate-500' },
};

const STATUS_DOT: Record<string, string> = {
  ONLINE: 'bg-emerald-500',
  OFFLINE: 'bg-red-500',
  MAINTENANCE: 'bg-amber-500',
  UNKNOWN: 'bg-slate-400',
};

export function NetworkDeviceNode({ data, selected }: NodeProps) {
  const nd = data as unknown as NetworkNodeData;

  if (isGeneralShapeType(nd.deviceType)) {
    const fillHex = nd.fillColor || '#3b82f6';
    const opacity = nd.fillOpacity ?? (nd.deviceType === 'shape_badge' ? 90 : 18);
    const borderHex = nd.borderColor || fillHex;
    const bStyle =
      nd.borderStyle || (nd.deviceType.startsWith('zone_') ? 'dashed' : 'solid');
    const bWidth = nd.borderWidth ?? 2;
    const bgRgba = hexToRgba(fillHex, opacity);
    const alignTopLeft =
      nd.labelAlign === 'top-left' ||
      (!nd.labelAlign && nd.deviceType.startsWith('zone_'));

    if (nd.deviceType === 'shape_diamond') {
      const dashArray =
        bStyle === 'dashed' ? '6 4' : bStyle === 'dotted' ? '2 4' : undefined;
      return (
        <div className="w-full h-full min-w-[100px] min-h-[70px] relative flex items-center justify-center">
          <NodeResizer
            isVisible={selected}
            minWidth={70}
            minHeight={50}
            color="#2563eb"
            handleStyle={{ width: 8, height: 8, borderRadius: 2 }}
          />
          <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-blue-500/70" />
          <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-blue-500/70" />
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full overflow-visible pointer-events-none"
          >
            <polygon
              points="50,2 98,50 50,98 2,50"
              fill={bgRgba}
              stroke={bStyle === 'none' ? 'none' : borderHex}
              strokeWidth={bWidth}
              strokeDasharray={dashArray}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <span
            className="relative z-10 px-4 text-xs font-bold text-center break-words select-none"
            style={{ color: nd.textColor || undefined }}
          >
            {nd.label || 'Diamond'}
          </span>
          <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-blue-500/70" />
          <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-blue-500/70" />
        </div>
      );
    }

    const radiusClass =
      nd.deviceType === 'shape_circle'
        ? 'rounded-full'
        : nd.deviceType === 'zone_rounded' || nd.deviceType === 'shape_badge'
        ? 'rounded-2xl'
        : 'rounded-lg';

    return (
      <div
        className={`w-full h-full min-w-[90px] min-h-[48px] relative transition-shadow ${radiusClass} ${
          alignTopLeft ? 'p-3 flex items-start justify-start' : 'p-3 flex items-center justify-center'
        } ${selected ? 'ring-2 ring-blue-500/50' : ''}`}
        style={{
          backgroundColor: bgRgba,
          border: bStyle === 'none' ? 'none' : `${bWidth}px ${bStyle} ${borderHex}`,
          color: nd.textColor || undefined,
        }}
      >
        <NodeResizer
          isVisible={selected}
          minWidth={60}
          minHeight={36}
          color="#2563eb"
          handleStyle={{ width: 8, height: 8, borderRadius: 2 }}
        />
        <Handle type="target" position={Position.Top} className="!w-2 !h-2 !opacity-60 !bg-blue-500" />
        <Handle type="target" position={Position.Left} className="!w-2 !h-2 !opacity-60 !bg-blue-500" />

        {alignTopLeft ? (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-white/85 dark:bg-slate-900/85 backdrop-blur-xs border border-slate-200/80 dark:border-slate-700/80 shadow-xs text-xs font-bold select-none">
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: borderHex }}
            />
            <span style={{ color: nd.textColor || undefined }}>{nd.label || 'Zone'}</span>
          </div>
        ) : (
          <div
            className="text-xs font-bold text-center break-words select-none"
            style={{ color: nd.textColor || undefined }}
          >
            {nd.label || 'Shape'}
          </div>
        )}

        <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !opacity-60 !bg-blue-500" />
        <Handle type="source" position={Position.Right} className="!w-2 !h-2 !opacity-60 !bg-blue-500" />
      </div>
    );
  }

  if (nd.deviceType === 'note') {
    return (
      <div
        className={`w-full h-full px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/80 border text-xs min-w-[140px] shadow-xs ${
          selected ? 'border-blue-600 ring-2 ring-blue-500/30' : 'border-amber-300'
        }`}
      >
        <NodeResizer
          isVisible={selected}
          minWidth={120}
          minHeight={60}
          color="#d97706"
          handleStyle={{ width: 8, height: 8, borderRadius: 2 }}
        />
        <div className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-300 mb-1">
          <StickyNote className="h-3.5 w-3.5" />
          <span>{nd.label || 'Note'}</span>
        </div>
        <div className="whitespace-pre-wrap text-slate-700 dark:text-slate-200">
          {nd.noteText || 'Double-click or edit in inspector'}
        </div>
      </div>
    );
  }

  const meta = NODE_META[nd.deviceType] || NODE_META.switch;
  const Icon = meta.icon;

  return (
    <div
      className={`min-w-[156px] max-w-[210px] rounded-xl bg-white dark:bg-slate-900 border-2 shadow-sm transition ${
        selected ? 'border-blue-600 ring-2 ring-blue-500/30' : meta.border
      }`}
    >
      <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-blue-600" />
      <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-blue-600" />

      <div className={`px-2.5 py-1.5 rounded-t-[10px] flex items-center justify-between gap-2 ${meta.bg}`}>
        <div className="flex items-center gap-1.5 min-w-0">
          {nd.customIconUrl ? (
            <img src={nd.customIconUrl} alt="" className="h-4 w-4 object-contain" />
          ) : (
            <Icon className="h-4 w-4 shrink-0 text-[#0f2942] dark:text-blue-300" />
          )}
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 truncate">
            {nd.deviceType?.replace('_', ' ')}
          </span>
        </div>
        {nd.status && (
          <span
            className={`h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[nd.status] || 'bg-slate-400'}`}
            title={nd.status}
          />
        )}
      </div>

      <div className="px-2.5 py-2 text-center">
        <div className="text-xs font-bold truncate text-slate-900 dark:text-slate-100">
          {nd.label || 'Device'}
        </div>
        {nd.ipAddress && (
          <div className="text-[11px] font-mono text-blue-600 dark:text-blue-400 truncate mt-0.5">
            {nd.ipAddress}
          </div>
        )}
        {nd.model && (
          <div className="text-[10px] text-slate-500 truncate">{nd.model}</div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-blue-600" />
      <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-blue-600" />
    </div>
  );
}

export function NetworkLinkEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  const nodes = useNodes();
  const edges = useEdges();

  // Separate parallel links between the same pair of nodes cleanly
  const parallelGroup = edges.filter(
    (e) =>
      (e.source === source && e.target === target) ||
      (e.source === target && e.target === source),
  );
  const pairIndex = parallelGroup.findIndex((e) => e.id === id);
  const parallelShift =
    parallelGroup.length > 1 && pairIndex >= 0
      ? (pairIndex - (parallelGroup.length - 1) / 2) * 16
      : 0;

  const { path: edgePath, labelX, labelY } = computeSmartOrthogonalEdgePath({
    sourceId: source,
    targetId: target,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    nodes,
    parallelShift,
  });

  const ed = (data || {}) as {
    cableType?: string;
    color?: string;
    vlan?: string;
    sourcePort?: string;
    targetPort?: string;
    speed?: string;
    label?: string;
  };

  const strokeColor = ed.color || (ed.cableType === 'FIBER' ? '#f59e0b' : '#2563eb');
  const ports = [ed.sourcePort, ed.targetPort].filter(Boolean).join(' ↔ ');
  const summaryParts = [ed.label, ports, ed.speed, ed.vlan ? `VLAN ${ed.vlan}` : ''].filter(Boolean);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: strokeColor,
          strokeWidth: selected ? 3.5 : 2.2,
          strokeDasharray: ed.cableType === 'WIRELESS' ? '6 4' : undefined,
        }}
      />
      {summaryParts.length > 0 && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="px-2 py-0.5 rounded bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 text-[10px] font-mono shadow-xs whitespace-nowrap"
          >
            {summaryParts.join(' | ')}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

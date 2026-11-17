'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  addEdge,
  Background,
  BackgroundVariant,
  Connection,
  Controls,
  Edge,
  MiniMap,
  Node,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  ViewportPortal,
} from '@xyflow/react';
import { toPng } from 'html-to-image';
import {
  CheckCircle2,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Download,
  FileUp,
  History,
  Image as ImageIcon,
  Layers,
  Palette,
  Plus,
  Redo2,
  Save,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import { apiFetch, apiUploadWithProgress, ApiError } from '@/lib/api';
import { Device, DeviceCategory, DeviceStatus, DiagramItem } from '@/lib/types';
import {
  isGeneralShapeType,
  NetworkDeviceNode,
  NetworkLinkEdge,
  NetworkNodeData,
} from './NetworkNodes';

const nodeTypes = { networkDevice: NetworkDeviceNode };
const edgeTypes = { networkLink: NetworkLinkEdge };

const PALETTE_ITEMS = [
  { type: 'switch', label: 'Switch' },
  { type: 'router', label: 'Router' },
  { type: 'firewall', label: 'Firewall' },
  { type: 'access_point', label: 'Access Point' },
  { type: 'server', label: 'Server' },
  { type: 'esxi', label: 'ESXi Host' },
  { type: 'vm', label: 'VM' },
  { type: 'nas', label: 'NAS' },
  { type: 'ups', label: 'UPS' },
  { type: 'ip_cam', label: 'IP Camera' },
  { type: 'pc', label: 'PC' },
  { type: 'nvr', label: 'NVR' },
  { type: 'tv', label: 'TV / Display' },
  { type: 'printer', label: 'Printer' },
  { type: 'barcode', label: 'Barcode' },
  { type: 'plc', label: 'PLC' },
  { type: 'cloud', label: 'Cloud' },
  { type: 'internet', label: 'Internet' },
  { type: 'wireless_bridge', label: 'Wireless Bridge' },
  { type: 'client', label: 'Client' },
  { type: 'custom_icon', label: 'Custom Icon' },
  { type: 'note', label: 'Note / Text' },
];

const GENERAL_SHAPES: Array<{
  type: string;
  label: string;
  width: number;
  height: number;
  fillColor: string;
  fillOpacity: number;
  borderStyle: 'solid' | 'dashed';
  zIndex: number;
  textColor?: string;
}> = [
  {
    type: 'zone_rect',
    label: 'Rectangle Zone',
    width: 340,
    height: 220,
    fillColor: '#3b82f6',
    fillOpacity: 15,
    borderStyle: 'dashed',
    zIndex: -10,
  },
  {
    type: 'zone_rounded',
    label: 'Rounded Zone',
    width: 340,
    height: 220,
    fillColor: '#10b981',
    fillOpacity: 15,
    borderStyle: 'dashed',
    zIndex: -10,
  },
  {
    type: 'shape_circle',
    label: 'Circle / Oval',
    width: 220,
    height: 220,
    fillColor: '#8b5cf6',
    fillOpacity: 16,
    borderStyle: 'solid',
    zIndex: -10,
  },
  {
    type: 'shape_diamond',
    label: 'Diamond',
    width: 160,
    height: 110,
    fillColor: '#f59e0b',
    fillOpacity: 20,
    borderStyle: 'solid',
    zIndex: 0,
  },
  {
    type: 'shape_badge',
    label: 'Label / Pill',
    width: 160,
    height: 46,
    fillColor: '#0f2942',
    fillOpacity: 92,
    borderStyle: 'solid',
    zIndex: 5,
    textColor: '#ffffff',
  },
];

const ZONE_COLOR_PRESETS = [
  '#3b82f6',
  '#06b6d4',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#64748b',
  '#0f2942',
];

function mapIconTypeToCategory(deviceType: string): DeviceCategory {
  switch (deviceType) {
    case 'access_point':
      return 'ACCESS_POINT';
    case 'wireless_bridge':
    case 'client':
      return 'AP_CLIENT';
    case 'wlc':
      return 'WLC';
    case 'server':
      return 'SERVER';
    case 'plc':
      return 'PLC';
    case 'esxi':
      return 'ESXI';
    case 'vm':
      return 'VM';
    case 'nas':
      return 'NAS';
    case 'ups':
      return 'UPS';
    case 'ip_cam':
      return 'IP_CAM';
    case 'pc':
      return 'PC';
    case 'nvr':
      return 'NVR';
    case 'tv':
      return 'TV';
    case 'printer':
      return 'PRINTER';
    case 'barcode':
      return 'BARCODE';
    default:
      return 'SWITCH';
  }
}

const HARDWARE_ICON_TYPES = new Set([
  'switch',
  'router',
  'firewall',
  'access_point',
  'server',
  'esxi',
  'vm',
  'nas',
  'ups',
  'ip_cam',
  'pc',
  'nvr',
  'tv',
  'printer',
  'barcode',
  'plc',
  'wireless_bridge',
  'client',
  'custom_icon',
]);

function mapCategoryToIconType(category: string): string {
  switch (category) {
    case 'SWITCH':
      return 'switch';
    case 'ACCESS_POINT':
      return 'access_point';
    case 'AP_CLIENT':
      return 'wireless_bridge';
    case 'WLC':
      return 'router';
    case 'SERVER':
      return 'server';
    case 'PLC':
      return 'plc';
    case 'ESXI':
      return 'esxi';
    case 'VM':
      return 'vm';
    case 'NAS':
      return 'nas';
    case 'UPS':
      return 'ups';
    case 'IP_CAM':
      return 'ip_cam';
    case 'PC':
      return 'pc';
    case 'NVR':
      return 'nvr';
    case 'TV':
      return 'tv';
    case 'PRINTER':
      return 'printer';
    case 'BARCODE':
      return 'barcode';
    default:
      return 'switch';
  }
}

function InnerDiagramEditor({
  diagram,
  siteDevices,
  canEdit,
  onSaved,
  onClose,
}: {
  diagram: DiagramItem;
  siteDevices: Device[];
  canEdit: boolean;
  onSaved: (updated: DiagramItem) => void;
  onClose: () => void;
}) {
  const { screenToFlowPosition } = useReactFlow();
  const canvasWrapperRef = useRef<HTMLDivElement>(null);

  const initialNodes = ((diagram.canvasData?.nodes as Node[]) || []).map((n) => ({
    ...n,
    type: 'networkDevice',
  }));
  const initialEdges = ((diagram.canvasData?.edges as Edge[]) || []).map((e) => ({
    ...e,
    type: 'networkLink',
  }));

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);
  const [backgroundImage, setBackgroundImage] = useState<string | null>(
    diagram.canvasData?.backgroundImage || null,
  );
  const [backgroundColor, setBackgroundColor] = useState<string>(
    diagram.canvasData?.backgroundColor || '',
  );
  const [backgroundOpacity, setBackgroundOpacity] = useState<number>(
    diagram.canvasData?.backgroundOpacity ?? 75,
  );
  const [backgroundWidth, setBackgroundWidth] = useState<number>(
    diagram.canvasData?.backgroundWidth ?? 1600,
  );
  const [backgroundX, setBackgroundX] = useState<number>(
    diagram.canvasData?.backgroundX ?? 0,
  );
  const [backgroundY, setBackgroundY] = useState<number>(
    diagram.canvasData?.backgroundY ?? 0,
  );
  const [gridVariant, setGridVariant] = useState<'dots' | 'lines' | 'cross' | 'none'>(
    diagram.canvasData?.gridVariant || 'dots',
  );

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [addingDevice, setAddingDevice] = useState(false);
  const [editorNotice, setEditorNotice] = useState<string | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [showImportMenu, setShowImportMenu] = useState(false);
  const [showBgMenu, setShowBgMenu] = useState(false);
  const [deviceFilter, setDeviceFilter] = useState('');
  const [inventoryDevices, setInventoryDevices] = useState<Device[]>(siteDevices);
  const clipboardRef = useRef<{ nodes: Node[]; edges: Edge[]; pasteCount: number } | null>(null);
  const importMenuRef = useRef<HTMLDivElement>(null);
  const bgMenuRef = useRef<HTMLDivElement>(null);
  const bgImageInputRef = useRef<HTMLInputElement>(null);
  const drawioImportInputRef = useRef<HTMLInputElement>(null);
  const drawioImportModeRef = useRef<'merge' | 'replace'>('merge');
  const iconImportInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setInventoryDevices(siteDevices);
  }, [siteDevices]);

  // Undo / Redo History
  const [history, setHistory] = useState<Array<{ nodes: Node[]; edges: Edge[] }>>([
    { nodes: initialNodes, edges: initialEdges },
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const pushHistory = useCallback(
    (nextNodes: Node[], nextEdges: Edge[]) => {
      setHistory((prev) => {
        const sliced = prev.slice(0, historyIndex + 1);
        const next = [...sliced, { nodes: nextNodes, edges: nextEdges }].slice(-30);
        setHistoryIndex(next.length - 1);
        return next;
      });
    },
    [historyIndex],
  );

  const handleUndo = () => {
    if (historyIndex <= 0) return;
    const prev = history[historyIndex - 1];
    setNodes(prev.nodes);
    setEdges(prev.edges);
    setHistoryIndex(historyIndex - 1);
  };

  const handleRedo = () => {
    if (historyIndex >= history.length - 1) return;
    const next = history[historyIndex + 1];
    setNodes(next.nodes);
    setEdges(next.edges);
    setHistoryIndex(historyIndex + 1);
  };

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!canEdit) return;
      setEdges((eds) => {
        const next = addEdge(
          {
            ...connection,
            type: 'networkLink',
            data: { cableType: 'LAN', color: '#2563eb', speed: '1G' },
          },
          eds,
        );
        pushHistory(nodes, next);
        return next;
      });
    },
    [canEdit, setEdges, nodes, pushHistory],
  );

  const addPaletteNode = (deviceType: string, label: string, pos?: { x: number; y: number }) => {
    if (!canEdit) return;
    const id = `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const shapePreset = GENERAL_SHAPES.find((s) => s.type === deviceType);

    if (shapePreset) {
      const newNode: Node = {
        id,
        type: 'networkDevice',
        position: pos || { x: 140 + (nodes.length % 4) * 35, y: 100 + (nodes.length % 4) * 35 },
        zIndex: shapePreset.zIndex,
        style: { width: shapePreset.width, height: shapePreset.height },
        data: {
          label,
          deviceType,
          fillColor: shapePreset.fillColor,
          fillOpacity: shapePreset.fillOpacity,
          borderColor: shapePreset.fillColor,
          borderStyle: shapePreset.borderStyle,
          borderWidth: 2,
          textColor: shapePreset.textColor,
          labelAlign: deviceType.startsWith('zone_') ? 'top-left' : 'center',
          syncToInventory: false,
        },
      };
      const nextNodes = [...nodes, newNode];
      setNodes(nextNodes);
      pushHistory(nextNodes, edges);
      setSelectedNodeId(id);
      setSelectedEdgeId(null);
      return;
    }

    const isHardware = HARDWARE_ICON_TYPES.has(deviceType);
    const newNode: Node = {
      id,
      type: 'networkDevice',
      position: pos || { x: 180 + (nodes.length % 5) * 45, y: 120 + (nodes.length % 5) * 40 },
      data: {
        label,
        deviceType,
        inventoryCategory: isHardware ? mapIconTypeToCategory(deviceType) : undefined,
        syncToInventory: isHardware,
        status: deviceType === 'note' ? undefined : 'ONLINE',
      },
    };
    const nextNodes = [...nodes, newNode];
    setNodes(nextNodes);
    pushHistory(nextNodes, edges);
    setSelectedNodeId(id);
    setSelectedEdgeId(null);
  };

  const addInventoryDeviceNode = (dev: Device, pos?: { x: number; y: number }) => {
    if (!canEdit) return;
    const id = `dev-${dev.id}-${Date.now().toString(36).slice(-4)}`;
    const newNode: Node = {
      id,
      type: 'networkDevice',
      position: pos || { x: 220 + (nodes.length % 5) * 45, y: 140 + (nodes.length % 5) * 40 },
      data: {
        label: dev.name,
        deviceType: mapCategoryToIconType(dev.category),
        deviceId: dev.id,
        model: dev.model || undefined,
        ipAddress: dev.managementIp || undefined,
        macAddress: dev.macAddress || undefined,
        serialNumber: dev.serialNumber || undefined,
        location: dev.location || undefined,
        vlan: dev.vlan || undefined,
        status: dev.status,
      },
    };
    const nextNodes = [...nodes, newNode];
    setNodes(nextNodes);
    pushHistory(nextNodes, edges);
    setSelectedNodeId(id);
    setSelectedEdgeId(null);
  };

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (!canEdit) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });

      const paletteJson = event.dataTransfer.getData('application/nims-palette');
      if (paletteJson) {
        const p = JSON.parse(paletteJson) as { type: string; label: string };
        addPaletteNode(p.type, p.label, position);
        return;
      }

      const deviceJson = event.dataTransfer.getData('application/nims-device');
      if (deviceJson) {
        const dev = JSON.parse(deviceJson) as Device;
        addInventoryDeviceNode(dev, position);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEdit, screenToFlowPosition, nodes, edges],
  );

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null;
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId) || null;

  const getSelectedNodes = useCallback(() => {
    return nodes.filter((n) => n.selected || n.id === selectedNodeId);
  }, [nodes, selectedNodeId]);

  const insertClonedItems = useCallback(
    (sourceNodes: Node[], sourceEdges: Edge[], offset: number, noticePrefix: string) => {
      if (!canEdit || sourceNodes.length === 0) return;
      const now = Date.now();
      const idMap = new Map<string, string>();
      const clonedNodes: Node[] = sourceNodes.map((n, idx) => {
        const newId = `node-${now}-${idx}-${Math.random().toString(36).slice(2, 6)}`;
        idMap.set(n.id, newId);
        const rawData = (n.data || {}) as Record<string, unknown>;
        return {
          ...n,
          id: newId,
          position: { x: n.position.x + offset, y: n.position.y + offset },
          selected: true,
          data: {
            ...rawData,
            deviceId: undefined,
            syncToInventory: rawData.deviceId ? false : rawData.syncToInventory,
          },
        };
      });

      const clonedEdges: Edge[] = sourceEdges
        .filter((e) => idMap.has(e.source) && idMap.has(e.target))
        .map((e, idx) => ({
          ...e,
          id: `edge-${now}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          source: idMap.get(e.source)!,
          target: idMap.get(e.target)!,
          selected: true,
        }));

      const nextNodes = [
        ...nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
        ...clonedNodes,
      ];
      const nextEdges = [
        ...edges.map((e) => (e.selected ? { ...e, selected: false } : e)),
        ...clonedEdges,
      ];

      setNodes(nextNodes);
      setEdges(nextEdges);
      setSelectedNodeId(clonedNodes.length === 1 ? clonedNodes[0].id : null);
      setSelectedEdgeId(null);
      pushHistory(nextNodes, nextEdges);
      setEditorNotice(`${noticePrefix} ${clonedNodes.length} item(s)`);
    },
    [canEdit, nodes, edges, setNodes, setEdges, pushHistory],
  );

  const handleCopySelected = useCallback(() => {
    const selNodes = getSelectedNodes();
    if (selNodes.length === 0) return;
    const selIds = new Set(selNodes.map((n) => n.id));
    const selEdges = edges.filter((e) => selIds.has(e.source) && selIds.has(e.target));
    clipboardRef.current = { nodes: selNodes, edges: selEdges, pasteCount: 0 };
    setEditorNotice(`Copied ${selNodes.length} item(s) — press Ctrl+V to paste`);
  }, [getSelectedNodes, edges]);

  const handlePasteCopied = useCallback(() => {
    if (!canEdit || !clipboardRef.current || clipboardRef.current.nodes.length === 0) return;
    clipboardRef.current.pasteCount += 1;
    const offset = clipboardRef.current.pasteCount * 40;
    insertClonedItems(
      clipboardRef.current.nodes,
      clipboardRef.current.edges,
      offset,
      'Pasted',
    );
  }, [canEdit, insertClonedItems]);

  const handleDuplicateSelected = useCallback(() => {
    const selNodes = getSelectedNodes();
    if (!canEdit || selNodes.length === 0) return;
    const selIds = new Set(selNodes.map((n) => n.id));
    const selEdges = edges.filter((e) => selIds.has(e.source) && selIds.has(e.target));
    insertClonedItems(selNodes, selEdges, 40, 'Duplicated');
  }, [canEdit, getSelectedNodes, edges, insertClonedItems]);

  const deleteSelected = useCallback(() => {
    if (!canEdit) return;
    const selNodeIds = new Set(
      nodes.filter((n) => n.selected || n.id === selectedNodeId).map((n) => n.id),
    );
    const selEdgeIds = new Set(
      edges.filter((e) => e.selected || e.id === selectedEdgeId).map((e) => e.id),
    );
    if (selNodeIds.size === 0 && selEdgeIds.size === 0) return;

    const nextNodes = nodes.filter((n) => !selNodeIds.has(n.id));
    const nextEdges = edges.filter(
      (e) => !selEdgeIds.has(e.id) && !selNodeIds.has(e.source) && !selNodeIds.has(e.target),
    );
    setNodes(nextNodes);
    setEdges(nextEdges);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    pushHistory(nextNodes, nextEdges);
  }, [canEdit, nodes, edges, selectedNodeId, selectedEdgeId, setNodes, setEdges, pushHistory]);

  const updateSelectedNodeData = (patch: Partial<NetworkNodeData>) => {
    if (!selectedNodeId) return;
    setNodes((nds) =>
      nds.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, ...patch } } : n)),
    );
  };

  const updateSelectedNodeLayer = (zIndex: number) => {
    if (!selectedNodeId) return;
    setNodes((nds) => nds.map((n) => (n.id === selectedNodeId ? { ...n, zIndex } : n)));
  };

  const updateSelectedEdgeData = (patch: Record<string, unknown>) => {
    if (!selectedEdgeId) return;
    setEdges((eds) =>
      eds.map((e) =>
        e.id === selectedEdgeId ? { ...e, data: { ...(e.data || {}), ...patch } } : e,
      ),
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setEditorNotice(null);
    try {
      const changeNote = prompt('Optional version note:', 'Updated network topology') || undefined;
      const res = await apiFetch<{ diagram: DiagramItem; syncedDevicesCount?: number }>(
        `/diagrams/${diagram.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            canvasData: {
              nodes,
              edges,
              backgroundImage,
              backgroundColor: backgroundColor || null,
              backgroundOpacity,
              backgroundWidth,
              backgroundX,
              backgroundY,
              gridVariant,
            },
            changeNote,
          }),
        },
      );
      if (res.diagram.canvasData?.nodes) {
        setNodes(
          (res.diagram.canvasData.nodes as Node[]).map((n) => ({ ...n, type: 'networkDevice' })),
        );
      }
      if (res.syncedDevicesCount && res.syncedDevicesCount > 0) {
        setEditorNotice(
          `Saved v${res.diagram.currentVersion} & added ${res.syncedDevicesCount} device(s) to Device Inventory`,
        );
      } else {
        setEditorNotice(`Saved v${res.diagram.currentVersion}`);
      }
      onSaved(res.diagram);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleAddSelectedNodeToInventory = async () => {
    if (!selectedNode) return;
    const nd = selectedNode.data as unknown as NetworkNodeData;
    const name = (nd.label || '').trim();
    if (!name) {
      alert('Please enter a Device Name before adding to Inventory');
      return;
    }

    setAddingDevice(true);
    setEditorNotice(null);
    try {
      const category =
        (nd.inventoryCategory as DeviceCategory | undefined) ||
        mapIconTypeToCategory(nd.deviceType || 'switch');
      const status =
        nd.status && ['ONLINE', 'OFFLINE', 'MAINTENANCE', 'UNKNOWN'].includes(nd.status)
          ? (nd.status as DeviceStatus)
          : 'ONLINE';

      const res = await apiFetch<{ device: Device }>('/devices', {
        method: 'POST',
        body: JSON.stringify({
          siteId: diagram.siteId,
          category,
          name,
          model: nd.model || (nd.deviceType === 'plc' ? 'PLC' : null),
          vendor: (typeof nd.vendor === 'string' ? nd.vendor : null) || null,
          managementIp: nd.ipAddress?.trim() || null,
          vlan: nd.vlan?.trim() || null,
          location: nd.location?.trim() || null,
          status,
          remark: `Added from Network Diagram (${diagram.title})`,
        }),
      });

      const created = res.device;
      updateSelectedNodeData({
        deviceId: created.id,
        label: created.name,
        model: created.model || nd.model,
        ipAddress: created.managementIp || nd.ipAddress,
        vlan: created.vlan || nd.vlan,
        location: created.location || nd.location,
        status: created.status,
      });
      setInventoryDevices((prev) => [created, ...prev.filter((d) => d.id !== created.id)]);
      setEditorNotice(`Added "${created.name}" to Site Device Inventory & IPAM`);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to add device to Inventory');
    } finally {
      setAddingDevice(false);
    }
  };

  const alignBackgroundToNodes = () => {
    if (nodes.length === 0) {
      setBackgroundX(0);
      setBackgroundY(0);
      return;
    }
    const minX = Math.min(...nodes.map((n) => n.position.x));
    const minY = Math.min(...nodes.map((n) => n.position.y));
    setBackgroundX(Math.round(minX - 60));
    setBackgroundY(Math.round(minY - 60));
    setEditorNotice('Aligned background top-left behind diagram nodes');
  };

  const handleBackgroundImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setBackgroundImage(reader.result);
        if (nodes.length > 0 && backgroundX === 0 && backgroundY === 0) {
          const minX = Math.min(...nodes.map((n) => n.position.x));
          const minY = Math.min(...nodes.map((n) => n.position.y));
          setBackgroundX(Math.round(minX - 60));
          setBackgroundY(Math.round(minY - 60));
        }
        setEditorNotice('Imported background image (locked to canvas coordinates)');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleImportCustomIconFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !canEdit) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      const id = `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const label = file.name.replace(/\.[^/.]+$/, '') || 'Custom Device';
      const newNode: Node = {
        id,
        type: 'networkDevice',
        position: { x: 200 + (nodes.length % 5) * 40, y: 140 + (nodes.length % 5) * 40 },
        data: {
          label,
          deviceType: 'custom_icon',
          customIconUrl: reader.result,
          inventoryCategory: 'SWITCH',
          syncToInventory: false,
          status: 'ONLINE',
        },
      };
      const nextNodes = [...nodes, newNode];
      setNodes(nextNodes);
      pushHistory(nextNodes, edges);
      setSelectedNodeId(id);
      setSelectedEdgeId(null);
      setEditorNotice(`Added custom icon "${label}"`);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
    setShowImportMenu(false);
  };

  const handleDrawioOrJsonImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    setShowImportMenu(false);
    if (!file || !canEdit) return;

    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiUploadWithProgress<{
        nodes: Node[];
        edges: Edge[];
        backgroundImage?: string | null;
      }>('/diagrams/parse-import', fd);

      const importedNodesRaw = Array.isArray(res.nodes) ? res.nodes : [];
      const importedEdgesRaw = Array.isArray(res.edges) ? res.edges : [];
      if (importedNodesRaw.length === 0) {
        alert('No nodes found in imported diagram file');
        return;
      }

      const mode = drawioImportModeRef.current;
      const prefix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
      const idMap = new Map<string, string>();

      const normalizedNodes: Node[] = importedNodesRaw.map((n, idx) => {
        const oldId = String(n.id || `imp-${idx}`);
        const newId = mode === 'replace' ? oldId : `imp-${prefix}-${idx}`;
        idMap.set(oldId, newId);
        return {
          ...n,
          id: newId,
          type: 'networkDevice',
          position: n.position || { x: 100 + (idx % 5) * 180, y: 100 + Math.floor(idx / 5) * 120 },
          selected: mode === 'merge',
        };
      });

      const normalizedEdges: Edge[] = importedEdgesRaw
        .map((edge, idx) => {
          const src = idMap.get(String(edge.source)) || String(edge.source);
          const tgt = idMap.get(String(edge.target)) || String(edge.target);
          return {
            ...edge,
            id: mode === 'replace' ? String(edge.id || `edge-${idx}`) : `imp-e-${prefix}-${idx}`,
            source: src,
            target: tgt,
            type: 'networkLink',
          };
        })
        .filter((edge) => edge.source && edge.target);

      const nextNodes =
        mode === 'replace'
          ? normalizedNodes
          : [...nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), ...normalizedNodes];
      const nextEdges =
        mode === 'replace' ? normalizedEdges : [...edges, ...normalizedEdges];

      setNodes(nextNodes);
      setEdges(nextEdges);
      if (mode === 'replace' && res.backgroundImage !== undefined) {
        setBackgroundImage(res.backgroundImage || null);
      }
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      pushHistory(nextNodes, nextEdges);
      setEditorNotice(
        `${mode === 'replace' ? 'Loaded' : 'Merged'} ${normalizedNodes.length} node(s) and ${normalizedEdges.length} link(s) from ${file.name}`,
      );
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to import diagram file');
    }
  };

  const handleImportAllSiteDevices = () => {
    setShowImportMenu(false);
    if (!canEdit) return;
    const existingDeviceIds = new Set(
      nodes
        .map((n) => (n.data as Record<string, unknown> | undefined)?.deviceId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    );
    const missing = inventoryDevices.filter((d) => !existingDeviceIds.has(d.id));
    if (missing.length === 0) {
      setEditorNotice('All Site Inventory devices are already on this canvas');
      return;
    }

    const baseY = nodes.reduce((maxY, n) => Math.max(maxY, n.position.y), 60) + (nodes.length > 0 ? 130 : 0);
    const cols = 5;
    const newNodes: Node[] = missing.map((dev, idx) => ({
      id: `dev-${dev.id}-${Date.now().toString(36).slice(-4)}-${idx}`,
      type: 'networkDevice',
      selected: true,
      position: {
        x: 100 + (idx % cols) * 210,
        y: baseY + Math.floor(idx / cols) * 135,
      },
      data: {
        label: dev.name,
        deviceType: mapCategoryToIconType(dev.category),
        deviceId: dev.id,
        model: dev.model || undefined,
        ipAddress: dev.managementIp || undefined,
        macAddress: dev.macAddress || undefined,
        serialNumber: dev.serialNumber || undefined,
        location: dev.location || undefined,
        vlan: dev.vlan || undefined,
        status: dev.status,
      },
    }));

    const nextNodes = [
      ...nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
      ...newNodes,
    ];
    setNodes(nextNodes);
    pushHistory(nextNodes, edges);
    setEditorNotice(`Imported ${newNodes.length} device(s) from Site Inventory onto canvas`);
  };

  const handleExportPng = async () => {
    if (!canvasWrapperRef.current) return;
    try {
      const dataUrl = await toPng(canvasWrapperRef.current, {
        backgroundColor: backgroundColor || '#ffffff',
      });
      const link = document.createElement('a');
      link.download = `${diagram.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      alert('Failed to export PNG');
    }
  };

  const handleSelectedNodeStatusChange = async (nextStatus: string) => {
    updateSelectedNodeData({ status: nextStatus });
    if (!canEdit || !selectedNode) return;
    const nd = selectedNode.data as unknown as NetworkNodeData;
    if (nd.deviceId) {
      try {
        await apiFetch(`/devices/${nd.deviceId}`, {
          method: 'PUT',
          body: JSON.stringify({ status: nextStatus }),
        });
        setInventoryDevices((prev) =>
          prev.map((d) =>
            d.id === nd.deviceId ? { ...d, status: nextStatus as DeviceStatus } : d,
          ),
        );
        setEditorNotice(`Synced "${nd.label || 'device'}" status → ${nextStatus} to Inventory`);
      } catch (err) {
        alert(err instanceof ApiError ? err.message : 'Failed to sync status to Device Inventory');
      }
    }
  };

  const filteredDevices = inventoryDevices.filter(
    (d) =>
      !deviceFilter.trim() ||
      d.name.toLowerCase().includes(deviceFilter.toLowerCase()) ||
      (d.managementIp || '').includes(deviceFilter),
  );

  // Close toolbar dropdowns on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (importMenuRef.current && !importMenuRef.current.contains(e.target as globalThis.Node)) {
        setShowImportMenu(false);
      }
      if (bgMenuRef.current && !bgMenuRef.current.contains(e.target as globalThis.Node)) {
        setShowBgMenu(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Keyboard shortcuts (Ctrl+C, Ctrl+D, Ctrl+Z, Ctrl+Y, Ctrl+A, Ctrl+S, Delete, Arrow nudge)
  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) =>
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement && target.isContentEditable);

    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;

      if (mod && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }
      if ((mod && key === 'y') || (mod && e.shiftKey && key === 'z')) {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (mod && key === 'c') {
        const textSel = window.getSelection()?.toString();
        if (!textSel) {
          e.preventDefault();
          handleCopySelected();
        }
        return;
      }
      if (mod && key === 'd') {
        if (!canEdit) return;
        e.preventDefault();
        handleDuplicateSelected();
        return;
      }
      if (mod && key === 'a') {
        e.preventDefault();
        setNodes((nds) => nds.map((n) => ({ ...n, selected: true })));
        return;
      }
      if (mod && key === 's') {
        if (!canEdit) return;
        e.preventDefault();
        handleSave();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!canEdit) return;
        e.preventDefault();
        deleteSelected();
        return;
      }
      if (
        canEdit &&
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)
      ) {
        const selIds = new Set(getSelectedNodes().map((n) => n.id));
        if (selIds.size === 0) return;
        e.preventDefault();
        const step = e.shiftKey ? 16 : 4;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        setNodes((nds) =>
          nds.map((n) =>
            selIds.has(n.id) ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n,
          ),
        );
      }
    };

    const onPaste = (e: ClipboardEvent) => {
      if (!canEdit || isTypingTarget(e.target)) return;
      const items = e.clipboardData?.items;
      if (items) {
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (!file) continue;
            e.preventDefault();
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result !== 'string') return;
              const rect = canvasWrapperRef.current?.getBoundingClientRect();
              const centerPos = rect
                ? screenToFlowPosition({
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2,
                  })
                : { x: 220, y: 160 };
              const id = `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
              const newNode: Node = {
                id,
                type: 'networkDevice',
                position: centerPos,
                selected: true,
                data: {
                  label: 'Pasted Image',
                  deviceType: 'custom_icon',
                  customIconUrl: reader.result,
                  syncToInventory: false,
                  status: 'ONLINE',
                },
              };
              const nextNodes = [
                ...nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
                newNode,
              ];
              setNodes(nextNodes);
              pushHistory(nextNodes, edges);
              setSelectedNodeId(id);
              setSelectedEdgeId(null);
              setEditorNotice('Pasted image from clipboard onto canvas');
            };
            reader.readAsDataURL(file);
            return;
          }
        }
      }

      if (clipboardRef.current && clipboardRef.current.nodes.length > 0) {
        e.preventDefault();
        handlePasteCopied();
      }
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste', onPaste);
    };
  });

  return (
    <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col h-[82vh]">
      {/* Top Editor Toolbar */}
      <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
          >
            ← Back
          </button>
          <div>
            <div className="font-bold text-sm">{diagram.title}</div>
            <div className="text-[11px] text-slate-500">
              {diagram.site?.siteCode} • v{diagram.currentVersion} •{' '}
              <span className="hidden lg:inline">
                Shortcuts: Ctrl+C/V Copy-Paste • Ctrl+D Duplicate • Ctrl+Z Undo • Del Delete • Ctrl+S Save
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {canEdit && (
            <>
              <button
                onClick={handleUndo}
                disabled={historyIndex <= 0}
                title="Undo"
                className="p-1.5 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
              >
                <Undo2 className="h-4 w-4" />
              </button>
              <button
                onClick={handleRedo}
                disabled={historyIndex >= history.length - 1}
                title="Redo (Ctrl+Y)"
                className="p-1.5 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
              >
                <Redo2 className="h-4 w-4" />
              </button>
              <button
                onClick={handleCopySelected}
                disabled={!selectedNode && !nodes.some((n) => n.selected)}
                title="Copy Selected (Ctrl+C)"
                className="p-1.5 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Copy className="h-4 w-4" />
              </button>
              <button
                onClick={handlePasteCopied}
                title="Paste (Ctrl+V — also supports pasting screenshots!)"
                className="p-1.5 rounded border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <ClipboardPaste className="h-4 w-4" />
              </button>
              <button
                onClick={handleDuplicateSelected}
                disabled={!selectedNode && !nodes.some((n) => n.selected)}
                title="Duplicate Selected (Ctrl+D)"
                className="inline-flex items-center gap-1 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 text-xs font-medium disabled:opacity-40 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <CopyPlus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Duplicate</span>
              </button>

              {/* Import Menu */}
              <div className="relative" ref={importMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowImportMenu((v) => !v)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-sky-300 dark:border-sky-700 bg-sky-50/70 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 text-xs font-semibold cursor-pointer hover:bg-sky-100"
                >
                  <FileUp className="h-3.5 w-3.5" />
                  Import ▾
                </button>
                {showImportMenu && (
                  <div className="absolute right-0 mt-1.5 w-64 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl z-50 py-1.5 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        drawioImportModeRef.current = 'merge';
                        drawioImportInputRef.current?.click();
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                    >
                      <Upload className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                      <div>
                        <div className="font-semibold">Import .drawio / .xml / .json</div>
                        <div className="text-[10px] text-slate-500">Add onto current canvas</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        drawioImportModeRef.current = 'replace';
                        drawioImportInputRef.current?.click();
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                    >
                      <Upload className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                      <div>
                        <div className="font-semibold">Replace with .drawio / .xml / .json</div>
                        <div className="text-[10px] text-slate-500">Replace entire canvas</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={handleImportAllSiteDevices}
                      className="w-full px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                    >
                      <Layers className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <div>
                        <div className="font-semibold">Add All Site Inventory Devices</div>
                        <div className="text-[10px] text-slate-500">
                          Place unmapped devices in a grid
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => iconImportInputRef.current?.click()}
                      className="w-full px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                    >
                      <ImageIcon className="h-3.5 w-3.5 text-violet-600 shrink-0" />
                      <div>
                        <div className="font-semibold">Import Custom Icon Node</div>
                        <div className="text-[10px] text-slate-500">PNG / JPG / SVG device icon</div>
                      </div>
                    </button>
                    <label className="w-full px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer">
                      <ImageIcon className="h-3.5 w-3.5 text-slate-600 shrink-0" />
                      <div>
                        <div className="font-semibold">Import Background Image</div>
                        <div className="text-[10px] text-slate-500">Floor plan / reference overlay</div>
                      </div>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml"
                        onChange={(ev) => {
                          setShowImportMenu(false);
                          handleBackgroundImport(ev);
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}
                <input
                  ref={drawioImportInputRef}
                  type="file"
                  accept=".drawio,.xml,.json"
                  onChange={handleDrawioOrJsonImport}
                  className="hidden"
                />
                <input
                  ref={iconImportInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  onChange={handleImportCustomIconFile}
                  className="hidden"
                />
              </div>

              {/* Canvas Background Menu */}
              <div className="relative" ref={bgMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowBgMenu((v) => !v)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded border text-xs font-semibold cursor-pointer ${
                    backgroundImage || backgroundColor
                      ? 'border-violet-400 bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                  title="Canvas Background Color, Image & Grid"
                >
                  <Palette className="h-3.5 w-3.5" />
                  Background ▾
                </button>
                <input
                  ref={bgImageInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  onChange={handleBackgroundImport}
                  className="hidden"
                />
                {showBgMenu && (
                  <div className="absolute right-0 mt-1.5 w-72 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl z-50 p-3.5 text-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-700 dark:text-slate-200">
                        Canvas Background
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowBgMenu(false)}
                        className="p-0.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Background Image Controls */}
                    <div className="space-y-2 pb-2.5 border-b border-slate-200 dark:border-slate-800">
                      <div className="font-semibold text-slate-500">
                        Background Image / Floor Plan
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => bgImageInputRef.current?.click()}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          {backgroundImage ? 'Change Image' : 'Upload Image'}
                        </button>
                        {backgroundImage && (
                          <button
                            type="button"
                            onClick={() => setBackgroundImage(null)}
                            className="px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 font-medium cursor-pointer"
                          >
                            Remove
                          </button>
                        )}
                      </div>

                      {backgroundImage && (
                        <>
                          <div>
                            <div className="flex justify-between text-[11px] mb-1">
                              <span className="text-slate-500">Image Scale (Canvas Width)</span>
                              <span className="font-mono font-semibold text-blue-600">
                                {backgroundWidth}px
                              </span>
                            </div>
                            <input
                              type="range"
                              min={600}
                              max={4000}
                              step={50}
                              value={backgroundWidth}
                              onChange={(e) => setBackgroundWidth(Number(e.target.value))}
                              className="w-full accent-blue-600 cursor-pointer"
                            />
                          </div>
                          <div>
                            <div className="flex justify-between text-[11px] mb-1">
                              <span className="text-slate-500">Image Opacity</span>
                              <span className="font-mono font-semibold text-blue-600">
                                {backgroundOpacity}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min={10}
                              max={100}
                              step={5}
                              value={backgroundOpacity}
                              onChange={(e) => setBackgroundOpacity(Number(e.target.value))}
                              className="w-full accent-blue-600 cursor-pointer"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <div>
                              <label className="block text-[10px] text-slate-500 mb-0.5">
                                Offset X (px)
                              </label>
                              <input
                                type="number"
                                step={20}
                                value={backgroundX}
                                onChange={(e) => setBackgroundX(Number(e.target.value) || 0)}
                                className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-transparent font-mono text-[11px]"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-500 mb-0.5">
                                Offset Y (px)
                              </label>
                              <input
                                type="number"
                                step={20}
                                value={backgroundY}
                                onChange={(e) => setBackgroundY(Number(e.target.value) || 0)}
                                className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-transparent font-mono text-[11px]"
                              />
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={alignBackgroundToNodes}
                            className="w-full py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-[11px] font-medium cursor-pointer"
                          >
                            Align Behind Current Nodes
                          </button>
                        </>
                      )}
                    </div>

                    {/* Canvas Color Presets */}
                    <div className="space-y-1.5 pb-2.5 border-b border-slate-200 dark:border-slate-800">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-500">Canvas Color</span>
                        {backgroundColor && (
                          <button
                            type="button"
                            onClick={() => setBackgroundColor('')}
                            className="text-[11px] text-blue-600 hover:underline cursor-pointer"
                          >
                            Reset Default
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {[
                          { hex: '', label: 'Default' },
                          { hex: '#ffffff', label: 'Pure White' },
                          { hex: '#f1f5f9', label: 'Cool Gray' },
                          { hex: '#eff6ff', label: 'Blueprint Sky' },
                          { hex: '#ecfdf5', label: 'Soft Mint' },
                          { hex: '#fefce8', label: 'Warm Cream' },
                          { hex: '#0f172a', label: 'Dark NOC' },
                        ].map((c) => (
                          <button
                            key={c.label}
                            type="button"
                            onClick={() => setBackgroundColor(c.hex)}
                            title={c.label}
                            className={`h-6 w-6 rounded-full border-2 cursor-pointer transition ${
                              backgroundColor === c.hex
                                ? 'border-blue-600 scale-110 ring-2 ring-blue-500/30'
                                : 'border-slate-300 dark:border-slate-600'
                            }`}
                            style={{ backgroundColor: c.hex || '#f8fafc' }}
                          />
                        ))}
                        <input
                          type="color"
                          value={backgroundColor || '#ffffff'}
                          onChange={(e) => setBackgroundColor(e.target.value)}
                          title="Custom Background Color"
                          className="h-6 w-7 p-0 border-0 rounded cursor-pointer bg-transparent"
                        />
                      </div>
                    </div>

                    {/* Grid Style */}
                    <div className="space-y-1.5">
                      <div className="font-semibold text-slate-500">Grid Pattern</div>
                      <div className="grid grid-cols-4 gap-1">
                        {(['dots', 'lines', 'cross', 'none'] as const).map((gv) => (
                          <button
                            key={gv}
                            type="button"
                            onClick={() => setGridVariant(gv)}
                            className={`py-1 rounded border text-[11px] font-medium capitalize cursor-pointer ${
                              gridVariant === gv
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                          >
                            {gv}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          <button
            onClick={handleExportPng}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            PNG
          </button>
          <a
            href={`/api/diagrams/${diagram.id}/export/drawio`}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 text-xs font-medium"
          >
            <Download className="h-3.5 w-3.5" />
            .drawio
          </a>
          <a
            href={`/api/diagrams/${diagram.id}/export/json`}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 text-xs font-medium"
            title="Export NIMS JSON template"
          >
            <Download className="h-3.5 w-3.5" />
            .json
          </a>
          <button
            onClick={() => setShowVersions((v) => !v)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
          >
            <History className="h-3.5 w-3.5" />
            v{diagram.currentVersion}
          </button>

          {canEdit && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Saving...' : 'Save Diagram'}
            </button>
          )}
        </div>
      </div>

      {editorNotice && (
        <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-950/60 border-b border-emerald-200 dark:border-emerald-800 flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-300">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{editorNotice}</span>
          </div>
          <button onClick={() => setEditorNotice(null)} className="hover:opacity-75">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Main 3-Pane Workspace */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Sidebar: Palette + Site Inventory Drag & Drop */}
        {canEdit && (
          <aside className="hidden md:flex flex-col w-60 border-r border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 overflow-y-auto p-3 space-y-4">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                Network Shapes (Drag / Click)
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {PALETTE_ITEMS.map((item) => (
                  <button
                    key={item.type}
                    draggable
                    onDragStart={(e) =>
                      e.dataTransfer.setData('application/nims-palette', JSON.stringify(item))
                    }
                    onClick={() => addPaletteNode(item.type, item.label)}
                    className="px-2 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-medium text-left hover:border-blue-500 cursor-grab truncate"
                  >
                    + {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                General & Zones (Resize / Color)
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {GENERAL_SHAPES.map((shape) => (
                  <button
                    key={shape.type}
                    draggable
                    onDragStart={(e) =>
                      e.dataTransfer.setData(
                        'application/nims-palette',
                        JSON.stringify({ type: shape.type, label: shape.label }),
                      )
                    }
                    onClick={() => addPaletteNode(shape.type, shape.label)}
                    className="px-2 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-medium text-left hover:border-blue-500 cursor-grab truncate flex items-center gap-1.5"
                  >
                    <span
                      className={`h-2.5 w-2.5 shrink-0 border ${
                        shape.type === 'shape_circle'
                          ? 'rounded-full'
                          : shape.type === 'shape_diamond'
                          ? 'rotate-45 rounded-[1px]'
                          : 'rounded-[3px]'
                      }`}
                      style={{
                        backgroundColor: `${shape.fillColor}33`,
                        borderColor: shape.fillColor,
                      }}
                    />
                    <span className="truncate">{shape.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                Site Inventory ({inventoryDevices.length})
              </div>
              <input
                value={deviceFilter}
                onChange={(e) => setDeviceFilter(e.target.value)}
                placeholder="Filter devices..."
                className="w-full px-2.5 py-1 mb-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
              />
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {filteredDevices.map((dev) => (
                  <div
                    key={dev.id}
                    draggable
                    onDragStart={(e) =>
                      e.dataTransfer.setData('application/nims-device', JSON.stringify(dev))
                    }
                    onClick={() => addInventoryDeviceNode(dev)}
                    className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-500 cursor-grab text-xs"
                  >
                    <div className="font-semibold truncate">{dev.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono truncate">
                      {dev.managementIp || dev.category}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}

        {/* Center React Flow Canvas */}
        <div
          ref={canvasWrapperRef}
          className="flex-1 relative bg-white dark:bg-slate-950"
          style={
            backgroundColor
              ? ({
                  backgroundColor,
                  '--xy-background-color': backgroundColor,
                } as React.CSSProperties)
              : undefined
          }
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={canEdit ? onNodesChange : undefined}
            onEdgesChange={canEdit ? onEdgesChange : undefined}
            onConnect={onConnect}
            onDragOver={onDragOver}
            onDrop={onDrop}
            multiSelectionKeyCode={['Shift', 'Control']}
            deleteKeyCode={null}
            onNodeClick={(_e, node) => {
              setSelectedNodeId(node.id);
              setSelectedEdgeId(null);
            }}
            onEdgeClick={(_e, edge) => {
              setSelectedEdgeId(edge.id);
              setSelectedNodeId(null);
            }}
            onPaneClick={() => {
              setSelectedNodeId(null);
              setSelectedEdgeId(null);
            }}
            fitView
          >
            {backgroundImage && (
              <ViewportPortal>
                <img
                  src={backgroundImage}
                  alt="Diagram Background"
                  draggable={false}
                  style={{
                    position: 'absolute',
                    left: `${backgroundX}px`,
                    top: `${backgroundY}px`,
                    width: `${backgroundWidth}px`,
                    maxWidth: 'none',
                    height: 'auto',
                    opacity: backgroundOpacity / 100,
                    zIndex: -1,
                    pointerEvents: 'none',
                    userSelect: 'none',
                  }}
                />
              </ViewportPortal>
            )}
            {gridVariant !== 'none' && (
              <Background
                variant={
                  gridVariant === 'lines'
                    ? BackgroundVariant.Lines
                    : gridVariant === 'cross'
                      ? BackgroundVariant.Cross
                      : BackgroundVariant.Dots
                }
              />
            )}
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>

        {/* Right Inspector Panel (Node / Device Details or Edge Cable Settings) */}
        {(selectedNode || selectedEdge) && (
          <aside className="w-72 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 overflow-y-auto space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold uppercase tracking-wider text-slate-500">
                {selectedNode ? 'Device / Node Inspector' : 'Link / Cable Inspector'}
              </span>
              <button
                onClick={() => {
                  setSelectedNodeId(null);
                  setSelectedEdgeId(null);
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {selectedNode && (() => {
              const nd = selectedNode.data as unknown as NetworkNodeData;
              return (
                <div className="space-y-3">
                  {nd.deviceId && (
                    <div className="rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 p-3 space-y-1">
                      <div className="font-bold text-blue-800 dark:text-blue-300">
                        Live Inventory Linked
                      </div>
                      <div>Model: {nd.model || '-'}</div>
                      <div>IP: <span className="font-mono">{nd.ipAddress || '-'}</span></div>
                      <div>MAC: <span className="font-mono">{nd.macAddress || '-'}</span></div>
                      <div>SN: <span className="font-mono">{nd.serialNumber || '-'}</span></div>
                      <div>Location: {nd.location || '-'}</div>
                    </div>
                  )}

                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">Device Name / Label</label>
                    <input
                      disabled={!canEdit}
                      value={nd.label || ''}
                      onChange={(e) => updateSelectedNodeData({ label: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-transparent"
                    />
                  </div>

                  {isGeneralShapeType(nd.deviceType) ? (
                    <div className="space-y-3">
                      <div>
                        <label className="block font-semibold text-slate-500 mb-1.5">
                          Fill Color
                        </label>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {ZONE_COLOR_PRESETS.map((hex) => (
                            <button
                              key={hex}
                              type="button"
                              disabled={!canEdit}
                              onClick={() =>
                                updateSelectedNodeData({
                                  fillColor: hex,
                                  borderColor:
                                    nd.borderColor === nd.fillColor ? hex : nd.borderColor,
                                })
                              }
                              className={`h-6 w-6 rounded-full border-2 cursor-pointer transition ${
                                (nd.fillColor || '#3b82f6') === hex
                                  ? 'border-slate-900 dark:border-white scale-110'
                                  : 'border-transparent'
                              }`}
                              style={{ backgroundColor: hex }}
                              title={hex}
                            />
                          ))}
                          <input
                            type="color"
                            disabled={!canEdit}
                            value={nd.fillColor || '#3b82f6'}
                            onChange={(e) =>
                              updateSelectedNodeData({
                                fillColor: e.target.value,
                                borderColor:
                                  nd.borderColor === nd.fillColor
                                    ? e.target.value
                                    : nd.borderColor,
                              })
                            }
                            className="h-6 w-7 p-0 border-0 rounded cursor-pointer bg-transparent"
                            title="Custom Color"
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="font-semibold text-slate-500">
                            Background Transparency / Opacity
                          </label>
                          <span className="font-mono font-semibold text-blue-600">
                            {nd.fillOpacity ?? (nd.deviceType === 'shape_badge' ? 90 : 18)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={5}
                          disabled={!canEdit}
                          value={nd.fillOpacity ?? (nd.deviceType === 'shape_badge' ? 90 : 18)}
                          onChange={(e) =>
                            updateSelectedNodeData({ fillOpacity: Number(e.target.value) })
                          }
                          className="w-full accent-blue-600 cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                          <span>0% (Transparent)</span>
                          <span>50%</span>
                          <span>100% (Solid)</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block font-semibold text-slate-500 mb-1">
                            Border Color
                          </label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="color"
                              disabled={!canEdit}
                              value={nd.borderColor || nd.fillColor || '#3b82f6'}
                              onChange={(e) =>
                                updateSelectedNodeData({ borderColor: e.target.value })
                              }
                              className="h-7 w-9 p-0 border rounded cursor-pointer bg-transparent"
                            />
                            <span className="font-mono text-[10px] text-slate-500">
                              {nd.borderColor || nd.fillColor || '#3b82f6'}
                            </span>
                          </div>
                        </div>

                        <div>
                          <label className="block font-semibold text-slate-500 mb-1">
                            Border Style
                          </label>
                          <select
                            disabled={!canEdit}
                            value={
                              nd.borderStyle ||
                              (nd.deviceType.startsWith('zone_') ? 'dashed' : 'solid')
                            }
                            onChange={(e) =>
                              updateSelectedNodeData({
                                borderStyle: e.target.value as 'solid' | 'dashed' | 'dotted' | 'none',
                              })
                            }
                            className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                          >
                            <option value="dashed">Dashed (- - -)</option>
                            <option value="solid">Solid (——)</option>
                            <option value="dotted">Dotted (····)</option>
                            <option value="none">No Border</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block font-semibold text-slate-500 mb-1">
                            Label Position
                          </label>
                          <select
                            disabled={!canEdit}
                            value={
                              nd.labelAlign ||
                              (nd.deviceType.startsWith('zone_') ? 'top-left' : 'center')
                            }
                            onChange={(e) =>
                              updateSelectedNodeData({
                                labelAlign: e.target.value as 'top-left' | 'center',
                              })
                            }
                            className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                          >
                            <option value="top-left">Top Left (Zone)</option>
                            <option value="center">Center</option>
                          </select>
                        </div>

                        <div>
                          <label className="block font-semibold text-slate-500 mb-1">
                            Text Color
                          </label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="color"
                              disabled={!canEdit}
                              value={nd.textColor || '#0f172a'}
                              onChange={(e) =>
                                updateSelectedNodeData({ textColor: e.target.value })
                              }
                              className="h-7 w-9 p-0 border rounded cursor-pointer bg-transparent"
                            />
                            <button
                              type="button"
                              onClick={() => updateSelectedNodeData({ textColor: undefined })}
                              className="text-[10px] text-slate-500 hover:underline"
                            >
                              Auto
                            </button>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-500 mb-1">
                          Layer Order (Z-Index)
                        </label>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() => updateSelectedNodeLayer(-10)}
                            className={`px-2 py-1.5 rounded border text-[11px] font-medium cursor-pointer ${
                              (selectedNode.zIndex ?? 0) < 0
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            Back (Zone)
                          </button>
                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() => updateSelectedNodeLayer(10)}
                            className={`px-2 py-1.5 rounded border text-[11px] font-medium cursor-pointer ${
                              (selectedNode.zIndex ?? 0) > 0
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            Front
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : nd.deviceType === 'note' ? (
                    <div>
                      <label className="block font-semibold text-slate-500 mb-1">Note Content</label>
                      <textarea
                        rows={4}
                        disabled={!canEdit}
                        value={nd.noteText || ''}
                        onChange={(e) => updateSelectedNodeData({ noteText: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-transparent"
                      />
                    </div>
                  ) : (
                    <>
                      {!nd.deviceId && (
                        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-2.5 space-y-2">
                          <div className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                            Not in Site Inventory yet
                          </div>
                          <div>
                            <label className="block font-semibold text-slate-500 mb-1">
                              Inventory Category
                            </label>
                            <select
                              disabled={!canEdit}
                              value={
                                (nd.inventoryCategory as string) ||
                                mapIconTypeToCategory(nd.deviceType || 'switch')
                              }
                              onChange={(e) =>
                                updateSelectedNodeData({ inventoryCategory: e.target.value })
                              }
                              className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                            >
                              <option value="SWITCH">Switch</option>
                              <option value="ACCESS_POINT">Access Point</option>
                              <option value="AP_CLIENT">AP Client / Bridge</option>
                              <option value="WLC">WLC Controller</option>
                              <option value="SERVER">Server</option>
                              <option value="PLC">PLC</option>
                              <option value="ESXI">ESXi Host</option>
                              <option value="VM">Virtual Machine (VM)</option>
                              <option value="NAS">NAS Storage</option>
                              <option value="UPS">UPS</option>
                              <option value="IP_CAM">IP Camera (CCTV)</option>
                              <option value="PC">PC / Workstation</option>
                              <option value="NVR">NVR Recorder</option>
                              <option value="TV">TV / Display</option>
                              <option value="PRINTER">Printer</option>
                              <option value="BARCODE">Barcode Scanner</option>
                            </select>
                          </div>
                          {canEdit && (
                            <>
                              <label className="flex items-center gap-2 text-[11px] cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={
                                    nd.syncToInventory !== undefined
                                      ? Boolean(nd.syncToInventory)
                                      : HARDWARE_ICON_TYPES.has(nd.deviceType || 'switch')
                                  }
                                  onChange={(e) =>
                                    updateSelectedNodeData({ syncToInventory: e.target.checked })
                                  }
                                />
                                <span>Auto-add to Inventory on Save</span>
                              </label>
                              <button
                                type="button"
                                onClick={handleAddSelectedNodeToInventory}
                                disabled={addingDevice}
                                className="w-full py-1.5 px-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                              >
                                <Plus className="h-3.5 w-3.5" />
                                {addingDevice ? 'Adding...' : 'Add to Device Inventory Now'}
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      <div>
                        <label className="block font-semibold text-slate-500 mb-1">IP Address</label>
                        <input
                          disabled={!canEdit}
                          value={nd.ipAddress || ''}
                          onChange={(e) => updateSelectedNodeData({ ipAddress: e.target.value })}
                          className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-transparent font-mono"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block font-semibold text-slate-500 mb-1">VLAN</label>
                          <input
                            disabled={!canEdit}
                            value={nd.vlan || ''}
                            onChange={(e) => updateSelectedNodeData({ vlan: e.target.value })}
                            placeholder="10"
                            className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-transparent"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-500 mb-1">Status</label>
                          <select
                            disabled={!canEdit}
                            value={nd.status || 'ONLINE'}
                            onChange={(e) => handleSelectedNodeStatusChange(e.target.value)}
                            className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                          >
                            <option value="ONLINE">Online</option>
                            <option value="OFFLINE">Offline</option>
                            <option value="MAINTENANCE">Maintenance</option>
                            <option value="UNKNOWN">Unknown</option>
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block font-semibold text-slate-500 mb-1">Model</label>
                          <input
                            disabled={!canEdit}
                            value={nd.model || ''}
                            onChange={(e) => updateSelectedNodeData({ model: e.target.value })}
                            className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-transparent"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-500 mb-1">Vendor</label>
                          <input
                            disabled={!canEdit}
                            value={(typeof nd.vendor === 'string' ? nd.vendor : '') || ''}
                            onChange={(e) => updateSelectedNodeData({ vendor: e.target.value })}
                            className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-transparent"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-500 mb-1">Location</label>
                        <input
                          disabled={!canEdit}
                          value={nd.location || ''}
                          onChange={(e) => updateSelectedNodeData({ location: e.target.value })}
                          className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-transparent"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-500 mb-1">Custom Icon URL</label>
                        <input
                          disabled={!canEdit}
                          value={nd.customIconUrl || ''}
                          onChange={(e) => updateSelectedNodeData({ customIconUrl: e.target.value })}
                          placeholder="https://... or data:image/..."
                          className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-transparent"
                        />
                      </div>
                    </>
                  )}

                  {canEdit && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={handleDuplicateSelected}
                        className="w-full py-1.5 rounded bg-sky-50 text-sky-700 font-semibold flex items-center justify-center gap-1.5 hover:bg-sky-100 cursor-pointer"
                        title="Duplicate (Ctrl+D)"
                      >
                        <CopyPlus className="h-3.5 w-3.5" />
                        Duplicate
                      </button>
                      <button
                        onClick={deleteSelected}
                        className="w-full py-1.5 rounded bg-red-50 text-red-600 font-semibold flex items-center justify-center gap-1.5 hover:bg-red-100 cursor-pointer"
                        title="Delete (Del)"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            {selectedEdge && (() => {
              const ed = (selectedEdge.data || {}) as Record<string, string>;
              return (
                <div className="space-y-3">
                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">Cable Type</label>
                    <select
                      disabled={!canEdit}
                      value={ed.cableType || 'LAN'}
                      onChange={(e) =>
                        updateSelectedEdgeData({
                          cableType: e.target.value,
                          color: e.target.value === 'FIBER' ? '#f59e0b' : '#2563eb',
                        })
                      }
                      className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                    >
                      <option value="LAN">LAN (Copper UTP)</option>
                      <option value="FIBER">Fiber Optic</option>
                      <option value="WIRELESS">Wireless Link</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">Cable Color</label>
                    <div className="flex items-center gap-2">
                      {['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#475569'].map(
                        (c) => (
                          <button
                            key={c}
                            type="button"
                            disabled={!canEdit}
                            onClick={() => updateSelectedEdgeData({ color: c })}
                            className={`h-6 w-6 rounded-full border-2 cursor-pointer ${
                              ed.color === c ? 'border-slate-900 scale-110' : 'border-transparent'
                            }`}
                            style={{ backgroundColor: c }}
                          />
                        ),
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-semibold text-slate-500 mb-1">Source Port</label>
                      <input
                        disabled={!canEdit}
                        value={ed.sourcePort || ''}
                        onChange={(e) => updateSelectedEdgeData({ sourcePort: e.target.value })}
                        placeholder="GE0/0/1"
                        className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-transparent font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-500 mb-1">Target Port</label>
                      <input
                        disabled={!canEdit}
                        value={ed.targetPort || ''}
                        onChange={(e) => updateSelectedEdgeData({ targetPort: e.target.value })}
                        placeholder="Gi1/0/24"
                        className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-transparent font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-semibold text-slate-500 mb-1">VLAN</label>
                      <input
                        disabled={!canEdit}
                        value={ed.vlan || ''}
                        onChange={(e) => updateSelectedEdgeData({ vlan: e.target.value })}
                        placeholder="1211"
                        className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-transparent"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-500 mb-1">Link Speed</label>
                      <input
                        disabled={!canEdit}
                        value={ed.speed || ''}
                        onChange={(e) => updateSelectedEdgeData({ speed: e.target.value })}
                        placeholder="10G"
                        className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-transparent"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">Label / IP</label>
                    <input
                      disabled={!canEdit}
                      value={ed.label || ''}
                      onChange={(e) => updateSelectedEdgeData({ label: e.target.value })}
                      placeholder="Uplink / 172.28.7.0/30"
                      className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-transparent"
                    />
                  </div>

                  {canEdit && (
                    <button
                      onClick={deleteSelected}
                      className="w-full py-1.5 rounded bg-red-50 text-red-600 font-semibold flex items-center justify-center gap-1.5 hover:bg-red-100 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove Link
                    </button>
                  )}
                </div>
              );
            })()}
          </aside>
        )}
      </div>

      {/* Version History Drawer */}
      {showVersions && diagram.versions && (
        <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 max-h-40 overflow-y-auto text-xs space-y-1">
          {diagram.versions.map((v) => (
            <div key={v.id} className="flex items-center justify-between">
              <span>
                <strong>v{v.version}</strong> — {v.changeNote || 'Saved'} (
                {new Date(v.createdAt).toLocaleString()})
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DiagramEditor(props: {
  diagram: DiagramItem;
  siteDevices: Device[];
  canEdit: boolean;
  onSaved: (updated: DiagramItem) => void;
  onClose: () => void;
}) {
  return (
    <ReactFlowProvider>
      <InnerDiagramEditor {...props} />
    </ReactFlowProvider>
  );
}

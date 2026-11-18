import { Device, DeviceStatus } from './types';

export const STATUS_LED_LIVE_CLASS: Record<DeviceStatus, string> = {
  ONLINE: 'nims-led-core nims-led-online',
  OFFLINE: 'nims-led-core nims-led-offline',
  MAINTENANCE: 'nims-led-core nims-led-maint',
  UNKNOWN: 'nims-led-core nims-led-unknown',
};

export const STATUS_LED_STATIC_CLASS: Record<DeviceStatus, string> = {
  ONLINE: 'nims-led-core nims-led-online-static',
  OFFLINE: 'nims-led-core nims-led-offline-static',
  MAINTENANCE: 'nims-led-core nims-led-maint-static',
  UNKNOWN: 'nims-led-core nims-led-unknown',
};

export function isDeviceAgentLive(
  dev: Pick<Device, 'agentLive' | 'lastPingAt'>,
): boolean {
  if (typeof dev.agentLive === 'boolean') return dev.agentLive;
  if (!dev.lastPingAt) return false;
  return Date.now() - new Date(dev.lastPingAt).getTime() <= 3 * 60 * 1000;
}

export function getDeviceLedClass(status?: string | null, live = false): string {
  const normalized: DeviceStatus =
    status === 'ONLINE' || status === 'OFFLINE' || status === 'MAINTENANCE' || status === 'UNKNOWN'
      ? status
      : 'UNKNOWN';
  return live ? STATUS_LED_LIVE_CLASS[normalized] : STATUS_LED_STATIC_CLASS[normalized];
}

export function findMatchingInventoryDevice(
  nodeData: { deviceId?: string; ipAddress?: string },
  devices: Device[],
): Device | undefined {
  if (nodeData.deviceId) {
    const byId = devices.find((d) => d.id === nodeData.deviceId);
    if (byId) return byId;
  }
  const ip = nodeData.ipAddress?.trim();
  if (ip) {
    return devices.find((d) => d.managementIp?.trim() === ip);
  }
  return undefined;
}

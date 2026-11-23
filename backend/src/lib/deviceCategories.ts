import { prisma } from './prisma';

export type DeviceCategory = string;

export const BUILT_IN_DEVICE_CATEGORY_CODES = [
  'SWITCH',
  'ACCESS_POINT',
  'AP_CLIENT',
  'WLC',
  'SERVER',
  'PLC',
  'ESXI',
  'VM',
  'NAS',
  'UPS',
  'IP_CAM',
  'PC',
  'NVR',
  'TV',
  'PRINTER',
  'BARCODE',
  'HANDHELD',
] as const;

export const DEVICE_TYPE_CODE_REGEX = /^[A-Z][A-Z0-9_]{1,49}$/;

export function normalizeDeviceTypeCode(raw?: string | null): string {
  return (raw || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^A-Z0-9_]/g, '')
    .replace(/^_+|_+$/g, '');
}

/**
 * Resolve a raw category value (code, lowercase/spaced code, or display name) against
 * registered DeviceType rows in MongoDB. Returns the canonical uppercase `code`, or `null`.
 */
export async function resolveRegisteredDeviceTypeCode(rawCategory?: string | null): Promise<string | null> {
  const cleaned = (rawCategory || '').trim();
  if (!cleaned) return null;

  const normalized = normalizeDeviceTypeCode(cleaned);
  if (normalized) {
    const byCode = await prisma.deviceType.findUnique({ where: { code: normalized } });
    if (byCode) return byCode.code;
  }

  const allTypes = await prisma.deviceType.findMany({
    select: { code: true, name: true },
  });
  const lower = cleaned.toLowerCase();
  const matched = allTypes.find(
    (dt) => dt.code.toLowerCase() === lower || dt.name.trim().toLowerCase() === lower,
  );
  return matched ? matched.code : null;
}

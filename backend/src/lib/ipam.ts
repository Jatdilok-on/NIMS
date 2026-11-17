export interface CidrDetails {
  cidr: string;
  networkAddress: string;
  subnetMask: string;
  broadcastAddress: string;
  ipRangeStart: string;
  ipRangeEnd: string;
  prefixLength: number;
  totalHosts: number;
}

const IPV4_REGEX =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

export function isValidIpv4(ip: string): boolean {
  return IPV4_REGEX.test(ip.trim());
}

export function ipv4ToInt(ip: string): number {
  const parts = ip.trim().split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    throw new Error(`Invalid IPv4 address: ${ip}`);
  }
  return (((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0);
}

export function intToIpv4(num: number): string {
  const n = num >>> 0;
  return [
    (n >>> 24) & 255,
    (n >>> 16) & 255,
    (n >>> 8) & 255,
    n & 255,
  ].join('.');
}

export function parseCidr(cidrInput: string): CidrDetails {
  const parts = cidrInput.trim().split('/');
  if (parts.length !== 2) {
    throw new Error(`Invalid CIDR notation: ${cidrInput}`);
  }
  const [ipStr, prefixStr] = parts;
  if (!isValidIpv4(ipStr)) {
    throw new Error(`Invalid IPv4 in CIDR: ${cidrInput}`);
  }
  const prefix = Number(prefixStr);
  if (!Number.isInteger(prefix) || prefix < 8 || prefix > 32) {
    throw new Error(`Prefix length must be between 8 and 32: ${cidrInput}`);
  }

  const ipInt = ipv4ToInt(ipStr);
  const maskInt = prefix === 0 ? 0 : ((0xffffffff << (32 - prefix)) >>> 0);
  const networkInt = (ipInt & maskInt) >>> 0;
  const broadcastInt = (networkInt | (~maskInt >>> 0)) >>> 0;

  let rangeStartInt = networkInt;
  let rangeEndInt = broadcastInt;
  let totalHosts = 1;

  if (prefix <= 30) {
    rangeStartInt = (networkInt + 1) >>> 0;
    rangeEndInt = (broadcastInt - 1) >>> 0;
    totalHosts = Math.max(0, broadcastInt - networkInt - 1);
  } else if (prefix === 31) {
    totalHosts = 2;
  } else {
    totalHosts = 1;
  }

  const normalizedNetwork = intToIpv4(networkInt);
  return {
    cidr: `${normalizedNetwork}/${prefix}`,
    networkAddress: normalizedNetwork,
    subnetMask: intToIpv4(maskInt),
    broadcastAddress: intToIpv4(broadcastInt),
    ipRangeStart: intToIpv4(rangeStartInt),
    ipRangeEnd: intToIpv4(rangeEndInt),
    prefixLength: prefix,
    totalHosts,
  };
}

export function isIpInCidr(ip: string, cidr: string): boolean {
  if (!isValidIpv4(ip)) return false;
  const parsed = parseCidr(cidr);
  const ipInt = ipv4ToInt(ip);
  const netInt = ipv4ToInt(parsed.networkAddress);
  const bcastInt = ipv4ToInt(parsed.broadcastAddress);
  return ipInt >= netInt && ipInt <= bcastInt;
}

export function parseVlanNumber(vlan?: string | null): number | null {
  if (!vlan) return null;
  const match = vlan.match(/^\s*(?:vlan\s*[-_:]?\s*)?(\d+)\s*$/i);
  if (!match) return null;
  const num = Number(match[1]);
  return Number.isInteger(num) && num >= 1 && num <= 4094 ? num : null;
}

export function getIpv4Block24Prefix(ip: string): string {
  const parts = ip.split('.');
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}` : ip;
}

export function enumerateBlock24Hosts(
  cidr: string,
  preferredPrefix?: string,
): { blockPrefix: string; blockCidr: string; totalHosts: number; ips: string[] } {
  const parsed = parseCidr(cidr);
  const start = ipv4ToInt(parsed.ipRangeStart);
  const end = ipv4ToInt(parsed.ipRangeEnd);

  if (parsed.totalHosts <= 256) {
    const ips: string[] = [];
    for (let i = start; i <= end; i++) {
      ips.push(intToIpv4(i));
    }
    const blockPrefix = getIpv4Block24Prefix(parsed.ipRangeStart);
    return {
      blockPrefix,
      blockCidr: parsed.prefixLength >= 24 ? parsed.cidr : `${blockPrefix}.0/24`,
      totalHosts: parsed.totalHosts,
      ips,
    };
  }

  let blockPrefix = getIpv4Block24Prefix(parsed.ipRangeStart);
  if (preferredPrefix && isValidIpv4(`${preferredPrefix}.0`)) {
    const prefStart = ipv4ToInt(`${preferredPrefix}.0`);
    const prefEnd = ipv4ToInt(`${preferredPrefix}.255`);
    if (prefEnd >= start && prefStart <= end) {
      blockPrefix = preferredPrefix;
    }
  }

  const blockStart = Math.max(start, ipv4ToInt(`${blockPrefix}.0`));
  const blockEnd = Math.min(end, ipv4ToInt(`${blockPrefix}.255`));
  const ips: string[] = [];
  for (let i = blockStart; i <= blockEnd; i++) {
    ips.push(intToIpv4(i));
  }

  return {
    blockPrefix,
    blockCidr: `${blockPrefix}.0/24`,
    totalHosts: parsed.totalHosts,
    ips,
  };
}

export function enumerateSubnetHosts(cidr: string, limit = 1024): string[] {
  const parsed = parseCidr(cidr);
  const start = ipv4ToInt(parsed.ipRangeStart);
  const end = ipv4ToInt(parsed.ipRangeEnd);
  const hosts: string[] = [];
  for (let i = start; i <= end && hosts.length < limit; i++) {
    hosts.push(intToIpv4(i));
  }
  return hosts;
}

/**
 * Normalizes MAC addresses such as "aa-bb-cc-dd-ee-ff" or "AABBCCDDEEFF" into "AA:BB:CC:DD:EE:FF".
 * Returns null if input is empty, or throws if non-empty and invalid.
 */
export function normalizeMacAddress(mac?: string | null): string | null {
  if (!mac || !mac.trim()) return null;
  const cleaned = mac.trim().replace(/[:-]/g, '').replace(/\./g, '').toUpperCase();
  if (!/^[0-9A-F]{12}$/.test(cleaned)) {
    throw new Error(`Invalid MAC address format: ${mac}`);
  }
  return cleaned.match(/.{1,2}/g)!.join(':');
}

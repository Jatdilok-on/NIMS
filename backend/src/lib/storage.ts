import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { env } from '../config/env';

export const ALLOWED_DIAGRAM_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.svg',
  '.pdf',
  '.drawio',
  '.xml',
  '.vsdx',
]);

export const ALLOWED_DOCUMENT_EXTENSIONS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.csv',
  '.png',
  '.jpg',
  '.jpeg',
  '.svg',
  '.zip',
  '.json',
  '.xml',
  '.cfg',
  '.conf',
]);

export function sanitizeFileName(name: string): string {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_');
  return base.slice(0, 120) || 'file';
}

export function sanitizeSegment(seg: string): string {
  return seg.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'default';
}

export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function resolveSafeStoragePath(relativePath: string, root = env.storageRoot): string {
  const normalizedRoot = path.resolve(root);
  const resolved = path.resolve(normalizedRoot, relativePath);
  if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
    throw new Error('Invalid storage path traversal attempt');
  }
  return resolved;
}

export function saveSiteFile(
  siteCode: string,
  bucket: 'diagrams' | 'documents' | 'branding',
  originalName: string,
  buffer: Buffer,
  root = env.storageRoot,
): { relativePath: string; fullPath: string; fileSize: number } {
  const safeSite = sanitizeSegment(siteCode);
  const safeName = sanitizeFileName(originalName);
  const uniqueName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${safeName}`;
  const relativePath = path.join('sites', safeSite, bucket, uniqueName);
  const fullPath = resolveSafeStoragePath(relativePath, root);
  ensureDir(path.dirname(fullPath));
  fs.writeFileSync(fullPath, buffer);
  return {
    relativePath: relativePath.replace(/\\/g, '/'),
    fullPath,
    fileSize: buffer.length,
  };
}

export function readStoredFile(relativePath: string, root = env.storageRoot): Buffer {
  const fullPath = resolveSafeStoragePath(relativePath, root);
  if (!fs.existsSync(fullPath)) {
    throw new Error('Stored file not found');
  }
  return fs.readFileSync(fullPath);
}

export function deleteStoredFile(relativePath: string, root = env.storageRoot): void {
  try {
    const fullPath = resolveSafeStoragePath(relativePath, root);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch {
    // ignore missing file cleanup
  }
}

export function deleteSiteStorageFolder(siteCode: string, root = env.storageRoot): void {
  try {
    const safeSite = sanitizeSegment(siteCode);
    const fullDir = resolveSafeStoragePath(path.join('sites', safeSite), root);
    if (fs.existsSync(fullDir)) {
      fs.rmSync(fullDir, { recursive: true, force: true });
    }
  } catch {
    // ignore site folder cleanup failure
  }
}

export const ALLOWED_LOGO_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.ico',
]);

const EXTENSION_MIME_MAP: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.cfg': 'text/plain; charset=utf-8',
  '.conf': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'text/plain; charset=utf-8',
  '.drawio': 'application/xml; charset=utf-8',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.zip': 'application/zip',
  '.vsdx': 'application/vnd.ms-visio.drawing.main+xml',
};

export function resolveSafeMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return EXTENSION_MIME_MAP[ext] || 'application/octet-stream';
}

export function isAllowedExtension(filename: string, allowed: Set<string>): boolean {
  const ext = path.extname(filename).toLowerCase();
  return allowed.has(ext);
}

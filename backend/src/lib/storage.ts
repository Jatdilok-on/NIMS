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

export function isAllowedExtension(filename: string, allowed: Set<string>): boolean {
  const ext = path.extname(filename).toLowerCase();
  return allowed.has(ext);
}

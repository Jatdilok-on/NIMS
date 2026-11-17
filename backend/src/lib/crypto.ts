import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { env } from '../config/env';

const BCRYPT_ROUNDS = 12;
const AES_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getEncryptionKey(rawKey = env.credentialsEncryptionKey): Buffer {
  const trimmed = rawKey.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }
  const base64Buf = Buffer.from(trimmed, 'base64');
  if (base64Buf.length === 32) {
    return base64Buf;
  }
  if (trimmed.length >= 32) {
    return crypto.createHash('sha256').update(trimmed).digest();
  }
  throw new Error(
    'CREDENTIALS_ENCRYPTION_KEY must be a 64-character hex string, 32-byte base64, or >= 32 chars',
  );
}

/**
 * Encrypts a sensitive string (username or password) using AES-256-GCM.
 * Output format: `v1:<iv_base64>:<authTag_base64>:<ciphertext_base64>`
 */
export function encryptSecret(plaintext: string, keyOverride?: string): string {
  const key = getEncryptionKey(keyOverride);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(AES_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypts a secret produced by `encryptSecret`.
 */
export function decryptSecret(payload: string, keyOverride?: string): string {
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Invalid encrypted secret format');
  }
  const [, ivB64, tagB64, cipherB64] = parts;
  const key = getEncryptionKey(keyOverride);
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const ciphertext = Buffer.from(cipherB64, 'base64');

  const decipher = crypto.createDecipheriv(AES_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateRandomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

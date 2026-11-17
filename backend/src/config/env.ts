import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

function requireOrFallback(name: string, devFallback: string): string {
  const val = process.env[name];
  if (val && val.trim().length > 0) return val.trim();
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return devFallback;
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: requireOrFallback(
    'JWT_SECRET',
    'dev-only-insecure-jwt-secret-change-in-production-64chars-minimum',
  ),
  credentialsEncryptionKey: requireOrFallback(
    'CREDENTIALS_ENCRYPTION_KEY',
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  ),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  sessionTtlHours: parseInt(process.env.SESSION_TTL_HOURS || '12', 10),
  storageRoot: path.resolve(
    process.env.STORAGE_ROOT || path.join(process.cwd(), 'data', 'storage'),
  ),
  backupRoot: path.resolve(
    process.env.BACKUP_ROOT || path.join(process.cwd(), 'data', 'backups'),
  ),
  maxUploadSizeMb: parseInt(process.env.MAX_UPLOAD_SIZE_MB || '100', 10),
};

import * as fs from 'fs';
import * as path from 'path';

/**
 * Returns the directory where uploaded files should be stored.
 * Priority:
 * 1. UPLOAD_DEST env var (recommended for production/VPS)
 * 2. On Vercel: /tmp/uploads (ephemeral – files do not persist across invocations)
 * 3. Local dev default: <project>/uploads (relative to process.cwd())
 */
export function getUploadDestination(): string {
  if (process.env.UPLOAD_DEST) {
    return process.env.UPLOAD_DEST;
  }
  if (process.env.VERCEL) {
    return '/tmp/uploads';
  }
  return path.join(process.cwd(), 'uploads');
}

/**
 * Ensures the upload directory exists (creates it recursively if needed).
 * Call this at startup and/or before writing files.
 */
export function ensureUploadDirExists(): string {
  const dest = getUploadDestination();
  fs.mkdirSync(dest, { recursive: true });
  return dest;
}

/**
 * Returns the public base URL used when returning upload URLs to clients.
 * Set PUBLIC_UPLOAD_BASE_URL in production, e.g. https://yourdomain.com
 * Falls back to http://localhost:3005 for local development.
 */
export function getPublicUploadBaseUrl(): string {
  const fromEnv = process.env.PUBLIC_UPLOAD_BASE_URL;
  if (fromEnv) {
    return fromEnv.replace(/\/+$/, '');
  }
  return 'http://localhost:3005';
}

/**
 * The public path segment under which uploads are served.
 * Example: if PUBLIC_UPLOAD_BASE_URL=https://example.com and this is 'uploads',
 * a file 'abc.jpg' will be reachable at https://example.com/uploads/abc.jpg
 */
export const UPLOAD_PUBLIC_PATH = 'uploads';

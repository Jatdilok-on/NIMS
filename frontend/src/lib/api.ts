function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = path.startsWith('/api') ? path : `/api${path.startsWith('/') ? path : `/${path}`}`;
  const method = (options.method || 'GET').toUpperCase();
  const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (isMutating) {
    const csrf = getCookie('nims_csrf');
    if (csrf) {
      headers.set('X-CSRF-Token', csrf);
    }
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    let errBody: { error?: string; details?: unknown } = {};
    try {
      errBody = await res.json();
    } catch {
      // ignore non-json error
    }
    throw new ApiError(res.status, errBody.error || `Request failed (${res.status})`, errBody.details);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json() as Promise<T>;
  }
  return res as unknown as T;
}

export function apiUploadWithProgress<T>(
  path: string,
  formData: FormData,
  onProgress?: (percent: number, loaded: number, total: number) => void,
): Promise<T> {
  const url = path.startsWith('/api') ? path : `/api${path.startsWith('/') ? path : `/${path}`}`;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.withCredentials = true;

    const csrf = getCookie('nims_csrf');
    if (csrf) {
      xhr.setRequestHeader('X-CSRF-Token', csrf);
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const pct = Math.min(100, Math.round((event.loaded / event.total) * 100));
        onProgress(pct, event.loaded, event.total);
      }
    };

    xhr.onload = () => {
      let body: Record<string, unknown> = {};
      try {
        body = xhr.responseText ? (JSON.parse(xhr.responseText) as Record<string, unknown>) : {};
      } catch {
        // ignore non-json response
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100, 1, 1);
        resolve(body as T);
      } else {
        reject(
          new ApiError(
            xhr.status,
            typeof body.error === 'string' ? body.error : `Upload failed (${xhr.status})`,
            body.details,
          ),
        );
      }
    };

    xhr.onerror = () => {
      reject(new ApiError(0, 'Network error while uploading file'));
    };

    xhr.send(formData);
  });
}

export function getSiteGoogleMapUrl(
  location?: string | null,
  googleMapUrl?: string | null,
): string | null {
  const direct = (googleMapUrl || '').trim();
  if (direct && /^https?:\/\//i.test(direct)) return direct;
  const loc = (location || '').trim();
  if (loc && /^https?:\/\//i.test(loc)) return loc;
  return null;
}

export function getSafeExternalUrl(rawUrl?: string | null): string | null {
  const clean = (rawUrl || '').trim();
  if (!clean) return null;
  if (/^https?:\/\//i.test(clean)) return clean;
  return null;
}

export async function copyTextSafe(value: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = value;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

export function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

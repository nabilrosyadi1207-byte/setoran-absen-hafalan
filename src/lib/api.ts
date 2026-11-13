import {
  LocalApiError,
  handleLocalNetlifyApi,
  handleLocalNetlifyDownload,
} from './netlifyFallback';

const TOKEN_STORAGE_KEY = 'tahfidztrack_token';
const API_BASE = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
let staticHostMode = false;

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function runLocalFallback<T>(path: string, options: RequestInit, token: string | null): T {
  try {
    return handleLocalNetlifyApi<T>(path, options, token);
  } catch (err) {
    if (err instanceof LocalApiError) {
      throw new ApiError(err.message, err.status);
    }
    throw err;
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();

  if (staticHostMode) {
    return runLocalFallback<T>(path, options, token);
  }

  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      credentials: 'include',
    });
  } catch (err) {
    if (!API_BASE) {
      staticHostMode = true;
      return runLocalFallback<T>(path, options, token);
    }
    throw err;
  }

  const contentType = res.headers.get('content-type') || '';
  if (!API_BASE && !contentType.includes('application/json')) {
    staticHostMode = true;
    return runLocalFallback<T>(path, options, token);
  }

  const data = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const message =
      typeof data === 'object' && data !== null && 'error' in data
        ? String((data as { error: unknown }).error)
        : `Permintaan gagal (${res.status})`;
    throw new ApiError(message, res.status);
  }

  return data as T;
}

export async function downloadAuthenticatedFile(path: string, fallbackFilename: string): Promise<void> {
  const token = getStoredToken();

  if (staticHostMode) {
    handleLocalNetlifyDownload(path, fallbackFilename, token);
    return;
  }

  const headers = new Headers();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${path}`, { headers, credentials: 'include' });
  const contentType = res.headers.get('content-type') || '';
  if (!API_BASE && contentType.includes('text/html')) {
    staticHostMode = true;
    handleLocalNetlifyDownload(path, fallbackFilename, token);
    return;
  }

  if (!res.ok) {
    throw new Error('Gagal mengunduh file dari server.');
  }
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : fallbackFilename;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

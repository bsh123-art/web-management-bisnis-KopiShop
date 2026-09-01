/**
 * Typed API client.
 *
 * The access token is held in memory only (never localStorage) so an XSS payload
 * cannot read it. The refresh token lives in an httpOnly cookie and is used to
 * transparently re-issue access tokens when a request returns 401.
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const BASE = `${API_URL}/api/v1`;

let accessToken: string | null = null;
let branchId: string | null = null;
let onUnauthenticated: (() => void) | null = null;
let refreshPromise: Promise<boolean> | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};
export const getAccessToken = () => accessToken;
export const setBranchId = (id: string | null) => {
  branchId = id;
};
export const setUnauthenticatedHandler = (handler: (() => void) | null) => {
  onUnauthenticated = handler;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** True when the request failed because the device is offline. */
  get isOffline() {
    return this.status === 0;
  }
}

export interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Skip the automatic refresh-and-retry cycle (used by /auth/refresh itself). */
  skipAuthRetry?: boolean;
  query?: Record<string, string | number | boolean | undefined | null>;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(`${BASE}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/** Collapses concurrent 401s into a single refresh round-trip. */
async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) return false;
      const payload = (await response.json()) as ApiResponse<{ accessToken: string }>;
      accessToken = payload.data.accessToken;
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
  const { body, query, skipAuthRetry, headers, ...init } = options;

  const send = async (): Promise<Response> =>
    fetch(buildUrl(path, query), {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(branchId ? { 'X-Branch-Id': branchId } : {}),
        ...(headers as Record<string, string> | undefined),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let response: Response;
  try {
    response = await send();
  } catch {
    throw new ApiError('You appear to be offline. Changes will sync automatically once reconnected.', 0, 'OFFLINE');
  }

  if (response.status === 401 && !skipAuthRetry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      response = await send();
    } else {
      accessToken = null;
      onUnauthenticated?.();
      throw new ApiError('Your session has ended. Please sign in again.', 401, 'UNAUTHORIZED');
    }
  }

  if (response.status === 204) return { success: true, data: undefined as T };

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    if (!response.ok) throw new ApiError(`Request failed (${response.status})`, response.status, 'HTTP_ERROR');
    return { success: true, data: (await response.blob()) as T };
  }

  const payload = await response.json();

  if (!response.ok || payload?.success === false) {
    const error = payload?.error ?? {};
    throw new ApiError(
      error.message ?? 'Something went wrong',
      response.status,
      error.code ?? 'UNKNOWN',
      error.details,
    );
  }

  return payload as ApiResponse<T>;
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query']) => request<T>(path, { method: 'GET', query }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  refresh: refreshAccessToken,
};

/** Downloads a binary endpoint (Excel/backup) and triggers a browser save. */
export async function downloadFile(path: string, fileName: string, query?: RequestOptions['query']): Promise<void> {
  const response = await fetch(buildUrl(path, query), {
    credentials: 'include',
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(branchId ? { 'X-Branch-Id': branchId } : {}),
    },
  });

  if (!response.ok) throw new ApiError('Download failed', response.status, 'DOWNLOAD_FAILED');

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

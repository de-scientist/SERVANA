import { clearSession, getAccessToken, getRefreshToken, setSession } from './session';

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiResult<T> {
  data?: T;
  error?: ApiError;
  status: number;
}

/**
 * Thin fetch-based API client. Reads the base URL from NEXT_PUBLIC_API_URL,
 * attaches a bearer token from storage, and transparently refreshes an expired
 * access token using the refresh token (single retry). Never trusts the server
 * for success; always inspect `error`.
 */
export class ApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private token(): string | null {
    return getAccessToken();
  }

  async request<T>(path: string, init: RequestInit = {}, _retry = false): Promise<ApiResult<T>> {
    const headers = new Headers(init.headers);
    headers.set('Content-Type', 'application/json');
    const token = this.token();
    if (token) headers.set('Authorization', `Bearer ${token}`);

    try {
      const res = await fetch(`${this.baseUrl}/api/v1${path}`, { ...init, headers });
      if (res.status === 401 && !_retry) {
        const refreshed = await this.tryRefresh();
        if (refreshed) return this.request<T>(path, init, true);
      }
      const body = await res.json().catch(() => undefined);
      if (!res.ok) {
        return {
          status: res.status,
          error: body?.error ?? { code: 'HTTP_ERROR', message: res.statusText },
        };
      }
      return { status: res.status, data: body?.data };
    } catch (err) {
      return { status: 0, error: { code: 'NETWORK_ERROR', message: (err as Error).message } };
    }
  }

  private async tryRefresh(): Promise<boolean> {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        clearSession();
        return false;
      }
      const body = await res.json();
      if (body?.data?.accessToken) {
        setSession({ accessToken: body.data.accessToken, refreshToken: body.data.refreshToken ?? refreshToken });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  get<T>(path: string): Promise<ApiResult<T>> {
    return this.request<T>(path, { method: 'GET' });
  }

  post<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
  }

  patch<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
    return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) });
  }
}

export const apiClient = new ApiClient();

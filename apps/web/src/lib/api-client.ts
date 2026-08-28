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
 * Thin fetch-based API client. Reads the base URL from NEXT_PUBLIC_API_URL and
 * attaches a bearer token from storage when present. Never trusts the server
 * for success; always inspects `error`.
 */
export class ApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private token(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem('servana_token');
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
    const headers = new Headers(init.headers);
    headers.set('Content-Type', 'application/json');
    const token = this.token();
    if (token) headers.set('Authorization', `Bearer ${token}`);

    try {
      const res = await fetch(`${this.baseUrl}/api/v1${path}`, {
        ...init,
        headers,
      });
      const body = await res.json().catch(() => undefined);
      if (!res.ok) {
        return {
          status: res.status,
          error: body?.error ?? { code: 'HTTP_ERROR', message: res.statusText },
        };
      }
      return { status: res.status, data: body?.data };
    } catch (err) {
      return {
        status: 0,
        error: { code: 'NETWORK_ERROR', message: (err as Error).message },
      };
    }
  }

  get<T>(path: string): Promise<ApiResult<T>> {
    return this.request<T>(path, { method: 'GET' });
  }

  post<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
  }
}

export const apiClient = new ApiClient();

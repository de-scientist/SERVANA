/**
 * SECURITY NOTE (Phase 17 audit): tokens in `localStorage` are readable by any
 * script running on the origin, so a stored-XSS flaw would leak the 14-day
 * refresh token. The recommended hardening is httpOnly + Secure + SameSite
 * cookies issued by the API (with CSRF protection) and a short-lived in-memory
 * access token. Until that migration lands:
 * - keep the CSP/helmet headers strict and never render untrusted HTML,
 * - never log or interpolate tokens (see api-client),
 * - clear both keys on logout and on 401 refresh failure.
 */
const ACCESS_KEY = 'servana_token';
const REFRESH_KEY = 'servana_refresh';

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

export function setSession(tokens: SessionTokens): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ACCESS_KEY, tokens.accessToken);
  window.localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(REFRESH_KEY);
}

export function isAuthed(): boolean {
  return !!getAccessToken();
}

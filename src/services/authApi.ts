const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
const TOKEN_KEY = 'lmpc_authority_token';
const USER_KEY = 'lmpc_authority_user';

export interface AuthorityUser {
  id: string;
  username: string;
  name: string;
  designation?: string;
}

export async function authorityLogin(username: string, password: string): Promise<AuthorityUser> {
  const res = await fetch(`${API_BASE}/auth/authority/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Login failed.' }));
    throw new Error(err.error || 'Login failed.');
  }

  const data = await res.json();
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  return data.user;
}

export function authorityLogout(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getAuthorityToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getAuthorityUser(): AuthorityUser | null {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function isAuthorityLoggedIn(): boolean {
  return !!getAuthorityToken();
}

export function authHeader(): Record<string, string> {
  const token = getAuthorityToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export { API_BASE };

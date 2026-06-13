// ============================================================
//  Ecommerce CMS — API Client
//  Fetch helper con auto-refresh de JWT (Access + Refresh token)
// ============================================================

const DEFAULT_API_URL = 'http://localhost:3000';

// ── Storage helpers ─────────────────────────────────────────
export const getApiUrl = (): string =>
  localStorage.getItem('vz_api_url') ?? DEFAULT_API_URL;

export const setApiUrl = (url: string): void =>
  localStorage.setItem('vz_api_url', url.replace(/\/$/, ''));

export const getAccessToken = (): string | null =>
  localStorage.getItem('vz_access_token');

export const getRefreshToken = (): string | null =>
  localStorage.getItem('vz_refresh_token');

export const saveTokens = (accessToken: string, refreshToken: string): void => {
  localStorage.setItem('vz_access_token', accessToken);
  localStorage.setItem('vz_refresh_token', refreshToken);
};

export const clearTokens = (): void => {
  localStorage.removeItem('vz_access_token');
  localStorage.removeItem('vz_refresh_token');
};

export const isAuthenticated = (): boolean => !!getAccessToken();

// ── Token refresh ────────────────────────────────────────────
let isRefreshing = false;
let pendingResolvers: Array<(token: string | null) => void> = [];

const broadcastRefreshResult = (token: string | null) => {
  pendingResolvers.forEach(r => r(token));
  pendingResolvers = [];
};

const tryRefresh = async (): Promise<string | null> => {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${getApiUrl()}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const { access_token, refresh_token } = data.data;
    saveTokens(access_token, refresh_token);
    return access_token;
  } catch {
    return null;
  }
};

// ── Core fetch wrapper ───────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data: T;
  pagination?: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

export type ApiError = { success: false; message: string };

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<ApiResponse<T>> {
  const token = getAccessToken();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers ?? {}),
  };

  const res = await fetch(`${getApiUrl()}${path}`, { ...options, headers });

  // ── Auto-refresh on 401 ──────────────────────────────────
  if (res.status === 401 && retry) {
    if (!isRefreshing) {
      isRefreshing = true;
      const newToken = await tryRefresh();
      isRefreshing = false;
      broadcastRefreshResult(newToken);

      if (!newToken) {
        clearTokens();
        window.location.href = '/login';
        throw new Error('Session expired');
      }

      return apiFetch<T>(path, options, false);
    } else {
      // Queue simultaneous requests until refresh completes
      const newToken = await new Promise<string | null>(resolve => {
        pendingResolvers.push(resolve);
      });

      if (!newToken) {
        clearTokens();
        window.location.href = '/login';
        throw new Error('Session expired');
      }

      return apiFetch<T>(path, options, false);
    }
  }

  const json = await res.json();

  if (!res.ok) {
    throw Object.assign(new Error(json.message ?? 'API Error'), {
      status: res.status,
      data: json,
    });
  }

  return json as ApiResponse<T>;
}

// ── Public API surface ───────────────────────────────────────
export const api = {
  get: <T>(path: string) =>
    apiFetch<T>(path, { method: 'GET' }),

  post: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  put: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  delete: <T>(path: string) =>
    apiFetch<T>(path, { method: 'DELETE' }),
};

// ── Auth helpers ─────────────────────────────────────────────
export const authLogin = async (identifier: string, password: string) => {
  const res = await api.post<{
    access_token: string;
    refresh_token: string;
    user: { id: string; email: string; phone: string; role: string };
  }>('/auth/login', { identifier, password });

  saveTokens(res.data.access_token, res.data.refresh_token);
  return res.data.user;
};

export const authLogout = async () => {
  const refreshToken = getRefreshToken();
  if (refreshToken) {
    try {
      await api.post('/auth/logout', { refresh_token: refreshToken });
    } catch { /* ignore */ }
  }
  clearTokens();
  window.location.href = '/login';
};

// ── Toast system ─────────────────────────────────────────────
export type ToastType = 'success' | 'error' | 'info';

export const showToast = (message: string, type: ToastType = 'info', duration = 3500) => {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icons: Record<ToastType, string> = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span style="font-weight:700;font-size:1rem">${icons[type]}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOutRight 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
};

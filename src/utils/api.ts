// ============================================================
//  Ecommerce CMS — API Client
//  Fetch helper con auto-refresh de JWT (Access + Refresh token)
// ============================================================

const DEFAULT_API_URL = import.meta.env.PUBLIC_API_URL;

// ── Storage helpers ─────────────────────────────────────────
export const getApiUrl = (): string => DEFAULT_API_URL;

export const getAccessToken = (): string | null =>
  localStorage.getItem("vz_access_token");

export const getRefreshToken = (): string | null =>
  localStorage.getItem("vz_refresh_token");

export const saveTokens = (accessToken: string, refreshToken: string): void => {
  localStorage.setItem("vz_access_token", accessToken);
  localStorage.setItem("vz_refresh_token", refreshToken);
};

export const clearTokens = (): void => {
  localStorage.removeItem("vz_access_token");
  localStorage.removeItem("vz_refresh_token");
};

export const isAuthenticated = (): boolean => !!getAccessToken();

// ── Token refresh ────────────────────────────────────────────
let isRefreshing = false;
let pendingResolvers: Array<(token: string | null) => void> = [];

const broadcastRefreshResult = (token: string | null) => {
  pendingResolvers.forEach((r) => r(token));
  pendingResolvers = [];
};

const tryRefresh = async (): Promise<string | null> => {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${getApiUrl()}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

const FETCH_TIMEOUT_MS = 10_000; // 10 segundos

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<ApiResponse<T>> {
  const token = getAccessToken();

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers ?? {}),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${getApiUrl()}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`La solicitud tardó demasiado (>${FETCH_TIMEOUT_MS / 1000}s). Verifica que la API esté activa.`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  // ── Auto-refresh on 401 ──────────────────────────────────
  if (res.status === 401 && retry) {
    if (!isRefreshing) {
      isRefreshing = true;
      const newToken = await tryRefresh();
      isRefreshing = false;
      broadcastRefreshResult(newToken);

      if (!newToken) {
        clearTokens();
        window.dispatchEvent(new CustomEvent("session:expired"));
        throw new Error("Session expired");
      }

      return apiFetch<T>(path, options, false);
    } else {
      const newToken = await new Promise<string | null>((resolve) => {
        pendingResolvers.push(resolve);
      });

      if (!newToken) {
        clearTokens();
        window.dispatchEvent(new CustomEvent("session:expired"));
        throw new Error("Session expired");
      }

      return apiFetch<T>(path, options, false);
    }
  }

  const json = await res.json();

  if (!res.ok) {
    throw Object.assign(new Error(json.message ?? "API Error"), {
      status: res.status,
      data: json,
    });
  }

  return json as ApiResponse<T>;
}

// ── Public API surface ───────────────────────────────────────
export const api = {
  get: <T>(path: string) => apiFetch<T>(path, { method: "GET" }),

  post: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  put: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  delete: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};

// ── Image upload & WebP Conversion ─────────────────────────────
const convertToWebP = async (file: File): Promise<File> => {
  if (file.type === "image/webp") return file;
  
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(file);
      
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (blob) => {
          if (!blob) return resolve(file);
          const webpFile = new File(
            [blob],
            file.name.replace(/\.[^/.]+$/, "") + ".webp",
            { type: "image/webp" }
          );
          resolve(webpFile);
        },
        "image/webp",
        0.85
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
};

export const uploadImage = async (originalFile: File): Promise<string> => {
  // Convertimos la imagen a .webp antes de subirla
  const file = await convertToWebP(originalFile);

  const doFetch = (authToken: string | null): Promise<Response> => {
    const fd = new FormData();
    fd.append("image", file);
    const h: HeadersInit = authToken
      ? { Authorization: `Bearer ${authToken}` }
      : {};
    return fetch(`${getApiUrl()}/upload`, {
      method: "POST",
      headers: h,
      body: fd,
    });
  };

  const parseResponse = async (res: Response): Promise<string> => {
    let json: Record<string, unknown> | null = null;
    try {
      json = await res.json();
    } catch {
      throw new Error(
        `Error del servidor (HTTP ${res.status}). Verifica que el backend esté activo.`,
      );
    }
    if (!res.ok) {
      throw new Error(
        (json?.message as string) ??
          `Error al subir imagen (HTTP ${res.status})`,
      );
    }
    const relativePath = (json?.data as Record<string, string>)?.url ?? "";
    if (!relativePath)
      throw new Error("El servidor no devolvió una URL de imagen válida.");
    return relativePath.startsWith("http")
      ? relativePath
      : `${getApiUrl()}${relativePath}`;
  };

  let res = await doFetch(getAccessToken());

  if (res.status === 401) {
    const newToken = await tryRefresh();
    if (!newToken) {
      clearTokens();
      window.dispatchEvent(new CustomEvent("session:expired"));
      throw new Error("Session expired");
    }
    res = await doFetch(newToken);
  }

  return parseResponse(res);
};

// ── Auth helpers ─────────────────────────────────────────────
export const authLogin = async (identifier: string, password: string) => {
  const res = await api.post<{
    access_token: string;
    refresh_token: string;
    user: { id: string; email: string; phone: string; role: string };
  }>("/auth/login", { identifier, password });

  saveTokens(res.data.access_token, res.data.refresh_token);
  return res.data.user;
};

export const authLogout = async () => {
  const refreshToken = getRefreshToken();
  if (refreshToken) {
    try {
      await api.post("/auth/logout", { refresh_token: refreshToken });
    } catch {
      /* ignore */
    }
  }
  clearTokens();
  window.location.href = "/login";
};

// ── Toast system ─────────────────────────────────────────────
export type ToastType = "success" | "error" | "info";

export const showToast = (
  message: string,
  type: ToastType = "info",
  duration = 3500,
) => {
  let container = document.querySelector(".toast-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const icons: Record<ToastType, string> = {
    success: "✓",
    error: "✕",
    info: "ℹ",
  };

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span style="font-weight:700;font-size:1rem">${icons[type]}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "slideOutRight 0.3s ease forwards";
    setTimeout(() => toast.remove(), 300);
  }, duration);
};

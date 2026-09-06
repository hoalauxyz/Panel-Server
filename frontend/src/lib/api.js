/**
 * Thin API client. Base URL and key come from Vite env vars so the same bundle
 * can be pointed at any backend at build time.
 */
const BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
const KEY = import.meta.env.VITE_API_KEY || '';

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      signal,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(KEY ? { 'x-api-key': KEY } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(
      'Không kết nối được tới máy chủ API. Kiểm tra VITE_API_BASE và CORS.',
      0,
    );
  }

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }

  if (!res.ok || data?.ok === false) {
    throw new ApiError(
      data?.error || `Yêu cầu thất bại (HTTP ${res.status}).`,
      res.status,
      data?.details,
    );
  }

  return data;
}

export const api = {
  getConfig: (signal) => request('/config', { signal }),
  saveConfig: (settings) => request('/config', { method: 'PUT', body: settings }),
  restart: () => request('/restart-server', { method: 'POST' }),
  status: (signal) => request('/status', { signal }),
};

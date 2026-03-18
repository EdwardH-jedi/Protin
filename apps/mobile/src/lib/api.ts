const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

let _token: string | null = null;

export function setToken(token: string | null): void {
  _token = token;
}

// ─── Key transformers ────────────────────────────────────────────────────────

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function transformKeys(obj: unknown, transform: (k: string) => string): unknown {
  if (Array.isArray(obj)) return obj.map((v) => transformKeys(v, transform));
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [
        transform(k),
        transformKeys(v, transform),
      ])
    );
  }
  return obj;
}

// ─── Core fetch ──────────────────────────────────────────────────────────────

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (_token) {
    headers['Authorization'] = `Bearer ${_token}`;
  }

  const init: RequestInit = {
    method,
    headers,
  };

  if (body !== undefined) {
    init.body = JSON.stringify(transformKeys(body, toSnakeCase));
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  init.signal = controller.signal;

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, init);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Request timed out. Check your network connection.');
    }
    if (err instanceof TypeError && err.message.includes('Network request failed')) {
      throw new Error('Cannot reach the server. Check that the staging API is running and your device is on the same network.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const errorData = await response.json();
      if (errorData && typeof errorData === 'object' && 'detail' in errorData) {
        const detail = (errorData as Record<string, unknown>).detail;
        message = typeof detail === 'string' ? detail : JSON.stringify(detail);
      }
    } catch {
      // ignore parse errors, use default message
    }
    throw new Error(message);
  }

  // 204 No Content
  if (response.status === 204) {
    return undefined as unknown as T;
  }

  const json = await response.json();
  return transformKeys(json, toCamelCase) as T;
}

// ─── Exported API surface ────────────────────────────────────────────────────

export const api = {
  get<T>(path: string): Promise<T> {
    return request<T>('GET', path);
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>('POST', path, body);
  },
  put<T>(path: string, body?: unknown): Promise<T> {
    return request<T>('PUT', path, body);
  },
  delete<T>(path: string): Promise<T> {
    return request<T>('DELETE', path);
  },
};

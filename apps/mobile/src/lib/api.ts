import Constants from 'expo-constants';

function resolveBaseUrl(): string {
  const expoUrl =
    (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
    (Constants.manifest2?.extra?.expoClient?.extra?.apiUrl as string | undefined) ??
    (Constants.manifest?.extra?.apiUrl as string | undefined) ??
    process.env.EXPO_PUBLIC_API_URL ??
    'http://localhost:8000';

  return expoUrl.replace(/\/+$/, '');
}

const BASE_URL = resolveBaseUrl();

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

  if (obj && typeof obj === 'object' && !(obj instanceof Date)) {
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
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  const init: RequestInit = {
    method,
    headers,
  };

  if (_token) {
    headers.Authorization = `Bearer ${_token}`;
  }

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(transformKeys(body, toSnakeCase));
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  init.signal = controller.signal;

  const fullUrl = `${BASE_URL}${normalizedPath}`;

  let response: Response;

  try {
    response = await fetch(fullUrl, init);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Request timed out. Check your network connection.');
    }

    if (err instanceof TypeError) {
      throw new Error(
        `Cannot reach the server at ${BASE_URL}. Check that the staging API is running and your device is on the same network.`
      );
    }

    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  const contentType = response.headers.get('content-type') ?? '';

  if (!response.ok) {
    let message = `HTTP ${response.status}`;

    try {
      const errorData = await response.json();

      if (errorData && typeof errorData === 'object' && 'detail' in errorData) {
        const detail = (errorData as Record<string, unknown>).detail;
        message = typeof detail === 'string' ? detail : JSON.stringify(detail);
      }
    } catch {
      // Ignore parse errors and keep default message
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  if (!contentType.includes('application/json')) {
    const rawText = await response.text();
    console.warn(
      `[API] ✗ Non-JSON response from ${fullUrl}\n` +
      `  content-type: ${contentType || '(none)'}\n` +
      `  body (first 500): ${rawText.slice(0, 500)}`
    );
    throw new Error(
      `Server at ${BASE_URL} returned a non-JSON response (${contentType || 'no content-type'}). ` +
      `This usually means BASE_URL points to the wrong host, port, or container.`
    );
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
  patch<T>(path: string, body?: unknown): Promise<T> {
    return request<T>('PATCH', path, body);
  },
  delete<T>(path: string): Promise<T> {
    return request<T>('DELETE', path);
  },
};

export { BASE_URL };
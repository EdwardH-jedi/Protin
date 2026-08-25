/**
 * api.ts tests
 *
 * Covers:
 *  - BASE_URL resolution from expo-constants
 *  - HTTP verb helpers (GET / POST / PUT / PATCH / DELETE)
 *  - snake_case ↔ camelCase key transformation (request body + response body)
 *  - Authorization header injection via setToken
 *  - 204 No Content handling
 *  - Error response parsing (detail string / detail object / unparseable body)
 *  - Timeout (AbortError) translation
 *  - Network error (TypeError) translation
 *  - Non-JSON response rejection
 *  - Path normalization (leading slash auto-added)
 */

// ─── Mock expo-constants BEFORE importing api ────────────────────────────────

// ─── Imports ──────────────────────────────────────────────────────────────────

import { api, setToken, BASE_URL } from '../lib/api';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: { apiUrl: 'https://api.example.test/' } },
    manifest2: null,
    manifest: null,
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockFetchResponse(body: unknown, init: Partial<{
  status: number;
  contentType: string | null;
  asText: string;
}> = {}) {
  const status = init.status ?? 200;
  const contentType = init.contentType === undefined ? 'application/json' : init.contentType;

  const headers = {
    get: (name: string) => {
      if (name.toLowerCase() === 'content-type') return contentType;
      return null;
    },
  };

  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    json: async () => body,
    text: async () => init.asText ?? (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

const originalFetch = global.fetch;

beforeEach(() => {
  (global as any).fetch = jest.fn();
  setToken(null);
});

afterAll(() => {
  (global as any).fetch = originalFetch;
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('api.ts', () => {
  describe('BASE_URL resolution', () => {
    it('strips trailing slashes from the configured apiUrl', () => {
      expect(BASE_URL).toBe('https://api.example.test');
    });
  });

  describe('request pathing', () => {
    it('prepends a leading slash when the path does not start with one', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(mockFetchResponse({}));
      await api.get('discovery');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.test/discovery',
        expect.any(Object)
      );
    });

    it('preserves an existing leading slash', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(mockFetchResponse({}));
      await api.get('/discovery');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.test/discovery',
        expect.any(Object)
      );
    });
  });

  describe('HTTP verbs', () => {
    it.each([
      ['get', 'GET'],
      ['delete', 'DELETE'],
    ])('%s() issues an HTTP %s without a body', async (verb, method) => {
      (global.fetch as jest.Mock).mockResolvedValue(mockFetchResponse({}));
      await (api as any)[verb]('/x');
      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(init.method).toBe(method);
      expect(init.body).toBeUndefined();
      expect(init.headers['Content-Type']).toBeUndefined();
    });

    it.each([
      ['post', 'POST'],
      ['put', 'PUT'],
      ['patch', 'PATCH'],
    ])('%s() issues an HTTP %s with a JSON body', async (verb, method) => {
      (global.fetch as jest.Mock).mockResolvedValue(mockFetchResponse({}));
      await (api as any)[verb]('/x', { foo: 'bar' });
      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(init.method).toBe(method);
      expect(init.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(init.body as string)).toEqual({ foo: 'bar' });
    });
  });

  describe('key transformation', () => {
    it('converts request body keys from camelCase to snake_case', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(mockFetchResponse({}));
      await api.post('/x', {
        targetUserId: 'u1',
        matchCreated: true,
        nested: { firstName: 'Jane', sportProfiles: [{ gymName: 'Fit' }] },
      });
      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(JSON.parse(init.body as string)).toEqual({
        target_user_id: 'u1',
        match_created: true,
        nested: { first_name: 'Jane', sport_profiles: [{ gym_name: 'Fit' }] },
      });
    });

    it('converts response body keys from snake_case to camelCase', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        mockFetchResponse({
          user_id: 'u1',
          items: [{ display_name: 'Alex', sport_profiles: [{ gym_name: 'Fit' }] }],
        })
      );
      const result = await api.get<any>('/x');
      expect(result).toEqual({
        userId: 'u1',
        items: [{ displayName: 'Alex', sportProfiles: [{ gymName: 'Fit' }] }],
      });
    });
  });

  describe('auth header', () => {
    it('omits Authorization when no token is set', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(mockFetchResponse({}));
      await api.get('/x');
      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(init.headers.Authorization).toBeUndefined();
    });

    it('adds Bearer Authorization when a token is set', async () => {
      setToken('abc.def');
      (global.fetch as jest.Mock).mockResolvedValue(mockFetchResponse({}));
      await api.get('/x');
      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(init.headers.Authorization).toBe('Bearer abc.def');
    });

    it('clears the token when setToken(null) is called', async () => {
      setToken('abc.def');
      setToken(null);
      (global.fetch as jest.Mock).mockResolvedValue(mockFetchResponse({}));
      await api.get('/x');
      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(init.headers.Authorization).toBeUndefined();
    });
  });

  describe('response handling', () => {
    it('returns undefined for 204 No Content', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        mockFetchResponse(null, { status: 204, contentType: null })
      );
      await expect(api.delete('/x')).resolves.toBeUndefined();
    });

    it('rejects when the server returns a non-JSON content type', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        mockFetchResponse('<html>oops</html>', {
          status: 200,
          contentType: 'text/html',
          asText: '<html>oops</html>',
        })
      );
      await expect(api.get('/x')).rejects.toThrow(/non-JSON response/);
    });
  });

  describe('error handling', () => {
    it('uses the "detail" field from a JSON error body', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        mockFetchResponse({ detail: 'Invalid credentials' }, { status: 401 })
      );
      await expect(api.post('/login', {})).rejects.toThrow('Invalid credentials');
    });

    it('serializes a non-string "detail" payload', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        mockFetchResponse({ detail: { field: 'email' } }, { status: 400 })
      );
      await expect(api.post('/login', {})).rejects.toThrow(/"field":"email"/);
    });

    it('falls back to "HTTP <status>" when the error body is not JSON', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        headers: { get: () => 'application/json' },
        json: async () => { throw new Error('not json'); },
        text: async () => '',
      } as unknown as Response);
      await expect(api.get('/x')).rejects.toThrow('HTTP 500');
    });

    it('translates AbortError into a timeout message', async () => {
      (global.fetch as jest.Mock).mockImplementation(() => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        return Promise.reject(err);
      });
      await expect(api.get('/x')).rejects.toThrow(/timed out/i);
    });

    it('translates TypeError into a "cannot reach the server" message', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new TypeError('Network request failed'));
      await expect(api.get('/x')).rejects.toThrow(/Cannot reach the server/);
    });

    it('rethrows unknown errors unchanged', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new RangeError('weird'));
      await expect(api.get('/x')).rejects.toThrow('weird');
    });
  });
});

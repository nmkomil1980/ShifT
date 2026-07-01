import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api, setToken, getToken } from './api.js';

function mockResponse(status, body) {
  return {
    ok: status < 400,
    status,
    text: async () => (body == null ? '' : JSON.stringify(body)),
  };
}

describe('api client', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('stores and reads the token', () => {
    setToken('abc');
    expect(getToken()).toBe('abc');
    setToken(null);
    expect(getToken()).toBeNull();
  });

  it('sends the bearer token and parses JSON', async () => {
    setToken('tok123');
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(200, { user: { id: 1 } }));
    vi.stubGlobal('fetch', fetchMock);

    const data = await api.get('/me');
    expect(data.user.id).toBe(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/me');
    expect(opts.headers.Authorization).toBe('Bearer tok123');
  });

  it('throws the server error message on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(401, { error: 'Требуется авторизация' })));
    await expect(api.get('/me')).rejects.toThrow('Требуется авторизация');
  });

  it('sends a JSON body on post', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(201, { id: 5 }));
    vi.stubGlobal('fetch', fetchMock);
    await api.post('/shifts', { title: 'X' });
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ title: 'X' });
    expect(opts.headers['Content-Type']).toBe('application/json');
  });
});

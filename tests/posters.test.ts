import { afterEach, describe, it, expect, vi } from 'vitest';
import { catalogPosterUrl, ratedPosterUrl, posterOrigin } from '../lib/posters';
import { GET } from '../app/poster/[config]/[id]/route';

const id = 'tt1375666';
const options = { rpdbKey: 'test-only', rpdbStyle: 'poster-default', language: 'en-GB' };
function request(query = '?tmdb=%2Fposter.jpg', config = options) {
  const encoded = Buffer.from(JSON.stringify(config)).toString('base64url');
  return GET(new Request(`https://addon.example/poster/${encoded}/${id}.jpg${query}`), { params: Promise.resolve({ config: encoded, id: `${id}.jpg` }) });
}
afterEach(() => vi.unstubAllGlobals());

describe('poster selection and failure recovery', () => {
  it('uses the public HTTPS origin behind a reverse proxy', () => {
    expect(posterOrigin(new Request('http://localhost:3000/x', { headers: { 'x-forwarded-host': 'addon.example', 'x-forwarded-proto': 'https' } }))).toBe('https://addon.example');
  });
  it('returns TMDB directly without a rated-poster key', () => {
    expect(catalogPosterUrl(id, '/poster.jpg', {}, 'https://addon.example')).toBe('https://image.tmdb.org/t/p/w500/poster.jpg');
  });
  it('preserves RPDB style and enables its missing-ratings fallback', () => {
    expect(ratedPosterUrl(id, { ...options, rpdbStyle: 'poster-custom' })).toBe(`https://api.ratingposterdb.com/test-only/imdb/poster-custom/${id}.jpg?fallback=true`);
    expect(ratedPosterUrl(id, { ...options, rpdbProvider: 'opdb' })).toBe(`https://openposterdb.com/test-only/imdb/poster-default/${id}.jpg?fallback=true`);
  });
  it('includes only poster settings, excluding account and session credentials', () => {
    const url = new URL(catalogPosterUrl(id, '/poster.jpg', { ...options, ...{ stremioAuthKey: 'private', lbSessionToken: 'private' } }, 'https://addon.example'));
    expect(JSON.parse(Buffer.from(url.pathname.split('/')[2], 'base64url').toString())).toEqual(options);
  });
  it('serves a working RPDB image', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([255, 216, 255]), { headers: { 'Content-Type': 'image/jpeg' } })));
    const res = await request();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect((await res.arrayBuffer()).byteLength).toBe(3);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each([403, 404, 429, 500])('falls back to TMDB for provider status %s', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('error', { status })));
    const res = await request();
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://image.tmdb.org/t/p/w500/poster.jpg');
    expect(res.headers.get('cache-control')).toContain('max-age=60');
  });
  it('falls back on timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Timeout', 'TimeoutError')));
    expect((await request()).headers.get('location')).toContain('image.tmdb.org');
  });
  it('rejects a successful HTML error page and an empty image', async () => {
    for (const response of [new Response('<html>Error</html>'), new Response('', { headers: { 'Content-Type': 'image/jpeg' } })]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
      expect((await request()).headers.get('location')).toContain('image.tmdb.org');
    }
  });
  it('looks up TMDB when the catalogue had no fallback path and rejects arbitrary fallback hosts', async () => {
    const mock = vi.fn().mockResolvedValueOnce(new Response('', { status: 404 })).mockResolvedValueOnce(Response.json({ movie_results: [{ id: 27205, poster_path: '/looked-up.jpg' }] }));
    vi.stubGlobal('fetch', mock);
    const res = await request('?tmdb=https://untrusted.example/image.jpg');
    expect(res.headers.get('location')).toBe('https://image.tmdb.org/t/p/w500/looked-up.jpg');
    expect(mock.mock.calls[1][0]).toContain('https://api.themoviedb.org/3/find/');
  });
  it('rejects malformed IMDb IDs before requesting a provider', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const res = await GET(new Request('https://addon.example/poster/x/bad.jpg'), { params: Promise.resolve({ config: 'x', id: 'bad.jpg' }) });
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});

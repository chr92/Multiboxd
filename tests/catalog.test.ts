import { beforeEach, describe, it, expect, vi } from 'vitest';
import { encodeConfig, decodeConfig } from '../lib/config';

vi.mock('../lib/watchlist', () => ({ getWatchlistCatalog: vi.fn() }));
vi.mock('../lib/tmdb', () => ({ findByImdb: vi.fn(), posterUrl: (path: string) => `https://image.tmdb.org/t/p/w1280${path}`, getRecommendations: vi.fn() }));
vi.mock('../lib/tracker', () => ({ trackEvent: vi.fn() }));
vi.mock('../lib/stremio', () => ({ addMissingToLibrary: vi.fn() }));
import { getWatchlistCatalog } from '../lib/watchlist';
import { findByImdb } from '../lib/tmdb';
import { GET } from '../app/[config]/catalog/[type]/[id]/route';
import { GET as extraGET } from '../app/[config]/catalog/[type]/[id]/[extra]/route';
import { GET as manifestGET } from '../app/[config]/manifest.json/route';

const config = encodeConfig({ ...decodeConfig(''), lbUsername: 'fixture', language: 'en-GB', catalogs: { ...decodeConfig('').catalogs, watchlist: true } });
const films = Array.from({ length: 235 }, (_, i) => ({ letterboxdSlug: `film-${i}`, title: `Film ${i}`, imdbId: `tt${1000000+i}` }));
const params = { config, type: 'movie', id: 'lb-watchlist' };
beforeEach(() => {
  vi.mocked(getWatchlistCatalog).mockImplementation(async (_username, skip) => films.slice(skip, skip + 100));
  vi.mocked(findByImdb).mockResolvedValue({ tmdbId: 1, type: 'movie', title: 'Localized title', posterPath: '/poster.jpg' });
});

describe('Stremio catalogue contract', () => {
  it('advertises skip and returns 100/100/35/0 metas via protocol paths', async () => {
    const manifest = await manifestGET(new Request(`https://addon.example/${config}/manifest.json`), { params: Promise.resolve({ config }) });
    expect((await manifest.json()).catalogs[0].extra).toContainEqual({ name: 'skip', isRequired: false });
    const pages = [];
    for (const skip of [0, 100, 200, 235]) {
      const res = await extraGET(new Request(`https://addon.example/${config}/catalog/movie/lb-watchlist/skip=${skip}.json`), { params: Promise.resolve({ ...params, extra: `skip=${skip}.json` }) });
      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
      pages.push((await res.json()).metas);
    }
    expect(pages.map(p => p.length)).toEqual([100, 100, 35, 0]);
    expect(new Set(pages.flat().map(m => m.id)).size).toBe(235);
    expect(pages[0][0]).toMatchObject({ type: 'movie', id: 'tt1000000', name: 'Localized title', poster: 'https://image.tmdb.org/t/p/w500/poster.jpg' });
  });
  it('supports query-string pagination and non-page-aligned offsets', async () => {
    const res = await GET(new Request(`https://addon.example/${config}/catalog/movie/lb-watchlist.json?skip=30`), { params: Promise.resolve({ ...params, id: 'lb-watchlist.json' }) });
    expect((await res.json()).metas[0].id).toBe('tt1000030');
  });
  it.each(['-1', 'NaN', '1.5', '100oops', '9007199254740992'])('rejects invalid skip %s', async skip => {
    const res = await GET(new Request(`https://addon.example/x?skip=${skip}`), { params: Promise.resolve(params) });
    expect(res.status).toBe(400);
  });
  it('returns a retryable error for blocked watchlists instead of a cached empty success', async () => {
    vi.mocked(getWatchlistCatalog).mockRejectedValueOnce(new Error('Letterboxd 403'));
    const res = await GET(new Request('https://addon.example/x'), { params: Promise.resolve(params) });
    expect(res.status).toBe(502);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

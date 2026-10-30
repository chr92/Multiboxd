import { EventEmitter } from 'node:events';
import https from 'node:https';
import { describe, it, expect, vi } from 'vitest';
import { getWatchlistCatalog } from '../lib/watchlist';
import { getWatchlist } from '../lib/letterboxd';

function mockLetterboxd(reply: (path: string) => { status: number; body: string }) {
  const paths: string[] = [];
  vi.spyOn(https, 'request').mockImplementation(((options: https.RequestOptions, callback: (res: EventEmitter) => void) => {
    const req = new EventEmitter() as EventEmitter & { end: () => void; setTimeout: () => void };
    req.setTimeout = () => {};
    req.end = () => {
      const path = options.path!;
      paths.push(path);
      const response = reply(path);
      const res = Object.assign(new EventEmitter(), { statusCode: response.status, headers: {} });
      callback(res);
      queueMicrotask(() => { res.emit('data', response.body); res.emit('end'); });
    };
    return req;
  }) as unknown as typeof https.request);
  return paths;
}

const imdb = (n: number) => `tt${String(n + 1000000)}`;
function grid(prefix: string, start: number, count: number) {
  // Nested modern LazyPoster markup used to produce duplicates or blank titles.
  return '<ul class="poster-list">' + Array.from({ length: count }, (_, i) =>
    `<li class="poster-container"><div class="react-component" data-component-class="LazyPoster" data-item-slug="${prefix}-${start+i}" data-item-name="Film ${start+i}" data-empty-poster-src="/empty.png"></div></li>`
  ).join('') + '</ul>';
}

describe('watchlist pagination through real scraping and IMDb resolution', () => {
  it('returns 100, 100, 43, 0 unique entries across 72-item source pages, filling IMDb gaps', async () => {
    const paths = mockLetterboxd(path => {
      if (path.startsWith('/film/')) {
        const n = Number(path.match(/-(\d+)\/$/)![1]);
        return { status: 200, body: [5, 110].includes(n) ? '<html></html>' : `<a href="https://imdb.com/title/${imdb(n)}/">IMDb</a>` };
      }
      const page = Number(path.match(/page\/(\d+)/)?.[1] || 1);
      const start = (page - 1) * 72;
      return { status: 200, body: grid('large', start, Math.max(0, Math.min(72, 245 - start))) };
    });
    const batches = [];
    for (const skip of [0, 100, 200, 243]) batches.push(await getWatchlistCatalog('large', skip));
    expect(batches.map(b => b.length)).toEqual([100, 100, 43, 0]);
    const all = batches.flat();
    expect(all.map(f => f.imdbId)).toEqual(Array.from({ length: 245 }, (_, n) => n).filter(n => ![5, 110].includes(n)).map(imdb));
    expect(all[0].title).toBe('Film 0');
    expect(new Set(all.map(f => f.imdbId)).size).toBe(243);
    expect((await getWatchlistCatalog('large', 30)).map(f => f.imdbId)).toEqual(all.slice(30, 130).map(f => f.imdbId));
    expect(paths.filter(p => p.includes('watchlist')).length).toBe(5);
    expect(paths.filter(p => p.startsWith('/film/')).length).toBe(245);
  });

  it('shares in-flight page loads for concurrent requests and stops on a repeated last page', async () => {
    const paths = mockLetterboxd(path => ({ status: 200, body: path.startsWith('/film/')
      ? `<a href="https://imdb.com/title/${imdb(Number(path.match(/-(\d+)\/$/)![1]))}">IMDb</a>`
      : grid('repeat', 0, 36) }));
    const [a, b] = await Promise.all([getWatchlistCatalog('repeat', 0), getWatchlistCatalog('repeat', 0)]);
    expect(a).toEqual(b);
    expect(a).toHaveLength(36);
    expect(paths.filter(p => p.includes('watchlist'))).toEqual(['/repeat/watchlist/', '/repeat/watchlist/page/2/']);
  });

  it('retries a blocked page rather than caching it as the end of the catalogue', async () => {
    let blocked = true;
    mockLetterboxd(path => {
      if (path.startsWith('/film/')) return { status: 200, body: `<a href="https://imdb.com/title/${imdb(Number(path.match(/-(\d+)\/$/)![1]))}">IMDb</a>` };
      if (!path.includes('/page/')) return { status: 200, body: grid('retry', 0, 72) };
      if (path.includes('/page/2/')) return blocked ? { status: 403, body: 'Blocked' } : { status: 200, body: grid('retry', 72, 40) };
      return { status: 404, body: '' };
    });
    await expect(getWatchlistCatalog('retry', 0)).rejects.toThrow('403');
    blocked = false;
    expect(await getWatchlistCatalog('retry', 0)).toHaveLength(100);
    expect(await getWatchlistCatalog('retry', 100)).toHaveLength(12);
  });

  it('deduplicates legacy nested poster markup and keeps the film name', async () => {
    mockLetterboxd(() => ({ status: 200, body: '<ul class="poster-list"><li class="poster-container"><div class="film-poster" data-film-slug="legacy" data-film-name="Legacy"><img alt="Legacy" src="/poster.jpg"></div></li></ul>' }));
    expect(await getWatchlist('legacy')).toEqual([{ letterboxdSlug: 'legacy', title: 'Legacy', poster: '/poster.jpg', year: undefined, rating: undefined }]);
  });
});

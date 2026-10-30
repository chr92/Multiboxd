import NodeCache from 'node-cache';
import { getWatchlist, resolveImdbIds, LbFilm } from './letterboxd';

export const CATALOG_PAGE_SIZE = 100;

interface WatchlistState {
  films: LbFilm[];
  slugs: Set<string>;
  ids: Set<string>;
  nextPage: number;
  exhausted: boolean;
  pending?: Promise<void>;
}

// Keep offsets stable across requests, including entries with no IMDb match.
// Cache only public watchlists; never put session cookies in shared state.
const cache = new NodeCache({ stdTTL: 900, checkperiod: 120, useClones: false });

export async function getWatchlistCatalog(username: string, skip: number): Promise<LbFilm[]> {
  const key = username.toLowerCase();
  let state = cache.get<WatchlistState>(key);
  if (!state) {
    state = { films: [], slugs: new Set(), ids: new Set(), nextPage: 1, exhausted: false };
    cache.set(key, state);
  }
  const end = skip + CATALOG_PAGE_SIZE;
  while (state.films.length < end && !state.exhausted) {
    if (!state.pending) {
      const current = state;
      current.pending = (async () => {
        const page = await getWatchlist(username, undefined, current.nextPage);
        const fresh = page.filter(f => !current.slugs.has(f.letterboxdSlug));
        // Also stop if Letterboxd repeats its last page instead of returning an empty page.
        if (!fresh.length) {
          current.exhausted = true;
          return;
        }
        const resolved = await resolveImdbIds(fresh);
        for (const film of resolved) {
          if (film.imdbId && !current.ids.has(film.imdbId)) {
            current.ids.add(film.imdbId);
            current.films.push(film);
          }
        }
        fresh.forEach(f => current.slugs.add(f.letterboxdSlug));
        current.nextPage++;
      })().finally(() => { current.pending = undefined; });
    }
    await state.pending;
  }
  return state.films.slice(skip, end);
}

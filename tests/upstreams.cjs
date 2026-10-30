// Deterministic upstreams for production-server/Docker smoke tests only.
// Load explicitly with NODE_OPTIONS=--require=/fixtures/upstreams.cjs.
const https = require('node:https');
const { EventEmitter } = require('node:events');
const { syncBuiltinESMExports } = require('node:module');
https.request = (options, callback) => {
  if (options.hostname !== 'letterboxd.com') throw new Error('Unexpected HTTPS host in smoke test');
  const req = new EventEmitter();
  req.setTimeout = () => {};
  req.end = () => {
    const path = options.path;
    let body;
    if (path.startsWith('/film/fixture-')) {
      const n = Number(path.match(/fixture-(\d+)/)[1]);
      body = `<a href="https://imdb.com/title/tt${1000000+n}/">IMDb</a>`;
    } else if (path.startsWith('/fixture/watchlist/')) {
      const page = Number(path.match(/page\/(\d+)/)?.[1] || 1);
      const start = (page - 1) * 28;
      body = '<ul class="poster-list">' + Array.from({ length: Math.max(0, Math.min(28, 235-start)) }, (_, i) =>
        `<li><div class="react-component" data-component-class="LazyPoster" data-item-slug="fixture-${start+i}" data-item-name="Film ${start+i}"></div></li>`).join('') + '</ul>';
    } else throw new Error('Unexpected Letterboxd path in smoke test');
    const res = Object.assign(new EventEmitter(), { statusCode: 200, headers: {} });
    callback(res);
    queueMicrotask(() => { res.emit('data', body); res.emit('end'); });
  };
  return req;
};
syncBuiltinESMExports();
const realFetch = global.fetch;
global.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (['localhost', '127.0.0.1'].includes(url.hostname)) return realFetch(input, init);
  if (url.hostname === 'api.themoviedb.org') return Response.json({ movie_results: [{ id: 1, poster_path: '/fixture.jpg', title: 'Fixture movie' }] });
  if (url.hostname === 'api.ratingposterdb.com') {
    if (url.pathname.includes('/test-working/')) return new Response(new Uint8Array([255, 216, 255]), { headers: { 'content-type': 'image/jpeg' } });
    return new Response('Missing poster', { status: 404 });
  }
  throw new Error(`Unexpected fetch host in smoke test: ${url.hostname}`);
};

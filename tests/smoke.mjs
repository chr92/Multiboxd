import assert from 'node:assert/strict';
const base = process.env.SMOKE_URL || 'http://127.0.0.1:3000';
const config = Buffer.from(JSON.stringify({ lbUsername: 'fixture', language: 'en-GB', catalogs: { watchlist: true } })).toString('base64url');
for (let attempt = 0; ; attempt++) {
  try { assert.equal((await fetch(`${base}/health`)).status, 200); break; }
  catch (error) { if (attempt >= 30) throw error; await new Promise(r => setTimeout(r, 1000)); }
}
const manifest = await (await fetch(`${base}/${config}/manifest.json`)).json();
assert.deepEqual(manifest.catalogs[0].extra, [{ name: 'skip', isRequired: false }]);
const all = [];
for (const [skip, count] of [[0, 100], [100, 100], [200, 35], [235, 0]]) {
  const path = skip === 0 ? 'lb-watchlist.json' : `lb-watchlist/skip=${skip}.json`;
  const res = await fetch(`${base}/${config}/catalog/movie/${path}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  const { metas } = await res.json();
  assert.equal(metas.length, count);
  for (const meta of metas) {
    assert.match(meta.id, /^tt\d{7,}$/);
    assert.equal(meta.type, 'movie');
    assert.equal(meta.poster, 'https://image.tmdb.org/t/p/w500/fixture.jpg');
  }
  all.push(...metas);
}
assert.equal(new Set(all.map(m => m.id)).size, 235);
const query = await (await fetch(`${base}/${config}/catalog/movie/lb-watchlist.json?skip=30`)).json();
assert.equal(query.metas[0].id, 'tt1000030');
assert.equal((await fetch(`${base}/${config}/catalog/movie/lb-watchlist/skip=-1.json`)).status, 400);
for (const key of ['test-working', 'test-missing']) {
  const ratedConfig = Buffer.from(JSON.stringify({ lbUsername: 'fixture', rpdbKey: key, catalogs: { watchlist: true } })).toString('base64url');
  const { metas } = await (await fetch(`${base}/${ratedConfig}/catalog/movie/lb-watchlist.json`)).json();
  const poster = await fetch(metas[0].poster, { redirect: 'manual' });
  if (key === 'test-working') {
    assert.equal(poster.status, 200);
    assert.equal(poster.headers.get('content-type'), 'image/jpeg');
    assert.equal((await poster.arrayBuffer()).byteLength, 3);
  } else {
    assert.equal(poster.status, 302);
    assert.equal(poster.headers.get('location'), 'https://image.tmdb.org/t/p/w500/fixture.jpg');
  }
}
console.log('Production HTTP smoke passed: 235 unique films in 100/100/35/0 batches; query/path skips; RPDB image and TMDB fallback.');

# Self-hosting this fork

Use the `self-hosted` branch of https://github.com/chr92/Multiboxd.
It includes the Watchlist/poster fixes proposed in https://github.com/Affoghiamoci/Multiboxd/pull/4,
plus separate dependency maintenance for this deployment. The upstream PR stays focused on the catalogue fixes.

The deployment branch updates Next.js within version 15, aligns its ESLint package, overrides the vulnerable PostCSS version, and removes unused Axios/Playwright/stealth dependencies. No application code imports those removed packages. Chromium is no longer installed in the runtime image. On 30 October 2026, a clean install reported zero npm audit vulnerabilities; this is a point-in-time dependency check, not a security guarantee.

## Required before deployment

- Confirm the Hetzner server, SSH username and an authorised SSH key/access method.
- Confirm the installation directory, available host port, and CPU architecture. CI tests Linux amd64.
- Confirm the intended public HTTPS hostname and reverse proxy (including its certificate/DNS setup).
- Provide a real TMDB API v3 key in `.env.local` on the server. This enables localized posters, the independent TMDB fallback and recommendations. Without it the final fallback is Metahub.
- If rated posters are wanted, configure the existing RPDB/OpenPosterDB key and style in the add-on UI. Do not commit keys, cookies, or credential-bearing installation URLs.

No Hetzner access or production deployment has been performed as part of this change.

## Commands for the confirmed destination

Run these only after the destination and access have been confirmed:

```sh
git clone --branch self-hosted https://github.com/chr92/Multiboxd.git
cd Multiboxd
cp .env.example .env.local
# Edit .env.local to set your real TMDB_API_KEY.
chmod 600 .env.local
docker compose up -d --build
curl --fail http://127.0.0.1:11463/health
```

Compose binds `127.0.0.1:11463` on the host to `3000` inside the container.
For a reverse proxy running on the host, forward the confirmed HTTPS hostname to that loopback address.
A containerised reverse proxy instead needs a shared Docker network or an explicitly configured host gateway;
its own `127.0.0.1` is not the Multiboxd container. Forward the original `Host` (or `X-Forwarded-Host`) and
`X-Forwarded-Proto: https` so poster URLs use the public origin.

Open the public HTTPS configuration page, enter your Letterboxd username, enable Watchlist,
set the language and optional rated-poster settings, then install the generated manifest in Stremio.
Keep Watchlist-to-Library sync disabled unless you explicitly want account writes.
Check the Watchlist under Discover for full browsing; Home rows may show a shorter preview.

A successful `/health` response confirms the app is running, not the validity of external API credentials.
The first Watchlist load resolves IMDb IDs and can take several seconds. Public Watchlist state is cached for
15 minutes. Films without a resolvable IMDb ID are excluded; provider outages or changed Letterboxd markup
can still affect availability.

## Verification

```sh
npm ci
npm test
npm run typecheck
npm run build
npm audit
```

The GitHub workflow also builds the container, validates Compose, and runs real HTTP requests against
fixture upstreams: 235 unique films in 100/100/35/0 batches, both offset formats, working rated posters
and independent TMDB fallback. `tests/upstreams.cjs` is only a test fixture: never set its `NODE_OPTIONS`
preload in a real deployment.

Live validation returned 63 unique IMDb entries from a public Watchlist spanning 28/28/7 source entries,
and three sampled Metahub poster URLs returned HTTP 200. A public free RPDB sample also returned an image.
Private paid-provider settings, a live TMDB credential and manual Stremio-client browsing still require
verification at the confirmed destination.

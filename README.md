# Multiboxd

Multiboxd è un add-on per Stremio che ti permette di integrare i cataloghi di Letterboxd direttamente nell'applicazione. Sincronizza la tua Watchlist, il tuo Diary, i film consigliati in base ai tuoi gusti e le attività dei tuoi amici, oltre a liste pubbliche personalizzate.

## Caratteristiche
- **Nessun metadato proprio**: A differenza di altri add-on, Multiboxd non fornisce metadati (descrizioni, cast, trailer, ecc.), appoggiandosi a quelli già presenti in Stremio. Questo lo rende leggerissimo e compatibile con tutti gli altri add-on, evitando fastidiosi duplicati.
- **Sincronizzazione Letterboxd**: Inserisci il tuo username e sincronizza le tue liste pubbliche. Nessuna password richiesta!
- **Supporto TMDB (Opzionale ma Consigliato)**: A causa di come Stremio gestisce i metadati visivi nei cataloghi esterni, il gestore dell’istanza deve configurare una API Key gratuita di TMDB nella variabile server `TMDB_API_KEY` se si desiderano locandine e titoli localizzati (es. in italiano) nel grid dei cataloghi. Questa chiave abilita anche i film consigliati in base ai tuoi gusti.
- **Voti sulle Locandine**: Inserisci una API Key di Rating Poster Database (RPDB) o OpenPosterDB per visualizzare i voti di Letterboxd/IMDb direttamente sulle locandine dei film. È possibile usare la chiave pubblica gratuita `t0-free-rpdb` per testare RPDB.
- **Supporto Multilingua**: Interfaccia del sito disponibile in Italiano e Inglese.

## 📝 Note sul caricamento
Per ottimizzare i tempi di risposta ed evitare ban da parte di Letterboxd, i cataloghi vengono caricati a scaglioni di circa **100 film alla volta** mentre scorri nell'app di Stremio.
- **Liste Custom Molto Lunghe**: Se aggiungi una lista pubblica molto lunga (oltre i 100 film) e vuoi scoprire film sempre diversi presi da *tutta* la lista, ti consigliamo fortemente di attivare lo **Shuffle (🔀)** in fase di configurazione. Attivando lo shuffle, l'addon scaricherà e mescolerà l'intera lista in background prima di mostrarti i blocchi da 100.
- **Watchlist**: il server unisce le pagine Letterboxd fino a ottenere 100 film con ID IMDb (oppure la fine della lista), senza assumere un numero fisso di film per pagina. Duplicati e film senza ID IMDb non consumano gli offset. Lo snapshot pubblico rimane in cache per 15 minuti. Sono supportati sia `/skip=100.json` sia `?skip=100`. Diario e Watched continuano a usare la paginazione precedente.
- **Locandine**: senza chiave RPDB/OpenPosterDB viene usata TMDB, con Metahub come ultima risorsa. Con una chiave, il server richiede la locandina con `fallback=true`; errori, risposte non immagine o timeout usano la locandina TMDB. Per questa fallback serve `TMDB_API_KEY`. Un’immagine realmente assente in tutte le fonti non può essere recuperata.

## Come installare l'add-on
1. Visita la pagina di configurazione (es. [multiboxd.fly.dev](https://multiboxd.fly.dev) o la tua istanza locale)
2. Inserisci il tuo username Letterboxd.
3. Per il self-hosting, configura `TMDB_API_KEY` in `.env.local` sul server per locandine localizzate e suggerimenti. La chiave non si inserisce nella pagina di configurazione.
4. Seleziona i cataloghi che vuoi mostrare su Stremio.
5. Clicca su **Install in Stremio** o copia l'URL generato.

## 💻 Installazione in Locale / Self-Hosting

Puoi ospitare facilmente la tua istanza di Multiboxd usando **Docker** o **Node.js**.

### Opzione A: Docker (Consigliata)
Questo progetto include un `Dockerfile` multipiattaforma ottimizzato.

```bash
# 1. Clona il repository
git clone https://github.com/Affoghiamoci/Multiboxd.git
cd Multiboxd

# 2. Configura la chiave TMDB server-side
cp .env.example .env.local
# Modifica .env.local con la tua chiave TMDB (non committare questo file)

# 3. Costruisci l'immagine Docker
docker build -t multiboxd .

# 4. Avvia il container sulla porta 3000
docker run --env-file .env.local -p 127.0.0.1:3000:3000 multiboxd
```
L'app sarà disponibile all'indirizzo `http://localhost:3000`.

In alternativa, `docker compose up -d --build` legge `.env.local` e pubblica la porta `127.0.0.1:11463` verso la porta `3000` del container. Per Stremio remoto serve un reverse proxy HTTPS che inoltri `Host`/`X-Forwarded-Host` e `X-Forwarded-Proto`. L’endpoint `/health` è disponibile per i controlli di salute. I file `.env*` sono esclusi dall’immagine.

### Opzione B: Node.js (Locale)
Requisiti: Node.js 22 (come nell’immagine Docker).

```bash
# 1. Clona il repository
git clone https://github.com/Affoghiamoci/Multiboxd.git
cd Multiboxd

# 2. Configura TMDB e installa le dipendenze
cp .env.example .env.local
# Modifica .env.local con la tua chiave
npm ci

# 3. Costruisci per la produzione (opzionale ma consigliato per le prestazioni)
npm run build
npm start

# Oppure, per l'ambiente di sviluppo:
# npm run dev
```
L'app sarà disponibile all'indirizzo `http://localhost:3000`.

## 🚀 Deploy su Fly.io
L'app è già configurata per essere facilmente deployata su [Fly.io](https://fly.io) tramite il file `fly.toml` incluso.
Ti basta autenticare la CLI di Fly e lanciare:
```bash
fly deploy
```

## Test

```bash
npm ci
npm test
npm run typecheck
npm run build
```

I test usano fixture locali: nessuna credenziale o richiesta ai servizi reali è necessaria.
La CI costruisce anche l’immagine Docker e verifica le risposte HTTP Stremio con 235 film
(100/100/35/0), offset, ID unici, immagini RPDB e fallback TMDB.
`tests/upstreams.cjs` è esclusivamente un simulatore per i test: non caricarlo in produzione.

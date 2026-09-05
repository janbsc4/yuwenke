# Yuwenke performance report — 2026-09-05

## Method

- Artifact: production build (`npm run build`, Astro 7.1.3), served by `astro preview --host 0.0.0.0 --port 4321` (zero network variance).
- Browser: Playwright Chromium / Chrome for Testing **153.0.8010.12** (chromium-1243), headless, fresh profile per run.
- Node v26.7.0, macOS arm64. Lighthouse **12.8.2**, performance category only, **simulated throttling** (deterministic arithmetic over the trace).
- All time metrics: median with min–max over runs. Bytes and counts are exact.

## A. Bundle inventory (raw / gzip)

| Asset | Raw | Gzip | When loaded |
|---|---:|---:|---|
| HTML, app page (`/app/es/`, full dataset as island props) | 234.3 KB | 36.0 KB | document |
| HTML, landing | 16.0 KB | 4.7 KB | document |
| `_astro/firebaseClient.js` | 573.1 KB | 166.3 KB | **lazy** (sync only) |
| `_astro/client.js` (react-dom) | 184.1 KB | 57.7 KB | eager |
| `_astro/FlashcardApp.js` | 117.1 KB | 31.0 KB | eager |
| `_astro/firebaseConfig.js` | 20.9 KB | 7.7 KB | eager |
| CSS (both files) | 49.6 KB | 12.2 KB | eager |
| `icon-192.png` | 112.6 KB | — | eager (`<link rel=icon>`) |
| `yuwenke-mark.png` | 12.4 KB | — | eager |
| `favicon.ico` | 15.6 KB | — | eager |

**Per-chunk attribution** (sourcemap VLQ decode, raw bytes):

- `firebaseClient.js`: @firebase/firestore 240.6 KB · **re2js 153.5 KB** · @firebase/auth 83.7 KB · @firebase/webchannel-wrapper 49.6 KB · @firebase/app+util+idb+misc ~17 KB · app code ~6 KB
- `client.js`: react-dom 174.5 KB · scheduler 3.5 KB
- `FlashcardApp.js`: **zod 63.5 KB (54% of the chunk)** · app code 48.8 KB

## B. Cold load (Lighthouse, simulated throttling)

| Route | Score | FCP | LCP | TBT | CLS | Requests | Transfer |
|---|---|---|---|---|---|---:|---:|
| `/app/es/` desktop (n=5) | 97 (87–97) | 1.28 s | 2.63 s | 0 ms | 0 | 10 | 285.5 KB |
| `/app/en/` desktop (n=3) | 97 | 1.28 s | 2.63 s | 0 ms | 0 | 10 | 285.5 KB |
| `/app/es/` mobile (n=3) | 96 | 1.28 s | 2.70 s | 0 ms | 0.02 | 10 | 285.5 KB |
| `/` landing desktop (n=5) | 99 | 0.75 s | 2.03 s | 0 ms | 0 | 7 | 178.7 KB |

- One outlier run (es-desktop: score 87, SI 13 s) — a local hiccup; all other runs within noise.
- LCP element on the app page is the **loading skeleton `<p>`** ("Preparando tus cartas…"); real card content paints after hydration, so measured LCP understates perceived readiness.

## C. Interaction cost (20 cards × flip → decide → next, 3 runs)

| Metric | Runs (1 / 2 / 3) |
|---|---|
| Layouts | 141 / 203 / 180 (~4.5 per action) |
| Style recalcs | 304 / 363 / 326 |
| Main-thread task time (total) | 0.3 / 0.9 / 0.4 s (~8–22 ms per action) |
| Long tasks > 50 ms | 0 / 1 (55 ms) / 0 |
| JS heap growth | 1.6–2.9 MB per 20 cards |
| DOM nodes at rest | ~1,370 |

React render counts (React Profiler, jsdom): **4 commits at mount, 2 commits per flip+decide cycle**, slowest commit 2.18 ms. No re-render cascade.

Network during a guest session (5 cards + progress saved): **zero** requests to Firestore/Google; only `firebaseConfig.js` (7.7 KB) loads. The 166 KB `firebaseClient.js` chunk never loads for guests.

## Findings, ranked

1. **`icon-192.png` is 112.6 KB eager on every page** (~40% of app cold-load transfer, ~13% of landing). A 192 px icon should be ~10–15 KB (optimized PNG or SVG). Cheapest win.
2. **zod ships in the eager app chunk (63.5 KB raw, 54% of `FlashcardApp.js`).** Cards are already validated at build time by Astro; runtime revalidation on every page load buys little. Dropping zod from the island is the biggest eager-JS saving (~15–20 KB gz estimate).
3. **Dataset-in-HTML scales linearly**: app pages embed all 210 cards as island props (36 KB gz today). Correct for offline-first; revisit around ~1,000 cards (~170 KB gz).
4. **Firebase chunk is lazy and never loads for guests** — correct as built. If it ever needs slimming, re2js (153.5 KB raw, 27% of the chunk) is the surprise inside; it is only used for Firestore's index/regex needs.
5. **Everything else is healthy**: TBT 0, CLS 0–0.02, no meaningful long tasks, minimal commits, ~15 ms of main-thread work per interaction. There is no rendering performance problem.

Caveat: numbers are lab-local. The production deploy (GitHub Pages) adds CDN RTT, which pushes LCP above the 2.6 s modeled here, mostly via the 36 KB document + eager JS before hydration.

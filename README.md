# Yuwenke

Yuwenke is a personal experiment with notes from my Chinese class. It explores how class material can become structured study data and a small, useful flashcard app.

The content combines Mandarin characters, pinyin, Spanish meanings, explanations, examples, grammar ideas, and cultural notes. It is based on personal class notes and is not intended to be an authoritative Mandarin reference.

## The app

The site is a static Astro app with one React study interface. It can be hosted for free on GitHub Pages at:

`https://janbsc4.github.io/yuwenke/`

It includes:

- 139 source cards and 247 study units;
- `Estudiar`, `Descubrir`, `Dominadas`, and `Favoritas` modes;
- Mandarin → Spanish and Spanish → Mandarin prompts;
- Spanish question-and-answer prompts for concept rules;
- search by characters, pinyin, Spanish, explanations, and tags;
- topic and card-type filters;
- shuffled sessions without repetition;
- lilac highlighting for proper names across Hanzi, pinyin, and Spanish;
- an in-app guide explaining the study flow and visual conventions;
- seven editable card packs for progressive discovery;
- guest progress, favorites, and open packs in local storage;
- optional Google sign-in and Firestore synchronization for study state.

The flashcard content and pack membership are compiled from repository files during the build. Firestore stores only each user's progress, card-level favorites, open packs, and reset boundary, so a content database is not required.

## Project files

- `chino_flashcards.csv` — the structured class-note dataset.
- `card_packs.json` — the ordered Card Pack catalog.
- `card_pack_membership.csv` — the single Card Pack assignment for every Source Flashcard.
- `scripts/build_flashcards.mjs` — regenerates the CSV from its maintained source rows.
- `src/` — the Astro page, React interface, study logic, and persistence services.
- `firestore.rules` — owner-only validation rules for synchronized study state.
- `tests/` — CSV, study-domain, component, storage, and Firestore rules tests.
- `docs/flashcard-app-plan.md` — the approved implementation plan.
- `Notas Clase Chino Lei.pdf` — the original local notes, intentionally excluded from Git.

## Local development

Node.js 22.12 or newer is required.

```sh
npm install
npm run dev
```

Astro serves the project under its configured `/yuwenke/` base path. Useful checks are:

```sh
npm test
npm run check
npm run build
```

Firestore rule tests additionally require Java 21:

```sh
npm run test:rules
```

## Regenerating the dataset

```sh
npm install
node scripts/build_flashcards.mjs
```

The script preserves the existing `FC001`–`FC139` identities because saved progress uses those IDs. Existing cards must not be reordered or removed; append new rows at the end. A deliberate identity migration should update both the data and affected progress records.

The `nombres_propios` column contains semicolon-separated literal forms that should be highlighted as proper names. The maintained annotations live in `properNamesById` inside the build script; the underlying study text stays unchanged so search and card identity remain stable.

## Optional Firebase synchronization

The app works completely as a guest when Firebase is not configured. Progress statuses, card-level favorites, and open packs use offline outboxes and synchronize after sign-in. To add account synchronization:

1. Create a Firebase project and a Web App.
2. Enable Google in Authentication → Sign-in method.
3. Add `janbsc4.github.io`, `localhost`, and `127.0.0.1` as authorized domains.
4. Create a Firestore database.
5. Copy `.env.example` to `.env` and fill in the public web configuration.
6. Deploy the security rules separately from GitHub Pages:

```sh
firebase login
firebase deploy --only firestore:rules --project YOUR_PROJECT_ID
```

Firebase web configuration values are public by design. Authentication and `firestore.rules` protect user data. Google authentication uses a popup because redirect helpers are not reliably available from a GitHub Pages project subpath.

## GitHub Pages deployment

The workflow in `.github/workflows/deploy.yml` tests and builds every push to `main`, then publishes `dist` with GitHub Pages.

In the GitHub repository:

1. Select **GitHub Actions** as the Pages source.
2. Add these repository variables under Settings → Secrets and variables → Actions:

   - `PUBLIC_FIREBASE_API_KEY`
   - `PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `PUBLIC_FIREBASE_PROJECT_ID`
   - `PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `PUBLIC_FIREBASE_APP_ID`

Leave them unset for a guest-only deployment.

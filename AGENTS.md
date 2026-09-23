# AGENTS.md

## What this is

Yuwenke turns personal Chinese class notes into flashcards. Static Astro site with a React study interface, hosted on GitHub Pages under the `/yuwenke/` base path, localized to Spanish and English. Content comes from personal class notes, not an authoritative Mandarin reference.

## Architecture

`chino_flashcards.csv` is the dataset; `card_packs.json` and `card_pack_membership.csv` assign every card to exactly one pack. Astro validates all three at build time (`src/data/`), so malformed data fails the deploy instead of shipping.

Firestore stores learner state (progress, favorites, Open Packs, Reset Boundary), never card content or chat transcripts. Léi runs on Cloudflare Workers, with private usage counters in a SQLite-backed Durable Object. The app works offline and as a guest without backend configuration; do not break guest mode when touching Firebase sync.

`chinese-knowledge.md` is generated from the CSV by `scripts/build_chinese_knowledge.mjs`. Never edit generated files; edit the source and rerun the generator. Tests diff committed generated files against generator output, so hand edits fail CI.

## Card identity and packs

Card IDs (`FC001`, ...) and pack IDs (`CP001`, ...) are stable identifiers referenced by saved user progress. Append new cards and packs at the end; never reorder or remove existing entries. Identity changes are migrations, not edits. `scripts/build_flashcards.mjs` refuses to shrink the dataset or renumber, and requires complete English content per card.

Catalog order controls recommendation priority only; the first pack is the default.

## Proper names

The `nombres_propios` CSV field holds semicolon-separated exact forms (Hanzi, pinyin, Spanish, English) that the interface renders in lilac. Keep study text plain; register every displayed form in `properNamesById` in `scripts/build_flashcards.mjs` instead of adding markup.

## Concept cards

Cards with `tipo: concepto` test the rule itself, not a translation: Spanish question in `espanol`, Spanish answer in `explicacion`, one Spanish-to-Spanish study unit, no reverse direction. Hanzi, pinyin, and examples are supporting reference.

Review every card as a complete learning unit: prompt, answer, explanation, and examples must stay natural and mutually consistent.

## Development

Node.js 22.13+ is required. Commands live in `package.json`. The husky `pre-push` hook runs lint, typecheck, and tests; CI is the unskippable layer and runs the same checks on pull requests before deploying.

For visual QA, build and serve the real routes, then screenshot `http://localhost:4321/yuwenke/` and `/yuwenke/app/<locale>/` (the `--host` flag matters: an unexposed localhost render misses nothing, but the preview browser reaches the machine by IP):

```
npm run build && npm run preview -- --host 0.0.0.0 --port 4321
```

`npm test` excludes `tests/firestore.rules.test.ts`, which needs Java 21 and the Firestore emulator; run it with `npm run test:rules`, or both suites with `npm run test:all`.

## Truth is the code

The repository, not prose, is the authority on how things work. Documentation explains; executable checks adjudicate.

* Every rule that matters must be mechanically enforceable. If a rule here could be a check instead, move it into a check and shrink this file.
* When you introduce or tighten an invariant, add its guardian in the same change.
* When documentation and code disagree, the code wins. Update the documentation in the same change.
* Prefer checks that fail with expected-versus-actual messages over checks that require human judgment.
* Fix the cheapest failing check first: lint, then typecheck, then unit tests, then build and deploy gates.
* Keep changes small and single-purpose so a mistake is cheap to revert.
* Treat tests as executable examples of intended use, and name them accordingly.

## Engineering priorities

1. User experience first: fast, responsive, lightweight. Optimize perceived performance; avoid unnecessary re-renders, bundle size, and network requests.
2. Readability: clear names, small focused functions, explicit logic. Comments explain why, not what.
3. Simplicity: the simplest correct solution; no speculative abstractions or dependencies. Follow YAGNI principles.

If a feature requires significant architectural complexity, stop and explain why, what alternatives exist, and the trade-offs before building it. Prefer consistency with the existing codebase; keep changes small and single-purpose so mistakes are cheap to revert.

## Agent skills

* Issues and PRDs: GitHub Issues, see `docs/agents/issue-tracker.md`.
* Domain docs: single-context layout, see `docs/agents/domain.md`.
* End commit messages with the model name that implemented the feature, like "GLM-5.3-Flash"

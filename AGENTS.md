# AGENTS.md

## Project overview

Yuwenke is a personal experiment that transforms Chinese class notes into a structured flashcard application.

The source material contains Mandarin characters, pinyin, Spanish meanings, grammar notes, explanations, examples, and cultural context. It is based on personal notes rather than being an authoritative Mandarin reference.

The application is a static Astro website with a single React study interface. It is designed to be hosted for free on GitHub Pages.

## Architecture

The flashcard dataset is generated during the build process from `chino_flashcards.csv`.

Firestore **does not** store flashcard content. It stores **only user progress**, allowing the application to work completely offline or as a guest without any backend configuration.

The main project areas are:

* `chino_flashcards.csv` — structured flashcard dataset.
* `scripts/build_flashcards.mjs` — rebuilds the dataset while preserving card identities.
* `src/` — Astro pages, React UI, study logic, and persistence.
* `tests/` — unit and integration tests.
* `firestore.rules` — Firestore security rules.
* `docs/flashcard-app-plan.md` — approved implementation plan.

## Card identity

Card IDs (`FC001`, `FC002`, ...) are stable identifiers.

**Never reorder or remove existing cards.**

New cards must always be appended to the end of the dataset. Existing IDs are referenced by saved user progress.

If a change requires modifying card identities, treat it as a migration rather than a normal edit.

## Dataset annotations

The `nombres_propios` CSV field contains semicolon-separated exact forms of proper names that the interface renders in lilac. This includes people, surnames, countries, and places across Hanzi, pinyin, and Spanish.

Keep the study text itself plain. When adding or changing a proper name, update `properNamesById` in `scripts/build_flashcards.mjs` with every displayed form instead of adding markup to the card text.

## Development

Node.js 22.12+ is required.

Useful commands:

```sh
npm install
npm run dev
npm test
npm run check
npm run build
```

Firestore rule tests additionally require Java 21:

```sh
npm run test:rules
```

## Engineering priorities

When making changes, follow these priorities in order:

### 1. User experience and performance

The highest priority is the experience of the user.

Prefer solutions that make the application:

* fast
* responsive
* smooth
* lightweight

Optimize for perceived performance, not just benchmarks.

Avoid unnecessary re-renders, excessive bundle size, unnecessary network requests, or expensive computations during interaction.

### 2. Readability and maintainability

Code should be easy for a human to understand.

Prefer:

* clear names
* straightforward control flow
* small, focused functions
* explicit logic over clever tricks

Comments are allowed, but code should ideally explain itself. Comments should explain *why*, not *what*.

Future contributors (including AI agents) should be able to understand code quickly.

### 3. Simplicity

Prefer the simplest solution that correctly solves the problem.

Avoid introducing abstractions, patterns, generic frameworks, or additional dependencies unless they provide a clear long-term benefit.

Do not optimize for hypothetical future requirements.

## Complexity policy

If a requested feature requires significant additional architectural complexity, stop before implementing it and explain:

* why the complexity is necessary,
* what alternatives were considered,
* what trade-offs exist.

Ask for approval before proceeding with a substantially more complex implementation.

Small, localized complexity that clearly improves correctness or performance is acceptable.

## General guidance

* Preserve existing architecture unless there is a compelling reason to change it.
* Prefer consistency with the existing codebase over introducing new patterns.
* Keep components and modules focused on a single responsibility.
* Minimize dependencies.
* Ensure new functionality includes appropriate tests.
* Do not break guest mode when working on Firebase synchronization.
* Remember that the app is deployed to GitHub Pages and runs under the configured `/Yuwenke/` base path.

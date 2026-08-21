# Grilled plan 001: English translations

## Status

Grilling complete and shared understanding confirmed. This document records repository facts, decisions, risks, and the agreed implementation plan. It does not authorize implementation.

## Goal

Define what "add an English translation to the app" means for Yuwenke, then produce a design that preserves stable card identities, offline guest use, static GitHub Pages deployment, and coherent Mandarin learning units.

## Three sessions

This plan is split into three sequential parts, each sized for one working session. Each part ends with the repository in a buildable, passing state on the main branch (`npm test`, `npm run test:rules`, `npm run check`, `npm run build`). Do not start a part until the previous one is merged.

| Part | Scope | Implementation steps |
| --- | --- | --- |
| 1. Data, schema, and migration foundation | The data layer that everything else consumes: add the English fields, locale types, typed message dictionaries, localized Card Pack schema, loaders, validation, and the progress-direction migration across local storage, Firestore keys, and security rules. No rendering or routing changes. | 1–2 |
| 2. Localized rendering and routing | The application layer: refactor card, filter, pack, help, and metadata rendering to consume localized display content, add `/yuwenke/es/` and `/yuwenke/en/` routes plus the root locale resolver, implement in-place locale switching that preserves the study session, and translate all interface copy. | 3–5 |
| 3. English content and release | The content layer: draft all English card fields from Mandarin with machine assistance, obtain human review of every card, add English proper-name forms, correct any source discrepancy in both languages, and enable the English route only once all acceptance checks pass. | 6–7 |

Rationale for the split:

- **Data before UI.** Steps 1–2 change the schema and progress keys. They must exist before any component consumes English content or any route serves it. Keeping them isolated avoids mixing a persistence migration into a rendering refactor.
- **Rendering before content.** Steps 3–5 make the app fully bilingual-capable without requiring any card to be translated. This lets the locale plumbing be verified end to end (routes, switching, search, metadata) before the large content effort begins.
- **Content last.** Step 6 is the largest and least mechanical effort (210 cards of Mandarin-aware review) and the release gate. Keeping it separate lets sessions 1 and 2 ship measurable value without blocking on translation, and gives the no-partial-release rule a natural boundary.

Each part builds on the previous: the neutral direction identifiers, shared progress, and locale dictionaries from Part 1 are required by the rendering work in Part 2; both are required before the English route in Part 3 is enabled or any card is translated.

## Repository facts

- Spanish is study content, not only interface copy. Each Source Flashcard has `espanol`, `explicacion`, and `ejemplo_espanol` fields.
- Concept cards use `espanol` as a Spanish question and `explicacion` as its Spanish answer. They are Spanish-to-Spanish learning units with Mandarin reference material.
- Ordinary cards generate two persisted study directions, `hanzi-es` and `es-hanzi`. Concept cards generate one canonical unit.
- Progress records contain card ID, direction, status, and timestamps. Flashcard text is never stored in Firestore.
- The app statically bundles flashcard content and works without Firebase. Runtime translation would add a network dependency that the current architecture does not have.
- Card IDs and Card Pack memberships are language-independent. Existing rows must not be reordered or removed.
- Search, proper-name highlighting, card labels, help copy, document language, and social metadata all assume Spanish.
- `scripts/build_flashcards.mjs` is the maintained authoring source. Any schema change must also update the generated CSV, loader, types, tests, and rendering.
- A display-language choice can reuse current progress. Independent English drills require new study directions, persistence parsing, Firestore rules, migration behavior, unit counts, and a decision about Card Pack thresholds.

## Design tree

### A. Product definition

- A1. Decide what experience English adds.
  - English text shown alongside Spanish.
  - A selectable study language in one interface.
  - A fully localized English version of the application.
  - Independent Spanish and English drills available together.
- A2. Decide which English audience and variety the content targets.
- A3. Decide how English content is authored and reviewed.

### B. Learning model

Blocked by A1.

- B1. Decide whether Spanish and English share mastery or have independent progress.
- B2. Decide how concept cards work in English.
- B3. Decide whether changing language keeps the current card and queue position.
- B4. Decide how Card Pack completion and recommendations treat language-specific units.

### C. Content contract

Blocked by A1 and A3.

- C1. Decide required English fields for ordinary and concept cards.
- C2. Decide whether partial English coverage is allowed.
- C3. Decide fallback behavior for missing English content.
- C4. Decide terminology, alternatives, and reverse-prompt uniqueness policy.
- C5. Decide how English proper-name forms are annotated.

### D. Interface and discovery

Blocked by A1 and B1.

- D1. Decide where language selection appears and whether it persists.
- D2. Decide whether interface copy and metadata follow the study language.
- D3. Decide whether URLs remain shared or use language-specific routes.
- D4. Decide whether search covers the active language or all languages.
- D5. Decide how direction labels, help text, and empty states describe bilingual behavior.

### E. Data and migration design

Blocked by B and C decisions.

- E1. Choose a flat parallel CSV schema or another static representation.
- E2. Define study-direction identifiers without breaking existing progress.
- E3. Define local and Firestore migration behavior if mastery is independent.
- E4. Define validation and tests for English completeness and consistency.
- E5. Preserve static deployment, `/yuwenke/` base-path behavior, and guest mode.

### F. Release plan

Blocked by C and E decisions.

- F1. Decide whether all cards launch together or English rolls out by Card Pack.
- F2. Define acceptance criteria and content review.
- F3. Decide how stale or incomplete translations are detected after Spanish edits.

## Decision log

### Round 1

- A1. English will provide a fully localized application. Study content, controls, help, metadata, and other learner-facing copy switch language together.
- A2. The English version targets English-speaking learners and uses American English.
- A3. Machine assistance may draft translations, but a person reviews every card before the English content enters the repository. The deployed app performs no runtime translation.

Consequences:

- An English learner must not need Spanish to navigate or understand a card.
- English must cover meanings, explanations, examples, concept questions and answers, interface copy, accessibility text, and page metadata.
- Localization remains static and compatible with guest mode and GitHub Pages.

### Round 2

- B1. Progress is shared across languages. Mastery belongs to the Source Flashcard and existing persisted progress remains valid when the learner changes locale.
- C1-C3. English launches only when every card has complete required English content. The build rejects missing English fields. There is no Spanish fallback and no language-specific hiding of cards or packs.
- D3. Spanish and English use separate static routes under `/yuwenke/es/` and `/yuwenke/en/`. The root route still needs a default-locale policy.
- B2. Each concept card gets a natural English question and concise English answer. It remains one English-to-English study unit with Mandarin reference material.
- C4. Mandarin is the primary authority for English wording. Authors create natural American English teaching content from the Mandarin meaning and lesson intent, then compare it with the Spanish notes to catch omissions or discrepancies. English is not a literal translation of Spanish.

Consequences:

- Language does not become part of progress keys, favorites, pack completion, or recommendation thresholds.
- Both locales expose the same Source Flashcards, Card Packs, and study-unit counts.
- Existing direction identifiers may remain as compatibility keys internally, but the UI must not expose Spanish-coded terminology in English.
- English content quality requires Mandarin-aware review, not only fluent English copyediting.

### Round 3

- D3. `/yuwenke/` first honors the locally saved language. Without one, it uses Spanish only when the browser preference indicates Spanish; English is the fallback for every other or unknown browser language. Explicit `/es/` and `/en/` URLs are never overridden.
- D1. A visible header control changes language. The app saves the choice on the current device only and does not add locale to Firestore learner state.
- B3. Changing language preserves the current card, answer-revealed state, filters, and queue order. Only localized presentation changes.
- D4. Search indexes Hanzi, pinyin, and content in the active language. Hidden content from the other locale cannot cause a result.
- C5. Proper names remain lilac in English. The exact-form annotations include every displayed English form alongside Hanzi, pinyin, and Spanish forms.
- C4. Every English reverse direction uses one concise canonical prompt. Authors add context when needed to distinguish Mandarin meanings that share an English gloss. The prompt does not list a bag of synonyms.

Consequences:

- Locale changes inside the hydrated app rather than forcing a fresh page load. The app updates the localized URL and document metadata while retaining session state.
- Locale is presentation state, not learner progress.
- English prompt validation must reject ambiguous duplicate canonical prompts when they expect different Hanzi answers.
- Search normalization and labels must use the active locale rather than hard-coded Spanish assumptions.

### Round 4

- E1. The existing flashcard rows gain `ingles`, `explicacion_ingles`, and `ejemplo_ingles`. The authoring script and generated CSV remain one content pipeline.
- D2. Interface localization uses typed Spanish and English message dictionaries with shared keys. Components do not scatter locale conditionals or duplicate language-specific implementations.
- E2. Persisted study directions migrate from Spanish-coded values to language-neutral values. Readers temporarily accept old values while new writes use the neutral identifiers. The exact concept identifier and migration conflict policy remain open.
- D3. Both static routes hydrate the same application. An in-app language change updates locale, path, document language, and metadata through browser history without reloading or losing session state.
- E4/F3. CI validates objective content rules such as completeness, shape, and prompt uniqueness. A human review checklist owns semantic accuracy and requires English review when Mandarin source material or teaching intent changes. No per-card source fingerprint is added initially.

Consequences:

- Firestore rules, local parsing, progress document keys, reset compatibility, and tests must support a direction migration.
- Card Pack titles and descriptions are also learner-facing Spanish content and need localized values while preserving stable `CP` IDs.
- Locale dictionaries should translate display labels for Spanish-backed type and topic identifiers without changing their stored values.

### Round 5

- E2. New progress uses `hanzi-meaning`, `meaning-hanzi`, and `concept`. Legacy `hanzi-es` and `es-hanzi` records normalize on read. When equivalent old and new records coexist, the latest valid record wins. Writers create only neutral records; migration never deletes old local or Firestore records.
- E1. Card Pack titles and descriptions become nested `{ es, en }` values in `card_packs.json`. Stable `CP` IDs, catalog order, marks, themes, memberships, and open-pack state do not change.
- E1/D4. Flashcards also gain `etiquetas_ingles`. Search uses only the active locale's tags and visible language content, plus shared Hanzi and pinyin.
- D2. Existing Spanish card-type and topic values remain stable internal identifiers. Typed locale dictionaries provide their Spanish and English display labels.

Consequences:

- Progress parsing, merge logic, Firestore rules, and migration tests must cover all five accepted direction values during compatibility, while normal writes permit only the three neutral values.
- Concept progress from either old direction maps to `concept` using the existing compatibility intent and timestamp conflict rules.
- The exact flashcard schema adds four English fields: `ingles`, `explicacion_ingles`, `ejemplo_ingles`, and `etiquetas_ingles`.
- Full English search parity requires translating hidden tags, not just visible prose.

### Round 6

- F2. If English review exposes a Mandarin, pinyin, Spanish, or teaching-intent problem, correct both localized versions in the same change. Preserve the existing card ID, row position, and Card Pack membership.
- F2. The project owner reviews every English card against its Mandarin, pinyin, examples, and teaching intent. Automated checks enforce objective invariants. The app continues to present the material as personal notes, not an authoritative Mandarin reference.
- F1. English becomes public only as a complete release. Production receives no partial English route, mixed-language fallback, beta packs, or hidden untranslated cards.

Consequences:

- New Source Flashcards require complete Spanish and English content before they can be appended.
- Development may use a branch and incremental commits, but the deployable state must remain complete and buildable.
- Content corrections discovered during translation are ordinary edits unless they change card identity or ordering.

## Final design

### Product behavior

- Spanish and English are complete application locales. The active locale controls study text, controls, help, accessibility labels, filters, Card Pack copy, document language, and metadata.
- English targets English-speaking learners and uses American English.
- `/yuwenke/es/` and `/yuwenke/en/` are stable localized URLs. `/yuwenke/` uses the locally saved choice first, then ordered browser-language negotiation, with English as the fallback when no supported preference matches.
- A visible header control changes locale without reloading. It updates browser history, document metadata, and the locally saved preference while preserving the current card, revealed state, filters, and queue order.
- Locale is never stored in Firestore.

### Learning model

- Progress, favorites, Open Packs, Reset Boundary state, pack completion, and recommendations are shared across locales.
- Ordinary cards retain two learning units. Their neutral directions are `hanzi-meaning` and `meaning-hanzi`.
- Concept cards retain one unit with direction `concept`. Spanish concepts remain Spanish question-to-answer units; English concepts use natural English questions and concise English answers.
- Adding English does not change Source Flashcard IDs, row order, Card Pack membership, the 210-card count, or the 397-unit count.

### Content model

- Keep one generated flashcard CSV and one authoring pipeline. Add `ingles`, `explicacion_ingles`, `ejemplo_ingles`, and `etiquetas_ingles` to every row in `scripts/build_flashcards.mjs` and `chino_flashcards.csv`.
- Require English meaning or concept question, explanation or concept answer, and translated hidden tags on every card. Require an English example whenever the corresponding Spanish example exists. Do not use runtime or Spanish fallback.
- Mandarin is the authority for English wording. Compare Spanish to preserve teaching intent and catch discrepancies, but do not translate Spanish literally when natural English differs.
- English reverse prompts use one concise canonical meaning. Add context when two Mandarin answers would otherwise receive the same English cue.
- Keep `tipo` and `tema` values as internal identifiers. Locale dictionaries provide display labels.
- Change Card Pack `title` and `description` to nested `{ es, en }` values. Keep IDs, order, marks, themes, and memberships unchanged.
- Keep one `nombres_propios` annotation field. Add all exact English displayed forms to `properNamesById` so English names receive the same lilac treatment.

### Localization structure

- Define a small `Locale` model for `es` and `en` and typed message dictionaries with matching keys.
- Put controls, statuses, help, accessibility labels, empty states, direction labels, card-type labels, topic labels, metadata, and other interface prose in the dictionaries.
- Project each Flashcard and Card Pack into active-locale display content at a narrow boundary. Study components consume localized display values instead of branching on locale throughout the JSX.
- Generate both static locale routes from the same application shell. Direct loads and refreshes receive correct static language and metadata. In-app switching changes the locale and localized path through browser history without remounting the study session.
- Keep GitHub Pages base-path handling through `import.meta.env.BASE_URL`.

### Search behavior

- Search shared Hanzi and pinyin plus only the active locale's meaning, explanation, examples, tags, topic label, and type label.
- Do not let hidden Spanish content produce results in English or hidden English content produce results in Spanish.
- Replace Spanish-specific normalization assumptions with locale-aware normalization while retaining accent-insensitive pinyin and text matching.

### Progress migration

- Bump the learner progress schema for neutral direction writes.
- Normalize `hanzi-es` to `hanzi-meaning` and `es-hanzi` to `meaning-hanzi` for ordinary cards.
- Normalize either accepted legacy concept direction to `concept`, preserving the existing compatibility behavior.
- Merge records by their normalized study-unit key. When old and new records coexist, use the latest valid record under the existing timestamp and Reset Boundary rules.
- Write only `hanzi-meaning`, `meaning-hanzi`, and `concept`. Never delete legacy local or Firestore records as part of migration.
- Keep legacy values readable indefinitely unless a later, separately approved cleanup proves they are no longer needed. Firestore write rules accept only neutral values after the release.

## Implementation sequence

Steps are grouped into the three sessions above (Part 1: steps 1–2, Part 2: steps 3–5, Part 3: steps 6–7). Each session must leave the build passing before merging to `main`.

**Part 1 — Data, schema, and migration foundation**

1. Introduce the locale types, typed message dictionaries, localized Card Pack schema, and four new flashcard fields. Update loaders and validation before changing rendering.
2. Migrate study directions and compatibility readers. Update local progress, synchronization, Firestore document-key handling, security rules, Reset Boundary behavior, and conflict merging.

**Part 2 — Localized rendering and routing**

3. Refactor card, filter, pack, help, and metadata rendering to consume localized display content. Add `/es/`, `/en/`, and the root locale resolver.
4. Implement in-place locale switching with history and metadata updates while preserving React session state.
5. Translate all interface messages, topic/type labels, Card Pack copy, accessibility text, and metadata.

**Part 3 — English content and release**

6. Draft all English card fields from Mandarin with machine assistance. Review every card manually, add English proper-name forms, and correct source discrepancies in both languages.
7. Enable the English route only after all content and acceptance checks pass.

## Validation and acceptance criteria

- The dataset still contains 210 stable sequential card IDs in the same order, with every card assigned to exactly one unchanged Card Pack.
- Both locales produce the same 397 study units and the same pack completion denominator.
- Build validation rejects missing English content, malformed localized packs, mismatched dictionary keys, duplicate ambiguous English reverse prompts, and Hanzi leakage into English prompts where prohibited.
- Tests cover ordinary and concept rendering in both locales, active-language search, English proper-name highlighting, localized labels, root negotiation, direct localized routes, and in-place switching with session preservation.
- Migration tests cover each legacy direction, both legacy concept forms, old/new conflicts, Reset Boundary filtering, guest storage, Firestore synchronization, and neutral-only writes.
- Firestore rule tests reject Spanish-coded direction writes after release and accept the three neutral values.
- Direct visits and refreshes work under the `/yuwenke/` GitHub Pages base path, with correct `lang`, canonical URL, alternate-language links, descriptions, Open Graph locale, and accessibility text.
- Guest mode works without Firebase. Flashcard and localization content remain static and no runtime translation request exists.
- Run `npm test`, `npm run test:rules`, `npm run check`, and `npm run build` before release. Regenerate the CSV explicitly with `node scripts/build_flashcards.mjs` and verify the committed output.

## Residual risks

- A lazy migration leaves legacy progress documents in storage. Normalized conflict merging must be deterministic so stale records cannot override newer neutral records.
- English reverse prompts can still be pedagogically ambiguous even when strings are unique. Manual review must check meaning, not only duplicate text.
- Updating route metadata during an in-place locale switch can drift from direct-load metadata unless both use the same message source.
- Exact-form proper-name highlighting can miss capitalization or wording variants. Reviewers must annotate every form actually displayed.
- Translating 210 cards in one release is a large review batch. The no-partial-release rule favors consistency over speed.

## Non-goals

- Independent Spanish and English mastery tracks.
- Language-specific favorites, packs, recommendations, or Reset Boundaries.
- Runtime machine translation or a translation API.
- Partial English coverage, Spanish fallback, or hidden untranslated cards.
- Reordering cards, changing IDs, or altering Card Pack membership as part of localization.

## Shared-understanding checkpoint

The decision frontier is empty. Shared understanding was confirmed before implementation or ticket creation began.

---
name: process-new-material
description: Incorporate new Mandarin class material from new-material into the Yuwenke card dataset.
disable-model-invocation: true
---

# Process new material

Turn the unprocessed files in `new-material/` into correct, coherent Yuwenke
learning material. The output is a **lesson**: every new or revised Source
Flashcard is complete, natural, and belongs to exactly one Card Pack.

## 1. Establish the intake

1. Read `AGENTS.md`, `CONTEXT.md`, and `docs/adr/0001-card-packs-for-progressive-discovery.md`.
2. List the files directly in `new-material/`, excluding `processed.md`,
   directories, and names beginning with `PROCESSED - `. Read
   `new-material/processed.md` if it exists.
3. Treat a file as new when its name has no `PROCESSED - ` prefix and it has no
   matching completed entry in the ledger. Inspect every new file. Transcribe
   only material that is legible; record an uncertainty in the final report
   rather than guessing.
4. Compare the transcribed material against the current Source Flashcards to
   identify duplicates, corrections, and genuinely new learning units.

Completion criterion: every newly supplied file is either represented by a
specific planned card change or listed as unreadable, duplicate, or out of
scope with its reason.

## 2. Author the lesson

1. Edit `scripts/build_flashcards.mjs`, the source of truth for flashcard
   content. Preserve every existing row and its position. Append new rows only
   at the end, so generated IDs remain stable.
2. Make each change a complete Source Flashcard: natural Mandarin, pinyin,
   Spanish meaning, explanation, and aligned examples. Follow the concept-card
   rules in `AGENTS.md`; a concept has one Spanish-to-Spanish Study Unit.
3. Update `properNamesById` for every displayed Hanzi, pinyin, and Spanish form
   of a new or changed proper name. Keep the card text plain.
4. Run `node scripts/build_flashcards.mjs` to regenerate
   `chino_flashcards.csv`.

Completion criterion: the generated CSV contains every intended revision and
new card, with existing FC IDs and order unchanged.

## 3. Curate Card Packs

1. Review the lesson against the existing Pack Catalog and Pack Memberships.
   Reassign cards when that makes the learner-facing lesson more coherent.
2. Keep one membership per Source Flashcard in
   `card_pack_membership.csv`. New cards receive exactly one membership.
3. Create a Card Pack only when the material forms a distinct coherent learning
   group. Append its stable `CP` ID to `card_packs.json`; keep the first catalog
   entry first and preserve deployed pack IDs.
4. When reordering Pack Catalog entries, treat the order as recommendation
   priority, not a prerequisite sequence. Do not leave a pack empty.

Completion criterion: every Source Flashcard has one valid membership, every
Card Pack contains cards, and the catalog still has a clear default first pack.

## 4. Regenerate and verify

1. Run `npm run build:knowledge` after regenerating the CSV. It writes
   `chinese-knowledge.md` from the `hanzi` and `ejemplo_hanzi` fields. Preserve
   each whole Chinese learning unit—including words, sentences, standalone
   characters, and radicals—in card order, comma-separated and without pinyin
   or translations. Exclude a whole mixed-script entry rather than leaving an
   unnatural fragment after removing its Latin text. Do not hand-edit the
   generated file.
2. Run `npm test`, `npm run check`, and `git diff --check`.
3. Confirm `chinese-knowledge.md` was regenerated from the final CSV and report
   its total unique knowledge-entry count.
4. After verification succeeds, compute each processed file's destination by
   prepending `PROCESSED - ` to its original filename. Stop without renaming
   anything if any destination already exists; never overwrite an intake file.
5. Rename every processed file, then append a completed entry to
   `new-material/processed.md` with its original and renamed filenames, the
   date, and the affected FC and CP IDs.

Completion criterion: validation passes, the knowledge inventory matches the
final dataset, and every processed input has both the `PROCESSED - ` prefix and
a ledger entry that prevents it from being imported twice.

## Report

State each original-to-renamed file mapping; new and revised FC IDs; pack
changes; knowledge-entry count; validation results; and any unreadable or
intentionally excluded source material.

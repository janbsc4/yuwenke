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
2. List the files directly in `new-material/`, excluding `processed.md` and
   directories. Read `new-material/processed.md` if it exists.
3. Treat a file as new when it has no matching completed entry in the ledger.
   Inspect every new file. Transcribe only material that is legible; record an
   uncertainty in the final report rather than guessing.
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

1. Run `node scripts/build_chinese_characters.mjs` after regenerating the CSV.
   It writes only the unique Han characters taught directly in the `hanzi`
   field; do not hand-edit `chinese-characters.md`.
2. Run `npm test`, `npm run check`, and `git diff --check`.
3. Confirm `chinese-characters.md` was regenerated from the final CSV and
   report its total directly taught character count.
4. Append a completed entry to `new-material/processed.md` with each processed
   filename, the date, and the affected FC and CP IDs. Do this only after all
   verification succeeds.

Completion criterion: validation passes, the character inventory matches the
final dataset, and every processed input has a ledger entry that prevents it
from being imported twice.

## Report

State the processed files; new and revised FC IDs; pack changes; character
count; validation results; and any unreadable or intentionally excluded source
material.

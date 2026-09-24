# ADR-0002: One Study queue for new and learning cards

Status: Accepted

## Decision

Replace the separate Discover and Study tabs with Study. Each session shuffles unseen units from Open Packs together with units already marked learning. Known units remain in Mastered; Favorites continues to include both directions independently of status and pack membership.

After revealing an answer, the learner can keep learning or mark it known. Skip is available before and after reveal and only advances the current session, preserving any existing progress. New sessions include both skipped and learning units. Opening a pack during Study preserves the current and handled units and shuffles the new units into the remaining queue. Opening it from another view preserves that view and offers Go to Study. Pack suggestions retain the existing 80% threshold.

This replaces ADR-0001's Discover-specific flow. Landing-page instructions and help use Open a pack, Study, and Master as actions rather than three separate study queues.

## Storage and compatibility

Firestore already stores directional learning/known status, favorites, Open Packs, and Reset Boundary. It does not store a Discover status or tab selection. No cloud data rewrite or security-rule change is needed. Preserve the existing document IDs, schema versions, timestamps, and merge/reset rules. Merely making a new card available must not create a learning record: Léi must continue distinguishing unseen material from practiced material.

Map the local last-view preference discover to study and save the canonical preference. Continue honoring valid nonempty Mastered and Favorites preferences. Existing local and Firebase progress retain their meaning; guest, offline, and signed-in users use the same queue eligibility rules.

## Verification

Queue and component tests cover mixed sessions, closed-pack gating, separate directions, skipping, completion, preference migration, and opening packs. The authenticated sync test checks that downloaded progress produces the combined queue without uploads for unseen units and that an explicit learning decision still writes the existing Firebase schema. Firestore emulator tests retain the security and reset contract.

# Yuwenke Study

Yuwenke turns authored Mandarin learning material into directional cards and controls which material each learner can discover and practise.

## Learning material

**Source Flashcard**:
One authored content record identified by a stable FC ID and used to generate one or more Study Units.
_Avoid_: User-facing card, Study Unit

**Study Unit**:
One user-facing directional card generated from a Source Flashcard, or the single Spanish-to-Spanish card generated for a concept.
_Avoid_: Source card, CSV row

**Card Pack**:
An editable grouping of Source Flashcards that controls which Study Units a learner can discover.
_Avoid_: Batch, deck, set

**Pack Membership**:
The single assignment of a Source Flashcard to one Card Pack.
_Avoid_: Pack tag, pack field

**Pack Catalog**:
The ordered collection of Card Pack identities and descriptions.
_Avoid_: Pack Membership, deck list

**Pack Order**:
The author-controlled order whose first Card Pack is the current default and whose remaining order prioritizes suggestions.
_Avoid_: Unlock order, required sequence

## Learner state

**Open Pack**:
A Card Pack whose unseen Study Units are available to a learner in Discover.
_Avoid_: Active pack, enabled pack

**Discover Queue**:
The unseen Study Units currently available in Discover.
_Avoid_: Discovery deck, new-card list

**Skipped Unit**:
A Study Unit bypassed during the current Discover session without creating durable progress.
_Avoid_: Skipped status, deferred card

**Pack-Opening Threshold**:
The point at which at least 80% of all Study Units in Open Packs are in Dominadas.
_Avoid_: Pack completion, exhausted pack

**Pack Suggestion**:
A card-shaped prompt that recommends an unopened Card Pack without restricting which pack the learner may choose.
_Avoid_: Unlock card, required pack

**Packs Panel**:
The interface where a learner can inspect all Card Packs and open any unopened pack.
_Avoid_: Pack settings, deck picker

**Account Reset**:
An explicit destructive action that returns a learner's study state to its new-user defaults.
_Avoid_: Close all packs, restart pack

**Reset Boundary**:
The authoritative point after which older synchronized study state must not be restored to an account.
_Avoid_: Clear request, sign-out

**Pack-State Migration**:
The one-time inference of Open Packs for learners whose study state predates persisted pack state.
_Avoid_: Pack reset, forced opening

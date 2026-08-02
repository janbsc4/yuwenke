# ADR-0001: Card packs for progressive discovery

Status: Accepted

## Context

Yuwenke currently makes every unseen study unit available in Descubrir. The dataset needs editable pack groupings so users can introduce material in smaller collections without coupling pack membership to flashcard content or changing stable card identities.

Users must remain free to choose any pack. The application may recommend a pack, but pack order must not become a prerequisite chain.

## Decision

### Authoring model

- Define the ordered pack catalog in `card_packs.json`.
- Require each pack to have a stable ID, Spanish title, and short Spanish description.
- Treat the first catalog entry as the default pack for new users and account resets.
- Store one `card_id,pack_id` assignment per source flashcard in `card_pack_membership.csv`.
- Apply source-card membership to every directional study unit generated from that card.
- Validate at build time that card and pack IDs are unique, every card has exactly one membership, every membership references known IDs, and every pack contains at least one source flashcard.
- Treat deployed pack IDs as persistent identities; renaming or removing one requires migration handling.

### User pack state

- New users start with only the first pack open.
- Users may open any unopened pack from an always-available Packs panel.
- Open packs form an unordered set and cannot be closed individually.
- Guest and account open-pack sets merge by union on sign-in.
- Pack membership gates only unseen units in Descubrir. Existing learning, mastered, and favorite state remains available when membership changes.
- New or reassigned unseen units automatically become available to users who already have the destination pack open.

### Opening packs

- Require confirmation before opening a pack.
- Opening during an active Descubrir session preserves the existing queue order, shuffles the newly eligible filtered units as a batch, and appends that batch.
- Opening outside Descubrir preserves the current view and offers a direct action to go to Descubrir.
- Opening from a completed Descubrir session continues into the appended batch.
- Recommend the first unopened pack in catalog order even if it adds zero unseen units for that user.

### Recommendations

- Present a card-shaped pack suggestion at Descubrir completion when at least 80% of all study units in all open packs are in Dominadas.
- Recalculate that ratio globally, independent of search and topic/type filters, whenever pack state or progress changes.
- Do not expose the percentage as an unlock target; recommendations are advisory because any pack can be opened manually.
- Do not count the suggestion as a study unit or include it in queue/session totals.
- Do not persist dismissal; eligible suggestions may reappear at later completions.
- Label any continuation action for remaining unseen units so it clearly identifies previously skipped cards.
- Use “Volver a las que saltaste (N)”, “Abrir «[nombre del pack]»”, and “Ver todos los packs” for the corresponding completion actions.
- Keep skipped state session-only; leaving or reloading returns skipped units to the ordinary unseen pool without synchronizing a third progress state.

### Migration and reset

- For state predating packs, infer the first pack as open and infer any other pack as open when it contains existing progress or a favorite.
- Provide an Account Reset in account/settings that clears progress and favorites and restores only the current first pack.
- Keep non-study interface preferences and keep authenticated users signed in.
- Require a server-confirmed reset while signed in and establish a reset boundary so stale devices cannot restore pre-reset state; allow guest reset locally and offline.
- Confirm reset with a clear destructive dialog and button, without requiring typed text.

### User-facing counts

- Use directional study units consistently for all user-facing card and pack counts.
- Show pack title, description, total study-unit count, and open/unopened status in the Packs panel; do not preview individual cards.

## Consequences

- Pack composition and recommendation priority can change without editing flashcard content or card IDs.
- Persisted open-pack state and reset metadata become additional user-progress data in local storage and Firestore.
- Opening a pack is intentionally easy to merge across devices; Account Reset requires special reset-boundary semantics because it is destructive.
- The active Discover queue needs append-only expansion when a pack opens mid-session.

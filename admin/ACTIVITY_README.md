# Player support history and lighter absence penalties

## Behaviour
- Capture explicit gameplay actions and navigation through data-action/data-tab buttons: identifiers, label, numeric economy/attribute values before/after and recent in-game result messages. No keyboard logging, passwords, form contents or in-progress PvP choices are collected.
- The account panel informs players of support logging. Individual activity is client-reported, not evidence against tampering.
- Store an outbox per user, with unique event IDs, up to 1,000 pending events. Report dropped old events if that cap is exceeded. Flush 40 at a time every ten seconds while signed in and online. Network errors retain the outbox and do not block saves. The server deduplicates IDs and caps ingestion at 5,000 events/user/UTC day.
- Private event table: only checked RPCs can ingest/read. Players cannot supply a target user to ingestion. Admin identity and confirmed email are verified server-side for reads.
- Admin selects a player and opens “Ver atividade e estratégias”. Lists pages of 100 events with original and receipt timestamps, value changes, result logs and descriptive counts. The last 20 PvP matches come from server state; round choices are returned only when a match is finished.
- Activity starts at deployment. No historical click reconstruction. Offline events may arrive later; pagination is ordered by ingestion ID while both timestamps remain visible.

## Penalties
The first three career failures remain free. Subsequent absence-causing failures remove floor(5% of cash), capped at R$ 500; bank balances are untouched. Individual lessons and team projects use 15–45 second absences scaled by stress. Lesson/project cards display the possible cash loss before starting. Existing saved absence timers finish normally; no save migration is necessary.

## Validation
Nine transactional SQL checks passed for admin-only access, input validation, offline deduplication, user binding, pagination, finished PvP history and table/anonymous restrictions. Fourteen penalty scenarios checked beginner protection, cash boundaries, the cap, unchanged bank and absence duration limits. Syntax checks passed for the game, cloud client, activity capture and admin UI.

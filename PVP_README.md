# PvP — Mestre da Educação

## Play
Open **PvP online** in the game's activity menu. A signed-in account and internet are required. The single-player career and existing cloud saves are not migrated or modified.

- Debate: allocate 70 points among seven PvP attributes (4–18 each). Equal budgets keep offline saves, money and equipment out of competitive power. The allocation is snapshotted at match start.
- Quiz: five questions; six subjects and three difficulty levels. Private bank: 600 questions, 100 per subject (34 basic, 33 intermediate, 33 advanced). Both participants receive the same sequence. Answers, scores and explanations are withheld until the match ends. Attributes do not affect quiz scores.
- Async: invite a specific player, who has seven days to accept. Each round allows 48 hours. One reply at timeout wins the match; no replies cancels it.
- Live: create a ten-character room code, join and confirm readiness on both accounts. Five rounds, 45 seconds per round. Missing answers score zero. Rooms poll the server every 2.5 seconds while visible; this is synchronous round play, not an action game or WebSocket stream. Expiry is resolved lazily when a participant reads/submits.
- Ranking: authenticated players can see public names, wins, losses, draws, points and win rate, with type/mode filters. No emails. Win 30, draw 10, loss 0. Only the first three completed ranked matches per pair/type/mode per UTC day award points. Both players must have submitted at least once.
- Closing the PvP window leaves the match intact. Reopen it from the history. Waiting invitations can be cancelled; started matches can be conceded.

## Security
Competitive data and question keys are in private tables with RLS and no direct client grants. A public SECURITY INVOKER RPC calls one private SECURITY DEFINER dispatcher, which checks auth.uid(), account moderation and match membership. Mutation RPCs lock match rows; duplicate choices and stale rounds are rejected. Current opponent choices and focus are withheld so focus costs cannot reveal a strategy. No service-role or secret keys in the browser.

The initial SQL schema is in pvp.sql. The additive question-selection migration is in question_selection_update.sql; it prioritizes questions unseen by the same pair across both modes and rechecks selection at match start. When fewer than five unseen questions remain, it fills the round set with least-recently seen questions. Pair-level advisory locking serializes selection, including when player order is reversed. Existing active matches retain their original questions. Question seed material is intentionally not committed to this public repository: the canonical bank is stored in private.mestre_pvp_questions. Export it through an authorized database backup for disaster recovery. Users can eventually learn repeated questions; the bank is educational content rather than a high-stakes exam system.

## Validation
23 transactional database assertions passed before activation, covering both duel kinds, asynchronous and live flow, readiness, scoring, tie handling, privacy, answer-key isolation, moderation, deadline expiry, stale/duplicate choices and ranking credit. JavaScript and game inline scripts passed syntax checks. Published-site browser checks confirmed authenticated lobby loading, seven build fields, public ranking, subject/difficulty selection, live room creation by code and cancellation. The 390px mobile viewport showed no horizontal overflow in the attributes dialog. A full two-device browser match was not performed; two-account match behavior was exercised through transactional SQL tests.

## Rollback
Restore the previous index.html, cloud.js and service worker while leaving PvP private data intact. Do not drop matches, builds or the question bank to roll back a frontend issue. No individual career save restoration is necessary because this feature does not write to the save table.

## Expansion validation
Eleven transactional checks verified the 600 total, subject/difficulty quotas, unique prompts, four distinct options, valid answer indices, all eighteen subject/level combinations, unseen-pair priority, reversed player order, partial/exhausted pools, open live room startup and answer-key privacy. Ninety-eight new numerical answer keys were independently recalculated from their question text. The 495 new rows were inserted atomically with count guards, without replacing existing question IDs. Full question content and answer keys remain exclusively in the private database and are not committed here.

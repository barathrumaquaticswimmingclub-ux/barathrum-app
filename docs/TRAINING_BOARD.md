# BRTM Training Board

Entry point: `/training/`, also linked in BRTM Staff navigation for Owner and Prestasi.
Uses the existing PostgreSQL connection and staff sessions. Coaches outside the Prestasi role and parent sessions cannot access Training Board API data.

## Data and behavior

- `training-seed.js` (gzip-packed JSON derived from the workbooks) preserves both supplied workbooks: 353 sessions each. The latest file is the default source; legacy content remains available. Source nominal totals are compared with parsed set totals in the UI.
- Six additive `brtm_training_*` tables store effective-dated rosters, Coach plans, daily line reports, peaks, revision history and AI requests/responses. Startup initializes only the new tables/indexes. Existing training originals are immutable file data.
- One member per line assignment date; only active Prestasi athletes can be assigned. Moving/removing a member never deletes the BRTM athlete. Reports preserve the first saved roster snapshot. Membership is not attendance and does not affect SPP.
- Reports have three entries: actual program, timing status and optional notes. Partial completion requires actual program text. Full completion uses the recorded program. Existing report edits retain their recorded program and member snapshot. Server revisions reject concurrent overwrites.
- The initial April/September/November 2027 peak windows are tentative and editable. Coach-entered exact dates/targets are supplied to subsequent AI analysis.
- Operational `/api/backup` includes all six new tables. Training-specific JSON export and old-browser-edit JSON migration are also available. This does not configure automatic infrastructure backups.

## AI activation

AI requires an owner-authorized OpenAI API project/key. Never put credentials in Git, browser code or documentation. Configure server environment variables:

- `OPENAI_API_KEY`: required for live AI.
- `BRTM_TRAINING_AI_MODEL`: optional, defaults to `gpt-5-mini`.

The API uses Responses with structured JSON output, `store:false`, a 65 second timeout, a 32 request/day server cap and idempotency per request UUID. No key means HTTP 503 with an explicit inactive status; reports continue to save. No synthetic response is presented as AI. The UI can copy saved context for review in ChatGPT while live AI is inactive.

Analysis receives the selected line report, up to 14 earlier line reports, the next scheduled program, peak calendar, saved references and previous questions. No contact, payment, address or photo fields are included. Group reports cannot establish individual attendance or physiology. Instructions require separating observations from inference and prohibit forced foundation-line aerobic/EN2/interval work. AI never applies a program on generation: Coach explicitly selects a target date and applies the proposed line. Revised reports invalidate earlier proposals for application. A partial/refused/malformed/upstream-error response is not accepted as a program.

References are curated and dated 16 November 2026. No live web research or recurring update job is currently enabled.

## Verification

`npm test` runs the existing suite and `training-board.test.js`. The new tests use isolated PGlite, synthetic staff/athletes and a mock provider. They exercise role restrictions, roster date/revision behavior, immutable snapshots, duplicate prevention, foundation rules, peak changes, export coverage, disabled AI, provider request idempotency, explicit apply and stale-report protection. A mock provider test is not a successful live OpenAI call.

## Conversation-to-draft bridge

A private Site MCP relay exposes only `training_get_context` and `training_save_draft`. The relay checks the verified ChatGPT owner email and Site-scoped identity. It calls a fixed BRTM integration endpoint using a generated, narrowly scoped server secret (`BRTM_CHAT_BRIDGE_TOKEN`) stored only in runtime configuration. No API inference key is needed for conversation-based evaluation. The endpoint has no account, finance, attendance, or program-activation action.

`brtm_training_chat_drafts` stores proposals, idempotency fingerprints, per-line source report revisions and target program snapshots. Chat writes only create pending drafts; Owner reviews them under Draf ChatGPT. Explicit Use program is required to activate. Application checks source-report revisions and touched-line content, preserves unrelated line edits, records history/audit, and is idempotent. Dismissed drafts remain in history. Operational and training exports include the table. Existing browser/API sessions cannot call the integration without its scoped bearer credential.

The Site preserves its owner-only audience and uses `BRTM_CHAT_OWNER_EMAIL` plus `BRTM_CHAT_BRIDGE_TOKEN` runtime secrets. Install/connect the private Site-created plugin in ChatGPT if its tools are not automatically available. Publishing a relay is not proof of a connected plugin: verify with `training_get_context`.

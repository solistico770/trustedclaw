## 1. Project Bootstrap

- [ ] 1.1 צור Supabase project חדש — הפעל extensions: pg_cron, pg_net, uuid-ossp
- [ ] 1.2 צור Vercel project חדש — Next.js 14 App Router, TypeScript strict mode
- [ ] 1.3 הגדר Shadcn/ui: `npx shadcn-ui@latest init` — theme, RTL, dark mode
- [ ] 1.4 הגדר environment variables ב-Vercel: SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY, GEMINI_API_KEY, CRON_SECRET
- [ ] 1.5 הגדר Supabase Auth — magic link, single owner user invite flow

## 2. Database Schema — Core Tables

- [ ] 2.1 Migration: `gates` (id, type, display_name, status, user_id, created_at)
- [ ] 2.2 Migration: `channels` (id, gate_id, external_channel_id, display_name, user_id)
- [ ] 2.3 Migration: `events` (id, gate_id, channel_id, user_id, occurred_at, received_at, raw_payload JSONB, normalized_payload JSONB, enrichment_data JSONB, processing_status TEXT, processing_started_at, retry_count, created_at)
- [ ] 2.4 Migration: `entities` (id, user_id, type, canonical_name, aliases TEXT[], gate_identifiers JSONB, auto_created BOOL, created_at)
- [ ] 2.5 Migration: `event_entities` (id, event_id, entity_id, role, confidence_score)
- [ ] 2.6 Migration: `classifications` (id, event_id, user_id, severity, urgency, importance_score, reasoning, confidence, classified_by, created_at)
- [ ] 2.7 Migration: `triage_decisions` (id, event_id, user_id, decision, reasoning, status, snoozed_until, reminded, created_at)
- [ ] 2.8 Migration: `agent_actions` (id, triage_decision_id, user_id, action_type, proposal_payload JSONB, risk_level, status, created_at)
- [ ] 2.9 Migration: `policies` (id, user_id, version, rules JSONB, is_active BOOL, created_at)
- [ ] 2.10 Migration: `policy_decisions` (id, agent_action_id, policy_version, decision, matched_rule_id, evaluated_at)
- [ ] 2.11 Migration: `executions` (id, agent_action_id, gate_id, status, response_payload JSONB, error_details TEXT, executed_at)
- [ ] 2.12 Migration: `heartbeat_logs` (id, run_id TEXT UNIQUE, user_id, triggered_by, run_at, duration_ms, events_checked, events_requeued, events_stuck, escalations_reminded, status, error_message)
- [ ] 2.13 Migration: `audit_logs` — append-only, RLS: INSERT only (כולל service role), לא UPDATE/DELETE
- [ ] 2.14 Migration: `simulator_scenarios` (id, user_id, name, gate_type, sender_name, channel_name, content_template, created_at)

## 3. Database — RLS, Indexes, Realtime

- [ ] 3.1 הגדר RLS על כל טבלה: `user_id = auth.uid()` לכל SELECT/INSERT/UPDATE
- [ ] 3.2 הגדר RLS מיוחד על audit_logs: INSERT בלבד (service role + user), אין UPDATE/DELETE לאף אחד
- [ ] 3.3 הגדר Indexes: events(user_id, processing_status, received_at), events(user_id, occurred_at), triage_decisions(user_id, status), heartbeat_logs(user_id, run_at)
- [ ] 3.4 הגדר Supabase Realtime publications: triage_decisions, heartbeat_logs, events (לupdate status)
- [ ] 3.5 צור default Gate record לSimulator: {type: 'simulator', display_name: 'Simulator', status: 'active'}
- [ ] 3.6 צור default Policy record לowner עם conservative rules: default=require_human, simulator=approve

## 4. API — Event Ingestion & Pipeline

- [ ] 4.1 `POST /api/events/ingest` — validate payload, save raw_payload סינכרונית, trigger pipeline async, return event_id
- [ ] 4.2 `POST /api/simulate` — wrapper על ingest עם gate_type='simulator', validator ל-simulator fields
- [ ] 4.3 Normalization function — gate_type adapter pattern: `normalizers/simulator.ts`, `normalizers/generic.ts`
- [ ] 4.4 `POST /api/pipeline/enrich` — קריאה ל-Gemini Flash עם responseSchema לenrichment, schema validation, save enrichment_data
- [ ] 4.5 Entity Extraction function — חילוץ entities מenrichment_data, fuzzy match לentities קיימות
- [ ] 4.6 Entity Linking function — create/link entities, confidence threshold check, create event_entities records
- [ ] 4.7 `POST /api/pipeline/classify` — קריאה ל-Gemini Flash עם responseSchema לclassification, save classifications, חישוב importance_score
- [ ] 4.8 `POST /api/pipeline/triage` — triage decision logic, Critical override, save triage_decisions, trigger escalation אם צריך
- [ ] 4.9 Policy Engine module — `lib/policy-engine.ts`: evaluateAction(action, policy) → PolicyDecision, first-match logic, save policy_decisions
- [ ] 4.10 logAudit helper — `lib/audit.ts`: logAudit(actor, action_type, target_type, target_id, reasoning, user_id) → audit_log record
- [ ] 4.11 Pipeline orchestrator — `lib/pipeline.ts`: מנהל רצף השלבים, שומר state בין כל שלב, מטפל ב-partial failures

## 5. API — Heartbeat

- [ ] 5.1 `POST /api/heartbeat` — CRON_SECRET validation, idempotency check (run_id = md5(floor)), main scan logic
- [ ] 5.2 Heartbeat: scan pending events > 2 min → requeue (עדכון processing_status ל-pending, trigger pipeline)
- [ ] 5.3 Heartbeat: scan processing events > 10 min → mark stuck, create escalation
- [ ] 5.4 Heartbeat: scan _failed events → retry (עד retry_count < 3), אחרי 3: permanent_failure + escalation
- [ ] 5.5 Heartbeat: scan classified events ללא triage_decision → trigger triage
- [ ] 5.6 Heartbeat: scan open escalations > policy.escalation_timeout → mark reminded, log audit
- [ ] 5.7 Heartbeat: write heartbeat_log record בסיום — כולל duration_ms וכל counters
- [ ] 5.8 הגדר Vercel Cron ב-vercel.json: `{"crons": [{"path": "/api/heartbeat", "schedule": "*/5 * * * *"}]}`
- [ ] 5.9 הגדר pg_cron schedule בSupabase SQL: `SELECT cron.schedule('heartbeat', '*/5 * * * *', $$SELECT net.http_post('https://<vercel-url>/api/heartbeat', '{}', 'application/json', ARRAY[http_header('x-cron-secret', '<secret>')])$$)`
- [ ] 5.10 `POST /api/heartbeat/manual` — same logic ב-/api/heartbeat אבל triggered_by='manual', ללא idempotency check

## 6. API — Escalations, Entities, Audit

- [ ] 6.1 `GET /api/escalations` — open triage_decisions עם decision='escalate', status='open', joined עם events + classifications
- [ ] 6.2 `POST /api/escalations/[id]/resolve` — {decision: 'approve'|'dismiss'|'snooze', reason?, snooze_until?}, update triage_decision, logAudit
- [ ] 6.3 `GET /api/events` — עם filters: status, severity, gate_type, date_from, date_to, entity_id. pagination.
- [ ] 6.4 `GET /api/events/[id]/trace` — decision trace מלא לevent
- [ ] 6.5 `GET /api/entities` — fulltext search + filters: type, gate_type. sorted by last_activity.
- [ ] 6.6 `GET /api/entities/[id]` — entity details + timeline (events sorted by occurred_at)
- [ ] 6.7 `GET /api/audit` — עם filters: actor, action_type, date range. max 10,000 records.
- [ ] 6.8 `GET /api/audit/export` — JSON download של filtered results
- [ ] 6.9 `GET /api/heartbeat/logs` — heartbeat_logs sorted by run_at desc, limit 100
- [ ] 6.10 `GET /api/policy` — policy נוכחית + versions list
- [ ] 6.11 `POST /api/policy` — שמירת policy מעודכנת, יצירת version חדש
- [ ] 6.12 `GET/POST /api/simulator/scenarios` — CRUD לsimulator_scenarios

## 7. Frontend — Layout & Navigation

- [ ] 7.1 Layout component עם RTL sidebar: Inbox (badge), Events, Heartbeat, Entities, Simulate, Settings
- [ ] 7.2 Supabase Realtime hook: `useEscalations()` — subscribes לtriage_decisions INSERT, updates badge count
- [ ] 7.3 Supabase Realtime hook: `useHeartbeat()` — subscribes לheartbeat_logs INSERT
- [ ] 7.4 Auth wrapper — redirect ל-/login אם לא מחובר, magic link login page
- [ ] 7.5 Error boundary + loading states גלובליים עם Shadcn Skeleton components

## 8. Frontend — Escalation Inbox

- [ ] 8.1 עמוד `/` — Inbox: fetch open escalations, sort by importance_score desc
- [ ] 8.2 EscalationCard component: Gate badge, Severity badge (color-coded), sender, summary, entities, timestamp, 3 כפתורים
- [ ] 8.3 EscalationCard — Approve action: POST resolve + optimistic update (card נעלם מיד)
- [ ] 8.4 EscalationCard — Dismiss dialog: textarea לreason, POST resolve
- [ ] 8.5 EscalationCard — Snooze picker: 1h/4h/24h/custom datetime, POST resolve
- [ ] 8.6 EscalationCard — expand/collapse לdetail view: הודעה מלאה, thread history, classification reasoning
- [ ] 8.7 Empty state: "הכל תחת שליטה — אין פריטים הדורשים תשומת לבך"

## 9. Frontend — Event Log

- [ ] 9.1 עמוד `/events` — event list עם filters: Gate, Severity, Status, Date range
- [ ] 9.2 EventRow component: Gate icon, Severity badge, processing_status badge, sender, content preview, timestamp
- [ ] 9.3 Decision Trace drawer — pipeline steps כaccordion: raw → normalized → enrichment → classification → triage → policy → execution
- [ ] 9.4 Status badge color system: pending=gray, processing=blue, classified=purple, completed=green, stuck=red, failed=red

## 10. Frontend — Heartbeat Monitor

- [ ] 10.1 עמוד `/heartbeat` — status indicator (ירוק/אדום), last run summary, run history table
- [ ] 10.2 HeartbeatStatus component: indicator dot, last_run timestamp, duration_ms, counters (checked/requeued/stuck)
- [ ] 10.3 Heartbeat history table: columns: זמן, triggered_by, duration, checked, requeued, stuck, status
- [ ] 10.4 "הרץ עכשיו" button — POST /api/heartbeat/manual, spinner, Realtime update לresult
- [ ] 10.5 Alert banner כשstatus='failed': "Heartbeat כשל — לחץ להרצה ידנית"

## 11. Frontend — Entity Browser

- [ ] 11.1 עמוד `/entities` — search input (debounced 300ms → GET /api/entities?q=), filter buttons
- [ ] 11.2 EntityCard component: type badge, canonical_name, aliases, gate identifiers, last activity
- [ ] 11.3 Entity detail drawer — timeline view: events כ-chronological list עם severity badges

## 12. Frontend — Simulator Panel

- [ ] 12.1 עמוד `/simulate` — Simulator form: gate_type dropdown, sender_name, channel_name, message_content textarea, simulated_timestamp
- [ ] 12.2 Send button → POST /api/simulate → show event_id + link ל-trace
- [ ] 12.3 Live pipeline progress — Supabase Realtime subscribe לevent_id שנוצר, הצג step-by-step completion
- [ ] 12.4 Saved Scenarios sidebar — list + Load button → ממלא form
- [ ] 12.5 "שמור כ-Scenario" button → modal לname → POST /api/simulator/scenarios
- [ ] 12.6 Batch Upload section — JSON file upload → sequential send עם progress bar

## 13. Frontend — Policy Editor & Settings

- [ ] 13.1 עמוד `/settings/policy` — rule cards ממוינות לפי priority, drag-to-reorder
- [ ] 13.2 RuleCard component: condition display, decision badge, edit/delete buttons
- [ ] 13.3 "הוסף Rule" dialog — condition builder (multi-select fields), decision dropdown, priority input
- [ ] 13.4 Policy change preview: "rule זה ישפיע על X events מהשבוע האחרון" (dry-run query)
- [ ] 13.5 Policy version history view — versions list עם timestamp + diff viewer

## 14. Testing & Validation

- [ ] 14.1 Unit tests: policy-engine.ts — כל combination של conditions, default rule, first-match
- [ ] 14.2 Unit tests: importance_score חישוב — כל combinations של severity × urgency
- [ ] 14.3 Integration test: ingest → pipeline מלא → triage_decision נוצר → audit_log קיים
- [ ] 14.4 Integration test: Critical event → תמיד escalate, גם אם policy=approve
- [ ] 14.5 Integration test: Gemini timeout → default classification → escalate (לא autonomous-resolve)
- [ ] 14.6 Integration test: audit_logs — ניסיון UPDATE נכשל עם permission denied
- [ ] 14.7 Integration test: Heartbeat idempotency — שתי הפעלות באותו חלון → heartbeat_log אחד בלבד
- [ ] 14.8 Integration test: stuck event (processing > 10min) → Heartbeat marks stuck + escalation נוצרת

## 15. Observability & Go-Live

- [ ] 15.1 הגדר Supabase Database Webhooks — heartbeat_logs INSERT עם status='failed' → POST לendpoint שמשלח email/alert לowner
- [ ] 15.2 הגדר Vercel error logging (Sentry integration) לכל /api routes
- [ ] 15.3 Smoke test מלא: שלח 5 events מהSimulator עם severities שונות, ודא שמגיעים ל-Inbox כצפוי
- [ ] 15.4 Smoke test Heartbeat: submit event ואז עצור pipeline באמצע (set processing_status='processing' ידנית), המתן 11 דקות, ודא שHeartbeat מזהה stuck + escalation
- [ ] 15.5 בדוק pg_cron ו-Vercel Cron עובדים — heartbeat_logs יש records כל 5 דקות לפחות

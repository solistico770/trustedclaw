## 1. Infrastructure Setup

- [ ] 1.1 צור Supabase project עם PostgreSQL, Auth, Realtime, Storage
- [ ] 1.2 צור Vercel project עם Next.js 14 (App Router), Shadcn/ui, TypeScript
- [ ] 1.3 הגדר EC2 instance (t3.medium לפחות) עם Node.js, PM2, Chromium
- [ ] 1.4 הגדר environment variables: Supabase URL/keys, Gemini API key, HMAC secret בין EC2 ל-Vercel
- [ ] 1.5 הגדר CORS, IP whitelist בין EC2 ל-Vercel (רק Vercel IPs יכולים לדבר עם EC2)

## 2. Database Schema

- [ ] 2.1 צור migration: טבלת `gates` (id, type, display_name, status, credentials_encrypted, metadata)
- [ ] 2.2 צור migration: טבלת `channels` (id, gate_id, external_channel_id, display_name, last_activity_at)
- [ ] 2.3 צור migration: טבלת `threads` (id, channel_id, subject, started_at, last_event_at)
- [ ] 2.4 צור migration: טבלת `events` (id, gate_id, channel_id, thread_id, occurred_at, received_at, raw_payload JSONB immutable, normalized_payload JSONB, processing_status, user_id)
- [ ] 2.5 צור migration: טבלאות `entities`, `event_entities` עם indexes על type, canonical_name
- [ ] 2.6 צור migration: טבלת `classifications` (id, event_id, severity, urgency, importance_score, reasoning, classified_by)
- [ ] 2.7 צור migration: טבלאות `triage_decisions`, `agent_actions`, `policy_decisions`
- [ ] 2.8 צור migration: טבלאות `policies` (עם versioning), `executions`
- [ ] 2.9 צור migration: טבלת `audit_logs` append-only עם RLS — INSERT only, אפילו לservice role אין UPDATE/DELETE
- [ ] 2.10 הגדר RLS policies: כל טבלה מוגנת ב-`user_id = auth.uid()`
- [ ] 2.11 הגדר Supabase Realtime publications על: `events`, `triage_decisions`, `executions`

## 3. EC2 Gate Listener Service

- [ ] 3.1 צור Node.js service עם Express HTTP server (לקבלת `/gate/send` מ-Vercel)
- [ ] 3.2 מימש HMAC-SHA256 middleware לאימות כל request נכנס ויוצא
- [ ] 3.3 מימש Telegram Gate adapter (Bot API polling + message send)
- [ ] 3.4 מימש Slack Gate adapter (Events API webhook + Web API send)
- [ ] 3.5 מימש WhatsApp Gate adapter דרך whatsapp-web.js/Baileys עם Puppeteer
- [ ] 3.6 מימש local retry queue ב-EC2 לevents שנכשלו (exponential backoff, dead-letter log)
- [ ] 3.7 הגדר PM2 process manager לrestart אוטומטי ו-log rotation
- [ ] 3.8 מימש reconnection logic לכל Gate עם exponential backoff (5s, 15s, 60s, 300s)
- [ ] 3.9 כתוב health check endpoint ב-EC2 (`GET /health`) עם status של כל Gate

## 4. Vercel API — Event Ingestion

- [ ] 4.1 צור `POST /api/gate/ingest` — קבלת events מ-EC2, HMAC validation, שמירת raw event ב-Supabase (סינכרוני)
- [ ] 4.2 צור `POST /api/gate/send` — שליחת instructions ל-EC2 לwrite-back ל-Gate
- [ ] 4.3 מימש normalization layer: תרגום raw payload לפורמט Event אחיד לפי gate_type
- [ ] 4.4 מימש async processing queue (Vercel background functions או Supabase Edge Functions)

## 5. Event Processing Pipeline

- [ ] 5.1 מימש Enrichment Agent: קריאה ל-Gemini Flash עם structured output schema (language, intent_tags, sentiment, mentioned_entities)
- [ ] 5.2 מימש Entity Extraction: חילוץ entities מenrichment output, validation של confidence scores
- [ ] 5.3 מימש Entity Linking: התאמה לentities קיימות, יצירת entities חדשות, escalation לconfidence < 0.8
- [ ] 5.4 מימש Thread Detection: קישור events לthreads קיימים לפי channel_id + temporal + entity overlap
- [ ] 5.5 מימש Classification Agent: קריאה ל-Gemini Flash לseverity/urgency/reasoning עם JSON schema validation
- [ ] 5.6 מימש Importance Score: חישוב דטרמיניסטי מ-severity + urgency + policy weights
- [ ] 5.7 מימש Gemini fallback: timeout 10s → default classification + force_escalate=true

## 6. Policy Engine

- [ ] 6.1 הגדר Policy JSON schema (auto_approve_rules, require_approval_rules, blocked_rules, spending_limit, escalation_thresholds)
- [ ] 6.2 מימש policy evaluator — predicate functions דטרמיניסטיות, ללא LLM
- [ ] 6.3 מימש default policy: כל action_type לא מכוסה → require_human
- [ ] 6.4 מימש policy versioning: כל save יוצר version חדש
- [ ] 6.5 מימש approval timeout: actions שממתינים לאישור > 24 שעות → status=timeout_expired
- [ ] 6.6 כתוב unit tests לpolicy evaluator (100% coverage על rule matching)

## 7. Triage Engine

- [ ] 7.1 מימש Triage Agent: קריאה ל-Gemini Pro לtriage decision עם reasoning
- [ ] 7.2 מימש Critical override: Severity=Critical → תמיד escalate, אין override
- [ ] 7.3 מימש autonomous resolution flow: triage=resolve → יצירת agent_action → policy check → execution
- [ ] 7.4 מימש escalation creation: שמירת escalation ב-Supabase + Realtime push לUI
- [ ] 7.5 מימש snooze: escalation נעלמת, מוחזרת ב-wake_at timestamp

## 8. Execution Layer

- [ ] 8.1 צור `POST /api/gate/execute` — מקבל approved action, מאמת policy_decision status, שולח ל-EC2
- [ ] 8.2 מימש idempotency check: action_id שכבר executed → חסימה + audit log
- [ ] 8.3 מימש execution result capture: שמירת executions record עם status, response, timestamps
- [ ] 8.4 מימש execution failure handling: יצירת execution_failure event לטיפול

## 9. Audit Trail

- [ ] 9.1 מימש `logAudit(actor, action_type, target_type, target_id, reasoning)` helper — נקרא מכל decision point
- [ ] 9.2 ודא שכל autonomous resolution, policy decision, execution, ו-user action קורא ל-logAudit
- [ ] 9.3 בדוק ב-integration test שRLS מונע UPDATE/DELETE על audit_logs
- [ ] 9.4 צור `GET /api/audit` עם filter לפי actor, action_type, date range, event_id

## 10. Frontend — Escalation Inbox

- [ ] 10.1 צור עמוד Inbox (`/`) עם רשימת escalations פתוחות, ממוינות לפי Importance
- [ ] 10.2 חבר Supabase Realtime לInbox — עדכון live ללא refresh
- [ ] 10.3 מימש EscalationCard component: summary, entity badges, Gate icon, severity badge, 3 action buttons
- [ ] 10.4 מימש Escalation Detail drawer/page: הודעה מלאה, thread history, entity cards, classification reasoning
- [ ] 10.5 מימש Approve action: POST /api/escalations/:id/resolve עם decision=approve
- [ ] 10.6 מימש Dismiss action: POST עם decision=dismiss + optional reason
- [ ] 10.7 מימש Snooze action: date/time picker → POST עם snooze_until

## 11. Frontend — Entity Browser

- [ ] 11.1 צור עמוד `/entities` עם fulltext search, filter לפי type ו-gate
- [ ] 11.2 מימש EntityCard component: canonical_name, type badge, gate identifiers, last activity
- [ ] 11.3 מימש Entity Timeline view: כל events קשורים לפי תאריך עם status badges
- [ ] 11.4 מימש Merge Entities UI: בחירת שתי entities + אישור מיזוג

## 12. Frontend — Event Log ו-Audit Trail

- [ ] 12.1 צור עמוד `/events` עם filter לפי Gate, Severity, Entity, Date range
- [ ] 12.2 מימש Decision Trace view לכל event: pipeline steps עם timestamps ו-reasoning
- [ ] 12.3 צור עמוד `/audit` עם search, filter, ו-JSON export

## 13. Frontend — Settings

- [ ] 13.1 צור עמוד `/settings/gates` — רשימת gates, status, last connected, כפתור הוסף/הסר
- [ ] 13.2 מימש Gate connection flow לפי gate_type (QR scan לWhatsApp, OAuth לSlack, token לTelegram)
- [ ] 13.3 צור עמוד `/settings/policy` — Policy Editor עם JSON view + validation + version history
- [ ] 13.4 מימש policy change preview: "X actions יושפעו מהשינוי"

## 14. Testing ו-Validation

- [ ] 14.1 כתוב integration test: event נכנס מ-Telegram → normalized → classified → triage → audit_log
- [ ] 14.2 כתוב integration test: Critical event → תמיד escalate, אף פעם לא discard
- [ ] 14.3 כתוב integration test: action ללא policy approval → חסום ב-execution layer
- [ ] 14.4 כתוב integration test: Gemini timeout → fallback classification → escalate (לא autonomous resolve)
- [ ] 14.5 כתוב unit tests לכל policy rules (auto_approve, require_human, reject, default)
- [ ] 14.6 בדוק manually: end-to-end WhatsApp message → Inbox escalation → Approve → תגובה חוזרת ל-WhatsApp

## 15. Observability ו-Go-Live

- [ ] 15.1 הגדר error logging (Sentry או Vercel logs) לכל API routes
- [ ] 15.2 הגדר EC2 health monitoring: alert אם Gate נופל > 5 דקות
- [ ] 15.3 הגדר Supabase alerts: DB size, slow queries
- [ ] 15.4 צור default policy לowner user עם conservative settings
- [ ] 15.5 smoke test מלא: חבר את כל 3 Gates, שלח הודעת test מכל אחד, ודא שמגיעה ל-Inbox

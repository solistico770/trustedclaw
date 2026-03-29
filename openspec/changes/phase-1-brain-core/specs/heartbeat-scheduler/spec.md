## ADDED Requirements

### Requirement: Dual-Trigger Heartbeat
ה-Heartbeat SHALL להיות מופעל משני מנגנונים עצמאיים: Supabase pg_cron (כל 5 דקות, קורא ל-POST /api/heartbeat) ו-Vercel Cron (כל 5 דקות, כbackup). שניהם קוראים לאותו endpoint. ה-endpoint SHALL להיות idempotent — הפעלה כפולה בחלון 5 דקות לא תגרום לעיבוד כפול.

#### Scenario: pg_cron מפעיל heartbeat
- **WHEN** pg_cron job מגיע לזמן scheduled
- **THEN** HTTP POST נשלח ל-POST /api/heartbeat עם CRON_SECRET header. endpoint מעבד ומחזיר heartbeat_log_id.

#### Scenario: הפעלה כפולה באותו חלון
- **WHEN** Vercel Cron ו-pg_cron שניהם מפעילים heartbeat בתוך אותה חלון 5 דקות
- **THEN** השני מוצא run_id קיים (md5 של floor(now()/5min)) ומחזיר 200 ללא עיבוד. heartbeat_log אחד בלבד נוצר לחלון זה.

#### Scenario: pg_cron כשל, Vercel Cron ממשיך
- **WHEN** pg_net extension לא זמין או pg_cron job נכשל
- **THEN** Vercel Cron מפעיל heartbeat ללא ידיעת pg_cron. השפעה על המשתמש: אפס.

### Requirement: Stuck Events Detection
Heartbeat SHALL לזהות events שנתקעו בעיבוד. event בסטטוס 'processing' ליותר מ-10 דקות נחשב stuck.

#### Scenario: זיהוי event תקוע
- **WHEN** Heartbeat מוצא event עם processing_status='processing' ו-processing_started_at < NOW() - INTERVAL '10 minutes'
- **THEN** processing_status מתעדכן ל-'stuck'. escalation נוצרת לowner. heartbeat_log.events_stuck מוגדל ב-1.

#### Scenario: event שנתקע — retry
- **WHEN** owner רואה escalation על event תקוע ולוחץ Retry
- **THEN** processing_status חוזר ל-'normalized' (השלב האחרון הבריא). Heartbeat הבא יחזור לעבד אותו.

### Requirement: Pending Events Requeue
Heartbeat SHALL למצוא events שלא התחיל עיבודם תוך 2 דקות ולהחזיר אותם לתור.

#### Scenario: event בסטטוס pending ליותר מ-2 דקות
- **WHEN** Heartbeat מוצא event עם processing_status='pending' ו-received_at < NOW() - INTERVAL '2 minutes'
- **THEN** pipeline מופעל מחדש לevent זה. heartbeat_log.events_requeued מוגדל ב-1.

#### Scenario: event עם שלב כושל (normalization_failed, enrichment_failed)
- **WHEN** Heartbeat מוצא event עם processing_status IN ('normalization_failed', 'enrichment_failed', 'classification_failed')
- **THEN** retry לאותו שלב. אם הkushלה חוזרת על עצמה 3+ פעמים → processing_status='permanent_failure', escalation לowner.

### Requirement: Orphaned Classifications
Heartbeat SHALL לזהות events שסיימו classification אבל אין להם triage_decision.

#### Scenario: event מסווג ללא triage
- **WHEN** Heartbeat מוצא event עם processing_status='classified' ואין triage_decisions record
- **THEN** triage step מופעל מחדש לevent. heartbeat_log.events_requeued++.

### Requirement: Escalation Timeout Reminder
Heartbeat SHALL לשלוח reminder לowner על escalations פתוחות שחורגות מה-timeout שהוגדר בpolicy (default: 4 שעות).

#### Scenario: escalation פתוחה מעל timeout
- **WHEN** Heartbeat מוצא triage_decision עם decision='escalate', status='open', created_at < NOW() - policy.escalation_timeout
- **THEN** escalation מסומנת כ-reminded=true. הודעת reminder נשמרת ב-audit_log. heartbeat_log.escalations_reminded++.

### Requirement: Heartbeat Log
כל ריצת Heartbeat SHALL לכתוב heartbeat_log record. ה-log הוא append-only ומוצג ב-Admin UI.

#### Scenario: heartbeat_log record מלא
- **WHEN** ריצת Heartbeat מסתיימת
- **THEN** נשמר: {run_id, run_at, triggered_by ('pg_cron'|'vercel_cron'|'manual'), duration_ms, events_checked, events_requeued, events_stuck, escalations_reminded, status ('success'|'partial_failure'|'failed')}

#### Scenario: Heartbeat עצמו נכשל
- **WHEN** /api/heartbeat זורק exception לא מטופל
- **THEN** heartbeat_log נשמר עם status='failed', error_message. Supabase Database Webhook שולח alert (email/webhook לowner). זהו critical failure.

### Requirement: Manual Heartbeat Trigger
Owner SHALL יכול להפעיל Heartbeat ידנית מ-Admin UI בכל עת, ללא המתנה לschedule.

#### Scenario: הפעלה ידנית מה-UI
- **WHEN** owner לוחץ "הרץ Heartbeat עכשיו" ב-Heartbeat Monitor
- **THEN** POST /api/heartbeat נשלח עם triggered_by='manual'. תוצאה מוצגת ב-UI תוך שניות דרך Realtime.

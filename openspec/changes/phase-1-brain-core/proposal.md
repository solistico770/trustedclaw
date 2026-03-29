## Why

לפני שמחברים ערוצים אמיתיים (WhatsApp, Telegram, Slack), צריך להוכיח שהמוח עובד — שהוא קולט אירוע, מבין אותו, מחליט, פועל, ולא שוכח כלום. שלב 1 בונה את הגרעין: מסד הנתונים, ה-pipeline, ה-Heartbeat שמבטיח שאף אירוע לא נופל בין הכסאות, ממשק ניהול שמראה הכל, וסימולטור ערוץ שמאפשר לאמן ולאמת את המוח בזמן אמת — הכל לפני שנגע בחיבורי Gate אמיתיים.

## What Changes

- **חדש**: `brain-pipeline` — pipeline מלא מ-event נכנס ועד resolution/escalation, כולל normalization, enrichment (Gemini), entity linking, classification, triage, policy check
- **חדש**: `heartbeat-scheduler` — לב הפועם של המערכת: Supabase pg_cron + Vercel Cron שסורקים כל אירוע כל 5 דקות, מחזירים תקועים לתור, ומסלימים קריסות
- **חדש**: `fake-channel-simulator` — UI + API לשליחת אירועים סינתטיים כאילו הגיעו מ-Gate אמיתי, לאימון ובדיקה
- **חדש**: `admin-ui` — ממשק Shadcn/Next.js מלא: Escalation Inbox, Event Log, Entity Browser, Heartbeat Monitor, Simulator Panel, Settings
- **חדש**: `policy-engine` — מנוע כללים דטרמיניסטי שמאשר/חוסם/מסלים פעולות מוצעות, ללא LLM
- **חדש**: `audit-trail` — לוג append-only של כל החלטה ופעולה, עם decision trace לכל event

## Capabilities

### New Capabilities

- `brain-pipeline`: pipeline עיבוד אסינכרוני מלא — קליטת event גולמי, normalization, enrichment דרך Gemini Flash, entity extraction ו-linking, classification (Severity/Urgency/Importance), triage decision, policy check, autonomous resolution או escalation
- `heartbeat-scheduler`: משימה מתוזמנת (pg_cron ב-Supabase + Vercel Cron כ-backup) שסורקת את כל ה-events ומבטיחה שאין אירוע תקוע, לא מסווג, לא מטופל — עם heartbeat_log לכל ריצה ו-Realtime push ל-UI
- `fake-channel-simulator`: פאנל UI ו-API endpoint לשליחת הודעות סינתטיות כ-events לתוך המערכת, עם בחירת gate_type, sender, וtimestamp מדומה — מייצר event אמיתי שעובר את כל ה-pipeline
- `admin-ui`: ממשק ניהול מבוסס Next.js App Router + Shadcn/ui עם Supabase Realtime — כולל Escalation Inbox, Event Log עם decision trace, Entity Browser עם timeline, Heartbeat Monitor, Simulator Panel, Policy Editor
- `policy-engine`: מנוע כללים דטרמיניסטי (JSON rules, ללא LLM) שמעריך כל action proposal מול policy המשתמש ומחזיר approve/reject/require_human, עם versioning ו-audit לכל החלטה
- `audit-trail`: טבלת audit_logs append-only ב-Supabase עם RLS INSERT-only, decision trace API לכל event, ו-UI לחיפוש וייצוא

### Modified Capabilities

<!-- שלב 1 הוא greenfield — אין capabilities קיימים לשינוי -->

## Impact

- **תשתית חדשה**: Supabase project (PostgreSQL + pg_cron extension + Realtime + Auth + Storage), Vercel project (Next.js 14 App Router)
- **תלויות חיצוניות**: Gemini API (Google AI Studio / Vertex AI) לenrichment וclassification
- **אין תלות ב-EC2** — שלב 1 הוא serverless לחלוטין מחוץ ל-Supabase
- **APIs פנימיים חדשים**: POST /api/events/ingest, POST /api/heartbeat, POST /api/simulate, GET /api/events, GET /api/escalations, POST /api/escalations/[id]/resolve, GET /api/entities, GET /api/audit, GET/POST /api/policy
- **ללא ממשק Gate חיצוני בשלב זה** — Simulator הוא ה-Gate היחיד בשלב 1

## Why

אנשים מקצועיים ועסקים מנהלים עשרות ערוצי תקשורת ומידע במקביל — WhatsApp, Telegram, Slack, מייל, בנק, CRM — ואין מערכת שקולטת את כולם, מבינה מה חשוב, ופועלת אוטונומית על מה שאפשר. עוזרי LLM קיימים הם reactive ו-session-based, חסרי ממשל בטוח לפעולות בעולם האמיתי, ואינם מסוגלים לפעול ברקע ללא הפעלה אקטיבית של המשתמש. TrustedClaw נבנית כדי להיות התשתית הקוגניטיבית-תפעולית שחסרה.

## What Changes

- **חדש**: פלטפורמת קליטה מרובת-ערוצים (Gates) — WhatsApp, Telegram, Slack בשלב 1
- **חדש**: Event Store אחיד — כל raw input נשמר בלתי-משתנה, normalized event נשמר בנפרד
- **חדש**: מנוע Entity Extraction ו-Linking — זיהוי ישויות מאירועים וקישורן ל-entity graph
- **חדש**: Classification Engine — סיווג Severity, Urgency ו-Importance לכל event
- **חדש**: Triage Engine — החלטה אוטונומית: resolve / escalate / snooze
- **חדש**: Policy Engine (דטרמיניסטי) — שכבת בטיחות שמאמתת כל פעולה מוצעת מול policy המשתמש
- **חדש**: Escalation Inbox — ממשק משתמש ממוקד להצגת חריגים בלבד
- **חדש**: Audit Trail — לוג בלתי-ניתן לשינוי של כל החלטה ופעולה
- **חדש**: EC2 Gate Listener Service — process פרסיסטנטי לניהול חיבורים כבדים (Puppeteer/Bot APIs)
- **חדש**: Entity Browser ו-Event Log — ממשקי חיפוש והיסטוריה

## Capabilities

### New Capabilities

- `gate-ingestion`: קליטת אירועים גולמיים מ-Gates מרובים (WhatsApp, Telegram, Slack) דרך EC2 Listener, נורמליזציה, ושמירה append-only ב-Supabase
- `event-processing`: pipeline אסינכרוני שמעשיר אירועים, מחלץ ישויות, מקשר ל-entity graph, ומסווג Severity/Urgency/Importance דרך Gemini
- `entity-management`: יצירה, קישור, מיזוג וחיפוש של ישויות בעולם האמיתי — אנשים, חברות, פרויקטים, חשבוניות ועוד
- `triage-and-escalation`: החלטת triage אוטונומית, פתרון low-risk ללא התערבות, הסלמת חריגים למשתמש עם reasoning ברור
- `policy-engine`: שכבת בטיחות דטרמיניסטית שמגדירה מה הסוכן רשאי לבצע אוטונומית, מה דורש אישור, ומה אסור
- `gate-execution`: שליחת פעולות יוצאות חזרה ל-Gates (תגובות להודעות) רק לאחר אישור Policy Engine
- `escalation-ui`: ממשק Escalation Inbox, Entity Browser, Event Log, Audit Trail ו-Settings בנוי ב-Next.js + Shadcn/ui עם Supabase Realtime
- `audit-trail`: תיעוד append-only של כל decision, פעולה, reasoning ותוצאה — עם decision trace מלא לכל event

### Modified Capabilities

<!-- אין capabilities קיימים — זוהי בנייה מאפס -->

## Impact

- **Infrastructure**: EC2 instance חדש לניהול Gate connections פרסיסטנטיים; Vercel project חדש ל-Next.js app; Supabase project חדש ל-DB, Auth, Realtime, Storage
- **APIs**: POST `/api/gate/ingest` (EC2→Vercel), POST `/gate/send` (Vercel→EC2) — תקשורת HMAC-signed
- **External Services**: Gemini API (Google AI) לעיבוד קוגניטיבי; WhatsApp Web דרך Puppeteer (סיכון ToS — מתוכנן מעבר ל-Business API); Telegram Bot API; Slack Events API
- **Data**: כל event נשמר לנצח (append-only) — השלכות storage ו-privacy משמעותיות; RLS מלא ב-Supabase לבידוד נתוני משתמשים
- **Security**: LLM לעולם לא מבצע פעולות execution ישירות — Policy Engine כ-mandatory gate

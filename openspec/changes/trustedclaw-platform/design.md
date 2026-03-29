## Context

TrustedClaw נבנית מאפס. אין legacy code. הצוות מכיר Next.js, Supabase ו-Gemini. האתגר הראשי הוא ארכיטקטורלי: חיבורים פרסיסטנטיים ל-WhatsApp/Telegram/Slack אינם אפשריים בסביבת serverless — Vercel functions timeout אחרי שניות. לכן נדרש רכיב נפרד ל-Gate Listening.

המגבלה המרכזית: WhatsApp Web דרך Puppeteer מנוגד לתנאי השימוש של Meta. זהו פתרון שלב 1 בלבד, עם מסלול מתוכנן ל-WhatsApp Business API.

## Goals / Non-Goals

**Goals:**
- הפרדה ברורה בין Gate Listener (EC2, stateful) לבין Application Backend (Vercel, stateless)
- LLM לעולם לא מבצע פעולות execution ישירות — תמיד דרך Policy Engine
- כל event נשמר raw לפני כל עיבוד — data integrity מוחלטת
- Supabase Realtime לעדכוני UI ללא polling
- ארכיטקטורה שניתן להרחיב ל-Gate types נוספים ללא שינוי core

**Non-Goals:**
- Multi-tenancy מלא בשלב 1 — single-user owner mode
- פעולות כספיות / approval workflow מורכב — Phase 2
- Voice-to-text, PDF processing, email Gate — לאחר Phase 1
- High availability / auto-scaling של EC2 — Phase 2
- WhatsApp Business API migration — Phase 2

## Decisions

### החלטה 1: EC2 עם Puppeteer לעומת שירות third-party ל-WhatsApp

**נבחר:** EC2 עם Puppeteer (baileys/whatsapp-web.js) + Telegram Bot API + Slack Events API

**למה:** third-party services כמו Twilio Conversations או Wati דורשים WhatsApp Business Account מאושר שלוקח שבועות לאישור, עולים כסף משמעותי per-message, ומגבילים ל-template messages. Puppeteer מאפשר full WhatsApp Web access מיידית לpersonal number.

**אלטרנטיבה שנדחתה:** Railway / Render במקום EC2 — לא תומכים בPuppeteer בצורה אמינה, בעיות בchromium בסביבות containerized מסוימות.

**סיכון:** ToS violation. מיטיגציה: isolated number לטסטים, מעבר מתוכנן ל-Business API.

---

### החלטה 2: תקשורת EC2 ↔ Vercel — HTTP לעומת WebSocket/Queue

**נבחר:** HTTP REST עם HMAC-SHA256 signing בשני הכיוונים

**למה:** WebSocket מ-EC2 ל-Vercel serverless אינו אפשרי (Vercel functions חסרות persistent connection). Message queue (SQS/Redis) מוסיף תלות נוספת ומורכבות תפעולית. HTTP POST פשוט, auditable, וניתן לretry מפורש.

**EC2 → Vercel:** `POST /api/gate/ingest` לכל event נכנס
**Vercel → EC2:** `POST /gate/send` לכל פעולה יוצאת. EC2 חושף HTTP server פנימי עם IP whitelist.

**Retry strategy ב-EC2:** exponential backoff עם local queue אם Vercel לא מגיב. Dead-letter log לאירועים שנכשלו 5+ פעמים.

---

### החלטה 3: Supabase לעומת PlanetScale/Neon + Pusher נפרד

**נבחר:** Supabase (PostgreSQL + Realtime + Auth + Storage)

**למה:** Supabase מספק את כל הצרכים בפלטפורמה אחת: RDBMS מוכח, Realtime websockets, Auth עם RLS, ו-Storage. מפחית vendor sprawl ב-phase 1. RLS על כל טבלה מבטיח data isolation בלי application-level filtering.

**אלטרנטיבה שנדחתה:** Neon (Postgres) + Pusher (Realtime) — שתי פלטפורמות, שני billing accounts, sync בין metadata.

**מגבלה מוכרת:** Supabase Realtime עשוי להיות bottleneck ב-high volume (>1000 concurrent connections). מקובל לshלב 1.

---

### החלטה 4: Gemini כ-LLM לעומת OpenAI GPT-4

**נבחר:** Gemini (Flash לclassification, Pro לreasoning מורכב)

**למה:** Gemini Flash זמין בעלות נמוכה משמעותית לclassification tasks בנפח גבוה. Google AI SDK מאפשר structured output עם JSON schema — קריטי לPolicy Engine שצריך deterministic parsing של LLM outputs. Gemini Pro לtriage decisions מורכבות.

**אלטרנטיבה שנדחתה:** GPT-4o — יקר יותר לclassification, אין יתרון ברור לuse case הספציפי.

**Fallback:** אם Gemini לא זמין (timeout > 10s) → default classification: Severity=Medium, Urgency=Normal, decision=escalate. אף פעם לא autonomous-resolve בלי LLM classification.

---

### החלטה 5: Policy Engine — Rule-based לעומת LLM-based

**נבחר:** דטרמיניסטי לחלוטין — JSON rules שמוערכות בקוד

**למה:** Policy שקובעת אם לבצע פעולה בעולם האמיתי אסורה להיות subject ל-LLM variability. LLM יכול "לשכנע את עצמו" לאשר פעולה שהמשתמש לא התכוון לה. Policy rules הן predicate functions: `if action.type === "send_message" && action.risk_level === "low" && policy.auto_reply === true → approve`.

**אלטרנטיבה שנדחתה:** LLM כ-policy interpreter — נדחתה מסיבות בטיחות בסיסיות.

---

### החלטה 6: Event Storage — Append-only vs. Mutable

**נבחר:** Append-only לחלוטין עבור `events` ו-`audit_logs`. שאר הטבלאות mutable עם audit_log entry לכל שינוי.

**למה:** raw_payload של event הוא עדות לא-ניתנת-לשינוי למה שקרה. שינוי שלו בדיעבד, אפילו לתיקון, הורס את האמינות. Normalized payload — immutable לאחר processing. Classifications ו-triage decisions — immutable (corrections יוצרות records חדשים).

## Risks / Trade-offs

**[WhatsApp ToS]** → הגדרת use case כ-personal automation כ-boundary, לא commercial deployment. מספר טלפון ייעודי לטסטים. מסלול מוגדר ל-Business API ב-Phase 2.

**[Gemini Structured Output Reliability]** → כל LLM output עובר JSON schema validation לפני שימוש. validation failure = fallback to escalate (לא silent error).

**[EC2 Single Point of Failure]** → Phase 1: acceptable. Phase 2: multi-AZ + health monitoring + auto-restart via process manager (PM2).

**[Supabase RLS Performance]** → RLS queries מאטות ב-15-30%. מקובל לPhase 1. אופטימיזציה ב-indexes על `user_id` + `occurred_at`.

**[Entity Disambiguation]** → confidence score < 0.8 → entity linking לא אוטומטי → escalate לאישור משתמש. Conservative by default.

**[Privacy]** → המערכת רואה הכל. Data at rest מוצפן ב-Supabase. Application-level: לא שולחים raw_payload ל-Gemini בשלמותו — מסננים PII לפי גודל ולפי Gate type.

## Migration Plan

Phase 1 הוא greenfield — אין migration מ-legacy. Deploy order:
1. Supabase project setup + schema migration
2. EC2 setup + Gate Listener deployment
3. Vercel deployment + env vars configuration
4. Gate connections (Telegram ← הכי קל, Slack, WhatsApp אחרון)
5. End-to-end smoke test עם single real event
6. Policy configuration ל-owner user

**Rollback:** אין state מ-legacy לשמור. בעיה קריטית → shutdown EC2 listener → אף event לא נקלט → אין side effects.

## Open Questions

1. **Policy UX בשלב 1:** natural language → parse → rules, או admin JSON editor? המלצה: JSON editor לPhase 1 (owner רק), NL parsing לPhase 2.
2. **Escalation delivery:** Supabase Realtime push לUI בלבד, או גם push notification (mobile/email)? Phase 1: UI only.
3. **Gemini Flash/Pro threshold:** מה Importance score מצדיק מעבר ל-Pro? לקבוע experimentally לאחר ראיית volume אמיתי.
4. **Multi-tenancy day 1:** schema תומך, אבל EC2 setup מניח single-user. Gate credentials (session files) צריכים isolation per user ב-Phase 2.
5. **Raw event retention:** forever vs. tiered archival. Phase 1: forever (storage זול). לקבוע policy לפני scale.

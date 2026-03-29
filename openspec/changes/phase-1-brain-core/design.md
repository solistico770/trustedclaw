## Context

שלב 1 הוא greenfield מלא. אין legacy. הסביבה היא serverless-first: Supabase ו-Vercel. האתגר המרכזי בשלב זה אינו ה-LLM — הוא הHeartbeat: כיצד מבטיחים שמשימה מתוזמנת פועלת בצורה אמינה בסביבה שבה Vercel Cron לא מובטח ו-Supabase pg_cron דורש הפעלה ידנית של extension?

הפתרון הוא redundancy דרך שני מנגנונים עצמאיים שמסנכרנים דרך database state — לא דרך קואורדינציה ישירה. כל ריצת Heartbeat היא idempotent: אם רצה פעמיים, התוצאה זהה.

## Goals / Non-Goals

**Goals:**
- pipeline עיבוד מלא ואמין: event נכנס → resolution/escalation, עם state שמור בכל שלב
- Heartbeat שמבטיח zero event slip-through בתנאי כשל חלקי
- Simulator שמאפשר הפעלה מיידית ללא Gate אמיתי
- Admin UI שמראה הכל בזמן אמת
- Policy Engine דטרמיניסטי שמגן מפני LLM overreach

**Non-Goals:**
- EC2, WhatsApp, Telegram, Slack — Phase 2
- פעולות כספיות — Phase 2
- Multi-user — Phase 2
- Push notifications מחוץ ל-UI (email/mobile) — Phase 2
- Auto-scaling ו-HA — Phase 2

## Decisions

### החלטה 1: Heartbeat — pg_cron + Vercel Cron כ-redundancy, לא כ-coordination

**נבחר:** שני מנגנונים עצמאיים שניהם קוראים לאותו `POST /api/heartbeat` endpoint.

```
Supabase pg_cron  ──►  POST /api/heartbeat  ──►  scan events  ──►  write heartbeat_log
Vercel Cron       ──►  POST /api/heartbeat  ──►  (idempotent)
```

**Idempotency מנגנון:** heartbeat_log מכיל `run_id = md5(floor(now() / interval '5 minutes'))`. אם שני triggers מגיעים באותה חלון 5 דקות, השני מוצא שה-run_id כבר קיים ומחזיר 200 ללא עיבוד כפול.

**למה לא רק Vercel Cron?** Vercel Cron לא מובטח — Vercel עצמם מציינים "best effort". pg_cron רץ בתוך ה-database — אמין יותר, אבל דורש `pg_net` extension לHTTP calls. הcombination מספק ~99.9% coverage.

**למה לא רק pg_cron?** pg_net HTTP calls עלולים להתקזז אם Vercel cold-start לוקח יותר מהtimeout. Vercel Cron כ-backup מבטיח שאם pg_cron נכשל, יש fallback.

**אלטרנטיבה שנדחתה:** Supabase Edge Function cron — אפשרי אבל מוסיף עוד runtime לנהל. Vercel + pg_cron מספיקים.

---

### החלטה 2: Pipeline Architecture — sequential steps with state saved between each

**נבחר:** כל שלב בpipeline שומר את תוצאתו ל-Supabase לפני שמתחיל השלב הבא. אין in-memory state בין steps.

```
ingest → [save raw] → normalize → [update event] → enrich → [save enrichment] →
link entities → [save links] → classify → [save classification] →
triage → [save triage_decision] → policy check → [save policy_decision] →
resolve/escalate → [save resolution + audit_log]
```

**למה:** Vercel functions timeout אחרי 60s (Pro plan). pipeline שלם עם Gemini calls עלול לקחת 15-30s. אם function נקטעת באמצע, Heartbeat יוכל לזהות את השלב האחרון שנשמר ולהמשיך משם — לא מהתחלה.

**אלטרנטיבה שנדחתה:** single function שרצה הכל end-to-end — אמין פחות, harder to debug, לא ניתן לretry שלב ספציפי.

---

### החלטה 3: Gemini Structured Output כחוזה קשיח

**נבחר:** כל Gemini call משתמש ב-`responseSchema` (JSON Schema object) שמגדיר בדיוק מה מותר בoutput. response שלא עומד בschema → rejection, לא retry.

**Schema לenrichment:**
```json
{
  "type": "object",
  "required": ["detected_language", "intent_tags", "sentiment", "mentioned_entities"],
  "properties": {
    "detected_language": {"type": "string"},
    "intent_tags": {"type": "array", "items": {"type": "string"}},
    "sentiment": {"enum": ["positive", "neutral", "negative", "urgent"]},
    "mentioned_entities": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "type", "confidence"],
        "properties": {
          "name": {"type": "string"},
          "type": {"enum": ["person", "company", "project", "invoice", "amount", "date", "other"]},
          "confidence": {"type": "number", "minimum": 0, "maximum": 1}
        }
      }
    }
  }
}
```

**Schema לclassification:**
```json
{
  "type": "object",
  "required": ["severity", "urgency", "reasoning", "proposed_action"],
  "properties": {
    "severity": {"enum": ["critical", "high", "medium", "low", "info"]},
    "urgency": {"enum": ["immediate", "soon", "normal", "low"]},
    "reasoning": {"type": "string", "maxLength": 500},
    "proposed_action": {"type": "string", "maxLength": 200},
    "confidence": {"type": "number", "minimum": 0, "maximum": 1}
  }
}
```

**Fallback:** schema validation failure → `processing_status = 'needs_review'`, Heartbeat יסלים לowner.

---

### החלטה 4: Fake Channel Simulator כ-first-class Gate

**נבחר:** Simulator אינו "כלי פיתוח" — הוא Gate לגיטימי בשלב 1. events שנוצרו דרכו מקבלים `gate_type = 'simulator'` אבל עוברים את **כל** אותו pipeline כמו event אמיתי.

**למה:** הבדל בין simulator לGate אמיתי בlogic = bugs שיתגלו רק בproduction. עדיף לבנות נכון מהיום הראשון: simulator = Gate עם adapter פשוט.

**מה מאפשר Simulator:**
- בחירת gate_type מדומה (whatsapp/telegram/slack/generic)
- הגדרת sender name ו-channel name
- timestamp מדומה (לבדיקת edge cases)
- batch simulation: העלאת JSON של מספר events
- שמירת "scenarios" — sets של events לreuse

---

### החלטה 5: Supabase Realtime לUI — channels per user

**נבחר:** כל משתמש subscribes לshared channels עם filter לפי user_id.

```typescript
// Escalation Inbox
supabase
  .channel('escalations')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'triage_decisions',
    filter: `user_id=eq.${userId}`
  }, handleNewEscalation)
  .subscribe()

// Heartbeat Monitor
supabase
  .channel('heartbeat')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'heartbeat_logs',
    filter: `user_id=eq.${userId}`
  }, handleHeartbeatRun)
  .subscribe()
```

**למה לא polling?** Polling מייצר load ומוסיף latency. Realtime push = instant feedback, חיוני ל-Heartbeat Monitor שצריך להראות status בזמן אמת.

---

### החלטה 6: Policy Engine — JSON Rules עם Priority Order

**נבחר:** Policy היא array of rules, מוערכות לפי סדר, first-match wins.

```typescript
type PolicyRule = {
  id: string
  priority: number          // נמוך = גבוה יותר
  condition: {
    action_type?: string[]
    severity?: string[]
    gate_type?: string[]
    entity_type?: string[]
    confidence_below?: number
  }
  decision: 'approve' | 'require_human' | 'reject'
  reason: string
}
```

**Default rule (always last, priority=9999):** `decision: 'require_human'` — אם שום rule לא תפס, שאל.

**למה first-match ולא all-match?** פשטות. owner יכול לסדר rules לפי חשיבות. אין conflicts לפתור.

## Risks / Trade-offs

**[pg_net Extension]** Supabase לא תמיד מפעיל pg_net כברירת מחדל → Mitigation: תיעוד explicit של `CREATE EXTENSION pg_net` ב-migration. fallback: Vercel Cron לבד מספיק לשלב 1.

**[Gemini Latency]** enrichment + classification = 2 Gemini calls = ~3-8s. pipeline עלול להיות איטי לevents בנפח גבוה → Mitigation: Flash model (מהיר ב~2x מPro). בשלב 1 volume נמוך — acceptable.

**[Vercel Function Timeout]** pipeline מלא = ~15-25s. Vercel Pro timeout = 60s. מספיק לשלב 1 → Mitigation: פיצול ל-sub-functions אם יידרש בעתיד. state-per-step מאפשר זאת.

**[Simulator כ-Gate]** events מ-Simulator הם "fake" אבל policy ו-audit מתייחסים אליהם כאמיתיים → Mitigation: `gate_type='simulator'` מאפשר filter ב-UI ו-policy. owner יכול לכתוב policy rule: `if gate_type=simulator → approve_all` לסביבת טסטים.

**[Supabase RLS Performance]** RLS על כל query מוסיף overhead → Mitigation: indexes על `user_id` + `processing_status` + `occurred_at` על כל טבלה קריטית.

## Migration Plan

1. `supabase db push` — deploy schema מלא
2. `supabase extensions enable pg_cron pg_net` (דרך Dashboard או migration)
3. `vercel deploy` — פריסת Next.js app
4. הפעלת pg_cron schedule דרך Supabase SQL editor
5. smoke test: שלח event דרך Simulator, ודא שמגיע ל-Inbox תוך 30s
6. אמת Heartbeat: wait 5 דקות, בדוק heartbeat_logs יש רשומה

**Rollback:** אין state לשמור. מחיקת Supabase project + Vercel deployment = נקי.

## Open Questions

1. **Gemini API key management:** Google AI Studio (חינמי עד limit) או Vertex AI (pay-per-use, enterprise)? לשלב 1: AI Studio מספיק.
2. **heartbeat interval:** 5 דקות כברירת מחדל — האם זה מהיר מספיק? לevents שנדרש בהם מענה מיידי, זה גיבוי בלבד — ה-pipeline הראשי אמור לרוץ בזמן אמת.
3. **Simulator scenarios storage:** לשמור scenarios ב-Supabase (user_scenarios table) או ב-localStorage? Supabase — ניתן לshare בין sessions.
4. **Auth בשלב 1:** Supabase Auth עם single owner user, ללא signup flow — invite-only. Magic link מספיק.

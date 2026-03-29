# TrustedClaw — מסמך זרימת מערכת וישויות

## סקירה

TrustedClaw היא פלטפורמת סוכנים תפעולית מבוססת **Cases**. המערכת צופה בערוצי תקשורת, ממירה הודעות נכנסות לאירועים מובנים, מקבצת אותם לתיקים (Cases), מסווגת חומרה וחשיבות ברמת התיק, ומחליטה אוטונומית מה דורש התערבות אנושית ומה לא.

---

## זרימה ראשית

```
הודעה נכנסת (מ-WhatsApp / Telegram / Slack / Simulator)
    │
    ▼
┌─────────────────────────────────┐
│  1. INGEST — קליטה              │
│  • זיהוי/יצירת Gate            │
│  • זיהוי/יצירת Channel         │
│  • שמירת raw_payload (בלתי משתנה)│
│  • יצירת Event עם status=pending│
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  2. NORMALIZE — נרמול           │
│  • המרה לפורמט אחיד            │
│  • sender, content, channel,    │
│    gate_type, timestamp         │
│  • status → normalized          │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  3. ENRICH — העשרה (Gemini)     │
│  • זיהוי שפה                   │
│  • חילוץ intent ו-sentiment    │
│  • חילוץ ישויות מוזכרות        │
│  • יצירת/קישור Entities        │
│  • status → enriched            │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  3.5. CASE ASSIGNMENT — שיוך לתיק│
│  • חיפוש Case פתוח לאותו Channel │
│  • אם קיים → הוספת Event לתיק  │
│  • אם לא → פתיחת Case חדש      │
│  • העלאת Entities לרמת Case     │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  4. CLASSIFY — סיווג (Gemini)    │
│  • Gemini מקבל את כל האירועים   │
│    בתיק ומסווג הוליסטית         │
│  • severity, urgency            │
│  • importance (1-10)            │
│  • escalation_level             │
│  • כותרת וסיכום מעודכנים        │
│  • suggested_status             │
│  • status → classified          │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  5. TRIAGE — החלטת טיפול         │
│                                 │
│  critical/high → ESCALATE       │
│  info + low importance → DISCARD│
│  low importance + policy OK →   │
│     AUTONOMOUS RESOLVE          │
│  ברירת מחדל → ESCALATE          │
│                                 │
│  • עדכון Case status            │
│  • status → completed           │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  6. AUDIT TRAIL                 │
│  • כל שלב מתועד                 │
│  • כל שינוי ב-Case מתועד       │
│  • append-only, בלתי ניתן למחיקה│
└─────────────────────────────────┘
```

---

## מחזור חיי Case

```
     ┌─────────┐
     │  OPEN   │ ← Case חדש נפתח
     └────┬────┘
          │ אירוע דחוף / AI מסווג
          ▼
  ┌───────────────┐
  │ ACTION_NEEDED │ ← דורש תשומת לב
  └───────┬───────┘
          │ user מתחיל לטפל
          ▼
  ┌───────────────┐
  │  IN_PROGRESS  │ ← בטיפול
  └───────┬───────┘
          │
    ┌─────┴──────┐
    ▼            ▼
┌──────────┐ ┌──────────┐
│ ADDRESSED│ │SCHEDULED │ ← עם תאריך
└────┬─────┘ └────┬─────┘
     │            │ תאריך הגיע
     ▼            ▼
  ┌─────────┐
  │ CLOSED  │ ← סגור
  └─────────┘

  בכל שלב ←→ ESCALATED (הסלמה לאנושי)
```

**Importance (1-10):** עולה כשמגיעים אירועים דחופים, יורדת כשמגיע מידע מרגיע.

**Escalation Level:** none → low → medium → high → critical. ה-Heartbeat מעלה אותו אם Case נשאר פתוח יותר מדי זמן.

---

## ישויות מערכת (Domain Model)

### Gate — שער כניסה
ממשק לערוץ חיצוני. כל Gate מייצג חיבור לפלטפורמה.

| שדה | תיאור |
|-----|-------|
| id | מזהה ייחודי |
| type | simulator / whatsapp / telegram / slack / email / webhook |
| display_name | שם תצוגה |
| status | active / inactive / error |
| user_id | בעלים |

---

### Channel — ערוץ
קבוצה/שיחה ספציפית בתוך Gate. **Case נפתח לכל Channel.**

| שדה | תיאור |
|-----|-------|
| id | מזהה |
| gate_id | שייכות ל-Gate |
| display_name | שם הערוץ |
| external_channel_id | מזהה חיצוני (מספר קבוצה וכו') |
| last_activity_at | פעילות אחרונה |

---

### Case — תיק (הישות המרכזית)
יחידת העבודה העיקרית. כל Case מכיל מספר Events ומקושר לישויות.

| שדה | תיאור |
|-----|-------|
| id | מזהה |
| title | כותרת (נוצרת ע"י AI, מתעדכנת) |
| summary | סיכום (AI) |
| status | open / action_needed / in_progress / addressed / scheduled / closed / escalated |
| importance_level | 1-10, דינמי — עולה/יורד עם כל אירוע |
| escalation_level | none / low / medium / high / critical |
| current_severity | critical / high / medium / low / info |
| current_urgency | immediate / soon / normal / low |
| event_count | מספר אירועים בתיק |
| first_event_at | זמן אירוע ראשון |
| last_event_at | זמן אירוע אחרון |
| next_action_date | תאריך יעד (ל-scheduled) |
| classification_reasoning | נימוק AI לסיווג |
| escalation_reasoning | נימוק להסלמה |
| channel_id | הערוץ שממנו נפתח |
| opened_by | system / user / heartbeat |

---

### Event — אירוע (Case Event)
הודעה בודדת שנקלטה. שייכת ל-Case.

| שדה | תיאור |
|-----|-------|
| id | מזהה |
| case_id | שייכות ל-Case |
| gate_id | שער מקור |
| channel_id | ערוץ מקור |
| raw_payload | payload מקורי (בלתי משתנה) |
| normalized_payload | payload מנורמל |
| enrichment_data | תוצאת העשרה (Gemini) |
| processing_status | pending → normalized → enriched → classified → completed |
| occurred_at | זמן קרות מקורי |
| received_at | זמן קליטה |
| retry_count | ניסיונות עיבוד חוזר |

---

### Entity — ישות
אובייקט בעולם האמיתי שמוזכר באירועים.

| שדה | תיאור |
|-----|-------|
| id | מזהה |
| type | person / company / project / invoice / bank_account / contract / product / other |
| canonical_name | שם קנוני |
| aliases | שמות חלופיים |
| auto_created | נוצר אוטומטית ע"י AI |
| gate_identifiers | מזהים לפי Gate (טלפון, username) |

---

### Case Entity — קישור Case↔Entity

| שדה | תיאור |
|-----|-------|
| case_id | שייכות ל-Case |
| entity_id | שייכות ל-Entity |
| role | primary / related / mentioned |

---

### Event Entity — קישור Event↔Entity

| שדה | תיאור |
|-----|-------|
| event_id | שייכות ל-Event |
| entity_id | שייכות ל-Entity |
| role | sender / recipient / mentioned / subject |
| confidence_score | ודאות הזיהוי (0-1) |

---

### Classification — סיווג

| שדה | תיאור |
|-----|-------|
| event_id | Event שגרם לסיווג |
| case_id | ה-Case שסווג |
| severity | critical / high / medium / low / info |
| urgency | immediate / soon / normal / low |
| importance_score | ציון חשיבות (0-100) |
| reasoning | נימוק AI |
| confidence | ודאות (0-1) |
| classified_by | agent / user |

---

### Triage Decision — החלטת טיפול

| שדה | תיאור |
|-----|-------|
| case_id | ה-Case |
| event_id | ה-Event שגרם להחלטה |
| decision | autonomous_resolve / escalate / snooze / discard |
| status | open / resolved / snoozed / dismissed / timeout_expired |
| reasoning | נימוק |
| resolved_by | agent / user / timeout |
| snoozed_until | זמן חזרה (אם snoozed) |

---

### Case History — היסטוריית שינויים

| שדה | תיאור |
|-----|-------|
| case_id | ה-Case |
| field_changed | שם השדה שהשתנה (status, importance_level, severity, escalation_level) |
| old_value | ערך ישן |
| new_value | ערך חדש |
| changed_by | agent / user / heartbeat / system |
| reasoning | נימוק |

---

### Policy — מדיניות

| שדה | תיאור |
|-----|-------|
| version | מספר גרסה |
| rules | מערך כללים (JSON) — first-match |
| is_active | האם פעילה |

כל כלל כולל: condition (severity, gate_type, confidence), decision (approve/reject/require_human), reason.

**כלל ברירת מחדל:** אם שום כלל לא תפס → require_human.

---

### Heartbeat Log — דופק מערכת

| שדה | תיאור |
|-----|-------|
| run_id | מזהה ריצה (idempotent) |
| triggered_by | pg_cron / vercel_cron / manual |
| events_checked | אירועים שנסרקו |
| events_requeued | אירועים שחזרו לתור |
| events_stuck | אירועים תקועים |
| cases_checked | תיקים שנסרקו |
| cases_escalated | תיקים שהוסלמו |
| cases_deescalated | תיקים שירדו |
| duration_ms | משך ריצה |
| status | success / partial_failure / failed |

---

### Audit Log — יומן ביקורת (append-only)

| שדה | תיאור |
|-----|-------|
| actor | agent / user / heartbeat / policy_engine / system |
| action_type | סוג פעולה (case_created, classify, triage, pipeline_complete...) |
| target_type | סוג יעד (event, case, triage_decision) |
| target_id | מזהה יעד |
| reasoning | נימוק |

**בלתי ניתן לשינוי** — trigger ברמת ה-DB חוסם UPDATE ו-DELETE.

---

## תרשים קשרים

```
Gate (1) ──────► (N) Channel
                       │
                       ▼
                 (1) Channel ──► (N) Case
                                      │
                              ┌───────┴───────┐
                              ▼               ▼
                        (N) Event      (N) Case Entity
                              │               │
                              ▼               ▼
                     (N) Event Entity    Entity (shared)
                              │
                              ▼
                         Entity (shared)

Case (1) ──► (N) Classification
Case (1) ──► (N) Triage Decision
Case (1) ──► (N) Case History
Case (1) ──► (N) Event

Event (1) ──► (N) Event Entity
Event (1) ──► (N) Classification
```

---

## Heartbeat — הדופק

רץ כל 5 דקות (pg_cron + Vercel Cron). סורק:

1. **אירועים תקועים** — pending/failed מעל 2 דקות → חוזר לpipeline
2. **אירועים קפואים** — processing מעל 10 דקות → מסמן stuck
3. **תיקים רדומים** — open/action_needed ללא פעילות 4+ שעות → מעלה escalation
4. **תיקים עם deadline** — scheduled שהזמן עבר → action_needed
5. **תזכורות** — escalations פתוחות שלא טופלו → reminded

---

## סטאק טכנולוגי

| רכיב | טכנולוגיה |
|-------|-----------|
| מסד נתונים | Supabase (PostgreSQL + Realtime + RLS + pg_cron) |
| Backend | Vercel (Next.js 14 App Router, API Routes) |
| Frontend | Next.js + Shadcn/ui, RTL Hebrew, Dark mode |
| AI | Gemini 2.5 Flash (enrichment + case classification) |
| Policy Engine | TypeScript דטרמיניסטי (ללא AI) |
| Scheduling | pg_cron + Vercel Cron (redundant) |
| Auth | Supabase Auth (magic link) |

---

*TrustedClaw v0.2 — Case-Centric Architecture*
*עדכון: 2026-03-29*

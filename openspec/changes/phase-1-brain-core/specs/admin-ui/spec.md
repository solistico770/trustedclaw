## ADDED Requirements

### Requirement: Escalation Inbox (עמוד ברירת מחדל)
ה-UI SHALL להציג Escalation Inbox כעמוד ראשי (`/`). מציג escalations פתוחות בלבד, ממוינות לפי Importance (Critical ← High ← Medium ← Low). עדכונים ב-Realtime דרך Supabase — אין צורך ב-refresh. כשאין escalations: הודעת "הכל תחת שליטה".

#### Scenario: Inbox Realtime update
- **WHEN** Heartbeat מוצא event שדורש escalation
- **THEN** EscalationCard חדש מופיע ב-Inbox תוך שניות ללא refresh, עם animation קצר

#### Scenario: EscalationCard — תוכן
- **WHEN** owner רואה EscalationCard
- **THEN** מוצגים: Gate badge (Simulator/WA/TG), Severity badge בצבע, sender name, תקציר הhodaaה (2 שורות), entities involved, זמן יצירה, 3 כפתורים: Approve / Dismiss / Snooze

#### Scenario: אישור הצעת פעולה
- **WHEN** owner לוחץ Approve
- **THEN** POST /api/escalations/[id]/resolve {decision: 'approve'}. EscalationCard נעלם. audit_log entry נוצר.

#### Scenario: Snooze
- **WHEN** owner לוחץ Snooze ובוחר משך (1h / 4h / 24h / custom)
- **THEN** escalation נעלמת מInbox. מוצגת מחדש כשהזמן עבר עם badge "Reminded".

### Requirement: Event Log (`/events`)
ה-UI SHALL לכלול Event Log המציג את כל events שנקלטו. Filters: Gate type, Severity, processing_status, date range, entity. לחיצה על event → Decision Trace מלא.

#### Scenario: Decision Trace view
- **WHEN** owner לוחץ על event ב-Event Log
- **THEN** נפתח panel עם שלבי pipeline לפי סדר: raw_payload (collapsed), normalized_payload, enrichment_data, classification (עם reasoning), triage_decision, policy_decision, execution (אם קיים). כל שלב עם timestamp ו-status badge.

#### Scenario: filter לפי processing_status
- **WHEN** owner מסנן ל-status='stuck'
- **THEN** מוצגים רק events תקועים, ממוינים לפי גיל (הישן ביותר ראשון)

### Requirement: Heartbeat Monitor (`/heartbeat`)
ה-UI SHALL לכלול Heartbeat Monitor המציג: status ריצה אחרונה (ירוק/אדום), גרף ריצות ב-24 שעות אחרונות, טבלת heartbeat_logs עם פרטים, ו-כפתור "הרץ עכשיו". Realtime updates כשריצה חדשה מסתיימת.

#### Scenario: Heartbeat Monitor — מצב תקין
- **WHEN** כל heartbeat runs בהצלחה
- **THEN** indicator ירוק "פעיל", last_run זמן + duration_ms, events_checked, events_requeued=0, events_stuck=0

#### Scenario: Heartbeat Monitor — כשל
- **WHEN** ריצה אחרונה החזירה status='failed'
- **THEN** indicator אדום "כשל", error_message מוצג, כפתור "הרץ עכשיו" בולט עם border אדום

#### Scenario: הפעלה ידנית מ-Monitor
- **WHEN** owner לוחץ "הרץ עכשיו"
- **THEN** spinner מוצג, POST /api/heartbeat נשלח, תוצאה מתעדכנת ב-UI דרך Realtime תוך שניות

### Requirement: Entity Browser (`/entities`)
ה-UI SHALL לכלול Entity Browser עם fulltext search, filter לפי type ו-gate_type, ו-timeline view.

#### Scenario: חיפוש entity
- **WHEN** owner מקליד שם ב-search
- **THEN** תוצאות מוצגות real-time (debounced 300ms), ממוינות לפי last activity

#### Scenario: Entity Timeline
- **WHEN** owner לוחץ על entity
- **THEN** מוצגים: entity details, gate identifiers, timeline של events קשורים (ממוין לפי occurred_at, עם Severity badge לכל event), open escalations

### Requirement: Simulator Panel (`/simulate`)
ה-UI SHALL לכלול Simulator Panel כדף נפרד ופאנל מוטבע. ראה specs/fake-channel-simulator/spec.md לדרישות מלאות.

#### Scenario: Simulator כעמוד עצמאי
- **WHEN** owner מנווט ל-/simulate
- **THEN** Simulator Panel מלא מוצג, כולל Saved Scenarios בצד, Batch Upload section

### Requirement: Policy Editor (`/settings/policy`)
ה-UI SHALL לכלול Policy Editor המציג את rules הנוכחיות כrule cards ממוינות לפי priority. ניתן להוסיף, לערוך, למחוק, ולשנות סדר rules. שינויים יוצרים policy version חדש.

#### Scenario: הוספת rule חדש
- **WHEN** owner לוחץ "הוסף Rule" ומגדיר condition + decision
- **THEN** rule card נוצר. preview מציג: "rule זה ישפיע על X events מהשבוע האחרון". שמירה יוצרת policy_version חדש.

#### Scenario: policy version history
- **WHEN** owner לוחץ "היסטוריה"
- **THEN** רשימת policy versions עם timestamp ו-diff בין גרסאות

### Requirement: Navigation ו-Layout
ה-UI SHALL להשתמש ב-Shadcn/ui לכל components. Sidebar navigation עם: Inbox (עם badge count), Events, Heartbeat, Entities, Simulate, Settings. Dark mode תמיכה. Hebrew RTL.

#### Scenario: Inbox badge
- **WHEN** יש 3 escalations פתוחות
- **THEN** Sidebar מציג "Inbox (3)" עם dot אדום. Realtime update כשescalation נוספת/נסגרת.

#### Scenario: RTL layout
- **WHEN** ה-UI נטען
- **THEN** כל elements ב-RTL (dir="rtl"), כולל Sidebar (ימין), tables, forms

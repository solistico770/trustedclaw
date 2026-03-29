## ADDED Requirements

### Requirement: Escalation Inbox
ה-UI SHALL להציג Escalation Inbox כעמוד ברירת המחדל. Inbox מציג רק escalations פתוחות, ממוינות לפי Importance (Critical ← High ← Medium). Inbox עדכני ב-Realtime דרך Supabase Realtime — ללא דרישת refresh.

#### Scenario: Inbox ריק
- **WHEN** אין escalations פתוחות
- **THEN** מוצגת הודעה: "הכל תחת שליטה — אין פריטים הדורשים תשומת לבך כרגע"

#### Scenario: escalation חדשה מגיעה
- **WHEN** Supabase Realtime push מגיע עם escalation חדשה
- **THEN** Inbox מתעדכן ללא refresh. escalation חדשה מסומנת ויזואלית כ-new.

#### Scenario: פריט Inbox מכיל את כל המידע הנדרש
- **WHEN** owner רואה escalation ב-Inbox
- **THEN** מוצגים: תקציר ב-2 שורות, entities involved עם badges, Gate source icon, זמן, Severity badge, proposed action, 3 כפתורי action ראשיים

### Requirement: Escalation Detail View
לחיצה על escalation SHALL לפתוח detail view עם: הודעה מלאה, thread history (3 events אחרונים), entity cards, classification reasoning, proposal עם confidence, history של decisions.

#### Scenario: צפייה בthread history בevent
- **WHEN** owner פותח escalation של event ב-thread קיים
- **THEN** 3 events קודמים מה-thread מוצגים עם timestamps וentities

#### Scenario: צפייה ב-classification reasoning
- **WHEN** owner לוחץ "למה זה חשוב?"
- **THEN** מוצג reasoning מGemini: "הודעה זו מ-[Entity] מציינת deadline ב-[תאריך] הקשור ל-[Project]. Severity=High מכיוון ש..."

### Requirement: Entity Browser
ה-UI SHALL לכלול Entity Browser — ממשק חיפוש וגלישה בין entities עם fulltext search, filter לפי type/gate, ו-timeline view לכל entity.

#### Scenario: חיפוש entity וצפייה ב-timeline
- **WHEN** owner מחפש entity ולוחץ עליה
- **THEN** מוצגים: entity details, gate identifiers, timeline של כל events קשורים (ממוין לפי תאריך), open escalations קשורות

### Requirement: Event Log
ה-UI SHALL לכלול Event Log — רשימה מלאה של כל events שנקלטו עם filter לפי Gate, Severity, Entity, Date range. לכל event — decision trace מלא.

#### Scenario: צפייה ב-decision trace של event
- **WHEN** owner לוחץ על event ב-Event Log
- **THEN** מוצג: raw (collapsed), normalized, enrichment results, classification, triage decision, policy decision, execution (אם קיים), כל שלב עם timestamp

### Requirement: Settings — Gate Management
ה-UI SHALL לכלול Settings עמוד לניהול Gates: הוספה, הסרה, בדיקת status, הצגת last_connected_at.

#### Scenario: חיבור Gate חדש
- **WHEN** owner לוחץ "הוסף Gate" ובוחר WhatsApp
- **THEN** מוצגות הוראות: scan QR code ב-EC2 interface, לאחר scan מוצלח Gate status=active

### Requirement: Settings — Policy Editor
ה-UI SHALL לכלול Policy Editor שמציג את ה-policy הנוכחית ומאפשר עריכה. שינויים יוצרים version חדש. editor מציג preview של אילו actions היו approved/rejected לפי policy.

#### Scenario: עדכון policy ו-version preview
- **WHEN** owner מעדכן rule ב-Policy Editor
- **THEN** לפני שמירה מוצג: "לפי הpolicy החדשה, X actions שהיו require_approval יהפכו לauto_approve"

### Requirement: Realtime Updates
כל עמודי ה-UI SHALL לקבל updates דרך Supabase Realtime — ללא polling. event status changes, escalation resolutions, execution completions — כולם pushed.

#### Scenario: execution הושלם בזמן שowner ב-UI
- **WHEN** Execution Layer מסיים action בזמן שowner פתוח ב-Event Log
- **THEN** event status מתעדכן בUI בלי refresh

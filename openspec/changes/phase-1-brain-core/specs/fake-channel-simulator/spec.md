## ADDED Requirements

### Requirement: Simulator as First-Class Gate
ה-Simulator SHALL ליצור events אמיתיים שעוברים את **כל** אותו pipeline כמו event מGate אמיתי. אין קוד pipeline מיוחד לSimulator — ההבדל היחיד הוא `gate_type='simulator'`.

#### Scenario: שליחת event סינתטי
- **WHEN** owner ממלא Simulator panel ולוחץ Send
- **THEN** POST /api/simulate נשלח. event נוצר עם gate_type='simulator', raw_payload={gate_type, sender_name, channel_name, content, simulated_timestamp}. pipeline מופעל. event_id מוחזר.

#### Scenario: event מ-Simulator מופיע ב-Event Log
- **WHEN** event סינתטי עובר pipeline
- **THEN** Event Log מציג אותו עם badge "Simulator" וכל שלבי ה-pipeline גלויים

### Requirement: Simulator Panel UI
ה-Admin UI SHALL לכלול Simulator Panel עם שדות: gate_type (dropdown: whatsapp/telegram/slack/generic), sender_name (text), channel_name (text), message_content (textarea), simulated_timestamp (datetime, ברירת מחדל: now). כפתור Send ו-כפתור Reset.

#### Scenario: שדות חובה
- **WHEN** owner מנסה לשלוח ללא message_content
- **THEN** validation error מוצג. שום event לא נוצר.

#### Scenario: feedback לאחר שליחה
- **WHEN** event סינתטי נשלח בהצלחה
- **THEN** Panel מציג: "Event נשלח ✓ — עוקב אחרי pipeline..." עם link לEvent Log של ה-event שנוצר. Realtime updates מציגים את התקדמות ה-pipeline.

### Requirement: Scenario Management
Owner SHALL יכול לשמור "scenarios" — templates של events לreuse. Scenarios נשמרות ב-Supabase (לא localStorage) לזמינות בין sessions.

#### Scenario: שמירת scenario
- **WHEN** owner לוחץ "שמור כ-Scenario" אחרי מילוי Panel
- **THEN** scenario נשמר עם name שהוזן, gate_type, sender_name, channel_name, content_template. מופיע ב-Saved Scenarios list.

#### Scenario: טעינת scenario שמור
- **WHEN** owner בוחר scenario מהרשימה
- **THEN** Panel מתמלא בערכי ה-scenario. owner יכול לערוך לפני שליחה.

### Requirement: Batch Simulation
Owner SHALL יכול להעלות JSON array של מספר events לריצה ברצף. שימושי לסימולציה של "יום עמוס" ובדיקת behavior ב-load.

#### Scenario: העלאת batch של events
- **WHEN** owner מעלה קובץ JSON עם array של event objects
- **THEN** כל event נשלח ב-sequential POST /api/simulate עם delay של 500ms ביניהם. Progress bar מציג כמה events עובדו. כל event_id מוצג ב-results list.

#### Scenario: event שגוי ב-batch
- **WHEN** אחד מה-events ב-batch חסר שדות חובה
- **THEN** אותו event נדלג עם error message. שאר ה-batch ממשיך.

### Requirement: Simulator Policy Rule
Owner SHALL יכול להגדיר policy rule שמאשר אוטונומית **את כל** events מגate_type='simulator', לצורך טסטים ללא התערבות ידנית.

#### Scenario: Policy rule לSimulator
- **WHEN** policy מכילה rule: {condition: {gate_type: ['simulator']}, decision: 'approve'}
- **THEN** כל events מ-Simulator מאושרים אוטונומית. owner לא מוסלם. שימושי לאימון בלי להפריע ל-Inbox האמיתי.

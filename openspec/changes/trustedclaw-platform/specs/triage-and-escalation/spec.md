## ADDED Requirements

### Requirement: Autonomous Triage Decision
המערכת SHALL להחליט אוטונומית על resolution path לכל event: autonomous_resolve, escalate, snooze, או discard. ההחלטה מתבססת על Importance score, Policy, ו-Gemini reasoning.

#### Scenario: event בעדיפות נמוכה — פתרון אוטונומי
- **WHEN** event מסווג Severity=Low, Urgency=Low, ואין policy rule המחייב escalation
- **THEN** triage_decision=autonomous_resolve. agent action מוצע ועובר לPolicy Engine.

#### Scenario: event בעדיפות גבוהה — escalation
- **WHEN** event מסווג Severity=High או Critical, או Importance score > threshold שהוגדר ב-policy
- **THEN** triage_decision=escalate. escalation נשמרת ו-Supabase Realtime מעדכן UI.

#### Scenario: event לא רלוונטי — discard
- **WHEN** Gemini מסווג event כspam, bot, או irrelevant עם confidence > 0.95
- **THEN** triage_decision=discard. event נשמר עם resolution=discarded. ללא escalation.

#### Scenario: event ממתין למידע נוסף — snooze
- **WHEN** event דורש מידע שעדיין לא קיים (תשובה ממישהו אחר, deadline בעוד X ימים)
- **THEN** triage_decision=snooze עם wake_at timestamp. event מוסלם שוב כשמגיע הזמן.

### Requirement: Escalation Presentation
כל escalation SHALL להציג לowner: מה קרה, מדוע זה חשוב (reasoning), הישויות הקשורות, ההיסטוריה הרלוונטית, והפעולה המוצעת. escalation חייבת להיות self-contained — owner לא SHALL להצטרך לחפש הקשר.

#### Scenario: escalation מוצגת עם הקשר מלא
- **WHEN** escalation מגיעה ל-Inbox
- **THEN** מוצגים: תקציר event, entities involved עם timeline snippet, classification reasoning, proposed action עם risk level, כפתורי Approve/Dismiss/Snooze/Edit

#### Scenario: escalation ב-thread עם היסטוריה
- **WHEN** event שייך לthread עם היסטוריה
- **THEN** 3 events אחרונים מ-thread מוצגים כhref לצד escalation

### Requirement: Owner Resolution Actions
Owner SHALL יכול לבצע את הפעולות הבאות על כל escalation: Approve (מאשר proposed action), Dismiss (מסמן כ-handled ידנית), Snooze (דחיה לזמן מוגדר), Edit (שינוי proposed action לפני אישור).

#### Scenario: אישור proposed action
- **WHEN** owner לוחץ Approve
- **THEN** action עובר לPolicy Engine לvalidation סופי ואז לExecution Layer. escalation נסגרת.

#### Scenario: Dismiss escalation
- **WHEN** owner לוחץ Dismiss עם סיבה אופציונלית
- **THEN** triage_decision מסומן כ-resolved_by_user, סיבה נשמרת ב-audit. escalation נסגרת.

#### Scenario: Snooze escalation
- **WHEN** owner מגדיר snooze ל-3 שעות
- **THEN** escalation נעלמת מה-Inbox ומוצגת מחדש בזמן המוגדר עם reminder flag

### Requirement: Escalation Rate as KPI
המערכת SHALL לתעד את שיעור ה-autonomous resolution לאורך זמן. Target: ≥80% autonomous. שיעור escalation גבוה מ-40% לאורך 7 ימים SHALL להצביע על בעיה בPolicy או בclassification.

#### Scenario: חישוב autonomous resolution rate
- **WHEN** owner מבקש dashboard stats
- **THEN** מוצג: אחוז events שנפתרו אוטונומית, אחוז escalations, breakdown לפי Gate ולפי Severity

### Requirement: Zero Missed Criticals
שום event עם Severity=Critical לא SHALL להגיע לresolution=discarded ללא ידיעת owner. כל Critical event SHALL להסליים גם אם triage decision אחרת.

#### Scenario: Critical event לא יכול להיות discarded אוטונומית
- **WHEN** event מסווג Severity=Critical
- **THEN** triage_decision=escalate ללא קשר לשאר הפרמטרים. לא ניתן לoverride בpolicy.

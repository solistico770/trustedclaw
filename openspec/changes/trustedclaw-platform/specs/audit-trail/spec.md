## ADDED Requirements

### Requirement: Append-Only Audit Log
המערכת SHALL לשמור audit_log append-only לחלוטין. אין update, אין delete. כל פעולה של הסוכן, כל decision, כל ביצוע — מתועדים עם timestamp, actor, reasoning.

#### Scenario: תיעוד autonomous resolution
- **WHEN** הסוכן פותר event אוטונומית
- **THEN** audit_log entry נוצר עם: actor=agent, action_type=autonomous_resolve, event_id, policy_decision_id, reasoning, timestamp

#### Scenario: תיעוד החלטת owner
- **WHEN** owner מאשר או דוחה escalation
- **THEN** audit_log entry עם actor=user, action_type=approve/dismiss, escalation_id, reason (אם סופק), timestamp

### Requirement: Decision Trace per Event
כל event SHALL להיות בעל decision trace מלא — שרשרת של כל ה-records שנוצרו ממנו: raw → normalized → enrichment → classification → triage → policy → execution.

#### Scenario: שחזור decision trace
- **WHEN** owner מבקש trace של event_id ספציפי
- **THEN** מוחזרת שרשרת מלאה: כל record רלוונטי לפי סדר כרונולוגי, עם diff בין שלבים

### Requirement: Audit Log Immutability
audit_log records SHALL להיות protected ב-database level. RLS policy SHALL לאפשר INSERT בלבד — אין UPDATE, אין DELETE גם לservice role. כל ניסיון לשנות record קיים SHALL להיכשל ולהתועד.

#### Scenario: ניסיון שינוי audit record
- **WHEN** כל קריאה (מכל actor) שמנסה לעדכן audit_log record
- **THEN** database מחזיר error. incident נרשם בנפרד. escalation critical לowner.

### Requirement: Audit Log Search and Export
Owner SHALL יכול לחפש audit_log לפי: event_id, actor, action_type, date range. ולייצא תוצאות כ-JSON.

#### Scenario: חיפוש כל פעולות הסוכן ביום נתון
- **WHEN** owner מחפש audit_log לפי actor=agent ו-date=2026-03-29
- **THEN** מוחזרת רשימת כל הפעולות האוטונומיות של הסוכן באותו יום

#### Scenario: ייצוא audit log
- **WHEN** owner מבקש export
- **THEN** מוחזר JSON array של כל records בטווח הזמן שנבחר

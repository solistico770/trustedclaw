## ADDED Requirements

### Requirement: Append-Only Audit Log
`audit_logs` table SHALL להיות append-only ב-database level. RLS policy SHALL לאפשר INSERT בלבד — אפילו service role לא יכול לבצע UPDATE או DELETE. כל ניסיון שינוי SHALL להיכשל עם DB error.

#### Scenario: INSERT מוצלח
- **WHEN** pipeline רושם decision דרך logAudit()
- **THEN** audit_log record נוצר עם: id, user_id, actor ('agent'|'user'|'heartbeat'|'policy_engine'), action_type, target_type, target_id, reasoning, created_at

#### Scenario: ניסיון UPDATE על audit_log
- **WHEN** כל קוד מנסה לעדכן audit_log record קיים
- **THEN** Postgres מחזיר permission denied. incident נרשם בנפרד. escalation critical לowner.

### Requirement: Decision Trace API
המערכת SHALL לחשוף GET /api/audit/trace/[event_id] שמחזיר שרשרת מלאה של כל records הקשורים לevent: raw → normalized → enrichment → classification → triage → policy → execution.

#### Scenario: trace מלא לevent
- **WHEN** GET /api/audit/trace/[event_id]
- **THEN** מוחזר JSON עם ordered array של steps, כל step עם: step_type, timestamp, actor, data (summary), status

#### Scenario: trace לevent חלקי (pipeline לא הסתיים)
- **WHEN** event תקוע ב-enrichment
- **THEN** trace מציג שלבים עד enrichment_failed, עם flag 'pipeline_incomplete'

### Requirement: logAudit Helper
כל נקודת החלטה ב-pipeline SHALL לקרוא ל-`logAudit()` function. זהו contract — לא optional. PR שמוסיף decision point ללא logAudit נחשב incomplete.

#### Scenario: logAudit נקרא בכל שלב pipeline
- **WHEN** כל אחד מהשלבים מסתיים (normalization, enrichment, classification, triage, policy_decision, execution)
- **THEN** audit_log entry נוצר עם actor='agent', action_type=שם השלב, target_id=event_id, reasoning=תוצאת השלב

### Requirement: Audit Search and Export
Owner SHALL יכול לחפש audit_logs לפי actor, action_type, target_id, date range. ולייצא תוצאות כ-JSON.

#### Scenario: חיפוש פעולות heartbeat
- **WHEN** owner מחפש actor='heartbeat' ב-date range
- **THEN** מוחזרות כל פעולות ה-heartbeat: events שrequeued, events שהועברו לstuck, escalation reminders

#### Scenario: ייצוא audit log
- **WHEN** owner לוחץ Export בטווח זמן נבחר
- **THEN** JSON file מורד עם כל records בטווח. ללא pagination — הכל בפעם אחת עד 10,000 records.

## ADDED Requirements

### Requirement: Execution Only After Policy Approval
Execution Layer SHALL לבצע פעולות רק לאחר קבלת policy_decision=approve. אין bypass. כל ניסיון לבצע פעולה ללא approved policy_decision SHALL להיכשל ולהתועד.

#### Scenario: ביצוע פעולה מאושרת
- **WHEN** agent_action עם status=approved מגיע ל-Execution Layer
- **THEN** פעולה מבוצעת דרך הGate המתאים, תוצאה נשמרת ב-executions, action.status=executed

#### Scenario: ניסיון ביצוע ללא אישור
- **WHEN** קריאה ל-Execution Layer עם action שאין לו approved policy_decision
- **THEN** ביצוע נחסם, audit_log entry עם severity=critical, escalation לowner

### Requirement: Execution Result Capture
כל ביצוע SHALL לתעד: timestamp, gate_id, payload_sent, response_received, status (success/failure/partial).

#### Scenario: ביצוע מוצלח
- **WHEN** שליחת הודעה ל-WhatsApp מצליחה
- **THEN** executions record נשמר עם status=success, response_payload (delivery receipt)

#### Scenario: ביצוע נכשל
- **WHEN** EC2 מחזיר שגיאה (rate limit, disconnected, timeout)
- **THEN** executions record עם status=failure, error_details. event חדש מסוג execution_failure נוצר לטיפול. לא מנסה שוב אוטונומית — דורש retry decision מexplicit.

### Requirement: Idempotent Execution
המערכת SHALL למנוע ביצוע כפול של אותה פעולה. כל action_id SHALL להתבצע פעם אחת בלבד.

#### Scenario: ניסיון כפול לאותה פעולה
- **WHEN** Execution Layer מקבל action_id שכבר executed
- **THEN** ביצוע מבוטל, audit_log מציין duplicate_prevented, תוצאת הביצוע הראשון מוחזרת

### Requirement: Gate-specific Execution Adapters
כל Gate type SHALL להיות ממומש עם execution adapter ייעודי. adapter אחראי על: formatting payload לפורמט Gate-specific, rate limiting, error handling.

#### Scenario: שליחת הודעה ל-Telegram
- **WHEN** action מסוג send_message עם gate_type=telegram מאושר
- **THEN** Telegram adapter מפרמט לBot API format, שולח, ומחזיר message_id

#### Scenario: rate limit ב-Gate
- **WHEN** Gate מחזיר rate_limit_exceeded error
- **THEN** execution נדחה ל-next available slot. owner לא מוסלם אלא אם delay > policy.max_execution_delay

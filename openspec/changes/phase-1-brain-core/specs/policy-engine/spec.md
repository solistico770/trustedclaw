## ADDED Requirements

### Requirement: Deterministic Rule Evaluation
Policy Engine SHALL להיות דטרמיניסטי לחלוטין — rule matching בקוד TypeScript, ללא LLM. אותם inputs SHALL לתמיד לייצר אותו output. Policy SHALL להיות testable עם unit tests בלי mock.

#### Scenario: first-match rule evaluation
- **WHEN** agent_action מועבר לPolicy Engine
- **THEN** rules מוערכות לפי priority (ascending). הrule הראשון שתנאיו מתקיימים מכתיב את ה-decision. שאר הrules לא מוערכים.

#### Scenario: default rule כשאין התאמה
- **WHEN** אין שום rule שתנאיו מתקיימים
- **THEN** decision='require_human'. זה תמיד ה-last rule (priority=9999). לא ניתן למחוק אותו.

### Requirement: Rule Conditions
כל rule SHALL לתמוך בתנאים: action_type[], severity[], urgency[], gate_type[], entity_type[], confidence_below (מספר), combined עם AND logic.

#### Scenario: rule עם מספר תנאים
- **WHEN** rule מוגדר עם {action_type: ['send_message'], severity: ['low', 'info'], gate_type: ['simulator']}
- **THEN** rule מתאים רק לactions שעומדים בכל 3 התנאים בו-זמנית

#### Scenario: rule עם confidence_below
- **WHEN** rule מוגדר עם {confidence_below: 0.8}
- **THEN** rule מתאים לactions שה-confidence_score שלהם < 0.8

### Requirement: Policy Decisions Logging
כל policy evaluation SHALL ליצור policy_decisions record — גם כשה-decision הוא 'approve'. אין evaluation שלא מתועדת.

#### Scenario: logging של approve
- **WHEN** Policy Engine מאשר action אוטונומית
- **THEN** policy_decisions record נשמר: {agent_action_id, policy_version, decision='approve', matched_rule_id, evaluated_at}

#### Scenario: logging של require_human
- **WHEN** Policy Engine דורש אישור אנושי
- **THEN** policy_decisions record נשמר עם decision='require_human'. escalation נוצרת מ-triage_decision הקשורה.

### Requirement: Policy Versioning
כל שמירת policy SHALL ליצור version חדש עם timestamp. כל policy_decision מקושר לversion שהיה פעיל בזמן ה-evaluation.

#### Scenario: שינוי policy
- **WHEN** owner שומר policy מעודכנת
- **THEN** policy_version record חדש נוצר. policy_id ב-user settings מצביע לversion החדש. versions ישנים נשמרים לaudit.

### Requirement: Policy Violation Alert
אם אותו rule type נחסם 3+ פעמים ביממה, המערכת SHALL לשלוח escalation חד-פעמית לowner: "הסוכן ניסה שוב ושוב לבצע X — האם לעדכן policy?"

#### Scenario: pattern של חסימות
- **WHEN** Heartbeat מזהה 3+ policy_decisions עם decision='reject' על אותו action_type בתוך 24 שעות
- **THEN** escalation חד-פעמית לowner עם הצעה לעדכן policy rule

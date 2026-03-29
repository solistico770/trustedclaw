## ADDED Requirements

### Requirement: Deterministic Policy Evaluation
Policy Engine SHALL להיות דטרמיניסטי לחלוטין — rule matching בקוד, ללא LLM. אותם inputs SHALL לתמיד לייצר אותו output. Policy SHALL להיות testable עם unit tests.

#### Scenario: פעולה מאושרת ב-policy
- **WHEN** Policy Engine מקבל action proposal עם action_type=send_message, risk_level=low, ו-policy.auto_reply_enabled=true
- **THEN** decision=approve, matched_rule מצוין, policy_decision record נשמר

#### Scenario: פעולה דורשת אישור אנושי
- **WHEN** action proposal עם risk_level=high או action_type נכלל ב-policy.requires_approval_types
- **THEN** decision=require_human, escalation נוצרת. ביצוע מושהה עד לאישור.

#### Scenario: פעולה נדחית ב-policy
- **WHEN** action proposal עם action_type שנמצא ב-policy.blocked_action_types
- **THEN** decision=reject, action.status=rejected, audit_log entry נשמר, ללא escalation

### Requirement: Policy Structure
Policy SHALL להיות structured JSON עם sections: auto_approve_rules, require_approval_rules, blocked_rules, spending_limit, escalation_thresholds.

#### Scenario: policy עם spending limit
- **WHEN** action proposal כולל estimated_cost > policy.spending_limit
- **THEN** decision=require_human ללא קשר לשאר הrules

#### Scenario: policy ריקה — conservative default
- **WHEN** owner לא הגדיר policy, או action_type לא מכוסה בשום rule
- **THEN** default_decision=require_human (לא approve, לא reject). "אם לא כתוב — שאל."

### Requirement: Policy Versioning
כל שינוי ב-policy SHALL ליצור version חדש. policy_decision records SHALL לכלול policy_version שהופעלה. ניתן לצפות ב-policy history.

#### Scenario: שינוי policy ו-traceability
- **WHEN** owner מעדכן policy
- **THEN** version חדש נוצר עם timestamp ו-changed_by. policy קודמת נשמרת. כל policy_decisions עתידיות מקושרות לversion החדש.

### Requirement: Policy Timeout Behavior
אם owner לא מגיב ל-require_human escalation תוך timeout מוגדר ב-policy (default: 24 שעות), המערכת SHALL לסיים את הפעולה ב-no-op — לא לבצע אוטונומית.

#### Scenario: timeout על pending approval
- **WHEN** action ממתין לאישור ו-approval_deadline עבר
- **THEN** action.status=timeout_expired. audit_log מתעד. event נשמר כ-unresolved לבדיקה עתידית של owner.

### Requirement: Policy Violation Logging
כל מקרה שבו action proposal מנסה לבצע פעולה שנחסמת ב-policy SHALL להתועד ב-audit_log עם פרטים מלאים. פגיעה חוזרת באותו rule SHALL להסליים לowner.

#### Scenario: פגיעה חוזרת באותו policy rule
- **WHEN** אותו rule נחסם 3+ פעמים ביום
- **THEN** escalation לowner: "שים לב — הסוכן ניסה לבצע X שוב ושוב אבל policy חוסמת. האם לעדכן את הpolicy?"

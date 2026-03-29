## ADDED Requirements

### Requirement: Event Ingestion
המערכת SHALL לקבל events דרך `POST /api/events/ingest`. כל event שמגיע SHALL להישמר כ-raw_payload בלתי-משתנה **לפני** כל עיבוד. ה-endpoint SHALL להחזיר תגובה תוך 500ms — שמירת ה-raw היא סינכרונית, שאר ה-pipeline אסינכרוני.

#### Scenario: קליטת event חדש
- **WHEN** POST /api/events/ingest מגיע עם gate_type, sender, channel, content, timestamp
- **THEN** raw_payload נשמר ב-events table עם processing_status='pending', returned event_id תוך 500ms, processing מתחיל ב-background

#### Scenario: event עם payload לא תקין
- **WHEN** request חסר שדות חובה (gate_type, content)
- **THEN** 400 מוחזר, שום דבר לא נשמר ב-DB

#### Scenario: DB לא זמין בעת קליטה
- **WHEN** Supabase לא מגיב בעת שמירת raw_payload
- **THEN** 503 מוחזר ל-caller. ה-event לא "קיים" במערכת — caller אחראי לretry.

### Requirement: Normalization Step
לאחר שמירת raw_payload, המערכת SHALL לנרמל את ה-event לפורמט אחיד ללא תלות ב-gate_type. תוצאת normalization נשמרת ב-`normalized_payload`, ו-`processing_status` מתעדכן ל-`'normalized'`.

#### Scenario: normalization מוצלח
- **WHEN** raw_payload מ-gate_type='whatsapp' מעובד
- **THEN** normalized_payload מכיל: sender_id, sender_name, content_text, content_type, channel_id, channel_name, occurred_at — בלי מבנה WhatsApp-ספציפי. processing_status='normalized'.

#### Scenario: normalization נכשל
- **WHEN** raw_payload אינו ניתן לניתוח (פורמט בלתי צפוי)
- **THEN** processing_status='normalization_failed'. event ממשיך לHeartbeat לטיפול — לא נחסם.

### Requirement: Enrichment Step (Gemini Flash)
לאחר normalization, המערכת SHALL לשלוח את ה-content ל-Gemini Flash עם responseSchema מוגדר. תוצאת enrichment נשמרת ב-`enrichment_data`. timeout: 10 שניות.

#### Scenario: enrichment מוצלח עם schema תקין
- **WHEN** Gemini Flash מחזיר JSON שעומד ב-responseSchema
- **THEN** enrichment_data נשמר עם: detected_language, intent_tags[], sentiment, mentioned_entities[]. processing_status='enriched'.

#### Scenario: Gemini timeout או schema violation
- **WHEN** Gemini לא מגיב תוך 10s, או מחזיר JSON שלא עומד ב-schema
- **THEN** processing_status='enrichment_failed'. pipeline ממשיך לclassification עם `confidence_reduced=true`. לא blocker.

### Requirement: Entity Extraction and Linking
המערכת SHALL לחלץ entities מ-enrichment_data, לנסות להתאים לישויות קיימות, וליצור חדשות במידת הצורך. כל entity_link נשמר ב-`event_entities`. confidence < 0.7 → לא מקשר אוטונומית.

#### Scenario: entity ידועה מזוהה בconfidence גבוה
- **WHEN** mentioned_entity עם confidence ≥ 0.7 מתאימה לentity קיימת לפי שם + gate_type
- **THEN** event_entities record נוצר עם entity_id, role='mentioned', confidence_score

#### Scenario: entity חדשה
- **WHEN** mentioned_entity לא מתאימה לאף entity קיימת
- **THEN** entity חדשה נוצרת עם auto_created=true, canonical_name, type מ-enrichment. event_entities record מקשר ביניהם.

#### Scenario: entity עם confidence נמוך
- **WHEN** confidence < 0.7
- **THEN** entity_link לא נוצר אוטונומית. enrichment_data שומר את ה-entity המוצעת עם flag `requires_human_link=true`.

### Requirement: Classification Step (Gemini Flash)
המערכת SHALL לסווג כל event עם Severity, Urgency, ו-reasoning דרך Gemini Flash עם responseSchema. תוצאה נשמרת ב-`classifications`. Importance_score = f(severity, urgency, policy_weights).

#### Scenario: classification מוצלח
- **WHEN** Gemini מחזיר classification תקינה
- **THEN** classifications record נשמר עם severity, urgency, reasoning, confidence. Importance_score מחושב דטרמיניסטית. processing_status='classified'.

#### Scenario: classification בתנאי enrichment כושל
- **WHEN** enrichment_failed=true והמערכת מגיעה לclassification
- **THEN** Gemini מקבל רק את normalized_payload (ללא enrichment). classification ממשיכה עם confidence מופחת. reasoning כולל "enrichment unavailable".

#### Scenario: default classification בכשל מוחלט
- **WHEN** גם classification כושלת (Gemini כשל שוב)
- **THEN** default: severity='medium', urgency='normal', reasoning='auto-classification failed — default applied'. triage_decision=escalate. לא autonomous-resolve.

### Requirement: Triage Decision
המערכת SHALL לקבל triage decision לכל event מסווג: `autonomous_resolve`, `escalate`, `snooze`, `discard`. ה-decision מבוסס על Importance_score, policy, ו-heuristics מובנות.

#### Scenario: Low importance → autonomous resolve
- **WHEN** Importance_score < policy.autonomous_threshold וסוג הevent מאושר לautonomous בpolicy
- **THEN** triage_decision='autonomous_resolve'. agent_action נוצר ועובר לPolicy Engine.

#### Scenario: Severity=Critical → תמיד escalate
- **WHEN** severity='critical' ללא קשר לשאר הפרמטרים
- **THEN** triage_decision='escalate'. לא ניתן לoverride בpolicy. escalation נשמרת מיד.

#### Scenario: Unclassified → escalate
- **WHEN** processing_status כולל כל _failed flag
- **THEN** triage_decision='escalate' עם reasoning: "pipeline had failures — requires human review"

### Requirement: State Persistence Between Steps
כל שלב ב-pipeline SHALL לשמור את תוצאתו ל-Supabase לפני מעבר לשלב הבא. ה-pipeline SHALL להיות resumable — Heartbeat יכול לזהות את השלב האחרון שנשמר ולהמשיך משם.

#### Scenario: pipeline נקטע באמצע enrichment
- **WHEN** Vercel function מסתיים unexpectedly אחרי normalization אבל לפני enrichment
- **THEN** event נמצא עם processing_status='normalized'. Heartbeat מזהה אותו ומריץ מ-enrichment step.

#### Scenario: pipeline מושלם end-to-end
- **WHEN** כל השלבים עוברים בהצלחה
- **THEN** processing_status='completed', triage_decision קיים, audit_log entry נוצר

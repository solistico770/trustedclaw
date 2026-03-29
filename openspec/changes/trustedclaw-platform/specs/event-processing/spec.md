## ADDED Requirements

### Requirement: Asynchronous Processing Pipeline
עיבוד events SHALL להתבצע אסינכרונית — raw event נשמר סינכרונית, שאר ה-pipeline ברקע. כישלון בשלב pipeline אחד לא SHALL לגרום לאיבוד event.

#### Scenario: pipeline מתחיל לאחר שמירת raw event
- **WHEN** raw event נשמר ב-Supabase
- **THEN** processing job מוכנס לqueue. response ל-EC2 מוחזר מיד. processing מתרחש ב-background.

#### Scenario: כישלון בשלב enrichment
- **WHEN** Gemini API לא מגיב תוך 10 שניות
- **THEN** event מקבל processing_status=enrichment_failed. default classification מוגדר (Severity=Medium, Urgency=Normal). triage מחליט להסליים — לא לפתור אוטונומית.

### Requirement: Semantic Enrichment
המערכת SHALL להעשיר כל normalized event בנתונים סמנטיים: שפת הודעה, intent, טון, entities מוזכרות — דרך Gemini עם structured output schema.

#### Scenario: enrichment מוצלח
- **WHEN** normalized event נשלח ל-Gemini לenrichment
- **THEN** response כולל: detected_language, intent_tags[], sentiment, mentioned_entities[] (שם + type + confidence). כל שדה עובר JSON schema validation לפני שמירה.

#### Scenario: Gemini מחזיר output לא תקין
- **WHEN** Gemini response אינו עומד ב-JSON schema
- **THEN** enrichment_failed, fallback לnormalized payload בלבד. event ממשיך לclassification עם reduced confidence.

### Requirement: Entity Extraction and Linking
המערכת SHALL לחלץ entities מאירועים ולקשרן לישויות קיימות. confidence < 0.8 SHALL לגרור escalation לאישור במקום auto-link.

#### Scenario: entity מוכרת מזוהה
- **WHEN** enrichment מחלץ entity עם confidence ≥ 0.8 שמתאימה לישות קיימת
- **THEN** event_entities record נוצר עם entity_id, role, confidence_score

#### Scenario: entity חדשה מזוהה
- **WHEN** entity מחולצת שאין לה התאמה בentities table
- **THEN** entity חדשה נוצרת אוטונומית עם type_inferred, canonical_name, ו-confidence score. entity מסומנת כ-auto_created=true לאישור עתידי.

#### Scenario: entity עם confidence נמוך
- **WHEN** entity מחולצת עם confidence < 0.8
- **THEN** event מוסלם לowner עם הצגת entity candidates — לא נוצר קישור אוטונומי

### Requirement: Severity Classification
המערכת SHALL לסווג כל event עם Severity מתוך: Critical, High, Medium, Low, Informational. כל classification SHALL לכלול reasoning בשפה טבעית.

#### Scenario: classification מוצלח
- **WHEN** enriched event נשלח ל-Gemini לclassification
- **THEN** response כולל: severity, urgency, reasoning (string). נשמר ב-classifications table עם classified_at.

#### Scenario: override ידני על-ידי owner
- **WHEN** owner משנה severity של event ידנית
- **THEN** classification חדשה נוצרת עם classified_by=user. ה-classification הקודמת נשמרת. המערכת לומדת pattern לfuture events.

### Requirement: Thread Continuity
המערכת SHALL לזהות ולשמר שייכות events לathread. event חדש באותה שיחה SHALL להיות מקושר לthread קיים.

#### Scenario: event שייך לthread קיים
- **WHEN** event מגיע מאותו channel_id עם temporal proximity ו-entity overlap לthread קיים
- **THEN** event.thread_id מוגדר ל-thread הקיים

#### Scenario: thread חדש מתחיל
- **WHEN** event מגיע שלא מתאים לשום thread קיים
- **THEN** thread חדש נוצר עם subject_inferred מ-Gemini

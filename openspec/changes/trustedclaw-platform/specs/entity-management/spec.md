## ADDED Requirements

### Requirement: Entity Types
המערכת SHALL לתמוך בסוגי ישויות: person, company, group, bank_account, invoice, project, contract, product, policy, thread. סוג ישות SHALL לקבוע אילו metadata fields רלוונטיים.

#### Scenario: יצירת entity מסוג person
- **WHEN** entity חדשה מסוג person נוצרת
- **THEN** נשמרים: canonical_name, aliases[], phone_numbers[], email_addresses[], gate_identifiers (WhatsApp JID, Telegram ID, וכו')

#### Scenario: יצירת entity לא-ידועה
- **WHEN** entity מחולצת מevent עם type לא מוכר
- **THEN** entity נוצרת עם type=unknown ו-raw_attributes. owner יכול לסווג ידנית.

### Requirement: Entity Timeline
כל entity SHALL להחזיק timeline מלא של כל events שקשורים אליה, לפי סדר כרונולוגי.

#### Scenario: צפייה ב-timeline של entity
- **WHEN** owner מבקש timeline של entity
- **THEN** מוצגים כל events שקשורים לentity, ממוינים לפי occurred_at, עם classification ו-resolution status לכל event

### Requirement: Entity Merge
Owner SHALL יכול למזג שתי ישויות שמייצגות את אותו אובייקט בעולם האמיתי. מיזוג הוא פעולה שניתן לבטל (soft merge עם history).

#### Scenario: מיזוג שתי entities
- **WHEN** owner מאשר מיזוג entity A לתוך entity B
- **THEN** כל event_entities records של A מעודכנים ל-entity B. entity A מסומנת כ-merged_into=B. A עדיין קיימת לhistory.

#### Scenario: ביטול מיזוג
- **WHEN** owner מבקש לבטל מיזוג
- **THEN** event_entities records חוזרים ל-entity A. merge record מסומן כ-reverted.

### Requirement: Cross-channel Entity Identity
אותו אדם שמתקשר מWhatsApp ומTelegram SHALL להיות ניתן לקישור לentity אחת. auto-linking דורש confidence ≥ 0.9 על בסיס שם + metadata.

#### Scenario: זיהוי cross-channel אוטומטי
- **WHEN** entity חדשה נוצרת עם name שמתאים לentity קיימת ב-gate אחר בconfidence ≥ 0.9
- **THEN** escalation לowner להצעת מיזוג — לא auto-merge

#### Scenario: ברירת מחדל — entities נפרדות
- **WHEN** אין confidence גבוה לcross-channel identity
- **THEN** entities נשמרות נפרדות עם suggestion_to_merge=true

### Requirement: Entity Search
Owner SHALL יכול לחפש entities לפי שם, type, gate, תאריך, ותגיות. חיפוש fulltext על canonical_name ו-aliases.

#### Scenario: חיפוש entity לפי שם
- **WHEN** owner מחפש "דוד"
- **THEN** מוחזרות כל entities שcanonical_name או aliases מכילים "דוד", ממוינות לפי last activity

#### Scenario: סינון לפי Gate
- **WHEN** owner מסנן entities לפי gate_type=whatsapp
- **THEN** מוחזרות רק entities שיש להן gate_identifier ב-WhatsApp

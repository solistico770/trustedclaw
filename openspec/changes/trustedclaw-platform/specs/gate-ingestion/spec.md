## ADDED Requirements

### Requirement: Gate Registration
המערכת SHALL תמוך ברישום Gate types מרובים. כל Gate מיוצג על-ידי adapter ייעודי עם ממשק אחיד. Gate חייב להיות registered לפני שניתן לקבל ממנו events.

#### Scenario: רישום Gate חדש
- **WHEN** owner מגדיר Gate חדש עם type, credentials ו-display_name
- **THEN** המערכת יוצרת רשומת Gate עם status=inactive, ומנסה לאמת את ה-credentials

#### Scenario: Gate credentials לא תקינים
- **WHEN** credentials שסופקו נכשלים באימות
- **THEN** Gate נשמר עם status=error ו-error_details מפורטים, ללא ניסיון התחברות

### Requirement: Persistent Gate Connection
ה-EC2 Gate Listener Service SHALL לנהל חיבורים פרסיסטנטיים לכל Gate רשום. כישלון חיבור SHALL להוביל לreconnection אוטומטי עם exponential backoff.

#### Scenario: חיבור מוצלח ל-Gate
- **WHEN** Gate Listener מתחיל ומנסה להתחבר ל-Gate
- **THEN** status משתנה ל-active ומוגדר last_connected_at

#### Scenario: אובדן חיבור ל-Gate
- **WHEN** חיבור קיים ל-Gate נסגר באופן לא צפוי
- **THEN** המערכת מנסה reconnection אחרי 5s, 15s, 60s, 300s. status=reconnecting. לאחר 5 כישלונות → status=error + escalation לowner

#### Scenario: כישלון Gate אחד אינו משפיע על אחרים
- **WHEN** Gate A נופל
- **THEN** כל שאר ה-Gates ממשיכים לפעול ללא שיבוש

### Requirement: Raw Event Capture
כל input שמגיע דרך Gate SHALL להישמר כ-raw_payload בלתי-משתנה לפני כל עיבוד. שמירת raw event היא סינכרונית — ack לא יישלח עד שהשמירה מאושרת.

#### Scenario: שמירת raw event מ-WhatsApp
- **WHEN** הודעה מגיעה ב-WhatsApp
- **THEN** EC2 Listener שומר את ה-payload המלא locally, שולח POST /api/gate/ingest ל-Vercel עם raw_payload, received_at, gate_id. Vercel שומר ב-Supabase לפני כל תגובה.

#### Scenario: Vercel לא זמין בעת קליטת event
- **WHEN** EC2 מקבל event אבל POST ל-Vercel נכשל
- **THEN** event נכנס ל-local retry queue ב-EC2. ניסיון חוזר עד 5 פעמים. לאחר מכן → dead-letter log. raw event לא אובד.

### Requirement: Event Normalization
לאחר שמירת raw event, המערכת SHALL לנרמל אותו לפורמט אחיד ללא תלות ב-Gate type.

#### Scenario: נורמליזציה של הודעת WhatsApp
- **WHEN** raw event מ-WhatsApp נשמר
- **THEN** normalized event נוצר עם: sender_id, content_text, content_type, channel_id, occurred_at — בפורמט אחיד ללא מבנה WhatsApp-ספציפי

#### Scenario: נורמליזציה נכשלת
- **WHEN** raw event אינו ניתן לנרמול (פורמט לא מוכר)
- **THEN** event נשמר עם processing_status=normalization_failed. escalation אוטומטית לowner עם raw payload לבדיקה.

### Requirement: Gate-level Write-back
המערכת SHALL לתמוך בשליחת פעולות יוצאות חזרה ל-Gate. כל write-back SHALL לעבור דרך Policy Engine לפני ביצוע.

#### Scenario: שליחת הודעה חזרה ל-WhatsApp
- **WHEN** Policy Engine מאשר action מסוג send_message
- **THEN** Vercel שולח POST /gate/send ל-EC2 עם gate_id, target channel_id, payload. EC2 מבצע דרך Puppeteer ומחזיר תוצאה.

#### Scenario: Write-back נכשל
- **WHEN** EC2 לא מצליח לשלוח הודעה יוצאת
- **THEN** execution log נשמר עם status=failed, error_details. Event חדש נוצר מסוג execution_failure לטיפול.

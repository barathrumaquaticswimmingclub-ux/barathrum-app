# Prepared update — 9 November 2026: parent operations

Implemented in a review branch; NOT deployed. Direct main push was blocked by automatic approval review. Request approval before merging/deploying. No production tester reset executed.

- Durable parent inbox and opt-in Web Push for attendance, payment received, due bills/package renewal and holiday sessions. Generic lock-screen push body; details only after parent login. Automatic worker runs every minute; deduplicated events, bounded delivery retries and removal of expired subscriptions. Actual phone delivery requires parent permission and a live device test (not yet done).
- Owner custom package quota and price (1–100 meetings, integer rupiah, required explanation); current quota usage cannot be reduced below meetings already used.
- Regular remains 4/8 meetings per one-month rolling package. Only Hadir consumes quota, duplicate attendance rejected and correction restores quota. Existing requirement for a paid package still applies; this differs from the handbook's allowance to train with unpaid invoices and needs a separate correction before claiming full policy compliance.
- Parent evaluation wording uses recorded schedule time and child nickname/name; original staff observations remain unchanged. Known keywords are expanded deterministically, without inventing diagnoses or actions taken.
- Shared protected photo endpoint for Owner/assigned coach/Prestasi only. Form intake requires a photo; existing API photo synchronization tested locally. Real Google Form photo sync remains blocked on Google authorization.
- Reversible tester archive/reset and Owner restore in Reports. Staff accounts, form keys, coaching directory and training programs are retained. Reset is fingerprint-guarded; restore is supported before new athlete/history data exists. Production data was not removed.
- Juara class filtering tightened for schedule roster and photo access, with server-side non-Prestasi mutation denial.
- Added peraturan dapat berubah sewaktu-waktu clause to the rules page and form installer. Public page preserves the existing approved summary; historical incomplete source remains in repository without inventing missing clauses.

Validation: npm test passed (119 staff API checks, PWA, 81 SWIM/form checks, Forms retry simulation, 23 Owner checks, Prestasi suite, plus new launch.test.js for custom packages, notifications, mock push delivery, holiday extensions, Juara isolation and reversible reset). Local browser preview could not be reached by the cloud browser; no browser QA of the new app was claimed.

Live Google Forms: both existing forms now have a real required FILE_UPLOAD question Foto anak (bebas), one file, image restriction and free-photo description. Existing answers preserved. New Apps Script photo mapping was prepared but running it requested Google reauthentication on Redmi Note 10 Pro (number 33) and new Drive permission. Preserve working existing code until authorization completes; do not leave triggers requiring unapproved scopes. Existing form metadata migration (nickname, date format and Prestasi history) still needs running after authorization. No replacement forms were created and no form keys were rotated.

---

# Update — 9 November 2026 (WIB): Prestasi and Parent Rules

Implemented and verified on isolated sample data:
- Staff Prestasi: 17 predefined events, per-result dates, multi-day tests, batch transaction with retry deduplication, 2000 m freestyle and 100/200/400 m IM.
- Progression by athlete and pool length (25/50 m), initial base time, personal best, latest result per event and comparison with previous result.
- Parent-only projection of their child’s time records, dedicated personal report tab, automatic refresh while open.
- Larger child photo and accessible full-screen viewer.
- Daily/group programs: Dryland, Swimming, evaluation, original private photo, local OCR (Tesseract English model), editable text before saving, DOCX export and month filter. OCR sample printed text passed; handwriting needs coach review.
- Public /rules/parent/ reading page preserving the current incomplete Parent Edition source with an explicit review notice. Registration summary has no article/subsection numbering. Final wording of I.1, II.1 and II.2 is unresolved in the available book; do not call it final or silently replace it.
- Installer links to the rules page and prefers original child photos up to 5 MB. Existing deployed Apps Script was not replaced; legacy forms/photo ingestion still need the previously documented migration.

Validation: existing full test suite plus prestasi.test.js; browser sample tests for batch save, program fields, private report, photo viewer and rules. No production child data was created or altered during tests.

Release f38aa9f92359fa98bbce2b3e8ab282eabeb4c437 is deployed on Railway. Live staff UI verified: progression table and program photo/OCR controls are present. Both existing Google Form descriptions now include a clickable /rules/parent/ reading link; verified on both public respondent pages. Existing consent wording was preserved. Automatic approval review rejected publishing additional payment/expiry/attendance summaries because exact final wording is unresolved; the broader summary initially entered in Prestasi was removed and replaced by the reading link only. Do not publish the incomplete book as new mandatory consent until the user supplies the final I.1, II.1 and II.2 wording. The public reading page clearly marks the source as under review.

Full suite passed: 119 staff checks, PWA suite, 81 SWIM/form checks, Forms mock, 23 Owner checks and new Prestasi suite. Local OCR printed-image smoke test passed. Browser QA used isolated sample records, then live staff read-only checks; no production tests were saved. OCR handwriting quality and replacement of the previously deployed Apps Script remain unverified.

---
Previous release context follows (historical):

# Release status — 9 November 2026 (WIB)

Application release d8beec43d6f804e175d20b4589bcb6ed63aa3e1e is now on main and deployed on Railway. The live SWIM manifest, JavaScript and distinct swim-192 icon match tested source. /club/ and /swim/ load successfully. Existing source and data were preserved.

Validation: 119 staff API checks, 81 parent/form checks, 23 Owner SWIM checks, PWA suite and Forms migration/retry mock passed on the restored source tree e471d16c512ecc85d6dd3ef961535f6cf461a370. Live Owner login, live form migration and photo sync still need verification.

Google Forms remain pending. Cloud Google account was signed out. Secure password submission reached an optional selfie-enrollment screen; choosing Later returned to signed-out account chooser. A fresh Forms tab also showed Signed out. Manual Google sign-in is required before further form changes. No installer keys have been rotated in this continuation, and no live forms have been changed.

Next: after successful Google login, sign into the existing BRTM Owner account securely, download the current private installer from Owner > Google Form (rotates keys), replace code in the SAME Apps Script project, preserving properties and form IDs, and run siapkanBRTM. The expanded Drive permissions require review. Convert Foto anak (bebas) placeholder in BOTH forms to required File upload, images, one file. Verify logo, terms, required consent/fields and DD-MM-YYYY, then live photo synchronization. Do not create replacement forms or duplicate children. The migration snapshots prior answers privately before removing superseded questions; consider preserving historical questions instead if a separate irreversible-deletion confirmation would be necessary.

Apps Script project: 1OawOAg2YdfI4U2RKwmntImsNwkyg58Mfh9qvh1ynGEhN2qVpqGb27THb
Prestasi editor: https://docs.google.com/forms/d/1qI0F3VVyN3p4blI2YsRQq6yOseKPwyhlr_Dv_8YEVs8/edit
Nonprestasi editor: https://docs.google.com/forms/d/1Zup98fj8v48JFzw8kLXKB0XUTm9_sxmOTiAFWi9VIVA/edit
Staff: https://barathrum-app-production.up.railway.app/club/
Parents and SWIM Owner: https://barathrum-app-production.up.railway.app/swim/

User goal: separate installs/icons, branded existing forms with all mandatory biodata/photo and consent, full child profile in SWIM, and Owner active Prestasi/pemula counts with edit/reversible account removal. Use existing Owner credentials; no password has been changed.

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

Live Google Form descriptions are being updated separately to include the Parent Edition link and registration summary. Check the live descriptions before reporting completion. No new mandatory consent to unverified book sections.

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

# Pending release — 8 November 2026

Local commits 248c9d9 and 9c36605 contain separate /club/ and /swim/ installs/icons, full parent biodata and authenticated private photos, Owner SWIM dashboard/counts/edit/reversible account removal, and the new Forms migration/consent/profile/photo transport.

Validation: 119 staff API checks, 81 parent/form checks, 23 Owner SWIM checks, PWA suite, Forms migration/retry mock all pass. Browser QA at http://127.0.0.1:4173/preview/swimowner verified Owner list, counts, child biodata, edit/save. Preview daemon running via sites-preview. Actual production source still unchanged: git push origin main was rejected by automatic approval review; explicit publication approval requested. Do not retry until user approves updating main/Railway.

Live Google Forms: blue custom #003ca6 theme saved to both existing forms. Existing questionnaires/consent/photo are NOT yet migrated. After approved code deployment, download the new private installer from Owner > Google Form (rotates keys); replace code in the SAME Apps Script project, preserving script properties and form IDs. Run siapkanBRTM; new Drive permissions require live review/consent. Then convert Foto anak (bebas) placeholder in EACH Form to required File upload, images, single file. Verify logo, rules, consent, all fields required, and live photo sync. Original responses are snapshotted privately by migration. Do not create replacement forms.

Apps Script project: 1OawOAg2YdfI4U2RKwmntImsNwkyg58Mfh9qvh1ynGEhN2qVpqGb27THb
Prestasi form editor: https://docs.google.com/forms/d/1qI0F3VVyN3p4blI2YsRQq6yOseKPwyhlr_Dv_8YEVs8/edit
Nonprestasi form editor: https://docs.google.com/forms/d/1Zup98fj8v48JFzw8kLXKB0XUTm9_sxmOTiAFWi9VIVA/edit
Production: https://barathrum-app-production.up.railway.app/
Browser retained tabs: 8 Apps Script, 9 authenticated Owner, 14 synthetic SWIM preview, 15 Prestasi editor, 16 Nonprestasi editor. Google login and staff Owner login were successful earlier. Owner SWIM reuses current staff Owner credentials, no new password is embedded. User requests brtm / 898900; verify login after deploy, do not claim password changed.

User goal: two installs with different icons; branded Forms with mandatory consent; all requested biodata/photo and DD-MM-YYYY birth date; full child photo/biodata in SWIM; Owner active Prestasi/pemula counts and manage every child's dashboard/account. User prefers completion with minimal manual steps.

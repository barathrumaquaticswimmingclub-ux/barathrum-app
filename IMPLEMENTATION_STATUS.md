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

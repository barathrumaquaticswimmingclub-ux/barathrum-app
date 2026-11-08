# BRTM Club Management V2

Aplikasi klub untuk HP, melanjutkan Express + PostgreSQL dari `barathrum-app`. `npm start` menjalankan server produksi. Data lama `data_klub` dipertahankan; inisialisasi hanya menambah tabel akun, sesi, dan audit serta indeks.

## Alur operasional

1. Owner masuk dan mengganti kata sandi awal. Tambah/lengkapi identitas atlet dan pilih kelasnya.
2. Pada **SPP & paket**, catat tagihan dan pembayaran aktual dengan status **Lunas** atau **Belum Lunas**. Nilai dihitung di server. Tidak ada pembayaran sebagian.
3. Pada **Akun tim**, ubah label Coach 1–7 menjadi nama pelatih dan atur ID login. Kata sandi khusus dapat diatur melalui Edit (minimal 5 karakter); kolom kosong mempertahankan kata sandi lama. Buat kata sandi awal satu kali untuk dibagikan langsung kepada masing-masing pelatih. Akun wajib mengganti kata sandinya sebelum mengakses data.
4. Pada **Jadwal latihan**, buat sesi per tanggal, tentukan pelatih, lokasi, dan peserta. Pergantian pelatih/jadwal disetujui Owner, disertai alasan, dan tidak menambah kuota paket. Sesi dengan absensi tidak boleh dipindah atau dihapus.
5. Coach membuka sesi penugasannya dan mencatat **Absensi sesi**. Hadir menggunakan satu pertemuan; Izin, Sakit, dan Alpa tidak. Satu atlet hanya memiliki satu absensi pada satu sesi. Koreksi status memperbarui kuota.
6. Gunakan **Perkembangan atlet** untuk teknik, fisik, attitude, dan catatan. Akun Prestasi juga mengelola **Catatan waktu** (personal best per gaya/jarak/panjang kolam) serta **Program & event**, termasuk informasi keberangkatan di detail event.
7. Owner meninjau SPP, laporan, unduhan CSV, cadangan JSON lengkap, dan audit. Tombol pengingat WhatsApp hanya menyiapkan pesan; pengguna sendiri yang mengirimkannya.

## Aturan tarif

| Kelas | Tarif | Pertemuan |
| --- | ---: | ---: |
| Private | Rp400.000 | 4 |
| Semi Private | Rp200.000 | 4 |
| Group | Rp150.000 | 4 |
| Private Couple | Rp300.000 | 4 |
| Hydro Terapi | Rp300.000 | 4 |
| Regular 1x seminggu | Rp150.000 | 4 |
| Regular 2x seminggu | Rp250.000 | 8 |
| Prestasi | Rp250.000 | Bulanan |

Paket nonprestasi berlaku satu bulan, dengan tanggal akhir mengikuti tanggal mulai di bulan berikutnya (tanggal 31 dijepit ke akhir bulan bila perlu). Sisa tidak dapat dipakai setelah tanggal akhir kecuali Owner memberikan pengecualian beralasan. Pengecualian memperpanjang waktu tanpa menambah kuota. Prestasi jatuh tempo akhir bulan; kehadiran Prestasi tidak mensyaratkan pelunasan sebelum sesi.

Pendaftaran anggota baru opsional Rp50.000. Diskon Rp25.000 hanya untuk sekolah DBS, ABA 5, Ebenhaezer, atau TEC dan kelas nonprestasi. Gunakan label sekolah tersebut pada data atlet. Zona tanggal operasional: Asia/Jakarta.

## Akses dan data

- Owner: pengelolaan seluruh data, tagihan, akun, ekspor dan pengecualian.
- Coach: atlet sesuai penugasan, jadwal sendiri, catatan absensi/perkembangan sendiri, serta membaca program latihan. Tidak dapat mengakses pembayaran atau data kontak/alamat sensitif atlet.
- Prestasi: atlet Prestasi, kehadiran/perkembangan, catatan waktu, program dan event. Tidak dapat mengakses pembayaran.
- Password di-hash dengan scrypt dan salt acak; cookie sesi HttpOnly/SameSite=Strict, sesi disimpan sebagai hash dalam database dan dicabut saat ganti/reset password. Cookie Secure pada Railway/production. Mutasi wajib header aplikasi dan origin yang sesuai.
- Audit setiap perubahan tersimpan terpisah; API tidak menyediakan ubah/hapus audit. Database credential tidak pernah disertakan ke frontend atau repository.
- Data lama yang belum memiliki relasi atlet/sesi dapat dilengkapi melalui Edit oleh Owner. Label Reguler/Regular dinormalisasi saat dibaca. Kolom lama yang tidak diedit tetap disimpan.

## Menjalankan dan menguji

`npm ci` lalu `npm test` menjalankan uji API dengan PostgreSQL WebAssembly terisolasi (PGlite), tanpa menyentuh Railway. `npm run dev` menyediakan pratinjau dengan data contoh. **Jangan gunakan server pratinjau untuk data asli**; hanya `npm start` yang menjadi proses produksi.

Produksi memerlukan `DATABASE_URL` PostgreSQL dan `PORT` (dari Railway). `NODE_ENV=production` dianjurkan. Skema kompatibel dengan versi lama; tidak ada penghapusan data otomatis. Aktivasi Owner satu kali memakai token acak yang hanya verifikator SHA-256-nya disimpan dalam `bootstrap.json`; token asli tidak berada di repository. Endpoint aktivasi ditutup setelah selesai. Tidak ada password default publik. Kredensial serah-terima disampaikan langsung kepada pemilik.

Uji mencakup login, perubahan/revokasi sesi, akses per peran, tarif server, diskon, paket 4/8 sesi, absensi ganda, kuota habis, koreksi kuota, kedaluwarsa, pengecualian, data lama, audit, backup, serta buka ulang database. Integrasi bank, pengiriman WhatsApp otomatis, dan akun orang tua tidak termasuk rilis ini.

## Memasang di HP Android

Buka situs BRTM melalui Google Chrome, ketuk **Pasang BRTM**, lalu konfirmasi **Instal**. Jika Chrome belum menampilkan dialog, gunakan menu ⋮ → Instal dan buat pintasan → Instal (pada versi lain: Instal aplikasi / Tambahkan ke layar utama). Buka ikon BRTM dari layar utama dan gunakan akun yang sama.

Manifest memakai tampilan standalone, ikon PNG 192/512 dan maskable. Service worker hanya menyimpan halaman pemberitahuan offline beserta aset publiknya. Data klub, API, login, dan respons berisi identitas/pembayaran tidak di-cache. Internet diperlukan untuk membaca dan menyimpan data klub.

## BRTM SWIM and Google Forms

- Parent PWA: `/swim/`, with a separate manifest ID, session cookie and read-only API. Parents never authenticate to `/api` (staff).
- Owner menus: **Akses orang tua**, **Data formulir**, **Google Form**. Prepare active athletes' accounts via **Siapkan akun atlet aktif**. Usernames use normalized full names and an internal-ID suffix on collision. Existing usernames remain stable after renaming. Owner can disable access and revoke sessions.
- Per the Owner's explicit choice, all parent passwords are `brtm`. Anyone who knows a child's login name and this shared password can attempt to view that child's attendance, payment summary and evaluations. Rate limits and per-child filtering do not establish a parent's identity. Passwords are scrypt-hashed; none is exposed in public assets.
- Dashboard reads current operational records: assigned future schedules, attendance, coach evaluations, actual latest paid date, package usage/expiry, and outstanding invoice dates. Prestasi uses monthly attendance without an artificial remaining-session count. Data refreshes every 30 seconds while visible, on return to the app, or manually. No private data is saved to browser storage or service-worker caches.
- Google integration requires one-time activation in the Owner's Google account. Download **BRTM-Google-Forms.gs** from the Owner menu, paste into a private standalone Apps Script project and run `siapkanBRTM`. Google authorization is required. The installer creates two forms (Prestasi and non-Prestasi), one submission trigger per form and a ten-minute retry trigger. Re-running the same project retains form IDs and avoids duplicate triggers. Never publish or share the generated script: it contains private integration keys.
- Both forms serve existing and new athletes without an old/new question. A new name creates an athlete and parent account without a payment or registration fee. A unique existing name with matching birth date, normalized parent phone, class and active status links automatically; only missing profile fields are filled. Existing class, name, status, packages and history are preserved. Name collisions, changed identities/classes and invalid answers appear for Owner review; they do not overwrite athlete records. Invalid answers can be linked to a manually corrected existing profile but cannot create a new invalid athlete.
- Authenticated form submissions are idempotent on `(kind,response_id)`. Raw Google answers remain in Google Forms if the server is unavailable; the retry cursor handles more than 50 answers sharing one timestamp. Downloading a new installer rotates both tokens, requiring replacement of the old Apps Script code in the same project. No operational credentials are committed to Git.
- Database migration adds `brtm_parents`, `brtm_parent_sessions`, `brtm_form_keys` and `brtm_registrations` without rewriting existing tables or staff accounts. Existing JSON backups still contain operational records and audit only, not parent credentials or form intake; those new tables require a full PostgreSQL backup for disaster recovery.
- `npm test` includes existing regression checks, parent/form integration tests, and a mocked Apps Script installer/retry test. The mocked Google test does not replace live Google authorization and an end-to-end form submission test.

## Pembaruan profil & Owner BRTM SWIM (8 November 2026)

BRTM installs at `/club/` and BRTM SWIM at `/swim/`, with different icons and non-overlapping scopes. Manifest IDs stay stable for existing installs. The SWIM Owner uses the existing active Owner account (including its current password); no new default password is published. Owner SWIM cookies cannot authenticate staff APIs. Owners can see active Prestasi/nonprestasi totals, all children's dashboards, edit biodata/photo, disable or reversibly remove a SWIM dashboard/account without deleting operational history. Parent profiles include only their own biodata and a private authenticated photo endpoint. Photos and owner sessions require full PostgreSQL backups.

The Google installer migrates the existing forms in place, preserves form IDs and triggers, and writes a private snapshot of existing answers to the Owner's Drive before removing superseded questions. New forms require consent, all biodata, DD-MM-YYYY birth dates and an image upload. **Google's API cannot create file-upload items:** in each form's Google editor, convert `Foto anak (bebas)` to File upload, images only, one file, required. The installer preserves that item on reruns. Apply the blue theme in Google's editor. File uploads require respondents to sign into Google. The script needs Drive read access for photos and Drive write access for the one-time private response snapshot. It sends a small photo thumbnail when available, otherwise an image up to 5 MB, using the existing authenticated integration. Original uploads remain private in the Owner's Drive; no public Drive sharing is required. Old responses without the new schema remain readable and idempotent.

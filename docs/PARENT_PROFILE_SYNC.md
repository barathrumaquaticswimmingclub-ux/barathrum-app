# Biodata orang tua, filter pembayaran dan pencegahan duplikasi

- Data Atlet Owner memakai filter Lunas, Belum ada pembayaran, Perlu perpanjangan, Belum Lunas dan pilihan kelas. Status sumber Prestasi tanpa tagihan/pembayaran dipetakan ke Belum ada pembayaran untuk filter ini.
- BRTM SWIM orang tua mempunyai menu Profil & foto. Pembaruan terikat pada atlet dari sesi login, memakai daftar field biodata yang diizinkan, dan tidak menerima perubahan kelas, jadwal, status atau pembayaran. Nama panggilan wajib pada editor. ID login tetap dan ditampilkan dalam menu/editor.
- Profil disimpan pada data atlet pusat; foto disimpan pada penyimpanan foto yang juga dibaca Staff. Foto didekode berdasarkan isi, dikompres WebP, maksimal unggahan orang tua 20 MB. Penyimpanan profil/foto/audit satu transaksi. Revisi lama ditolak agar perubahan baru tidak tertimpa. Editor dikosongkan saat logout.
- Perubahan nama mempertahankan nama lama sebagai alias untuk pemeriksaan pendaftaran. Label nama pada riwayat operasional yang terhubung lewat ID disinkronkan, tanpa mengubah nilai, status, tanggal atau ID transaksi. Riwayat lama tanpa ID yang memakai nama unik ditautkan ke ID atlet dalam transaksi perubahan nama; nama yang ambigu tidak ditautkan otomatis. Snapshot program latihan historis tetap historis.
- Web dan Google Form memakai pemeriksaan identitas yang sama, di dalam transaksi dengan kunci instalasi. Nama normal/alias, kemiripan ejaan, tanggal lahir, WA dan panggilan dipakai untuk mendeteksi kandidat. Hanya satu kecocokan nama+lahir+WA+kelas aktif yang boleh ditautkan otomatis; kandidat ambigu masuk Perlu diperiksa tanpa membuat atlet. Pengulangan response/request ID tetap idempoten. Pilihan pembuatan atlet dari pendaftaran juga memeriksa ulang kandidat, sehingga tidak melewati pemeriksaan ini.
- Identitas yang berbeda seluruhnya masih dapat lolos deteksi; nama mirip saja tidak digabung otomatis. Data ganda lama tidak dihapus oleh rilis ini.

## Validasi 18 November 2026

`parent-profile-sync.test.js`: 39 pemeriksaan API ditambah alur DOM Parent/Owner; mencakup perubahan aktual dari formulir, sinkron Coach/Juara, pembayaran lama tanpa ID tetap terhubung setelah nama berubah, foto terkompres, validasi, isolasi anak, field terlarang, revisi basi, rollback foto invalid, riwayat pembayaran/absensi, login tetap, audit, alias dan variasi ejaan, sibling, filter kelas/pembayaran.

Uji regresi yang terkait dan uji lain dalam `npm test` lulus sampai bagian Training Board. Dua kegagalan lama telah direproduksi pada commit sebelum perubahan `65fdc74`:
- `training-board.test.js:31`: teks catatan tidak memuat POPDA Kota 2027.
- `training-chat.test.js:10`: perbedaan trailing newline pada program.

Uji setelah titik tersebut dijalankan terpisah: regular-reminders, athlete-payment-status, parent-profile-sync dan refresh Staff/SWIM lulus. Perubahan ini tidak mengedit logika Training Board/chat.

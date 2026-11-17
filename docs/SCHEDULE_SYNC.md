# Sinkronisasi jadwal dan absensi pelatih

Jadwal mingguan Owner menghasilkan sesi per tanggal yang menentukan daftar atlet dan akses pelatih. Sebelumnya satu absensi yang sudah tersimpan menghentikan seluruh pembaruan peserta sesi, dan sinkronisasi hanya berjalan mulai hari ini. Akibatnya peserta tambahan dapat terlihat di tabel mingguan tetapi belum tersedia dalam absensi.

Perbaikan berlaku untuk seluruh pelatih dan kelas:

- Peserta yang belum masuk ditambahkan ke sesi yang sama jika pelatih, tempat, kelas dan jam tetap sama. Peserta lama, ID sesi, absensi, kuota dan catatan evaluasi tidak diubah. Kapasitas kelas tetap diperiksa.
- Tujuh hari sebelumnya dipulihkan dari audit jadwal. Sesuai otorisasi Owner untuk data susulan, peserta dengan paket Lunas yang mencakup tanggal sesi juga dapat ditambahkan ke penugasan mingguan yang sama. Tidak mengubah jam/pelatih sesi yang sudah tercatat dan tidak membuat kehadiran otomatis. Paket yang baru dimulai setelah tanggal sesi tidak menjadi dasar pemulihan.
- Sesi Libur, penggantian sesi secara manual, dan bentrok tetap dihormati. Sesi manual yang tepat sama dapat dipakai kembali tanpa menggandakan sesi.
- Pembacaan daftar atlet/jadwal memeriksa sinkronisasi sebelum menentukan akses. Permintaan serentak berbagi pekerjaan yang sama; jeda maksimum pemeriksaan 15 detik, di samping worker berkala dan sinkronisasi langsung pada perubahan Owner.

`node schedule-sync.test.js` menguji tujuh akun pelatih, skenario Lula/Panji, peserta tambahan setelah absensi pertama, input susulan, larangan akses pelatih lain, pencegahan absensi ganda, pemulihan sesi berdasarkan audit, penugasan yang tidak dibalik tanggal, dan sesi libur. Pengujian memakai data simulasi; tidak menyatakan verifikasi langsung data produksi Lula.

Validasi tambahan: rangkaian API/DOM absensi, libur, akses, paket, tujuh pelatih, pendaftaran dan pembaruan aplikasi lolos. Fixture uji usia diperbarui agar anak baru lahir ditolak sesuai minimum Private 2 tahun yang sudah berlaku. Dua uji modul program latihan (`training-board.test.js` dan `training-chat.test.js`) masih gagal pada kode sebelum perubahan ini: ekspektasi teks POPDA lama dan normalisasi newline. Keduanya direproduksi pada snapshot main sebelum perbaikan absensi; modul program latihan tidak diubah oleh perbaikan ini.

## Data susulan dan identitas

Pembayaran non-Prestasi yang baru berstatus Lunas mengaktifkan atlet dan menyinkronkan jadwal dalam transaksi yang sama. Pengeditan kuitansi lama yang tetap Lunas tidak mengaktifkan ulang peserta yang sengaja dinonaktifkan.

Duplikat tanpa transaksi, penugasan, catatan latihan, feedback atau roster program hanya dapat disambungkan jika ada satu kandidat dengan pembayaran Lunas dan jadwal, tanggal lahir, WA wali, nama wali, panggilan, kelas dan nama hampir identik (nama depan sama). Data sumber tetap tersimpan sebagai arsip dengan `mergedInto`; ID atlet utama, kuota, nominal pembayaran, absensi, nomor anggota lama dan kredensial dipertahankan. Registrasi dipautkan ke ID utama, profil kosong dilengkapi, dan foto utama tidak ditimpa. Login lama dari data sumber tetap membaca ID utama dengan pemeriksaan status atlet dan akun utama. Penonaktifan akun/atlet utama menutup akses alias.

Formulir berikutnya menahan calon duplikat yang hampir cocok untuk pencocokan Owner alih-alih membuat atlet baru atau mengubah identitas lama secara otomatis. Ejaan alias yang sudah disahkan dapat dikenali pada pengiriman berikutnya.

Pemeriksaan startup membaca semua atlet, pembayaran dan jadwal melalui jalur server yang sama dengan akun pelatih. Ringkasan dan kendala tersedia di log privat; nomor kontak, tanggal lahir, foto, kredensial dan nominal pembayaran tidak dicetak. `paid-roster.test.js` menguji skenario Gabriel, penggabungan yang terverifikasi, login alias, isolasi akses, serta tidak berubahnya kuota dan transaksi.

Batas periode Prestasi memakai `periodeMulai` sampai sebelum `periodeSelesai`, bukan tanggal awal tagihan kalender. Inspeksi dan pemulihan roster menggunakan fungsi kelayakan tanggal yang sama pada data pembayaran asli. Sesi Prestasi manual yang sudah berisi atlet dipertahankan sebagai riwayat sah; tidak dianggap hilang hanya karena tidak mempunyai kunci jadwal mingguan.

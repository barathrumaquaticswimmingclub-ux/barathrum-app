# Sinkronisasi jadwal dan absensi pelatih

Jadwal mingguan Owner menghasilkan sesi per tanggal yang menentukan daftar atlet dan akses pelatih. Sebelumnya satu absensi yang sudah tersimpan menghentikan seluruh pembaruan peserta sesi, dan sinkronisasi hanya berjalan mulai hari ini. Akibatnya peserta tambahan dapat terlihat di tabel mingguan tetapi belum tersedia dalam absensi.

Perbaikan berlaku untuk seluruh pelatih dan kelas:

- Peserta yang belum masuk ditambahkan ke sesi yang sama jika pelatih, tempat, kelas dan jam tetap sama. Peserta lama, ID sesi, absensi, kuota dan catatan evaluasi tidak diubah. Kapasitas kelas tetap diperiksa.
- Tujuh hari sebelumnya dapat dipulihkan hanya berdasarkan penugasan mingguan yang tercatat dalam audit pada tanggal tersebut. Snapshot sebelum perubahan berikutnya dipakai untuk mencegah penugasan baru diterapkan mundur. Ini tidak membuat kehadiran otomatis.
- Sesi Libur, penggantian sesi secara manual, dan bentrok tetap dihormati. Sesi manual yang tepat sama dapat dipakai kembali tanpa menggandakan sesi.
- Pembacaan daftar atlet/jadwal memeriksa sinkronisasi sebelum menentukan akses. Permintaan serentak berbagi pekerjaan yang sama; jeda maksimum pemeriksaan 15 detik, di samping worker berkala dan sinkronisasi langsung pada perubahan Owner.

`node schedule-sync.test.js` menguji tujuh akun pelatih, skenario Lula/Panji, peserta tambahan setelah absensi pertama, input susulan, larangan akses pelatih lain, pencegahan absensi ganda, pemulihan sesi berdasarkan audit, penugasan yang tidak dibalik tanggal, dan sesi libur. Pengujian memakai data simulasi; tidak menyatakan verifikasi langsung data produksi Lula.

Validasi tambahan: rangkaian API/DOM absensi, libur, akses, paket, tujuh pelatih, pendaftaran dan pembaruan aplikasi lolos. Fixture uji usia diperbarui agar anak baru lahir ditolak sesuai minimum Private 2 tahun yang sudah berlaku. Dua uji modul program latihan (`training-board.test.js` dan `training-chat.test.js`) masih gagal pada kode sebelum perubahan ini: ekspektasi teks POPDA lama dan normalisasi newline. Keduanya direproduksi pada snapshot main sebelum perbaikan absensi; modul program latihan tidak diubah oleh perbaikan ini.

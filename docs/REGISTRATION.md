# Formulir Pemula satu halaman

Alamat publik: `/registration/`. Formulir ini adalah formulir web BRTM yang dipilih Owner untuk menggantikan alur 12 halaman; bukan Google Forms yang disematkan. Form Google, respons, kunci integrasi dan trigger yang lama tetap dipertahankan.

Urutan: nama lengkap, panggilan, tanggal lahir, jenis kelamin, tempat lahir, alamat, satu nama orang tua/wali, WhatsApp, sekolah, kelas sekolah, tujuan les, foto, kelas renang, jadwal sesuai diskusi admin, persetujuan. Semua isian wajib. Persetujuan mengacu pada versi peraturan saat formulir dibuka; versi lama ditolak agar dibaca ulang.

Pilihan jadwal diambil dari slot mingguan Owner untuk pelatih aktif dengan kapasitas tersisa. Regular hanya Pondok Selfie pada jam yang ditetapkan klub; 1× satu jadwal, 2× dua hari berbeda. Tidak ada jadwal rekaan jika Owner belum menyiapkan slot. Jadwal pilihan dicatat untuk konfirmasi admin; tidak otomatis memasukkan anak ke daftar sesi, mengubah paket, mencatat pembayaran atau memesan kapasitas.

Foto maksimal 20 MB; didekode berdasarkan isi, bukan nama/MIME. Format umum termasuk JPG, PNG, WebP, GIF, BMP, TIFF, AVIF, SVG dan HEIC/HEIF mengikuti kemampuan decoder yang terpasang. Berkas rusak/nonfoto ditolak. Penyimpanan hanya menerima WebP maksimal 1000×1000, tanpa metadata asli. Berkas asli tidak disimpan. Google Drive tidak menerima unggahan dari alur baru.

Pendaftaran memakai jalur identitas bersama: nama unik membuat atlet dan akun orang tua; nama, tanggal lahir, WA dan kelas yang cocok menghubungkan riwayat lama. Ketidakcocokan masuk tinjauan Owner tanpa mengungkap identitas yang ditemukan pada respons publik. Pilihan jadwal pendaftaran terbaru dari identitas yang tepat terlihat dalam detail atlet Owner; jadwal latihan operasional tetap diatur Owner. Pengiriman ulang idempoten dan tidak menggandakan anggota/pembayaran. Setelah berhasil, tampil petunjuk pemasangan BRTM SWIM dan login nama lengkap/sandi brtm.

Validasi: `node registration.test.js`, seluruh `npm test`, pembacaan publik setelah Railway SUCCESS. Jangan menguji pengiriman anak fiktif ke produksi. Tidak mengklaim semua format gambar yang pernah ada dapat dibaca; format RAW/proprietary dan berkas rusak bisa ditolak.

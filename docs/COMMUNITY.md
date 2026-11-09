# Pengumuman, ID anggota, dan masukan orang tua

Perubahan ini memakai proyek dan data BRTM yang sudah ada. Tabel baru ditambahkan saat startup tanpa mengganti ID relasi atlet, absensi, paket, akun, atau foto.

## Pengumuman kelas

Owner membuka Dashboard → Kirim pengumuman kelas, memilih kelas dan tanggal latihan, mengisi judul/pesan, lalu menekan Kirim notifikasi. Pesan masuk ke kabar BRTM SWIM semua atlet aktif dalam kelas tersebut pada saat pengiriman. Pengiriman ulang permintaan yang sama tidak menambah pesan ganda. Ringkasan jumlah menunjukkan profil atlet yang menjadi tujuan, bukan konfirmasi pesan telah dibaca atau push berhasil diterima.

Notifikasi HP memerlukan dukungan browser, izin orang tua, dan langganan perangkat aktif. Pengumuman kelas menampilkan judul serta pesan pada notifikasi HP; notifikasi kehadiran/pembayaran tetap memakai pesan umum. Orang tua tanpa izin notifikasi masih dapat membaca pengumuman setelah membuka dashboard. Akun anak yang baru dibuat setelah pengiriman dapat membaca kabar yang telah tersimpan untuk profil itu, tetapi tidak mendapat push secara retroaktif.

Pengumuman bersifat informasi. Pencatatan Libur dan penambahan masa berlaku paket tetap melalui Jadwal latihan, menggunakan aturan yang sudah ada. Satu pengumuman Prestasi tidak otomatis mengubah jadwal sesi lain.

## ID dan rekap anggota

ID publik `BRTM-000123` berasal dari ID atlet yang sudah ada. Tidak ada penggantian foreign key. Nomor tidak menandakan total anggota dan dapat melompat. Nama, kelas, serta status dapat berubah tanpa mengganti ID. Saat anak bergabung kembali, aktifkan profil lama melalui Owner; jangan membuat profil kedua untuk anak yang sama.

Owner membuka Dashboard → Rekap anggota & ID. Angka terpisah meliputi total anggota unik dalam register, aktif saat ini, pendaftaran pada tahun pilihan, akumulasi pendaftaran sampai tahun pilihan, dan jumlah anak unik dengan absensi Hadir pada tahun pilihan. Rekap aktif adalah keadaan sekarang; bukan estimasi jumlah aktif pada akhir tahun lampau. Tanggal data lama mengikuti waktu pertama dimasukkan ke database. Sistem tidak menebak tanggal bergabung sebelum ada pencatatan. Register mempertahankan ID walaupun profil tanpa riwayat dihapus. Data anak yang sudah diarsipkan sebelum fitur ini dipasang tidak dipulihkan atau dihitung otomatis.

ID adalah identitas keanggotaan, bukan kata sandi atau token akses. Login orang tua yang ada tetap berlaku.

## Kritik dan saran

Orang tua membuka BRTM SWIM → Suara Ayah & Bunda → Kritik & saran pelatih. Orang tua memilih pelatih tujuan karena pelatih dapat bergantian mengajar, lalu mengirim masukan. Masukan memakai identitas anak pada sesi login, sehingga pengirim tidak dapat mengatasnamakan profil lain. Masukan tidak anonim: pelatih tujuan dan seluruh Owner aktif dapat melihat nama anak serta isinya. Orang tua lain dan pelatih lain tidak dapat membacanya.

Owner dan pelatih membuka Dashboard → Kritik & saran orang tua. Lencana menampilkan jumlah masukan yang belum dibuka. Penerima dapat menanggapi dan memilih Ditanggapi atau Selesai. Orang tua dapat membaca tanggapan di riwayat masukan serta menerima kabar BRTM SWIM. Notifikasi HP staf diaktifkan lewat tombol Dashboard; isi push staf bersifat umum tanpa mengutip kritik. Job push tetap terikat pada akun tujuan walaupun perangkat berpindah akun.

API menyimpan hingga 100 masukan terbaru per tampilan. Tidak ada penghapusan masukan melalui antarmuka. Profil dengan masukan hanya dapat dinonaktifkan. Arsip massal tester ditolak setelah masukan orang tua tercatat, agar riwayat tidak hilang. Cadangan Owner menyertakan register, pengumuman, masukan, tanggapan, dan notifikasi staf; langganan push/kunci/sesi tidak diekspor.

## Validasi dan batas pemeriksaan

`npm test` menjalankan pemeriksaan yang ada beserta `community.test.js`: isolasi peran dan anak, pengumuman per kelas, idempotensi, ID permanen saat aktivasi ulang, migrasi profil lama, rekap tahunan, tanggapan, status baca, antrean push, pergantian akun pada perangkat, dan isi cadangan. Pengiriman push diuji menggunakan pengirim tiruan; penerimaan oleh HP nyata harus diuji pada lingkungan percobaan dengan izin perangkat. Pemeriksaan browser visual otomatis belum dapat dijalankan dalam lingkungan ini karena pembatasan proses Chromium.

Perubahan disiapkan pada branch terpisah. Jangan menganggap fitur telah aktif pada aplikasi produksi hanya karena pull request tersedia.

# Event — catatan waktu lomba Prestasi

## Penggunaan

- BRTM Owner: menu Event → pilih atlet Prestasi → pilih tampilan kolam25/50m → Isi hasil event. Masukkan nama event, tempat, tanggal hasil dan babak; isi nomor yang diikuti lalu Simpan.
- Kolom tanggal/event memiliki Edit dan Hapus. Edit mempertahankan ID hasil nomor yang masih ada. Waktu yang dikosongkan saat edit menghapus nomor tersebut; tombol Hapus menghapus satu kolom event setelah konfirmasi.
- BRTM SWIM orang tua Prestasi: menu Event, dengan pilihan kolam25/50m. Kelas lain tidak mendapat menu atau data hasil lomba.
- Baris berisi empat gaya25/50/100/200m, IM100/200/400m dan bebas400/800/1500/2000m. Kolom berisi tanggal/event/babak. Menekan waktu membuka event, tempat, tanggal, kolam dan babak.
- Hijau = waktu lebih kecil; kuning = sama; jingga = lebih besar. Hasil pertama netral. Selisih dibanding hasil sebelumnya pada nomor dan panjang kolam yang sama; tidak mengonversi kolam25m ke50m. Urutan berdasarkan tanggal, babak, lalu ID pencatatan pada tanggal/babak yang sama. Warna menunjukkan perubahan hasil waktu, bukan diagnosis kondisi atlet.
- Format masukan: detik (38.32 atau38,32), menit:detik.sentidetik (1:27.43) atau format gambar (1.27.43). Disimpan pada ketelitian0.01detik.

## Data dan akses

Hasil lomba memakai `data_klub.jenis=hasillomba`, terpisah dari `catatanwaktu` hasil tes latihan. Tidak ada migrasi otomatis hasil lama yang belum jelas apakah lomba atau latihan. Data lama tetap tersedia di menu sebelumnya.

CRUD khusus Owner melalui `/api/owner/race-results`. Parent mendapat proyeksi hasil anak dari sesi loginnya sendiri, hanya bila kelasnya Prestasi. Semua data tersimpan di server, tanpa penyimpanan hasil pribadi di browser/offline cache. Pembaruan pada halaman yang sudah terbuka mengikuti mekanisme Muat ulang yang menjaga posisi/draf.

Simpan/edit/hapus satu event bersifat atomik, memakai kunci transaksi klub, validasi nomor/pool/tanggal, penolakan metadata event ganda, dan pemeriksaan revisi untuk perubahan basi. Identitas atlet pada event tersimpan tidak dapat dipindah lewat edit. Catatan request idempoten tetap ada setelah event dihapus, sehingga retry tidak menghidupkan kembali hasil lama. Perubahan/hapus masuk audit. Data dan catatan request ikut backup/restorasi `data_klub`; indeks parsial menjaga pencarian dan keunikan hasil/request.

## Validasi

`node race-results.test.js`:65 pemeriksaan API ditambah DOM Parent/Owner, termasuk simpan/edit/hapus aktual,25/50m terpisah,25m anak,format waktu,pembanding awal/cepat/tetap/lambat,perhitungan ulang setelah edit/hapus,detail dan escaping,isolasi anak,kelas/role,retry,ganda,revisi basi,backup/audit.

Regresi lulus: parent-portal, parent-profile-sync, owner-swim, releases, pwa, swim-refresh, attendance-refresh, integration, prestasi, workflow, paid-roster. Pemeriksaan sintaks seluruh JavaScript dan `git diff --check` juga lulus.

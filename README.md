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

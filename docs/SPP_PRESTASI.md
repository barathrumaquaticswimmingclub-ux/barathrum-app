# SPP Prestasi berdasarkan kehadiran

- Kehadiran pertama pada suatu bulan membuat satu tagihan Rp250.000, jatuh tempo akhir bulan WIB. Kehadiran berikutnya tidak membuat tagihan baru.
- Nol kehadiran berarti tidak ada SPP bulan tersebut. Koreksi atau penghapusan kehadiran terakhir membatalkan kewajiban, bukan menghapus riwayat.
- Uang yang sudah diterima tetap tercatat ketika kewajiban dibatalkan. Rp250.000 menjadi kredit atlet dan otomatis dialokasikan ke tagihan tertua. Penggunaan kredit bukan pemasukan uang baru.
- Koreksi absensi yang memengaruhi kredit yang telah digunakan membekukan perhitungan keuangan sampai Owner menyetujui di dashboard. Tinjauan menampilkan bulan dan nominal sebelum/sesudah; data yang berubah setelah tinjauan harus dimuat ulang sebelum persetujuan.
- Pengiriman ulang pembayaran dengan kode permintaan yang sama tidak menambah penerimaan. Pembayaran berikutnya menggunakan formulir baru. Koreksi penerimaan memerlukan alasan dan disimpan dalam audit.
- Riwayat SPP otomatis tidak dapat dihapus. Cadangan mencakup penerimaan, saldo/alokasi, permintaan koreksi, dan audit. Arsip massal tester diblokir bila sudah ada penerimaan atau koreksi SPP tertunda agar riwayat keuangan tidak hilang.

Saat server mulai, migrasi mengimpor pembayaran Prestasi lama satu kali dan menghitung ulang tagihan dari absensi. Migrasi berulang tidak menggandakan tagihan/penerimaan. Data lama dengan periode tidak valid atau tagihan ganda perlu diperiksa Owner; migrasi berhenti daripada menebak penyelesaiannya.

Private Class dibatasi tepat satu anak untuk satu pelatih pada pembuatan maupun perubahan jadwal, melalui antarmuka dan validasi server.

## Validasi

`npm test` menjalankan pengujian API, peran/privasi, formulir, PWA, program, prestasi, operasional, komunitas, dan SPP. `node spp.test.js` menguji nol hadir, tagihan bulanan, koreksi/hapus, kredit/FIFO, persetujuan Owner dan tinjauan kedaluwarsa, pengiriman ulang, beberapa penerimaan, laporan per bulan, pencadangan, aktivasi ulang, perlindungan arsip, serta kapasitas Private.

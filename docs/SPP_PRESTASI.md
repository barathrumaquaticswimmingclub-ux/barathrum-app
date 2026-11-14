# SPP Prestasi: pembayaran mengaktifkan atlet

- Konfirmasi pembayaran Lunas langsung mengaktifkan atlet, termasuk ketika absensi masih 0.
- Pembayaran mengikat SPP pada bulan tagihan tersebut. Nol kehadiran maupun koreksi/penghapusan absensi tidak mengubah pembayaran menjadi saldo kredit.
- Bulan tanpa kehadiran dan tanpa pembayaran tidak ditagih. Kehadiran pertama membuat satu tagihan bulanan Rp250.000.
- Penerimaan membayar bulan tagihannya terlebih dahulu. Hanya kelebihan saldo yang tersedia untuk alokasi ke tagihan lain; penerimaan uang tidak dihitung dua kali.
- Koreksi pembayaran tetap memerlukan alasan dan audit; pengiriman ulang pembayaran tidak menambah penerimaan.
- Saat server mulai, perhitungan lama diperbaiki berdasarkan penerimaan yang sudah tercatat tanpa membuat pembayaran baru. Permintaan koreksi absensi lama diselesaikan berdasarkan aturan pembayaran ini dan dicatat dalam audit.
- Jatuh tempo mengikuti tanggal pembayaran pertama, dengan penyesuaian akhir bulan pendek. Pemberitahuan invoice diberikan setiap akhir bulan.
- Riwayat SPP otomatis tidak dapat dihapus. Cadangan mencakup penerimaan, alokasi, koreksi dan audit.

Private Class dibatasi tepat satu anak untuk satu pelatih pada pembuatan maupun perubahan jadwal, melalui antarmuka dan validasi server.

## Validasi

`npm test` menjalankan pengujian API, peran/privasi, formulir, PWA, program, prestasi, operasional, komunitas, dan SPP. `node spp.test.js` menguji nol hadir, tagihan bulanan, koreksi/hapus, kredit/FIFO, persetujuan Owner dan tinjauan kedaluwarsa, pengiriman ulang, beberapa penerimaan, laporan per bulan, pencadangan, aktivasi ulang, perlindungan arsip, serta kapasitas Private.

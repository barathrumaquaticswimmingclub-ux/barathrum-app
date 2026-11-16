# SPP Prestasi: pembayaran mengaktifkan atlet

- Konfirmasi pembayaran Lunas langsung mengaktifkan atlet, termasuk ketika absensi masih 0.
- Pembayaran mengikat SPP pada periode tagihan tersebut. Periode mengikuti tanggal pembayaran pertama, misalnya 28 November–28 Desember, lalu 28 Desember–28 Januari (tanggal akhir merupakan awal periode berikutnya). Nol kehadiran maupun koreksi/penghapusan absensi tidak mengubah pembayaran menjadi saldo kredit.
- Periode tanpa kehadiran dan tanpa pembayaran tidak ditagih. Kehadiran pertama dalam periode membuat satu tagihan Rp250.000; pergantian bulan kalender tidak membuat tagihan tambahan dalam periode yang sudah lunas.
- Penerimaan membayar bulan tagihannya terlebih dahulu. Hanya kelebihan saldo yang tersedia untuk alokasi ke tagihan lain; penerimaan uang tidak dihitung dua kali.
- Koreksi pembayaran tetap memerlukan alasan dan audit; pengiriman ulang pembayaran tidak menambah penerimaan.
- Saat server mulai, perhitungan lama diperbaiki berdasarkan penerimaan yang sudah tercatat tanpa membuat pembayaran baru. Permintaan koreksi absensi lama diselesaikan berdasarkan aturan pembayaran ini dan dicatat dalam audit.
- Invoice dan batas toleransi pembayaran berada pada hari terakhir bulan awal periode (WIB), bukan pada awal bulan berikutnya. Contoh: bayar 28 November melunasi November–Desember; tidak ada invoice baru 30 November atau 1 Desember. Periode Desember–Januari yang belum lunas dan memiliki kehadiran diinvoiskan 31 Desember. Februari menyesuaikan 28/29 hari; tanggal jangkar 31 kembali ke 31 pada bulan panjang. Pembayaran lebih awal menghilangkan invoice periode yang sudah lunas. Uang masuk tetap mengikuti tanggal penerimaan, bukan label periode.
- Riwayat SPP otomatis tidak dapat dihapus. Cadangan mencakup penerimaan, alokasi, koreksi dan audit.

Kapasitas per pelatih diterapkan pada jadwal per tanggal dan jadwal mingguan: Private 1, Private Couple 2, Semi Private 3, Group/Hydro Terapi 6, Regular 16; Prestasi tanpa batas peserta. Owner tetap dapat mengubah peserta jadwal Regular. Private dengan tanggal lahir yang diketahui minimal berusia 4 tahun.

## Validasi

`npm test` menjalankan pengujian API, peran/privasi, formulir, PWA, program, prestasi, operasional, komunitas, dan SPP. `node spp.test.js` menguji nol hadir, tagihan bulanan, koreksi/hapus, kredit/FIFO, persetujuan Owner dan tinjauan kedaluwarsa, pengiriman ulang, beberapa penerimaan, laporan per bulan, pencadangan, aktivasi ulang, perlindungan arsip, serta kapasitas Private.

## Audit peluncuran 15 November 2026

Sandi orang tua `brtm` dipertahankan atas keputusan Owner. Login berhasil tidak menghabiskan batas percobaan gagal untuk pengguna dalam satu jaringan; batas per akun dan kegagalan per IP tetap berlaku.

Peraturan publik dan teks PDF/pemberitahuan invoice tidak lagi memuat klausul batas bayar akhir bulan, bebas SPP karena nol hadir, atau administrasi/pendampingan event. Perubahan ini tidak mengubah transaksi historis.

`npm run audit:200` memerlukan PostgreSQL lokal kosong bernama `brtm_audit_*`, `BRTM_AUDIT_DATABASE_URL`, dan `pg_dump`/`pg_restore` (opsional lokasi binari melalui `BRTM_AUDIT_PG_BIN`). Menjalankan 200 akun sintetis dengan permintaan HTTP serentak, seluruh tabel dicadangkan dan dipulihkan ke database baru. Skrip menolak host jarak jauh/database produksi. Pengujian ini berbeda dari uji beban produksi dan pemulihan volume Railway produksi.

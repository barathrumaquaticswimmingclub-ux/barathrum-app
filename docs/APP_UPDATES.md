# Pembaruan wajib BRTM dan BRTM SWIM

Setiap deploy menghitung ID rilis dari modul aplikasi, package.json dan seluruh aset publik. HTML staf dan orang tua selalu mendapat ID yang sesuai server. Perubahan ikon, tampilan, sistem, atau peraturan dalam paket rilis memicu ID baru tanpa menaikkan angka manual. Perubahan transaksi/paket individual di database bukan rilis aplikasi.

Pemeriksa versi dimuat sebelum skrip aplikasi. Ia memeriksa saat membuka, pageshow/kembali dari latar belakang, fokus, dan setiap menit saat terlihat. Pembacaan awal memerlukan internet; pemeriksaan latar yang berhasil tidak mengganggu isian. Versi lama menampilkan dialog pembaruan tanpa tombol lewati, dan API operasional menolak versi yang hilang/tidak sesuai dengan HTTP 428. Permintaan mutasi dari versi lama tidak dijalankan. Setelah menekan Perbarui aplikasi, halaman dimuat ulang; isian yang belum dikirim tidak disimpan. Sesi akun, langganan push dan data klub tidak dihapus oleh mekanisme ini.

Dokumen unduhan dan foto tetap memakai autentikasi yang ada karena navigasi/image tidak dapat memasang header versi halaman. Logout, health, metadata rilis, integrasi Google Form berkunci, formulir pendaftaran publik dan halaman pemasangan tidak diwajibkan mengirim header versi. Header versi adalah pemeriksaan kompatibilitas, bukan pengganti autentikasi dan bukan bukti kriptografis isi aplikasi pengguna.

URL ikon manifest otomatis diberi hash isi; ID dan scope aplikasi tetap. Skrip service worker yang disajikan juga memiliki ID rilis dan ikon notifikasi terbaru. Tidak melakukan unregister paksa, penghapusan data browser atau langganan push. URL manifest dan identitas kedua aplikasi tetap terpisah.

Ikon launcher/layar utama dikendalikan browser dan OS. Aplikasi web tidak dapat membaca ikon terpasang atau menjamin bahwa semua HP langsung mengubahnya. Pada mode terpasang, perubahan ikon/konfirmasi pertama membuka petunjuk Android/iPhone dengan ikon terbaru dan tombol konfirmasi pengguna. Satu-satunya penyimpanan browser baru adalah hash ikon publik per aplikasi, tanpa identitas anak, transaksi atau kredensial. Konfirmasi itu pernyataan pengguna, bukan deteksi pemasangan. Jika ikon masih lama, pengguna mengikuti Review app update di Chrome bila tersedia atau memasang kembali pintasan. Memasang ulang dapat memerlukan login/izin notifikasi kembali; data server tetap ada.

Klien yang sudah terbuka sebelum fitur ini dipasang perlu ditutup/dibuka ulang sekali. API akan menolak permintaan operasional dari halaman lama tanpa header versi. Tidak ada cara menyuntikkan pemeriksa baru ke JavaScript yang sudah berjalan pada HP tanpa memuat ulang.

Validasi: seluruh npm test, termasuk releases.test.js untuk kedua aplikasi, API stale/current, sesi Owner/orang tua lintas perubahan versi, penolakan mutasi lama, koneksi putus/retry, iframe/dialog gate, konfirmasi ikon manual, header forwarding, worker JS dan hash ikon. Pengujian perangkat fisik/ikon launcher tidak diklaim.

Referensi perilaku OS/browser: https://web.dev/learn/pwa/update dan https://developer.chrome.com/blog/improvements-to-web-app-updates

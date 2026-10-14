const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>BARATHRUM A.S.C</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          background: #eaf4ff;
          margin: 0;
          padding: 20px;
          color: #123456;
        }
        .box {
          background: white;
          padding: 24px;
          border-radius: 16px;
          max-width: 600px;
          margin: 30px auto;
          box-shadow: 0 4px 15px #0001;
        }
        h1 { color: #0879bd; }
        .menu {
          padding: 14px;
          margin: 10px 0;
          background: #eaf4ff;
          border-radius: 10px;
        }
      </style>
    </head>
    <body>
      <div class="box">
        <h1>🏊 BARATHRUM A.S.C</h1>
        <p>BARATHRUM AQUATIC SWIMMING CLUB</p>
        <hr>
        <h2>Management System</h2>
        <div class="menu">🏊 Data Atlet</div>
        <div class="menu">🧑‍🏫 Data Pelatih</div>
        <div class="menu">📅 Jadwal Latihan</div>
        <div class="menu">📝 Absensi</div>
        <div class="menu">💰 Pembayaran</div>
        <div class="menu">📊 Laporan</div>
        <p>Website BARATHRUM berhasil dibuka.</p>
      </div>
    </body>
    </html>
  `);
});

let data = {
  atlet: [],
  pelatih: [],
  jadwal: [],
  absensi: [],
  pembayaran: []
};

app.get("/api", (req, res) => {
  res.json({
    nama: "BARATHRUM AQUATIC SWIMMING CLUB",
    status: "Aktif",
    fitur: [
      "Data Atlet",
      "Data Pelatih",
      "Jadwal",
      "Absensi",
      "Pembayaran",
      "Laporan"
    ]
  });
});

app.get("/api/:jenis", (req, res) => {
  const jenis = req.params.jenis;

  if (!Object.prototype.hasOwnProperty.call(data, jenis)) {
    return res.status(404).json({ pesan: "Data tidak ditemukan" });
  }

  res.json(data[jenis]);
});

app.post("/api/:jenis", (req, res) => {
  const jenis = req.params.jenis;

  if (!Object.prototype.hasOwnProperty.call(data, jenis)) {
    return res.status(404).json({ pesan: "Jenis data tidak ditemukan" });
  }

  const item = {
    id: Date.now().toString(),
    ...req.body
  };

  data[jenis].push(item);

  res.status(201).json({
    pesan: "Data berhasil ditambahkan",
    data: item
  });
});

app.delete("/api/:jenis/:id", (req, res) => {
  const jenis = req.params.jenis;

  if (!Object.prototype.hasOwnProperty.call(data, jenis)) {
    return res.status(404).json({ pesan: "Jenis data tidak ditemukan" });
  }

  const jumlahAwal = data[jenis].length;

  data[jenis] = data[jenis].filter(
    item => item.id !== req.params.id
  );

  if (data[jenis].length === jumlahAwal) {
    return res.status(404).json({ pesan: "Data tidak ditemukan" });
  }

  res.json({ pesan: "Data berhasil dihapus" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`BARATHRUM APP berjalan pada port ${PORT}`);
});

const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

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

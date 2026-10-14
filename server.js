const express = require("express");
const { Pool } = require("pg");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false
});

const tabel = [
  "atlet",
  "pelatih",
  "jadwal",
  "absensi",
  "pembayaran"
];

async function siapkanDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS data_klub (
      id SERIAL PRIMARY KEY,
      jenis VARCHAR(30) NOT NULL,
      data JSONB NOT NULL,
      dibuat_pada TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

app.get("/api", async (req, res) => {
  res.json({
    nama: "BARATHRUM AQUATIC SWIMMING CLUB",
    status: "Aktif",
    database: "PostgreSQL",
    fitur: [
      "Data Atlet",
      "Data Pelatih",
      "Jadwal Latihan",
      "Absensi",
      "Pembayaran",
      "Laporan"
    ]
  });
});

app.get("/api/:jenis", async (req, res) => {
  try {
    const { jenis } = req.params;

    if (!tabel.includes(jenis)) {
      return res.status(404).json({
        pesan: "Jenis data tidak ditemukan"
      });
    }

    const hasil = await pool.query(
      "SELECT id, data FROM data_klub WHERE jenis = $1 ORDER BY id DESC",
      [jenis]
    );

    res.json(
      hasil.rows.map(row => ({
        ...row.data,
        id: String(row.id)
      }))
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({
      pesan: "Gagal mengambil data"
    });
  }
});

app.post("/api/:jenis", async (req, res) => {
  try {
    const { jenis } = req.params;

    if (!tabel.includes(jenis)) {
      return res.status(404).json({
        pesan: "Jenis data tidak ditemukan"
      });
    }

    if (
      !req.body ||
      typeof req.body !== "object" ||
      Array.isArray(req.body)
    ) {
      return res.status(400).json({
        pesan: "Data tidak valid"
      });
    }

    const hasil = await pool.query(
      "INSERT INTO data_klub (jenis, data) VALUES ($1, $2) RETURNING id, data",
      [jenis, JSON.stringify(req.body)]
    );

    res.status(201).json({
      pesan: "Data berhasil disimpan",
      data: {
        ...hasil.rows[0].data,
        id: String(hasil.rows[0].id)
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      pesan: "Gagal menyimpan data"
    });
  }
});

app.delete("/api/:jenis/:id", async (req, res) => {
  try {
    const { jenis, id } = req.params;

    if (!tabel.includes(jenis)) {
      return res.status(404).json({
        pesan: "Jenis data tidak ditemukan"
      });
    }

    if (!/^\d+$/.test(id)) {
      return res.status(400).json({
        pesan: "ID tidak valid"
      });
    }

    const hasil = await pool.query(
      "DELETE FROM data_klub WHERE jenis = $1 AND id = $2 RETURNING id",
      [jenis, Number(id)]
    );

    if (hasil.rowCount === 0) {
      return res.status(404).json({
        pesan: "Data tidak ditemukan"
      });
    }

    res.json({
      pesan: "Data berhasil dihapus"
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      pesan: "Gagal menghapus data"
    });
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

async function mulaiServer() {
  try {
    await siapkanDatabase();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(
        `BARATHRUM APP berjalan pada port ${PORT}`
      );
    });
  } catch (error) {
    console.error("Gagal menyiapkan database:", error);
    process.exit(1);
  }
}

mulaiServer();

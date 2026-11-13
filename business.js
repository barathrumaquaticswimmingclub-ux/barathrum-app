'use strict';

const CLASSES = Object.freeze({
  'Private Class': { tarif: 400000, sesi: 4 },
  'Semi Private Class': { tarif: 200000, sesi: 4 },
  'Group Class': { tarif: 150000, sesi: 4 },
  'Private Couple Class': { tarif: 300000, sesi: 4 },
  'Hydro Terapi Class': { tarif: 300000, sesi: 4 },
  'Regular Class (1x Seminggu)': { tarif: 150000, sesi: 4 },
  'Regular Class (2x Seminggu)': { tarif: 250000, sesi: 8 },
  'Prestasi Class': { tarif: 250000, sesi: null }
});
function canonical(value) {
  return String(value || '').replace(/^Reguler Class/, 'Regular Class');
}
function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= '1900-01-01' && value <= '2200-12-31';
}
function addMonth(value) {
  if (!validDate(value)) throw new Error('Tanggal tidak valid');
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m, Math.min(d, new Date(Date.UTC(y, m + 1, 0)).getUTCDate()))).toISOString().slice(0, 10);
}
function addDays(value, days) { return new Date(new Date(value+'T00:00:00Z').getTime()+days*86400000).toISOString().slice(0,10); }
function monthEnd(value) {
  const [y, m] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
function discountSchool(value) {
  const name = String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return ['dbs','dancingbeeschool','tec','tecsalatiga','aba5','tkaba5','tkaba5salatiga','ebenhaezer','tkebenhaezer','sdebenhaezer','smpkristenebenhaezer','sdkristenebenhaezer'].includes(name);
}
function price(input, athlete) {
  const jenisKelas = canonical(input.jenisKelas || athlete.kelompok);
  const kelas = CLASSES[jenisKelas];
  if (!kelas) throw new Error('Pilih jenis kelas yang tersedia');
  if (!validDate(input.tanggal)) throw new Error('Isi tanggal mulai yang valid');
  if (!['Lunas', 'Belum Lunas'].includes(input.status)) throw new Error('Pembayaran hanya Lunas atau Belum Lunas');
  const wantsDiscount = input.diskonSekolah === true || input.diskonSekolah === 'true';
  if (wantsDiscount && (jenisKelas === 'Prestasi Class' || !discountSchool(athlete.sekolah))) throw new Error('Diskon Rp25.000 hanya untuk DBS, ABA 5, Ebenhaezer, dan TEC pada kelas nonprestasi');
  let biayaPendaftaran = input.anggotaBaru === true || input.anggotaBaru === 'true' ? 50000 : 0;
  let potonganDiskon = wantsDiscount ? 25000 : 0;
  const custom = input.paketKhusus === true || input.paketKhusus === 'true';
  const kuota = custom ? Number(input.kuotaKhusus) : kelas.sesi;
  const tarif = custom || input.rincianOwner===true && jenisKelas==='Prestasi Class' ? Number(input.biayaKhusus??kelas.tarif) : kelas.tarif;
  if(!Number.isSafeInteger(tarif)||tarif<1||tarif>100000000)throw new Error('Harga harus berupa rupiah bulat yang valid');
  if (custom && (jenisKelas === 'Prestasi Class' || !Number.isInteger(kuota) || kuota < 1 || kuota > 100 || !Number.isSafeInteger(tarif) || tarif < 1 || tarif > 100000000)) throw new Error('Paket khusus nonprestasi: kuota 1–100 dan biaya rupiah bulat harus valid');
  if(input.rincianOwner===true){
    biayaPendaftaran=Number(input.biayaPendaftaran??0);potonganDiskon=Number(input.potonganDiskon??0);
    if(!Number.isSafeInteger(biayaPendaftaran)||biayaPendaftaran<0||biayaPendaftaran>100000000||!Number.isSafeInteger(potonganDiskon)||potonganDiskon<0||potonganDiskon>tarif)throw new Error('Biaya pendaftaran dan diskon harus berupa rupiah bulat yang valid');
  }
  if(tarif < potonganDiskon)throw new Error('Diskon tidak boleh melebihi biaya paket');
  const alasanKhusus = custom ? String(input.alasanKhusus || '').trim() : '';
  if (custom && (alasanKhusus.length < 5 || alasanKhusus.length > 500)) throw new Error('Isi keterangan paket khusus (5–500 karakter)');
  return {
    paketKhusus:custom, alasanKhusus, ...(jenisKelas==='Prestasi Class'&&input.rincianOwner===true?{sppHargaOwner:tarif,sppPotonganOwner:potonganDiskon}:{}), jenisKelas, jumlah: tarif, biayaPendaftaran, potonganDiskon,
    totalTagihan: tarif + biayaPendaftaran - potonganDiskon,
    status: input.status, tanggal: input.tanggal,
    tanggalBerakhir: jenisKelas === 'Prestasi Class' ? monthEnd(input.tanggal) : addMonth(input.tanggal),
    jatuhTempo: jenisKelas === 'Prestasi Class' ? monthEnd(input.tanggal) : input.tanggal,
    periode: input.tanggal.slice(0, 7), totalPertemuan: kuota,
    statusPendaftaran: biayaPendaftaran ? 'Anggota Baru' : 'Anggota Lama',
    jenisDiskon: wantsDiscount ? 'Diskon Sekolah' : 'Tidak Ada Diskon'
  };
}
function packageView(item, attendanceCount = 0) {
  const jenisKelas = canonical(item.jenisKelas);
  const total = item.totalPertemuan ?? CLASSES[jenisKelas]?.sesi ?? null;
  const pemakaianAwal = item.pemakaianAwal ?? (Number.isInteger(item.sisaPertemuan) && total !== null ? Math.max(0, total - item.sisaPertemuan) : 0);
  const used = pemakaianAwal + attendanceCount;
  const end = item.pengecualian?.berlakuSampai > item.tanggalBerakhir ? item.pengecualian.berlakuSampai : item.tanggalBerakhir;
  const sisa = total === null ? null : Math.max(0, total - used);
  const statusMasaBerlaku = !end ? 'Perlu diperiksa' : end < today() ? 'Kedaluwarsa' : item.tanggal > today() ? 'Belum mulai' : sisa === 0 ? 'Habis' : 'Aktif';
  return { ...item, jenisKelas, totalPertemuan: total, pemakaianAwal, terpakai: used, sisaPertemuan: sisa, berlakuSampai: end, statusMasaBerlaku: jenisKelas!=='Prestasi Class'&&item.statusManual&&['Aktif','Kedaluwarsa'].includes(item.statusManual)?item.statusManual:statusMasaBerlaku, totalTagihan: Number(item.totalTagihan ?? item.jumlah ?? 0) };
}
function cashReceived(p,month=''){if(month){if(p.penerimaanPerBulan)return Number(p.penerimaanPerBulan[month]||0);if(!(p.dibayarPada||p.tanggal)?.startsWith(month))return 0;}return Number(p.penerimaanTunai??(p.status==='Lunas'?p.totalTagihan??p.jumlah??0:0));}
module.exports = { cashReceived, CLASSES, canonical, today, validDate, addMonth, monthEnd, addDays, discountSchool, price, packageView };

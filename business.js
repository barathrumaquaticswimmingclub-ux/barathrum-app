'use strict';

const CLASSES = Object.freeze({
  'Private Class': { tarif: 400000, sesi: 4, kapasitas: 1 },
  'Semi Private Class': { tarif: 200000, sesi: 4, kapasitas: 3 },
  'Group Class': { tarif: 150000, sesi: 4, kapasitas: 6 },
  'Private Couple Class': { tarif: 300000, sesi: 4, kapasitas: 2 },
  'Hydro Terapi Class': { tarif: 300000, sesi: 4, kapasitas: 6 },
  'Regular Class (1x Seminggu)': { tarif: 150000, sesi: 4, kapasitas: 16 },
  'Regular Class (2x Seminggu)': { tarif: 250000, sesi: 8, kapasitas: 16 },
  'Prestasi Class': { tarif: 250000, sesi: null, kapasitas: null }
});
function validateCapacity(kind, count) {
  const kelas = CLASSES[canonical(kind)];
  if (!kelas) throw Object.assign(Error('Pilih kelas'), {status:400});
  if (kelas.kapasitas !== null && count > kelas.kapasitas) throw Object.assign(Error(`${canonical(kind)} maksimal ${kelas.kapasitas} anak untuk 1 pelatih.`), {status:400});
}
function validateAge(athlete) {
  if(canonical(athlete.kelompok)!=='Private Class'||!athlete.tanggalLahir)return;
  const now=today(),birth=athlete.tanggalLahir;
  const age=Number(now.slice(0,4))-Number(birth.slice(0,4))-(now.slice(5)<birth.slice(5)?1:0);
  if(age<2)throw Object.assign(Error('Private Class minimal usia 2 tahun.'),{status:400});
}
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
// A period uses the first payment day; payment tolerance ends on the last day of its start month.
function prestasiStart(month,first){const base=month+'-01';if(!validDate(base))return null;return month+'-'+String(validDate(first)?Math.min(Number(first.slice(8,10)),Number(monthEnd(base).slice(8,10))):1).padStart(2,'0');}
function prestasiPeriod(date,first){
 if(!validDate(date))return null;
 const month=date.slice(0,7);
 // Keep obligations accrued before the first payment in their original calendar month.
 if(!validDate(first)||date<=first||date>=prestasiStart(month,first))return month;
 return addDays(month+'-01',-1).slice(0,7);
}
function prestasiCycle(month,first){
 const start=prestasiStart(month,first);if(!start)return {};
 const end=prestasiStart(addMonth(month+'-01').slice(0,7),first);
 const name=value=>new Intl.DateTimeFormat('id-ID',{month:'long',year:'numeric',timeZone:'Asia/Jakarta'}).format(new Date(value+'T12:00:00Z'));
 return {periodeMulai:start,periodeSelesai:end,periodeLabel:name(start)+' – '+name(end),invoicePada:monthEnd(start)};
}
function prestasiDue(month){return validDate(month+'-01')?monthEnd(month+'-01'):null;}
function prestasiView(item,first,now=module.exports.today()){
 const cycle=prestasiCycle(item.periode||item.tanggal?.slice(0,7),first);
 return {...item,...cycle,tanggalPembayaranPertama:first||null,jatuhTempo:cycle.invoicePada,tanggalBerakhir:cycle.periodeSelesai,invoiceTersedia:item.status==='Lunas'||Number(item.totalTagihan)>0&&!!cycle.invoicePada&&now>=cycle.invoicePada};
}
function prestasiNextDue(packs,first,now=module.exports.today()){
 const unpaid=packs.filter(p=>p.jenisKelas==='Prestasi Class'&&p.status==='Belum Lunas'&&p.totalTagihan>0).map(p=>prestasiDue(p.periode||p.tanggal.slice(0,7),first)).filter(Boolean).sort();if(unpaid.length)return unpaid[0];if(!validDate(first))return null;
 let month=prestasiPeriod(now,first);
 // Advance through payments made ahead of time, without extending the original anchor.
 while(packs.some(p=>p.periode===month&&p.status==='Lunas'&&!p.sppTidakDitagih))month=addMonth(month+'-01').slice(0,7);
 return prestasiDue(month);
}
module.exports = { validateAge, validateCapacity, cashReceived, CLASSES, canonical, today, validDate, addMonth, monthEnd, addDays, discountSchool, price, packageView, prestasiDue, prestasiNextDue, prestasiPeriod, prestasiCycle, prestasiView };

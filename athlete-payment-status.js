'use strict';
const B=require('./business');
function prestasi(packs,first,hasAttendance=false,pending=false,today=B.today()){
 const cycle=B.prestasiPeriod(today,first),bills=packs.filter(p=>B.canonical(p.jenisKelas)==='Prestasi Class');
 const paid=bills.filter(p=>p.status==='Lunas'&&!p.sppTidakDitagih);
 const current=paid.find(p=>p.periode===cycle||p.periodeMulai<=today&&p.periodeSelesai>today);
 const next=paid.filter(p=>p.periodeMulai>today).sort((a,b)=>a.periodeMulai.localeCompare(b.periodeMulai))[0];
 const unpaid=bills.find(p=>p.status==='Belum Lunas'&&p.totalTagihan>0);
 const detail=p=>p.periodeLabel||p.periode||p.tanggal||'';
 if(pending)return {statusSPP:'Menunggu Persetujuan Owner',statusSPPDetail:'Perhitungan SPP sedang ditinjau Owner.',sppPeriodeAktifLunas:!!current};
 if(unpaid)return {statusSPP:'Belum Lunas',statusSPPDetail:'Tagihan belum lunas: '+detail(unpaid),sppPeriodeAktifLunas:!!current};
 if(current)return {statusSPP:'Lunas',statusSPPDetail:'Lunas periode '+detail(current),sppPeriodeAktifLunas:true};
 if(hasAttendance)return {statusSPP:'Belum Lunas',statusSPPDetail:'Ada kehadiran pada periode aktif yang belum dilunasi.'};
 if(next)return {statusSPP:'Lunas',statusSPPDetail:'Pembayaran di muka: '+detail(next)+' · mulai '+next.periodeMulai,sppPeriodeAktifLunas:false};
 const latest=[...paid].sort((a,b)=>String(b.periode||b.tanggal).localeCompare(String(a.periode||a.tanggal)))[0];
 if(latest)return {statusSPP:'Lunas',statusSPPDetail:'Terakhir lunas: '+detail(latest)+'. Periode aktif belum memiliki tagihan; pembayaran lama tidak memperpanjang masa berlaku.',sppPeriodeAktifLunas:false};
 return {statusSPP:'Tidak Ada SPP Bulan Ini',statusSPPDetail:'Belum ada tagihan dan belum ada pembayaran tercatat untuk periode aktif.',sppPeriodeAktifLunas:false};
}
module.exports={prestasi};

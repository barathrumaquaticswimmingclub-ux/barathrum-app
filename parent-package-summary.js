'use strict';
const B=require('./business');
// Combine usable balances and prepaid upcoming packages without changing their terms.
function summary(packs,kelas){
 const related=packs.filter(p=>!p.dibatalkan&&B.canonical(p.jenisKelas)===B.canonical(kelas));
 const current=related.find(p=>p.statusMasaBerlaku==='Aktif')||related[0];
 const balances=related.filter(p=>p.sisaPertemuan>0&&(p.statusMasaBerlaku==='Aktif'||p.statusMasaBerlaku==='Belum mulai'&&p.status==='Lunas'));
 return {sisaPertemuan:balances.length?balances.reduce((n,p)=>n+p.sisaPertemuan,0):current?0:null,
  berlakuSampai:balances.map(p=>p.berlakuSampai).filter(Boolean).sort().at(-1)||current?.berlakuSampai||null,
  rincianKuota:balances.map(p=>({sisa:p.sisaPertemuan,mulai:p.tanggal,berlakuSampai:p.berlakuSampai,status:p.statusMasaBerlaku}))};
}
module.exports={summary};

'use strict';
const B=require('./business');
function paidCovers(p,date){
 if(p.status!=='Lunas'||p.statusManual==='Kedaluwarsa'||p.sppTidakDitagih)return false;
 const prestasi=B.canonical(p.jenisKelas)==='Prestasi Class';
 const start=prestasi?(p.periodeMulai||p.tanggal):p.tanggal;
 if(!B.validDate(start)||!B.validDate(date))return false;
 const end=p.pengecualian?.berlakuSampai||(prestasi?p.periodeSelesai:null)||p.tanggalBerakhir||B.addMonth(start);
 return B.validDate(end)&&start<=date&&(prestasi&&p.periodeSelesai?date<end:date<=end);
}
module.exports={paidCovers};

'use strict';
const B=require('./business'),P=require('./profile');
const fail=message=>Object.assign(Error(message),{status:400});
const words=(v,label,max=10000)=>{if(v==null)return '';if(typeof v!=='string'||v.trim().length>max)throw fail(label+' tidak valid');return v.trim();};
function groups(p){return Array.isArray(p.grupProgram)?p.grupProgram:p.fotoProgram||p.swimming?[{nomor:1,swimming:p.swimming||'',foto:p.fotoProgram}]:[];}
function prepare(input,old){
 const out={...old};
 if(!['Program','Event'].includes(input.jenis))throw fail('Pilih Program atau Event');
 out.jenis=input.jenis;
 out.tanggal=old?.tanggal||B.today();
 out.judul=old?.judul||`${out.jenis} Prestasi · ${out.tanggal}`;
 out.detail=words(input.detail,'Detail event');if(out.jenis==='Event'&&!out.detail)throw fail('Isi detail event');
 for(const k of ['dryland','evaluasi','swimming','grup'])out[k]=words(input[k]??old?.[k],k,k==='grup'?150:10000);
 out.sesi=input.sesi||old?.sesi||'Sore';
 if(!['Pagi','Sore'].includes(out.sesi))throw fail('Pilih sesi Pagi atau Sore');
 out.lokasi=out.jenis==='Program'?(out.sesi==='Pagi'?'Kolam Kalitaman':'Kolam Renang Pondok Selfie'):words(input.lokasi,'Lokasi',300);
 if(Object.hasOwn(input,'grupProgram')){
  if(!Array.isArray(input.grupProgram)||input.grupProgram.length>4)throw fail('Maksimal empat grup program');
  const previous=groups(old||{}),seen=new Set();
  out.grupProgram=input.grupProgram.map(g=>{
   if(!g||!Number.isInteger(g.nomor)||g.nomor<1||g.nomor>4||seen.has(g.nomor))throw fail('Nomor grup harus unik, antara 1 dan 4');seen.add(g.nomor);
   const foto=g.hapusFoto===true?null:g.foto?P.photo(g.foto):previous.find(p=>p.nomor===g.nomor)?.foto||null;
   return {nomor:g.nomor,swimming:words(g.swimming,'Swimming Grup '+g.nomor),...(foto?{foto}:{})};
  }).filter(g=>g.swimming||g.foto).sort((a,b)=>a.nomor-b.nomor);
  delete out.fotoProgram;out.swimming='';out.grup='Prestasi';
 }else if(input.fotoProgram)out.fotoProgram=P.photo(input.fotoProgram);
 if(out.jenis==='Program'&&!out.detail&&!out.dryland&&!out.swimming&&!groups(out).some(g=>g.swimming||g.foto))throw fail('Isi Dryland, Swimming, atau unggah foto program grup');
 return out;
}
function project(p){
 const {fotoProgram,...out}=p;
 out.grupProgram=groups(p).map(g=>({nomor:g.nomor,swimming:g.swimming||'',adaFoto:!!g.foto,fotoUrl:g.foto?`/api/prestasi/program/${p.id}/photo/${g.nomor}`:null}));
 if(out.grupProgram.length)out.swimming='';
 return out;
}
module.exports={groups,prepare,project};

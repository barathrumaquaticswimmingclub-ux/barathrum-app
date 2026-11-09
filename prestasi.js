'use strict';
const path=require('path');
const {Document,Packer,Paragraph,HeadingLevel}=require('docx');
const P=require('./profile');
const G=require('./program');
const fail=(status,message)=>Object.assign(new Error(message),{status});
function mount(app,{wrap,transaction,validate,save,record,rows,limit}){
 const permitted=(req,res,next)=>['owner','prestasi'].includes(req.user.role)?next():next(fail(403,'Khusus tim Prestasi'));
 app.post('/api/prestasi/times',permitted,wrap(async(req,res)=>{
  const {entries,batchId}=req.body;
  if(!Array.isArray(entries)||!entries.length||entries.length>17||!/^[-\w]{10,80}$/.test(batchId||''))throw fail(400,'Isi minimal satu hasil tes');
  const result=await transaction(async c=>{
   await c.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE');
   const all=await rows(c,'catatanwaktu');
   if(all.some(x=>x.batchId===batchId&&String(x.dibuatOlehId)===String(req.user.id)))return {duplicate:true};
   const clean=[];const seen=new Set();
   for(const input of entries){const d=await validate(req,c,'catatanwaktu',input,null);const key=[d.atletId,d.tanggal,d.gaya,d.jarak,d.kolam].join('|');if(seen.has(key))throw fail(400,'Nomor tes ganda');seen.add(key);clean.push(d);}
   for(const data of clean)await save(c,req.user,'catatanwaktu',{...data,batchId},null);
   return {count:clean.length};
  });res.json({pesan:'Hasil tes tersimpan',...result});
 }));
 app.get('/api/prestasi/program/:id/word',permitted,wrap(async(req,res)=>{
  const p=await record(null,'program',req.params.id);
  const doc=new Document({sections:[{children:[new Paragraph({text:'BARATHRUM • PROGRAM LATIHAN',heading:HeadingLevel.TITLE}),...['Tanggal: '+p.tanggal,'Kelas / grup: '+(p.grup||'Prestasi'),p.judul,'DRYLAND (LATIHAN DARAT)',p.dryland||'Belum diisi','SWIMMING (LATIHAN RENANG)',G.groups(p).length?'':p.swimming||p.detail||'',...G.groups(p).flatMap(g=>['GRUP '+g.nomor,g.swimming||'Program pada foto tersimpan di aplikasi.']),'EVALUASI',p.evaluasi||'Belum diisi'].flatMap(t=>t.split('\n').map(text=>new Paragraph({text})))]}]});
  res.type('application/vnd.openxmlformats-officedocument.wordprocessingml.document').attachment('BRTM-program-'+p.tanggal+'.docx').send(await Packer.toBuffer(doc));
 }));
 app.get('/api/prestasi/program/:id/photo',permitted,wrap(async(req,res)=>{
  const p=await record(null,'program',req.params.id),photo=G.groups(p).find(g=>g.foto)?.foto;if(!photo)throw fail(404,'Foto belum tersedia');res.type(photo.mime).send(Buffer.from(photo.base64,'base64'));
 }));
 app.get('/api/prestasi/program/:id/photo/:grup',permitted,wrap(async(req,res)=>{
  if(!/^[1-4]$/.test(req.params.grup))throw fail(400,'Nomor grup tidak valid');
  const p=await record(null,'program',req.params.id),photo=G.groups(p).find(g=>g.nomor===Number(req.params.grup))?.foto;
  if(!photo)throw fail(404,'Foto grup belum tersedia');res.type(photo.mime).send(Buffer.from(photo.base64,'base64'));
 }));
 let ocrBusy=false;
 app.post('/api/prestasi/ocr',permitted,wrap(async(req,res)=>{
  limit(req,'ocr',12);const photo=P.photo(req.body.foto);
  if(ocrBusy)throw fail(429,'Pembacaan foto lain sedang berjalan. Coba beberapa saat lagi.');
  ocrBusy=true;let worker;
  try{
   const {createWorker}=require('tesseract.js');
   worker=await createWorker('eng',1,{langPath:require('@tesseract.js-data/eng').langPath,cacheMethod:'none'});
   const result=await worker.recognize(Buffer.from(photo.base64,'base64'));
   res.json({text:result.data.text,confidence:result.data.confidence,pesan:'Periksa ulang tulisan, jarak, jumlah dan interval sebelum menyimpan.'});
  }finally{if(worker)await worker.terminate();ocrBusy=false;}
 }));
}
module.exports={mount};

'use strict';
const B=require('./business'),N=require('./notifications'),SPP=require('./spp'),crypto=require('crypto');
const fail=(status,message)=>Object.assign(Error(message),{status});
const amount=(v,label,max=100000000)=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<0||n>max)throw fail(400,label+' tidak valid');return n;};
function mount(app,h){const {owner,wrap,transaction,record,rows,payments,save,validate,audit}=h;
 for(const mode of ['activation','payment'])app.post('/api/owner/'+mode,owner,wrap(async(req,res)=>{
  const data=await transaction(async db=>{
   await db.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE');
   let d=req.body;const activation=mode==='activation';if(!/^[-\w]{10,80}$/.test(d.requestId||''))throw fail(400,'Muat ulang formulir');
   const a=await record(db,'atlet',d.atletId,true),old=d.id?await record(db,'pembayaran',d.id,true):null;
   if(old&&(old.atletId!==a.id||old.dibatalkan))throw fail(409,'Paket tidak sesuai atlet');
   const requestHash=crypto.createHash('sha256').update(JSON.stringify([mode,Object.fromEntries(Object.keys(d).sort().map(k=>[k,d[k]]))])).digest('hex');
   const all=await rows(db,'pembayaran'),retry=all.find(p=>p.ownerRequestId===d.requestId);if(retry){if(retry.atletId!==a.id||retry.ownerRequestHash!==requestHash)throw fail(409,'Kode penyimpanan sudah dipakai untuk data lain');return retry;}
   const wa=await require('./whatsapp-payments').forPayment(db,d,a,activation);
   if(wa&&(!old||old.status!=='Belum Lunas'))throw fail(409,'Pilih tagihan Belum Lunas yang sudah ada. Validasi pembayaran tidak membuat paket baru.');
   const settlement=!activation&&old?.status==='Belum Lunas'&&d.status==='Lunas';
   if(settlement){
    const view=(await payments(db)).find(p=>p.id===old.id);
    // Settlement takes package terms from the database, never from the review form.
    d={...d,tanggal:old.tanggal,berakhir:view.berlakuSampai,kuota:old.totalPertemuan||0,harga:old.jumlah,biayaPendaftaran:old.biayaPendaftaran||0,potonganDiskon:old.potonganDiskon||0};
   }
   if(old&&d.expectedRevision!==undefined&&d.expectedRevision!==old.diperbaruiPada)throw fail(409,'Paket telah berubah. Muat ulang sebelum mengedit.');
   const prestasi=B.canonical(a.kelompok)==='Prestasi Class';
   const input={...d,catatan:d.catatan??old?.catatan??'',atletId:a.id,jenisKelas:a.kelompok,status:d.status,tanggal:d.tanggal,rincianOwner:true,paketKhusus:!prestasi,kuotaKhusus:amount(d.kuota,'Kuota',100),biayaKhusus:amount(d.harga,'Harga'),biayaPendaftaran:activation?old?.biayaPendaftaran||0:amount(d.biayaPendaftaran||0,'Pendaftaran'),potonganDiskon:amount(d.potonganDiskon||0,'Potongan'),alasanKhusus:'Paket diatur oleh Owner',paymentRequestId:d.requestId};
   if(input.biayaKhusus===0)throw fail(400,'Isi harga paket');
   if(!B.validDate(d.berakhir)||d.berakhir<d.tanggal)throw fail(400,'Tanggal akhir harus setelah tanggal mulai');
   const used=(await payments(db)).find(p=>p.id===old?.id)?.terpakai||0,requestedQuota=input.kuotaKhusus;
   if(!prestasi&&requestedQuota<1)throw fail(400,'Jumlah pertemuan minimal satu');
   if(activation&&!prestasi)input.kuotaKhusus=Math.max(requestedQuota,used);
   const p=await validate(req,db,'pembayaran',input,old?{...old,pengecualian:{berlakuSampai:d.berakhir}}:null);
   if(!prestasi)p.totalPertemuan=requestedQuota;
   if(!prestasi){const remaining=activation?amount(d.sisa,'Sisa pertemuan',100):p.totalPertemuan-used;if(remaining+used-(old?.pemakaianAwal||0)>p.totalPertemuan)throw fail(400,'Kuota harus mencakup sisa dan pemakaian yang tercatat');p.pemakaianAwal=p.totalPertemuan-remaining-(used-(old?.pemakaianAwal||0));if(p.pemakaianAwal<0)throw fail(400,'Kuota lebih kecil dari absensi terpakai');}
   const dates=(await rows(db,'absensi')).filter(r=>r.paketId===old?.id&&['Hadir','Alpa'].includes(r.status));if(dates.some(r=>r.tanggal<d.tanggal||r.tanggal>d.berakhir))throw fail(409,'Masa berlaku harus mencakup absensi yang sudah memakai paket');
   Object.assign(p,{ownerRequestId:d.requestId,ownerRequestHash:requestHash,activationOnly:old?!!old.activationOnly&&!(mode==='payment'&&old.status!=='Lunas'&&d.status==='Lunas'):activation,aktivasiBerlakuSampai:d.berakhir,tanggalBerakhir:d.berakhir,pengecualian:null,statusManual:null});
   if(!prestasi&&d.berakhir>B.addMonth(d.tanggal))p.pengecualian={berlakuSampai:d.berakhir,alasan:'Masa berlaku diatur Owner',oleh:req.user.username,pada:new Date().toISOString()};
   if(!p.activationOnly&&old?.activationOnly){delete p.penerimaanTunai;delete p.penerimaanPerBulan;}
   if(p.activationOnly){delete p.penerimaanTunai;delete p.penerimaanPerBulan;p.dibayarPada=p.status==='Lunas'?(old?.dibayarPada||d.tanggal):null;p.dibayarWaktu=p.status==='Lunas'?(old?.dibayarWaktu||new Date().toISOString()):null;}else if(d.dibayarPada){if(!B.validDate(d.dibayarPada)||d.dibayarPada>B.today())throw fail(400,'Tanggal pembayaran tidak valid');p.dibayarPada=d.dibayarPada;}
   if(settlement)for(const key of ['tanggal','tanggalBerakhir','aktivasiBerlakuSampai','pengecualian','statusManual','pemakaianAwal','totalPertemuan','renewalFrom','renewalRequestId']){if(Object.hasOwn(old,key))p[key]=old[key];else delete p[key];}
   const result=await save(db,req.user,'pembayaran',p,old);
   if((activation||wa)&&a.status!=='Aktif')await save(db,req.user,'atlet',{...a,status:'Aktif'},a);
   if(wa){await db.query("UPDATE brtm_wa_confirmations SET status='approved',payment_id=$2,user_id=$3,updated_at=NOW() WHERE id=$1",[wa.id,result.id,req.user.id]);await audit(db,req.user,'verifikasi-konfirmasi-whatsapp','whatsapp',wa.id,null,{paymentId:result.id,atletId:a.id,bankChecked:true});}
   await audit(db,req.user,activation?'aktivasi-paket-berjalan':'konfirmasi-pembayaran','pembayaran',result.id,old,result);return result;
  });res.json({data,pesan:mode==='activation'?'Aktivasi tersimpan. Paket Lunas dihitung sebagai pendapatan dan kuitansi tersedia.':'Pembayaran tersimpan. Invoice dan kuitansi mengikuti nominal paket.'});
 }));
 app.post('/api/owner/package/:id/cancel',owner,wrap(async(req,res)=>{
  const reason=String(req.body.reason||'').trim();if(reason.length<8||reason.length>1000)throw fail(400,'Isi alasan pembatalan minimal 8 karakter');
  await transaction(async db=>{await db.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE');const old=await record(db,'pembayaran',req.params.id,true);if(old.dibatalkan)return;
   const next={...old,dibatalkan:true,status:'Tidak Ditagih',statusManual:'Kedaluwarsa',sppDikelola:false,penerimaanTunai:0,penerimaanPerBulan:{},dibatalkanAlasan:reason};
   await db.query('UPDATE brtm_spp_receipts SET active=FALSE WHERE invoice_id=$1',[old.id]);
   await db.query("UPDATE data_klub SET data=$1 WHERE jenis='pembayaran' AND id=$2",[JSON.stringify(next),old.id]);
   await audit(db,req.user,'batalkan-paket','pembayaran',old.id,old,next);if(old.jenisKelas==='Prestasi Class')await SPP.reconcile(db,old.atletId,req.user,true);
  });res.json({pesan:'Paket dibatalkan. Salinan data dan absensi tetap tersimpan untuk audit.'});
 }));
 app.post('/api/owner/athlete/:id/contact',owner,wrap(async(req,res)=>{
  const result=await transaction(async db=>{
   const a=await record(db,'atlet',req.params.id),p=(await payments(db)).find(p=>p.id===String(req.body.packageId)&&p.atletId===a.id&&!p.dibatalkan),kind=req.body.kind,channel=req.body.channel;
   if(!p)throw fail(404,'Pilih paket anak ini');if(!['invoice','receipt','expired','new'].includes(kind)||!['app','wa'].includes(channel))throw fail(400,'Pilih jenis informasi dan saluran');
   if(kind==='receipt'&&B.cashReceived(p)<=0)throw fail(409,'Belum ada penerimaan untuk kuitansi');
   if(kind==='expired'&&p.statusMasaBerlaku!=='Kedaluwarsa'&&p.berlakuSampai>=B.today())throw fail(409,'Paket ini belum kedaluwarsa');
   if(kind==='invoice'&&p.invoiceTersedia===false)throw fail(409,'Invoice belum terbit');
   const titles={invoice:'Informasi invoice BRTM',receipt:'Informasi kuitansi BRTM',expired:'Paket latihan kedaluwarsa',new:'Informasi paket baru BRTM'};
   const body=`Yth. Ayah/Bunda ${a.nama},\n\n${titles[kind]}. ${p.jenisKelas}${p.totalPertemuan!==null?' • '+p.totalPertemuan+' pertemuan':''}, berlaku ${p.tanggal} sampai ${p.berlakuSampai}. Status ${p.status}. ${kind==='receipt'?'Penerimaan':'Tagihan'} Rp${Number(kind==='receipt'?B.cashReceived(p):p.totalTagihan).toLocaleString('id-ID')}.${kind==='expired'?' Silakan menghubungi admin untuk memperpanjang paket.':''}\n\nTerima kasih. 🙏\nBARATHRUM AQUATIC SWIMMING CLUB`;
   const documentKind=kind==='receipt'?'receipt':'invoice',document='/api/owner/documents/'+documentKind+'/'+p.id;
   if(channel==='app'){const fingerprint=crypto.createHash('sha256').update(JSON.stringify([kind,p.diperbaruiPada,p.tanggal,p.berlakuSampai,p.status,p.totalTagihan])).digest('hex').slice(0,16),key='owner-info:'+kind+':'+p.id+':'+B.today()+':'+fingerprint;await N.enqueue(db,a.id,key,titles[kind],body);await audit(db,req.user,'kirim-info-orangtua','pembayaran',p.id,null,{kind,channel});return {pesan:'Informasi tersedia di BRTM SWIM; notifikasi HP mengikuti pengaturan perangkat.'};}
   const phone=String(a.noHpOrtu||'').replace(/\D/g,'').replace(/^0/,'62');if(!/^\d{9,15}$/.test(phone))throw fail(400,'Nomor WA orang tua belum valid');
   await audit(db,req.user,'siapkan-info-whatsapp','pembayaran',p.id,null,{kind,channel});return {phone,message:body,document,parentDocument:'/swim/api/documents/'+documentKind+'/'+p.id,filename:'BRTM-'+documentKind+'-'+p.id+'.pdf'};
  });res.json(result);
 }));
}
module.exports={mount};

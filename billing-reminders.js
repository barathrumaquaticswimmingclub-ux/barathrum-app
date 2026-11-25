'use strict';
const B=require('./business'),N=require('./notifications');
const fail=(s,m)=>Object.assign(Error(m),{status:s});
function message(p){return `Yth. Ayah/Bunda orang tua/wali ${p.namaAtlet},\n\nSalam sehat dari BRTM. Kami ingin mengingatkan pembayaran ${p.jenisKelas}${p.periodeLabel?' periode '+p.periodeLabel:''} sebesar Rp${Number(p.totalTagihan).toLocaleString('id-ID')}${p.jatuhTempo?', dengan batas pembayaran '+p.jatuhTempo:''}.\n\nInvoice kami sertakan untuk memudahkan pengecekan. Apabila pembayaran sudah dilakukan, mohon mengirimkan bukti kepada admin agar dapat kami cocokkan.\n\nTerima kasih atas perhatian dan kerja sama Ayah/Bunda. 🙏\nBARATHRUM AQUATIC SWIMMING CLUB` ;}
function mount(app,h){const {pool,owner,wrap,record,transaction,audit}=h;
 app.post('/api/owner/billing/:id/remind',owner,wrap(async(req,res)=>{
 const result=await transaction(async db=>{
 await db.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE');
 const p=(await h.payments(db,true)).find(p=>p.id===String(req.params.id));
 if(!p)throw fail(404,'Tagihan tidak ditemukan');
 require('./billing-policy').assertReminder(p);
 if(p.jenisKelas==='Prestasi Class'&&p.invoiceTersedia===false)throw fail(409,'Invoice belum tersedia untuk periode ini');
 const a=await record(db,'atlet',p.atletId),body=message(p);
 if(req.body.channel==='app'){
 const key='manual-reminder:'+p.id+':'+B.today();
 const n=(await db.query('INSERT INTO brtm_billing_notices(athlete_id,event_key,data) VALUES($1,$2,$3) ON CONFLICT(event_key) DO UPDATE SET event_key=EXCLUDED.event_key RETURNING id',[p.atletId,key,JSON.stringify({...p,provisional:true})])).rows[0];
 await N.enqueue(db,p.atletId,'invoice:'+n.id,'Pengingat pembayaran BRTM',body);
 await audit(db,req.user,'ingatkan-tagihan-aplikasi','pembayaran',p.id,null,{noticeId:n.id});
 return {pesan:'Pengingat dan invoice tersedia di kotak masuk BRTM SWIM. Notifikasi dikirim jika perangkat mengaktifkannya.'};
 }
 if(req.body.channel!=='wa')throw fail(400,'Pilih aplikasi atau WhatsApp');
 let phone=String(a.noHpOrtu||'').replace(/\D/g,'').replace(/^0/,'62');if(!/^\d{9,15}$/.test(phone))throw fail(400,'Nomor WhatsApp orang tua belum valid');
 await audit(db,req.user,'siapkan-pengingat-whatsapp','pembayaran',p.id,null,{channel:'wa'});
 return {phone,message:body,filename:'BRTM-Invoice-'+p.id+'.pdf',document:'/api/owner/documents/invoice/'+p.id,parentDocument:'/swim/api/documents/invoice/'+p.id};
 });res.json(result);
 }));
}
module.exports={mount,message};

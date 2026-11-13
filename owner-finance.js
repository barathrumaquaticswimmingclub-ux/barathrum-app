'use strict';
const B=require('./business'),SPP=require('./spp');
const fail=(status,message)=>Object.assign(Error(message),{status});
function ranges(today=B.today()){
 const weekday=new Date(today+'T12:00:00Z').getUTCDay(),monday=B.addDays(today,-((weekday+6)%7));
 return [{key:'day',label:'Hari ini',start:today,end:today},{key:'week',label:'Minggu ini',start:monday,end:today},{key:'month',label:'Bulan ini',start:today.slice(0,7)+'-01',end:today}];
}
async function receipts(db,rows){
 const packs=await rows(db,'pembayaran'),athletes=await rows(db,'atlet');
 const result=(await db.query('SELECT * FROM brtm_spp_receipts WHERE active=TRUE ORDER BY paid_on DESC,id DESC')).rows.map(r=>{
  const p=packs.find(p=>p.id===String(r.invoice_id)),a=athletes.find(a=>a.id===String(r.athlete_id));
  return {key:'spp:'+r.id,billId:String(r.invoice_id),atletId:String(r.athlete_id),nama:a?.nama||p?.namaAtlet||'Atlet',kelas:p?.jenisKelas||'Prestasi Class',paidOn:r.paid_on,amount:r.amount+r.registration_fee,registrationFee:r.registration_fee};
 });
 for(const p of packs)if(!p.sppDikelola&&p.jenisKelas!=='Prestasi Class'&&B.cashReceived(p)>0)result.push({key:'paket:'+p.id,billId:p.id,atletId:String(p.atletId),nama:athletes.find(a=>a.id===String(p.atletId))?.nama||p.namaAtlet,kelas:p.jenisKelas,paidOn:p.dibayarPada||p.tanggal,amount:B.cashReceived(p),registrationFee:Number(p.biayaPendaftaran||0)});
 return result.sort((a,b)=>b.paidOn.localeCompare(a.paidOn)||b.key.localeCompare(a.key));
}
function mount(app,h){const {pool,wrap,owner,transaction,rows,record,save,audit}=h;
 app.get('/api/owner/receipts',owner,wrap(async(req,res)=>res.json({today:B.today(),ranges:ranges(),receipts:await receipts(pool,rows)})));
 app.get('/api/owner/receipts/pdf',owner,wrap(async(req,res)=>{
  const range=ranges().find(r=>r.key===req.query.range)||ranges()[0],all=await receipts(pool,rows);require('./reports').receipts(res,all.filter(r=>r.paidOn>=range.start&&r.paidOn<=range.end),range);
 }));
 // Removing a receipt corrects the cash ledger; athlete/package/attendance history stays available.
 for(const method of ['put','delete'])app[method]('/api/owner/receipts/:key',owner,wrap(async(req,res)=>{
  const reason=String(req.body.reason||'').trim();if(reason.length<8||reason.length>1000)throw fail(400,'Isi alasan koreksi minimal 8 karakter');
  await transaction(async db=>{
   await db.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE');
   const all=await receipts(db,rows),r=all.find(r=>r.key===req.params.key);if(!r)throw fail(404,'Penerimaan tidak ditemukan. Muat ulang laporan.');
   const deleting=method==='delete',amount=Number(req.body.amount),paidOn=req.body.paidOn;
   if(!deleting&&(!B.validDate(paidOn)||paidOn>B.today()||!Number.isSafeInteger(amount)||amount<r.registrationFee||amount>200000000))throw fail(400,'Tanggal atau jumlah penerimaan tidak valid');
   if(r.key.startsWith('spp:')){
    if((await db.query("SELECT id FROM brtm_spp_pending WHERE athlete_id=$1 AND status='Pending'",[r.atletId])).rows.length)throw fail(409,'Selesaikan koreksi SPP yang menunggu terlebih dahulu');
    const receiptId=r.key.split(':')[1];
    if(deleting)await db.query('UPDATE brtm_spp_receipts SET active=FALSE WHERE id=$1',[receiptId]);
    else await db.query('UPDATE brtm_spp_receipts SET amount=$1,paid_on=$2 WHERE id=$3',[amount-r.registrationFee,paidOn,receiptId]);
    await SPP.reconcile(db,r.atletId,req.user,true);
   }else{
    const p=await record(db,'pembayaran',r.billId,true),next={...p,catatan:reason,status:deleting?'Belum Lunas':'Lunas',dibayarPada:deleting?null:paidOn};
    if(!deleting){next.jumlah=amount-Number(p.biayaPendaftaran||0)+Number(p.potonganDiskon||0);next.totalTagihan=amount;}
    delete next.penerimaanTunai;delete next.penerimaanPerBulan;await save(db,req.user,'pembayaran',next,p);
   }
   await audit(db,req.user,deleting?'hapus-penerimaan':'koreksi-penerimaan','pembayaran',r.billId,r,{reason,...(!deleting?{amount,paidOn}:{dibatalkan:true})});
  });res.json({pesan:method==='delete'?'Penerimaan dihapus dari laporan dan dicatat dalam riwayat':'Penerimaan diperbarui'});
 }));
}
module.exports={ranges,receipts,mount};

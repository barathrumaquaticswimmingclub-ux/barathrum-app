'use strict';
const B=require('./business');
async function list(db,aid,packs){
 const spp=(await db.query('SELECT id,invoice_id,amount,registration_fee,paid_on,received_at,active FROM brtm_spp_receipts WHERE athlete_id=$1 ORDER BY paid_on DESC,id DESC',[aid])).rows.map(r=>({key:'spp:'+r.id,billId:String(r.invoice_id),paidOn:r.paid_on,receivedAt:r.received_at||null,amount:r.amount+r.registration_fee,status:r.active?'Diterima':'Dibatalkan',keterangan:'SPP Prestasi'+(r.registration_fee?' dan pendaftaran':''),kelas:'Prestasi Class'}));
 const audits=(await db.query("SELECT id,action,before_data,after_data,created_at FROM brtm_audit WHERE jenis='pembayaran' AND (before_data->>'atletId'=$1 OR after_data->>'atletId'=$1) ORDER BY id",[String(aid)])).rows;
 const events=[],latest=new Map();for(const r of audits){const after=r.after_data,before=r.before_data,p=after||before;if(!p||p.jenisKelas==='Prestasi Class')continue;const id=String(p.id||before?.id||'');if(!id)continue;
  if(after?.status==='Lunas'&&before?.status!=='Lunas'){const e={key:'paket:'+r.id,billId:id,paidOn:after.dibayarPada||after.tanggal,receivedAt:after.dibayarWaktu||r.created_at||null,amount:B.cashReceived(after),status:'Diterima',keterangan:after.catatan||'Pembayaran '+after.jenisKelas,kelas:after.jenisKelas};events.push(e);latest.set(id,e);}
  else if(latest.has(id)){const e=latest.get(id);if(!after||after.status!=='Lunas')e.status='Dibatalkan';else {e.paidOn=after.dibayarPada||e.paidOn;e.amount=B.cashReceived(after);e.keterangan=after.catatan||e.keterangan;}}
 }
 for(const p of packs)if(p.jenisKelas!=='Prestasi Class'&&B.cashReceived(p)>0&&!latest.has(p.id))events.push({key:'legacy:'+p.id,billId:p.id,paidOn:p.dibayarPada||p.tanggal,receivedAt:p.dibayarWaktu||null,amount:B.cashReceived(p),status:'Diterima',keterangan:p.catatan||'Pembayaran '+p.jenisKelas,kelas:p.jenisKelas});
 return [...spp,...events].map(r=>({...r,hasDocument:packs.some(p=>p.id===r.billId)})).sort((a,b)=>String(b.paidOn).localeCompare(String(a.paidOn))||(b.receivedAt?new Date(b.receivedAt).getTime():0)-(a.receivedAt?new Date(a.receivedAt).getTime():0)||b.key.localeCompare(a.key,undefined,{numeric:true}));
}
module.exports={list};

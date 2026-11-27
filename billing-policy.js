'use strict';
const B=require('./business');
function unpaid(p){return !!p&&!p.dibatalkan&&!p.sppSuperseded&&!p.sppTidakDitagih&&p.status==='Belum Lunas'&&Number(p.totalTagihan)>0;}
function endOfMonth(p,today=B.today()){return B.canonical(p?.jenisKelas)!=='Prestasi Class'||today===B.monthEnd(today);}
function eligible(p,today=B.today()){return unpaid(p)&&endOfMonth(p,today)&&(B.canonical(p.jenisKelas)!=='Prestasi Class'||p.invoiceTersedia===true);}
function assertReminder(p){if(!unpaid(p))throw Object.assign(Error('Pengingat hanya untuk tagihan yang belum lunas'),{status:409});if(!endOfMonth(p))throw Object.assign(Error('Pengingat tagihan Prestasi hanya boleh dikirim pada hari terakhir bulan (WIB).'),{status:409});if(p.invoiceTersedia===false)throw Object.assign(Error('Invoice belum tersedia untuk periode ini'),{status:409});}
function currentNotice(n,packs){const d=n.data||n;return packs.find(p=>String(p.id)===String(d.paymentId||d.id))||packs.find(p=>String(p.atletId)===String(n.athlete_id||d.atletId)&&d.periode&&p.periode===d.periode);}
function email(v){return typeof v==='string'&&v.length<=254&&/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(v)&&!/[\r\n]/.test(v);}
async function notificationAllowed(db,n){
 let paymentId;
 if(n.event_key.startsWith('invoice:')){
  const notice=(await db.query('SELECT * FROM brtm_billing_notices WHERE id=$1',[n.event_key.slice(8)])).rows[0];
  if(!notice||notice.data.sppSuperseded)return false;
  const packs=(await db.query("SELECT id,data FROM data_klub WHERE jenis='pembayaran' AND data->>'atletId'=$1",[String(n.athlete_id)])).rows.map(r=>({...r.data,id:String(r.id)}));
  const p=currentNotice(notice,packs);return unpaid(p)&&endOfMonth(p);
 }
 const m=n.event_key.match(/^(?:tagihan:|owner-info:(?:invoice|new|expired):)([0-9]+):/);
 if(m)paymentId=m[1];else return true;
 const row=(await db.query("SELECT id,data FROM data_klub WHERE jenis='pembayaran' AND id=$1",[paymentId])).rows[0];
 const p=row&&{...row.data,id:String(row.id)};return unpaid(p)&&endOfMonth(p);
}
module.exports={notificationAllowed,unpaid,endOfMonth,eligible,assertReminder,currentNotice,email};

'use strict';
const B=require('./business'),N=require('./notifications'),crypto=require('crypto');
const fee=250000;
const charge=p=>Math.max(0,Number(p.sppHargaOwner??fee)-Number(p.sppPotonganOwner??0));
const fail=(status,message)=>Object.assign(Error(message),{status});
async function initDb(db){
 await db.query(`CREATE TABLE IF NOT EXISTS brtm_spp_receipts (id SERIAL PRIMARY KEY, event_key TEXT UNIQUE NOT NULL, invoice_id INTEGER NOT NULL REFERENCES data_klub(id) ON DELETE CASCADE, athlete_id INTEGER NOT NULL REFERENCES data_klub(id) ON DELETE CASCADE, amount INTEGER NOT NULL CHECK(amount>=0), registration_fee INTEGER NOT NULL DEFAULT 0, paid_on TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE)`);
 await db.query(`ALTER TABLE brtm_spp_receipts DROP CONSTRAINT IF EXISTS brtm_spp_receipts_amount_check`);
 await db.query(`ALTER TABLE brtm_spp_receipts ADD CONSTRAINT brtm_spp_receipts_amount_check CHECK(amount>=0)`);
 await db.query(`CREATE TABLE IF NOT EXISTS brtm_spp_accounts (athlete_id INTEGER PRIMARY KEY REFERENCES data_klub(id) ON DELETE CASCADE, state JSONB NOT NULL)`);
 await db.query(`CREATE TABLE IF NOT EXISTS brtm_spp_pending (id SERIAL PRIMARY KEY, athlete_id INTEGER NOT NULL REFERENCES data_klub(id) ON DELETE CASCADE, requested_by INTEGER, status TEXT NOT NULL DEFAULT 'Pending', detail JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), approved_at TIMESTAMPTZ, approved_by INTEGER)`);
 await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS brtm_spp_pending_one ON brtm_spp_pending(athlete_id) WHERE status='Pending'`);
 await db.query(`CREATE INDEX IF NOT EXISTS brtm_spp_receipt_athlete ON brtm_spp_receipts(athlete_id,paid_on,id)`);
 await db.query(`CREATE INDEX IF NOT EXISTS brtm_spp_attendance_athlete ON data_klub((data->>'atletId'),(data->>'tanggal')) WHERE jenis='absensi' AND data->>'status'='Hadir'`);
 await db.query(`CREATE INDEX IF NOT EXISTS brtm_spp_bills_athlete ON data_klub((data->>'atletId')) WHERE jenis='pembayaran' AND data->>'jenisKelas'='Prestasi Class'`);
 await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS brtm_spp_invoice_one ON data_klub((data->>'atletId'),(data->>'periode')) WHERE jenis='pembayaran' AND data->>'sppDikelola'='true'`);
}
async function audit(db,user,action,id,before,after){await db.query('INSERT INTO brtm_audit(user_id,username,action,jenis,record_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6,$7)',[user?.id||null,user?.username||'sistem-spp',action,'spp',String(id),before?JSON.stringify(before):null,JSON.stringify(after)]);}
async function invoices(db,aid){return (await db.query("SELECT id,data FROM data_klub WHERE jenis='pembayaran' AND data->>'atletId'=$1 AND data->>'jenisKelas'='Prestasi Class' ORDER BY data->>'periode',id",[String(aid)])).rows.map(r=>({...r.data,id:String(r.id)}));}
async function persist(db,user,next,old){
 const comparable={...next};delete comparable.id;
 if(old&&Object.keys(comparable).every(k=>JSON.stringify(comparable[k])===JSON.stringify(old[k])))return old;
 const payload={...comparable,diperbaruiPada:new Date().toISOString(),diperbaruiOleh:user?.username||'sistem-spp'};
 if(!old)Object.assign(payload,{dibuatPada:payload.diperbaruiPada,dibuatOleh:payload.diperbaruiOleh,dibuatOlehId:user?.id?String(user.id):null});
 const r=old?await db.query("UPDATE data_klub SET data=$1 WHERE id=$2 AND jenis='pembayaran' RETURNING id,data",[JSON.stringify(payload),old.id]):await db.query("INSERT INTO data_klub(jenis,data) VALUES('pembayaran',$1) RETURNING id,data",[JSON.stringify(payload)]);
 const out={...r.rows[0].data,id:String(r.rows[0].id)};await audit(db,user,old?'hitung-ulang-spp':'buat-tagihan-spp',out.id,old,out);if(out.status==='Lunas'&&old?.status!=='Lunas'&&out.sppMetode==='Kredit')await N.enqueue(db,out.atletId,'kredit-spp:'+out.id+':'+out.diperbaruiPada,'SPP dilunasi dengan kredit','SPP Prestasi bulan '+out.periode+' dilunasi menggunakan saldo kredit Rp'+charge(out).toLocaleString('id-ID')+'. Tidak ada penerimaan uang baru.');return out;
}
async function monthlyAttendance(db,aid,athlete){
 const attendance=(await db.query(`SELECT a.data,s.data AS schedule FROM data_klub a LEFT JOIN data_klub s ON s.id::text=a.data->>'jadwalId' AND s.jenis='jadwal' WHERE a.jenis='absensi' AND a.data->>'atletId'=$1 AND a.data->>'status'='Hadir'`,[String(aid)])).rows;
 const counts={};for(const a of attendance){const kind=a.data.jenisKelas||a.schedule?.jenisKelas||athlete.kelompok;if(B.canonical(kind)==='Prestasi Class'&&B.validDate(a.data.tanggal)){const m=a.data.tanggal.slice(0,7);counts[m]=(counts[m]||0)+1;}}
 return counts;
}
async function reconcile(db,aid,user={username:'sistem-spp'},force=false){
 const athlete=(await db.query("SELECT data FROM data_klub WHERE id=$1 AND jenis='atlet'",[aid])).rows[0]?.data;if(!athlete)return;
 const pending=(await db.query("SELECT id FROM brtm_spp_pending WHERE athlete_id=$1 AND status='Pending'",[aid])).rows[0];if(pending&&!force)return;
 const counts=await monthlyAttendance(db,aid,athlete);
 let bills=await invoices(db,aid);if(!bills.length&&!Object.keys(counts).length)return;
 const grouped=new Map();for(const p of bills){const month=p.periode||p.tanggal?.slice(0,7);if(!/^\d{4}-\d{2}$/.test(month||'')||!B.validDate(month+'-01'))throw fail(409,'Periode SPP lama perlu diperiksa Owner');if(grouped.has(month))throw fail(409,'Ada tagihan Prestasi ganda. Owner perlu memeriksa sebelum mengubah absensi.');grouped.set(month,p);}
 const oldState=(await db.query('SELECT state FROM brtm_spp_accounts WHERE athlete_id=$1',[aid])).rows[0]?.state;
 const spent=(oldState?.allocations||[]).filter(a=>a.sourceId!==a.targetId&&Number(oldState.attendance?.[a.sourcePeriod]||0)===0);
 if(!force&&spent.some(a=>(counts[a.sourcePeriod]||0)>0||(counts[a.targetPeriod]||0)===0)){
  const detail={reason:'Koreksi absensi memengaruhi kredit yang sudah digunakan',attendance:counts,previous:oldState};
  await db.query("INSERT INTO brtm_spp_pending(athlete_id,requested_by,detail) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[aid,user.id||null,JSON.stringify(detail)]);await audit(db,user,'koreksi-spp-menunggu-owner',aid,oldState,detail);return;
 }
 for(const month of Object.keys(counts).sort())if(!grouped.has(month)){
  const p=await persist(db,user,{...B.price({tanggal:month+'-01',status:'Belum Lunas',jenisKelas:'Prestasi Class'},{kelompok:'Prestasi Class'}),atletId:String(aid),namaAtlet:athlete.nama,sppDikelola:true,sppHadir:counts[month],catatan:'SPP Prestasi otomatis berdasarkan kehadiran'},null);grouped.set(month,p);
 }
 bills=[...grouped.entries()].sort(([a],[b])=>a.localeCompare(b));
 // Import existing full payments once; managed status may later reflect credit rather than cash.
 for(const [,p] of bills)if(!p.sppDikelola&&p.status==='Lunas')await db.query('INSERT INTO brtm_spp_receipts(invoice_id,athlete_id,amount,registration_fee,paid_on,event_key) SELECT $1,$2,$3,$4,$5,$6 WHERE NOT EXISTS(SELECT 1 FROM brtm_spp_receipts WHERE invoice_id=$1) ON CONFLICT DO NOTHING',[p.id,aid,fee,Number(p.biayaPendaftaran||0),p.dibayarPada||p.tanggal,'legacy:'+p.id]);
 const receipts=(await db.query('SELECT * FROM brtm_spp_receipts WHERE athlete_id=$1 AND active=TRUE ORDER BY paid_on,id',[aid])).rows;
 const sources=receipts.map(r=>({...r,remaining:r.amount})),allocations=[];
 for(const [month,p] of bills)if(counts[month]>0){
  let need=charge(p);for(const source of sources){if(need<=0)break;if(source.remaining<=0)continue;const amount=Math.min(need,source.remaining),sourceBill=bills.find(([,p])=>p.id===String(source.invoice_id));source.remaining-=amount;need-=amount;allocations.push({receiptId:String(source.id),sourceId:String(source.invoice_id),targetId:p.id,sourcePeriod:sourceBill?.[0]||'',targetPeriod:month,amount});}
 }
 for(const [month,p] of bills){
  const ownReceipts=receipts.filter(r=>String(r.invoice_id)===p.id),receipt=ownReceipts.at(-1),registrationCash=ownReceipts.reduce((n,r)=>n+r.registration_fee,0),cash=ownReceipts.reduce((n,r)=>n+r.amount+r.registration_fee,0),cashMonths={};for(const r of ownReceipts){const month=r.paid_on.slice(0,7);cashMonths[month]=(cashMonths[month]||0)+r.amount+r.registration_fee;}
  const allocation=allocations.find(a=>a.targetId===p.id),due=(counts[month]?charge(p):0)+Number(p.biayaPendaftaran||0),registrationPaid=registrationCash>=Number(p.biayaPendaftaran||0);
  const allocated=allocations.filter(a=>a.targetId===p.id).reduce((n,a)=>n+a.amount,0);
  const status=due===0?'Tidak Ditagih':(!(counts[month]>0)||allocated>=charge(p))&&registrationPaid?'Lunas':'Belum Lunas';
  await persist(db,user,{...p,periode:month,sppDikelola:true,sppHadir:counts[month]||0,sppTidakDitagih:!(counts[month]>0),sppPaidFrom:allocation?.sourceId||null,sppMetode:allocation?allocation.sourceId===p.id?'Tunai / transfer':'Kredit':'',jumlah:Number(p.sppHargaOwner??fee),potonganDiskon:Number(p.sppPotonganOwner??0),totalTagihan:due,status,penerimaanTunai:cash,penerimaanPerBulan:cashMonths,dibayarPada:receipt?.paid_on||null,pemakaianAwal:0,totalPertemuan:null},p);
 }
 const state={available:sources.reduce((n,r)=>n+r.remaining,0),allocations,attendance:counts};
 if(JSON.stringify(oldState)!==JSON.stringify(state)){await db.query('INSERT INTO brtm_spp_accounts(athlete_id,state) VALUES($1,$2) ON CONFLICT(athlete_id) DO UPDATE SET state=EXCLUDED.state',[aid,JSON.stringify(state)]);await audit(db,user,'alokasi-kredit-spp-fifo',aid,oldState,state);}
 if(force&&pending){await db.query("UPDATE brtm_spp_pending SET status='Disetujui',approved_at=NOW(),approved_by=$1 WHERE id=$2",[user.id,pending.id]);await audit(db,user,'setujui-koreksi-spp',aid,null,{requestId:pending.id,state});}
}
async function afterSave(db,user,kind,value,old){
 if(kind==='absensi')return reconcile(db,value.atletId,user);
 if(kind!=='pembayaran'||B.canonical(value.jenisKelas)!=='Prestasi Class')return;
 if((await db.query("SELECT id FROM brtm_spp_pending WHERE athlete_id=$1 AND status='Pending'",[value.atletId])).rows.length)throw fail(409,'Setujui koreksi SPP yang menunggu Owner sebelum mengubah pembayaran.');
 let cashAdded=false;
 const own=(await db.query('SELECT * FROM brtm_spp_receipts WHERE invoice_id=$1 AND active=TRUE ORDER BY id',[value.id])).rows;
 const requestKey=value.sppPaymentRequestId;
 if(value.status==='Lunas'&&(!old||old.status!=='Lunas')){
  if(own.length&&!requestKey)throw fail(400,'Muat ulang formulir pembayaran sebelum menerima pembayaran berikutnya.');
  const registrationFee=Math.max(0,Number(value.biayaPendaftaran||0)-own.reduce((n,r)=>n+r.registration_fee,0));
  cashAdded=(await db.query('INSERT INTO brtm_spp_receipts(invoice_id,athlete_id,amount,registration_fee,paid_on,event_key) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id',[value.id,value.atletId,charge(value),registrationFee,value.dibayarPada||B.today(),'payment:'+value.id+':'+(requestKey||value.diperbaruiPada)])).rows.length>0;
 }
 if(old?.status==='Lunas'&&value.status==='Belum Lunas'){
  if(!value.catatan||value.catatan.trim().length<8)throw fail(400,'Isi alasan koreksi pembayaran minimal 8 karakter');
  if(own.length)await db.query('UPDATE brtm_spp_receipts SET active=FALSE WHERE id=$1',[own.at(-1).id]);
  else{const state=(await db.query('SELECT state FROM brtm_spp_accounts WHERE athlete_id=$1',[value.atletId])).rows[0]?.state;for(const allocation of state?.allocations||[])if(allocation.targetId===value.id)await db.query('UPDATE brtm_spp_receipts SET active=FALSE WHERE id=$1',[allocation.receiptId]);}
 }
 if(old?.status==='Lunas'&&value.status==='Lunas'&&own.length&&(charge(value)!==charge(old)||Number(value.biayaPendaftaran||0)!==Number(old.biayaPendaftaran||0))){
  const latest=own.at(-1);await db.query('UPDATE brtm_spp_receipts SET amount=$1,registration_fee=$2 WHERE id=$3',[charge(value),Math.max(0,Number(value.biayaPendaftaran||0)-own.slice(0,-1).reduce((n,r)=>n+r.registration_fee,0)),latest.id]);
 }
 await reconcile(db,value.atletId,user);
 if(cashAdded)await N.enqueue(db,value.atletId,'penerimaan-spp:'+value.id+':'+value.diperbaruiPada,'Pembayaran SPP diterima','Pembayaran SPP Prestasi Rp'+charge(value).toLocaleString('id-ID')+' diterima dan dialokasikan ke tagihan tertua atau saldo kredit.');
}
async function summaries(db){const states=(await db.query('SELECT athlete_id,state FROM brtm_spp_accounts')).rows,pending=(await db.query("SELECT athlete_id FROM brtm_spp_pending WHERE status='Pending'")).rows;return Object.fromEntries(states.map(r=>[String(r.athlete_id),{saldoKredit:r.state.available||0,sppMenungguOwner:pending.some(p=>p.athlete_id===r.athlete_id)}]));}
async function migrate(pool){const c=await pool.connect();try{await c.query('BEGIN');await c.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE');const ids=(await c.query("SELECT DISTINCT a.id FROM data_klub a LEFT JOIN data_klub p ON p.jenis='pembayaran' AND p.data->>'atletId'=a.id::text AND p.data->>'jenisKelas'='Prestasi Class' WHERE a.jenis='atlet' AND (a.data->>'kelompok'='Prestasi Class' OR p.id IS NOT NULL)")).rows;for(const a of ids)await reconcile(c,String(a.id));await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
async function review(db,aid){
 const records=(await db.query("SELECT id,data FROM data_klub WHERE id=$1 OR (jenis IN ('absensi','pembayaran') AND data->>'atletId'=$2) ORDER BY id",[aid,String(aid)])).rows;
 const athlete=records.find(r=>String(r.id)===String(aid))?.data;
 const attendance=await monthlyAttendance(db,aid,athlete),state=(await db.query('SELECT state FROM brtm_spp_accounts WHERE athlete_id=$1',[aid])).rows[0]?.state||{available:0,attendance:{}};
 return {revision:crypto.createHash('sha256').update(JSON.stringify(records)).digest('hex'),saldoKredit:state.available,months:[...new Set([...Object.keys(state.attendance),...Object.keys(attendance)])].sort().map(month=>({month,before:state.attendance[month]?fee:0,after:attendance[month]?fee:0,present:attendance[month]||0}))};
}
function mount(app,{pool,wrap,owner,transaction}){
 app.get('/api/spp/pending',owner,wrap(async(req,res)=>{const list=(await pool.query("SELECT p.id,p.athlete_id,p.detail,p.created_at,a.data->>'nama' AS nama FROM brtm_spp_pending p JOIN data_klub a ON a.id=p.athlete_id WHERE p.status='Pending' ORDER BY p.id")).rows;for(const p of list)Object.assign(p,await review(pool,p.athlete_id));res.json(list);}));
 app.post('/api/spp/pending/:id/approve',owner,wrap(async(req,res)=>{
  if(!/^[1-9]\d{0,14}$/.test(req.params.id))throw fail(400,'ID koreksi tidak valid');
  await transaction(async c=>{await c.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE');const p=(await c.query("SELECT * FROM brtm_spp_pending WHERE id=$1 AND status='Pending' FOR UPDATE",[req.params.id])).rows[0];if(!p)throw fail(404,'Koreksi tidak tersedia');const preview=await review(c,p.athlete_id);if(req.body.revision!==preview.revision)throw fail(409,'Data absensi atau tagihan berubah. Muat ulang tinjauan sebelum menyetujui.');await reconcile(c,String(p.athlete_id),req.user,true);});res.json({pesan:'Perhitungan SPP dan kredit disetujui Owner.'});
 }));
}
module.exports={initDb,afterSave,reconcile,summaries,migrate,mount};

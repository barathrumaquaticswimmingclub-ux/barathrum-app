'use strict';
const webpush = require('web-push');
const B = require('./business');
async function initDb(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS brtm_push_keys (id INTEGER PRIMARY KEY, public_key TEXT NOT NULL, private_key TEXT NOT NULL)`);
  const keys = webpush.generateVAPIDKeys();
  await db.query('INSERT INTO brtm_push_keys VALUES (1,$1,$2) ON CONFLICT(id) DO NOTHING',[keys.publicKey,keys.privateKey]);
  await db.query(`CREATE TABLE IF NOT EXISTS brtm_push_subscriptions (endpoint TEXT PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES brtm_parents(id) ON DELETE CASCADE, subscription JSONB NOT NULL)`);
  await db.query(`CREATE TABLE IF NOT EXISTS brtm_notifications (id SERIAL PRIMARY KEY, athlete_id INTEGER NOT NULL REFERENCES data_klub(id) ON DELETE CASCADE, event_key TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(athlete_id,event_key))`);
  await db.query(`CREATE TABLE IF NOT EXISTS brtm_push_jobs (id SERIAL PRIMARY KEY, notification_id INTEGER NOT NULL REFERENCES brtm_notifications(id) ON DELETE CASCADE, endpoint TEXT NOT NULL REFERENCES brtm_push_subscriptions(endpoint) ON DELETE CASCADE, attempts INTEGER NOT NULL DEFAULT 0, sent_at TIMESTAMPTZ, next_attempt TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(notification_id,endpoint))`);
}
async function enqueue(db, athleteId, key, title, body) {
  const n=(await db.query(`INSERT INTO brtm_notifications (athlete_id,event_key,title,body) VALUES ($1,$2,$3,$4) ON CONFLICT(athlete_id,event_key) DO NOTHING RETURNING id`,[athleteId,key,title,body])).rows[0];
  if (!n) return;
  await db.query(`INSERT INTO brtm_push_jobs (notification_id,endpoint) SELECT $1,s.endpoint FROM brtm_push_subscriptions s JOIN brtm_parents p ON p.id=s.parent_id WHERE p.athlete_id=$2 AND p.active=TRUE AND p.deleted=FALSE ON CONFLICT DO NOTHING`,[n.id,athleteId]);
}
async function afterSave(db, kind, value, old) {
  if(kind==='absensi' && (value.status!==old?.status)) {
    if(value.status==='Hadir') await enqueue(db,value.atletId,`hadir:${value.id}:${value.diperbaruiPada}`,'Kehadiran latihan tercatat',`Adik ${value.namaAtlet} tercatat hadir pada latihan tanggal ${value.tanggal}.`);
    else if(old?.status==='Hadir') await enqueue(db,value.atletId,`koreksi-hadir:${value.id}:${value.diperbaruiPada}`,'Koreksi kehadiran',`Kehadiran Adik ${value.namaAtlet} tanggal ${value.tanggal} diperbarui menjadi ${value.status}.`);
  }
  if(kind==='pembayaran' && value.status==='Lunas' && old?.status!=='Lunas') await enqueue(db,value.atletId,`lunas:${value.id}:${value.diperbaruiPada}`,'Pembayaran diterima',`Terima kasih, pembayaran ${value.jenisKelas} untuk Adik ${value.namaAtlet} sebesar Rp${value.totalTagihan.toLocaleString('id-ID')} telah tercatat lunas.`);
  if(kind==='jadwal' && value.statusSesi==='Libur' && old?.statusSesi!=='Libur') for(const aid of value.atletIds) await enqueue(db,aid,`libur:${value.id}`,'Informasi libur latihan',`Latihan tanggal ${value.tanggal} pukul ${value.mulai}–${value.selesai} diliburkan. ${value.alasanLibur}`);
}
async function reminders(pool, packs) {
  const today=B.today(), soon=B.addDays(today,3);
  const athletes=(await pool.query("SELECT id,data FROM data_klub WHERE jenis='atlet' AND COALESCE(data->>'status','Aktif')<>'Nonaktif'")).rows;
  for(const a of athletes) {
    const related=packs.filter(p=>String(p.atletId)===String(a.id));
    for(const p of related.filter(p=>p.status==='Belum Lunas' && (p.jatuhTempo||p.tanggal)<=soon)) {
      const overdue=(p.jatuhTempo||p.tanggal)<today;
      await enqueue(pool,a.id,`tagihan:${p.id}:${overdue?'lewat':'dekat'}`,'Pengingat pembayaran',`Halo, Bapak/Ibu orang tua ${a.data.nama}. SPP/paket ${p.jenisKelas} Rp${p.totalTagihan.toLocaleString('id-ID')} belum lunas. Jatuh tempo ${p.jatuhTempo||p.tanggal}. Mohon menghubungi admin BRTM untuk konfirmasi pembayaran. Terima kasih.`);
    }
    const paid=related.filter(p=>p.status==='Lunas' && p.jenisKelas!=='Prestasi Class').sort((a,b)=>b.tanggal.localeCompare(a.tanggal)||Number(b.id)-Number(a.id));
    const last=paid[0];
    if(last && last.tanggal<=today && (last.sisaPertemuan<=1 || last.berlakuSampai<=soon)) await enqueue(pool,a.id,`perpanjang:${last.id}`,'Pengingat perpanjangan paket',`Paket Adik ${a.data.nama} memiliki sisa ${last.sisaPertemuan} pertemuan dan berlaku sampai ${last.berlakuSampai}. Silakan menghubungi admin untuk paket berikutnya.`);
    if(a.data.kelompok==='Prestasi Class' && !related.some(p=>p.periode===today.slice(0,7))) {
      const attended=(await pool.query("SELECT id FROM data_klub WHERE jenis='absensi' AND data->>'atletId'=$1 AND data->>'status'='Hadir' AND data->>'tanggal' LIKE $2 LIMIT 1",[String(a.id),today.slice(0,7)+'%'])).rows.length;
      if(attended && B.monthEnd(today)<=soon) await enqueue(pool,a.id,`spp:${today.slice(0,7)}`,'Pengingat SPP Prestasi',`SPP Prestasi Adik ${a.data.nama} bulan ${today.slice(0,7)} Rp250.000 jatuh tempo ${B.monthEnd(today)}. Mohon konfirmasi pembayaran kepada admin BRTM.`);
    }
  }
}
async function deliver(pool, sender = webpush.sendNotification) {
  const key=(await pool.query('SELECT * FROM brtm_push_keys WHERE id=1')).rows[0];
  const jobs=(await pool.query(`SELECT j.id,j.attempts,j.endpoint,s.subscription,n.event_key,n.title,n.body FROM brtm_push_jobs j JOIN brtm_notifications n ON n.id=j.notification_id JOIN brtm_push_subscriptions s ON s.endpoint=j.endpoint JOIN brtm_parents p ON p.id=s.parent_id AND p.athlete_id=n.athlete_id JOIN data_klub a ON a.id=p.athlete_id WHERE j.sent_at IS NULL AND j.attempts<5 AND j.next_attempt<=NOW() AND p.active=TRUE AND p.deleted=FALSE AND COALESCE(a.data->>'status','Aktif')<>'Nonaktif' ORDER BY j.id LIMIT 50`)).rows;
  for(const j of jobs) {
    // Claim durably before network IO; recover after a crash without concurrent duplicate sends.
    const claim=await pool.query('UPDATE brtm_push_jobs SET attempts=attempts+1,next_attempt=NOW()+INTERVAL \'5 minutes\' WHERE id=$1 AND next_attempt<=NOW() RETURNING id',[j.id]);
    if(!claim.rows.length)continue;
    try {
      await sender(j.subscription,JSON.stringify({title:'BRTM SWIM',body:j.event_key.startsWith('pengumuman:')?j.title+' · '+j.body:'Ada kabar terbaru dari BRTM. Buka aplikasi untuk melihat informasi anak.',tag:'brtm-'+j.id,url:'/swim/'}),{TTL:3600,timeout:15000,vapidDetails:{subject:'https://barathrum-app-production.up.railway.app',publicKey:key.public_key,privateKey:key.private_key}});
      await pool.query('UPDATE brtm_push_jobs SET sent_at=NOW() WHERE id=$1',[j.id]);
    } catch(e) { if([404,410].includes(e.statusCode))await pool.query('DELETE FROM brtm_push_subscriptions WHERE endpoint=$1',[j.endpoint]); }
  }
}
function startWorker(pool,payments) {
  let running=false;
  async function tick(){if(running)return;running=true;try{await reminders(pool,await payments());await deliver(pool);await require('./community').deliver(pool);}catch(e){console.error('BRTM notification worker:',e.code||e.name);}finally{running=false;}}
  tick(); const timer=setInterval(tick,60000);timer.unref();return ()=>clearInterval(timer);
}
module.exports={initDb,enqueue,afterSave,reminders,deliver,startWorker};

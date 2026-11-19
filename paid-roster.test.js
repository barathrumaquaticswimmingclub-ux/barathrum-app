'use strict';
const assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite'),supertest=require('supertest');
const B=require('./business'),{initDb,createApp,passwordHash}=require('./server');
(async()=>{
 const covers=require('./roster-eligibility').paidCovers;const cycle={status:'Lunas',jenisKelas:'Prestasi Class',tanggal:'2026-11-01',periodeMulai:'2026-11-16',periodeSelesai:'2026-12-16'};assert(!covers(cycle,'2026-11-10'));assert(covers(cycle,'2026-11-16'));assert(!covers(cycle,'2026-12-16'));
 let day='2026-11-16';B.today=()=>day;B.time=()=> '17:00:00';
 const db=new PGlite(),pool={async query(q,p){const r=await db.query(q,p);return {...r,rowCount:r.affectedRows||r.rows.length};},async connect(){return {query:pool.query,release(){}};}};
 await initDb(pool);await pool.query('UPDATE brtm_install SET completed=TRUE');
 for(const [name,role] of [['owner','owner'],['panji','coach'],['diandra','coach'],['juara','prestasi']])await pool.query('INSERT INTO brtm_users(username,nama,role,password_hash,must_change) VALUES($1,$1,$2,$3,FALSE)',[name,role,await passwordHash('paid-sync-test')]);
 const app=createApp({pool,secureCookies:false}),owner=supertest.agent(app),coach=supertest.agent(app),aliasParent=supertest.agent(app),otherCoach=supertest.agent(app);
 const call=async(agent,method,url,body,status=200)=>{const r=await agent[method](url).set('X-BRTM-Request','1').send(body);assert.equal(r.status,status,url+' '+JSON.stringify(r.body));return r.body;};
 for(const [agent,username] of [[owner,'owner'],[coach,'panji'],[otherCoach,'diandra']])await call(agent,'post','/auth/login',{username,password:'paid-sync-test'});
 const create=async(kind,d)=>(await call(owner,'post','/api/'+kind,d,201)).data;
 const child=async(n,extra={})=>create('atlet',{nama:n,kelompok:'Semi Private Class',status:'Aktif',...extra});
 const vino=await child('Vino'),gabriel=await child('Gabriel');
 const pack=async(a,start='2026-11-02',quota=4)=>create('pembayaran',{atletId:a.id,jenisKelas:a.kelompok,tanggal:start,status:'Lunas',paketKhusus:true,kuotaKhusus:quota,biayaKhusus:200000,alasanKhusus:'Paket sesuai catatan Owner'});
 await pack(vino);await call(owner,'post','/api/owner/schedule/coach',{coachId:'2',place:'Hotel Grand Wahid'});
 const slots=(await call(owner,'get','/api/owner/workspace')).slots,slot=slots.find(s=>s.weekday===1&&s.start_time==='15:00');
 const assign=(slot,ids)=>call(owner,'put','/api/owner/schedule/'+slot.id,{className:'Semi Private Class',athleteIds:ids,start:slot.start_time,end:slot.end_time});
 await assign(slot,[vino.id]);let session=(await call(coach,'get','/api/jadwal')).find(s=>s.tanggal===day&&s.weeklyKey==='weekly:'+slot.id);
 await call(coach,'post','/api/session-entry',{jadwalId:session.id,atletId:vino.id,tanggal:day,status:'Hadir',noted:'Latihan sesuai arahan.'});
 const recorded=(await pool.query("SELECT id,data FROM data_klub WHERE jenis='absensi'")).rows;
 day='2026-11-17';await call(owner,'put','/api/owner/athlete/'+gabriel.id+'/status',{status:'Nonaktif'});await pack(gabriel);
 assert.equal((await call(owner,'get','/api/atlet')).find(a=>a.id===gabriel.id).status,'Aktif','non-Prestasi payment must activate athlete');
 await assign(slot,[vino.id,gabriel.id]);
 session=(await call(coach,'get','/api/jadwal')).find(s=>s.id===session.id);assert(session.atletIds.includes(gabriel.id),'late entered paid Gabriel missing from previous Monday');
 assert.deepEqual((await pool.query("SELECT id,data FROM data_klub WHERE jenis='absensi'")).rows,recorded);
 await call(coach,'post','/api/session-entry',{jadwalId:session.id,atletId:gabriel.id,tanggal:'2026-11-16',status:'Hadir',noted:'Catatan susulan untuk latihan kemarin.'});
 await call(otherCoach,'post','/api/session-entry',{jadwalId:session.id,atletId:gabriel.id,tanggal:'2026-11-16',status:'Izin'},403);
 const identity={namaPanggilan:'Lula',tanggalLahir:'2018-05-12',noHpOrtu:'081122223333',namaOrtu:'Wali Lula'};
 const lula=await child('Alula sheza yunsira',identity);const lulaPack=await pack(lula,'2026-11-16',1),lulaSlot=slots.find(s=>s.weekday===1&&s.start_time==='16:00');await assign(lulaSlot,[lula.id]);
 const lulaSession=(await call(coach,'get','/api/jadwal')).find(s=>s.tanggal==='2026-11-16'&&s.weeklyKey==='weekly:'+lulaSlot.id);assert(lulaSession);
 await call(coach,'post','/api/session-entry',{jadwalId:lulaSession.id,atletId:lula.id,tanggal:'2026-11-16',status:'Hadir',noted:'Latihan pertama Lula selesai.'});
 const duplicate=await child('Alula sheza yunaira',identity),different=await child('Anak Berbeda',identity);await call(owner,'post','/api/orangtua/siapkan');
 await call(aliasParent,'post','/swim/api/login',{username:duplicate.nama,password:'brtm'});
 const billsBefore=(await pool.query("SELECT id,data FROM data_klub WHERE jenis='pembayaran' ORDER BY id")).rows;
 await app.locals.maintain();await app.locals.maintain();
 const all=await call(owner,'get','/api/atlet');assert(all.some(a=>a.id===duplicate.id));assert(all.some(a=>a.id===different.id));assert(all.some(a=>a.id===lula.id));
 const shadow=(await pool.query("SELECT data FROM data_klub WHERE id=$1",[duplicate.id])).rows[0].data;assert.equal(shadow.mergedInto,undefined);assert.equal(shadow.status,'Aktif');
 assert.deepEqual((await pool.query("SELECT id,data FROM data_klub WHERE jenis='pembayaran' ORDER BY id")).rows,billsBefore);
 const dash=await call(aliasParent,'get','/swim/api/dashboard');assert.equal(dash.profil.id,duplicate.id);assert.equal(dash.latihan.sisaPertemuan,null);
 assert((await call(owner,'get','/api/pembayaran')).some(p=>p.id===lulaPack.id&&p.totalPertemuan===1&&p.sisaPertemuan===0));
 await call(aliasParent,'post','/swim/api/logout');await call(aliasParent,'post','/swim/api/login',{username:duplicate.nama,password:'brtm'});assert.equal((await call(aliasParent,'get','/swim/api/dashboard')).profil.id,duplicate.id);
 await pool.query('UPDATE brtm_parents SET active=FALSE WHERE athlete_id=$1',[lula.id]);assert.equal((await call(aliasParent,'get','/swim/api/dashboard')).profil.id,duplicate.id);
 await pool.query('UPDATE brtm_parents SET active=TRUE WHERE athlete_id=$1',[lula.id]);
 await call(owner,'put','/api/owner/athlete/'+lula.id+'/status',{status:'Nonaktif'});assert.equal((await call(aliasParent,'get','/swim/api/dashboard')).profil.id,duplicate.id);
 // A settled invoice from a previous class cannot imply historical Prestasi membership.
 const moved=await create('atlet',{nama:'Pindah kelas historis',kelompok:'Prestasi Class',status:'Aktif'});
 await pool.query("INSERT INTO data_klub(jenis,data) VALUES('pembayaran',$1)",[JSON.stringify({atletId:moved.id,jenisKelas:'Regular Class (1x Seminggu)',status:'Lunas',tanggal:'2026-10-10',tanggalBerakhir:'2026-11-10',totalPertemuan:4,pemakaianAwal:0})]);
 await app.locals.maintain();const audit=await app.locals.rosterAudit();assert(!audit.issues.some(i=>i.id===moved.id&&i.reasons.some(r=>r.date==='2026-11-10')));
 // A legacy Juara session without a recurring flag must receive paid late members,
 // preserving its original coach/time instead of blocking the whole team roster.
 const originalTeam=await create('atlet',{nama:'Prestasi lama',kelompok:'Prestasi Class',status:'Aktif'}),lateTeam=await create('atlet',{nama:'Prestasi susulan',kelompok:'Prestasi Class',status:'Aktif'});
 await pool.query("UPDATE brtm_weekly_slots SET coach_id=3 WHERE place='Prestasi' AND coach_id=4");
 const legacy=await create('jadwal',{nama:'Prestasi sesi lama',tanggal:'2026-11-10',mulai:'15:00',selesai:'16:00',lokasi:'Kolam Renang Pondok Selfie',coachId:'4',jenisKelas:'Prestasi Class',atletIds:[originalTeam.id]});
 for(const a of [originalTeam,lateTeam])await create('pembayaran',{atletId:a.id,jenisKelas:a.kelompok,tanggal:'2026-11-01',status:'Lunas'});
 
 await pool.query("UPDATE brtm_spp_receipts SET paid_on='2026-11-01' WHERE athlete_id IN ($1,$2)",[originalTeam.id,lateTeam.id]);for(const a of [originalTeam,lateTeam])await require('./spp').reconcile(pool,a.id,{id:1,username:'owner'});
 await app.locals.maintain();const preserved=(await call(owner,'get','/api/jadwal')).find(s=>s.id===legacy.id);assert(preserved.atletIds.includes(lateTeam.id));assert.equal(preserved.coachId,'4');assert.equal(preserved.selesai,'16:00');
 assert(!(await app.locals.rosterAudit()).issues.some(i=>i.id===lateTeam.id));
 // A legacy session in a different venue keeps its existing members, while the
 // remaining paid members get their weekly session without duplicate bookings.
 await pool.query("DELETE FROM data_klub WHERE jenis='jadwal' AND data->>'tanggal'='2026-11-12'");
 const otherPool=await create('jadwal',{nama:'Prestasi tempat lama',tanggal:'2026-11-12',mulai:'15:00',selesai:'16:00',lokasi:'Hotel Grand Wahid Salatiga',coachId:'4',jenisKelas:'Prestasi Class',atletIds:[originalTeam.id]});
 await app.locals.maintain();const groups=(await call(owner,'get','/api/jadwal')).filter(j=>j.tanggal==='2026-11-12');
 const newGroup=groups.find(j=>j.weeklyKey);assert(newGroup);assert(newGroup.atletIds.includes(lateTeam.id));assert(!newGroup.atletIds.includes(originalTeam.id));assert.equal(newGroup.lokasi,'Kolam Renang Pondok Selfie');
 assert.equal(groups.find(j=>j.id===otherPool.id).lokasi,'Hotel Grand Wahid Salatiga');assert(!(await app.locals.rosterAudit()).issues.some(i=>[lateTeam.id,originalTeam.id].includes(i.id)));
 await db.close();console.log('PASS paid roster: Gabriel late assignment, existing attendance preserved, payment activation, coach isolation, distinct similar-name preservation, separate login/session, quota/cash preservation and inactive canonical protection.');
})().catch(e=>{console.error(e);process.exit(1);});

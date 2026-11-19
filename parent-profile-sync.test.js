'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),crypto=require('crypto'),sharp=require('sharp'),{PGlite}=require('@electric-sql/pglite'),request=require('supertest'),{JSDOM}=require('jsdom');
const B=require('./business'),{initDb,createApp,passwordHash}=require('./server');
(async()=>{
 B.today=()=> '2026-11-18';B.time=()=> '23:59:00';
 const db=new PGlite(),pool={async query(q,p){const r=await db.query(q,p);return {...r,rowCount:r.affectedRows||r.rows.length};},async connect(){return {query:pool.query,release(){}};}};
 await initDb(pool);await pool.query('UPDATE brtm_install SET completed=TRUE');
 for(const role of ['owner','coach','prestasi'])await pool.query('INSERT INTO brtm_users(username,nama,role,password_hash,must_change) VALUES($1,$1,$1,$2,FALSE)',[role,await passwordHash('profile-sync-test')]);
 const app=createApp({pool,secureCookies:false}),owner=request.agent(app),coach=request.agent(app),juara=request.agent(app),parent=request.agent(app),other=request.agent(app),anon=request(app);let checks=0;
 async function call(agent,method,url,body,status=200){const r=await agent[method](url).set('X-BRTM-Request','1').send(body);assert.equal(r.status,status,url+' '+JSON.stringify(r.body));checks++;return r.body;}
 for(const [a,username] of [[owner,'owner'],[coach,'coach'],[juara,'prestasi']])await call(a,'post','/auth/login',{username,password:'profile-sync-test'});
 const info={nama:'Anak Sinkron Satu',namaPanggilan:'Satu',tanggalLahir:'2016-01-02',jk:'Perempuan',namaOrtu:'Wali Satu',noHpOrtu:'081234567890',alamat:'Alamat lama',kelompok:'Prestasi Class',status:'Aktif'};
 const a=(await call(owner,'post','/api/atlet',info,201)).data;
 const b=(await call(owner,'post','/api/atlet',{...info,nama:'Anak Lain Dua',namaPanggilan:'Dua'},201)).data;
 const s=(await call(owner,'post','/api/jadwal',{nama:'Latihan',tanggal:B.today(),mulai:'15:00',selesai:'17:00',lokasi:'Pondok Selfie',coachId:'2',jenisKelas:'Prestasi Class',atletIds:[a.id,b.id]},201)).data;
 const payment=(await call(owner,'post','/api/pembayaran',{atletId:a.id,tanggal:B.today(),status:'Lunas'},201)).data;
 await call(owner,'post','/api/absensi',{jadwalId:s.id,atletId:a.id,tanggal:B.today(),status:'Hadir'},201);
 await call(owner,'post','/api/perkembangan',{jadwalId:s.id,atletId:a.id,tanggal:B.today(),catatan:'Catatan tetap'},201);
 await call(owner,'post','/api/orangtua/siapkan');
 for(const [agent,name] of [[parent,info.nama],[other,'Anak Lain Dua']])await call(agent,'post','/swim/api/login',{username:name,password:'brtm'});
 // A legacy payment attached by its unique name must survive a parent rename.
 await pool.query("UPDATE data_klub SET data=data-'atletId' WHERE id=$1",[payment.id]);
 let d=await call(parent,'get','/swim/api/dashboard');const stale=d.profil.revision;
 await call(anon,'put','/swim/api/profile',{nama:'Tidak sah'},401);
 await call(parent,'put','/swim/api/profile',{revision:stale,atletId:b.id,nama:'Tidak sah'},400);
 await call(parent,'put','/swim/api/profile',{revision:stale,kelompok:'Private Class'},400);
 await call(parent,'put','/swim/api/profile',{revision:stale,status:'Nonaktif'},400);
 await call(parent,'put','/swim/api/profile',{revision:stale,namaPanggilan:''},400);
 await call(parent,'put','/swim/api/profile',{revision:stale,tanggalLahir:'2099-01-01'},400);
 await call(parent,'put','/swim/api/profile',{revision:stale,nama:'Anak Lain Dua'},409);
 const bytes=await sharp({create:{width:1800,height:1200,channels:3,background:'blue'}}).tiff().toBuffer();
 await call(parent,'put','/swim/api/profile',{revision:stale,nama:'Anak Sinkron Baru',namaPanggilan:'Sapaan Baru',alamat:'Alamat baru',foto:{mime:'wrong',base64:bytes.toString('base64')}});
 d=await call(parent,'get','/swim/api/dashboard');assert.equal(d.profil.id,a.id);assert.equal(d.profil.nama,'Anak Sinkron Baru');assert.equal(d.profil.loginName,info.nama.toLowerCase());assert.notEqual(d.profil.revision,stale);
 await call(parent,'put','/swim/api/profile',{revision:stale,alamat:'Menimpa perubahan baru'},409);
 const beforeInvalid=d.profil.revision;await call(parent,'put','/swim/api/profile',{revision:beforeInvalid,nama:'Gagal',foto:{mime:'image/png',base64:Buffer.from('bad').toString('base64')}},400);
 assert.equal((await call(parent,'get','/swim/api/dashboard')).profil.revision,beforeInvalid);
 for(const agent of [owner,coach,juara]){const roster=await call(agent,'get','/api/atlet');const child=roster.find(x=>x.id===a.id);assert.equal(child.nama,'Anak Sinkron Baru');assert.equal(child.namaPanggilan,'Sapaan Baru');const photo=await agent.get(child.foto);assert.equal(photo.status,200);assert.match(photo.headers['content-type'],/image\/webp/);}
 for(const kind of ['absensi','perkembangan','pembayaran']){const row=(await call(owner,'get','/api/'+kind)).find(x=>x.atletId===a.id);assert.equal(row.namaAtlet,'Anak Sinkron Baru');if(kind==='pembayaran'){assert.equal(row.id,payment.id);assert.equal(row.totalTagihan,payment.totalTagihan);assert.equal(row.status,'Lunas');}}
 assert.equal((await call(other,'get','/swim/api/dashboard')).profil.nama,'Anak Lain Dua');assert.equal((await other.get('/swim/api/photo/'+a.id)).status,403);
 const pic=await parent.get(d.profil.foto);assert.equal(pic.headers['cache-control'],'no-store');const meta=await sharp(pic.body).metadata();assert(meta.width<=1000);assert.equal(meta.format,'webp');
 assert((await call(owner,'get','/api/audit')).some(x=>x.action==='ubah-profil-orangtua'&&x.username.startsWith('orangtua:')));
 const relog=request.agent(app);await call(relog,'post','/swim/api/login',{username:info.nama,password:'brtm'});
 // Forms use aliases and cautious identity matching across classes and inactive records.
 const token=crypto.randomBytes(32).toString('hex');await pool.query("INSERT INTO brtm_form_keys(kind,token_hash) VALUES('prestasi',$1)",[crypto.createHash('sha256').update(token).digest('hex')]);
 const foto={mime:'image/png',base64:fs.readFileSync('public/icons/brtm-brand-512.png').toString('base64')};
 const payload={...info,persetujuan:'Saya telah membaca dan menyetujui ketentuan BRTM.',foto};
 async function form(responseId,data){const r=await anon.post('/integrations/google-forms/prestasi').set('Authorization','Bearer '+token).send({responseId,data});assert.equal(r.status,200,JSON.stringify(r.body));return r.body;}
 assert.equal((await form('profile-old-name',payload)).status,'Tersambung');
 assert.equal((await form('profile-typo',{...payload,nama:'Anak Sinkron SatUu'})).status,'Perlu diperiksa');
 assert.equal((await call(owner,'get','/api/atlet')).length,2);
 const pending=(await pool.query("SELECT id FROM brtm_registrations WHERE response_id='profile-typo'")).rows[0];await call(owner,'post','/api/pendaftaran/'+pending.id+'/hubungkan',{atletId:'new'},409);
 // Confirmed twins with near-identical names require an explicit Owner review reason.
 const twinBase={...payload,nama:'Leona Ansana Aji Nismara',namaPanggilan:'Ona',tanggalLahir:'2021-01-07',kelompok:'Private Couple Class'};
 assert.equal((await form('twin-ona',twinBase)).status,'Tersambung');
 const ona=(await call(owner,'get','/api/atlet')).find(x=>x.nama===twinBase.nama);
 assert.equal((await form('twin-oni',{...twinBase,nama:'Leony Ansana Aji Nismara',namaPanggilan:'Oni'})).status,'Perlu diperiksa');
 const oniForm=(await pool.query("SELECT id FROM brtm_registrations WHERE response_id='twin-oni'")).rows[0];
 await call(owner,'post','/api/pendaftaran/'+oniForm.id+'/hubungkan',{atletId:'new'},409);
 await call(coach,'post','/api/pendaftaran/'+oniForm.id+'/hubungkan',{atletId:'new',distinctReason:'Saudara kembar Ona sesuai konfirmasi Owner'},403);
 await call(owner,'post','/api/pendaftaran/'+oniForm.id+'/hubungkan',{atletId:'new',distinctReason:'Saudara kembar Ona sesuai konfirmasi Owner'});
 const twins=(await call(owner,'get','/api/atlet')).filter(x=>[twinBase.nama,'Leony Ansana Aji Nismara'].includes(x.nama));assert.equal(twins.length,2);assert.notEqual(twins[0].id,twins[1].id);assert.equal(twins.find(x=>x.id===ona.id).namaPanggilan,'Ona');
 await call(owner,'post','/api/pendaftaran/'+oniForm.id+'/hubungkan',{atletId:'new',distinctReason:'Saudara kembar Ona sesuai konfirmasi Owner'},409);
 // Genuine sibling with distinct name/nickname remains a separate child.
 assert.equal((await form('profile-sibling',{...payload,nama:'Kirana Putri',namaPanggilan:'Kirana'})).status,'Tersambung');assert.equal((await call(owner,'get','/api/atlet')).length,5);
 d=await call(parent,'get','/swim/api/dashboard');
 // Parent UI exposes a dedicated editor, freezes revision and submits only editable fields.
 const dom=new JSDOM(fs.readFileSync('public/swim/index.html','utf8'),{url:'https://brtm.test/swim/',runScripts:'outside-only'}),w=dom.window;
 w.fetch=()=>new Promise(()=>{});w.setInterval=()=>0;w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};w.matchMedia=()=>({matches:false});
 w.eval(['progression.js','swim/swim.js','swim/feedback.js','swim/inbox.js','swim/portal.js'].map(p=>fs.readFileSync('public/'+p,'utf8')).join('\n'));
 w.eval('render('+JSON.stringify(d)+')');w.document.querySelector('[data-portal-tab=profile]').click();w.document.querySelector('[data-action=edit]').click();assert(w.document.getElementById('profileDialog').open);assert.equal(w.document.getElementById('profileDialog').dataset.revision,d.profil.revision);assert(!w.document.querySelector('[name=jadwalPilihan]'));assert(w.document.querySelector('[name=namaPanggilan]').required);
 let submitted;w.fetch=async(url,o={})=>{if(url==='/swim/api/profile')submitted=JSON.parse(o.body);const r=await parent[(o.method||'GET').toLowerCase()](url).set('X-BRTM-Request','1').send(o.body?JSON.parse(o.body):undefined);return {ok:r.status<400,status:r.status,json:async()=>r.body};};
 w.document.querySelector('[name=namaPanggilan]').value='Sapaan dari UI';const profileForm=w.document.getElementById('profileForm');await profileForm.onsubmit({preventDefault(){},target:profileForm});assert.equal(submitted.revision,d.profil.revision);assert(!Object.hasOwn(submitted,'jadwalPilihan'));assert.equal((await call(coach,'get','/api/atlet')).find(x=>x.id===a.id).namaPanggilan,'Sapaan dari UI');assert(!w.document.getElementById('profileDialog').open);assert(w.document.getElementById('portalPage').textContent.includes('Sapaan dari UI'));dom.window.close();
 // Owner filters retain class options, and each payment category selects the right rows.
 const staffDom=new JSDOM(fs.readFileSync('public/index.html','utf8'),{url:'https://brtm.test/',runScripts:'outside-only'}),sw=staffDom.window;sw.fetch=()=>new Promise(()=>{});sw.setInterval=()=>0;
 vm.runInContext(fs.readFileSync('public/app.js','utf8'),staffDom.getInternalVMContext());vm.runInContext(`S.user={role:'owner'};S.section='atlet';S.config={classes:{'Private Class':{}}};S.records.atlet=['Lunas','Belum ada pembayaran','Perlu perpanjangan','Belum Lunas','Tidak Ada SPP Bulan Ini'].map((statusSPP,i)=>({id:String(i),nama:'Anak '+i,status:'Aktif',statusSPP,kelompok:'Private Class'}));configureFilter();for(const f of ['Lunas','Belum ada pembayaran','Perlu perpanjangan','Belum Lunas']){$('filter').value=f;if(filteredRows().length!==(f==='Belum ada pembayaran'?2:1))throw Error('Filter '+f);}if([...$('filter').options].some(o=>['Aktif','Nonaktif'].includes(o.value)))throw Error('Old status filters');$('filter').value='Private Class';if(filteredRows().length!==5)throw Error('Class filter missing');`,staffDom.getInternalVMContext());staffDom.window.close();
 await db.close();console.log('PASS '+checks+' profile sync API checks + Parent/Owner DOM: own-account edits, protected fields, stale saves, compressed photos, central identity/history, stable login, audit, duplicate hold and payment filters.');
})().catch(e=>{console.error(e);process.exit(1);});

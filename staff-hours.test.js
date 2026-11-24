'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom'),{PGlite}=require('@electric-sql/pglite'),request=require('supertest');
const B=require('./business'),H=require('./staff-hours'),{initDb,createApp,passwordHash}=require('./server');
(async()=>{
 B.today=()=> '2026-11-24';
 const staff=[['owner','owner'],['Panji','coach'],['Fauzan','coach'],['Ilyas','coach'],['Adhi','coach'],['Juara','prestasi']].map(([nama,role],i)=>({id:String(i+1),nama,role,username:nama.toLowerCase(),active:true,profile:{}}));
 const schedules=[],attendance=[];
 function add(date,start,end,coach,regular=true,extra={},authors=['3']){const id=String(schedules.length+1);schedules.push({id,tanggal:date,mulai:start,selesai:end,coachId:coach,jenisKelas:regular?'Regular Class (1x Seminggu)':'Semi Private Class',statusSesi:'Terjadwal',...extra});for(const a of authors)attendance.push({jadwalId:id,tanggal:date,status:'Hadir',atletId:String(attendance.length+1),namaAtlet:'Atlet '+(attendance.length+1),dibuatOlehId:a,dibuatOleh:staff.find(u=>u.id===a)?.username});return id;}
 add('2026-11-23','15:00','16:00','4',true,{},Array(20).fill('3'));
 add('2026-11-23','15:00','16:00','4',true,{jenisKelas:'Regular Class (2x Seminggu)'},['3']);
 const corrected=add('2026-11-24','16:00','17:00','3',true,{},['4']);attendance.find(r=>r.jadwalId===corrected).diperbaruiOleh='owner';
 add('2026-11-21','08:00','09:00','4',true,{coachIds:['3','4']},['3']);
 add('2026-11-21','09:00','10:00','4',true,{coachIds:['3','4']},['3']);
 add('2026-11-21','15:00','16:00','4',true,{},['3']);
 add('2026-11-20','07:00','08:30','2',false);add('2026-11-20','08:00','09:00','2',false);
 add('2026-11-21','09:00','10:00','2',false);add('2026-11-21','15:00','16:00','2',false);
 add('2026-11-23','15:00','17:00','6',false,{jenisKelas:'Prestasi Class'});
 add('2026-11-25','15:00','16:00','2',false);add('2026-10-23','15:00','16:00','2',false);
 add('2026-11-24','10:00','11:00','2',false,{statusSesi:'Libur'});
 const izin=add('2026-11-24','11:00','12:00','2',false);attendance.find(r=>r.jadwalId===izin).status='Izin';
 const missing=add('2026-11-24','15:00','16:00','4',true,{},['1']);
 const legacy=add('2026-11-20','16:00','17:00','4',true,{},['3']);delete attendance.find(r=>r.jadwalId===legacy).dibuatOlehId;
 const result=H.calculate({staff,schedules,attendance,month:'2026-11'}),by=id=>result.rows.find(u=>u.id===id);
 assert.equal(by('2').jamPagi,2);assert.equal(by('2').jamSore,2);
 assert.equal(by('3').jamSore,5);assert.equal(by('3').jamPagi,0);
 assert.equal(by('4').jamSore,3);assert.equal(by('4').jamPagi,0);
 assert.equal(by('5').jamSore,2);assert(!by('6'));assert(!by('1'));assert.equal(result.unassignedSessions,1);
 assert.deepEqual(H.calculate({staff,schedules,attendance,month:'2026-12'}).rows.map(u=>u.jamSore),[0,0,0,0]);
 const db=new PGlite(),pool={async query(q,p){const r=await db.query(q,p);return {...r,rowCount:r.affectedRows||r.rows.length};},async connect(){return {query:pool.query,release(){}};}};
 await initDb(pool);await pool.query('UPDATE brtm_install SET completed=TRUE');
 for(const u of staff)await pool.query('INSERT INTO brtm_users(id,username,nama,role,password_hash,must_change) VALUES($1,$2,$3,$4,$5,FALSE)',[u.id,u.username,u.nama,u.role,await passwordHash('hours-test-password')]);
 for(const [kind,list] of [['jadwal',schedules],['absensi',attendance]])for(const row of list)await pool.query('INSERT INTO data_klub(jenis,data) VALUES($1,$2)',[kind,JSON.stringify(row)]);
 // Generated database IDs differ from the fixture session IDs; align the foreign references.
 const actual=(await pool.query("SELECT id,data FROM data_klub WHERE jenis='jadwal' ORDER BY id")).rows;
 for(const row of (await pool.query("SELECT id,data FROM data_klub WHERE jenis='absensi'")).rows){const s=actual.find(x=>x.data.id===row.data.jadwalId);await pool.query("UPDATE data_klub SET data=jsonb_set(data,'{jadwalId}',$1::jsonb) WHERE id=$2",[JSON.stringify(String(s.id)),row.id]);}
 const app=createApp({pool,secureCookies:false}),owner=request.agent(app),coach=request.agent(app);
 for(const [a,username] of [[owner,'owner'],[coach,'fauzan']])assert.equal((await a.post('/auth/login').set('X-BRTM-Request','1').send({username,password:'hours-test-password'})).status,200);
 assert.equal((await request(app).get('/api/owner/staff-hours')).status,401);
 assert.equal((await coach.get('/api/owner/staff-hours')).status,403);
 assert.equal((await owner.get('/api/owner/staff-hours?month=2026-13')).status,400);
 const response=await owner.get('/api/owner/staff-hours?month=2026-11');assert.equal(response.status,200);assert.deepEqual(response.body,result);
 const boundaryDates=['2026-10-31','2026-11-01','2026-11-30','2026-12-01'];
 const boundary=H.calculate({staff,schedules:boundaryDates.map((tanggal,i)=>({id:String(i),tanggal,mulai:'15:00',selesai:'16:00',coachId:'2',jenisKelas:'Semi Private Class'})),attendance:boundaryDates.map((tanggal,i)=>({jadwalId:String(i),tanggal,status:'Hadir',namaAtlet:'Anak batas bulan'})),month:'2026-11',today:'2026-12-01'});
 assert.equal(boundary.rows.find(r=>r.id==='2').jamSore,2);assert.deepEqual(boundary.rows.find(r=>r.id==='2').rincian.map(r=>r.tanggal),['2026-11-01','2026-11-30']);
 assert.equal(H.calculate({staff,schedules:[],attendance:[],month:'2028-02'}).end,'2028-02-29');
 assert.equal(result.start,'2026-11-01');assert.equal(result.end,'2026-11-30');
 for(const row of result.rows){assert.equal(row.rincian.filter(d=>d.kategori==='sore').reduce((n,d)=>n+d.menit,0),row.menitSore);assert.equal(row.rincian.filter(d=>d.kategori==='pagi').reduce((n,d)=>n+d.menit,0),row.menitPagi);}
 const saturday=by('3').rincian.find(r=>r.tanggal==='2026-11-21'&&r.mulai==='08:00');assert.equal(saturday.hari,'Sabtu');assert.equal(saturday.kategori,'sore');assert(saturday.kelas[0].atlet[0].nama.startsWith('Atlet '));
 assert.equal((await request(app).get('/api/owner/staff-hours/3/pdf?month=2026-11')).status,401);
 assert.equal((await coach.get('/api/owner/staff-hours/3/pdf?month=2026-11')).status,403);
 assert.equal((await owner.get('/api/owner/staff-hours/999/pdf?month=2026-11')).status,404);
 assert.equal((await owner.get('/api/owner/staff-hours/3/pdf?month=2026-99')).status,400);
 const pdf=await owner.get('/api/owner/staff-hours/3/pdf?month=2026-11');assert.equal(pdf.status,200);assert.match(pdf.headers['content-type'],/application\/pdf/);assert.match(pdf.headers['content-disposition'],/2026-11/);assert(Buffer.isBuffer(pdf.body));assert.equal(pdf.body.subarray(0,5).toString(),'%PDF-');if(process.env.BRTM_PDF_TEST_OUTPUT)fs.writeFileSync(process.env.BRTM_PDF_TEST_OUTPUT,pdf.body);
 assert.equal(require('./releases').isProtected({path:'/api/owner/staff-hours/3/pdf',method:'GET'}),false);
 assert.equal((await owner.get('/api/owner/staff-hours')).body.month,'2026-11');await db.close();
 // Exercise the actual UI hooks, month filter, search and role visibility.
 const dom=new JSDOM('<div id="records"></div><div id="sectionSummary"></div><input id="search"><select id="filter"></select><input id="monthFilter">',{runScripts:'outside-only'}),w=dom.window;
 w.eval(`var title={},icons={},descriptions={},S={user:{role:'owner'},section:'slipgaji',config:{today:'2026-11-24'}};var $=id=>document.getElementById(id),isOwner=()=>S.user.role==='owner',menuKeys=()=>['dashboard','akun','laporan'],canWrite=()=>true,configureFilter=()=>{},renderList=()=>{},displayDate=x=>String(x),modal=(name,html)=>{document.getElementById('sectionSummary').insertAdjacentHTML('beforeend','<div id="hoursTestModal">'+html+'</div>');},esc=x=>String(x),grid=(h,r)=>'<table><thead><tr>'+h.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+r.map(row=>'<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table>',calls=[],request=async url=>{calls.push(url);return ${JSON.stringify(result)}};`);
 w.eval(fs.readFileSync('public/staff-hours-ui.js','utf8'));assert.deepEqual(Array.from(w.eval('menuKeys()')),['dashboard','akun','slipgaji','laporan']);assert(!w.eval("canWrite('slipgaji')"));
 w.eval('renderList()');await new Promise(r=>setTimeout(r,0));assert.equal(w.document.querySelectorAll('th').length,5);assert(w.document.querySelector('#records').textContent.includes('Fauzan'));assert(w.document.querySelector('#records').textContent.includes('5 jam'));
 w.document.querySelector('#staffHoursMonth').value='2026-10';w.document.querySelector('#staffHoursMonth').dispatchEvent(new w.Event('change'));await new Promise(r=>setTimeout(r,0));assert(w.eval('calls.at(-1)').endsWith('2026-10'));
 w.document.querySelector('#search').value='fauzan';w.eval('renderList()');await new Promise(r=>setTimeout(r,0));assert.equal(w.document.querySelectorAll('tbody tr').length,1);
 w.document.querySelector('[data-hours-detail]').click();assert(w.document.querySelector('#hoursTestModal').textContent.includes('2026-11-01'));assert(w.document.querySelector('#hoursTestModal').textContent.includes('Sabtu'));assert(w.document.querySelector('#hoursTestModal').textContent.includes('Atlet '));assert(w.document.querySelector('#hoursTestModal a').getAttribute('href').includes('/3/pdf?month=2026-11'));
 w.eval("S.user.role='coach'");assert(!w.eval('menuKeys()').includes('slipgaji'));dom.window.close();
 console.log('PASS staff hours: Owner-only API/menu, month/search, union of hours rather than child counts, morning/afternoon, Saturday exception, Regular writers/shared Saturday, historical author preservation and Prestasi alias.');
})().catch(e=>{console.error(e);process.exit(1);});

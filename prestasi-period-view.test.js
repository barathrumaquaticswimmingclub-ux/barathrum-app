'use strict';
const fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom'),assert=require('node:assert/strict');
const dom=new JSDOM(fs.readFileSync('public/index.html','utf8'),{url:'https://brtm.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
w.fetch=()=>new Promise(()=>{});w.setInterval=()=>0;
const run=s=>vm.runInContext(s,dom.getInternalVMContext());
try{
 for(const file of ['app','intake','prestasi-ui','operations-ui','community-ui','spp-ui','owner-tables','coach-ui'])run(fs.readFileSync('public/'+file+'.js','utf8'));
 run(`S.user={id:'1',role:'owner'};S.config={today:'2026-12-01'};S.section='pembayaran';S.records={atlet:[{id:'2',nama:'Contoh',kelompok:'Prestasi Class',status:'Aktif'}],pembayaran:[{id:'3',atletId:'2',jenisKelas:'Prestasi Class',periode:'2026-11',periodeMulai:'2026-11-28',periodeSelesai:'2026-12-28',periodeLabel:'November 2026 – Desember 2026',tanggal:'2026-11-28',status:'Lunas'},{id:'4',atletId:'2',jenisKelas:'Prestasi Class',periode:'2026-12',tanggal:'2026-12-01',status:'Tidak Ditagih'}]};$('monthFilter').value='2026-12';renderList();`);
 const content=()=>w.document.getElementById('records').textContent;
 assert(content().includes('November 2026 – Desember 2026'));assert(content().includes('Lunas'));assert(!content().includes('Belum Lunas'));
 run(`Object.assign(S.records.pembayaran[1],{status:'Belum Lunas',periodeMulai:'2026-12-28',periodeSelesai:'2027-01-28',periodeLabel:'Desember 2026 – Januari 2027'});renderList();`);
 assert(content().includes('Desember 2026 – Januari 2027'));assert(content().includes('Terakhir lunas: November 2026 – Desember 2026'));
 console.log('PASS Owner SPP report: cross-month filter, no zero-invoice false debt, current unpaid and last settled cycle labels.');
}finally{dom.window.close();}

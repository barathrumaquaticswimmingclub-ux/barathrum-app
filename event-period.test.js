'use strict';
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const M=require('./public/event-results');
const base={event:'Grand KRAPPROV FAI Jawa Tengah 2026 – Magelang',lokasi:'Samapta Aquatic Stadium, Kota Magelang',kolam:50,ronde:'Final'};
const rows=[['2026-11-12','Bebas',50,31.70],['2026-11-12','Bebas',800,704.71],['2026-11-13','Bebas',100,69.77],['2026-11-13','Bebas',400,332],['2026-11-14','Bebas',200,151.44]].map(([tanggal,gaya,jarak,detik],i)=>({...base,tanggal,gaya,jarak,detik,id:String(i+1),eventId: tanggal}));
const before=JSON.stringify(rows);
assert.equal(M.meetings(rows).length,1);
assert(M.meetingOptions(rows).includes('12–14 November 2026'));
for(const owner of [false,true]){
 const dom=new JSDOM(M.table(rows,50,owner,'all',M.meetingKey(rows[0]))),doc=dom.window.document;
 assert.equal(doc.querySelectorAll('thead th').length,3,'One result column for the whole meet');
 assert.equal(doc.querySelectorAll('[data-race-result]').length,5,'All five times remain visible');
 assert.equal(doc.querySelectorAll('[data-race-edit]').length,owner?3:0,'Keep each original result sheet editable');
 assert(doc.querySelector('thead').textContent.includes('12–14 November 2026'));
 for(const tr of doc.querySelectorAll('tbody tr'))assert.equal(tr.children.length,3);
 dom.window.close();
}
assert.equal(JSON.stringify(rows),before,'Source dates and records remain unchanged');
const unrelated={...rows[0],eventId:'other',id:'other',tanggal:'2026-12-12'};
assert.equal(M.meetings([...rows,unrelated]).length,2,'Other editions stay separate');
assert.equal(M.groups([...rows,{...rows[0],kolam:25}],50).length,1);
assert.equal(M.groups([...rows,{...rows[0],eventId:'semi',ronde:'Semifinal'}],50).length,2,'Rounds remain identifiable');
console.log('PASS event period: one column, all results, source dates unchanged, original edits retained, separate editions/pools/rounds.');

'use strict';
const assert=require('node:assert/strict'),P=require('./training-periodization'),seed=require('./training-seed');
const peaks=[{name:'POPDA Kota',start:'2027-04-10',end:'2027-04-11',confirmed:true}];
let count=0;for(const date of Object.keys(seed.programs).filter(d=>d>='2026-11-17'))for(const pk of [[],peaks]){
 const p=P.generate(date,pk);assert(p,date);require('./training-board').validPlan(p);count++;
 const sets=[];p.lines.forEach((text,i)=>{
 const rows=text.split('\n').filter(r=>/^\d+ x \d+ /.test(r));
 const total=rows.reduce((n,r)=>{const m=r.match(/^(\d+) x (\d+) /);assert(+m[1]>0&&+m[2]>0);assert(/rest \d+ detik|@\d+:\d{2}/.test(r));return n+(+m[1])*(+m[2]);},0);
 assert.equal(total,p.targetTotals[i],date+' L'+(i+1));
 assert(!/gerakan nyaman|ritme nyaman|kontrol ritme|pace nyaman|sesuai kebutuhan|ulang.*tidak rapi|turn rapi|rest bebas/i.test(text),date);
 assert(text.includes('ganti alat 45 detik'));assert(text.includes('Rotate Comby + F'));assert(text.includes('menit ke-90'));
 if(i===1)assert(!/\bEN[23]\b|HR=|@\s*\d|\+\s*(?:P|S)\b/.test(text),date+' foundation');
 else assert(text.includes('EN2/EN3 adalah jenis latihan'));
 sets.push(text.split('SET ·')[1].split('CD ·')[0].replace(/\d+/g,'#'));
 });
 assert.equal(new Set(sets).size,4,date+' different line objectives');
}
assert.deepEqual(P.generate('2026-11-16').targetTotals,[3400,1300,4200,4000]);
assert.deepEqual(P.generate('2026-11-17').targetTotals,[3600,2000,5000,4400]);
assert(P.generate('2027-04-05',peaks).phase.startsWith('TAPER'));
assert(P.generate('2027-04-05',peaks).targetTotals[2]<P.generate('2027-03-15',peaks).targetTotals[2]);
assert.equal(P.generate('2026-11-22'),null);assert.equal(P.generate('2028-01-01'),null);
console.log('PASS',count,'future plans: distances, four distinct main sets, fixed rest/transitions, equipment, HR convention, historical program and taper.');

const S=require('./training-prescription').SENDOFF;assert.deepEqual(S,{1:{EN2:130,EN3:120},3:{EN2:90,EN3:80},4:{EN2:100,EN3:100}});
const monday=P.generate('2026-11-30');for(const [i,t] of [[0,'@2:10'],[2,'@1:30'],[3,'@1:40']])assert(monday.lines[i].split('SET ·')[1].includes(t));

const T=require('./training-board');for(const d of ['2026-11-17','2026-11-18'])for(const f of ['skill','aerobic','speed'])assert.doesNotThrow(()=>T.validPlan(T.starter(d,f)));
assert(P.generate('2026-11-21').lines[2].split('SET ·')[1].includes('@1:20'));console.log('PASS Coach-confirmed 100 m send-offs and all starters.');

const S50=require('./training-prescription').SENDOFF50;assert.deepEqual(S50,{1:{EN2:80,EN3:70},3:{EN2:60,EN3:50},4:{EN2:70,EN3:60}});
for(const date of ['2026-11-17','2026-11-18','2026-11-21']){const p=P.generate(date);const rows=p.lines[1].split('\n').filter(r=>/^\d+ x 50 /.test(r));for(const r of rows)assert(/rest (15|20) detik$/.test(r));}
const fast=P.generate('2026-11-18');assert(fast.lines[0].includes('FR EN3 (HR=19/6 detik) @1:10'));assert(fast.lines[3].includes('FR EN3 (HR=19/6 detik) @1:00'));
console.log('PASS independent 50m send-offs, unchanged 100m anchors, and Line 2 fixed 15/20-second rests.');


// Remainders must preserve the component sum, not copy a longer drill.
for(let at=Date.parse('2026-11-17T12:00:00Z');at<=Date.parse('2027-12-31T12:00:00Z');at+=86400000){
 const date=new Date(at).toISOString().slice(0,10);
 for(const focus of [undefined,'skill','aerobic','speed']){
  const p=require('./training-prescription').generate(date,peaks,P.phaseFor,focus);if(!p)continue;
  require('./training-board').validPlan(p);
  p.lines.forEach((text,line)=>{
   const rows=text.split('\n').filter(r=>/^\d+ x \d+ /.test(r));
   const total=rows.reduce((sum,r)=>{const m=r.match(/^(\d+) x (\d+) /);const pieces=r.match(/^\d+ x \d+ (25|50) .+? \+ (25|50|75) (?:FR|BK)/);if(pieces)assert.equal(+pieces[1]+ +pieces[2],+m[2],date+' '+r);return sum+ +m[1]* +m[2];},0);
   assert.equal(total,p.targetTotals[line],date+' total');
   assert(!text.includes('ACUAN 50 m')&&!text.includes('ACUAN 100 m'));
   assert(!/pull \+ PB \+ 25 FR tanpa alat|kick \+ F \+ B \+ 25 FR/.test(text));
  });
 }
}
console.log('PASS all dates and focus variants: component distances, nominal totals, foundation restrictions and equipment transitions.');

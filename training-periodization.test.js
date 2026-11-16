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
 else assert(text.includes('HR=17')||text.includes('HR target'));
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

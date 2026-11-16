'use strict';
const assert=require('node:assert/strict'),P=require('./training-periodization'),T=require('./training-board'),R=require('./training-prescription');
const peaks=[{name:'POPDA Kota',start:'2027-04-10',end:'2027-04-11',confirmed:true},{name:'Provinsi',start:'2027-09-15',end:'2027-09-16',confirmed:true}];
function blocks(text){const out={};let key=null;for(const row of text.split('\n')){const h=row.match(/^(WU|PRE MS|SET|CD) · /);if(h){key=h[1];out[key]=[];}else if(key&&/^\d+ x \d+ /.test(row))out[key].push(row);}return out;}
let count=0;
for(let at=Date.parse('2026-11-17T12:00:00Z');at<=Date.parse('2027-12-31T12:00:00Z');at+=86400000){
 const d=new Date(at).toISOString().slice(0,10);
 for(const pk of [[],peaks])for(const focus of [undefined,'skill','aerobic','speed']){
  const p=R.generate(d,pk,P.phaseFor,focus);if(new Date(at).getUTCDay()===0){assert.equal(p,null);continue;}
  T.validPlan(p);count++;
  assert(p.estimatedMinutes.every(n=>n>0&&n<=90),d+' estimated time');
  p.lines.forEach((text,i)=>{
   const b=blocks(text);assert.deepEqual(Object.keys(b),['WU','PRE MS','SET','CD']);
   for(const rows of Object.values(b))assert(rows.length>0);
   const signatures=rows=>rows.map(r=>r.replace(/^\d+ x \d+ /,'').replace(/ (?:rest \d+ detik|@\d+:\d{2}).*$/,''));
   const pre=new Set(signatures(b['PRE MS']));assert(!signatures(b.SET).some(s=>pre.has(s)),d+' duplicated pre/main task');
   assert(!b.WU.some(r=>/EN[23]|max|HR acuan|@/.test(r)),d+' warm-up overload');
   assert(!b.CD.some(r=>/EN[23]|max|HR acuan|@/.test(r)),d+' cool-down overload');
   const total=Object.values(b).flat().reduce((sum,r)=>{const m=r.match(/^(\d+) x (\d+) /);assert(+m[1]>0&&+m[2]>0);assert.equal(+m[2]%25,0);assert(/rest \d+ detik|@\d+:\d{2}/.test(r));const parts=r.match(/^\d+ x \d+ (25|50) .+? \+ (25|50|75) (?:FR|BK)/);if(parts)assert.equal(+parts[1]+ +parts[2],+m[2],d+' '+r);return sum+ +m[1]* +m[2];},0);
   assert.equal(total,p.targetTotals[i],d+' total');assert(total<=p.requestedTotals[i]);
   assert(text.includes('Rotate Comby + F'));assert(text.includes('menit ke-90'));assert(text.includes('ganti alat 45 detik'));
   assert(!/gerakan nyaman|ritme nyaman|kontrol ritme|pace nyaman|rest bebas/.test(text));
   if(i===1){assert(!T.unsafeFoundation(text));for(const r of [...b.WU,...b['PRE MS'],...b.SET].filter(r=>/^\d+ x 50 /.test(r)))assert(/rest (15|20) detik$/.test(r));}
   if(!focus&&new Date(at).getUTCDay()===2&&i!==1)assert(!b.SET.some(r=>/EN[23]|kecepatan singkat/.test(r)),d+' Tuesday');
  });
 }
}
assert.deepEqual(P.generate('2026-11-16').targetTotals,[3400,1300,4200,4000]);
assert(P.generate('2026-11-17').targetTotals.every((n,i)=>n<=[3600,2000,5000,4400][i]));
assert.deepEqual(R.SENDOFF,{1:{EN2:130,EN3:120},3:{EN2:90,EN3:80},4:{EN2:100,EN3:100}});
assert.deepEqual(R.SENDOFF50,{1:{EN2:80,EN3:70},3:{EN2:60,EN3:50},4:{EN2:70,EN3:60}});
assert.equal(P.generate('2028-01-01'),null);
const thursday=P.generate('2026-11-19');assert(thursday.title.includes('Kamis sedang'));assert(thursday.objectives[2].includes('Beban sedang'));
const taper=P.generate('2027-04-05',peaks);assert(taper.phase.startsWith('TAPER'));assert(taper.targetTotals[2]<P.generate('2027-01-18').targetTotals[2]);assert(taper.lines[2].includes('kecepatan singkat'));
assert(!P.generate('2027-04-05',peaks.map(p=>({...p,confirmed:false}))).phase.startsWith('TAPER'));
const saturdayTypes=new Set();for(let at=Date.parse('2027-01-01T12:00:00Z');at<Date.parse('2027-12-01T12:00:00Z');at+=86400000){const d=new Date(at).toISOString().slice(0,10);if(new Date(at).getUTCDay()!==6)continue;const p=P.generate(d);if(p.objectives[2].startsWith('Hard utama:'))saturdayTypes.add(p.objectives[2]);}assert.equal(saturdayTypes.size,3);
for(const focus of ['skill','aerobic','speed'])assert.doesNotThrow(()=>T.validPlan(T.starter('2026-11-18',focus)));
console.log('PASS',count,'plans: block purpose, no duplicate pre/main tasks, rest/equipment, distances, time estimates, Thursday, Saturday rotation, taper activation and legacy preservation.');

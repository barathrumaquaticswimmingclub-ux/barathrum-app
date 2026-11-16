'use strict';
const assert=require('node:assert/strict'),P=require('./training-periodization'),T=require('./training-board'),seed=require('./training-seed');
const nominal=text=>text.split('\n').reduce((sum,r)=>{const m=r.match(/^(\d+) x (\d+) /);return sum+(m?+m[1]*+m[2]:0);},0);
const seen=[new Set(),new Set(),new Set(),new Set()];
let days=0;
for(const date of Object.keys(seed.programs)){
 const p=P.generate(date);assert(p,date);days++;
 p.lines.forEach((text,i)=>{
  assert.equal(nominal(text),p.targetTotals[i],date+' line '+(i+1));
  assert(text.includes('Rotate Comby + F'));
  for(const block of ['WU','PRE MS','SET','CD'])assert(text.includes(block+' · batas '));
  assert(p.estimatedMinutes[i]<=90,date+' duration');seen[i].add(text);
 });
 assert(!T.unsafeFoundation(p.lines[1]),date+' foundation');
 assert(!p.lines.some(x=>/@\s*\d/.test(x)),date+' uncalibrated send-off');
 assert(!p.phase.startsWith('TAPER'),'Unconfirmed event must not start a taper');
}
assert.equal(days,353);assert(seen.every(x=>x.size>20),'Program should vary across days/weeks/phases');
assert.equal(P.generate('2026-11-22'),null);assert.equal(P.generate('2028-01-01'),null);
const peaks=[{name:'POPDA Kota',start:'2027-04-10',end:'2027-04-11',confirmed:true}];
assert(P.generate('2027-04-05',peaks).phase.startsWith('TAPER'));
assert(P.generate('2027-04-10',peaks).phase.startsWith('LOMBA'));
assert(P.generate('2027-04-12',peaks).phase.startsWith('PEMULIHAN'));
assert(P.generate('2027-03-15',peaks).phase.startsWith('SPESIFIK'));
const before=P.generate('2027-03-15',peaks),taper=P.generate('2027-04-05',peaks);
for(const i of [0,2,3])assert(taper.targetTotals[i]<before.targetTotals[i]);
const moved=[{...peaks[0],start:'2027-05-10',end:'2027-05-11'}];
assert(!P.generate('2027-04-05',moved).phase.startsWith('TAPER'));
for(const tool of ['+P','+S']){const p=P.generate('2026-11-16');p.lines[1]+='\n4 x 25 FR '+tool;assert.throws(()=>T.validPlan(p));}
const base=P.generate('2026-11-16');assert.doesNotThrow(()=>T.validPlan(base));
console.log('PASS 353 sessions / 1,412 line programs: exact totals, block budgets, variation, equipment, confirmed-date taper and peak shifts.');

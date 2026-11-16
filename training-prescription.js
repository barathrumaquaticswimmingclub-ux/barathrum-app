'use strict';
// Coach's BRTM labels: EN2/HR17 and EN3/HR19 per six seconds.
// This is a local prescription convention, not a universal physiological zone definition.
const VERSION='BRTM-20261117-LINE-REST-HR';
const PROFILES={1:'Pengembangan: koordinasi FR, panjang kayuhan dan pengenalan set berulang',2:'Fondasi: napas samping, keseimbangan, koordinasi dan dorongan dinding',3:'Kapasitas: EN2 berulang, EN3 dan daya tahan kecepatan',4:'Kompetitif berkembang: catch, kaki, transisi alat ke renang dan pecahan 50–100'};
const BASE={1:[3800,3600,3800,3000,4000,4000],2:[2000,2000,2100,1700,2100,2100],3:[5200,5000,5400,4200,5400,5600],4:[4600,4400,4800,3800,4800,5000]};
const SENDOFF={1:{EN2:130,EN3:120},3:{EN2:90,EN3:80},4:{EN2:100,EN3:100}};
const clock=n=>Math.floor(n/60)+':'+String(n%60).padStart(2,'0');
const WEEK=604800000,round=n=>Math.round(n/50)*50;
function makeLine(d,line,phase,deload,focus){
 const day=(new Date(d+'T12:00:00Z').getUTCDay()+6)%7;
 const variant=((Math.floor((Date.parse(d)-Date.parse('2026-11-16'))/WEEK)%3)+3)%3;
 const low=['taper','meet','recovery'].includes(phase.key)||deload||day===3;
 let factor=['taper','meet','recovery'].includes(phase.key)?phase.scale:d.startsWith('2027-02')?.75:d.startsWith('2027-03')?.9:1;
 if(deload)factor=Math.min(factor,.8);
 const target=round(BASE[line][day]*factor),s=n=>Math.max(50,round(n*factor));
 const rows=[];const add=(n,m,text,rest=20)=>rows.push({n,m,text,rest});
 const split=(metres,unit,text,rest)=>{const n=Math.floor(metres/unit),tail=metres%unit;if(n)add(n,unit,text,rest);if(tail)add(1,tail,text,rest);};
 const blocks=[];const block=name=>{const rs=rows.splice(0);for(const r of rs){if(line!==2&&r.m===100&&/^FR · EN[23]/.test(r.text)){const zone=r.text.match(/EN[23]/)[0];r.sendoff=SENDOFF[line][zone];}}blocks.push({name,rows:rs});};
 // Preserve signature, but scale warm-up by readiness rather than cloning all lines.
 if(line===2){add(2,s(100),'FR + F: napas samping setiap 2 kayuhan',20);add(1,s(200),'Rotate Comby + F',20);add(2,50,'FR tanpa alat: hembus napas di air',20);}
 else {add(1,s(line===1?300:400),'FR + F · EN2',20);add(1,s(400),'Rotate Comby + F · EN2',20);add(1,s(line===3?400:200),'FR tanpa alat · EN2',20);}
 block('WU');
 if(line===2){add(Math.max(2,Math.round(4*factor)),25,'FR side balance + F: 6 tendangan per sisi',25);add(Math.max(2,Math.round(4*factor)),50,'25 FR satu tangan kanan + 25 tangan kiri + F',25);add(Math.max(2,Math.round(4*factor)),25,'FR kick + B: napas samping',25);}
 else if(line===1){split(s(300),50,'25 FR catch-up + 25 FR + F',20);split(s(300),50,'25 FR scull + 25 FR + S',20);}
 else if(line===3){split(s(400),100,'25 FR scull + 75 FR pull + PB + S · EN2',15);split(s(400),50,'FR kick + F + B + S · EN2',20);}
 else {split(s(400),50,'25 FR satu tangan + 25 FR + F + S',20);split(s(400),50,'FR kick + F + B · EN2',20);}
 block('PRE MS');
 const used=blocks.flatMap(b=>b.rows).reduce((a,r)=>a+r.n*r.m,0),cd=s(line===2?100:line===3?400:300),remain=target-used-cd;
 const technique=focus==='skill'||(focus!=='speed'&&focus!=='aerobic'&&day===1)||line===2;
 if(line===2){
  const a=round(remain*.35),b=round(remain*.3);
  const skills=['25 FR napas kanan + 25 napas kiri + F','25 FR 6 tendangan/1 kayuhan + 25 FR + F','25 BK satu tangan + 25 BK + F'];
  split(a,50,skills[variant],25);split(b,50,'25 FR pull + PB + 25 FR tanpa alat',25);split(remain-a-b,50,'25 dorong dinding streamline 3 m lalu FR + 25 FR sentuh dinding satu tangan',30);
 }else if(technique){
  const a=round(remain*.4),b=round(remain*.3);
  const drills={1:['25 FR 6 tendangan/1 kayuhan + 25 FR + F','25 FR catch-up + 25 FR + S','25 FR satu tangan + 25 FR + F'],3:['25 FR scull + 75 FR pull + PB + S','25 FR kepalan tangan + 75 FR + S','25 FR satu tangan + 75 FR + F'],4:['25 FR scull + 25 FR + S','25 FR satu tangan + 25 FR + F','25 FR catch-up + 25 FR + S']};
  split(a,line===3?100:50,drills[line][variant]+' · EN2',20);
  split(b,50,line===1?'FR kick + F + B · EN2':line===3?'FR kick + F + B + S · EN2':'25 FR kick + F + B + 25 FR + F · EN2',20);
  split(remain-a-b,line===3?100:50,line===1?'FR tanpa alat: napas setiap 2 kayuhan · EN2':line===3?'FR tanpa alat: dorong dinding streamline 3 m · EN2':'FR tanpa alat: 25 napas setiap 2 kayuhan + 25 napas setiap 3 kayuhan · EN2',20);
 }else if(low||focus==='aerobic'||day===0){
  const a=round(remain*.7);split(a,line===1?100:line===3?(variant===1?200:100):100,'FR · EN2 · HR=17/6 detik',line===3?15:20);
  split(remain-a,50,line===4?'25 FR pull + PB + 25 FR tanpa alat · EN2':line===3?'FR pull + PB + S · EN2':'FR kick + F + B · EN2',20);
 }else {
  const a=round(remain*(line===3?.65:.5));
  const work=line===1?'FR: 25 EN3 + 25 EN2':line===3?(day===5?'FR · EN3 · HR=19/6 detik':'FR: 75 EN2 + 25 EN3'):day===5?'FR kick + F + B · EN3':'FR: 25 EN3 + 25 EN2';
  split(a,line===3?100:50,work,line===3?25:30);
  split(remain-a,line===1?100:line===3?200:100,line===4?'FR tanpa alat: 50 EN2 + 50 EN3':'FR · EN2 · HR=17/6 detik',20);
 }
 block('SET');add(1,cd,'swim off FR tanpa alat',0);block('CD');
 const total=blocks.flatMap(b=>b.rows).reduce((a,r)=>a+r.n*r.m,0);if(total!==target)throw Error('Prescription total mismatch');
 const deadlines=line===2?[15,35,80,90]:line===1?[18,35,80,90]:[18,32,80,90];
 let text='TUJUAN LINE '+line+': '+PROFILES[line]+'\n';
 text+='REST = selesai menyentuh dinding sampai mulai repetisi berikutnya. Rest hanya antar repetisi.\n';
 text+='JEDA antar set tanpa ganti alat 30 detik; ganti alat 45 detik. Jeda menggantikan rest setelah repetisi terakhir, bukan ditambahkan.\n';
 text+='Antar blok WU → PRE MS dan PRE MS → SET 60 detik termasuk ganti alat/minum; SET → CD 30 detik.\n';
 text+=line===2?'Demonstrasi sebelum setiap blok SET 60 detik; koreksi setelah setiap 4 repetisi 30 detik menggantikan rest.\n':'';
 if(line!==2)text+='ACUAN 100 m nominal FR: EN2 @'+clock(SENDOFF[line].EN2)+'; EN3 @'+clock(SENDOFF[line].EN3)+'. @ = start-ke-start, sudah termasuk rest; jangan menambah rest repetisi. Acuan ini tidak otomatis dikalikan untuk drill, kick, alat atau jarak lain.\n';
 if(line!==2)text+='EN2/EN3 mengikuti istilah Coach BRTM. HR target akhir blok EN2=17 dan EN3=19 denyut/6 detik; cek dalam jeda 30 detik setelah blok. WU/drill/CD tidak dikejar HR.\n';
 for(let i=0;i<blocks.length;i++){const b=blocks[i];text+='\n'+b.name+' · batas kumulatif menit ke-'+deadlines[i]+'\n'+b.rows.map(r=>`${r.n} x ${r.m} ${r.text} | ${r.sendoff?'@'+clock(r.sendoff):'rest '+r.rest+' detik'}`).join('\n')+'\n';}
 text+=`\nTARGET ${total} m nominal | ${Math.round(total*.88)} m aktual\n`;
 text+='Batas kumulatif adalah tenggat, bukan perintah menunggu. Lanjut setelah jeda tertulis. Mulai CD paling lambat menit ke-80; berhenti maksimal menit ke-90 dan catat repetisi yang belum selesai. Tidak menambah ulangan di luar jumlah tertulis.\n';
 text+=line===1?'Beban awal sementara; laporan 16 November belum mengonfirmasi kapasitas Line 1.':'Kalibrasi awal dari laporan 16 November: L2 WU ±8/total ±50 menit; L3 WU ±16/total ±60; L4 WU ±18/total ±55. Durasi program baru belum diuji.';
 return {text,total,minutes:null};
}
function generate(d,peaks,phaseFor,focus){
 if(d<'2026-11-17'||d>'2027-12-31'||new Date(d+'T12:00:00Z').getUTCDay()===0)return null;
 const phase=phaseFor(d,peaks),w=Math.floor((Date.parse(d)-Date.parse('2026-11-16'))/WEEK),deload=((w%4)+4)%4===3;
 const results=[1,2,3,4].map(l=>makeLine(d,l,phase,deload,focus));
 const day=(new Date(d+'T12:00:00Z').getUTCDay()+6)%7;
 const titles=['EN2: kapasitas per line','Teknik: kick, catch dan koordinasi per line','EN3: kecepatan dan pecahan jarak','Pemulihan: EN2 dan teknik','Transfer alat dan kecepatan','Kaki, EN3 dan daya tahan kecepatan'];
 return {date:d,title:focus?{skill:'Teknik per line',aerobic:'EN2 per line',speed:'EN3 per line'}[focus]:titles[day],phase:phase.label+' · '+(deload?'Minggu pemulihan':'Pola '+(((w%3)+3)%3+1)),dryland:'30 menit: mobilitas 8 menit; koordinasi 8 menit; core 8 menit; briefing 6 menit.',note:'Revisi mulai 17 November berdasarkan evaluasi Coach tanggal 16 November. Tujuan setiap line berbeda; Selasa teknik; Line 2 fondasi tanpa target zona/interval keberangkatan. EN2/EN3 dan HR 17/19 per 6 detik adalah konvensi BRTM. Kolam 22 m ditulis 25 m nominal. Rest dan pergantian alat dihitung di dalam 90 menit. Line 1 belum terkalibrasi; durasi program baru belum teruji. Volume dan intensitas turun pada pemulihan, puasa serta taper berdasarkan tanggal lomba terkonfirmasi. Laporan realisasi terdahulu tetap menjadi sumber evaluasi.',lines:results.map(r=>r.text),targetTotals:results.map(r=>r.total),estimatedMinutes:results.map(r=>r.minutes),waterMinutesLimit:90,lineProfiles:PROFILES,planningVersion:VERSION,source:'Program BRTM · revisi tujuan line, rest dan HR'};
}
module.exports={VERSION,PROFILES,SENDOFF,generate};

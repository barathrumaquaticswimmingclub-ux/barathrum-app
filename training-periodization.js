'use strict';
// BRTM coaching templates. Distances are nominal (one 22m length is written as 25m).
// These are planning assumptions, never measured pace or a predicted performance.
const VERSION='BRTM-PERIODISASI-20261116';
const DAY=86400000, stamp=d=>Date.parse(d+'T12:00:00Z');
const week=d=>Math.floor((stamp(d)-stamp('2026-11-16'))/(7*DAY));
const dayIndex=d=>(new Date(d+'T12:00:00Z').getUTCDay()+6)%7;
const mod=(n,b)=>((n%b)+b)%b;
function phaseFor(d,peaks=[]){
 const candidates=peaks.filter(p=>p.confirmed&&p.start&&p.end).sort((a,b)=>a.start.localeCompare(b.start));
 const live=candidates.find(p=>d>=p.start&&d<=p.end);
 if(live)return {key:'meet',label:'LOMBA / AKTIVASI',scale:.5,peak:live.name,confirmed:true};
 const next=candidates.find(p=>p.start>d),days=next?Math.round((stamp(next.start)-stamp(d))/DAY):null;
 if(next&&days<=14)return {key:'taper',label:'TAPER · '+next.name,scale:days<=7?.55:.7,peak:next.name,confirmed:true};
 const previous=candidates.filter(p=>p.end<d).at(-1);
 if(previous&&(stamp(d)-stamp(previous.end))/DAY<=7)return {key:'recovery',label:'PEMULIHAN PASCA LOMBA',scale:.6,peak:previous.name,confirmed:true};
 if(next&&days<=42)return {key:'specific',label:'SPESIFIK · '+next.name,scale:.9,peak:next.name,confirmed:true};
 const month=d.slice(0,7);
 if(month==='2027-02')return {key:'maintenance',label:'MAINTENANCE · PENYESUAIAN PUASA',scale:.7};
 if(month==='2027-03')return {key:'rebuild',label:'REBUILD / PRA-POPDA',scale:.8};
 if(['2027-04','2027-09','2027-11'].includes(month))return {key:'specific',label:'PRA-PEAK · TANGGAL BELUM RESMI',scale:.85};
 if(['2027-07','2027-08','2027-10'].includes(month))return {key:'specific',label:'PERSIAPAN SPESIFIK',scale:.95};
 if(['2027-01','2027-05','2027-06'].includes(month))return {key:'base',label:'PERSIAPAN UMUM / PENGEMBANGAN',scale:1};
 return {key:'maintenance',label:'TRANSISI / MAINTENANCE',scale:.75};
}
const row=(n,m,text,rest=20,effort=1)=>({n,m,text,rest,effort});
// Conservative seconds/100 nominal, deliberately independent of the 50m-pool EN2 reference.
const PACE={1:145,2:210,3:110,4:135};
function seconds(r,line){return r.n*(r.m/100*PACE[line]*r.effort+r.rest);}
function fit(rows,line,budget){
 rows=rows.map(r=>({...r}));
 while(rows.reduce((a,r)=>a+seconds(r,line),0)>budget*60){
  const r=rows.filter(r=>r.n>2).sort((a,b)=>seconds(b,line)-seconds(a,line))[0];
  if(!r)throw Error('Template exceeds block budget');r.n--;
 }
 return rows;
}
const count=(line,w)=>({1:6,2:4,3:10,4:8}[line])+mod(w,3)*2;
function skill(d,line,kind){
 const w=week(d),choice=mod(w+dayIndex(d),4);
 const drills=['FR side balance + F','BK single-arm + F','BR 2 kick / 1 pull','FLY body wave + F'];
 const focus=drills[choice],n=line===2?4:6;
 return [row(n,25,focus,line===2?35:20,1.35),row(n,50,kind==='turn'?'25 approach turn + 25 swim smooth':line===2?'25 scull + 25 FR smooth':'25 scull + 25 FR smooth + S',line===2?35:20,1.2)];
}
function main(d,line,phase,deload){
 const w=week(d),day=dayIndex(d),n=Math.max(4,Math.round(count(line,w)*phase.scale*(deload?.75:1)/2)*2);
 if(line===2){
  const focus=['FR napas samping + F','BK posisi kepala + F','FR kick + B + F','BR timing kaki-tangan','FR pull ringan + PB','FLY koordinasi pendek + F'][day];
  return [row(4+mod(w,3)*2,25,focus,40,1.4),row(4,50,'25 drill pilihan + 25 swim rapi',40,1.35),row(4,25,day===5?'streamline dorong dinding lalu easy':'turn / finish satu koreksi per repetisi',40,1.3),row(4,50,'FR smooth, ulang hanya jika gerakan tetap rapi',40,1.25)];
 }
 if(['taper','meet'].includes(phase.key))return [row(4,50,'FR easy, rasa air + S',25,1.1),row(4,25,'gaya lomba: akselerasi 6–8 kayuhan lalu easy, tanpa alat',75,.9),row(4,50,'turn + finish gaya lomba, bukan time trial',40,1.05)];
 if(phase.key==='recovery'||deload||day===3)return [row(n,50,'25 drill + 25 FR smooth + F',25,1.2),row(4,100,'FR / BK easy, jaga panjang kayuhan',25,1.1),row(4,50,'FR turn quality, tanpa mengejar waktu',30,1.1)];
 if(day===0){
  const pattern=mod(w,3);
  return pattern===0?[row(n,100,'FR kontrol ritme, pace nyaman stabil',25),row(4,50,'FR negative split terkendali',25),row(4,50,'BK easy / FR smooth',20,1.1)]:pattern===1?[row(Math.max(3,n/2),200,'FR stabil, bandingkan paruh pertama-kedua',30),row(4,50,'FR teknik turn',25,1.1)]:[row(n,100,'FR: ganjil smooth, genap sedikit lebih cepat',25),row(4,100,'FR pull + PB + S, fokus catch',25,1.1)];
 }
 if(day===1)return [row(n,50,'FR kick + B + F, pinggul stabil',30,1.35),row(4,50,'BK kick + F, posisi tubuh',30,1.3),row(4,100,'FR pull + PB + S, efisiensi catch',25,1.1)];
 if(day===2)return phase.key==='specific'?[row(n,25,'gaya lomba, sasaran tempo Coach; tanpa alat',60,.9),row(4,50,'25 akselerasi + 25 easy FR, tanpa alat',60),row(4,100,'FR smooth, evaluasi teknik',25,1.1)]:[row(n,25,'FR: akselerasi 6–8 kayuhan lalu easy, tanpa alat',50),row(4,50,'BK / BR koordinasi cepat rapi',40,1.1),row(4,100,'FR smooth',25,1.1)];
 if(day===4)return phase.key==='specific'?[row(n,50,'gaya lomba: 25 cepat rapi + 25 smooth; tanpa alat',60,.95),row(4,100,'FR easy / BK easy',25,1.1)]:[row(n,50,'FR build 1–4, ulang pola; bukan maksimal',30),row(4,100,'FR pull + PB + P kecil + S, hanya bila catch stabil; tanpa P bila belum siap',30,1.1),row(4,50,'FR tanpa alat, terapkan rasa catch',25)];
 return [row(n,50,'FR: 25 turn quality + 25 finish',35,1.1),row(4,100,mod(w,2)?'FR kontrol pace, catat konsistensi':'25 BK + 25 BR + 50 FR, transisi rapi',30,1.15),row(4,25,'gaya pilihan, evaluasi satu koreksi teknik',40,1.2)];
}
function buildLine(d,line,phase,deload){
 const blocks=[
  {name:'WU',budget:15,rows:[row(line===2?2:line===3?4:3,50,'FR easy',15,1.15),row(line===2?2:4,50,'Rotate Comby + F',20,1.2),row(2,50,'FR smooth + F',15,1.1)]},
  {name:'PRE MS',budget:20,rows:skill(d,line,dayIndex(d)===5?'turn':'skill')},
  {name:'SET',budget:45,rows:main(d,line,phase,deload)},
  {name:'CD',budget:10,rows:[row(line===2?2:4,50,'swim off FR / BK easy',15,1.2)]}
 ];
 let total=0,time=0;const text=blocks.map(b=>{b.rows=fit(b.rows,line,b.budget);const t=b.rows.reduce((a,r)=>a+seconds(r,line),0);time+=t;return `${b.name} · batas ${b.budget} menit\n`+b.rows.map(r=>{total+=r.n*r.m;return `${r.n} x ${r.m} ${r.text}, ${line===2?'rest bebas sesuai kebutuhan':'rest '+r.rest+' detik'}`;}).join('\n');}).join('\n\n');
 const note=line===2?'Waktu fleksibel untuk demonstrasi dan koreksi; repetisi batas atas, bukan kewajiban.':'Jika blok waktu habis, kurangi repetisi; simpan waktu CD. Pace belum dikalibrasi di kolam BRTM.';
 return {text:text+'\n\nTARGET '+total+' m nominal | '+Math.round(total*22/25)+' m aktual\n'+note,total,minutes:Math.ceil(time/60)};
}
function generate(d,peaks=[]){
 if(d<'2026-11-16'||d>'2027-12-31'||dayIndex(d)===6)return null;
 const phase=phaseFor(d,peaks),w=week(d),deload=mod(w,4)===3;
 const result=[1,2,3,4].map(l=>buildLine(d,l,phase,deload));
 const names=['Kontrol ritme & efisiensi','Kick, catch & koordinasi','Kecepatan dengan teknik rapi','Pemulihan aktif & koreksi','Pace spesifik & transfer alat','Turn, finish & evaluasi'];
 const micro=deload?'Minggu pemulihan':'Minggu pola '+(mod(w,3)+1);
 return {date:d,title:names[dayIndex(d)],phase:phase.label+' · '+micro,dryland:['Mobilitas bahu/pinggul, koordinasi dan core ringan','Keseimbangan dan kontrol tubuh; kualitas gerak','Koordinasi cepat singkat dengan pemulihan penuh','Mobilitas dan peregangan dinamis ringan','Stabilitas dan aktivasi, hindari kelelahan sebelum air','Mobilitas, koordinasi dan evaluasi gerak'][dayIndex(d)],
  note:`Tujuan: ${names[dayIndex(d)]}. ${micro}. ${phase.confirmed?'Mengikuti tanggal peak resmi tersimpan: '+phase.peak+'.':'Peak April, September dan November masih jendela perkiraan; taper menunggu tanggal resmi.'} Perkiraan durasi renang+rest Line 1/3/4: ${result[0].minutes}/${result[2].minutes}/${result[3].minutes} menit, berdasarkan asumsi pace konservatif; belum hasil tes. Sisa waktu untuk instruksi/koreksi, total air maksimum 90 menit. +F fins; +PB pull buoy; +B board; +P paddle; +S snorkel. Line 2 hanya +PB/+F/+B. Acuan EN2 kolam 50m tidak dipakai sebagai interval otomatis. Nomor lomba dan target waktu individual belum tersedia; set pace masih perlu dikalibrasi.`,
  lines:result.map(r=>r.text),targetTotals:result.map(r=>r.total),estimatedMinutes:result.map(r=>r.minutes),source:'Program periodisasi BRTM · whiteboard rinci',planningVersion:VERSION};
}
module.exports={VERSION,phaseFor,generate};

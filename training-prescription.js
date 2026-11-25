'use strict';
// Evidence informs structure; all distances, dose and timing below are BRTM planning
// assumptions, not a copied national-team program or an individual physiological test.
const VERSION='BRTM-20261117-PURPOSE-PHASE-V3';
const PROFILES={1:'Pengembangan: alignment, napas dan mempertahankan kayuhan saat mengulang',2:'Fondasi: keseimbangan, napas samping dan koordinasi utuh; tanpa endurance wajib',3:'Kapasitas: konsistensi EN2, EN3 terukur dan mempertahankan teknik pada repetisi',4:'Kompetitif berkembang: transfer catch/kaki ke renang utuh, turn dan finish 50–100'};
const BASE={1:[3800,3600,3800,3800,4000,4000],2:[2000,2000,2100,2000,2100,2100],3:[5200,5000,5400,5200,5400,5600],4:[4600,4400,4800,4600,4800,5000]};
// Independent Coach-confirmed departure intervals, NOT swim-time targets or zone tests.
const SENDOFF={1:{EN2:130,EN3:120},3:{EN2:90,EN3:80},4:{EN2:100,EN3:100}};
const SENDOFF50={1:{EN2:80,EN3:70},3:{EN2:60,EN3:50},4:{EN2:70,EN3:60}};
const WEEK=604800000,mod=(a,b)=>(a%b+b)%b,round=n=>Math.round(n/50)*50;
const clock=n=>Math.floor(n/60)+':'+String(n%60).padStart(2,'0');
// Aggregate WU reports support only approximate planning, not individual swim speeds.
const ASSUMED_SECONDS_100={1:115,2:160,3:75,4:87};
const EQUIPMENT=t=>(t.match(/\+\s*(?:PB|F|B|S|P)\b/g)||[]).sort().join('');
const TRAINING_DAYS=['Senin sedang: EN2 dan konsistensi','Selasa rendah: teknik dan penerapan','Rabu sedang: kecepatan singkat dan kapasitas','Kamis sedang: kaki, catch dan transfer','Jumat sedang: keterampilan 50–100 dan EN2','Sabtu hard: satu sasaran utama bergilir'];
const THEMES=[
 {name:'Alignment dan napas',pre:{1:'25 FR satu tangan + 25 FR + F',2:'FR side balance + F: 6 tendangan tiap sisi',3:'25 FR scull depan + 25 FR + S',4:'25 FR satu tangan + 25 FR + F + S'},cue:{1:'kepala kembali ke garis tubuh setelah mengambil napas',2:'hembus di air lalu ambil napas samping',3:'pertahankan tangkapan dan jumlah kayuhan per panjang',4:'pertahankan posisi pinggul saat bernapas'}},
 {name:'Catch dan dorongan',pre:{1:'25 FR kepalan tangan + 25 FR + S',2:'FR satu tangan + F: kanan dan kiri bergantian tiap repetisi',3:'25 FR scull tengah + 25 FR + S',4:'25 FR kepalan tangan + 25 FR + S'},cue:{1:'tangan masuk segaris bahu',2:'tangan masuk di depan bahu dan dorong sampai paha',3:'jumlah kayuhan tetap saat interval diulang',4:'terapkan rasa catch saat alat dilepas'}},
 {name:'Rotasi dan koordinasi',pre:{1:'25 FR 6 kick switch + 25 FR + F',2:'FR kick miring + F + B: napas samping',3:'25 FR satu tangan + 25 FR + F',4:'25 FR 6 kick switch + 25 FR + F'},cue:{1:'rotasi bahu dan pinggul bersamaan',2:'napas mengikuti rotasi tubuh',3:'rotasi tetap utuh pada paruh akhir repetisi',4:'pindahkan koordinasi berbantuan fins ke renang tanpa alat'}},
 {name:'Dinding dan finish',pre:{1:'FR pendekatan dinding: 5 m terakhir tanpa meluncur pasif',2:'dorong dinding streamline lalu FR + F',3:'FR pendekatan turn: tetapkan kayuhan terakhir',4:'FR pendekatan finish: sentuh tanpa mengurangi kayuhan'},cue:{1:'keluar turn dalam garis tubuh lurus',2:'dorong dinding lurus lalu mulai kayuhan',3:'pertahankan kualitas turn saat repetisi bertambah',4:'turn dan finish tetap terhubung dengan renang utuh'}}
];
function volume(rows){return rows.reduce((s,r)=>s+r.n*r.m,0);}
function rowSeconds(r,line){
 if(r.sendoff)return r.n*r.sendoff;
 let factor=r.kind==='drill'?1.25:r.kind==='kick'?(/\+ F\b/.test(r.text)?1.1:1.55):r.kind==='speed'?.75:r.kind==='cool'?1.12:1;
 return r.n*r.m/100*ASSUMED_SECONDS_100[line]*factor+Math.max(0,r.n-1)*r.rest;
}
function transition(a,b){return EQUIPMENT(a.text)===EQUIPMENT(b.text)?30:45;}
function blockSeconds(rows,line){return rows.reduce((s,r,i)=>s+rowSeconds(r,line)+(i?transition(rows[i-1],r):0),0);}
function estimate(blocks,line){return blocks.reduce((s,b)=>s+blockSeconds(b.rows,line),0)+150+(line===2?480:180);}
function split(rows,metres,unit,text,rest=20,kind='swim',priority=3,sendoff=null){
 const count=Math.floor(metres/unit),tail=metres%unit;
 if(count)rows.push({n:count,m:unit,text,rest,kind,priority,sendoff});
 if(tail){
  // Decompose a short tail into complete 25/50m swims; never copy a 100m drill into 50m.
  if(/^(25|50) .+ \+ (25|50|75) (?:FR|BK)/.test(text))throw Error('Compound repetition needs explicit distance');
  rows.push({n:1,m:tail,text,rest,kind,priority,sendoff:tail===50&&sendoff?null:sendoff});
 }
}
function makeLine(d,line,phase,deload,focus){
 const day=(new Date(d+'T12:00:00Z').getUTCDay()+6)%7;
 const week=Math.floor((Date.parse(d)-Date.parse('2026-11-16'))/WEEK),theme=THEMES[mod(Math.floor(week/4)+week,4)];
 const reduced=['recovery','taper','meet'].includes(phase.key)||deload||d.startsWith('2027-02')||d.startsWith('2027-03')||d.slice(5,7)==='12';
 let factor=['taper','meet','recovery'].includes(phase.key)?phase.scale:d.slice(5,7)==='12'?.75:d.startsWith('2027-02')?.75:d.startsWith('2027-03')?.9:phase.key==='specific'?.95:1;
 if(deload)factor=Math.min(factor,.8);
 const requested=round(BASE[line][day]*factor),s=n=>Math.max(50,round(n*factor));
 const wu=[],pre=[],main=[],cd=[];
 const add=(rows,n,m,text,rest=20,kind='swim',priority=3,sendoff=null)=>rows.push({n,m,text,rest,kind,priority,sendoff});
 // WU raises readiness; no endurance or race-pace demand.
 add(wu,1,s(line===2?100:line===1?300:400),'FR + F',20,'warm');
 add(wu,1,s(line===2?200:400),'Rotate Comby + F',20,'warm');
 add(wu,1,s(line===2?100:line===3?400:200),'FR tanpa alat',20,'warm');
 // Pre-set isolates ONE skill, then primes a brief application. It does not repeat MS.
 const reps=line===2?4:4;
 add(pre,reps,line===2?25:50,theme.pre[line],line===2?20:20,'drill',0);
 add(pre,4,line===2?50:50,line===2?'25 FR kick + 25 FR swim + F':'FR build 1–4 + F: tambah kecepatan bertahap, bukan max',line===2?20:20,'prime',0);
 add(cd,1,s(line===2?100:line===3?400:300),'swim off FR tanpa alat',0,'cool',0);
 let remain=requested-volume(wu)-volume(pre)-volume(cd);
 const technique=line===2||focus==='skill'||(!focus&&day===1);
 let objective,success;
 const en2=(amount,unit=100,text='FR EN2')=>split(main,amount,unit,text,20,'capacity',4,unit===100?SENDOFF[line].EN2:unit===50?SENDOFF50[line].EN2:null);
 const support=(amount)=>split(main,amount,100,line===1?'FR + S: posisi kepala tetap':line===3?'FR pull + PB + S: kayuhan utuh':'FR pull + PB: pindahkan catch ke dorongan utuh',20,'support',5);
 const turns=(amount)=>split(main,amount,50,line===4?'FR turn dan finish: 5 m terakhir terus mengayuh':'FR open turn: mendekat, sentuh, dorong dan kembali mengayuh',20,'skill',3);
 const speed=(n)=>add(main,n,25,line===4?'FR akselerasi dari dorong dinding, finish aktif':'FR kecepatan singkat dari dorong dinding',60,'speed',1);
 if(line===2){
  objective='Penerapan utuh: napas, keseimbangan dan dorongan dinding';
  const a=round(remain*.5),b=round(remain*.25);
  split(main,a,50,'FR + F: terapkan napas samping dalam renang utuh',20,'skill',3);
  split(main,b,50,'FR pull + PB: tangan masuk segaris bahu',20,'skill',3);
  split(main,remain-a-b,50,'FR tanpa alat: dorong lurus lalu pertahankan napas samping',15,'skill',3);
  success='Napas samping dan garis tubuh tetap pada renang utuh; catat satu koreksi yang masih diperlukan.';
 }else if(technique){
  objective=line===1?'Menerapkan alignment ke pengulangan FR':line===3?'Menjaga kualitas kayuhan dan turn pada renang utuh':'Transfer alat ke FR utuh, turn dan finish';
  const a=Math.floor(remain*.4/100)*100,b=Math.floor(remain*.35/100)*100;
  split(main,a,100,line===1?'FR + S: kepala tetap dan tangan masuk segaris bahu':line===3?'FR pull + PB + S: kayuhan utuh, catat jumlah kayuhan':'FR + S: catch utuh sampai paha',20,'skill',4);
  split(main,b,100,line===1?'FR tanpa alat: napas samping dan garis tubuh':line===3?'FR tanpa alat: jumlah kayuhan paruh kedua dibanding paruh pertama':'FR tanpa alat: terapkan catch setelah snorkel dilepas',20,'skill',4);
  turns(remain-a-b);
  success=line===1?'Garis tubuh tidak berubah ketika mengambil napas.':line===3?'Bandingkan jumlah kayuhan dan kualitas turn awal–akhir; bukan mengejar HR.':'Bandingkan kualitas catch dengan/tanpa alat serta turn dan finish.';
 }else if(['taper','meet'].includes(phase.key)){
  objective='Aktivasi lomba: kecepatan singkat dengan pemulihan panjang';
  const n=phase.key==='meet'?2:4;speed(n);remain-=n*25;
  const a=Math.floor(remain*.65/100)*100;
  split(main,a,100,'FR aerobik rendah: kayuhan utuh',20,'support',5);turns(remain-a);
  success='Akselerasi tetap tajam, selesai tanpa kelelahan tersisa; target waktu lomba belum diisi.';
 }else if(reduced||focus==='aerobic'||day===0){
  objective=reduced?'Pemeliharaan kapasitas dan teknik sesuai fase':'EN2: konsistensi repetisi dengan teknik utuh';
  const a=Math.floor(remain*.65/100)*100,b=Math.floor(remain*.2/100)*100;
  en2(a);support(b);turns(remain-a-b);
  success='Catat apakah interval diikuti, teknik akhir set dan HR akhir blok EN2 (acuan Coach 17/6 detik).';
 }else if(day===3&&!focus){
  objective='Beban sedang: kaki dan transfer catch, tanpa blok max panjang';
  const a=Math.floor(remain*.25/50)*50,b=Math.floor(remain*.25/100)*100;
  split(main,a,50,'FR kick + F + B: pinggul tetap sejajar permukaan',20,'kick',3);
  split(main,b,100,line===3?'FR pull + PB + P + S: paddle kecil bila catch stabil; lepas P bila belum siap':'FR pull + PB + S: dorongan utuh sampai paha',20,'support',5);
  en2(remain-a-b);
  success='Kaki tetap berasal dari pinggul; setelah alat dilepas catch tetap utuh. HR hanya dicek pada blok EN2.';
 }else if(day===5&&!focus){
  const hard=mod(Math.floor(week/4),3);
  if(hard===0){
   objective='Hard utama: kaki; kapasitas pendukung tetap EN2';
   const a=Math.floor(remain*.3/50)*50;
   split(main,a,50,'fast kick FR + F + B: jaga amplitudo tendangan',30,'kick',2);en2(remain-a);
  }else if(hard===1){
   objective='Hard utama: EN3; volume cepat dibatasi, bukan seluruh sesi max';
   const fast=Math.min(line===3?800:600,Math.floor(remain*.25/100)*100);
   split(main,fast,100,'FR EN3',25,'quality',2,SENDOFF[line].EN3);en2(remain-fast);
  }else{
   objective='Hard utama: endurance berulang panjang, kecepatan tetap EN2';
   const a=Math.floor(remain*.7/200)*200;
   split(main,a,200,'FR EN2: bandingkan paruh pertama dan kedua',20,'capacity',4);en2(remain-a);
  }
  success='Satu sasaran hard utama; cek teknik dan pemulihan. Acuan HR Coach: EN2 17 dan EN3 19 per 6 detik, bukan bukti zona fisiologis.';
 }else{
  const specific=phase.key==='specific'||day===4;
  objective=specific?'Keterampilan 50–100: akselerasi, turn, finish dan kapasitas pendukung':'Kecepatan singkat berkualitas dan EN2 pendukung';
  const n=line===1?4:line===4?6:8;speed(n);remain-=n*25;
  const q=specific?Math.min(line===3?600:400,Math.floor(remain*.2/50)*50):0;
  if(q)split(main,q,50,'FR 25 akselerasi + 25 lanjut dengan kayuhan utuh',30,'quality',2);
  const a=Math.floor((remain-q)*.75/100)*100;
  en2(a);turns(remain-q-a);
  success='Catat kualitas akselerasi/finish; EN2 mendukung sesi, bukan menggantikan target kecepatan. Race pace menunggu baseline per atlet.';
 }
 const blocks=[{name:'WU',purpose:'Menyiapkan tubuh dan rasa air',rows:wu},{name:'PRE MS',purpose:'Persiapan: '+theme.name+'; '+theme.cue[line],rows:pre},{name:'SET',purpose:objective,rows:main},{name:'CD',purpose:'Menurunkan beban secara bertahap',rows:cd}];
 // Keep warm-up, pre-set, short-speed exposure and cool-down. Remove supplementary
 // repeats first when assumed time exceeds the session budget. Actual timing still rules.
 while(estimate(blocks,line)>89*60||estimate(blocks,line)-blockSeconds(cd,line)-30>80*60){
  const options=main.filter(r=>r.n>2).sort((a,b)=>b.priority-a.priority||rowSeconds(b,line)-rowSeconds(a,line));
  if(!options.length)throw Error('Cannot fit session without removing its purpose');options[0].n--;
 }
 const total=blocks.reduce((s,b)=>s+volume(b.rows),0),minutes=Math.ceil(estimate(blocks,line)/60);
 const prepSignatures=new Set(pre.map(r=>r.text));if(main.some(r=>prepSignatures.has(r.text)))throw Error('Pre-set duplicated in main set');
 let text='TUJUAN LINE '+line+': '+PROFILES[line]+'\n';
 text+='HARI: '+(line===2?'Fondasi teknik dan penerapan setiap sesi':TRAINING_DAYS[day])+'. Fokus keterampilan: '+theme.name+'.\n';
 text+='REST dihitung setelah menyentuh dinding; @ adalah start-ke-start termasuk istirahat. Jangan menambahkan rest pada @.\n';
 text+='JEDA antar set tanpa ganti alat 30 detik; ganti alat 45 detik. Jeda menggantikan rest terakhir. WU → PRE MS dan PRE MS → SET 60 detik; SET → CD 30 detik, termasuk minum/alat.\n';
 text+='FUNGSI: WU menyiapkan; PRE MS mengisolasi dan mengaktifkan; SET menerapkan sasaran utama; CD menurunkan beban.\n';
 if(line===2)text+='Demonstrasi 60 detik sebelum setiap tugas utama; koreksi 30 detik tiap 4 repetisi menggantikan rest. Alat hanya +PB, +F, +B.\n';
 else text+='EN2/EN3 adalah jenis latihan. HR Coach 17/19 denyut per 6 detik adalah acuan pengamatan akhir blok terkait, bukan angka wajib semua anak atau padanan pasti zona foto. Kecepatan singkat tidak dinilai dari HR.\n';
 text+='EVALUASI: '+success+'\n';
 text+='Perkiraan '+minutes+' menit termasuk jeda/instruksi berdasarkan asumsi, belum hasil uji program ini. Mulai CD paling lambat menit ke-80; selesai maksimal menit ke-90. Jangan mengejar kekurangan jarak dengan menghapus istirahat.\n';
 if(line===1)text+='Kapasitas Line 1 belum terkalibrasi: laporan 16 November belum memastikan atlet acuan hadir.\n';
 let cumulative=0;for(let i=0;i<blocks.length;i++){const b=blocks[i];cumulative+=blockSeconds(b.rows,line)+(line===2?[120,120,240,0]:[60,60,60,0])[i]+(i?[60,60,30][i-1]:0);text+='\n'+b.name+' · perkiraan selesai menit ke-'+Math.ceil(cumulative/60)+' · '+b.purpose+'\n'+b.rows.map(r=>`${r.n} x ${r.m} ${r.text} ${r.sendoff?'@'+clock(r.sendoff):'rest '+r.rest+' detik'}${/\bEN2\b/.test(r.text)?' (HR acuan Coach=17/6 detik)':/\bEN3\b/.test(r.text)?' (HR acuan Coach=19/6 detik)':''}`).join('\n')+'\n';}
 text+='\nTARGET '+total+' m nominal | '+Math.round(total*.88)+' m aktual\n';
 return {text,total,minutes,requested,objective,blocks:blocks.map(b=>({name:b.name,purpose:b.purpose,distance:volume(b.rows)}))};
}
function generate(d,peaks,phaseFor,focus){
 if(d<'2026-11-17'||d>'2027-12-31'||new Date(d+'T12:00:00Z').getUTCDay()===0)return null;
 const phase=phaseFor(d,peaks),week=Math.floor((Date.parse(d)-Date.parse('2026-11-16'))/WEEK),deload=mod(week,4)===3;
 const results=[1,2,3,4].map(l=>makeLine(d,l,phase,deload,focus));
 const day=(new Date(d+'T12:00:00Z').getUTCDay()+6)%7;
 return {date:d,title:focus?{skill:'Teknik: isolasi menuju penerapan',aerobic:'EN2: konsistensi per line',speed:'Kecepatan singkat dan keterampilan lomba'}[focus]:TRAINING_DAYS[day],phase:phase.label+' · '+(deload?'Minggu pemulihan terencana':'Minggu pengembangan '+(mod(week,3)+1)),dryland:'30 menit: raise 5 menit; mobilitas dinamis 7 menit; aktivasi/stabilitas 8 menit; prime koordinasi 5 menit; briefing sasaran tiap line 5 menit. Selasa beban rendah; pada taper/pemulihan kurangi repetisi aktivasi dan hentikan sebelum lelah.',note:(phase.confirmed?'Mengikuti tanggal peak resmi tersimpan: '+phase.peak+'. ':'Peak April, September dan November masih jendela perkiraan; taper menunggu tanggal resmi. ')+'Audit 16 November: WU → Pre MS → Set → CD memiliki fungsi berbeda; pengulangan persis Pre MS ke Set dihapus. Sen/Rab/Kam/Jum sedang, Selasa teknik, Sabtu satu sasaran hard bergilir. Line 2 tetap fondasi. Desember dan jendela puasa sementara diturunkan; taper/aktivasi mengikuti tanggal lomba terkonfirmasi. Durasi adalah estimasi berdasarkan asumsi per line, bukan data individu. Jika pembinaan mental mengganti renang, catat realisasi; evaluasi sesi berikutnya tanpa menumpuk seluruh beban yang tertinggal. Race pace individual, target medali dan zona warna belum dapat dihitung tanpa baseline. Dasar: foto Coach; USA Swimming ADM; Swimming Canada AAD; Swimming Australia Swimmer Framework; struktur sesi USMS. Dosis adalah adaptasi BRTM, bukan salinan program elite.',lines:results.map(r=>r.text),targetTotals:results.map(r=>r.total),requestedTotals:results.map(r=>r.requested),estimatedMinutes:results.map(r=>r.minutes),blocksByLine:results.map(r=>r.blocks),objectives:results.map(r=>r.objective),timingBasis:'Asumsi waktu tempuh nominal, jeda dan instruksi; perlu kalibrasi laporan berikutnya',waterMinutesLimit:90,lineProfiles:PROFILES,planningVersion:VERSION,source:'Program BRTM · audit fungsi blok dan kemampuan line'};
}
module.exports={VERSION,PROFILES,SENDOFF,SENDOFF50,generate};

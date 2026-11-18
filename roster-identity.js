'use strict';
const B=require('./business');
const norm=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const phone=v=>String(v||'').replace(/\D/g,'').replace(/^0/,'62');
function closeName(a,b){a=norm(a);b=norm(b);if(!a||!b||Math.abs(a.length-b.length)>2)return false;let row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=next;}return row[b.length]<=Math.min(2,Math.floor(Math.min(a.length,b.length)*.15));}
function strongMatch(a,b){return !a.mergedInto&&!b.mergedInto&&a.tanggalLahir&&a.tanggalLahir===b.tanggalLahir&&phone(a.noHpOrtu)&&phone(a.noHpOrtu)===phone(b.noHpOrtu)&&norm(a.namaOrtu)&&norm(a.namaOrtu)===norm(b.namaOrtu)&&norm(a.namaPanggilan)&&norm(a.namaPanggilan)===norm(b.namaPanggilan)&&B.canonical(a.kelompok)===B.canonical(b.kelompok)&&norm(String(a.nama||'').trim().split(/\s+/)[0])===norm(String(b.nama||'').trim().split(/\s+/)[0])&&closeName(a.nama,b.nama);}
// Suspected duplicates are reviewed, never merged on fuzzy identity alone.
function candidates(athletes,input){
 const names=a=>[a.nama,...(a.nameAliases||[])].map(norm).filter(Boolean);
 const near=(a,b)=>names(a).some(x=>names(b).some(y=>closeName(x,y)));
 return athletes.filter(a=>!a.mergedInto&&String(a.id)!==String(input.id)&&(
  names(a).some(n=>names(input).includes(n))||
  (a.tanggalLahir&&a.tanggalLahir===input.tanggalLahir&&(
   near(a,input)||phone(a.noHpOrtu)&&phone(a.noHpOrtu)===phone(input.noHpOrtu)&&norm(a.namaPanggilan)&&norm(a.namaPanggilan)===norm(input.namaPanggilan)
  ))||phone(a.noHpOrtu)&&phone(a.noHpOrtu)===phone(input.noHpOrtu)&&near(a,input)
 ));
}
function registrationMatch(athletes,input){
 const possible=candidates(athletes,input);
 const exact=possible.filter(a=>[a.nama,...(a.nameAliases||[])].some(n=>norm(n)===norm(input.nama))&&a.tanggalLahir&&a.tanggalLahir===input.tanggalLahir&&phone(a.noHpOrtu)&&phone(a.noHpOrtu)===phone(input.noHpOrtu)&&B.canonical(a.kelompok)===input.kelompok&&a.status!=='Nonaktif');
 return {possible,target:possible.length===1&&exact.length===1?exact[0]:null};
}
async function consolidate(db,{rows,save},user={id:null,username:'sistem-sinkronisasi'}){
 const athletes=await rows(db,'atlet'),packs=await rows(db,'pembayaran'),schedules=await rows(db,'jadwal');
 const slots=(await db.query('SELECT * FROM brtm_weekly_slots')).rows;
 const booked=a=>slots.some(s=>(s.athlete_ids||[]).map(String).includes(a.id))||schedules.some(s=>s.atletIds?.map(String).includes(a.id));
 const canonical=a=>!a.mergedInto&&booked(a)&&packs.some(p=>String(p.atletId)===a.id&&p.status==='Lunas');
 let merged=0;
 for(const source of athletes.filter(a=>!a.mergedInto&&!booked(a)&&!packs.some(p=>String(p.atletId)===a.id))){
  const matches=athletes.filter(a=>a.id!==source.id&&canonical(a)&&strongMatch(source,a));if(matches.length!==1)continue;
  const target=matches[0];
  if((await db.query("SELECT id FROM data_klub WHERE jenis<>'atlet' AND (data->>'atletId'=$1 OR COALESCE(data->'atletIds','[]'::jsonb) @> $2::jsonb) LIMIT 1",[source.id,JSON.stringify([source.id])])).rows.length)continue;
  if((await db.query('SELECT id FROM brtm_feedback WHERE athlete_id=$1 LIMIT 1',[source.id])).rows.length)continue;
  if((await db.query("SELECT id FROM brtm_training_rosters WHERE (payload->'lines'->0) @> $1::jsonb OR (payload->'lines'->1) @> $1::jsonb OR (payload->'lines'->2) @> $1::jsonb OR (payload->'lines'->3) @> $1::jsonb LIMIT 1",[JSON.stringify([source.id])])).rows.length)continue;
  const profile={...target,nameAliases:[...new Set([...(target.nameAliases||[]),source.nama])]};
  for(const k of require('./profile').FIELDS)if(!profile[k]&&source[k])profile[k]=source[k];
  Object.assign(target,await save(db,user,'atlet',profile,target));
  await db.query('INSERT INTO brtm_photos(athlete_id,mime,base64) SELECT $1,mime,base64 FROM brtm_photos WHERE athlete_id=$2 ON CONFLICT(athlete_id) DO NOTHING',[target.id,source.id]);
  await db.query('UPDATE brtm_registrations SET athlete_id=$1,note=$2 WHERE athlete_id=$3',[target.id,'Identitas cocok dengan atlet lama; pembayaran dan jadwal dipertahankan.',source.id]);
  Object.assign(source,await save(db,user,'atlet',{...source,status:'Nonaktif',mergedInto:target.id,mergedAt:new Date().toISOString(),mergeReason:'Tanggal lahir, WA wali, nama wali, panggilan, kelas dan nama cocok; data baru tanpa transaksi/jadwal disambungkan ke data berbayar.'},source));merged++;
 }
 return merged;
}
module.exports={strongMatch,consolidate,candidates,registrationMatch};

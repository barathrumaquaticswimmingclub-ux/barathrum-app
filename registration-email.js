'use strict';
const P=require('./billing-policy');
const KEYS=new Set(['emailortu','emailorangtua','emailorangtuawali','email','emailaddress','alamatemail','respondentemail']);
function extract(input){
 const values=Object.entries(input||{}).filter(([k])=>KEYS.has(k.toLowerCase().replace(/[^a-z]/g,''))).map(([,v])=>typeof v==='string'?v.trim():'').filter(P.email);
 const distinct=new Map(values.map(v=>[v.toLowerCase(),v]));return distinct.size===1?[...distinct.values()][0]:'';
}
async function sync(db){
 const linked=(await db.query("SELECT athlete_id,payload FROM brtm_registrations WHERE status='Tersambung' AND athlete_id IS NOT NULL ORDER BY id")).rows;
 const byAthlete=new Map();for(const r of linked){const value=extract(r.payload);if(!value)continue;const id=String(r.athlete_id);if(!byAthlete.has(id))byAthlete.set(id,new Map());byAthlete.get(id).set(value.toLowerCase(),value);}
 let filled=0,conflicts=0;
 for(const [id,emails] of byAthlete){
  if(emails.size!==1){conflicts++;continue;}
  const r=(await db.query("SELECT data FROM data_klub WHERE jenis='atlet' AND id=$1 FOR UPDATE",[id])).rows[0];if(!r||String(r.data.emailOrtu||'').trim())continue;
  const next={...r.data,emailOrtu:[...emails.values()][0]};
  await db.query("UPDATE data_klub SET data=$2 WHERE jenis='atlet' AND id=$1",[id,JSON.stringify(next)]);
  await db.query("INSERT INTO brtm_audit(username,action,jenis,record_id,before_data,after_data) VALUES('sistem-email','sinkron-email-pendaftaran','atlet',$1,$2,$3)",[id,JSON.stringify(r.data),JSON.stringify(next)]);filled++;
 }
 return {filled,conflicts};
}
module.exports={extract,sync};

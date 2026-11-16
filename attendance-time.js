'use strict';
const B=require('./business');
function windowFor(schedule,role,now={date:B.today(),time:B.time()}){
 if(schedule.statusSesi==='Libur')return {allowed:false,message:'Sesi diliburkan; absensi tidak dapat diisi.'};
 if(role==='owner')return {allowed:true,message:''};
 if(schedule.tanggal<now.date)return {allowed:true,message:''};
 if(schedule.tanggal>now.date)return {allowed:false,message:'Absensi hanya dapat diisi setelah tanggal dan jam mulai sesi.'};
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.mulai||''))return {allowed:false,message:'Jam mulai sesi belum diatur. Hubungi Owner sebelum mengisi absensi.'};
 if(now.time.slice(0,5)<schedule.mulai)return {allowed:false,message:'Absensi baru dibuka pukul '+schedule.mulai.replace(':','.')+' WIB, sesuai jadwal latihan.'};
 return {allowed:true,message:''};
}
function enforce(schedule,role){const result=windowFor(schedule,role);if(!result.allowed)throw Object.assign(Error(result.message),{status:403});}
module.exports={windowFor,enforce};

'use strict';
const B=require('./business');
// Deterministic wording preserves the observation; never invent a diagnosis or action taken.
function participantName(athlete,referenceDate=B.today()) {
  const name=String(athlete.namaPanggilan||athlete.nama||'Peserta').trim();
  const birth=athlete.tanggalLahir;
  if(!B.validDate(birth)||!B.validDate(referenceDate)||birth>referenceDate)return name;
  const age=Number(referenceDate.slice(0,4))-Number(birth.slice(0,4))-(referenceDate.slice(5)<birth.slice(5)?1:0);
  if(age<30)return 'Kakak '+name;
  const gender=String(athlete.jk||'').trim().toLowerCase();
  if(['laki-laki','laki laki','l'].includes(gender))return 'Ayah '+name;
  if(['perempuan','p'].includes(gender))return 'Bunda '+name;
  return name;
}
function parentEvaluation(item, athlete, schedule) {
  const name = participantName(athlete,B.validDate(item.tanggal)?item.tanggal:B.today());
  const hour = schedule?.mulai ? Number(schedule.mulai.split(':')[0]) : null;
  const time = hour === null ? '' : hour < 11 ? ' pagi' : hour < 15 ? ' siang' : hour < 19 ? ' sore' : ' malam';
  const prefix = `Pada latihan${time} tanggal ${item.tanggal}, ${name}`;
  const words = {
    kedinginan: 'masih merasa kedinginan selama mengikuti latihan.',
    takut: 'masih merasa takut saat mengikuti latihan dan memerlukan proses adaptasi secara bertahap.',
    'takut air': 'masih merasa takut terhadap air dan memerlukan proses adaptasi secara bertahap.',
    lelah: 'terlihat lelah selama mengikuti latihan.',
    capek: 'terlihat lelah selama mengikuti latihan.',
    menangis: 'sempat menangis saat mengikuti latihan.',
    'kurang fokus': 'masih perlu meningkatkan fokus saat mengikuti latihan.',
    'kepala kurang tunduk': 'masih perlu memperbaiki posisi kepala agar lebih menunduk saat berenang.',
    'susah fokus': 'masih perlu meningkatkan fokus saat mengikuti latihan.',
    'belum berani': 'masih memerlukan waktu untuk membangun keberanian saat latihan.'
  };
  const hasNote=['teknik','fisik','attitude','catatan'].some(k=>String(item[k]||'').trim());
  const out = { tanggal:item.tanggal, pelatih:item.pelatih, apresiasi:hasNote?`Usaha ${name} dalam belajar renang patut diapresiasi.`:'' };
  for (const k of ['teknik','fisik','attitude','catatan']) {
    const raw = String(item[k] || '').trim();
    out[k] = raw ? words[raw.toLowerCase().replace(/[.!]+$/, '')] ? `${prefix} ${words[raw.toLowerCase().replace(/[.!]+$/, '')]}` : `Catatan pelatih untuk ${name}: ${raw}` : '';
  }
  return out;
}
module.exports = { parentEvaluation, participantName };

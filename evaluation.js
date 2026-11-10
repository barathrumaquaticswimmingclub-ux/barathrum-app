'use strict';
// Deterministic wording preserves the observation; never invent a diagnosis or action taken.
function parentEvaluation(item, athlete, schedule) {
  const name = athlete.namaPanggilan || athlete.nama;
  const hour = schedule?.mulai ? Number(schedule.mulai.split(':')[0]) : null;
  const time = hour === null ? '' : hour < 11 ? ' pagi' : hour < 15 ? ' siang' : hour < 19 ? ' sore' : ' malam';
  const prefix = `Pada latihan${time} tanggal ${item.tanggal}, Adik ${name}`;
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
  const out = { tanggal:item.tanggal, pelatih:item.pelatih };
  for (const k of ['teknik','fisik','attitude','catatan']) {
    const raw = String(item[k] || '').trim();
    out[k] = raw ? words[raw.toLowerCase().replace(/[.!]+$/, '')] ? `${prefix} ${words[raw.toLowerCase().replace(/[.!]+$/, '')]}` : `Catatan pelatih untuk Adik ${name}: ${raw}` : '';
  }
  return out;
}
module.exports = { parentEvaluation };

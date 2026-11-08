// Simpan kode ini hanya di proyek Apps Script milik Owner. Berisi kunci integrasi privat.
const BRTM = __BRTM_CONFIG__;
const QUESTIONS = {
  nama: 'Nama lengkap anak', tanggalLahir: 'Tanggal lahir (YYYY-MM-DD)',
  jk: 'Jenis kelamin', tempatLahir: 'Tempat lahir', namaOrtu: 'Nama orang tua / wali',
  noHpOrtu: 'Nomor WhatsApp orang tua', sekolah: 'Nama sekolah', kelasSekolah: 'Kelas sekolah',
  alamat: 'Alamat', tujuan: 'Tujuan mengikuti latihan', kelompok: 'Pilihan kelas'
};
// Jalankan SATU KALI. Aman dijalankan kembali: memakai formulir yang sama.
function siapkanBRTM() {
  const props = PropertiesService.getScriptProperties();
  ['prestasi', 'nonprestasi'].forEach(function(kind) {
    let form;
    const saved = props.getProperty('form_' + kind);
    if (saved) form = FormApp.openById(saved);
    else {
      form = FormApp.create(kind === 'prestasi' ? 'BRTM — Pendataan Atlet Prestasi' : 'BRTM — Pendataan Kelas Renang');
      props.setProperty('form_' + kind, form.getId());
      form.setDescription('Untuk seluruh atlet aktif dan peserta baru BARATHRUM AQUATIC SWIMMING CLUB. Isi satu formulir untuk setiap anak. Data digunakan untuk administrasi latihan dan dashboard orang tua. Gunakan nama lengkap dan tanggal lahir yang sama dengan data klub. Pengisian formulir tidak mencatat pembayaran atau mengubah paket latihan.');
      form.setConfirmationMessage('Terima kasih. Data diteruskan ke BRTM. Jika identitas perlu dicocokkan, admin akan memeriksanya sebelum menghubungkan riwayat anak.');
      form.setCollectEmail(false).setLimitOneResponsePerUser(false).setPublishingSummary(false).setAllowResponseEdits(false);
      form.addTextItem().setTitle(QUESTIONS.nama).setRequired(true);
      form.addTextItem().setTitle(QUESTIONS.tanggalLahir).setHelpText('Contoh: 2018-05-21').setValidation(FormApp.createTextValidation().requireTextMatchesPattern('^[0-9]{4}-[0-9]{2}-[0-9]{2}$').build()).setRequired(true);
      form.addMultipleChoiceItem().setTitle(QUESTIONS.jk).setChoiceValues(['Laki-laki','Perempuan']).setRequired(true);
      form.addTextItem().setTitle(QUESTIONS.tempatLahir);
      form.addTextItem().setTitle(QUESTIONS.namaOrtu).setRequired(true);
      form.addTextItem().setTitle(QUESTIONS.noHpOrtu).setHelpText('Contoh: 081234567890').setValidation(FormApp.createTextValidation().requireTextMatchesPattern('^\\+?[0-9 ()-]{8,25}$').build()).setRequired(true);
      form.addTextItem().setTitle(QUESTIONS.sekolah);
      form.addTextItem().setTitle(QUESTIONS.kelasSekolah);
      form.addParagraphTextItem().setTitle(QUESTIONS.alamat);
      form.addParagraphTextItem().setTitle(QUESTIONS.tujuan);
      if (kind === 'nonprestasi') form.addListItem().setTitle(QUESTIONS.kelompok).setChoiceValues(['Private Class','Semi Private Class','Group Class','Private Couple Class','Hydro Terapi Class','Regular Class (1x Seminggu)','Regular Class (2x Seminggu)']).setRequired(true);
    }
    const exists = ScriptApp.getProjectTriggers().some(function(t) { return t.getHandlerFunction() === 'kirimBRTM' && t.getTriggerSourceId() === form.getId(); });
    if (!exists) ScriptApp.newTrigger('kirimBRTM').forForm(form).onFormSubmit().create();
    const url = form.getPublishedUrl();
    postBRTM(kind, { action: 'register', formId: form.getId(), formUrl: url });
    console.log((kind === 'prestasi' ? 'PRESTASI: ' : 'SELAIN PRESTASI: ') + url);
  });
  if (!ScriptApp.getProjectTriggers().some(function(t) { return t.getHandlerFunction() === 'ulangKirimBRTM'; })) ScriptApp.newTrigger('ulangKirimBRTM').timeBased().everyMinutes(10).create();
}
function postBRTM(kind, payload) {
  const r = UrlFetchApp.fetch(BRTM.base + '/integrations/google-forms/' + kind, { method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + BRTM.keys[kind] }, payload: JSON.stringify(payload), muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('BRTM gagal menerima data (HTTP ' + r.getResponseCode() + '). Jawaban tetap tersimpan di Google Form.');
}
function kirimSatuBRTM(kind, response) {
  const data = {};
  response.getItemResponses().forEach(function(item) {
    const title = item.getItem().getTitle();
    Object.keys(QUESTIONS).forEach(function(key) { if (QUESTIONS[key] === title) data[key] = String(item.getResponse() || ''); });
  });
  postBRTM(kind, { responseId: response.getId(), data: data });
}
function kirimBRTM(e) {
  if (!e || !e.response || !e.source) throw new Error('Fungsi ini berjalan otomatis saat formulir dikirim. Jalankan siapkanBRTM untuk pemasangan.');
  const props = PropertiesService.getScriptProperties();
  const kind = props.getProperty('form_prestasi') === e.source.getId() ? 'prestasi' : props.getProperty('form_nonprestasi') === e.source.getId() ? 'nonprestasi' : null;
  if (!kind) throw new Error('Formulir tidak dikenal');
  kirimSatuBRTM(kind, e.response);
}
// Pemulihan memakai waktu + ID terakhir. Server menolak duplikasi response ID.
function ulangKirimBRTM() {
  const lock = LockService.getScriptLock(); if (!lock.tryLock(1000)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    ['prestasi','nonprestasi'].forEach(function(kind) {
      const formId = props.getProperty('form_' + kind); if (!formId) return;
      const cursor = JSON.parse(props.getProperty('cursor_' + kind) || '{"time":0,"ids":[]}');
      const batch = FormApp.openById(formId).getResponses(new Date(Math.max(0, cursor.time - 1))).filter(function(r) { return r.getTimestamp().getTime() > cursor.time || cursor.ids.indexOf(r.getId()) === -1; }).sort(function(a,b) { return a.getTimestamp().getTime() - b.getTimestamp().getTime(); }).slice(0, 50);
      for (const response of batch) {
        kirimSatuBRTM(kind, response);
        const time = response.getTimestamp().getTime();
        cursor.ids = time === cursor.time ? cursor.ids.concat([response.getId()]) : [response.getId()];
        cursor.time = time;
        props.setProperty('cursor_' + kind, JSON.stringify(cursor));
      }
    });
  } finally { lock.releaseLock(); }
}

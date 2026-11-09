// Simpan kode ini hanya di proyek Apps Script milik Owner. Berisi kunci integrasi privat.
const BRTM = __BRTM_CONFIG__;
const RULES = __BRTM_RULES__;
const QUESTIONS = {
  nama:'Nama lengkap anak', namaPanggilan:'Nama panggilan', tanggalLahir:'Tanggal lahir (DD-MM-YYYY)',
  jk:'Jenis kelamin', namaOrtu:'Nama orang tua / wali (salah satu)', noHpOrtu:'Nomor WhatsApp yang bisa dihubungi',
  sekolah:'Nama sekolah', kelasSekolah:'Kelas sekolah', alamat:'Alamat rumah', tujuan:'Tujuan latihan',
  riwayatRenang:'Pernah latihan renang di mana saja', foto:'Foto anak (bebas)', kelompok:'Kelas yang dipilih', persetujuan:'Persetujuan orang tua / wali'
};
const ALIASES={tanggalLahir:'Tanggal lahir (YYYY-MM-DD)',namaOrtu:'Nama orang tua / wali',noHpOrtu:'Nomor WhatsApp orang tua',alamat:'Alamat',tujuan:'Tujuan mengikuti latihan',kelompok:'Pilihan kelas'};
function siapkanBRTM() {
  const props=PropertiesService.getScriptProperties();
  ['prestasi','nonprestasi'].forEach(function(kind){
    let form;const saved=props.getProperty('form_'+kind);
    if(saved)form=FormApp.openById(saved);else{form=FormApp.create(kind==='prestasi'?'BRTM — Pendataan Atlet Prestasi':'BRTM — Pendataan Kelas Renang');props.setProperty('form_'+kind,form.getId());}
    if(props.getProperty('schema_'+kind)!==RULES.version){
      // Preserve all pre-migration answers in a private file in the Owner's Drive.
      if(saved){const answers=form.getResponses().map(function(r){return {id:r.getId(),time:r.getTimestamp(),answers:r.getItemResponses().map(function(x){return {question:x.getItem().getTitle(),answer:x.getResponse()};})};});if(answers.length)DriveApp.createFile('BRTM-cadangan-form-'+kind+'-'+RULES.version+'.json',JSON.stringify(answers,null,2),'application/json');}
      form.setDescription('BARATHRUM AQUATIC SWIMMING CLUB • Salatiga\nUntuk atlet aktif dan peserta baru. Baca ketentuan berikut sebelum mengisi biodata. Semua pertanyaan wajib dijawab. Tanggal lahir ditulis tanggal-bulan-tahun, contoh 21-05-2018. Untuk mengunggah foto, orang tua perlu masuk ke akun Google.');
      form.setConfirmationMessage('Terima kasih. Data dan foto anak diteruskan ke BRTM. Admin akan memeriksa identitas jika perlu dicocokkan. BRTM SWIM: '+BRTM.base+'/swim/ • ID: nama lengkap anak • Sandi: brtm.');
      form.setCollectEmail(false).setLimitOneResponsePerUser(false).setPublishingSummary(false).setAllowResponseEdits(false);
      const existing=form.getItems();
      function find(title){return existing.find(function(i){return i.getTitle()===title;});}
      let logo=find('BARATHRUM AQUATIC SWIMMING CLUB');if(!logo)logo=form.addImageItem().setTitle('BARATHRUM AQUATIC SWIMMING CLUB').setImage(UrlFetchApp.fetch(BRTM.base+'/brand/barathrum-logo.png').getBlob().setContentType('image/jpeg')).setWidth(400);
      form.moveItem(logo,0);
      let terms=find('Ketentuan BRTM');if(!terms)terms=form.addSectionHeaderItem().setTitle('Ketentuan BRTM');else terms=terms.asSectionHeaderItem();
      terms.setHelpText('Baca BRTM Rules Parent Edition: '+BRTM.base+'/rules/parent/\n\n'+RULES.common+'\n\n'+RULES[kind]+'\n\nVersi '+RULES.version);form.moveItem(terms,1);
      let agree=find(QUESTIONS.persetujuan);if(!agree)agree=form.addCheckboxItem().setTitle(QUESTIONS.persetujuan);else agree=agree.asCheckboxItem();
      agree.setChoiceValues(['Saya telah membaca dan menyetujui ketentuan BRTM.']).setRequired(true);form.moveItem(agree,2);
      const keys=['nama','namaPanggilan','tanggalLahir','jk','namaOrtu','noHpOrtu','sekolah','kelasSekolah','alamat',kind==='prestasi'?'riwayatRenang':'tujuan','foto'];if(kind==='nonprestasi')keys.push('kelompok');
      keys.forEach(function(k,index){
        let item=find(QUESTIONS[k])||(ALIASES[k]&&find(ALIASES[k]));
        if(!item){item=k==='jk'?form.addMultipleChoiceItem():k==='kelompok'?form.addListItem():['alamat','tujuan','riwayatRenang'].indexOf(k)>=0?form.addParagraphTextItem():form.addTextItem();}
        if(String(item.getType())!=='FILE_UPLOAD'){
          item=k==='jk'?item.asMultipleChoiceItem():k==='kelompok'?item.asListItem():['alamat','tujuan','riwayatRenang'].indexOf(k)>=0?item.asParagraphTextItem():item.asTextItem();
          item.setTitle(QUESTIONS[k]).setRequired(true);
          if(k==='jk')item.setChoiceValues(['Laki-laki','Perempuan']);
          if(k==='kelompok')item.setChoiceValues(['Private Class','Semi Private Class','Group Class','Private Couple Class','Hydro Terapi Class','Regular Class (1x Seminggu)','Regular Class (2x Seminggu)']);
          if(k==='tanggalLahir')item.setHelpText('Contoh: 21-05-2018 (tanggal-bulan-tahun)').setValidation(FormApp.createTextValidation().requireTextMatchesPattern('^[0-9]{2}-[0-9]{2}-[0-9]{4}$').build());
          if(k==='noHpOrtu')item.setHelpText('Contoh: 081234567890').setValidation(FormApp.createTextValidation().requireTextMatchesPattern('^\\+?[0-9 ()-]{8,25}$').build());
          if(k==='foto')item.setHelpText('WAJIB unggah satu foto anak. Foto bebas; tidak harus pasfoto. Gunakan kolom Upload file, gambar JPG/PNG/WebP, maksimal 5 MB.');
          if(k==='riwayatRenang')item.setHelpText('Sebutkan tempat/klub sebelumnya. Jika belum pernah, tulis Belum pernah.');
          if(k==='sekolah'||k==='kelasSekolah')item.setHelpText('Jika belum bersekolah, tulis Belum sekolah.');
        }
        form.moveItem(item,index+3);
      });
      // Existing legacy questions and their answers are retained.
      props.setProperty('schema_'+kind,RULES.version);
    }
    const termsNow=form.getItems().find(function(i){return i.getTitle()==='Ketentuan BRTM';});
    if(termsNow)termsNow.asSectionHeaderItem().setHelpText('Baca BRTM Rules Parent Edition: '+BRTM.base+'/rules/parent/\n\n'+RULES.common+'\n\n'+RULES[kind]+'\n\nVersi '+RULES.version);
    if(!ScriptApp.getProjectTriggers().some(function(t){return t.getHandlerFunction()==='kirimBRTM'&&t.getTriggerSourceId()===form.getId();}))ScriptApp.newTrigger('kirimBRTM').forForm(form).onFormSubmit().create();
    postBRTM(kind,{action:'register',formId:form.getId(),formUrl:form.getPublishedUrl()});console.log(kind+': '+form.getPublishedUrl());
  });
  if(!ScriptApp.getProjectTriggers().some(function(t){return t.getHandlerFunction()==='ulangKirimBRTM';}))ScriptApp.newTrigger('ulangKirimBRTM').timeBased().everyMinutes(10).create();
}
function postBRTM(kind, payload) {
  const r = UrlFetchApp.fetch(BRTM.base + '/integrations/google-forms/' + kind, { method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + BRTM.keys[kind] }, payload: JSON.stringify(payload), muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('BRTM gagal menerima data (HTTP ' + r.getResponseCode() + '). Jawaban tetap tersimpan di Google Form.');
}
function kirimSatuBRTM(kind,response){
  const data={};
  response.getItemResponses().forEach(function(item){
    const title=item.getItem().getTitle();
    Object.keys(QUESTIONS).forEach(function(key){
      if(QUESTIONS[key]!==title&&ALIASES[key]!==title)return;
      if(key==='foto'){
        if(String(item.getItem().getType())!=='FILE_UPLOAD')throw new Error('Kolom Foto anak belum disetel menjadi Upload file.');
        const fileId=item.getResponse()[0];if(!fileId)throw new Error('Foto anak belum diunggah');
        const file=DriveApp.getFileById(fileId);let blob=file.getSize()<=5*1024*1024?file.getBlob():file.getThumbnail();
        if(!blob){if(file.getSize()>5*1024*1024)throw new Error('Pratinjau foto belum siap; akan dicoba kembali.');blob=file.getBlob();}
        data.foto={mime:blob.getContentType(),base64:Utilities.base64Encode(blob.getBytes())};
      }else data[key]=String(item.getResponse()||'');
    });
  });
  if(data.persetujuan)data.versiKetentuan=RULES.version;
  postBRTM(kind,{responseId:response.getId(),data:data});
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

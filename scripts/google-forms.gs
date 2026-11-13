// Simpan kode ini hanya di proyek Apps Script milik Owner. Berisi kunci integrasi privat.
const BRTM = __BRTM_CONFIG__;
const RULES = __BRTM_RULES__;
const QUESTIONS = {
  nama:'Nama lengkap anak', namaPanggilan:'Nama panggilan', tanggalLahir:'Tanggal lahir (DD-MM-YYYY)',
  jk:'Jenis kelamin', tempatLahir:'Tempat lahir', namaOrtu:'Nama orang tua / wali (salah satu)', noHpOrtu:'Nomor WhatsApp yang bisa dihubungi',
  sekolah:'Nama sekolah', kelasSekolah:'Kelas sekolah', alamat:'Alamat rumah', tujuan:'Tujuan mengikuti les',
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
      form.setTitle(kind==='prestasi'?'BRTM — Pendataan Atlet Prestasi':'BRTM — Pendataan kelas renang');
      form.setDescription('Untuk seluruh atlet aktif dan peserta baru BARATHRUM AQUATIC SWIMMING CLUB. Isi satu formulir untuk setiap anak. Data digunakan untuk administrasi latihan dan dashboard orang tua.');
      form.setConfirmationMessage('Terima kasih. Data anak diteruskan ke BRTM.\n\nLANJUT KE BRTM SWIM\n'+BRTM.base+'/swim/\nID: nama lengkap anak. Kata sandi: brtm.\n\nCARA MEMASANG DI HP ANDROID\nBuka tautan di Google Chrome. Tekan Pasang BRTM SWIM atau menu tiga titik > Instal aplikasi / Tambahkan ke layar utama. Jika data belum terlihat, hubungi admin BRTM.');
      form.setCollectEmail(false).setLimitOneResponsePerUser(false).setPublishingSummary(false).setAllowResponseEdits(false);
      const existing=form.getItems();
      function find(title){return existing.find(function(i){return i.getTitle()===title;});}
      let logo=find('BARATHRUM AQUATIC SWIMMING CLUB');if(!logo)logo=form.addImageItem().setTitle('BARATHRUM AQUATIC SWIMMING CLUB').setImage(UrlFetchApp.fetch(BRTM.base+'/brand/barathrum-logo.png').getBlob().setContentType('image/jpeg')).setWidth(400);
      form.moveItem(logo.getIndex(),0);
      let terms=find('Ketentuan BRTM')||find('KETENTUAN & PERSETUJUAN ORANG TUA/WALI');if(!terms)terms=form.addSectionHeaderItem().setTitle('Ketentuan BRTM');else terms=terms.asSectionHeaderItem();
      terms.setTitle('KETENTUAN & PERSETUJUAN ORANG TUA/WALI').setHelpText(RULES.common);form.moveItem(terms.getIndex(),1);
      let agree=find(QUESTIONS.persetujuan);if(!agree)agree=form.addCheckboxItem().setTitle(QUESTIONS.persetujuan);else agree=agree.asCheckboxItem();
      agree.setChoiceValues(['Saya telah membaca dan menyetujui ketentuan BRTM.']).setRequired(true);form.moveItem(agree.getIndex(),2);
      const keys=['nama','namaPanggilan','tanggalLahir','jk','tempatLahir','alamat','namaOrtu','noHpOrtu','sekolah','kelasSekolah',kind==='prestasi'?'riwayatRenang':'tujuan'];if(kind==='nonprestasi')keys.push('kelompok');keys.push('foto');
      keys.forEach(function(k,index){
        let item=find(QUESTIONS[k])||(ALIASES[k]&&find(ALIASES[k]));
        const isNew=!item;
        if(!item){item=k==='jk'?form.addMultipleChoiceItem():k==='kelompok'?form.addListItem():['alamat','tujuan','riwayatRenang'].indexOf(k)>=0?form.addParagraphTextItem():form.addTextItem();}
        if(String(item.getType())!=='FILE_UPLOAD'){
          if(!isNew)item=k==='jk'?item.asMultipleChoiceItem():k==='kelompok'?item.asListItem():['alamat','tujuan','riwayatRenang'].indexOf(k)>=0?item.asParagraphTextItem():item.asTextItem();
          item.setTitle(QUESTIONS[k]).setRequired(true);
          if(k==='jk')item.setChoiceValues(['Laki-laki','Perempuan']);
          if(k==='kelompok')item.setChoiceValues(['Private Class','Semi Private Class','Group Class','Private Couple Class','Hydro Terapi Class','Regular Class (1x Seminggu)','Regular Class (2x Seminggu)']);
          if(k==='tanggalLahir')item.setHelpText('Contoh: 21-05-2018 (tanggal-bulan-tahun)').setValidation(FormApp.createTextValidation().requireTextMatchesPattern('^[0-9]{2}-[0-9]{2}-[0-9]{4}$').build());
          if(k==='noHpOrtu')item.setHelpText('Contoh: 081234567890').setValidation(FormApp.createTextValidation().requireTextMatchesPattern('^\\+?[0-9 ()-]{8,25}$').build());
          if(k==='foto')item.setHelpText('WAJIB unggah satu foto anak. Foto bebas; tidak harus pasfoto. Gunakan kolom Upload file, gambar JPG/PNG/WebP, maksimal 5 MB.');
          if(k==='riwayatRenang')item.setHelpText('Sebutkan tempat/klub sebelumnya. Jika belum pernah, tulis Belum pernah.');
          if(k==='sekolah')item.setHelpText('Jika belum bersekolah, tulis Belum sekolah.');
          if(k==='kelasSekolah')item.setHelpText('Contoh: 3. Jika belum sekolah, tulis Belum sekolah.');
        }
        form.moveItem(item.getIndex(),index+2);
      });
      form.moveItem(agree.getIndex(),keys.length+2);
      // Retain legacy answers in an unreachable archive section after current consent.
      const cutoff=keys.length+3;
      const archiveTitle='Arsip pertanyaan lama — tidak digunakan';
      const oldArchive=form.getItems().find(i=>String(i.getType())==='PAGE_BREAK'&&i.getTitle()===archiveTitle);
      const extras=form.getItems().slice(cutoff).filter(i=>!oldArchive||i.getId()!==oldArchive.getId());
      if(extras.length){const archive=oldArchive?oldArchive.asPageBreakItem():form.addPageBreakItem();archive.setTitle(archiveTitle).setGoToPage(FormApp.PageNavigationType.SUBMIT);form.moveItem(archive.getIndex(),cutoff);}
      // Existing legacy questions and their answers are retained.
      props.setProperty('schema_'+kind,RULES.version);
    }
    const termsNow=form.getItems().find(function(i){return ['Ketentuan BRTM','KETENTUAN & PERSETUJUAN ORANG TUA/WALI'].indexOf(i.getTitle())>=0;});
    if(termsNow)termsNow.asSectionHeaderItem().setHelpText(RULES.common);
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
      }else if(String(item.getResponse()||'').trim())data[key]=String(item.getResponse()||'');
    });
  });
  data.jadwalPilihan=ringkasJadwalBRTM(response);
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

// Only answered schedule questions are included; skipped branches remain absent.
function ringkasJadwalBRTM(response){
  return response.getItemResponses().filter(function(r){return /^(Hari|Jam) yang dipilih — /.test(r.getItem().getTitle())&&String(r.getResponse()||'').trim();}).map(function(r){return r.getItem().getTitle()+': '+String(r.getResponse()).trim();}).join('; ');
}

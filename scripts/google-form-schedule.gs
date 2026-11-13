// Run in the existing BRTM Apps Script project; retains questions, responses and keys.
function aturJadwalPendaftaranBRTM(){
  const form=FormApp.openById('1Zup98fj8v48JFzw8kLXKB0XUTm9_sxmOTiAFWi9VIVA'),all=form.getItems();
  const kelas=all.find(i=>i.getTitle()==='Kelas yang dipilih').asListItem();
  const foto=all.find(i=>i.getTitle()==='Foto anak (bebas)'),setuju=all.find(i=>i.getTitle()==='Persetujuan orang tua / wali'),ordered=[];
  if(!foto||!setuju)throw Error('Kolom foto / persetujuan tidak ditemukan.');
  function page(title){const old=all.find(i=>String(i.getType())==='PAGE_BREAK'&&i.getTitle()===title),p=old?old.asPageBreakItem():form.addPageBreakItem().setTitle(title);p.setGoToPage(FormApp.PageNavigationType.CONTINUE);ordered.push(p);return p;}
  function question(title,choices,type){const old=all.find(i=>i.getTitle()===title),q=old?(type==='day'?old.asMultipleChoiceItem():old.asListItem()):(type==='day'?form.addMultipleChoiceItem():form.addListItem());q.setTitle(title).setRequired(true);if(choices)q.setChoiceValues(choices);ordered.push(q);return q;}
  const sore=['15.00–16.00','16.00–17.00'],sabtu=['08.00–09.00','09.00–10.00'].concat(sore),semua=['07.00–08.00','08.00–09.00','09.00–10.00','14.00–15.00'].concat(sore),hari=['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const satu=page('Regular 1× seminggu — pilih hari'),h1=question('Hari yang dipilih — Regular 1×',null,'day'),satuSore=page('Regular 1× — jam Senin–Jumat');question('Jam yang dipilih — Regular 1× (Senin–Jumat)',sore);const satuSabtu=page('Regular 1× — jam Sabtu');question('Jam yang dipilih — Regular 1× (Sabtu)',sabtu);
  const dua=page('Regular 2× seminggu — hari pertama'),h21=question('Hari yang dipilih — Regular 2× (pilihan 1)',null,'day'),duaSore1=page('Regular 2× — jam pertama Senin–Jumat');question('Jam yang dipilih — Regular 2× (pilihan 1, Senin–Jumat)',sore);const duaSabtu1=page('Regular 2× — jam pertama Sabtu');question('Jam yang dipilih — Regular 2× (pilihan 1, Sabtu)',sabtu);
  const duaHari2=page('Regular 2× seminggu — hari kedua'),h22=question('Hari yang dipilih — Regular 2× (pilihan 2)',null,'day');h22.setHelpText('Wajib pilih jadwal latihan kedua. Pilih hari berbeda dari pilihan pertama. Setiap sesi berdurasi 1 jam.');const duaSore2=page('Regular 2× — jam kedua Senin–Jumat');question('Jam yang dipilih — Regular 2× (pilihan 2, Senin–Jumat)',sore);const duaSabtu2=page('Regular 2× — jam kedua Sabtu');question('Jam yang dipilih — Regular 2× (pilihan 2, Sabtu)',sabtu);
  const lain=page('Pilihan jadwal kelas selain Regular');question('Hari yang dipilih — selain Regular',hari);question('Jam yang dipilih — selain Regular',semua);const akhir=page('Foto anak & persetujuan');ordered.push(foto,setuju);
  let cursor=kelas.getIndex()+1;ordered.forEach(i=>{form.moveItem(i.getIndex(),cursor);cursor++;});
  const dayChoices=(q,w,s)=>q.setChoices(hari.map(d=>q.createChoice(d,d==='Sabtu'?s:w)));dayChoices(h1,satuSore,satuSabtu);dayChoices(h21,duaSore1,duaSabtu1);dayChoices(h22,duaSore2,duaSabtu2);
  kelas.setChoices(['Private Class','Semi Private Class','Group Class','Private Couple Class','Hydro Terapi Class','Regular Class (1x Seminggu)','Regular Class (2x Seminggu)'].map(k=>kelas.createChoice(k,k==='Regular Class (1x Seminggu)'?satu:k==='Regular Class (2x Seminggu)'?dua:lain)));
  // PageBreakItem navigation applies to the page BEFORE that break.
  satuSabtu.setGoToPage(akhir);dua.setGoToPage(akhir);duaSabtu1.setGoToPage(duaHari2);duaHari2.setGoToPage(duaHari2);duaSabtu2.setGoToPage(akhir);lain.setGoToPage(akhir);akhir.setGoToPage(FormApp.PageNavigationType.CONTINUE);
  form.setProgressBar(true);console.log('Jadwal pendaftaran diperbarui. Pertanyaan/ jawaban lama dipertahankan.');
}

'use strict';
const stamp=v=>v&&v!=='legacy'?new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(v))+' WIB':'Belum tercatat';
function table(headers,body){return `<div class="ops-scroll"><table class="ops-table"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body||`<tr><td colspan="${headers.length}">Belum ada data.</td></tr>`}</tbody></table></div>`;}
const basicRenderList=renderList;
renderList=function(){
 basicRenderList();const k=S.section,list=filteredRows();
 if(k==='atlet'&&['owner','prestasi'].includes(S.user.role)){
  $('records').className='ops-records';
  $('records').innerHTML=table(['No.','Nama','Kelas',isOwner()?'Pembayaran':'Absensi terbaru','Status'],list.sort((a,b)=>a.nama.localeCompare(b.nama,'id')).map((a,i)=>{
   const last=(S.records.absensi||[]).filter(r=>String(r.atletId)===a.id).sort((x,y)=>String(y.tanggal).localeCompare(String(x.tanggal))||Number(y.id)-Number(x.id))[0];
   return `<tr><td>${i+1}</td><td><button data-child="${a.id}">${esc(a.nama)}</button></td><td>${esc(a.kelompok)}</td><td>${isOwner()?badge(a.statusSPP):last?badge(last.status==='Alpa'?'Tidak hadir':last.status)+'<small>'+esc(displayDate(last.tanggal))+'</small>':'Belum diabsen'}</td><td>${badge(a.status)}</td></tr>`;
  }).join(''));
 }
 if(isOwner()&&['perkembangan','absensi','pembayaran'].includes(k)){
  $('records').className='ops-records';
  $('records').innerHTML=table(['Nama','Pelatih / pencatat','Informasi'],list.sort((a,b)=>String(b.diperbaruiPada||b.dibuatPada||b.tanggal).localeCompare(String(a.diperbaruiPada||a.dibuatPada||a.tanggal))||Number(b.id)-Number(a.id)).map(r=>`<tr><td><button data-activity="${r.id}">${esc(r.namaAtlet)}</button><small>${esc(stamp(r.dibuatPada))}</small></td><td>${esc(r.pelatih||r.dibuatOleh||'BRTM')}</td><td><b>Asli:</b> ${esc(k==='perkembangan'?[r.teknik,r.fisik,r.attitude,r.catatan].filter(Boolean).join('\n'):k==='absensi'?r.status+(r.catatan?' · '+r.catatan:''):r.jenisKelas+' · '+r.status+' · '+rupiah(r.totalTagihan))}<div class="parent-copy"><b>Dashboard orang tua:</b><br>${esc(r.parentMessage||'Belum tersedia')}<small>${r.parentOpenedAt?'Dibuka '+esc(stamp(r.parentOpenedAt)):'Belum tercatat dibuka'}</small></div></td></tr>`).join(''));
 }
 if(isOwner()&&k==='jadwal'){
  $('records').className='ops-records';
  const days=[...new Set(list.map(s=>s.tanggal))].sort();
  $('records').innerHTML=days.map(d=>`<section class="schedule-day"><h3>${esc(new Intl.DateTimeFormat('id-ID',{weekday:'long',day:'numeric',month:'long',timeZone:'Asia/Jakarta'}).format(new Date(d+'T12:00:00+07:00')))}</h3>${table(['Jam','Atlet / kelas','Pelatih'],list.filter(s=>s.tanggal===d).sort((a,b)=>a.mulai.localeCompare(b.mulai)).map(s=>`<tr class="schedule-${s.statusSesi==='Libur'?'holiday':s.jenisKelas.startsWith('Private')?'private':'group'}"><td><button data-edit="${s.id}">${esc(s.jam)}</button></td><td>${(s.atletIds||[]).map(id=>esc((S.records.atlet||[]).find(a=>a.id===String(id))?.nama||'#'+id)).join(', ')}<small>${esc(s.jenisKelas)} · ${esc(s.lokasi)}${s.statusSesi==='Libur'?' · LIBUR':''}</small></td><td>${esc(s.pelatih)}</td></tr>`).join(''))}</section>`).join('')||empty('Belum ada jadwal');
 }
};
const detailDialog=document.createElement('dialog');detailDialog.className='ops-detail';detailDialog.innerHTML='<div class="dialog-head"><h2 id="opsTitle"></h2><button id="opsClose" aria-label="Tutup">×</button></div><div id="opsBody"></div>';document.body.append(detailDialog);$('opsClose').onclick=()=>detailDialog.close();
$('records').addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.child){
  const a=(S.records.atlet||[]).find(a=>a.id===b.dataset.child);if(!a)return;
  $('opsTitle').textContent=a.nama;
  $('opsBody').innerHTML=card(a)+`<h3>Riwayat latihan</h3>`+details([['Hadir',(S.records.absensi||[]).filter(r=>r.atletId===a.id&&r.status==='Hadir').length],['Tanggal lahir',a.tanggalLahir],['Nama panggilan',a.namaPanggilan],['Orang tua',a.namaOrtu],['Tempat lahir',a.tempatLahir]])+(S.records.perkembangan||[]).filter(r=>r.atletId===a.id).map(r=>`<p>${esc(displayDate(r.tanggal))} · ${esc(r.pelatih)}<br>${esc(r.catatan)}</p>`).join('');
  const edit=$('opsBody').querySelector('[data-edit]');if(edit)edit.onclick=()=>{detailDialog.close();openForm('atlet',a);};
  // Dashboard edits remain through the existing validated athlete editor.
  $('opsBody').querySelectorAll('[data-delete],[data-exception]').forEach(b=>b.remove());
  if(isOwner()){
   $('opsBody').insertAdjacentHTML('beforeend','<div class="actions">'+[['pembayaran','SPP & paket'],['absensi','Absensi'],['perkembangan','Perkembangan'],['jadwal','Jadwal']].map(([k,label])=>`<button data-child-section="${k}">${label}</button>`).join('')+'</div>');
   $('opsBody').querySelectorAll('[data-child-section]').forEach(button=>button.onclick=()=>{detailDialog.close();navigate(button.dataset.childSection);$('search').value=a.nama;renderList();});
  }
  detailDialog.showModal();
 }
 if(b.dataset.activity){
  const r=(S.records[S.section]||[]).find(r=>r.id===b.dataset.activity);if(!r)return;
  $('opsTitle').textContent=r.namaAtlet;
  $('opsBody').innerHTML=details([['Dibuat',stamp(r.dibuatPada)],['Diperbarui',stamp(r.diperbaruiPada)],['Pelatih / pencatat',r.pelatih||r.dibuatOleh],['Pesan asli',S.section==='perkembangan'?[r.teknik,r.fisik,r.attitude,r.catatan].filter(Boolean).join('\n'):S.section==='absensi'?r.status+' · '+(r.catatan||''):r.jenisKelas+' · '+r.status+' · '+rupiah(r.totalTagihan)],['Tersedia di dashboard',stamp(r.diperbaruiPada||r.dibuatPada)],['Pesan dashboard orang tua',r.parentMessage],['Dibuka orang tua',r.parentOpenedAt?stamp(r.parentOpenedAt):'Belum tercatat dibuka']])+`<button id="opsEdit" class="primary">Edit data</button>`;
  $('opsEdit').onclick=()=>{detailDialog.close();openForm(S.section,r);};detailDialog.showModal();
 }
});
const teamDialog=document.createElement('dialog');teamDialog.className='team-entry';teamDialog.innerHTML='<form id="teamForm"><h2 id="teamTitle"></h2><div id="teamBody"></div><p id="teamError" class="error" role="alert"></p><div class="actions"><button type="button" id="teamCancel">Batal</button><button id="teamSave" class="primary">Simpan</button></div></form>';document.body.append(teamDialog);$('teamCancel').onclick=()=>teamDialog.close();
let teamKind,teamBatch,teamAthletes=[];
async function openTeamEntry(kind){
 teamKind=kind;teamBatch=crypto.randomUUID();teamAthletes=(S.records.atlet||[]).filter(a=>a.kelompok==='Prestasi Class'&&a.status==='Aktif').sort((a,b)=>a.nama.localeCompare(b.nama,'id'));
 $('teamTitle').textContent=title[kind];$('teamError').textContent='';
 const today=(await request('/api/config')).today;S.config.today=today;
 let body=`<p>Tanggal server: ${esc(displayDate(today))} · ${kind==='catatanwaktu'?'Kolam 25 m. Kosongkan nomor yang tidak dites.':'Data tersimpan saat menekan Simpan.'}</p>`;
 if(kind==='absensi')body+=table(['No.','Nama','Kehadiran','Keterangan'],teamAthletes.map((a,i)=>`<tr><td>${i+1}</td><th>${esc(a.nama)}</th><td><select required name="status_${i}" aria-label="Kehadiran ${esc(a.nama)}"><option value="">Pilih…</option><option>Hadir</option><option>Izin</option><option value="Alpa">Tidak hadir</option></select></td><td><input name="note_${i}" maxlength="2000" aria-label="Keterangan ${esc(a.nama)}" placeholder="Wajib jika izin / tidak hadir"></td></tr>`).join(''));
 if(kind==='perkembangan')body+=field('teamAthlete','Pilih atlet',teamAthletes.map(a=>[a.id,a.nama]),'',{full:true})+field('teamNote','Noted','textarea','',{full:true,max:2000});
 if(kind==='catatanwaktu')body+=table(['No.','Nama',...BRTMTime.events.map(e=>e.gaya+' '+e.jarak+' m')],teamAthletes.map((a,i)=>`<tr><td>${i+1}</td><th>${esc(a.nama)}</th>${BRTMTime.events.map((r,j)=>`<td><input name="time_${i}_${j}" aria-label="${esc(a.nama)} ${esc(r.label)}" inputmode="decimal" placeholder="0:35.00"></td>`).join('')}</tr>`).join(''));
 $('teamBody').innerHTML=body;
 if(kind==='absensi')$('teamBody').querySelectorAll('select').forEach((s,i)=>s.onchange=()=>{$('teamForm').elements['note_'+i].required=s.value!=='Hadir';});
 teamDialog.showModal();
}
$('teamForm').onsubmit=async e=>{
 e.preventDefault();const b=$('teamSave');b.disabled=true;$('teamError').textContent='';
 try{
  const f=e.target.elements;let url,body;
  if(teamKind==='absensi'){url='/api/prestasi/attendance';body={batchId:teamBatch,entries:teamAthletes.map((a,i)=>({atletId:a.id,status:f['status_'+i].value,catatan:f['note_'+i].value}))};}
  if(teamKind==='perkembangan'){url='/api/perkembangan';body={atletId:f.teamAthlete.value,catatan:f.teamNote.value};}
  if(teamKind==='catatanwaktu'){
   const entries=[];teamAthletes.forEach((a,i)=>BRTMTime.events.forEach((r,j)=>{const value=f[`time_${i}_${j}`].value.trim();if(value){const detik=BRTMTime.parse(value);if(!detik)throw Error('Waktu '+a.nama+' '+r.label+' tidak valid');entries.push({atletId:a.id,gaya:r.gaya,jarak:r.jarak,kolam:25,tanggal:S.config.today,detik});}}));
   if(!entries.length)throw Error('Isi minimal satu waktu');url='/api/prestasi/times';body={entries,batchId:teamBatch};
  }
  await request(url,{method:'POST',body:JSON.stringify(body)});teamDialog.close();notice('Data tersimpan.');await load();
 }catch(err){$('teamError').textContent=err.message;}finally{b.disabled=false;}
};
function openNoteEditor(row){
 S.formKind='perkembangan';S.edit=row;$('dialogTitle').textContent='Edit noted atlet';$('dialogEyebrow').textContent='BARATHRUM';$('saveButton').textContent='Simpan data';$('formMessage').textContent='';
 $('formFields').innerHTML=field('atletId','Atlet',[[row.atletId,row.namaAtlet]],row.atletId,{disabled:true})+field('tanggal','Tanggal catatan','date',row.tanggal,{readonly:true})+field('catatan','Noted','textarea',row.catatan,{full:true,max:2000});
 if(!$('editor').open)$('editor').showModal();
}
const originalDashboard=renderDashboard;
renderDashboard=function(){originalDashboard();if(S.user.role==='prestasi')$('dashboard').querySelector('[data-go="jadwal"]')?.closest('.panel')?.remove();};

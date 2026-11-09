'use strict';
let timeAthlete='',timePool='25',timeBatch=null;
const oldRenderList=renderList;
renderList=function(){
 oldRenderList();
 if(S.section!=='catatanwaktu')return;
 const athletes=(S.records.atlet||[]).filter(a=>a.kelompok==='Prestasi Class');
 if(!athletes.some(a=>a.id===timeAthlete))timeAthlete=athletes[0]?.id||'';
 $('sectionSummary').innerHTML=`<div class="panel"><h3>Progression • Catatan waktu</h3><p>Isi hasil sesuai tanggal tes, termasuk tes yang berlangsung beberapa hari. Kolam 25 m dan 50 m dilaporkan terpisah.</p><div class="time-filters"><label>Atlet<select id="timeAthlete">${athletes.map(a=>`<option value="${a.id}"${a.id===timeAthlete?' selected':''}>${esc(a.nama)}</option>`).join('')}</select></label><label>Panjang kolam<select id="timePool"><option value="25">25 m</option><option value="50"${timePool==='50'?' selected':''}>50 m</option></select></label></div>${canWrite('catatanwaktu')?'<button type="button" id="bulkTimes" class="primary">Isi tabel tes</button>':''}<div id="progressionTable"></div></div>`;
 $('timeAthlete').onchange=e=>{timeAthlete=e.target.value;drawTimeTable();};$('timePool').value=timePool;$('timePool').onchange=e=>{timePool=e.target.value;drawTimeTable();};
 if($('bulkTimes'))$('bulkTimes').onclick=openTimeTable;
 drawTimeTable();
};
function drawTimeTable(){
 const records=(S.records.catatanwaktu||[]).filter(x=>String(x.atletId)===timeAthlete&&Number(x.kolam)===Number(timePool));
 const dates=[...new Set(records.map(x=>x.tanggal))].sort();
 $('progressionTable').innerHTML=`<p class="muted">Format menit:detik.sentidetik, contoh 1:27.34. Base time = hasil pertama yang tercatat; personal best = waktu tercepat. Selisih dibandingkan tes sebelumnya pada nomor dan kolam yang sama.</p><div class="time-scroll" tabindex="0" aria-label="Tabel waktu, geser ke samping"><table class="time-table"><thead><tr><th>Nomor renang</th><th>Base time</th><th>Personal best</th><th>Tes terakhir</th><th>Perubahan</th>${dates.map(d=>`<th>${esc(displayDate(d))}</th>`).join('')}</tr></thead><tbody>${BRTMTime.report(records,timePool).map(r=>`<tr><th>${esc(r.label)}</th><td>${BRTMTime.format(r.base?.detik)}</td><td>${BRTMTime.format(r.best?.detik)}</td><td>${BRTMTime.format(r.last?.detik)}<small>${r.last?displayDate(r.last.tanggal):'Belum tes'}</small></td>${deltaCell(r.delta)}${dates.map(d=>`<td>${r.history.filter(x=>x.tanggal===d).map(x=>BRTMTime.format(x.detik)).join('<br>')||'—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function deltaCell(delta){const cls=delta===null?'':delta<0?'faster':delta>0?'slower':'same';return `<td class="${cls}">${delta===null?'Belum pembanding':delta===0?'Tetap':(delta<0?'Lebih cepat ':'Lebih lambat ')+Math.abs(delta).toFixed(2)+' dtk'}</td>`;}
const timeDialog=document.createElement('dialog');timeDialog.id='timeDialog';timeDialog.innerHTML=`<form id="timeForm"><h2>Isi tabel hasil tes</h2><p id="timeChild"></p><label>Nama periode tes (opsional)<input name="testName" maxlength="150" placeholder="Contoh: Tes November 2026"></label><label>Tanggal bawaan<input name="tanggal" type="date" required></label><p>Tanggal tiap nomor dapat diganti. Kosongkan nomor yang belum dites.</p><div class="time-scroll"><table class="time-table"><thead><tr><th>Nomor</th><th>Tanggal hasil</th><th>Waktu</th></tr></thead><tbody id="timeInputs"></tbody></table></div><p id="timeError" role="alert" class="error"></p><div class="actions"><button type="button" id="cancelTime">Batal</button><button class="primary" id="saveTimes">Simpan hasil tes</button></div></form>`;document.body.append(timeDialog);
function openTimeTable(){
 if(!timeAthlete)return notice('Pilih atlet Prestasi dahulu',true);
 timeBatch=crypto.randomUUID();$('timeChild').textContent=(S.records.atlet||[]).find(a=>a.id===timeAthlete)?.nama+' • Kolam '+timePool+' m';
 const form=$('timeForm');form.elements.tanggal.value=S.config.today;form.elements.tanggal.max=S.config.today;
 $('timeInputs').innerHTML=BRTMTime.events.map((r,i)=>`<tr><th>${esc(r.label)}</th><td><input aria-label="Tanggal ${esc(r.label)}" type="date" name="date_${i}" value="${S.config.today}" max="${S.config.today}" required></td><td><input aria-label="Waktu ${esc(r.label)}" name="time_${i}" inputmode="decimal" placeholder="0:35.00"></td></tr>`).join('');
 form.elements.tanggal.onchange=()=>form.querySelectorAll('[name^=date_]').forEach(el=>el.value=form.elements.tanggal.value);
 $('timeError').textContent='';timeDialog.showModal();
}
$('cancelTime').onclick=()=>timeDialog.close();
$('timeForm').onsubmit=async e=>{e.preventDefault();const b=$('saveTimes');b.disabled=true;try{
 const entries=[];BRTMTime.events.forEach((r,i)=>{const t=e.target.elements['time_'+i].value.trim();if(!t)return;const detik=BRTMTime.parse(t);if(!detik)throw Error('Waktu '+r.label+' tidak valid. Contoh 35.00 atau 1:27.34.');entries.push({atletId:timeAthlete,gaya:r.gaya,jarak:r.jarak,kolam:Number(timePool),tanggal:e.target.elements['date_'+i].value,detik,testName:e.target.elements.testName.value});});
 if(!entries.length)throw Error('Isi minimal satu waktu tes.');
 await request('/api/prestasi/times',{method:'POST',body:JSON.stringify({entries,batchId:timeBatch})});timeDialog.close();notice('Hasil tes tersimpan. Laporan orang tua ikut diperbarui.');await load();
 }catch(err){$('timeError').textContent=err.message;}finally{b.disabled=false;}};
const oldOpenForm=openForm;
let programOcrBusy=0;
openForm=function(kind,row){oldOpenForm(kind,row);if(kind!=='program'||!canWrite(kind))return;
 const v=row||{},groups=v.grupProgram||[{nomor:1,swimming:v.swimming||'',adaFoto:!!v.fotoProgram}];
 $('formFields').insertAdjacentHTML('beforeend',field('dryland','Dryland • latihan darat (ketik langsung)','textarea',v.dryland,{required:false,full:true,max:10000})+'<div class="field full"><h3>Swimming • program per grup</h3><p>Unggah foto whiteboard pada grup yang sesuai. Tersedia empat grup, satu foto per grup (maksimal 5 MB per foto). Isi grup yang digunakan saja.</p></div>'+[1,2,3,4].map(n=>{
  const g=groups.find(g=>g.nomor===n)||{};
  return `<section class="field full program-group-editor"><h3>Grup ${n}</h3>${field('swimming_'+n,'Swimming Grup '+n,'textarea',g.swimming,{required:false,max:10000})}<label for="programPhoto_${n}">Foto program Grup ${n}</label><input id="programPhoto_${n}" type="file" accept="image/jpeg,image/png,image/webp">${g.adaFoto?`<a href="/api/prestasi/program/${v.id}/photo/${n}" target="_blank" rel="noopener">Lihat foto tersimpan</a>${check('removePhoto_'+n,'Hapus foto Grup '+n,false)}`:''}<button type="button" class="secondary" id="readProgramPhoto_${n}">Baca foto ke Swimming Grup ${n}</button><p id="ocrStatus_${n}" role="status">Hasil baca foto hanya masuk ke Swimming grup ini. Periksa kembali tulisan, jarak dan interval.</p></section>`;
 }).join('')+field('evaluasi','Evaluasi program','textarea',v.evaluasi,{required:false,full:true,max:10000}));
 $('f_detail').required=$('f_jenis').value==='Event';
 $('f_jenis').onchange=()=>$('f_detail').required=$('f_jenis').value==='Event';
 for(const n of [1,2,3,4])$('readProgramPhoto_'+n).onclick=()=>readProgramPhoto(n);
 const label=$('programDate');
 if(row)label.textContent=displayDate(v.tanggal)+' · tanggal pencatatan asli';
 else request('/api/config').then(c=>{if(label.isConnected)label.textContent=displayDate(c.today)+' · dari server, ditetapkan saat disimpan';}).catch(()=>{if(label.isConnected)label.textContent='Tanggal ditetapkan server saat tersambung dan disimpan.';});
};
async function photoValue(file){if(!file?.size)return null;if(file.size>5*1024*1024)throw Error('Foto maksimal 5 MB');const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('Foto gagal dibaca'));r.readAsDataURL(file);});return {mime:file.type,base64:data.split(',')[1]};}
async function programPayload(){
 if(programOcrBusy)throw Error('Tunggu pembacaan foto selesai sebelum menyimpan.');
 const grupProgram=[];
 for(const n of [1,2,3,4]){
  const foto=await photoValue($('programPhoto_'+n).files[0]),hapusFoto=!!$('f_removePhoto_'+n)?.checked;
  if(foto&&hapusFoto)throw Error('Batalkan pilihan hapus foto Grup '+n+' sebelum mengganti foto.');
  grupProgram.push({nomor:n,swimming:$('f_swimming_'+n).value,...(foto?{foto}:{}),hapusFoto});
 }
 return {grupProgram};
}
async function readProgramPhoto(n){const b=$('readProgramPhoto_'+n),status=$('ocrStatus_'+n),target=$('f_swimming_'+n);b.disabled=true;programOcrBusy++;try{
 const foto=await photoValue($('programPhoto_'+n).files[0]);if(!foto)throw Error('Pilih foto program Grup '+n+' dahulu');status.textContent='Sedang membaca foto…';
 const result=await request('/api/prestasi/ocr',{method:'POST',body:JSON.stringify({foto})});
 if(!target.isConnected||!$('editor').open)return;
 target.value=[target.value,result.text.trim()].filter(Boolean).join('\n');status.textContent=result.text.trim()?'Hasil baca dimasukkan ke Swimming Grup '+n+'. Periksa dan perbaiki sebelum menyimpan.':'Tulisan belum terbaca. Gunakan foto yang lebih terang atau ketik program.';
 }catch(e){if(status.isConnected)status.textContent=e.message;}finally{b.disabled=false;programOcrBusy--;}}

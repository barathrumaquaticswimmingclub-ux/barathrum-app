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
openForm=function(kind,row){oldOpenForm(kind,row);if(kind!=='program'||!canWrite(kind))return;
 const v=row||{};
 $('formFields').insertAdjacentHTML('beforeend',field('grup','Kelas / grup latihan','text',v.grup||'Prestasi',{full:true,max:150})+field('dryland','Dryland • latihan darat','textarea',v.dryland,{required:false,full:true,max:10000})+field('swimming','Swimming • latihan renang','textarea',v.swimming,{required:false,full:true,max:10000})+field('evaluasi','Evaluasi program','textarea',v.evaluasi,{required:false,full:true,max:10000})+'<div class="field full"><label for="programPhoto">Foto program (opsional, maksimal 5 MB)</label><input id="programPhoto" type="file" accept="image/jpeg,image/png,image/webp"><label for="ocrTarget">Masukkan hasil baca ke</label><select id="ocrTarget"><option value="swimming">Swimming</option><option value="dryland">Dryland</option></select><button type="button" id="readProgramPhoto" class="secondary">Baca foto menjadi teks</button><p id="ocrStatus" role="status">Periksa hasil baca sebelum menyimpan, terutama tulisan tangan, jarak dan interval.</p></div>');
 $('f_detail').required=$('f_jenis').value==='Event';$('f_detail').closest('.field').querySelector('label').textContent='Informasi tambahan / detail event';
 $('f_jenis').onchange=()=>$('f_detail').required=$('f_jenis').value==='Event';
 $('readProgramPhoto').onclick=readProgramPhoto;
};
async function photoValue(file){if(!file?.size)return null;if(file.size>5*1024*1024)throw Error('Foto maksimal 5 MB');const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('Foto gagal dibaca'));r.readAsDataURL(file);});return {mime:file.type,base64:data.split(',')[1]};}
async function readProgramPhoto(){const b=$('readProgramPhoto');b.disabled=true;try{
 const foto=await photoValue($('programPhoto').files[0]);if(!foto)throw Error('Pilih foto program dahulu');$('ocrStatus').textContent='Sedang membaca foto…';
 const result=await request('/api/prestasi/ocr',{method:'POST',body:JSON.stringify({foto})});
 const target=$('f_'+$('ocrTarget').value);target.value=[target.value,result.text.trim()].filter(Boolean).join('\n');$('ocrStatus').textContent=result.text.trim()?'Hasil baca dimasukkan. Periksa dan perbaiki teks sebelum menyimpan.':'Tulisan belum terbaca. Gunakan foto yang lebih terang atau ketik program.';
 }catch(e){$('ocrStatus').textContent=e.message;}finally{b.disabled=false;}}

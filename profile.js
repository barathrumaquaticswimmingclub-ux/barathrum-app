'use strict';
const B = require('./business');
const FIELDS = ['nama','namaPanggilan','tanggalLahir','jk','tempatLahir','namaOrtu','noHpOrtu','sekolah','kelasSekolah','alamat','tujuan','riwayatRenang','jadwalPilihan'];
function cleanProfile(input, previous = {}) {
  const out = { ...previous };
  for (const k of FIELDS) if (Object.hasOwn(input,k)) {
    if (typeof input[k] !== 'string' || input[k].trim().length > (k === 'nama' ? 150 : 1000)) throw Object.assign(Error('Isian '+k+' tidak valid'),{status:400});
    out[k] = input[k].trim();
  }
  if (!out.nama) throw Object.assign(Error('Nama lengkap wajib diisi'),{status:400});
  if (out.tanggalLahir && (!B.validDate(out.tanggalLahir) || out.tanggalLahir > B.today())) throw Object.assign(Error('Tanggal lahir tidak valid'),{status:400});
  if (out.noHpOrtu && !/^\+?[0-9 ()-]{8,25}$/.test(out.noHpOrtu)) throw Object.assign(Error('Nomor WhatsApp tidak valid'),{status:400});
  if (out.jk && !['Laki-laki','Perempuan'].includes(out.jk)) throw Object.assign(Error('Jenis kelamin tidak valid'),{status:400});
  return out;
}
function photo(value) {
  if (!value || typeof value.mime !== 'string' || typeof value.base64 !== 'string' || value.base64.length > 7*1024*1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value.base64)) throw Object.assign(Error('Foto tidak valid; gunakan gambar maksimal 5 MB'),{status:400});
  const bytes = Buffer.from(value.base64,'base64');
  const actual = bytes[0]===255 && bytes[1]===216 && bytes[2]===255 ? 'image/jpeg' : bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png' : bytes.subarray(0,6).toString().match(/^GIF8[79]a$/) ? 'image/gif' : bytes.subarray(0,4).toString()==='RIFF' && bytes.subarray(8,12).toString()==='WEBP' ? 'image/webp' : null;
  if (!actual || actual!==value.mime || !bytes.length || bytes.length>5*1024*1024) throw Object.assign(Error('Gunakan foto JPG, PNG, GIF, atau WebP maksimal 5 MB'),{status:400});
  return {mime:actual,base64:bytes.toString('base64')};
}
module.exports={FIELDS,cleanProfile,photo};

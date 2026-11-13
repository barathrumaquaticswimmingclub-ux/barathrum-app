'use strict';
const sharp=require('sharp');
const P=require('./profile');
async function compress(value,program=false){
 const photo=P.photo(value),input=Buffer.from(photo.base64,'base64');
 try{
  const output=await sharp(input,{limitInputPixels:40000000,failOn:'error'}).rotate().resize({width:program?2000:1000,height:program?2000:1000,fit:'inside',withoutEnlargement:true}).webp({quality:program?84:78,effort:4}).toBuffer();
  return {mime:'image/webp',base64:output.toString('base64')};
 }catch{throw Object.assign(Error('Foto tidak dapat dibaca. Gunakan foto JPG, PNG, GIF atau WebP yang utuh.'),{status:400});}
}
async function program(payload,previous){
 if(payload.fotoProgram && payload.fotoProgram.base64!==previous?.fotoProgram?.base64)payload.fotoProgram=await compress(payload.fotoProgram,true);
 if(Array.isArray(payload.grupProgram))for(const g of payload.grupProgram)if(g.foto && g.foto.base64!==previous?.grupProgram?.find(x=>x.nomor===g.nomor)?.foto?.base64)g.foto=await compress(g.foto,true);
 return payload;
}
// Staff uploads are decoded from their content, independent of filename/MIME.
async function staff(value){
 if(!value||typeof value.base64!=='string'||value.base64.length>28*1024*1024||!/^[A-Za-z0-9+/]+={0,2}$/.test(value.base64))throw Object.assign(Error('Pilih foto maksimal 20 MB'),{status:400});
 let input=Buffer.from(value.base64,'base64');if(!input.length||input.length>20*1024*1024)throw Object.assign(Error('Foto maksimal 20 MB'),{status:400});
 try{
  if(input.subarray(0,2).toString()==='BM'){
   const width=input.readInt32LE(18),height=Math.abs(input.readInt32LE(22));if(width<1||height<1||width*height>40000000)throw Error('Ukuran gambar terlalu besar');
   const bmp=require('bmp-js').decode(input);const rgba=Buffer.from(bmp.data);for(let i=0;i<rgba.length;i+=4){const b=rgba[i+1],g=rgba[i+2],r=rgba[i+3];rgba[i]=r;rgba[i+1]=g;rgba[i+2]=b;rgba[i+3]=255;}input=await sharp(rgba,{raw:{width:bmp.width,height:bmp.height,channels:4}}).png().toBuffer();
  }else if(input.subarray(4,8).toString()==='ftyp'&&!/avif|avis/.test(input.subarray(8,40).toString())&&/heic|heix|hevc|hevx|mif1/.test(input.subarray(8,40).toString())){
   input=Buffer.from(await require('heic-convert')({buffer:input,format:'JPEG',quality:.9}));
  }
  const output=await sharp(input,{limitInputPixels:40000000}).rotate().resize({width:1000,height:1000,fit:'inside',withoutEnlargement:true}).webp({quality:78}).toBuffer();
  return {mime:'image/webp',base64:output.toString('base64')};
 }catch{throw Object.assign(Error('Foto tidak dapat dibaca. Coba berkas foto lain (JPG, PNG, HEIC, WebP, GIF, TIFF, BMP, AVIF atau SVG).'),{status:400});}
}
module.exports={compress,program,staff};

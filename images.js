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
module.exports={compress,program};

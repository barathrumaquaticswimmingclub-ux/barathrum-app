'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=__dirname,publicDir=path.join(root,'public');
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
function fileHash(name){return digest(fs.readFileSync(path.join(publicDir,name)));}
function fingerprint(){
 const files=fs.readdirSync(root).filter(n=>n.endsWith('.js')&&!n.endsWith('.test.js'));
 function visit(dir){for(const e of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory())visit(p);else files.push(p);}}
 visit('public');files.push('package.json');const hash=crypto.createHash('sha256');
 for(const name of files.sort()){hash.update(name+'\0');hash.update(fs.readFileSync(path.join(root,name)));hash.update('\0');}return hash.digest('hex').slice(0,20);
}
function metadata(){
 const id=fingerprint(),apps={};
 for(const [app,manifest] of [['staff','manifest.webmanifest'],['swim','swim/manifest.webmanifest']]){
  const m=JSON.parse(fs.readFileSync(path.join(publicDir,manifest),'utf8'));
  const icon=(m.icons.find(i=>i.sizes==='192x192'&&i.purpose==='any')||m.icons[0]).src;
  apps[app]={iconRevision:digest(m.icons.map(i=>i.src+':'+fileHash(i.src)).join('|')).slice(0,20),icon:icon+'?v='+fileHash(icon).slice(0,20),manifest:'/'+manifest,install:app==='staff'?'/club/install/':'/swim/install/'};
 }
 return {id,policyRevision:fileHash('rules/parent/data.json').slice(0,20),apps};
}
function isProtected(req){
 const p=req.path;if(!/^\/(api|auth)(\/|$)/.test(p)&&!p.startsWith('/swim/api/'))return false;
 if(['/auth/status','/auth/logout','/swim/api/logout'].includes(p))return false;
 // Image/anchor downloads cannot carry a page's custom header; their existing auth remains mandatory.
 if(['GET','HEAD'].includes(req.method)&&(/\/(photo|foto|pdf|word)(\/\d+)?$/.test(p)||p==='/api/backup'||p==='/api/formulir/installer'||/^\/api\/owner\/documents\//.test(p)||/^\/swim\/api\/(documents|receipt)\//.test(p)||p==='/swim/api/statement'))return false;
 return true;
}
function mount(app,{enforce=false,release=metadata()}={}){
 app.get('/app-release',(req,res)=>res.json(release));
 function page(file,kind){return(req,res)=>{
  const data=release.apps[kind];let html=fs.readFileSync(path.join(publicDir,file),'utf8').replaceAll('__BRTM_RELEASE__',release.id).replaceAll('__BRTM_ICON_REVISION__',data.iconRevision).replaceAll('__BRTM_APP__',kind);
  html=html.replace(/(href="[^"?]+\.(?:png|webp))(")/g,'$1?v='+data.iconRevision+'$2');res.type('html').send(html);
 };}
 app.get(['/','/index.html','/club/','/club/index.html'],page('index.html','staff'));
 app.get(['/swim/','/swim/index.html'],page('swim/index.html','swim'));
 for(const manifest of ['manifest.webmanifest','swim/manifest.webmanifest'])app.get('/'+manifest,(req,res)=>{
  const data=JSON.parse(fs.readFileSync(path.join(publicDir,manifest),'utf8'));data.icons=data.icons.map(i=>({...i,src:i.src.split('?')[0]+'?v='+fileHash(i.src.split('?')[0]).slice(0,20)}));res.type('application/manifest+json').send(data);
 });
 for(const [routes,kind,file] of [[['/sw.js','/club/sw.js'],'staff','sw.js'],[['/swim/sw.js'],'swim','swim/sw.js']])app.get(routes,(req,res)=>{
  const m=JSON.parse(fs.readFileSync(path.join(publicDir,release.apps[kind].manifest),'utf8'));
  const icon=size=>(m.icons.find(i=>i.sizes===size+'x'+size&&i.purpose==='any')||m.icons[0]).src.split('?')[0];
  const prefix=`'use strict';\nconst BRTM_NOTIFICATION_ICON_192=${JSON.stringify(icon(192)+'?v='+fileHash(icon(192)).slice(0,20))};\nconst BRTM_SW_REVISION=${JSON.stringify(release.id)},BRTM_ICON_192=${JSON.stringify(icon(192))},BRTM_ICON_512=${JSON.stringify(icon(512))};\n`;
  res.type('application/javascript').send(prefix+fs.readFileSync(path.join(publicDir,file),'utf8'));
 });
 app.use((req,res,next)=>{
  if(enforce&&isProtected(req)&&req.get('X-BRTM-Release')!==release.id)return res.status(428).json({code:'BRTM_UPDATE_REQUIRED',pesan:'Pembaruan aplikasi wajib. Tutup lalu buka kembali BRTM/BRTM SWIM dan tekan Perbarui aplikasi sebelum melanjutkan.',releaseId:release.id});
  next();
 });
 return release;
}
module.exports={metadata,isProtected,mount};

'use strict';
const P=require('./billing-policy');
function mode(){if(!P.email(process.env.BRTM_EMAIL_FROM||''))return null;if(process.env.RESEND_API_KEY)return 'resend';if(process.env.BRTM_SMTP_HOST&&process.env.BRTM_SMTP_USER&&process.env.BRTM_SMTP_PASSWORD&&['465','587'].includes(process.env.BRTM_SMTP_PORT||'465'))return 'smtp';return null;}
async function smtpSend(message){
 const port=Number(process.env.BRTM_SMTP_PORT||465);
 const transport=require('nodemailer').createTransport({host:process.env.BRTM_SMTP_HOST,port,secure:port===465,requireTLS:port!==465,auth:{user:process.env.BRTM_SMTP_USER,pass:process.env.BRTM_SMTP_PASSWORD},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000,disableFileAccess:true,disableUrlAccess:true});
 try{return await transport.sendMail({...message,attachments:message.attachments.map(a=>({...a,content:Buffer.from(a.content,'base64')}))});}finally{transport.close();}
}
async function send(app,message,key){
 if(mode()==='smtp'){
  const r=await app.locals.billingSmtpSend({...message,messageId:'<'+key+'@brtm.local>'});
  if(!r.messageId||!r.accepted?.some(a=>String(a).toLowerCase()===message.to[0].toLowerCase()))return {status:'failed',error:'Layanan email menolak alamat penerima.'};
  return {status:'accepted',id:r.messageId};
 }
 const response=await app.locals.billingEmailFetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(message),signal:AbortSignal.timeout(15000),redirect:'error'});
 if(!response.ok)return {status:response.status>=500?'unknown':'failed',error:'Layanan email menjawab HTTP '+response.status};
 const r=await response.json();if(!r.id)throw Error('missing_id');return {status:'accepted',id:r.id};
}
module.exports={mode,send,smtpSend};

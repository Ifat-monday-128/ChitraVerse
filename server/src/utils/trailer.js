function youtubeId(value) {
 if(typeof value!=='string')return null;
 value=value.trim();if(/^[A-Za-z0-9_-]{11}$/.test(value))return value;
 try{
 const u=new URL(value.startsWith('watch?')?'https://youtube.com/'+value:value);
 if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port)return null;
 if(!['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(u.hostname))return null;
 let id;
 if(u.hostname==='youtu.be')id=/^\/([A-Za-z0-9_-]{11})\/?$/.exec(u.pathname)?.[1];
 else if(u.pathname==='/watch')id=u.searchParams.get('v');
 else id=/^\/(?:embed|shorts)\/([A-Za-z0-9_-]{11})\/?$/.exec(u.pathname)?.[1];
 return /^[A-Za-z0-9_-]{11}$/.test(id||'')?id:null;
 }catch{return null;}
}
module.exports={youtubeId};

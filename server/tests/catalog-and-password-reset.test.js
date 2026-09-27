const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { scryptSync, randomBytes } = require('node:crypto');
require('../src/config/env');
const { Pool } = require('pg');
const schema = `features_${process.pid}_${Date.now()}`;
const admin = new Pool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||5432),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,options:''});
process.env.PGOPTIONS = `-c search_path=${schema},public`;
const pool = require('../src/config/db');
const mail = require('../src/services/mail.service');
const importer = require('../src/services/tmdb-import.service');
const app = require('../src/app');
app.set('trust proxy','loopback'); // Only this isolated test app trusts its test client.
const password = 'Original password 123!';
let server, base, inbox = [], address = 0;
const hash = value => {const salt=randomBytes(16).toString('hex');return `scrypt:${salt}:${scryptSync(value,salt,64).toString('hex')}`;};
test.before(async()=>{
  await admin.query(`CREATE SCHEMA ${schema}`);
  await pool.query(await fs.readFile(path.resolve(__dirname,'../database/schema.sql'),'utf8'));
  for(const file of ['001_search_and_sessions.sql','003_community_comments.sql']) await pool.query(await fs.readFile(path.resolve(__dirname,'../database/migrations',file),'utf8'));
  for(const role of ['user','admin']) await pool.write('INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$1)',[role,`${role}@example.invalid`,hash(password)]);
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}`;
});
test.beforeEach(async()=>{
  address++;inbox=[];
  mail.configured=()=>true;mail.sendResetCode=async(email,code)=>{inbox.push({email,code});};
  await pool.write('DELETE FROM password_reset');
  await pool.write("UPDATE users SET password_hash=$1 WHERE email='user@example.invalid'",[hash(password)]);
});
test.after(async()=>{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
async function request(route,body,cookie,method=body?'POST':'GET') {
  const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json','X-Forwarded-For':`192.0.2.${address}`,...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
const login = (role='user',pass=password)=>request('/api/account/login',{email:`${role}@example.invalid`,password:pass});
const send = (email='user@example.invalid')=>request('/api/account/forgot-password',{email});
const reset = (code,pass='New password 456!')=>request('/api/account/reset-password',{email:'user@example.invalid',code,password:pass});

test('catalog is public while private account requests reject missing and logged-out sessions',async()=>{
  const cookie=(await login()).cookie;
  for(const route of ['/api/media/home','/api/media/search','/api/media/community','/api/media/people']) {
    assert.equal((await request(route)).status,200);
    assert.equal((await request(route,null,'chitraverse_session=invalid')).status,200);
  }
  for(const route of ['/api/account/me','/api/account/watchlists','/api/account/admin/catalog'])
    assert.equal((await request(route)).status,401);
  assert.equal((await request('/api/media/home',null,cookie)).status,200);
  await request('/api/account/logout',{},cookie);
  assert.equal((await request('/api/media/home',null,cookie)).status,200);
  assert.equal((await request('/api/account/me',null,cookie)).status,401);
});
test('OTP is hashed, email response is generic, reset is single-use and revokes sessions',async()=>{
  const cookie=(await login()).cookie;
  const sent=await send();assert.equal(sent.status,200);assert.equal(inbox.length,1);
  const code=inbox[0].code;assert.match(code,/^\d{6}$/);
  const stored=(await pool.query('SELECT code_hash FROM password_reset')).rows[0].code_hash;
  assert.notEqual(stored,code);assert.ok(!JSON.stringify(sent.body).includes(code));
  const unknown=await send('missing@example.invalid');assert.deepEqual(unknown.body,sent.body);assert.equal(inbox.length,1);
  await send();assert.equal(inbox.length,1,'cooldown prevents another email');
  assert.equal((await reset(code)).status,200);
  assert.equal((await reset(code)).status,400);
  assert.equal((await request('/api/account/me',null,cookie)).status,401);
  assert.equal((await login()).status,401);
  assert.equal((await login('user','New password 456!')).status,200);
  assert.match((await pool.query("SELECT password_hash FROM users WHERE role='user'")).rows[0].password_hash,/^scrypt:/);
});
test('expired and exhausted OTPs fail; resend invalidates the previous code',async()=>{
  await send();const old=inbox[0].code;
  await pool.write("UPDATE password_reset SET expires_at=now()-interval '1 second',sent_at=now()-interval '2 minutes'");
  assert.equal((await reset(old)).status,400);
  await send();const current=inbox[1].code;
  const wrong=current==='000000'?'111111':'000000';
  for(let i=0;i<5;i++)assert.equal((await reset(wrong)).status,400);
  assert.equal((await pool.query('SELECT attempts FROM password_reset')).rows[0].attempts,5);
  assert.equal((await reset(current)).status,400);
  await pool.write("UPDATE password_reset SET sent_at=now()-interval '2 minutes'");
  await send();assert.equal((await reset(inbox[2].code)).status,200);
});
test('delivery failure rolls back challenge; missing configuration and malformed fields are explicit',async()=>{
  assert.equal((await send('invalid')).status,400);
  assert.equal((await reset('abc')).status,400);
  mail.configured=()=>false;assert.equal((await send()).status,503);
  mail.configured=()=>true;mail.sendResetCode=async()=>{throw new Error('SMTP unavailable');};
  assert.equal((await send()).status,503);
  assert.equal((await pool.query('SELECT * FROM password_reset')).rowCount,0);
});
test('only one concurrent reset can consume a code; request throttling is enforced',async()=>{
  await send();const results=await Promise.all([reset(inbox[0].code),reset(inbox[0].code)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);
  for(let i=0;i<12;i++)await send('missing@example.invalid');
  assert.equal((await send()).status,429);
});
test('procedure changes both tables, preserves imported scores, and rollback undoes the workflow',async()=>{
  const args=[null,'movie','Procedure film','Synopsis','en',null,null,'2020-01-01',120];
  const call='CALL save_catalog_title($1::int,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::date,$9::int)';
  const created=await pool.withTransaction(c=>c.query(call,args));const id=created.rows[0].p_title_id;
  await pool.write('UPDATE media SET tmdb_rating=8.5 WHERE title_id=$1',[id]);
  await pool.withTransaction(c=>c.query(call,[id,'series','Updated film',...args.slice(3)]));
  assert.equal((await pool.query('SELECT runtime FROM movie WHERE title_id=$1',[id])).rows[0].runtime,120);
  assert.equal((await pool.query('SELECT tmdb_rating FROM media WHERE title_id=$1',[id])).rows[0].tmdb_rating,'8.5');
  const count=(await pool.query('SELECT COUNT(*) FROM media')).rows[0].count;
  await assert.rejects(pool.withTransaction(async c=>{await c.query(call,args);await c.query('INSERT INTO movie(title_id) VALUES(-1)');}));
  assert.equal((await pool.query('SELECT COUNT(*) FROM media')).rows[0].count,count);
  const user=(await pool.query("SELECT user_id FROM users WHERE role='user'")).rows[0].user_id;
  await pool.write('INSERT INTO review(user_id,title_id,rating) VALUES($1,$2,8)',[user,id]);
  assert.deepEqual((await pool.query('SELECT * FROM get_title_rating($1)',[id])).rows[0],{chitraverse_rating:'8.0',chitraverse_vote_count:1});
});

function fixture(type,id=700001,broken=false) {
  return async route=>{
    if(route.startsWith('/person/'))return {id:1001,name:'Test actor',biography:'Biography',birthday:'1980-01-01',profile_path:'/person.jpg'};
    if(route.includes('/season/'))return {season_number:Number(route.split('/').at(-1)),episodes:[{name:broken?'x'.repeat(256):'Pilot',episode_number:1,runtime:45,air_date:'2020-01-01'}]};
    return {id,title:type==='movie'?'Imported movie':undefined,name:'Imported series',overview:'Overview',original_language:'en',poster_path:'/poster.jpg',vote_average:8.2,budget:1000,revenue:5000,runtime:110,release_date:'2020-01-01',first_air_date:'2020-01-01',last_air_date:'2021-01-01',status:'Ended',
      genres:[{id:18,name:'Drama'}],credits:{cast:[{id:1001,name:'Test actor'}],crew:[{id:1001,name:'Test actor',job:'Director'}]},production_companies:[{id:1002,name:'Studio',origin_country:'US',logo_path:'/studio.png'}],
      seasons:[{season_number:0},{season_number:1}],videos:{results:[{site:'YouTube',type:'Trailer',official:true,key:'zSWdZVtXT7E'}]},'watch/providers':{results:{BD:{flatrate:[{provider_id:8,provider_name:'Test streaming',logo_path:'/stream.png'}]}}}};
  };
}
test('TMDB import saves mapped relationships, all seasons, and distinct movie/TV identities',async()=>{
  process.env.TMDB_WATCH_REGION='BD';
  const movie=await importer.importTitle('https://www.themoviedb.org/movie/700001-film',()=>{},fixture('movie'));
  const series=await importer.importTitle('https://www.themoviedb.org/tv/700001-series',()=>{},fixture('tv'));
  assert.notEqual(movie.title_id,series.title_id);assert.equal(series.seasons,2);assert.equal(series.episodes,2);
  assert.equal(movie.people,1);assert.equal(movie.providers,1);
  const saved=(await pool.query('SELECT * FROM media WHERE title_id=$1',[movie.title_id])).rows[0];
  assert.equal(saved.budget,'1000');assert.equal(saved.trailer_link,'watch?v=zSWdZVtXT7E');
  assert.equal((await pool.query('SELECT * FROM media_cast_crew WHERE title_id=$1',[movie.title_id])).rowCount,2);
  const user=(await pool.query("SELECT user_id FROM users WHERE role='user'")).rows[0].user_id;
  await pool.write('INSERT INTO review(user_id,title_id,rating,content) VALUES($1,$2,9,\'Keep this\')',[user,movie.title_id]);
  const repeated=await importer.importTitle('https://www.themoviedb.org/movie/700001',()=>{},fixture('movie'));
  assert.equal(repeated.title_id,movie.title_id);assert.equal(repeated.updated,true);
  assert.equal((await pool.query('SELECT content FROM review WHERE title_id=$1',[movie.title_id])).rows[0].content,'Keep this');
  assert.equal((await pool.query('SELECT * FROM streaming_platform WHERE name=\'Test streaming\'')).rowCount,1);
});
test('TMDB failures cannot leave partial catalog writes and untrusted links are rejected',async()=>{
  const before=(await pool.query('SELECT COUNT(*) FROM media')).rows[0].count;
  await assert.rejects(importer.importTitle('https://www.themoviedb.org/tv/700002',()=>{},fixture('tv',700002,true)));
  assert.equal((await pool.query('SELECT COUNT(*) FROM media')).rows[0].count,before);
  await assert.rejects(importer.importTitle('https://www.themoviedb.org/tv/700003',()=>{},async()=>{throw new Error('network');}));
  for(const url of ['https://evil.test/movie/1','http://www.themoviedb.org/movie/1','https://www.themoviedb.org@evil.test/movie/1','https://www.themoviedb.org/movie/1/credits','https://www.themoviedb.org:444/movie/1'])assert.throws(()=>importer.parseLink(url));
});
test('TMDB import jobs enforce admin access, owner privacy, and report completion',async()=>{
  const url='https://www.themoviedb.org/movie/700004';
  assert.equal((await request('/api/account/admin/catalog/import-tmdb',{url})).status,401);
  const user=(await login()).cookie, boss=(await login('admin')).cookie;
  assert.equal((await request('/api/account/admin/catalog/import-tmdb',{url},user)).status,403);
  assert.equal((await request('/api/account/admin/catalog/import-tmdb',{url:'bad'},boss)).status,400);
  const original=importer.importTitle;importer.importTitle=async()=>({title_id:123,title:'Job film'});
  try {
    const job=await request('/api/account/admin/catalog/import-tmdb',{url},boss);assert.equal(job.status,202);
    const result=await request(`/api/account/admin/catalog/import-tmdb/${job.body.job_id}`,null,boss);
    assert.equal(result.body.status,'complete');assert.equal(result.body.result.title_id,123);
    assert.equal((await request(`/api/account/admin/catalog/import-tmdb/${job.body.job_id}`,null,user)).status,403);
  } finally {importer.importTitle=original;}
});

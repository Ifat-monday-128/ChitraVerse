const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {scryptSync}=require('node:crypto');require('../src/config/env');const {Pool}=require('pg');
const schema=`improvements_${process.pid}_${Date.now()}`;
const admin=new Pool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||5432),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,options:''});
process.env.PGOPTIONS=`-c search_path=${schema},public`;
const pool=require('../src/config/db'),app=require('../src/app');const password='Feature test password 123';let server,base;const cookies={},ids={};
async function request(route,role,body,method=body?'POST':'GET'){
 const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(cookies[role]?{Cookie:cookies[role]}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
test.before(async()=>{await admin.query(`CREATE SCHEMA ${schema}`);for(const f of ['schema.sql','migrations/001_search_and_sessions.sql'])await pool.query(await fs.readFile(path.resolve(__dirname,'../database',f),'utf8'));
 for(const name of ['user','other','moderator','admin']){ids[name]=(await pool.query('INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING user_id',[name,name+'@example.invalid',`scrypt:fixture:${scryptSync(password,'fixture',64).toString('hex')}`,name==='other'?'user':name])).rows[0].user_id;}
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`;
 for(const name of Object.keys(ids)){const login=await request('/api/account/login',null,{email:name+'@example.invalid',password,role:'admin'});assert.equal(login.status,200);assert.equal(login.data.user.role,name==='other'?'user':name);assert.ok(!JSON.stringify(login.data).includes('hash'));cookies[name]=login.cookie;}
});
test.after(async()=>{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
const post=async()=>{const r=await request('/api/account/community','user',{title:'A community story',content:'A thoughtful review'});assert.equal(r.status,201);return r.data.post.post_id;};
const report=async id=>{const r=await request(`/api/account/community/${id}/reports`,'other',{reason:'Spam',explanation:'Review this please'});assert.equal(r.status,201);return (await pool.query('SELECT report_id FROM community_report WHERE post_id=$1',[id])).rows[0].report_id;};
test('comments persist, paginate, enforce ownership and honor parent visibility',async()=>{
 const id=await post(),url=`/api/account/community/${id}/comments`;
 assert.equal((await request(url,null,{content:'Guest'})).status,401);
 for(const content of ['', ' ', 'x'.repeat(2001)])assert.equal((await request(url,'user',{content})).status,400);
 const c=await request(url,'user',{content:'<script>plain text</script>',user_id:ids.admin});assert.equal(c.status,201);assert.equal(c.data.comment.user_id,ids.user);
 const cp=`/api/account/community/comments/${c.data.comment.comment_id}`;
 assert.equal((await request(cp,'other',{content:'forged'},'PATCH')).status,403);
 assert.equal((await request(cp,'moderator',{},'DELETE')).status,403);
 assert.equal((await request(cp,'user',{content:'Edited'},'PATCH')).status,200);
 let publicRead=await request(`/api/media/community/${id}/comments`);assert.equal(publicRead.data.comments[0].content,'Edited');
 for(let i=0;i<21;i++)await request(url,'other',{content:'Comment '+i});
 publicRead=await request(`/api/media/community/${id}/comments`);assert.equal(publicRead.data.comments.length,20);assert.equal(publicRead.data.hasMore,true);assert.equal(publicRead.data.total,22);
 const next=await request(`/api/media/community/${id}/comments?after=${publicRead.data.comments.at(-1).comment_id}`);assert.equal(next.data.comments.length,2);
 assert.equal((await request(cp,'moderator',{action:'hide',reason:'Inappropriate'},'PATCH')).status,200);
 assert.equal((await request(`/api/media/community/${id}/comments`)).data.total,21);
 assert.equal((await request(cp,'user',{content:'Unhide via edit'},'PATCH')).status,403);
 assert.equal((await request('/api/media/community')).data.posts.find(p=>p.post_id===id).comment_count,21);
 const rid=await report(id);await request(`/api/account/moderation/reports/${rid}`,'moderator',{action:'hide',reason:'Review'},'PATCH');
 assert.equal((await request(`/api/media/community/${id}/comments`)).status,404);assert.equal((await request(url,'user',{content:'Hidden parent'})).status,404);
 assert.equal((await request('/api/media/community')).data.posts.some(p=>p.post_id===id),false);
 await request(`/api/account/moderation/reports/${rid}`,'moderator',{action:'unhide',reason:'Checked'},'PATCH');
 assert.equal((await request(`/api/media/community/${id}/comments`)).status,200);
});
test('reports, notifications, staff permissions, suspension and recoverable deletion',async()=>{
 const id=await post();assert.equal((await request(`/api/account/community/${id}/reports`,'user',{reason:'Spam'})).status,400);
 const rid=await report(id),url=`/api/account/moderation/reports/${rid}`;
 assert.equal((await request(`/api/account/community/${id}/reports`,'other',{reason:'Spam'})).status,409);
 const n=await request('/api/account/moderation/notifications','admin');const note=n.data.items.find(n=>n.report_id===rid);assert.ok(note);assert.ok(n.data.unread>0);
 assert.equal((await request('/api/account/moderation/reports','user')).status,403);
 for(const action of ['delete','suspend','unsuspend'])assert.equal((await request(url,'moderator',{action,reason:'Forbidden',confirmation:'A community story'},'PATCH')).status,403);
 assert.equal((await request(url,'admin',{action:'escalate',reason:'Admins cannot escalate to themselves'},'PATCH')).status,403);
 assert.equal((await request(`/api/account/admin/accounts/${ids.user}`,'moderator',{role:'admin'},'PATCH')).status,403);
 for(const action of ['review','escalate'])assert.equal((await request(url,'moderator',{action,reason:'Needs review'},'PATCH')).status,200);
 assert.equal((await request(`/api/account/moderation/reports?report_id=${rid}`,'admin')).data.items[0].status,'Escalated');
 await request(`/api/account/moderation/notifications/${note.notification_id}`,'admin',{},'PATCH');assert.ok((await pool.query('SELECT read_at FROM admin_notification WHERE notification_id=$1',[note.notification_id])).rows[0].read_at);
 assert.equal((await request(url,'admin',{action:'suspend',reason:'Repeated spam'},'PATCH')).status,200);
 assert.equal((await request('/api/account/community','user',{title:'Blocked',content:'Blocked'})).status,403);
 assert.equal((await request('/api/account/watchlists','user',{name:'Blocked'})).status,403);
 assert.equal((await request('/api/account/me','user')).data.user.suspended,true);
 assert.equal((await request('/api/account/login',null,{email:'user@example.invalid',password})).status,403);
 assert.equal((await request(url,'admin',{action:'unsuspend',reason:'Appeal accepted'},'PATCH')).status,200);
 assert.equal((await request('/api/account/watchlists','user')).status,200);
 assert.equal((await request(url,'admin',{action:'delete',reason:'Confirmed violation'},'PATCH')).status,200);
 assert.ok((await pool.query('SELECT deleted_at,content FROM community_post WHERE post_id=$1',[id])).rows[0].deleted_at);
 assert.equal((await request(`/api/media/community/${id}/comments`)).status,404);
 const queue=await request(`/api/account/moderation/reports?report_id=${rid}`,'admin');assert.equal(queue.data.items[0].status,'Resolved');assert.ok(queue.data.items[0].history.length>=5);
 assert.equal((await request(`/api/account/moderation/reports?report_id=${rid}`,'moderator')).data.items[0].content,null);
 assert.ok(!(await request('/api/media/community')).data.posts.some(p=>'reporter_id' in p));
 const id2=await post(),r2=await report(id2);await pool.query('DELETE FROM community_post WHERE post_id=$1',[id2]);assert.equal((await request(`/api/account/moderation/reports/${r2}`,'admin',{action:'resolve',reason:'Already removed'},'PATCH')).status,200);
 assert.equal((await request(`/api/account/moderation/users/${ids.admin}`,'admin',{action:'suspend',reason:'Self'},'PATCH')).status,400);
 await request(`/api/account/moderation/users/${ids.user}`,'admin',{action:'suspend',reason:'Temporary',expires_at:new Date(Date.now()+60000).toISOString()},'PATCH');
 await pool.query("UPDATE users SET suspended_until=now()-interval '1 second' WHERE user_id=$1",[ids.user]);assert.equal((await request('/api/account/watchlists','user')).status,200);
 await request(`/api/account/moderation/users/${ids.user}`,'admin',{action:'suspend',reason:'Logout check'},'PATCH');assert.equal((await request('/api/account/logout','user',{},'POST')).status,200);assert.equal((await request('/api/account/watchlists','user')).status,401);
});
test('YouTube normalization, structured metadata roundtrip and box office filtering',async()=>{
 const {youtubeId}=require('../src/utils/trailer');const vid='zSWdZVtXT7E';
 for(const input of [vid,'watch?v='+vid,`https://www.youtube.com/watch?v=${vid}&t=30`, `https://youtu.be/${vid}?si=abc`,`https://www.youtube.com/embed/${vid}`,`https://www.youtube.com/shorts/${vid}`])assert.equal(youtubeId(input),vid);
 for(const input of ['https://evil.test/watch?v='+vid,'https://youtube.com.evil.test/watch?v='+vid,'https://youtube.com@evil.test/watch?v='+vid,'ftp://youtube.com/watch?v='+vid,'https://youtube.com/anything?v='+vid,'invalid','https://youtu.be/short'])assert.equal(youtubeId(input),null);
 const body={title:'Structured title',media_type:'movie',poster:'   ',trailer_link:`https://youtu.be/${vid}`,cast:[{name:'Fixture Actor',character_name:'The lead',photo:null,display_order:2}],companies:[{name:'Fixture studio',logo:null}],awards:[{name:'Fixture awards',category:'Best film',year:2025,result:'Nominated',recipient:'Fixture Actor'}]};
 let r=await request('/api/account/admin/catalog','admin',body);assert.equal(r.status,201,JSON.stringify(r));const id=r.data.title_id;
 let metadata=(await request(`/api/account/admin/catalog/${id}/metadata`,'admin')).data;assert.equal(metadata.cast[0].character_name,'The lead');assert.equal(metadata.awards[0].result,'Nominated');
 let detail=(await request(`/api/media/${id}`)).data;assert.equal(detail.poster,null);assert.equal(detail.trailer_link,vid);assert.equal(detail.cast_crew[0].display_order,2);assert.equal(detail.production_companies[0].name,'Fixture studio');
 metadata.cast[0].character_name='Changed role';metadata.awards[0].result='Won';assert.equal((await request(`/api/account/admin/catalog/${id}`,'admin',{...body,...metadata},'PUT')).status,200);
 assert.equal((await request(`/api/media/awards/${id}`)).data.awards[0].result,'Won');
 assert.equal((await request('/api/account/admin/catalog','moderator',body)).status,403);
 for(const invalid of [{cast:[{name:''}]},{companies:[{name:'Duplicate'},{name:'Duplicate'}]},{awards:[{name:'No result'}]},{trailer_link:'https://evil.test/watch?v='+vid}])assert.equal((await request(`/api/account/admin/catalog/${id}`,'admin',{...body,...invalid},'PUT')).status,400);
 assert.equal((await request(`/api/account/admin/catalog/${id}`,'admin',{...body,cast:[],companies:[],awards:[]},'PUT')).status,200);assert.deepEqual((await request(`/api/account/admin/catalog/${id}/metadata`,'admin')).data,{cast:[],companies:[],awards:[]});
 const genre=(await pool.query("INSERT INTO genre(name) VALUES('Filter test') RETURNING genre_id")).rows[0].genre_id;
 for(let i=0;i<14;i++){const tid=(await pool.query('INSERT INTO media(title) VALUES($1) RETURNING title_id',['Rank '+i])).rows[0].title_id;await pool.query('INSERT INTO movie(title_id,box_office_gross) VALUES($1,$2)',[tid,10000-i*100]);if(i>=10)await pool.query('INSERT INTO media_genre(title_id,genre_id) VALUES($1,$2)',[tid,genre]);}
 r=await request(`/api/media/home/box-office?genre=${genre}&market=worldwide`);assert.equal(r.status,200);assert.equal(r.data.items.length,4);assert.equal(r.data.items[0].title,'Rank 10');assert.equal((await request('/api/media/home/box-office?market=domestic')).status,400);
});

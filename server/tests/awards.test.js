const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
require('../src/config/env');
const { Pool } = require('pg');
const schema = `awards_test_${process.pid}_${Date.now()}`;
const admin = new Pool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||5432),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,options:''});
process.env.PGOPTIONS = `-c search_path=${schema},public`;
const pool = require('../src/config/db');
const app = require('../src/app');
const { importAwards } = require('../src/sync/importAwards');
let server, base;
const award = {name:'Example Prize',category:'Drama',year:2020,description:'Fixture',source_name:'Wikidata',source_key:'Q1:2020',source_url:'https://www.wikidata.org/wiki/Q1'};
const fixture = {license:'CC0',retrieved_at:'2026-01-01T00:00:00Z',titles:[{title_id:999,title:'Film',media_type:'movie',tmdb_id:123,awards:[award]},{title:'Show',media_type:'series',tmdb_id:123,awards:[{...award,year:2021,source_key:'Q2:2021'}]}]};
test.before(async()=>{
  await admin.query(`CREATE SCHEMA ${schema}`);
  await pool.query(await fs.readFile(path.resolve(__dirname,'../database/schema.sql'),'utf8'));
  assert.equal((await pool.query('SELECT current_schema() AS name')).rows[0].name,schema);
  await pool.query("INSERT INTO media(title_id,tmdb_id,title) VALUES(1,123,'Film'),(2,-123,'Show'),(3,456,'Unawarded'); INSERT INTO movie(title_id) VALUES(1),(3); INSERT INTO series(title_id) VALUES(2)");
  await importAwards(fixture);
  server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  base=`http://127.0.0.1:${server.address().port}/api/media/awards`;
});
test.after(async()=>{
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();
});
async function get(query=''){const response=await fetch(base+query);return {status:response.status,body:await response.json()};}
test('public awards list supports type, text, year, award filters and pagination',async()=>{
  const all=await get(); assert.equal(all.status,200);assert.equal(all.body.total,2);
  assert.equal(all.body.summary.movies,1);assert.equal(all.body.summary.series,1);
  for(const query of ['?type=movie','?type=series','?q=show','?year=2020','?name=Example%20Prize&year=2021']) assert.equal((await get(query)).body.total,1);
  assert.equal((await get('?q=nothing')).body.total,0);
  const first=(await get('?limit=1')).body,second=(await get('?limit=1&offset=1')).body;
  assert.equal(first.hasMore,true);assert.equal(second.hasMore,false);
  assert.notEqual(first.items[0].title_id,second.items[0].title_id);
});
test('title awards retain source links, empty titles and errors are handled',async()=>{
  assert.equal((await get('/1')).body.awards[0].source_url,award.source_url);
  assert.deepEqual((await get('/3')).body.awards,[]);
  assert.equal((await get('/999')).status,404);
  for(const query of ['/abc','?type=bad','?year=no','?limit=100','?offset=-1','?q=x&q=y'])assert.equal((await get(query)).status,400);
});
test('import maps identities, is repeatable and rolls back partial failures',async()=>{
  const before=(await pool.query('SELECT award_id FROM awards ORDER BY award_id')).rows;
  await importAwards(fixture);
  assert.deepEqual((await pool.query('SELECT award_id FROM awards ORDER BY award_id')).rows,before);
  const changed=structuredClone(fixture);changed.titles[0].awards[0].name='Should roll back';changed.titles[1].tmdb_id=99999;
  await assert.rejects(importAwards(changed),/Missing or ambiguous/);
  assert.equal((await get('/1')).body.awards[0].name,award.name);
});
test('checked-in collection covers 100 movies and 100 series with dated source records',async()=>{
  const data=JSON.parse(await fs.readFile(path.resolve(__dirname,'../database/data/awards.json'),'utf8'));
  for(const type of ['movie','series'])assert.equal(new Set(data.titles.filter(t=>t.media_type===type).map(t=>Math.abs(t.tmdb_id))).size,100);
  const records=data.titles.flatMap(t=>t.awards);assert.equal(records.length,data.counts.records);
  for(const a of records){assert.match(a.source_url,/^https:\/\/www\.wikidata\.org\/w\/index.php\?title=Q\d+&oldid=\d+#/);assert.ok(a.year>=1800&&a.year<=new Date().getUTCFullYear());}
});

const fs=require('node:fs/promises');
const path=require('node:path');
const pool=require('../config/db');

async function importAwards(dataset) {
  if(dataset.license!=='CC0'||!Array.isArray(dataset.titles))throw new Error('Invalid awards dataset');
  const counts={movie:0,series:0,records:0};
  return pool.withTransaction(async client=>{
    await client.query('SELECT pg_advisory_xact_lock(216,2)');
    const seen=new Set();
    for(const title of dataset.titles) {
      if(!['movie','series'].includes(title.media_type)||!Number.isInteger(title.tmdb_id)||!title.awards?.length)throw new Error('Invalid title identity');
      const {rows}=await client.query(`SELECT m.title_id,m.title FROM media m JOIN ${title.media_type==='movie'?'movie':'series'} t USING(title_id)
        WHERE abs(m.tmdb_id::bigint)=$1`,[Math.abs(title.tmdb_id)]);
      if(rows.length!==1)throw new Error(`Missing or ambiguous catalog match for ${title.title}`);
      const id=rows[0].title_id;
      if(seen.has(id))throw new Error(`Duplicate title ${id}`);
      seen.add(id);counts[title.media_type]++;
      for(const award of title.awards) {
        if(!award.source_key||!award.name||!Number.isInteger(award.year)||award.year<1800||award.year>new Date().getUTCFullYear()||
          !/^https:\/\/www\.wikidata\.org\//.test(award.source_url))throw new Error(`Invalid award for ${title.title}`);
        await client.query(`INSERT INTO awards(title_id,name,year,category,description,source_name,source_url,source_key,retrieved_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(title_id,source_key) DO UPDATE SET
          name=EXCLUDED.name,year=EXCLUDED.year,category=EXCLUDED.category,description=EXCLUDED.description,
          source_name=EXCLUDED.source_name,source_url=EXCLUDED.source_url,retrieved_at=EXCLUDED.retrieved_at`,
        [id,award.name,award.year,award.category,award.description,award.source_name,award.source_url,award.source_key,dataset.retrieved_at]);
        counts.records++;
      }
    }
    return counts;
  });
}
if(require.main===module)(async()=>{
  const dataset=JSON.parse(await fs.readFile(path.resolve(__dirname,'../../database/data/awards.json'),'utf8'));
  if(dataset.counts.movies!==100||dataset.counts.series!==100)throw new Error('Expected 100 movies and 100 series');
  console.log('Imported awards:',await importAwards(dataset));
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());
module.exports={importAwards};

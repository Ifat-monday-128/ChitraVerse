const queries = require('./importAwards.queries');
const fs=require('node:fs/promises');
const path=require('node:path');
const pool=require('../config/db');

async function importAwards(dataset) {
  if(dataset.license!=='CC0'||!Array.isArray(dataset.titles))throw new Error('Invalid awards dataset');
  const counts={movie:0,series:0,records:0};
  return pool.withTransaction(async client=>{
    await client.query(queries.lockImport);
    const seen=new Set();
    for(const title of dataset.titles) {
      if(!['movie','series'].includes(title.media_type)||!Number.isInteger(title.tmdb_id)||!title.awards?.length)throw new Error('Invalid title identity');
      const {rows}=await client.query(queries.findCatalogTitle(title.media_type==='movie'?'movie':'series'),[Math.abs(title.tmdb_id)]);
      if(rows.length!==1)throw new Error(`Missing or ambiguous catalog match for ${title.title}`);
      const id=rows[0].title_id;
      if(seen.has(id))throw new Error(`Duplicate title ${id}`);
      seen.add(id);counts[title.media_type]++;
      for(const award of title.awards) {
        if(!award.source_key||!award.name||!Number.isInteger(award.year)||award.year<1800||award.year>new Date().getUTCFullYear()||
          !/^https:\/\/www\.wikidata\.org\//.test(award.source_url))throw new Error(`Invalid award for ${title.title}`);
        await client.query(queries.upsertAward,
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

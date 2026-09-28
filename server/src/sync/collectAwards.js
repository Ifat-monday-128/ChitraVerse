const queries = require('./collectAwards.queries');
// Wikidata structured statements are CC0. Fetch facts, never generate awards.
const fs = require('node:fs/promises');
const path = require('node:path');
const pool = require('../config/db');
const cache = path.resolve(__dirname,'../../../.local-data');
const output = path.resolve(__dirname,'../../database/data/awards.json');
const headers = { 'User-Agent': 'ChitraVerse-AwardsResearch/1.0', Accept:'application/json' };
async function json(url) {
  for(let attempt=0;attempt<3;attempt++) {
    const response=await fetch(url,{headers,signal:AbortSignal.timeout(60000)});
    if(response.ok) {const data=await response.json();if(data.error)throw new Error(data.error.info);return data;}
    if(![429,502,503,504].includes(response.status))throw new Error(`Source returned ${response.status}`);
    await new Promise(resolve=>setTimeout(resolve,2000*(attempt+1)));
  }
  throw new Error('Wikidata is unavailable. No data imported.');
}
async function entities(ids) {
  const result={};
  for(let i=0;i<ids.length;i+=50) {
    const chunk=ids.slice(i,i+50);
    const cachePath=path.join(cache,`awards-entities-${chunk[0]}.json`);
    let data;
    if(process.argv.includes('--from-cache')) {try {data=JSON.parse(await fs.readFile(cachePath,'utf8'));}catch{ /* Fetch uncached batches. */ }}
    if(!data) data=await json('https://www.wikidata.org/w/api.php?'+new URLSearchParams({action:'wbgetentities',format:'json',props:'labels|claims|info',languages:'en',ids:chunk.join('|')}));
    Object.assign(result,data.entities);
    await fs.writeFile(path.join(cache,`awards-entities-${chunk[0]}.json`),JSON.stringify(data));
    console.log(`Read source entities ${Math.min(i+50,ids.length)}/${ids.length}`);
  }
  return result;
}
function awardFields(label) {
  const forIndex=label.indexOf(' for ');
  return forIndex>0 ? {name:label.slice(0,forIndex),category:label.slice(forIndex+5)} : {name:label,category:label};
}
async function main() {
  await fs.mkdir(cache,{recursive:true});
  const catalog=(await pool.query(queries.catalogTitles)).rows;
  const today=new Date().toISOString().slice(0,10), selected=[];
  for(const [type,property,file] of [['movie','P4947','movie'],['series','P4983','tv']]) {
    const filePath=path.join(cache,`wikidata-${file}-awards.json`);
    let data;
    if(process.argv.includes('--from-cache'))data=JSON.parse(await fs.readFile(filePath,'utf8'));
    else {
      const query=queries.wikidataAwards(property);
      data=await json('https://query.wikidata.org/sparql?'+new URLSearchParams({query,format:'json'}));
      await fs.writeFile(filePath,JSON.stringify(data));
    }
    const local=new Map(catalog.filter(x=>x.media_type===type&&x.tmdb_id&&x.release_date<=today).map(x=>[String(Math.abs(x.tmdb_id)),x]));
    const groups=new Map();
    for(const row of data.results.bindings) {
      if(!local.has(row.tmdb.value)||!row.date||row.date.value.slice(0,10)>today)continue;
      if(!groups.has(row.tmdb.value))groups.set(row.tmdb.value,[]);
      groups.get(row.tmdb.value).push(row);
    }
    for(const [id,rows] of [...groups].sort((a,b)=>b[1].length-a[1].length||local.get(a[0]).title.localeCompare(local.get(b[0]).title)).slice(0,130))
      selected.push({...local.get(id),qid:rows[0].item.value.split('/').at(-1)});
  }
  const works=await entities([...new Set(selected.map(x=>x.qid))]);
  const awardIds=[...new Set(Object.values(works).flatMap(x=>(x.claims?.P166||[]).map(c=>c.mainsnak?.datavalue?.value?.id)).filter(Boolean))];
  const awardEntities=await entities(awardIds);
  const titles=[];
  for(const title of selected) {
    if(titles.filter(x=>x.media_type===title.media_type).length>=100)continue;
    const entity=works[title.qid], property=title.media_type==='movie'?'P4947':'P4983';
    if(!(entity.claims?.[property]||[]).some(c=>String(c.mainsnak?.datavalue?.value)===String(Math.abs(title.tmdb_id))))continue;
    const records=[];
    for(const claim of entity.claims?.P166||[]) {
      if(claim.rank==='deprecated')continue;
      const awardId=claim.mainsnak?.datavalue?.value?.id;
      const label=awardEntities[awardId]?.labels?.en?.value;
      if(!label||label.length>255)continue;
      const fields=awardFields(label);
      for(const time of claim.qualifiers?.P585||[]) {
        const value=time.datavalue?.value;
        if(!value||value.precision<9)continue;
        const year=Number(value.time.slice(1,5));
        if(year<1800||year>Number(today.slice(0,4))||value.time.slice(1,11)>today)continue;
        const sourceKey=`${claim.id}:${year}`;
        if(records.some(x=>x.source_key===sourceKey))continue;
        records.push({...fields,year,description:`${label}. Award associated with this title, as recorded in Wikidata.`,
          source_name:'Wikidata',source_key:sourceKey,
          source_url:`https://www.wikidata.org/w/index.php?title=${title.qid}&oldid=${entity.lastrevid}#${claim.id}`,
          award_entity:`https://www.wikidata.org/wiki/${awardId}`,
          references:(claim.references||[]).flatMap(r=>(r.snaks?.P854||[]).map(v=>v.datavalue?.value)).filter(v=>typeof v==='string'&&v.startsWith('https://'))});
      }
    }
    if(records.length)titles.push({...title,source_title:entity.labels?.en?.value||title.qid,awards:records});
  }
  const counts={movies:titles.filter(x=>x.media_type==='movie').length,series:titles.filter(x=>x.media_type==='series').length,records:titles.reduce((n,t)=>n+t.awards.length,0)};
  if(counts.movies!==100||counts.series!==100)throw new Error(`Insufficient sourced titles: ${JSON.stringify(counts)}. Nothing imported.`);
  await fs.mkdir(path.dirname(output),{recursive:true});
  await fs.writeFile(output,JSON.stringify({source:'Wikidata',license:'CC0',retrieved_at:new Date().toISOString(),scope:'Dated P166 award-received statements, not nominations; selected coverage, not complete awards histories.',counts,titles},null,2)+'\n');
  console.log('Collected',counts,'in',output);
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());
module.exports={awardFields};

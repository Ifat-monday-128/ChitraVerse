const router=require('express').Router();
const pool=require('../config/db');
const columns=`a.award_id,a.name,a.year,a.category,a.description,a.source_name,a.source_url,a.retrieved_at`;
router.get('/awards',async(req,res)=>{
  const {q='',type='all',name='',year=''}=req.query;
  const offset=Number(req.query.offset??0),limit=Number(req.query.limit??12);
  if(typeof q!=='string'||q.length>120||!['all','movie','series'].includes(type)||typeof name!=='string'||name.length>255||
    typeof year!=='string'||(year&&!/^\d{4}$/.test(year))||!Number.isInteger(offset)||offset<0||offset>100000||!Number.isInteger(limit)||limit<1||limit>48)
    return res.status(400).json({error:'Invalid award filters or pagination.'});
  const values=[q.trim(),type,name,year?Number(year):null];
  const where=`FROM awards a JOIN media m USING(title_id) LEFT JOIN movie mo USING(title_id) LEFT JOIN series s USING(title_id)
    WHERE (mo.title_id IS NOT NULL OR s.title_id IS NOT NULL)
    AND ($1='' OR strpos(lower(m.title||' '||COALESCE(a.name,'')||' '||COALESCE(a.category,'')),lower($1))>0)
    AND ($2='all' OR ($2='movie' AND mo.title_id IS NOT NULL) OR ($2='series' AND mo.title_id IS NULL AND s.title_id IS NOT NULL))
    AND ($3='' OR a.name=$3) AND ($4::int IS NULL OR a.year=$4)`;
  const [totals,items,summary,names,years]=await Promise.all([
    pool.query(`SELECT COUNT(DISTINCT m.title_id)::int AS total ${where}`,values),
    pool.query(`SELECT m.title_id,m.title,m.poster,CASE WHEN mo.title_id IS NOT NULL THEN 'movie' ELSE 'series' END AS media_type,
      COUNT(*)::int AS award_count, json_agg(json_build_object('award_id',a.award_id,'name',a.name,'year',a.year,'category',a.category,
      'description',a.description,'source_name',a.source_name,'source_url',a.source_url) ORDER BY a.year DESC NULLS LAST,a.name,a.award_id) AS awards
      ${where} GROUP BY m.title_id,mo.title_id ORDER BY COUNT(*) DESC,m.title,m.title_id LIMIT $5 OFFSET $6`,[...values,limit,offset]),
    pool.query(`SELECT COUNT(*)::int AS records,COUNT(DISTINCT a.title_id) FILTER(WHERE mo.title_id IS NOT NULL)::int AS movies,
      COUNT(DISTINCT a.title_id) FILTER(WHERE mo.title_id IS NULL AND s.title_id IS NOT NULL)::int AS series,MAX(a.retrieved_at) AS retrieved_at
      FROM awards a LEFT JOIN movie mo USING(title_id) LEFT JOIN series s USING(title_id)`),
    pool.query('SELECT DISTINCT name FROM awards WHERE name IS NOT NULL ORDER BY name'),
    pool.query('SELECT DISTINCT year FROM awards WHERE year IS NOT NULL ORDER BY year DESC'),
  ]);
  const total=totals.rows[0].total;
  res.json({items:items.rows,total,hasMore:offset+items.rows.length<total,summary:summary.rows[0],names:names.rows.map(x=>x.name),years:years.rows.map(x=>x.year)});
});
router.get('/awards/:titleId',async(req,res)=>{
  if(!/^[1-9]\d*$/.test(req.params.titleId)||Number(req.params.titleId)>2147483647)return res.status(400).json({error:'Invalid title ID.'});
  if(!(await pool.query('SELECT 1 FROM media WHERE title_id=$1',[req.params.titleId])).rowCount)return res.status(404).json({error:'Title not found.'});
  const {rows}=await pool.query(`SELECT ${columns} FROM awards a WHERE title_id=$1 ORDER BY year DESC NULLS LAST,name,award_id`,[req.params.titleId]);
  res.json({awards:rows});
});
module.exports=router;

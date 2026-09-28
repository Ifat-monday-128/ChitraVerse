const queries = require('./awards.queries');
const router=require('express').Router();
const pool=require('../config/db');

router.get('/awards',async(req,res)=>{
  const {q='',type='all',name='',year=''}=req.query;
  const offset=Number(req.query.offset??0),limit=Number(req.query.limit??12);
  if(typeof q!=='string'||q.length>120||!['all','movie','series'].includes(type)||typeof name!=='string'||name.length>255||
    typeof year!=='string'||(year&&!/^\d{4}$/.test(year))||!Number.isInteger(offset)||offset<0||offset>100000||!Number.isInteger(limit)||limit<1||limit>48)
    return res.status(400).json({error:'Invalid award filters or pagination.'});
  const values=[q.trim(),type,name,year?Number(year):null];

  const [totals,items,summary,names,years]=await Promise.all([
    pool.query(queries.countTitles,values),
    pool.query(queries.listTitles,[...values,limit,offset]),
    pool.query(queries.collectionSummary),
    pool.query(queries.awardNames),
    pool.query(queries.awardYears),
  ]);
  const total=totals.rows[0].total;
  res.json({items:items.rows,total,hasMore:offset+items.rows.length<total,summary:summary.rows[0],names:names.rows.map(x=>x.name),years:years.rows.map(x=>x.year)});
});
router.get('/awards/:titleId',async(req,res)=>{
  if(!/^[1-9]\d*$/.test(req.params.titleId)||Number(req.params.titleId)>2147483647)return res.status(400).json({error:'Invalid title ID.'});
  if(!(await pool.query(queries.titleExists,[req.params.titleId])).rowCount)return res.status(404).json({error:'Title not found.'});
  const {rows}=await pool.query(queries.titleAwards,[req.params.titleId]);
  res.json({awards:rows});
});
module.exports=router;

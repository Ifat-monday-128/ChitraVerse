"use client";
import { useEffect, useState } from 'react';
import { api, posterUrl } from './api';
import './awards.css';

type Award = {award_id:number;result?:string|null;recipient?:string|null;name:string;year:number|null;category:string;description:string;source_name:string|null;source_url:string|null};
type AwardTitle = {title_id:number;title:string;poster:string|null;media_type:'movie'|'series';award_count:number;awards:Award[]};
type Result = {items:AwardTitle[];total:number;hasMore:boolean;summary:{movies:number;series:number;records:number;retrieved_at:string|null};names:string[];years:number[]};
const errorMessage=(e:unknown)=>e instanceof Error?e.message:'Could not load awards. Please try again.';
function AwardRow({award}:{award:Award}) {
  const source=award.source_url?.startsWith('https://')?award.source_url:null;
  return <li className="award-record"><span className="award-year">{award.year??'Year unavailable'}</span><div><strong>{award.name}</strong><p>{[award.category,award.result,award.recipient].filter(Boolean).join(" · ")}</p>
    {source?<a href={source} target="_blank" rel="noopener noreferrer">Source: {award.source_name||'award record'} <span aria-hidden="true">↗</span></a>:<small>{award.description}</small>}</div></li>;
}
function AwardList({awards}:{awards:Award[]}) {
  return <><ul className="award-records">{awards.slice(0,3).map(a=><AwardRow key={a.award_id} award={a}/>)}</ul>
    {awards.length>3&&<details className="award-more"><summary>Show {awards.length-3} more records</summary><ul className="award-records">{awards.slice(3).map(a=><AwardRow key={a.award_id} award={a}/>)}</ul></details>}</>;
}
export default function Awards({openTitle}:{openTitle:(id:number)=>void}) {
  const [q,setQ]=useState(''),[type,setType]=useState('all'),[name,setName]=useState(''),[year,setYear]=useState('');
  const [offset,setOffset]=useState(0),[retry,setRetry]=useState(0),[data,setData]=useState<Result|null>(null);
  const [loading,setLoading]=useState(true),[error,setError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();
    const timer=setTimeout(()=>{
      setLoading(true);setError('');
      api<Result>('/api/media/awards?'+new URLSearchParams({q,type,name,year,offset:String(offset),limit:'12'}),{signal:controller.signal})
        .then(result=>{if(!controller.signal.aborted)setData(result);})
        .catch(e=>{if(!controller.signal.aborted)setError(errorMessage(e));})
        .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    },200);
    return()=>{clearTimeout(timer);controller.abort();};
  },[q,type,name,year,offset,retry]);
  function filter(setter:(s:string)=>void,value:string){setter(value);setOffset(0);}
  return <section className="awards-page" aria-labelledby="awards-heading">
    <header className="awards-intro"><div><p className="eyebrow">RECOGNITION IN CINEMA & TELEVISION</p><h1 id="awards-heading">Awards</h1><p>Explore award-winning movies and series from your ChitraVerse library.</p></div>
    </header>
    <p className="awards-source-note">Awards and nominations recorded in the library. Imported records include their source; this is not a complete awards history.{data?.summary.retrieved_at&&` Collected ${new Date(data.summary.retrieved_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}.`}</p>
    <div className="awards-filters"><label>Search<input type="search" value={q} maxLength={120} placeholder="Title, award or category" onChange={e=>filter(setQ,e.target.value)}/></label>
      <label>Title type<select value={type} onChange={e=>filter(setType,e.target.value)}><option value="all">Movies & series</option><option value="movie">Movies</option><option value="series">TV series</option></select></label>
      <label>Award<select value={name} onChange={e=>filter(setName,e.target.value)}><option value="">All awards</option>{data?.names.map(n=><option key={n} value={n}>{n}</option>)}</select></label>
      <label>Year<select value={year} onChange={e=>filter(setYear,e.target.value)}><option value="">All years</option>{data?.years.map(y=><option key={y} value={y}>{y}</option>)}</select></label>
    </div>
    {(q||type!=='all'||name||year)&&<button className="text-button" onClick={()=>{setQ('');setType('all');setName('');setYear('');setOffset(0);}}>Clear filters</button>}
    {error?<p role="alert" className="message error">{error} <button onClick={()=>setRetry(n=>n+1)}>Retry</button></p>:loading?<p role="status" className="message">Loading awards...</p>:<>
      <p role="status" className="awards-result-count">{data?.total??0} matching titles</p>
      {!data?.items.length?<div className="awards-empty"><h2>No award records found</h2><p>Try another title, award or year.</p></div>:<div className="awards-grid">{data.items.map(item=><article className="award-card" key={item.title_id}>
        <button className="award-title" onClick={()=>openTitle(item.title_id)} aria-label={`View ${item.title}`}>
          {posterUrl(item.poster)?<img src={posterUrl(item.poster,'w185')} alt="" loading="lazy"/>:<span className="award-no-poster">No poster</span>}
          <span><small>{item.media_type==='movie'?'MOVIE':'TV SERIES'}</small><h2>{item.title}</h2><span className="award-count">{item.award_count} documented {item.award_count===1?'record':'records'}</span></span>
        </button><AwardList awards={item.awards}/>
      </article>)}</div>}
      <div className="awards-pagination"><button className="secondary-button" disabled={!offset} onClick={()=>setOffset(n=>Math.max(0,n-12))}>Previous</button><span>Page {offset/12+1} of {Math.max(1,Math.ceil((data?.total??0)/12))}</span><button className="secondary-button" disabled={!data?.hasMore} onClick={()=>setOffset(n=>n+12)}>Next</button></div>
    </>}
  </section>;
}

export function TitleAwards({titleId}:{titleId:number}) {
  const [awards,setAwards]=useState<Award[]>([]),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{const controller=new AbortController();api<{awards:Award[]}>(`/api/media/awards/${titleId}`,{signal:controller.signal})
    .then(data=>{if(!controller.signal.aborted){setAwards(data.awards);setError('');}}).catch(e=>{if(!controller.signal.aborted)setError(errorMessage(e));});return()=>controller.abort();},[titleId,retry]);
  if(error)return <p className="message error" role="alert">Awards unavailable. <button onClick={()=>setRetry(n=>n+1)}>Retry</button></p>;
  if(!awards.length)return null;
  return <section className="title-awards" aria-label="Title awards"><h3>Awards</h3><p className="awards-source-note">Awards and nominations. Open a source, when provided, to see the original record.</p><AwardList awards={awards}/></section>;
}

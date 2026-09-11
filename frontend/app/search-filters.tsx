"use client";
import { useEffect, useState } from 'react';
import { api } from './api';
import AnimatedDisclosure from './animated-disclosure';

export const emptyFilters = { type:'all', genre:'', language:'', country:'', year_from:'', year_to:'', rating_min:'', rating_max:'', runtime_min:'', runtime_max:'', trailer:'', sort:'relevance' };
export type TitleFilters = typeof emptyFilters;
export const filterParams = (filters: TitleFilters) => Object.fromEntries(Object.entries(filters).filter(([key,value]) => key in emptyFilters && value !== '' && value !== emptyFilters[key as keyof TitleFilters]));
export const readFilters = (params: URLSearchParams): TitleFilters => Object.fromEntries(Object.entries(emptyFilters).map(([key,value]) => [key,params.get(key) ?? value])) as TitleFilters;
export const sortNames: Record<string,string> = { relevance:'Best match', rating_desc:'Rating: high to low', rating_asc:'Rating: low to high', newest:'Newest releases', oldest:'Oldest releases', title_asc:'Title: A–Z', title_desc:'Title: Z–A', runtime_asc:'Shortest movies', runtime_desc:'Longest movies' };
type Facets = { genres:{genre_id:number;name:string}[]; languages:string[]; countries:string[]; roles:{role_id:number;role_name:string}[] };
let cachedFacets: Promise<Facets> | null = null;
function useFacets() {
  const [data,setData] = useState<Facets | null>(null);
  const [error,setError] = useState(false);
  const [retry,setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    cachedFacets ??= api<Facets>('/api/media/filters').catch(error => { cachedFacets=null; throw error; });
    cachedFacets.then(data=>{if(active)setData(data);}).catch(()=>{if(active)setError(true);});
    return ()=>{active=false;};
  },[retry]);
  return { data,error,retry:()=>{setError(false);setRetry(value=>value+1);} };
}
function displayName(code:string,type:'language'|'region') { try { return new Intl.DisplayNames(['en'],{type}).of(code) || code; } catch { return code; } }

export function TitleFilterPanel({ value: applied, change }: { value:TitleFilters; change:(value:TitleFilters)=>void }) {
  const [value,setValue] = useState(applied);
  const {data,error,retry}=useFacets();
  const update = (key:keyof TitleFilters, next:string) => setValue({...value,[key]:next});
  const active = Object.keys(filterParams(applied)).length;
  return <AnimatedDisclosure label={<>Filters &amp; sorting{active>0 && <span className="filter-count">{active} active</span>}</>}><div className="filter-grid">
    <label>Title type<select value={value.type} onChange={event=>update('type',event.target.value)}><option value="all">Movies &amp; series</option><option value="movie">Movies</option><option value="series">TV series</option></select></label>
    <label>Genre<select value={value.genre} onChange={event=>update('genre',event.target.value)}><option value="">All genres</option>{data?.genres.map(item=><option key={item.genre_id} value={item.genre_id}>{item.name}</option>)}</select></label>
    <label>Original language<select value={value.language} onChange={event=>update('language',event.target.value)}><option value="">All languages</option>{data?.languages.map(code=><option key={code} value={code}>{displayName(code,'language')}</option>)}</select></label>
    <label>Production country<select value={value.country} onChange={event=>update('country',event.target.value)}><option value="">All countries</option>{data?.countries.map(code=><option key={code} value={code}>{displayName(code,'region')}</option>)}</select></label>
    {(['year','rating','runtime'] as const).map(group=>{ const low = {year:'year_from',rating:'rating_min',runtime:'runtime_min'}[group] as keyof TitleFilters; const high={year:'year_to',rating:'rating_max',runtime:'runtime_max'}[group] as keyof TitleFilters; return <fieldset className="filter-range" key={group}><legend>{group==='year'?'Release year':group==='rating'?'TMDB rating (0–10)':'Movie runtime (minutes)'}</legend><div><input aria-label={`Minimum ${group}`} type="number" min={group==='year'?1870:0} max={group==='year'?2200:group==='rating'?10:2000} step={group==='rating'?0.1:1} placeholder="From" value={value[low]} onChange={event=>update(low,event.target.value)} /><span>–</span><input aria-label={`Maximum ${group}`} type="number" min={group==='year'?1870:0} max={group==='year'?2200:group==='rating'?10:2000} step={group==='rating'?0.1:1} placeholder="To" value={value[high]} onChange={event=>update(high,event.target.value)} /></div></fieldset>;})}
    <label>Trailer<select value={value.trailer} onChange={event=>update('trailer',event.target.value)}><option value="">Any availability</option><option value="yes">Has a trailer</option><option value="no">No trailer</option></select></label>
    <label>Sort by<select value={value.sort} onChange={event=>update('sort',event.target.value)}>{Object.entries(sortNames).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
  </div>{error && <p role="alert">Filter options could not load. <button type="button" onClick={retry}>Retry</button></p>}<div className="filter-actions"><button className="primary-button" type="button" onClick={()=>change(value)}>Apply filters</button><button className="text-button" type="button" onClick={()=>{setValue({...emptyFilters});change({...emptyFilters});}}>Reset all filters</button></div></AnimatedDisclosure>;
}

export const emptyPeopleFilters = { role:'',photo:'',born_from:'',born_to:'',sort:'name_asc' };
export function PeopleFilterPanel({value:applied,change}:{value:typeof emptyPeopleFilters;change:(value:typeof emptyPeopleFilters)=>void}) {
  const [value,setValue]=useState(applied);
  const {data,error,retry}=useFacets();
  const update=(key:keyof typeof value,next:string)=>setValue({...value,[key]:next});
  return <AnimatedDisclosure label="Cast filters & sorting"><div className="filter-grid"><label>Role<select value={value.role} onChange={event=>update('role',event.target.value)}><option value="">All cast &amp; crew</option>{data?.roles.map(role=><option key={role.role_id} value={role.role_id}>{role.role_name}</option>)}</select></label><label>Profile photo<select value={value.photo} onChange={event=>update('photo',event.target.value)}><option value="">All profiles</option><option value="yes">With photo</option><option value="no">Without photo</option></select></label><label>Born from<input type="number" min="1800" max="2200" placeholder="Year" value={value.born_from} onChange={event=>update('born_from',event.target.value)} /></label><label>Born through<input type="number" min="1800" max="2200" placeholder="Year" value={value.born_to} onChange={event=>update('born_to',event.target.value)} /></label><label>Sort by<select value={value.sort} onChange={event=>update('sort',event.target.value)}><option value="name_asc">Name: A–Z</option><option value="name_desc">Name: Z–A</option><option value="birth_asc">Birth date: oldest first</option><option value="birth_desc">Birth date: newest first</option></select></label></div>{error && <p role="alert">Role options could not load. <button type="button" onClick={retry}>Retry</button></p>}<div className="filter-actions"><button type="button" className="primary-button" onClick={()=>change(value)}>Apply filters</button><button type="button" className="text-button" onClick={()=>{setValue({...emptyPeopleFilters});change({...emptyPeopleFilters});}}>Reset filters</button></div></AnimatedDisclosure>;
}

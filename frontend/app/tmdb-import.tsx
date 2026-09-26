"use client";
import { useEffect, useRef, useState } from 'react';
import { api } from './api';
type Result = {title_id:number;title:string;updated:boolean;people:number;seasons:number;episodes:number;genres:number;companies:number;providers:number;region:string};
export default function TmdbImport({ busy, setBusy, complete }: {busy:boolean;setBusy:(busy:boolean)=>void;complete:(result:Result)=>void}) {
  const [url,setUrl] = useState(''), [status,setStatus] = useState(''), [error,setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  async function start() {
    setBusy(true); setError(''); setStatus('Starting import…');
    const abort = new AbortController(); controller.current = abort;
    try {
      const job = await api<{job_id:string}>('/api/account/admin/catalog/import-tmdb',{method:'POST',body:JSON.stringify({url}),signal:abort.signal});
      while (!abort.signal.aborted) {
        await new Promise(resolve=>setTimeout(resolve,1500));
        const data = await api<{status:string;message:string;result?:Result}>(`/api/account/admin/catalog/import-tmdb/${job.job_id}`,{signal:abort.signal});
        setStatus(data.message);
        if (data.status==='failed') throw new Error(data.message);
        if (data.status==='complete' && data.result) { complete(data.result); break; }
      }
    } catch(e) { if(!abort.signal.aborted) {setError(e instanceof Error ? e.message : 'Import failed.');setStatus('');} }
    finally { if(!abort.signal.aborted) setBusy(false); }
  }
  return <section className="tmdb-import" aria-label="Import from TMDB">
    <h3>Add automatically from TMDB</h3><p>Paste a movie or TV-series link to import its details, genres, cast and crew, companies, trailers, and available seasons and episodes. Existing imported titles are updated.</p>
    <label>TMDB link<input type="url" value={url} maxLength={2000} placeholder="https://www.themoviedb.org/movie/157336-interstellar" disabled={busy} onChange={e=>setUrl(e.target.value)} /></label>
    <button type="button" className="primary-button" disabled={busy||!url.trim()} onClick={()=>void start()}>{busy?'Importing…':'Fetch & add from TMDB'}</button>
    {status&&<p role="status">{status}</p>}{error&&<p role="alert" className="admin-feedback error">{error}</p>}
    <small>Large casts and TV series can take several minutes. Awards and member activity are not supplied by TMDB. Streaming availability is provided by JustWatch through TMDB.</small>
    <hr/><h3>Or add manually</h3>
  </section>;
}

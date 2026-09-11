"use client";
import { useEffect, useState } from 'react';
import { api, ApiError, type Media, type Results } from './api';
import { PersonPhoto } from './person-profile';
import { TitleFilterPanel, emptyFilters, filterParams } from './search-filters';

export default function AdminHomepage({ saved }: { saved: () => void }) {
  const [selected, setSelected] = useState<Media[]>([]);
  const [query, setQuery] = useState('');
  const [filters,setFilters]=useState({...emptyFilters});
  const [results, setResults] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api<{ items: Media[] }>('/api/account/admin/homepage', { signal: controller.signal }).then(data => { setSelected(data.items); setLoading(false); }).catch(() => { if (!controller.signal.aborted) setError('Could not load homepage settings.'); });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      api<Results>(`/api/media/${query.trim() ? 'search' : ''}?${new URLSearchParams({...filterParams(filters),limit:'20',q:query.trim()})}`, { signal: controller.signal }).then(data => {if(!controller.signal.aborted)setResults(data.items);}).catch(error => { if (!controller.signal.aborted) setError(error instanceof ApiError ? error.message : 'Could not search the library.'); }).finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query,filters]);
  function move(index: number, direction: number) {
    const next = [...selected]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; setSelected(next);
  }
  async function save() {
    setBusy(true); setError('');
    try { await api('/api/account/admin/homepage', { method: 'PUT', body: JSON.stringify({ title_ids: selected.map(item => item.title_id) }) }); saved(); }
    catch (error) { setError(error instanceof ApiError ? error.message : 'Could not save homepage settings.'); }
    finally { setBusy(false); }
  }
  return <section className="homepage-editor"><p className="eyebrow">ADMIN · HOMEPAGE</p><h2>Choose the spotlight</h2><p>Feature one title or build a lineup of up to 20 movies and series. The first title opens the homepage.</p>
    {error && <p role="alert" className="error">{error}{loading && <button onClick={() => { setError(''); setRetry(value => value + 1); }}>Try again</button>}</p>}
    {loading ? <p role="status">Loading homepage settings…</p> : <fieldset disabled={busy}><legend>Featured lineup · {selected.length}/20</legend>
      {!selected.length && <p>No custom lineup selected. The homepage will use an automatic library pick.</p>}
      <ol className="feature-selection">{selected.map((item, index) => <li key={item.title_id}><div><strong>{index + 1}. {item.title}</strong><small>{item.media_type === 'series' ? 'TV series' : 'Movie'}</small></div><div className="feature-order"><button type="button" disabled={!index} aria-label={`Move ${item.title} earlier`} onClick={() => move(index, -1)}>↑</button><button type="button" disabled={index === selected.length - 1} aria-label={`Move ${item.title} later`} onClick={() => move(index, 1)}>↓</button><button type="button" onClick={() => setSelected(items => items.filter(value => value.title_id !== item.title_id))}>Remove</button></div></li>)}</ol>
      <label htmlFor="feature-search">Find movies or series</label><input id="feature-search" value={query} maxLength={120} onChange={event => setQuery(event.target.value)} placeholder="Search the library…" />
      {searching && <p role="status">Searching…</p>}
      <TitleFilterPanel key={JSON.stringify(filters)} value={filters} change={setFilters} />
      <ul className="feature-results">{results.map(item => <li key={item.title_id}><div className="feature-thumb"><PersonPhoto name={item.title} photo={item.poster} /></div><div><strong>{item.title}</strong><small>{item.media_type === 'series' ? 'TV series' : 'Movie'}</small></div><button type="button" className="secondary-button" disabled={selected.length >= 20 || selected.some(value => value.title_id === item.title_id)} onClick={() => setSelected(items => [...items, item])}>{selected.some(value => value.title_id === item.title_id) ? 'Added' : 'Add'}</button></li>)}</ul>
      {!searching && !results.length && <p>No matching titles.</p>}
      <button className="primary-button" type="button" onClick={save}>{busy ? 'Saving…' : 'Save homepage'}</button>
    </fieldset>}
  </section>;
}

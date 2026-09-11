"use client";

import { useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, posterUrl, type Company, type Media, type Results } from './api';
import { PersonPhoto } from './person-profile';
import { TitleFilterPanel, PeopleFilterPanel, emptyFilters, emptyPeopleFilters, filterParams, sortNames } from './search-filters';
import AnimatedDisclosure from './animated-disclosure';

function useDirectory<T>(path: string) {
  const [result, setResult] = useState<{ path: string; data?: T; error?: string } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api<T>(path, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setResult({ path, data });
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ path, error: error instanceof ApiError ? error.message : 'Cannot load this page. Please try again.' });
    });
    return () => controller.abort();
  }, [path, retry]);
  return { data: result?.path === path ? result.data : undefined, error: result?.path === path ? result.error : undefined,
    retry: () => { setResult(null); setRetry(value => value + 1); } };
}

function Pagination({ page, total, hasMore, change }: { page: number; total: number; hasMore: boolean; change: (page: number) => void }) {
  if (total <= 36) return null;
  return <nav className="directory-pagination" aria-label="Results pages"><button className="secondary-button" disabled={page === 0} onClick={() => change(page - 1)}>← Previous</button><span>Page {page + 1} of {Math.ceil(total / 36)}</span><button className="primary-button" disabled={!hasMore} onClick={() => change(page + 1)}>Next →</button></nav>;
}

export function CastDirectory({ query, search, openPerson }: { query: string; search: (query: string) => void; openPerson: (id: number) => void }) {
  const [input, setInput] = useState(query);
  const [lastQuery,setLastQuery]=useState(query);
  const [filters,setFilters]=useState({...emptyPeopleFilters});
  const [page, setPage] = useState(0);
  if(lastQuery!==query){setLastQuery(query);setInput(query);setPage(0);}
  const { data, error, retry } = useDirectory<{ items: { cast_crew_id: number; name: string; photo: string | null }[]; total: number; hasMore: boolean }>(`/api/media/people?${new URLSearchParams({ ...filters, q: query, limit: '36', offset: String(page * 36) })}`);
  return <section className="content-page cast-directory"><div className="directory-intro"><p className="eyebrow">THE PEOPLE BEHIND THE STORIES</p><h1>Cast &amp; crew</h1><p>Explore every face in our library. Discover their story, then dive into their movies and series.</p></div>
    <AnimatedDisclosure kind="search" label="Search cast & crew"><form className="search-form" role="search" onSubmit={event => { event.preventDefault(); search(input.trim()); }}><label htmlFor="cast-search">Find someone by name</label><div className="search-field"><input id="cast-search" type="search" maxLength={120} value={input} onChange={event => setInput(event.target.value)} placeholder="Search cast and crew…" /><button className="primary-button">Search</button>{query && <button type="button" className="secondary-button" onClick={() => search('')}>Clear</button>}</div></form>
    <PeopleFilterPanel key={JSON.stringify(filters)} value={filters} change={next=>{setFilters(next);setPage(0);}} /></AnimatedDisclosure>
    {error ? <p className="message error" role="alert">{error}<button onClick={retry}>Try again</button></p> : !data ? <p className="message" role="status">Loading cast and crew…</p> : <>
      <p className="result-count" role="status">{data.total.toLocaleString()} people{query ? ` matching “${query}”` : ' in our library'}</p>
      <ul className="cast-grid" key={page}>{data.items.map((person, index) => <li key={person.cast_crew_id} style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}><button className="cast-card" onClick={() => openPerson(person.cast_crew_id)}><div className="cast-photo"><PersonPhoto name={person.name || 'Unknown person'} photo={person.photo} /></div><strong>{person.name || 'Unknown person'}</strong><span>Explore profile →</span></button></li>)}</ul>
      {!data.items.length && <p className="message">No people found. Try another name.</p>}
      <Pagination page={page} total={data.total} hasMore={data.hasMore} change={value => { setPage(value); window.scrollTo({ top: 0 }); }} />
    </>}
  </section>;
}

export function CompanyLogo({ company }: { company: Company }) {
  const [failed, setFailed] = useState(false);
  const src = posterUrl(company.logo);
  if (!src || failed) return <span className="company-monogram" aria-label={`${company.name} logo unavailable`}>{company.name.split(' ').map(word => word[0]).slice(0, 2).join('')}</span>;
  // Company logos use the existing TMDB image source.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={`${company.name} logo`} loading="lazy" onError={() => setFailed(true)} />;
}

export function ProductionCredits({ companies, openCompany }: { companies: Company[]; openCompany: (id: number) => void }) {
  return <section className="production-section" aria-label="Production companies"><p className="eyebrow">BEHIND THE PICTURE</p><h3>The studios that made it happen</h3><p className="production-caption">Discover more stories from the production houses behind this title.</p><div className="production-grid">{companies.map((company, index) => <button className="production-card" key={company.company_id} onClick={() => openCompany(company.company_id)} style={{ animationDelay: `${Math.min(index, 8) * 55}ms` }}><div className="company-logo"><CompanyLogo company={company} /></div><div><strong>{company.name}</strong><small>{company.country || 'Production house'}</small></div><span className="production-link">Explore titles <b aria-hidden="true">↗</b></span></button>)}</div></section>;
}

export function ProductionProfile({ id, renderItems }: { id: number; renderItems: (items: Media[]) => ReactNode }) {
  const [page, setPage] = useState(0);
  const [filters,setFilters]=useState({...emptyFilters,sort:'newest'});
  const [query,setQuery]=useState('');
  const { data, error, retry } = useDirectory<Results & { company: Company }>(`/api/media/companies/${id}?${new URLSearchParams({...filterParams(filters),q:query,limit:'36',offset:String(page*36)})}`);
  return <div className="production-profile">{data && <section className="studio-hero"><div className="company-logo"><CompanyLogo key={id} company={data.company} /></div><div><p className="eyebrow">PRODUCTION HOUSE</p><h1>{data.company.name}</h1><p>{data.company.country || 'Cinema without borders'} · Explore the studio’s collection in ChitraVerse.</p></div></section>}
    <div className="section-heading"><div><p>THE STUDIO COLLECTION</p><h2>Movies &amp; series</h2></div></div>
    <label className="collection-search">Search this studio<input type="search" value={query} maxLength={120} onChange={event=>{setQuery(event.target.value);setPage(0);}} placeholder="Title or cast member…" /></label>
    <TitleFilterPanel key={JSON.stringify(filters)} value={filters} change={next=>{setFilters(next);setPage(0);}} />
    {error ? <p className="message error" role="alert">{error}<button onClick={retry}>Try again</button></p> : !data ? <p role="status">Loading production house…</p> : <>
    <p className="result-count" role="status">{data.total} {data.total === 1 ? 'title' : 'titles'} in our library · {sortNames[filters.sort]}</p>
    {data.items.length ? renderItems(data.items) : <p className="message">No titles in this category are linked to this production house yet.</p>}
    <Pagination page={page} total={data.total} hasMore={data.hasMore} change={value => { setPage(value); window.scrollTo({ top: 0 }); }} />
    </>}
  </div>;
}

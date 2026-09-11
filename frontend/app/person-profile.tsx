"use client";

import { useEffect, useState } from "react";
import { api, posterUrl, type Person } from "./api";
import AnimatedDisclosure from './animated-disclosure';

export function PersonPhoto({ name, photo }: { name: string; photo: string | null }) {
  const [failed, setFailed] = useState(false);
  const src = posterUrl(photo, "w500");
  if (!src || failed) return <div className="person-placeholder" role="img" aria-label={`Photo unavailable for ${name}`}><span>{name.split(" ").map(part => part[0]).slice(0, 2).join("")}</span><small>Photo unavailable</small></div>;
  // TMDB serves sized portraits directly.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={name} loading="lazy" onError={() => setFailed(true)} />;
}

const dateLabel = (date: string | null) => date ? new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date.slice(0, 10)}T00:00:00Z`)) : "Not available";

export default function PersonProfile({ id, openTitle }: { id: number; openTitle: (id: number) => void }) {
  const [person, setPerson] = useState<Person | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [filter, setFilter] = useState("all");
  const [filmFilters,setFilmFilters]=useState({q:'',year_from:'',year_to:'',rating_min:'',sort:'newest',role:''});
  useEffect(() => {
    const controller = new AbortController();
    api<Person>(`/api/media/people/${id}`, { signal: controller.signal }).then(setPerson).catch(() => {
      if (!controller.signal.aborted) setError("This profile could not be loaded. Please try again.");
    });
    return () => controller.abort();
  }, [id, retry]);
  if (error) return <div className="message error" role="alert">{error}<button onClick={() => { setError(""); setRetry(value => value + 1); }}>Try again</button></div>;
  if (!person) return <p className="message" role="status">Loading person and filmography…</p>;
  const roles=[...new Set(person.filmography.flatMap(item=>item.roles.map(role=>role.split(' · ')[0])))].sort();
  const films = person.filmography.filter(item => {
    const year=item.release_date?.slice(0,4);
    return (filter==='all'||item.media_type===filter)
      && (!filmFilters.q||item.title.toLowerCase().includes(filmFilters.q.trim().toLowerCase()))
      && (!filmFilters.year_from || (!!year && Number(year)>=Number(filmFilters.year_from)))
      && (!filmFilters.year_to || (!!year && Number(year)<=Number(filmFilters.year_to)))
      && (!filmFilters.rating_min || (item.tmdb_rating!=null && Number(item.tmdb_rating)>=Number(filmFilters.rating_min)))
      && (!filmFilters.role || item.roles.some(role=>role.split(' · ')[0]===filmFilters.role));
  }).sort((a,b)=>{
    if(filmFilters.sort==='title_asc')return a.title.localeCompare(b.title);
    if(filmFilters.sort==='rating_desc')return (b.tmdb_rating==null?-1:Number(b.tmdb_rating))-(a.tmdb_rating==null?-1:Number(a.tmdb_rating)) || a.title.localeCompare(b.title);
    if(!a.release_date)return b.release_date?1:a.title.localeCompare(b.title);
    if(!b.release_date)return -1;
    return (filmFilters.sort==='oldest'?a.release_date.localeCompare(b.release_date):b.release_date.localeCompare(a.release_date)) || a.title.localeCompare(b.title);
  });
  return <div className="person-profile">
    <section className="person-hero"><div className="person-portrait"><PersonPhoto name={person.name} photo={person.photo} /></div>
      <div><p className="eyebrow">CAST &amp; CREW SPOTLIGHT</p><h1 tabIndex={-1}>{person.name}</h1>
        <dl className="person-facts"><div><dt>Date of birth</dt><dd>{dateLabel(person.date_of_birth)}</dd></div>
          <div><dt>{person.deathday ? "Age at death" : "Age"}</dt><dd>{person.age === null ? "Not available" : `${person.age} years`}</dd></div>
          {person.deathday && <div><dt>Died</dt><dd>{dateLabel(person.deathday)}</dd></div>}
          {person.place_of_birth && <div><dt>Place of birth</dt><dd>{person.place_of_birth}</dd></div>}</dl>
        <h2>Biography</h2><p className="person-biography">{person.biography || "A biography is not available for this person yet."}</p>
      </div>
    </section>
    <section className="filmography"><div className="section-heading"><div><p>ON SCREEN &amp; BEHIND THE SCENES</p><h2>Filmography</h2></div>
      </div>
      <AnimatedDisclosure label="Filmography filters"><div className="filter-grid">
        <label>Title type<select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">Movies &amp; series</option><option value="movie">Movies</option><option value="series">Series</option></select></label>
        <label>Search titles<input type="search" maxLength={120} value={filmFilters.q} onChange={event=>setFilmFilters({...filmFilters,q:event.target.value})} placeholder="Movie or series name…" /></label>
        <label>Release year from<input type="number" min="1870" max="2200" value={filmFilters.year_from} onChange={event=>setFilmFilters({...filmFilters,year_from:event.target.value})} /></label>
        <label>Release year through<input type="number" min="1870" max="2200" value={filmFilters.year_to} onChange={event=>setFilmFilters({...filmFilters,year_to:event.target.value})} /></label>
        <label>Minimum TMDB rating<input type="number" min="0" max="10" step="0.1" value={filmFilters.rating_min} onChange={event=>setFilmFilters({...filmFilters,rating_min:event.target.value})} /></label>
        <label>Credit role<select value={filmFilters.role} onChange={event=>setFilmFilters({...filmFilters,role:event.target.value})}><option value="">All roles</option>{roles.map(role=><option key={role}>{role}</option>)}</select></label>
        <label>Sort by<select value={filmFilters.sort} onChange={event=>setFilmFilters({...filmFilters,sort:event.target.value})}><option value="newest">Newest releases</option><option value="oldest">Oldest releases</option><option value="rating_desc">Highest rated</option><option value="title_asc">Title: A–Z</option></select></label>
      </div><button type="button" className="text-button" onClick={()=>{setFilter('all');setFilmFilters({q:'',year_from:'',year_to:'',rating_min:'',sort:'newest',role:''});}}>Reset filters</button></AnimatedDisclosure>
      <p className="result-count">{films.length} matching titles in our local library</p>
      <div className="filmography-grid" key={filter}>{films.map((film, index) => <article className="film-card" key={`${film.media_type}-${film.tmdb_id ?? film.title_id}`} style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}>
        <button onClick={() => openTitle(film.title_id)} aria-label={`Open ${film.title}`}><div className="film-poster"><PersonPhoto name={film.title} photo={film.poster} /></div><strong>{film.title}</strong></button>
        <p>{film.media_type === "series" ? "TV series" : "Movie"} · {film.release_date?.slice(0, 4) || "Date TBA"}</p><small>{film.roles.join(" · ")}</small>
      </article>)}</div>
      {!films.length && <p className="message">No {filter === "all" ? "film or television" : filter} credits available.</p>}
    </section>
  </div>;
}

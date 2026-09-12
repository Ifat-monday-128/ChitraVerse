"use client";

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { api, type Media } from './api';
import { PersonPhoto } from './person-profile';
import './home-discovery.css';
import PopularInterests from './popular-interests';

type BoxMovie = Media & { box_office_gross: string; budget: string | null };
type Birthday = { cast_crew_id: number; name: string; photo: string | null; date_of_birth: string; roles: string[] };
type Birthdays = { date: string; items: Birthday[] };
const money = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 }).format(amount);
const fullMoney = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
const localDate = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

function BoxOffice({ openTitle }: { openTitle: (id: number) => void }) {
  const [items, setItems] = useState<BoxMovie[] | null>(null);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api<{ items: BoxMovie[] }>('/api/media/home/box-office', { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) { setItems(data.items); setSelected(0); setError(false); } })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [retry]);
  const movie = items?.[selected];
  const total = items?.reduce((sum, item) => sum + Number(item.box_office_gross), 0) || 0;
  const revenue = Number(movie?.box_office_gross || 0);
  const share = total ? revenue / total * 100 : 0;
  return <section className="discovery-section box-office-section" aria-labelledby="box-office-heading">
    <div className="discovery-heading"><div><p className="eyebrow">THE BIG PICTURE</p><h2 id="box-office-heading">Box office <span>heavyweights.</span></h2><p>Worldwide lifetime grosses · US dollars · Top 10 in your library</p></div><span className="discovery-tag">WORLDWIDE</span></div>
    {error ? <div className="discovery-message" role="alert">Box-office figures couldn’t be loaded. <button onClick={() => { setError(false); setRetry(value => value + 1); }}>Try again</button></div>
      : !items ? <div className="discovery-loading" role="status">Loading the box office…<div /><div /><div /></div>
      : !movie ? <p className="discovery-message">No box-office figures are available in the library yet.</p>
      : <div className="box-office-layout">
        <article className="box-office-spotlight" aria-label="Selected movie">
          <div className="box-office-film" key={movie.title_id}>
            <button className="box-office-poster" onClick={() => openTitle(movie.title_id)} aria-label={`Open ${movie.title}`}><PersonPhoto name={movie.title} photo={movie.poster} /></button>
            <div className="box-office-film-copy"><span className="box-office-rank">NO. {String(selected + 1).padStart(2, '0')} IN THE TOP 10</span><h3><button onClick={() => openTitle(movie.title_id)}>{movie.title}</button></h3><p>{movie.release_date?.slice(0, 4)}{movie.runtime ? ` · ${Math.floor(movie.runtime / 60)}h ${movie.runtime % 60}m` : ''}</p>{movie.tmdb_rating != null && <span className="box-office-rating">★ {movie.tmdb_rating} <small>TMDB</small></span>}</div>
          </div>
          <div className="box-office-earnings"><span>Worldwide gross</span><strong title={fullMoney(revenue)}>{money(revenue)}</strong><span>{fullMoney(revenue)}</span></div>
          <div className="box-office-share"><div className="box-office-donut" style={{ '--share': `${share}%` } as CSSProperties} aria-hidden="true"><strong>{share.toFixed(1)}<small>%</small></strong></div><div><strong>Share of this top 10</strong><p>{share.toFixed(1)}% of {money(total)} combined revenue</p></div></div>
          {movie.description && <p className="box-office-synopsis">{movie.description}</p>}
          <button className="box-office-details" onClick={() => openTitle(movie.title_id)}>Explore movie <span aria-hidden="true">↗</span></button>
        </article>
        <div className="box-office-chart"><div className="box-office-chart-heading"><span>THE REVENUE RANKING</span><span>Select a movie to explore</span></div>
          <ol>{items.map((item, index) => <li key={item.title_id}><button className={`box-office-row ${selected === index ? 'is-selected' : ''}`} onClick={() => setSelected(index)} aria-pressed={selected === index} aria-label={`${index + 1}. ${item.title}, ${fullMoney(Number(item.box_office_gross))} worldwide gross`}>
            <span className="chart-rank">{String(index + 1).padStart(2, '0')}</span><span className="chart-content"><span className="chart-label"><strong>{item.title}</strong><span>{money(Number(item.box_office_gross))}</span></span><span className="chart-track" aria-hidden="true"><span style={{ width: `${Number(item.box_office_gross) / Number(items[0].box_office_gross) * 100}%` }} /></span></span>
          </button></li>)}</ol><p className="box-office-footnote">Lifetime totals from the library’s TMDB records. Figures are not a live weekend chart.</p></div>
      </div>}
  </section>;
}

function BornToday({ openPerson }: { openPerson: (id: number) => void }) {
  const [date, setDate] = useState('');
  const [data, setData] = useState<Birthdays | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const rail = useRef<HTMLUListElement>(null);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });
  useEffect(() => {
    const update = () => setDate(localDate());
    update();
    const timer = setInterval(update, 60000);
    document.addEventListener('visibilitychange', update);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, []);
  useEffect(() => {
    if (!date) return;
    const controller = new AbortController();
    api<Birthdays>(`/api/media/home/birthdays?date=${date}`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) { setData(result); setError(false); } })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [date, retry]);
  useEffect(() => {
    const element = rail.current;
    if (!element) return;
    const update = () => setCanScroll({ left: element.scrollLeft > 2, right: element.scrollLeft + element.clientWidth < element.scrollWidth - 2 });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    element.addEventListener('scroll', update, { passive: true });
    return () => { observer.disconnect(); element.removeEventListener('scroll', update); };
  }, [data, date, error]);
  function scroll(direction: number) {
    const element = rail.current;
    if (element) element.scrollBy({ left: direction * element.clientWidth * 0.8, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  const dateLabel = date ? new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`)) : '';
  const current = data?.date === date ? data : null;
  return <section className="discovery-section birthday-section" aria-labelledby="birthday-heading">
    <div className="discovery-heading"><div><p className="eyebrow">A LITTLE SPOTLIGHT</p><h2 id="birthday-heading">Born <span>today.</span></h2><p>{dateLabel ? `Celebrating the people behind the screen · ${dateLabel}` : 'Celebrating the people behind the screen'}</p></div><div className="birthday-controls"><button aria-label="Previous birthday portraits" aria-controls="birthday-rail" disabled={!canScroll.left} onClick={() => scroll(-1)}>←</button><button aria-label="Next birthday portraits" aria-controls="birthday-rail" disabled={!canScroll.right} onClick={() => scroll(1)}>→</button></div></div>
    {error ? <div className="discovery-message" role="alert">Today’s birthdays couldn’t be loaded. <button onClick={() => { setError(false); setRetry(value => value + 1); }}>Try again</button></div>
      : !current ? <p className="discovery-message" role="status">Finding today’s birthdays…</p>
      : !current.items.length ? <p className="discovery-message">No birthdays recorded for {dateLabel} in your library. Check back tomorrow.</p>
      : <ul className="birthday-rail" id="birthday-rail" ref={rail}>{current.items.map(person => <li key={person.cast_crew_id}><button className="birthday-card" onClick={() => openPerson(person.cast_crew_id)} aria-label={`View ${person.name}, born ${person.date_of_birth.slice(0, 4)}`}><span className="birthday-portrait"><PersonPhoto name={person.name} photo={person.photo} /><span className="birthday-profile-arrow" aria-hidden="true">↗</span></span><strong>{person.name}</strong><span className="birthday-role">{person.roles.join(' · ') || 'Cast & crew'}</span><small>Born {person.date_of_birth.slice(0, 4)}</small></button></li>)}</ul>}
  </section>;
}

export default function HomeDiscovery({ openTitle, openPerson, openGenre }: { openTitle: (id: number) => void; openPerson: (id: number) => void; openGenre: (id: number) => void }) {
  return <div className="home-discovery"><PopularInterests openGenre={openGenre} /><BoxOffice openTitle={openTitle} /><BornToday openPerson={openPerson} /></div>;
}

"use client";

import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { PersonPhoto } from './person-profile';

type Interest = { genre_id: number; name: string; title_count: number; artwork: { title: string; poster: string }[] };

export default function PopularInterests({ openGenre }: { openGenre: (id: number) => void }) {
  const [items, setItems] = useState<Interest[] | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const rail = useRef<HTMLUListElement>(null);
  const [scrollable, setScrollable] = useState({ left: false, right: false });
  useEffect(() => {
    const controller = new AbortController();
    api<{ items: Interest[] }>('/api/media/home/interests', { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) { setItems(data.items); setError(false); } })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    const element = rail.current;
    if (!element) return;
    const update = () => setScrollable({ left: element.scrollLeft > 2, right: element.scrollLeft + element.clientWidth < element.scrollWidth - 2 });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    element.addEventListener('scroll', update, { passive: true });
    return () => { observer.disconnect(); element.removeEventListener('scroll', update); };
  }, [items, error]);
  function scroll(direction: number) {
    const element = rail.current;
    if (element) element.scrollBy({ left: direction * element.clientWidth * .85, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }

  return <section className="discovery-section interests-section" aria-labelledby="interests-heading">
    <div className="discovery-heading"><div><p className="eyebrow">FIND YOUR KIND OF STORY</p><h2 id="interests-heading">Popular <span>interests</span></h2><p>Explore your library by genre · Largest collections first</p></div><div className="birthday-controls"><button aria-label="Previous genres" aria-controls="interests-rail" disabled={!scrollable.left} onClick={() => scroll(-1)}>←</button><button aria-label="Next genres" aria-controls="interests-rail" disabled={!scrollable.right} onClick={() => scroll(1)}>→</button></div></div>
    {error ? <div className="discovery-message" role="alert">Genres couldn’t be loaded. <button onClick={() => { setError(false); setRetry(value => value + 1); }}>Try again</button></div>
      : !items ? <p className="discovery-message" role="status">Finding your next interest…</p>
      : !items.length ? <p className="discovery-message">No genres with movies or series are available yet.</p>
      : <ul className="interests-rail" id="interests-rail" ref={rail}>{items.map(item => <li key={item.genre_id}><button className="interest-card" onClick={() => openGenre(item.genre_id)} aria-label={`Explore ${item.name}, ${item.title_count} ${item.title_count === 1 ? 'title' : 'titles'}`}>
        <span className={`interest-artwork ${item.artwork.length ? '' : 'interest-no-artwork'}`} aria-hidden="true">{item.artwork.length ? item.artwork.map((art, index) => <span className="interest-poster" key={`${art.poster}-${index}`}><PersonPhoto name={art.title} photo={art.poster} /></span>) : <span className="interest-initial">{item.name.slice(0, 1)}</span>}<span className="interest-explore">↗</span></span>
        <span className="interest-caption"><strong>{item.name}</strong><small>{item.title_count.toLocaleString('en-US')} {item.title_count === 1 ? 'title' : 'titles'}</small></span>
      </button></li>)}</ul>}
  </section>;
}

"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { api, posterUrl, type Results, type Media } from './api';
import './auth-posters.css';

function Poster({ movie, index, discard }: { movie: Media; index: number; discard: (id: number) => void }) {
  const [loaded, setLoaded] = useState(false);
  const src = posterUrl(movie.poster, 'w342');
  if (!src) return null;
  return <div className={`auth-poster-slot auth-poster-slot-${index} ${loaded ? 'is-loaded' : ''}`} style={{ '--entrance-delay': `${index * .19}s`, '--drift-delay': `${-index * 1.8}s` } as CSSProperties}>
    <div className="auth-poster-enter"><div className="auth-poster-float"><div className="auth-poster-print">
      {/* Stored poster URLs point to TMDB's sized artwork. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" decoding="async" draggable={false} onLoad={() => setLoaded(true)} onError={() => discard(movie.title_id)} />
      <span className="auth-poster-reflection" /><span className="auth-poster-edge" />
      <div className="auth-poster-title"><span>FROM YOUR LIBRARY</span><strong>{movie.title}</strong></div>
    </div></div></div>
  </div>;
}

export default function AuthPosters() {
  const [movies, setMovies] = useState<Media[]>([]);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [inactive, setInactive] = useState(false);
  const scene = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    api<Results>('/api/media/?type=movie&collection=hollywood&sort=rating_desc&limit=36', { signal: controller.signal })
      .then(data => {
        if (controller.signal.aborted) return;
        const seen = new Set<string>();
        const posters = data.items.filter(movie => {
          const src = posterUrl(movie.poster);
          if (!src || seen.has(src)) return false;
          seen.add(src); return true;
        });
        setMovies(posters); setError(false);
      }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    const element = scene.current;
    if (!element) return;
    let visible = true;
    const update = () => setInactive(document.hidden || !visible);
    const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; update(); });
    observer.observe(element);
    document.addEventListener('visibilitychange', update);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update); };
  }, []);
  function move(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse') return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--poster-rotate-y', `${((event.clientX - rect.left) / rect.width - .5) * 5}deg`);
    event.currentTarget.style.setProperty('--poster-rotate-x', `${-((event.clientY - rect.top) / rect.height - .5) * 4}deg`);
  }
  function reset() {
    scene.current?.style.setProperty('--poster-rotate-y', '0deg');
    scene.current?.style.setProperty('--poster-rotate-x', '0deg');
  }
  return <section className={`auth-poster-scene ${inactive ? 'is-paused' : ''}`} aria-label="Hollywood movie posters from the ChitraVerse library">
    <div ref={scene} className="auth-poster-viewport" onPointerMove={move} onPointerLeave={reset}>
      <div className="auth-poster-halo" aria-hidden="true" /><div className="auth-poster-beam" aria-hidden="true" />
      <div className="auth-poster-depth" aria-hidden="true">{movies.slice(0, 7).map((movie, index) => <Poster key={movie.title_id} movie={movie} index={index} discard={id => setMovies(current => current.filter(item => item.title_id !== id))} />)}</div>
      <div className="auth-poster-dust" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} style={{ left: `${8 + index * 7.3}%`, top: `${16 + index * 31 % 70}%`, animationDelay: `${-index * 1.4}s` }} />)}</div>
      {error && <p className="auth-poster-error">Movie artwork couldn’t load. <button type="button" onClick={() => { setError(false); setRetry(value => value + 1); }}>Retry</button></p>}
    </div>
  </section>;
}

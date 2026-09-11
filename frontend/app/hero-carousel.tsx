"use client";

import { useEffect, useState } from 'react';
import { posterUrl, type Media } from './api';

export function HeroBackdrop({ url }: { url: string | undefined }) {
  const [layers, setLayers] = useState<{ current?: string; previous?: string }>({ current: url });
  if (layers.current !== url) setLayers({ current: url, previous: layers.current });
  return <div className="hero-backdrops" aria-hidden="true">
    {layers.previous && <div className="hero-backdrop" style={{ backgroundImage: `url("${layers.previous}")` }} />}
    {layers.current && <div key={layers.current} className="hero-backdrop hero-backdrop-enter" style={{ backgroundImage: `url("${layers.current}")` }} />}
  </div>;
}

export function HeroCarousel({ items, currentId, select, paused }: { items: Media[]; currentId: number; select: (item: Media) => void; paused: boolean }) {
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [reset, setReset] = useState(0);
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotion = () => setReducedMotion(preference.matches);
    const syncVisibility = () => setVisible(!document.hidden);
    syncMotion(); syncVisibility();
    preference.addEventListener('change', syncMotion);
    document.addEventListener('visibilitychange', syncVisibility);
    return () => { preference.removeEventListener('change', syncMotion); document.removeEventListener('visibilitychange', syncVisibility); };
  }, []);
  useEffect(() => {
    const index = items.findIndex(item => item.title_id === currentId);
    const next = items[(index + 1) % items.length];
    const src = next ? posterUrl(next.poster, 'original') : undefined;
    if (src) { const image = new window.Image(); image.src = src; }
  }, [currentId, items]);
  const rotating = playing && visible && !reducedMotion && !paused && !hovered && items.length > 1;
  useEffect(() => {
    if (!rotating) return;
    const timer = window.setTimeout(() => {
      const index = items.findIndex(item => item.title_id === currentId);
      select(items[(index + 1) % items.length]);
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [rotating, currentId, items, select, reset]);
  return <div className="hero-carousel-controls" aria-label="Featured slideshow" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
    <div className="hero-dots" role="group" aria-label="Choose a featured title">{items.map((item, index) => <button
      key={item.title_id} className={`hero-dot ${currentId === item.title_id ? 'active' : ''}`}
      aria-label={`Show feature ${index + 1}: ${item.title}`} aria-pressed={currentId === item.title_id}
      onClick={() => { select(item); setReset(value => value + 1); }}><span /></button>)}</div>
    {!reducedMotion && <button className="hero-rotation-toggle" aria-label={playing ? 'Pause featured slideshow' : 'Play featured slideshow'} onClick={() => setPlaying(value => !value)}>{playing ? 'Ⅱ' : '▶'}</button>}
  </div>;
}

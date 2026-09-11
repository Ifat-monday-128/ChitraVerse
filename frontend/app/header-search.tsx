"use client";

import { useEffect, useRef } from 'react';

export default function HeaderSearch({ active, query, open, close, change, submit }: {
  active: boolean; query: string; open: () => void; close: () => void;
  change: (query: string) => void; submit: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => input.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [active]);
  function collapse() {
    close();
    requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
  }
  return <div className={`header-search ${active ? 'is-open' : ''}`}>
    <button ref={trigger} className="header-search-icon" type="button" aria-label={active ? 'Focus search' : 'Search the library'}
      aria-expanded={active} aria-controls="header-search-form" onClick={() => active ? input.current?.focus() : open()}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
    </button>
    <form id="header-search-form" role="search" aria-label="Search the library" inert={!active} aria-hidden={!active}
      onSubmit={event => { event.preventDefault(); submit(); }} onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); collapse(); }
      }}>
      <input ref={input} type="search" aria-label="Search titles or actors" placeholder="Search movies, series, actors…"
        maxLength={120} value={query} onChange={event => change(event.target.value)} />
      <button className="header-search-submit" type="submit" aria-label="Submit search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></button>
      <button className="header-search-close" type="button" aria-label="Close search and return home" onClick={collapse}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m7 7 10 10M7 17 17 7" /></svg></button>
    </form>
  </div>;
}

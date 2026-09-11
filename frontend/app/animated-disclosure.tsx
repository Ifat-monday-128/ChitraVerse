"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export default function AnimatedDisclosure({ label, children, kind = 'filters' }: { label: ReactNode; children: ReactNode; kind?: 'filters' | 'search' }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || kind !== 'search') return;
    const frame = requestAnimationFrame(() => content.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [open, kind]);
  return <div className={`animated-disclosure ${kind === 'search' ? 'search-disclosure' : 'advanced-filters'} ${open ? 'is-open' : ''}`} onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); button.current?.focus(); }
  }}>
    <button ref={button} type="button" className="disclosure-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      <span className={kind === 'search' ? 'disclosure-search-icon' : 'disclosure-filter-icon'} aria-hidden="true"><i /><i /><i /></span>
      <span className="disclosure-label">{label}</span><span className="disclosure-chevron" aria-hidden="true" />
    </button>
    <div className="disclosure-reveal" inert={!open} aria-hidden={!open} id={id}>
      <div className="disclosure-clip"><div ref={content} className="disclosure-content">{children}</div></div>
    </div>
  </div>;
}

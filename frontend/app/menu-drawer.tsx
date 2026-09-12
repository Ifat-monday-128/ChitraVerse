"use client";

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import BrandWordmark from './brand-wordmark';
import './menu-drawer.css';

export type MenuItem = { label: string; icon: string; active?: boolean; action: () => void };
type Props = { close: () => void; home: () => void; items: MenuItem[]; library: MenuItem[]; admin: boolean };

export default function MenuDrawer({ close, home, items, library, admin }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [closing, setClosing] = useState(false);
  const exiting = useRef(false);
  const finished = useRef(false);
  const action = useRef<(() => void) | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const element = dialog.current;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = 'hidden';
    return () => { clearTimeout(timer.current); element?.close(); document.body.style.overflow = overflow; };
  }, []);
  function finish() {
    if (finished.current) return;
    finished.current = true;
    clearTimeout(timer.current);
    dialog.current?.close();
    close();
    action.current?.();
  }
  function dismiss(next?: () => void) {
    if (exiting.current) return;
    exiting.current = true;
    action.current = next;
    setClosing(true);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) finish();
    else timer.current = setTimeout(finish, 420);
  }
  function links(entries: MenuItem[], offset = 0) {
    return entries.map((item, index) => <button key={item.label} type="button" className={`drawer-link ${item.active ? 'is-active' : ''}`} aria-current={item.active ? 'page' : undefined} disabled={closing} onClick={() => dismiss(item.action)} style={{ '--item-delay': `${90 + (index + offset) * 35}ms` } as CSSProperties}><span className={`drawer-icon drawer-icon-${item.icon}`} aria-hidden="true" /><span>{item.label}</span><span className="drawer-link-arrow" aria-hidden="true">›</span></button>);
  }
  return <dialog id="navigation-drawer" ref={dialog} className="menu-drawer" data-closing={closing} aria-label="Main navigation" onCancel={event => { event.preventDefault(); dismiss(); }} onClick={event => { if (event.target === event.currentTarget) dismiss(); }}>
    <aside className="menu-drawer-panel" onAnimationEnd={event => { if (event.target === event.currentTarget && event.animationName === 'drawer-slide-out') finish(); }}>
      <header className="drawer-header"><button className="drawer-brand" type="button" onClick={() => dismiss(home)} aria-label="ChitraVerse home"><BrandWordmark /></button><button className="drawer-close" type="button" onClick={() => dismiss()} aria-label="Close menu">×</button></header>
      <nav className="drawer-navigation" aria-label="Site navigation"><p className="drawer-group-label">MENU</p><div className="drawer-links">{links(items)}</div><p className="drawer-group-label">{admin ? 'ADMINISTRATION' : 'YOUR LIBRARY'}</p><div className="drawer-links">{links(library, items.length)}</div></nav>
      <footer className="drawer-footer"><span className="drawer-footer-mark" aria-hidden="true" /><span>Your world of cinema.</span></footer>
    </aside>
  </dialog>;
}

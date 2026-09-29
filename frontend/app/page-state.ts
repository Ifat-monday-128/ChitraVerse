"use client";

import { useState, type Dispatch, type SetStateAction, type MouseEvent } from 'react';

// In-memory navigation preferences only. Never store credentials or form secrets.
const pages = new Map<string, unknown>();
export function clearPageState() { pages.clear(); }

export function navigateHome(event: MouseEvent<HTMLAnchorElement>) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  saveScroll();
  history.pushState({ cv: true }, '', '/');
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function usePageState<T>(name: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const key = `${typeof window === 'undefined' ? '/' : window.location.pathname + window.location.search}:${name}`;
  const read = () => pages.has(key) ? pages.get(key) as T : initial;
  const [state, setState] = useState(() => ({ key, value: read() }));
  const value = state.key === key ? state.value : read();
  if (state.key !== key) setState({ key, value });
  return [value, next => {
    const current = pages.has(key) ? pages.get(key) as T : value;
    const updated = typeof next === 'function' ? (next as (previous: T) => T)(current) : next;
    pages.set(key, updated);
    setState({ key, value: updated });
  }];
}

export function saveScroll() {
  const containers = Array.from(document.querySelectorAll<HTMLElement>('.account-main, .admin-main, .home-marquee, .media-rail, .account-sidebar nav, .admin-sidebar nav'));
  history.replaceState({ ...history.state, cvScroll: [window.scrollX, window.scrollY], cvContainers: containers.map(element => [element.scrollLeft, element.scrollTop]) }, '');
}

export function restoreScroll(): () => void {
  const url = window.location.href;
  const [left, top] = history.state?.cvScroll || [0, 0];
  const positions: number[][] = history.state?.cvContainers || [];
  let frame = 0;
  const start = performance.now();
  const restore = () => {
    if (window.location.href !== url) return;
    window.scrollTo({ left, top, behavior: 'instant' });
    const containers = Array.from(document.querySelectorAll<HTMLElement>('.account-main, .admin-main, .home-marquee, .media-rail, .account-sidebar nav, .admin-sidebar nav'));
    let pending = containers.length < positions.length;
    containers.forEach((element, index) => {
      if (!positions[index]) return;
      element.scrollTo({left: positions[index][0], top: positions[index][1], behavior: 'instant'});
      pending ||= Math.abs(element.scrollTop - positions[index][1]) > 1;
    });
    // Wait for async results to rebuild enough document height.
    const elapsed = performance.now() - start;
    if ((elapsed < 600 || pending || Math.abs(window.scrollY - top) > 1) && elapsed < 5000) frame = requestAnimationFrame(restore);
  };
  frame = requestAnimationFrame(restore);
  const stop = () => cancelAnimationFrame(frame);
  window.addEventListener('wheel', stop, { once: true });
  window.addEventListener('touchstart', stop, { once: true });
  window.addEventListener('keydown', stop, { once: true });
  return () => { stop(); window.removeEventListener('wheel', stop); window.removeEventListener('touchstart', stop); window.removeEventListener('keydown', stop); };
}

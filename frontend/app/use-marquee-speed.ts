"use client";

import { useCallback } from 'react';

// All reels travel at the same physical speed, regardless of card count or size.
const PIXELS_PER_SECOND = 40;

export default function useMarqueeSpeed<T extends HTMLElement>() {
  return useCallback((element: T | null) => {
    if (!element) return;
    const rail = element.parentElement;
    if (!rail) return;
    const update = () => {
      const gap = parseFloat(getComputedStyle(element).columnGap) || 0;
      const distance = (element.getBoundingClientRect().width + gap) / 2;
      element.style.animationDuration = `${distance / PIXELS_PER_SECOND}s`;
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    rail.tabIndex = 0;
    rail.setAttribute('aria-roledescription', 'carousel');
    if (!rail.hasAttribute('aria-label')) {
      rail.setAttribute('aria-label', rail.classList.contains('birthday-marquee') ? 'Born Today portraits' : 'Popular interests');
    }
    let startX = 0, startY = 0, startScroll = 0, pointer: number | null = null;
    let dragging = false, suppressClickUntil = 0;
    let resumeTimer: ReturnType<typeof setTimeout> | undefined;
    const pause = () => {
      clearTimeout(resumeTimer);
      element.style.animationPlayState = 'paused';
      rail.dataset.interacting = 'true';
    };
    const resumeLater = () => {
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => {
        element.style.animationPlayState = '';
        delete rail.dataset.interacting;
      }, 1800);
    };
    const down = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      pointer = event.pointerId; startX = event.clientX; startY = event.clientY; startScroll = rail.scrollLeft; dragging = false;
      pause();
    };
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;
      const x = event.clientX - startX, y = event.clientY - startY;
      if (!dragging && Math.abs(x) > 6 && Math.abs(x) > Math.abs(y)) {
        dragging = true; rail.setPointerCapture(event.pointerId); rail.dataset.dragging = 'true';
      }
      if (!dragging) return;
      event.preventDefault(); rail.scrollLeft = startScroll - x;
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;
      if (dragging) suppressClickUntil = Date.now() + 250;
      pointer = null; dragging = false; delete rail.dataset.dragging;
      if (rail.hasPointerCapture(event.pointerId)) rail.releasePointerCapture(event.pointerId);
      resumeLater();
    };
    const wheel = (event: WheelEvent) => {
      const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey;
      if (!horizontal) return;
      event.preventDefault(); pause(); rail.scrollLeft += event.deltaX || event.deltaY; resumeLater();
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault(); pause(); rail.scrollBy({ left: (event.key === 'ArrowRight' ? 1 : -1) * rail.clientWidth * .72, behavior: 'smooth' }); resumeLater();
    };
    const click = (event: MouseEvent) => { if (Date.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); } };
    rail.addEventListener('pointerdown', down); rail.addEventListener('pointermove', move);
    rail.addEventListener('pointerup', up); rail.addEventListener('pointercancel', up);
    rail.addEventListener('wheel', wheel, { passive: false }); rail.addEventListener('keydown', keydown);
    rail.addEventListener('click', click, true);
    return () => {
      clearTimeout(resumeTimer); observer.disconnect();
      rail.removeEventListener('pointerdown', down); rail.removeEventListener('pointermove', move);
      rail.removeEventListener('pointerup', up); rail.removeEventListener('pointercancel', up);
      rail.removeEventListener('wheel', wheel); rail.removeEventListener('keydown', keydown); rail.removeEventListener('click', click, true);
    };
  }, []);
}

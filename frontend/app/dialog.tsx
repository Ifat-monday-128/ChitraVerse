"use client";
import { useEffect, useRef, type ReactNode } from "react";

export default function Dialog({ title, close, children, busy = false }: { title: string; close: () => void; children: ReactNode; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current, overflow = document.body.style.overflow;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal(); document.body.style.overflow = 'hidden';
    return () => { element?.close(); document.body.style.overflow = overflow; queueMicrotask(() => { if (opener?.isConnected) opener.focus(); }); };
  }, []);
  return <dialog ref={ref} className="dialog" aria-label={title} aria-busy={busy} onCancel={event => { event.preventDefault(); if (!busy) close(); }} onClick={(event) => { if (!busy && event.target === event.currentTarget) close(); }}>
    <div className="dialog-content"><button className="close-button" aria-label="Close dialog" disabled={busy} onClick={close}>×</button>{children}</div>
  </dialog>;
}

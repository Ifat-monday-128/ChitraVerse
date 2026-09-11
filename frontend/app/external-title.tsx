"use client";
import { useEffect, useState } from 'react';
import { api, ApiError } from './api';

// Compatibility for old links: open the full local title page when imported.
export default function ExternalTitle({ reference, openTitle }: { reference: string; openTitle: (id: number) => void }) {
  const [error, setError] = useState('');
  const [titleId, setTitleId] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    api<{ title_id: number }>(`/api/media/external/${reference.replace(':', '/')}`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setTitleId(result.title_id); })
      .catch(error => { if (!controller.signal.aborted) setError(error instanceof ApiError ? error.message : 'Could not reach the local library.'); });
    return () => controller.abort();
  }, [reference]);
  if (error) return <p className="message error" role="alert">{error}</p>;
  if (titleId) return <button className="primary-button" onClick={() => openTitle(titleId)}>Open title in our library</button>;
  return <p className="message" role="status">Finding title in our local library?</p>;
}

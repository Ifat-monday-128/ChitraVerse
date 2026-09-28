"use client";
import { useState } from "react";
import { posterUrl, type Media } from "./api";
import { useLibrary } from "./library-state";
const year = (item: Media) => (item.release_date || item.first_air_date)?.slice(0, 4);

export function Poster({ item }: { item: Media }) {
  const src = posterUrl(item.poster);
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div className="missing-poster"><span aria-hidden="true">▤</span><strong>{item.title}</strong><small>No poster available</small></div>;
  // Database poster URLs use TMDB's already-sized images, including a missing-image state.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={`${item.title} poster`} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}
export default function Card({ item, open, index }: { item: Media; open: (id: number) => void; index: number }) {
  const {saved}=useLibrary();
  return <button className="media-card" style={{ animationDelay: `${Math.min(index % 24, 8) * 55}ms` }} onClick={() => open(item.title_id)} aria-label={`About ${item.title}`}>
    <Poster item={item} />{saved.has(item.title_id)&&<span className="saved-badge">✓ Added to Watchlist</span>}<span className="card-shade" /><span className="card-copy">
      <span>{item.media_type === "series" ? "TV series" : "Movie"}{year(item) ? ` · ${year(item)}` : ""}</span><strong>{item.title}</strong>
      <span className="card-rating">{item.tmdb_rating != null ? `★ ${item.tmdb_rating} TMDB` : "Not rated"}</span></span>
  </button>;
}


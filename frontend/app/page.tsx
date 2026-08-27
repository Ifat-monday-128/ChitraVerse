"use client";

import { useEffect, useState } from "react";

type Media = {
  title_id: number; title: string; poster: string | null;
  tmdb_rating: string | null; chitraverse_rating: string | null;
  media_type: "movie" | "series"; description?: string; runtime?: number;
  release_date?: string; genres?: Array<{ name: string }>;
};

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";
const IMAGE = "https://image.tmdb.org/t/p/w500";
export default function Home() {
  const [hero, setHero] = useState<Media | null>(null);
  const [cards, setCards] = useState<Media[]>([]);

  useEffect(() => {
    let active = true;

    fetch(API + "/api/media?limit=100")
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load media");
        return response.json() as Promise<Media[]>;
      })
      .then(async (titles) => {
        const preferred = titles.find((item) => /^(interstellar|the odyssey)$/i.test(item.title));
        const featured = preferred ?? titles.find((item) => item.media_type === "movie") ?? titles[0];
        if (!featured) return;

        const detailsResponse = await fetch(API + "/api/media/" + featured.title_id);
        const details = detailsResponse.ok ? await detailsResponse.json() as Media : featured;
        if (!active) return;
        setHero(details);
        setCards(titles.filter((item) => item.title_id !== featured.title_id).slice(0, 10));
      })
      .catch(() => undefined);

    return () => { active = false; };
  }, []);

  const year = hero?.release_date ? new Date(hero.release_date).getFullYear() : "";
  const runtime = hero?.runtime ? Math.floor(hero.runtime / 60) + "h " + (hero.runtime % 60) + "m" : "";

  return (
    <main className="home-shell">
      <section className="hero" style={hero?.poster ? { backgroundImage: `url(${IMAGE + hero.poster})` } : undefined}>
        <header className="topbar">
          <div className="topbar-side">
            <button className="icon-button menu" aria-label="Open menu"><i /><i /><i /></button>
            <button className="icon-button search" aria-label="Search" />
          </div>
          <a className="brand" href="#" aria-label="ChitraVerse home">CHITRA<span>VERSE</span></a>
          <button className="avatar" aria-label="Open profile">CV</button>
        </header>

        <div className="hero-copy">
          <p className="eyebrow">{hero?.genres?.map((g) => g.name).join("  •  ")}</p>
          <h1>{hero?.title ?? "Loading your collection"}</h1>
          <p className="description">{hero?.description ?? "Connecting to your media library."}</p>
          <div className="metadata">
            <span className="rating"><b>TMDB</b> {hero?.tmdb_rating ?? "-"}</span>
            <span>{year}</span><span>{runtime}</span><span className="age-label">13+</span>
          </div>
          <div className="hero-actions">
            <button className="play-button"><span className="play-icon" /> PLAY</button>
            <button className="about-button">ABOUT <span>⌄</span></button>
          </div>
        </div>

        <nav className="category-tabs" aria-label="Media categories">
          <button>Originals</button><button>TV Shows</button><button className="active">Movies</button>
        </nav>
      </section>

      <section className="rail-section">
        <div className="section-heading"><div><p>CURATED FOR YOU</p><h2>Movies &amp; Series</h2></div><button aria-label="View all">→</button></div>
        <div className="media-rail">
          {cards.map((item) => (
            <article className="media-card" key={item.title_id}>
              {item.poster && <img src={IMAGE + item.poster} alt={item.title + " poster"} />}
              <div className="card-shade" />
              <div className="card-copy"><span>{item.media_type}</span><h3>{item.title}</h3><p>★ {item.tmdb_rating} <i>TMDB</i></p></div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

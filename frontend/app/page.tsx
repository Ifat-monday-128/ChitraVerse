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
const heroFallback: Media = {
  title_id: 53, title: "Interstellar", poster: "/yQvGrMoipbRoddT0ZR8tPoR7NfX.jpg",
  tmdb_rating: "8.5", chitraverse_rating: null, media_type: "movie",
  runtime: 169, release_date: "2014-11-05",
  genres: [{ name: "Adventure" }, { name: "Drama" }, { name: "Science Fiction" }],
  description: "Explorers travel through a newly discovered wormhole to find humanity a new home among the stars.",
};
const cardFallback: Media[] = [
  [142, "Breaking Bad", "/anFx9aTOOYqgS3v7x3R84Kz67ly.jpg", "8.9", "series"],
  [39, "Demon Slayer: Infinity Castle", "/fWVSwgjpT2D78VUh6X8UBd2rorW.jpg", "8.8", "movie"],
  [200, "The Sopranos", "/rTc7ZXdroqjkKivFPvCPX0Ru7uw.jpg", "8.7", "series"],
  [62, "The Godfather", "/3bhkrj58Vtu7enYsRolD1fZdja1.jpg", "8.7", "movie"],
  [170, "Stranger Things", "/uOOtwVbSr4QDjAGIifLDwpb2Pdl.jpg", "8.6", "series"],
].map(([id, title, poster, rating, type]) => ({
  title_id: id as number, title: title as string, poster: poster as string,
  tmdb_rating: rating as string, chitraverse_rating: null,
  media_type: type as "movie" | "series",
}));

export default function Home() {
  const [hero, setHero] = useState<Media>(heroFallback);
  const [cards, setCards] = useState<Media[]>(cardFallback);

  useEffect(() => {
    Promise.all([
      fetch(API + "/api/media/53").then((r) => { if (!r.ok) throw new Error(); return r.json(); }),
      fetch(API + "/api/media?limit=18").then((r) => { if (!r.ok) throw new Error(); return r.json(); }),
    ]).then(([featured, titles]) => {
      setHero(featured);
      setCards(titles.filter((item: Media) => item.title_id !== featured.title_id).slice(0, 10));
    }).catch(() => undefined);
  }, []);

  const year = hero.release_date ? new Date(hero.release_date).getFullYear() : 2014;
  const runtime = hero.runtime ? Math.floor(hero.runtime / 60) + "h " + (hero.runtime % 60) + "m" : "2h 49m";

  return (
    <main className="home-shell">
      <section className="hero">
        <header className="topbar">
          <div className="topbar-side">
            <button className="icon-button menu" aria-label="Open menu"><i /><i /><i /></button>
            <button className="icon-button search" aria-label="Search" />
          </div>
          <a className="brand" href="#" aria-label="ChitraVerse home">CHITRA<span>VERSE</span></a>
          <button className="avatar" aria-label="Open profile">CV</button>
        </header>

        <div className="hero-copy">
          <p className="eyebrow">{hero.genres?.map((g) => g.name).join("  •  ")}</p>
          <h1>{hero.title}</h1>
          <p className="description">{hero.description}</p>
          <div className="metadata">
            <span className="rating"><b>TMDB</b> {hero.tmdb_rating}</span>
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
              <img src={item.poster ? IMAGE + item.poster : "/interstellar-hero.jpg"} alt={item.title + " poster"} />
              <div className="card-shade" />
              <div className="card-copy"><span>{item.media_type}</span><h3>{item.title}</h3><p>★ {item.tmdb_rating} <i>TMDB</i></p></div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

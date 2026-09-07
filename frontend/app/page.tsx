"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { AdminUsers, MovieRating } from "./role-features";
import { api, ApiError, posterUrl, trailerUrl, type Media, type Results, type User } from "./api";

type Route = { view: "home" | "browse" | "search" | "watchlist"; type: string; collection: string; q: string };
const home: Route = { view: "home", type: "all", collection: "all", q: "" };
const message = (error: unknown) => error instanceof ApiError ? error.message : "Cannot reach the library. Check your connection and try again.";
const year = (item: Media) => (item.release_date || item.first_air_date)?.slice(0, 4);
const resultsPath = (route: Route, offset = 0) => `/api/media/${route.view === "search" ? "search" : ""}?${new URLSearchParams({ type: route.type, collection: route.collection, q: route.q.trim(), limit: "24", offset: String(offset) })}`;

function Dialog({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="dialog" aria-label={title} onCancel={close} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <div className="dialog-content"><button className="close-button" aria-label="Close dialog" onClick={close}>×</button>{children}</div>
  </dialog>;
}
function Poster({ item }: { item: Media }) {
  const src = posterUrl(item.poster);
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div className="missing-poster">No poster available</div>;
  // Database poster URLs use TMDB's already-sized images, including a missing-image state.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={`${item.title} poster`} loading="lazy" onError={() => setFailed(true)} />;
}
function Card({ item, open }: { item: Media; open: (id: number) => void }) {
  return <button className="media-card" onClick={() => open(item.title_id)} aria-label={`About ${item.title}`}>
    <Poster item={item} /><span className="card-shade" /><span className="card-copy">
      <span>{item.media_type === "series" ? "TV series" : "Movie"}{year(item) ? ` · ${year(item)}` : ""}</span><strong>{item.title}</strong>
      <span className="card-rating">{item.tmdb_rating != null ? `★ ${item.tmdb_rating} TMDB` : "Not rated"}</span></span>
  </button>;
}

export default function Home() {
  const [route, setRoute] = useState<Route>(home);
  const [ready, setReady] = useState(false);
  const [hero, setHero] = useState<Media | null>(null);
  const [items, setItems] = useState<Media[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [menu, setMenu] = useState(false);
  const [account, setAccount] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [register, setRegister] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [accountError, setAccountError] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);
  const [watchlist, setWatchlist] = useState<number[]>([]);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Media | null>(null);
  const [detailError, setDetailError] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [season, setSeason] = useState("");
  const [episodes, setEpisodes] = useState<{ ep_id: number; title: string; episode_number: number }[]>([]);
  const [episodeError, setEpisodeError] = useState("");
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  function go(next: Partial<Route> = {}) {
    const value = { ...home, ...next };
    const query = new URLSearchParams();
    if (value.view !== "home") query.set("view", value.view);
    if (value.type !== "all") query.set("type", value.type);
    if (value.collection !== "all") query.set("collection", value.collection);
    if (value.q) query.set("q", value.q);
    window.history.pushState(null, "", query.size ? `/?${query}` : "/");
    setRoute(value); setMenu(false); setError(""); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  useEffect(() => {
    function read() {
      const params = new URLSearchParams(window.location.search), view = params.get("view");
      setRoute({ view: ["browse", "search", "watchlist"].includes(view || "") ? view as Route["view"] : "home",
        type: ["movie", "series"].includes(params.get("type") || "") ? params.get("type")! : "all",
        collection: params.get("collection") === "hollywood" ? "hollywood" : "all", q: (params.get("q") || "").slice(0, 120) });
      setReady(true);
    }
    read(); window.addEventListener("popstate", read);
    api<{ user: User | null }>("/api/account/me").then((data) => setUser(data.user)).catch(() => {});
    return () => window.removeEventListener("popstate", read);
  }, []);
  useEffect(() => {
    if (!user || user.role === "admin") return;
    const controller = new AbortController();
    api<{ items: Media[] }>("/api/account/watchlist", { signal: controller.signal }).then((data) => setWatchlist(data.items.map((item) => item.title_id))).catch(() => {});
    return () => controller.abort();
  }, [user]);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    // Reset data when synchronizing with a new API request, including browser Back.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true); setError(""); setHero(null); setItems([]); setHasMore(false); setLoadingMore(false);
    const timer = setTimeout(async () => {
      try {
        if (route.view === "home") {
          const data = await api<{ featured: Media | null; items: Media[] }>("/api/media/home", { signal: controller.signal });
          if (!controller.signal.aborted) { setHero(data.featured); setItems(data.items); }
        } else if (route.view === "watchlist") {
          const data = await api<{ items: Media[] }>("/api/account/watchlist", { signal: controller.signal });
          if (!controller.signal.aborted) { setItems(data.items); setTotal(data.items.length); }
        } else if (route.view !== "search" || route.q.trim()) {
          const data = await api<Results>(resultsPath(route), { signal: controller.signal });
          if (!controller.signal.aborted) { setItems(data.items); setTotal(data.total); setHasMore(data.hasMore); }
        } else setTotal(0);
      } catch (error) { if (!controller.signal.aborted) setError(message(error)); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, route.view === "search" ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [route, retry, ready, user]);
  useEffect(() => { if (route.view === "search") searchRef.current?.focus(); }, [route.view]);
  useEffect(() => {
    // Discard data belonging to the previously requested title.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDetail(null); setDetailError(""); setSeason(""); setEpisodes([]);
    if (detailId === null) return;
    const controller = new AbortController();
    api<Media>(`/api/media/${detailId}`, { signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) { setDetail(data); setSeason(data.seasons?.[0] ? String(data.seasons[0].season_number) : ""); }
    }).catch((error) => { if (!controller.signal.aborted) setDetailError(message(error)); });
    return () => controller.abort();
  }, [detailId]);
  useEffect(() => {
    if (detailId === null || !season) return;
    const controller = new AbortController();
    // Do not show episodes from the previous season during the request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEpisodes([]); setEpisodeError(""); setEpisodesLoading(true);
    api<{ ep_id: number; title: string; episode_number: number }[]>(`/api/media/${detailId}/seasons/${season}/episodes`, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setEpisodes(data); })
      .catch((error) => { if (!controller.signal.aborted) setEpisodeError(message(error)); })
      .finally(() => { if (!controller.signal.aborted) setEpisodesLoading(false); });
    return () => controller.abort();
  }, [detailId, season]);
  async function loadMore() {
    setLoadingMore(true); setError(""); const requestedRoute = window.location.search;
    try {
      const data = await api<Results>(resultsPath(route, items.length));
      if (window.location.search !== requestedRoute) return;
      setItems((current) => [...current, ...data.items]); setHasMore(data.hasMore);
    } catch (error) { if (window.location.search === requestedRoute) setError(message(error)); }
    finally { if (window.location.search === requestedRoute) setLoadingMore(false); }
  }
  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setAccountBusy(true); setAccountError(""); const form = new FormData(event.currentTarget);
    try {
      const data = await api<{ user: User }>(`/api/account/${register ? "register" : "login"}`, { method: "POST", body: JSON.stringify(Object.fromEntries(form)) });
      setWatchlist([]); setUser(data.user); setAccount(false);
      if (data.user.role === "admin") { go(); setAdminOpen(true); }
    } catch (error) { setAccountError(message(error)); }
    finally { setAccountBusy(false); }
  }
  async function logout() {
    setAccountBusy(true); setAccountError("");
    try {
      // Wait for the server to delete the session before clearing the UI.
      await api("/api/account/logout", { method: "POST" });
      setUser(null);
      setAdminOpen(false);
      setWatchlist([]);
      setAccount(false);
      if (route.view === "watchlist") go();
    } catch (error) {
      setAccountError(message(error));
    } finally {
      setAccountBusy(false);
    }
  }
  async function saveTitle(item: Media) {
    if (!user) { setAccount(true); setAccountError(""); return; }
    setSaveBusy(true); setDetailError(""); const saved = watchlist.includes(item.title_id);
    try {
      await api(`/api/account/watchlist/${item.title_id}`, { method: saved ? "DELETE" : "PUT" });
      setWatchlist((current) => saved ? current.filter((id) => id !== item.title_id) : [...current, item.title_id]);
      if (route.view === "watchlist") setRetry((current) => current + 1);
    } catch (error) { setDetailError(message(error)); } finally { setSaveBusy(false); }
  }
  const isHome = route.view === "home";
  const heading = route.view === "search" ? "Search the library" : route.view === "watchlist" ? "My watchlist" : route.collection === "hollywood" ? "Hollywood movies" : route.type === "series" ? "TV shows" : "Movies";
  const heroImage = hero ? posterUrl(hero.poster, "original") : undefined;
  const heroTrailer = trailerUrl(hero?.trailer_link);

  return <main className="home-shell">
    <section className={`hero ${isHome ? "" : "compact"}`} style={isHome && heroImage ? { backgroundImage: `url("${heroImage}")` } : undefined}>
      <header className="topbar"><div className="topbar-side">
        <button className="icon-button menu" aria-label="Open menu" onClick={() => setMenu(true)}><i /><i /><i /></button>
        <button className="icon-button search" aria-label="Search" onClick={() => go({ view: "search" })} /></div>
        <Link className="brand" href="/" aria-label="ChitraVerse home" onClick={(event) => { event.preventDefault(); go(); }}>CHITRA<span>VERSE</span></Link>
        <button className="avatar" aria-label="Open profile" onClick={() => { setAccount(true); setAccountError(""); }}>{user ? user.name.slice(0, 2).toUpperCase() : "CV"}</button>
      </header>
      {isHome && <div className="hero-copy">{loading ? <p role="status">Loading your movie library…</p> : hero ? <>
        <p className="eyebrow">{hero.genres?.map((genre) => genre.name).join(" · ")}</p><h1>{hero.title}</h1>
        {hero.description && <p className="description">{hero.description}</p>}<div className="metadata">
          {hero.tmdb_rating != null && <span className="rating"><b>TMDB</b> {hero.tmdb_rating}</span>}{year(hero) && <span>{year(hero)}</span>}
          {!!hero.runtime && <span>{Math.floor(hero.runtime / 60)}h {hero.runtime % 60}m</span>}</div>
        <div className="hero-actions">{heroTrailer ? <a className="play-button" href={heroTrailer} target="_blank" rel="noopener noreferrer"><span className="play-icon" /> TRAILER</a> : <span className="unavailable">Trailer unavailable</span>}
          <button className="about-button" onClick={() => setDetailId(hero.title_id)}>ABOUT <span>⌄</span></button></div>
      </> : <><p className="eyebrow">CHITRAVERSE</p><h1>{error ? "Library unavailable" : "No movies yet"}</h1>
        <p className="description">{error || "No Hollywood movies are available in the library yet."}</p><button className="primary-button" onClick={() => setRetry((current) => current + 1)}>Try again</button></>}
      </div>}
      <nav className="category-tabs" aria-label="Media categories"><button className={isHome ? "active" : ""} onClick={() => go()}>Home</button>
        <button className={!isHome && route.type === "series" ? "active" : ""} onClick={() => go({ view: "browse", type: "series" })}>TV Shows</button>
        <button className={!isHome && route.type === "movie" ? "active" : ""} onClick={() => go({ view: "browse", type: "movie" })}>Movies</button></nav>
    </section>
    <section className="rail-section"><div className="section-heading"><div><p>{isHome ? "FROM YOUR LIBRARY" : "EXPLORE CHITRAVERSE"}</p><h2>{isHome ? "Hollywood movies" : heading}</h2></div>
      {isHome && items.length > 0 && <button aria-label="View all Hollywood movies" onClick={() => go({ view: "browse", type: "movie", collection: "hollywood" })}>→</button>}</div>
      {route.view === "search" && <form className="search-form" role="search" onSubmit={(event) => { event.preventDefault(); setRetry((current) => current + 1); }}>
        <label htmlFor="library-search">Search titles or actors</label><div className="search-field"><input id="library-search" ref={searchRef} type="search" value={route.q} maxLength={120} placeholder="Movie, TV show, actor or actress…" onChange={(event) => {
          const q = event.target.value; setRoute((current) => ({ ...current, q })); const params = new URLSearchParams(window.location.search);
          if (q) params.set("q", q); else params.delete("q"); window.history.replaceState(null, "", `/?${params}`);
        }} /><button className="primary-button" type="submit">Search</button></div>
        <label className="filter-label">Category<select value={route.type} onChange={(event) => go({ ...route, type: event.target.value })}><option value="all">All titles</option><option value="movie">Movies</option><option value="series">TV shows</option></select></label>
      </form>}
      {!isHome && error && <div className="message error" role="alert">{error}<button onClick={() => route.view === "watchlist" && !user ? setAccount(true) : setRetry((current) => current + 1)}>{route.view === "watchlist" && !user ? "Sign in" : "Try again"}</button></div>}
      {loading ? <p className="message" role="status">Loading library…</p> : <>
        {!isHome && !error && <p className="result-count" role="status">{route.view === "search" && !route.q.trim() ? "Enter a title or a cast member’s name to start searching." : `${total} ${total === 1 ? "title" : "titles"}${route.view === "search" ? ` matching “${route.q.trim()}”` : ""}`}</p>}
        {items.length ? <div className={isHome ? "media-rail" : "media-grid"}>{items.map((item) => <Card key={item.title_id} item={item} open={setDetailId} />)}</div>
          : !error && !isHome && (route.view !== "search" || route.q.trim()) && <p className="message">{route.view === "watchlist" ? "Your watchlist is empty. Open a title and save it here." : "No titles found. Try a different title, name or category."}</p>}
        {hasMore && <button className="primary-button load-more" disabled={loadingMore} onClick={loadMore}>{loadingMore ? "Loading…" : "Load more"}</button>}
      </>}
    </section>
    {menu && <Dialog title="Navigation" close={() => setMenu(false)}><h2>Explore</h2><nav className="menu-links">
      <button onClick={() => go()}>Home · Hollywood</button><button onClick={() => go({ view: "browse", type: "movie" })}>All movies</button>
      <button onClick={() => go({ view: "browse", type: "series" })}>TV shows</button><button onClick={() => go({ view: "search" })}>Search the library</button>
      {user?.role === "admin" ? <button onClick={() => { setMenu(false); setAdminOpen(true); }}>Users &amp; activity</button> : <button onClick={() => go({ view: "watchlist" })}>My watchlist</button>}</nav></Dialog>}
    {detailId !== null && <Dialog title={detail ? `About ${detail.title}` : "Title details"} close={() => setDetailId(null)}>
      {detailError && <p className="message error" role="alert">{detailError}</p>}{!detail ? !detailError && <p role="status">Loading title…</p> : <>
        <div className="detail-heading"><div className="detail-poster"><Poster item={detail} /></div><div><p className="eyebrow">{detail.media_type === "series" ? "TV series" : "Movie"} {year(detail) && `· ${year(detail)}`}</p><h2>{detail.title}</h2>
          <p className="genre-list">{detail.genres?.map((genre) => genre.name).join(" · ")}</p><p>{detail.tmdb_rating != null ? `★ ${detail.tmdb_rating} TMDB` : "Not rated"}</p></div></div>
        {detail.description && <p className="detail-description">{detail.description}</p>}
        <div className="detail-actions">{trailerUrl(detail.trailer_link) ? <a className="primary-button" target="_blank" rel="noopener noreferrer" href={trailerUrl(detail.trailer_link)}>Watch trailer ↗</a> : <span className="unavailable">Trailer unavailable</span>}
          {user?.role !== "admin" && <button className="secondary-button" disabled={saveBusy} onClick={() => saveTitle(detail)}>{saveBusy ? "Saving…" : watchlist.includes(detail.title_id) ? "Remove from watchlist" : "Add to watchlist"}</button>}</div>
        {detail.media_type === "movie" && <MovieRating key={`${detail.title_id}-${user?.user_id ?? "guest"}`} movie={detail} user={user} updated={data => setDetail(current => current?.title_id === detail.title_id ? { ...current, ...data } : current)} signIn={() => setAccount(true)} />}
        {!!detail.cast_crew?.length && <><h3>Cast &amp; crew</h3><ul className="credits">{detail.cast_crew.map((person) => <li key={`${person.cast_crew_id}-${person.role_type}`}>
          {person.role_type === "Actor" ? <button onClick={() => { setDetailId(null); go({ view: "search", q: person.name }); }}>{person.name}</button> : <span>{person.name}</span>}<small>{person.role_type}</small></li>)}</ul></>}
        {!!detail.production_companies?.length && <><h3>Production</h3><p>{detail.production_companies.map((company) => company.name).join(" · ")}</p></>}
        {!!detail.seasons?.length && <><h3>Episodes</h3><label className="filter-label">Season<select value={season} onChange={(event) => setSeason(event.target.value)}>{detail.seasons.map((item) => <option key={item.season_id} value={item.season_number}>Season {item.season_number} · {item.total_episode} episodes</option>)}</select></label>
          {episodeError && <p role="alert">{episodeError}</p>}{episodesLoading ? <p role="status">Loading episodes…</p> : episodes.length ? <ol className="episodes">{episodes.map((episode) => <li key={episode.ep_id}>{episode.episode_number}. {episode.title}</li>)}</ol> : !episodeError && <p>No episodes are available for this season.</p>}</>}
      </>}
    </Dialog>}
    {adminOpen && user?.role === "admin" && <Dialog title="Users and activity" close={() => setAdminOpen(false)}><AdminUsers /></Dialog>}
    {account && <Dialog title={user ? "Your profile" : "Sign in"} close={() => setAccount(false)}>
      {user ? <><p className="eyebrow">YOUR PROFILE</p><h2>{user.name}</h2><p>{user.email}</p><p>Role: {user.role || "Not assigned"}</p>{user.role !== "admin" && <p>{watchlist.length} saved {watchlist.length === 1 ? "title" : "titles"}</p>}
        <div className="detail-actions">{user.role === "admin" ? <button className="primary-button" onClick={() => { setAccount(false); setDetailId(null); setAdminOpen(true); }}>Users &amp; activity</button> : <button className="primary-button" onClick={() => { setAccount(false); setDetailId(null); go({ view: "watchlist" }); }}>Open watchlist</button>}<button className="secondary-button" disabled={accountBusy} onClick={logout}>Sign out</button></div></>
        : <><h2>{register ? "Create an account" : "Welcome back"}</h2><p>Sign in to keep your movie and TV watchlist.</p><form className="account-form" onSubmit={authenticate}>
          {register && <label>Name<input name="name" autoComplete="name" required maxLength={255} /></label>}
          <label>Email<input name="email" type="email" autoComplete="email" required maxLength={255} /></label>
          <label>Password<input name="password" type="password" autoComplete={register ? "new-password" : "current-password"} required minLength={register ? 8 : undefined} maxLength={128} /></label>
          <button className="primary-button" disabled={accountBusy}>{accountBusy ? "Please wait…" : register ? "Create account" : "Sign in"}</button></form>
          <button className="text-button" onClick={() => { setRegister(!register); setAccountError(""); }}>{register ? "Already have an account? Sign in" : "New here? Create an account"}</button></>}
      {accountError && <p className="message error" role="alert">{accountError}</p>}
    </Dialog>}
  </main>;
}

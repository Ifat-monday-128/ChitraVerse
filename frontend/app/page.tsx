"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { AdminUsers, MovieRating } from "./role-features";
import PersonProfile, { PersonPhoto } from "./person-profile";
import { CastDirectory, ProductionCredits, ProductionProfile } from "./catalog-pages";
import AdminHomepage from "./admin-homepage";
import ExternalTitle from "./external-title";
import { HeroBackdrop, HeroCarousel } from "./hero-carousel";
import { TitleFilterPanel, emptyFilters, filterParams, readFilters, type TitleFilters } from './search-filters';
import HeaderSearch from "./header-search";
import HomeDiscovery from './home-discovery';
import AuthScreen from './auth-screen';
import AnimatedDisclosure from './animated-disclosure';
import { api, ApiError, posterUrl, trailerEmbedUrl, type Media, type Results, type User } from "./api";

type Route = TitleFilters & { view: "home" | "browse" | "search" | "watchlist" | "cast"; collection: string; q: string };
const home: Route = { ...emptyFilters, view: "home", collection: "all", q: "" };
const message = (error: unknown) => error instanceof ApiError ? error.message : "Cannot reach the library. Check your connection and try again.";
const year = (item: Media) => (item.release_date || item.first_air_date)?.slice(0, 4);
const resultsPath = (route: Route, offset = 0) => `${route.view==='watchlist'?'/api/account/watchlist/search':`/api/media/${route.view === "search" ? "search" : ""}`}?${new URLSearchParams({ ...filterParams(route), type: route.type, collection: route.collection, q: route.q.trim(), limit: "24", offset: String(offset) })}`;

function Dialog({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="dialog" aria-label={title} onCancel={close} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <div className="dialog-content"><button className="close-button" aria-label="Close dialog" onClick={close}>×</button>{children}</div>
  </dialog>;
}
function TrailerPlayer({ item, autoPlay }: { item: Media; autoPlay: boolean }) {
  const [playing, setPlaying] = useState(autoPlay);
  const url = trailerEmbedUrl(item.trailer_link);
  if (!url) return <p className="unavailable">Trailer unavailable</p>;
  return <section className="detail-trailer" aria-label={`${item.title} trailer`}>
    <div className="trailer-heading"><h3>Official trailer</h3>
      {playing && <button className="text-button" onClick={() => setPlaying(false)}>Stop trailer</button>}
    </div>
    {playing ? <div className="video-frame"><iframe src={url} title={`${item.title} trailer`} referrerPolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen /></div>
      : <button className="trailer-preview" onClick={() => setPlaying(true)} aria-label={`Play ${item.title} trailer`}><span className="trailer-play"><span className="play-icon" /></span><strong>Watch trailer</strong><span>Play here in ChitraVerse</span></button>}
  </section>;
}
function Poster({ item }: { item: Media }) {
  const src = posterUrl(item.poster);
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div className="missing-poster">No poster available</div>;
  // Database poster URLs use TMDB's already-sized images, including a missing-image state.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={`${item.title} poster`} loading="lazy" onError={() => setFailed(true)} />;
}
function Card({ item, open, index }: { item: Media; open: (id: number) => void; index: number }) {
  return <button className="media-card" style={{ animationDelay: `${Math.min(index % 24, 8) * 55}ms` }} onClick={() => open(item.title_id)} aria-label={`About ${item.title}`}>
    <Poster item={item} /><span className="card-shade" /><span className="card-copy">
      <span>{item.media_type === "series" ? "TV series" : "Movie"}{year(item) ? ` · ${year(item)}` : ""}</span><strong>{item.title}</strong>
      <span className="card-rating">{item.tmdb_rating != null ? `★ ${item.tmdb_rating} TMDB` : "Not rated"}</span></span>
  </button>;
}

export default function Home() {
  const [route, setRoute] = useState<Route>(home);
  const [ready, setReady] = useState(false);
  const [hero, setHero] = useState<Media | null>(null);
  const [featuredItems, setFeaturedItems] = useState<Media[]>([]);
  const [homepageEditor, setHomepageEditor] = useState(false);
  const [heroHovered, setHeroHovered] = useState(false);
  const [heroFocused, setHeroFocused] = useState(false);
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
  const [personId, setPersonId] = useState<number | null>(null);
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [externalTitle, setExternalTitle] = useState<string | null>(null);
  const [trailerTitleId, setTrailerTitleId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Media | null>(null);
  const [detailError, setDetailError] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [season, setSeason] = useState("");
  const [episodes, setEpisodes] = useState<{ ep_id: number; title: string; episode_number: number }[]>([]);
  const [episodeError, setEpisodeError] = useState("");
  const [episodesLoading, setEpisodesLoading] = useState(false);
  function changeSearch(q: string) {
    setRoute(current => ({ ...current, q }));
    const params = new URLSearchParams(window.location.search);
    if (q) params.set('q', q); else params.delete('q');
    window.history.replaceState(null, '', `/?${params}`);
  }

  function openTitle(id: number) {
    setHeroHovered(false); setHeroFocused(false);
    const params = new URLSearchParams(window.location.search);
    params.delete('external'); setExternalTitle(null);
    params.set("title", String(id));
    window.history.pushState({ cv: true }, "", `/?${params}`);
    setDetailId(id); window.scrollTo({ top: 0 });
  }
  function openPerson(id: number) {
    const params = new URLSearchParams(window.location.search);
    params.delete('external'); setExternalTitle(null);
    params.delete("title"); params.delete("company"); params.set("person", String(id));
    window.history.pushState({ cv: true }, "", `/?${params}`);
    setDetailId(null); setCompanyId(null); setPersonId(id); window.scrollTo({ top: 0 });
  }
  function openCompany(id: number) {
    const params = new URLSearchParams(window.location.search);
    params.delete('external'); setExternalTitle(null);
    params.delete("title"); params.delete("person"); params.set("company", String(id));
    window.history.pushState({ cv: true }, "", `/?${params}`);
    setDetailId(null); setPersonId(null); setCompanyId(id); window.scrollTo({ top: 0 });
  }
  function back() {
    if (window.history.state?.cv) window.history.back();
    else go();
  }
  function go(next: Partial<Route> = {}) {
    setHeroHovered(false); setHeroFocused(false);
    const value = { ...home, ...next };
    const query = new URLSearchParams();
    if (value.view !== "home") query.set("view", value.view);
    if (value.type !== "all") query.set("type", value.type);
    if (value.collection !== "all") query.set("collection", value.collection);
    if (value.q) query.set("q", value.q);
    for (const [key,filterValue] of Object.entries(filterParams(value))) query.set(key,filterValue);
    window.history.pushState(null, "", query.size ? `/?${query}` : "/");
    setExternalTitle(null);
    setRoute(value); setDetailId(null); setPersonId(null); setCompanyId(null); setMenu(false); setError(""); window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }
  useEffect(() => {
    function read() {
      const params = new URLSearchParams(window.location.search), view = params.get("view");
      const external = params.get('external');
      setExternalTitle(external && /^(movie|series):[1-9]\d*$/.test(external) ? external : null);
      const readId = (name: string) => /^[1-9]\d*$/.test(params.get(name) || "") && Number(params.get(name)) <= 2147483647 ? Number(params.get(name)) : null;
      setDetailId(readId("title")); setPersonId(readId("person")); setCompanyId(readId("company"));
      setRoute({
        ...readFilters(params),
        view: ["browse", "search", "watchlist", "cast"].includes(view || "") ? view as Route["view"] : "home",
        type: ["movie", "series"].includes(params.get("type") || "") ? params.get("type")! : "all",
        collection: params.get("collection") === "hollywood" ? "hollywood" : "all", q: (params.get("q") || "").slice(0, 120)
      });
      setReady(true);
    }
    read(); window.addEventListener("popstate", read);
    api<{ user: User | null }>("/api/account/me").then((data) => setUser(data.user)).catch(() => { });
    return () => window.removeEventListener("popstate", read);
  }, []);
  useEffect(() => {
    if (!user || user.role === "admin") return;
    const controller = new AbortController();
    api<{ items: Media[] }>("/api/account/watchlist", { signal: controller.signal }).then((data) => setWatchlist(data.items.map((item) => item.title_id))).catch(() => { });
    return () => controller.abort();
  }, [user]);
  useEffect(() => {
    if (!ready || route.view === "cast") return;
    const controller = new AbortController();
    // Reset data when synchronizing with a new API request, including browser Back.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true); setError(""); setHero(null); setItems([]); setHasMore(false); setLoadingMore(false);
    const timer = setTimeout(async () => {
      try {
        if (route.view === "home") {
          const data = await api<{ featured: Media | null; featuredItems: Media[]; items: Media[] }>("/api/media/home", { signal: controller.signal });
          if (!controller.signal.aborted) { setHero(data.featured); setFeaturedItems(data.featuredItems); setItems(data.items); }
        } else {
          const data = await api<Results>(resultsPath(route), { signal: controller.signal });
          if (!controller.signal.aborted) { setItems(data.items); setTotal(data.total); setHasMore(data.hasMore); }
        }
      } catch (error) { if (!controller.signal.aborted) setError(message(error)); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, route.view === "search" ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [route, retry, ready, user]);
  useEffect(() => {
    // Discard data belonging to the previously requested title.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDetail(null); setDetailError(""); setSeason(""); setEpisodes([]);
    if (detailId === null) setTrailerTitleId(null);
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
  const isHome = route.view === "home" && detailId === null && personId === null && companyId === null && externalTitle === null;
  const isDirectory = detailId === null && personId === null && companyId === null && externalTitle === null;
  const isSearchPage = isDirectory && route.view === "search";
  const heading = route.view === "search" ? "Search the library" : route.view === "watchlist" ? "My watchlist" : route.collection === "hollywood" ? "Hollywood movies" : route.type === "series" ? "TV shows" : "Movies";
  const heroImage = hero ? posterUrl(hero.poster, "original") : undefined;
  const heroTrailer = trailerEmbedUrl(hero?.trailer_link);

  return <main className={`home-shell ${isHome ? "" : "full-page-shell"}`}>
    <section className={`hero ${isHome ? "" : "compact"} ${isSearchPage ? "search-page-hero" : ""}`} onFocusCapture={event => setHeroFocused(Boolean(event.target.closest('.hero-copy, .hero-carousel-controls')))} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setHeroFocused(false); }}>
      {isHome && <HeroBackdrop url={heroImage} />}
      <header className={`topbar ${isDirectory && route.view === "search" ? "search-expanded" : ""}`}><div className="topbar-side">
        <button className="icon-button menu" aria-label="Open menu" onClick={() => setMenu(true)}><i /><i /><i /></button>
        <HeaderSearch active={isDirectory && route.view === 'search'} query={route.q}
          open={() => go({ view: 'search' })} close={() => go()} change={changeSearch} submit={() => setRetry(current => current + 1)} /></div>
        <Link className="brand" href="/" aria-label="ChitraVerse home" onClick={(event) => { event.preventDefault(); go(); }}>CHITRA<span>VERSE</span></Link>
        <button className="avatar" aria-label="Open profile" onClick={() => { setAccount(true); setAccountError(""); }}>{user ? user.name.slice(0, 2).toUpperCase() : "CV"}</button>
      </header>
      {isHome && <div className="hero-copy" key={hero?.title_id ?? 'loading'}>{loading ? <p role="status">Loading your movie library…</p> : hero ? <>
        <p className="eyebrow">{hero.genres?.map((genre) => genre.name).join(" · ")}</p><h1>{hero.title}</h1>
        {hero.description && <p className="description">{hero.description}</p>}<div className="metadata">
          {hero.tmdb_rating != null && <span className="rating"><b>TMDB</b> {hero.tmdb_rating}</span>}{year(hero) && <span>{year(hero)}</span>}
          {!!hero.runtime && <span>{Math.floor(hero.runtime / 60)}h {hero.runtime % 60}m</span>}</div>
        <div className="hero-actions" onMouseEnter={() => setHeroHovered(true)} onMouseLeave={() => setHeroHovered(false)}>{heroTrailer ? <button className="play-button" onClick={() => { setTrailerTitleId(hero.title_id); openTitle(hero.title_id); }}><span className="play-icon" /> TRAILER</button> : <span className="unavailable">Trailer unavailable</span>}
          <button className="about-button" onClick={() => openTitle(hero.title_id)}>ABOUT <span className="about-chevron" aria-hidden="true" /></button></div>
        {user?.role === 'admin' && <button className="text-button" onClick={() => setHomepageEditor(true)}>Edit homepage features</button>}
      </> : <><p className="eyebrow">CHITRAVERSE</p><h1>{error ? "Library unavailable" : "No movies yet"}</h1>
        <p className="description">{error || "No Hollywood movies are available in the library yet."}</p><button className="primary-button" onClick={() => setRetry((current) => current + 1)}>Try again</button></>}
      </div>}
      {isHome && !loading && hero && featuredItems.length > 1 && <HeroCarousel items={featuredItems} currentId={hero.title_id} select={setHero} paused={heroHovered || heroFocused || menu || account || adminOpen || homepageEditor} />}
      {!isSearchPage && <nav className="category-tabs" aria-label="Media categories"><button className={isHome ? "active" : ""} onClick={() => go()}>Home</button>
        <button className={isDirectory && route.view === "browse" && route.type === "series" ? "active" : ""} onClick={() => go({ view: "browse", type: "series" })}>TV Shows</button>
        <button className={isDirectory && route.view === "browse" && route.type === "movie" ? "active" : ""} onClick={() => go({ view: "browse", type: "movie" })}>Movies</button>
        <button className={isDirectory && route.view === "cast" ? "active" : ""} onClick={() => go({ view: "cast" })}>Cast</button></nav>}
    </section>
    {route.view === "cast" && <div hidden={!isDirectory}><CastDirectory query={route.q} search={q => go({ view: "cast", q })} openPerson={openPerson} /></div>}
    {companyId !== null && personId === null && <section hidden={detailId !== null} className="content-page" key={`company-${companyId}`}><button className="back-button" onClick={back}>← Back</button><ProductionProfile key={companyId} id={companyId} renderItems={titles => <div className="media-grid">{titles.map((item, index) => <Card key={item.title_id} item={item} index={index} open={openTitle} />)}</div>} /></section>}
    {isDirectory && route.view !== "cast" && <section className="rail-section"><div className="section-heading"><div><p>{isHome ? "FROM YOUR LIBRARY" : "EXPLORE CHITRAVERSE"}</p><h2>{isHome ? "Hollywood movies" : heading}</h2></div>
      {isHome && items.length > 0 && <button aria-label="View all Hollywood movies" onClick={() => go({ view: "browse", type: "movie", collection: "hollywood" })}>→</button>}</div>
      {!isHome && route.view !== "search" && <AnimatedDisclosure key={route.view} kind="search" label={route.view === 'watchlist' ? 'Search your watchlist' : 'Search movies & series'}><form className="search-form" role="search" onSubmit={(event) => { event.preventDefault(); setRetry((current) => current + 1); }}>
        <label htmlFor="library-search">Search titles or actors</label><div className="search-field"><input id="library-search" type="search" value={route.q} maxLength={120} placeholder="Movie, TV show, actor or actress…" onChange={event => changeSearch(event.target.value)} /><button className="primary-button" type="submit">Search</button></div>
      </form><TitleFilterPanel key={JSON.stringify(filterParams(route))} value={{...emptyFilters,...filterParams(route)}} change={filters=>go({...route,...filters})} /></AnimatedDisclosure>}
      {route.view === 'search' && <TitleFilterPanel key={JSON.stringify(filterParams(route))} value={{...emptyFilters,...filterParams(route)}} change={filters=>go({...route,...filters})} />}
      {!isHome && error && <div className="message error" role="alert">{error}<button onClick={() => route.view === "watchlist" && !user ? setAccount(true) : setRetry((current) => current + 1)}>{route.view === "watchlist" && !user ? "Sign in" : "Try again"}</button></div>}
      {loading ? <p className="message" role="status">Loading library…</p> : <>
        {!isHome && !error && <p className="result-count" role="status">{`${total} ${total === 1 ? "title" : "titles"}${route.q.trim() ? ` matching “${route.q.trim()}”` : ""}`}</p>}
        {items.length ? <div className={isHome ? "media-rail" : "media-grid"}>{items.map((item, index) => <Card key={item.title_id} item={item} index={index} open={openTitle} />)}</div>
          : !error && !isHome && <p className="message">No titles match this search. Try changing or resetting the filters.</p>}
        {hasMore && <button className="primary-button load-more" disabled={loadingMore} onClick={loadMore}>{loadingMore ? "Loading…" : "Load more"}</button>}
      </>}
    </section>}
    {personId !== null && detailId === null && externalTitle === null && <section className="content-page" key={`person-${personId}`}><button className="back-button" onClick={back}>← Back</button><PersonProfile key={personId} id={personId} openTitle={openTitle} /></section>}
    {isHome && <HomeDiscovery openTitle={openTitle} openPerson={openPerson} openGenre={id => go({ view: 'search', genre: String(id) })} />}
    {externalTitle !== null && <section className="content-page title-page" key={externalTitle}><button className="back-button" onClick={back}>← Back</button><ExternalTitle reference={externalTitle} openTitle={openTitle} /></section>}
    {menu && <Dialog title="Navigation" close={() => setMenu(false)}><h2>Explore</h2><nav className="menu-links">
      <button onClick={() => go()}>Home · Hollywood</button><button onClick={() => go({ view: "browse", type: "movie" })}>All movies</button>
      <button onClick={() => go({ view: "browse", type: "series" })}>TV shows</button><button onClick={() => go({ view: "search" })}>Search the library</button>
      <button onClick={() => go({ view: "cast" })}>Cast &amp; crew</button>
      {user?.role === 'admin' && <button onClick={() => { setMenu(false); setHomepageEditor(true); }}>Manage homepage</button>}
      {user?.role === "admin" ? <button onClick={() => { setMenu(false); setAdminOpen(true); }}>Users &amp; activity</button> : <button onClick={() => go({ view: "watchlist" })}>My watchlist</button>}</nav></Dialog>}
    {detailId !== null && <section className="content-page title-page" key={detailId} aria-label={detail ? `About ${detail.title}` : "Title details"}><button className="back-button" onClick={back}>← Back</button>
      {detailError && <p className="message error" role="alert">{detailError}</p>}{!detail ? !detailError && <p role="status">Loading title…</p> : <>
        <div className="detail-heading"><div className="detail-poster"><Poster item={detail} /></div><div><p className="eyebrow">{detail.media_type === "series" ? "TV series" : "Movie"} {year(detail) && `· ${year(detail)}`}</p><h2>{detail.title}</h2>
          <p className="genre-list">{detail.genres?.map((genre) => genre.name).join(" · ")}</p><p>{detail.tmdb_rating != null ? `★ ${detail.tmdb_rating} TMDB` : "Not rated"}</p></div></div>
        {detail.description && <p className="detail-description">{detail.description}</p>}
        <TrailerPlayer key={detail.title_id} item={detail} autoPlay={trailerTitleId === detail.title_id} />
        <div className="detail-actions">
          {user?.role !== "admin" && <button className="secondary-button" disabled={saveBusy} onClick={() => saveTitle(detail)}>{saveBusy ? "Saving…" : watchlist.includes(detail.title_id) ? "Remove from watchlist" : "Add to watchlist"}</button>}</div>
        {detail.media_type === "movie" && <MovieRating key={`${detail.title_id}-${user?.user_id ?? "guest"}`} movie={detail} user={user} updated={data => setDetail(current => current?.title_id === detail.title_id ? { ...current, ...data } : current)} signIn={() => setAccount(true)} />}
        {!!detail.cast_crew?.length && <><h3>Cast &amp; crew</h3><ul className="cast-grid">{detail.cast_crew.map((person, index) => <li key={`${person.cast_crew_id}-${person.role_type}`} style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}>
          <button className="cast-card" onClick={() => openPerson(person.cast_crew_id)}><div className="cast-photo"><PersonPhoto name={person.name} photo={person.photo} /></div><strong>{person.name}</strong><small>{person.role_type}</small><span>View profile →</span></button></li>)}</ul></>}
        {!!detail.production_companies?.length && <ProductionCredits companies={detail.production_companies} openCompany={openCompany} />}
        {!!detail.seasons?.length && <><h3>Episodes</h3><label className="filter-label">Season<select value={season} onChange={(event) => setSeason(event.target.value)}>{detail.seasons.map((item) => <option key={item.season_id} value={item.season_number}>Season {item.season_number} · {item.total_episode} episodes</option>)}</select></label>
          {episodeError && <p role="alert">{episodeError}</p>}{episodesLoading ? <p role="status">Loading episodes…</p> : episodes.length ? <ol className="episodes">{episodes.map((episode) => <li key={episode.ep_id}>{episode.episode_number}. {episode.title}</li>)}</ol> : !episodeError && <p>No episodes are available for this season.</p>}</>}
      </>}
    </section>}
    {adminOpen && user?.role === "admin" && <Dialog title="Users and activity" close={() => setAdminOpen(false)}><AdminUsers /></Dialog>}
    {homepageEditor && user?.role === 'admin' && <Dialog title="Manage homepage" close={() => setHomepageEditor(false)}><AdminHomepage saved={() => { setHomepageEditor(false); go(); setRetry(value => value + 1); }} /></Dialog>}
    {account && !user && <AuthScreen register={register} busy={accountBusy} error={accountError} close={() => setAccount(false)} toggleMode={() => { setRegister(!register); setAccountError(""); }} submit={authenticate} />}
    {account && user && <Dialog title="Your profile" close={() => setAccount(false)}>
      <p className="eyebrow">YOUR PROFILE</p><h2>{user.name}</h2><p>{user.email}</p><p>Role: {user.role || "Not assigned"}</p>{user.role !== "admin" && <p>{watchlist.length} saved {watchlist.length === 1 ? "title" : "titles"}</p>}
        {user.role === 'admin' && <button className="primary-button" onClick={() => { setAccount(false); setHomepageEditor(true); }}>Manage homepage</button>}
        <div className="detail-actions">{user.role === "admin" ? <button className="primary-button" onClick={() => { setAccount(false); setDetailId(null); setAdminOpen(true); }}>Users &amp; activity</button> : <button className="primary-button" onClick={() => { setAccount(false); setDetailId(null); go({ view: "watchlist" }); }}>Open watchlist</button>}<button className="secondary-button" disabled={accountBusy} onClick={logout}>Sign out</button></div>
      {accountError && <p className="message error" role="alert">{accountError}</p>}
    </Dialog>}
  </main>;
}

"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type Media, type User } from "./api";
import BrandWordmark from './brand-wordmark';

const errorMessage = (error: unknown) => error instanceof ApiError ? error.message : "Could not connect. Please try again.";

export function MovieRating({ movie, user, updated, signIn }: { movie: Media; user: User | null; updated: (data: Partial<Media>) => void; signIn: () => void }) {
  const [rating, setRating] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(user?.role === "user");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (user?.role !== "user") return;
    const controller = new AbortController();
    api<{ rating: string | null }>(`/api/account/ratings/${movie.title_id}`, { signal: controller.signal })
      .then(data => { setRating(data.rating == null ? "" : String(Number(data.rating))); })
      .catch(error => { if (!controller.signal.aborted) setError(errorMessage(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [movie.title_id, user?.role]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setSaved(false);
    try {
      const result = await api<Partial<Media>>(`/api/account/ratings/${movie.title_id}`, { method: "PUT", body: JSON.stringify({ rating: Number(rating) }) });
      updated(result); setSaved(true);
    } catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <section className="role-panel" aria-label="Movie ratings">
    <h3><BrandWordmark /> rating</h3>
    <p>{movie.chitraverse_vote_count ? `${movie.chitraverse_rating}/10 · ${movie.chitraverse_vote_count} votes` : "No ratings yet. Be the first to rate this movie."}</p>
    {user?.role === "user" && <form onSubmit={submit} className="detail-actions">
      <label className="filter-label">Your rating<select required value={rating} disabled={loading || busy} onChange={event => { setRating(event.target.value); setSaved(false); }}>
        <option value="">Choose a rating</option>{Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}/10</option>)}
      </select></label>
      <button className="primary-button" disabled={loading || busy || !rating}>{busy ? "Saving…" : "Save rating"}</button>
    </form>}
    {!user && <button className="secondary-button" onClick={signIn}>Sign in to rate</button>}
    {saved && <p role="status">Your rating has been saved. Updating it replaces your previous vote.</p>}
    {error && <p role="alert" className="message error">{error}</p>}
  </section>;
}

type AdminUser = User & { created_at: string; activities: { kind: "rating" | "watchlist"; title: string; rating: string | null; occurred_at: string }[] };
export function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api<{ users: AdminUser[] }>("/api/account/admin/users", { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) { setUsers(data.users); setError(""); } })
      .catch(error => { if (!controller.signal.aborted) setError(errorMessage(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [retry]);
  return <section aria-label="Users and activity"><p className="eyebrow">ADMIN</p><h2>Users &amp; activity</h2>
    <p>Registered accounts, their latest movie ratings, and currently saved watchlist titles.</p>
    <button className="secondary-button" disabled={loading} onClick={() => { setLoading(true); setRetry(value => value + 1); }}>Refresh</button>
    {loading ? <p role="status">Loading users…</p> : error ? <p role="alert" className="message error">{error}</p> : <>
      <p>{users.length} registered accounts</p>
      {users.map(user => <article className="role-panel" key={user.user_id}>
        <h3>{user.name}</h3><p className="account-email">{user.email}</p><p>Role: {user.role || "Not assigned"} · Joined {new Date(user.created_at).toLocaleDateString()}</p>
        {user.activities.length ? <ul className="activity-list">{user.activities.map((activity, index) => <li key={index}>
          <span>{activity.kind === "rating" ? `Rated ${activity.title} ${activity.rating}/10` : `Saved ${activity.title} to watchlist`}</span>
          <small>{new Date(activity.occurred_at).toLocaleString()}</small>
        </li>)}</ul> : <p>No ratings or saved titles.</p>}
      </article>)}
    </>}
  </section>;
}

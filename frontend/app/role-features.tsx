"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type Media, type User } from "./api";
import BrandWordmark from './brand-wordmark';
import RatingPicker from './rating-picker';

const errorMessage = (error: unknown) => error instanceof ApiError ? error.message : "Could not connect. Please try again.";

export function ChitraVerseRating({ item }: { item: Media }) {
  return <span className="chitraverse-rating">ChitraVerse {item.chitraverse_vote_count && item.chitraverse_rating != null ? item.chitraverse_rating : '—'}</span>;
}

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
  return <section className="role-panel" aria-label="ChitraVerse ratings">
    <h3><BrandWordmark /> rating</h3>
    <p>{movie.chitraverse_vote_count ? `${movie.chitraverse_rating}/10 · ${movie.chitraverse_vote_count} votes` : "No ratings yet. Be the first to rate this title."}</p>
    {user?.role === "user" && <form onSubmit={submit} className="detail-actions">
      <RatingPicker value={rating} disabled={loading || busy} onChange={value => { setRating(value); setSaved(false); }} />
      <button className="primary-button" disabled={loading || busy || !rating}>{busy ? "Saving…" : "Save rating"}</button>
    </form>}
    {!user && <button className="secondary-button" onClick={signIn}>Sign in to rate</button>}
    {saved && <p role="status">Your rating has been saved. Updating it replaces your previous vote.</p>}
    {error && <p role="alert" className="message error">{error}</p>}
  </section>;
}

import './admin-users.css';

type AdminUser = User & { created_at: string; activities: { kind: "rating" | "watchlist" | "favorite" | "comment" | "story"; title: string; rating: string | null; detail?: string; occurred_at: string }[] };
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
  return <section className="admin-users-container admin-users-directory" aria-label="Users and activity">
    <div className="admin-users-header">
      <div className="admin-users-title-area">
        <h2>Users &amp; Activity</h2>
        <p>Manage registered accounts and monitor community interactions.</p>
      </div>
      <button className="admin-users-refresh" disabled={loading} onClick={() => { setLoading(true); setRetry(value => value + 1); }}>
        {loading ? "Refreshing..." : "↻ Refresh Data"}
      </button>
    </div>
    
    {loading ? <div className="admin-users-loading" role="status">Loading users…</div> : error ? <div className="admin-users-error" role="alert">{error}</div> : <>
      <div className="admin-users-stats">
        <div className="admin-stat-badge">
          <strong>{users.length}</strong> Registered Accounts
        </div>
        <div className="admin-stat-badge">
          <strong>{users.reduce((acc, user) => acc + user.activities.length, 0)}</strong> Total Activities
        </div>
      </div>
      
      <div className="admin-users-grid">
        {users.map(user => <article className="admin-user-card" key={user.user_id}>
          <div className="admin-user-header">
            <div className="admin-user-avatar">
              {user.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="admin-user-info">
              <h3>{user.name}</h3>
              <p>{user.email}</p>
            </div>
          </div>
          
          <div className="admin-user-meta">
            <span className={`admin-user-role ${user.role || 'unassigned'}`}>
              {user.role || "Not assigned"}
            </span>
            <span>Joined {new Date(user.created_at).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'})}</span>
          </div>
          
          <div className="admin-user-activities">
            <h4>Recent Activity</h4>
            {user.activities.length ? <ul className="admin-activity-list">{user.activities.map((activity, index) => <li key={index}>
              <span>{activity.kind !== "watchlist" ? `${activity.detail} · ${activity.title}` : `Saved ${activity.title} to watchlist`}</span>
              <small>{new Date(activity.occurred_at).toLocaleString()}</small>
            </li>)}</ul> : <p className="admin-activity-empty">No recorded activity yet.</p>}
          </div>
        </article>)}
      </div>
    </>}
  </section>;
}

export function OnlineUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api<{ users: any[] }>("/api/account/admin/online", { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) { setUsers(data.users); setError(""); } })
      .catch(error => { if (!controller.signal.aborted) setError(errorMessage(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [retry]);

  return (
    <section className="admin-users-container" aria-label="Online Users">
      <div className="admin-users-header">
        <div className="admin-users-title-area">
          <h2>Online Users</h2>
          <p>Monitor users who currently have active sessions.</p>
        </div>
        <button className="admin-users-refresh" disabled={loading} onClick={() => { setLoading(true); setRetry(value => value + 1); }}>
          {loading ? "Refreshing..." : "↻ Refresh Data"}
        </button>
      </div>

      {loading ? <div className="admin-users-loading" role="status">Loading online users…</div> : error ? <div className="admin-users-error" role="alert">{error}</div> : <>
        <div className="admin-users-stats">
          <div className="admin-stat-badge">
            <span style={{color: '#22c55e', fontSize: '18px'}}>●</span>
            <strong>{users.length}</strong> Users Online
          </div>
        </div>

        {users.length === 0 && <div className="admin-users-loading" style={{border: 'none', background: 'transparent'}}>No users are currently online.</div>}

        <div className="admin-users-grid">
          {users.map(user => (
            <article className="admin-user-card" key={user.user_id} style={{borderTop: '3px solid #22c55e'}}>
              <div className="admin-user-header">
                <div className="admin-user-avatar" style={{background: 'linear-gradient(135deg, #10b981, #047857)', boxShadow: '0 4px 10px rgba(16, 185, 129, 0.3)'}}>
                  {user.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="admin-user-info">
                  <h3>{user.name}</h3>
                  <p>{user.email}</p>
                </div>
              </div>

              <div className="admin-user-meta" style={{borderBottom: 'none', paddingBottom: 0}}>
                <span className={`admin-user-role ${user.role || 'unassigned'}`}>
                  {user.role || "Not assigned"}
                </span>
                <span>Active Session</span>
              </div>
            </article>
          ))}
        </div>
      </>}
    </section>
  );
}

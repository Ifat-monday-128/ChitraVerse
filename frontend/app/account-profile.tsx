"use client";

import { useEffect, useState, type FormEvent } from 'react';
import { api, posterUrl, type Media, type User } from './api';
import './account-profile.css';

type Profile = { user: User; counts: { favorites: number; playlists: number; ratings: number; stories: number }; favorites: Media[]; playlists: { watchlist_id: number; name: string; title_count: number }[] };
type Activity = { kind: string; id: string; title: string; title_id: number | null; detail: string | null; occurred_at: string };
type Tab = 'Overview' | 'My account' | 'Activity' | 'Security';
export type AccountProfileProps = {
  user: User; updated: (user: User) => void; logout: () => void; busy: boolean; error: string;
  favorites: () => void; watchlists: () => void; openTitle: (id: number) => void; openList: (id: number) => void;
  community: () => void; homepage: () => void; activity: () => void;
};
const errorMessage = (e: unknown) => e instanceof Error ? e.message : 'Something went wrong. Please try again.';
const dateLabel = (value?: string) => value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';

async function preparePhoto(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('Choose a JPG, PNG, or WebP photo up to 5 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Photo processing is unavailable in this browser.');
    const side = Math.min(bitmap.width, bitmap.height);
    ctx.fillStyle = '#191c20'; ctx.fillRect(0, 0, 256, 256);
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256);
    for (const quality of [0.85, 0.7, 0.5, 0.3]) {
      const result = canvas.toDataURL('image/jpeg', quality);
      if (result.length < 60000) return result;
    }
    throw new Error('This photo is too detailed. Please choose a simpler image.');
  } finally { bitmap.close(); }
}

export default function AccountProfile(props: AccountProfileProps) {
  const [tab, setTab] = useState<Tab>('Overview');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState(props.user.name);
  const [avatar, setAvatar] = useState<string | null>(props.user.avatar || null);
  const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false); const [processing, setProcessing] = useState(false);
  const [retry, setRetry] = useState(0);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [hasMore, setHasMore] = useState(false); const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState('');
  const admin = props.user.role === 'admin';
  useEffect(() => {
    const controller = new AbortController();
    api<Profile>('/api/account/profile', { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return;
      setProfile(data); setName(data.user.name); setAvatar(data.user.avatar || null); setError('');
    }).catch(e => { if (!controller.signal.aborted) setError(errorMessage(e)); });
    return () => controller.abort();
  }, [props.user.user_id, retry]);
  useEffect(() => {
    if (tab !== 'Activity') return;
    const controller = new AbortController();
    api<{ items: Activity[]; hasMore: boolean }>('/api/account/activity', { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) { setActivities(data.items); setHasMore(data.hasMore); }
    }).catch(e => { if (!controller.signal.aborted) setActivityError(errorMessage(e)); }).finally(() => { if (!controller.signal.aborted) setActivityLoading(false); });
    return () => controller.abort();
  }, [tab, props.user.user_id, retry]);
  async function moreActivity() {
    setActivityLoading(true); setActivityError('');
    try { const data = await api<{ items: Activity[]; hasMore: boolean }>(`/api/account/activity?offset=${activities.length}`); setActivities(current => [...current, ...data.items]); setHasMore(data.hasMore); }
    catch (e) { setActivityError(errorMessage(e)); } finally { setActivityLoading(false); }
  }
  async function saveProfile(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(''); setSuccess('');
    try {
      const data = await api<{ user: User }>('/api/account/profile', { method: 'PATCH', body: JSON.stringify({ name, avatar }) });
      props.updated(data.user); setProfile(current => current ? { ...current, user: data.user } : current); setSuccess('Your profile has been updated.');
    } catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  }
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    setError(''); setSuccess('');
    if (data.get('new_password') !== data.get('confirm_password')) { setError('The new passwords do not match.'); return; }
    setSaving(true);
    try { await api('/api/account/password', { method: 'PUT', body: JSON.stringify({ current_password: data.get('current_password'), new_password: data.get('new_password') }) }); form.reset(); setSuccess('Password updated. Your other sessions have been signed out.'); }
    catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  }
  const displayedUser = profile?.user || props.user;
  function navigate(next: Tab) { if (next === 'Activity' && tab !== next) { setActivityLoading(true); setActivityError(''); } setTab(next); setSuccess(''); if (profile) setError(''); }
  function portrait(photo: string | null | undefined, large = false) { return <span className={`account-portrait ${large ? 'large' : ''}`}>{photo ? <img src={photo} alt={`${displayedUser.name}'s profile`} /> : <span>{displayedUser.name.slice(0, 2).toUpperCase()}</span>}</span>; }
  return <section className="account-hub" aria-label="Account dashboard">
    <aside className="account-sidebar">
      <div className="account-brand">CHITRA<span>VERSE</span><small>YOUR PERSONAL SPACE</small></div>
      <div className="account-sidebar-person">{portrait(displayedUser.avatar)}<strong>{displayedUser.name}</strong><span className="account-role">{admin ? 'Administrator' : props.user.role === 'moderator' ? 'Moderator' : 'Cinema lover'}</span></div>
      <nav aria-label="Account sections">{(['Overview', 'My account', 'Activity', 'Security'] as Tab[]).map((item, index) => <button type="button" key={item} className={tab === item ? 'active' : ''} aria-current={tab === item ? 'page' : undefined} onClick={() => navigate(item)}><span aria-hidden="true">{['◫', '◎', '◷', '◇'][index]}</span>{item}<b aria-hidden="true">›</b></button>)}
        {!admin && <><p>YOUR LIBRARY</p><button onClick={props.favorites}><span aria-hidden="true">♡</span>Favorites<b aria-hidden="true">›</b></button><button onClick={props.watchlists}><span aria-hidden="true">▤</span>Playlists<b aria-hidden="true">›</b></button></>}
      </nav>
      <button className="account-signout" onClick={props.logout} disabled={props.busy || saving}>{props.busy ? 'Signing out…' : 'Sign out'}<span aria-hidden="true">↗</span></button>
    </aside>
    <div className="account-main">
      <header className="account-page-heading"><div><p className="eyebrow">YOUR CHITRAVERSE</p><h1>{tab === 'Overview' ? 'Your next chapter.' : tab === 'My account' ? 'Make it yours.' : tab === 'Activity' ? 'Your cinema journey.' : 'Keep your account secure.'}</h1><p>{tab === 'Overview' ? `Welcome back, ${displayedUser.name}. Your next great watch starts here.` : tab === 'My account' ? 'A familiar face. A name that feels like you.' : tab === 'Activity' ? 'Your ratings, saved titles, comments, and published stories.' : 'Manage your password and protect your personal space.'}</p></div><span className="account-member-since">{displayedUser.created_at ? `Member since ${dateLabel(displayedUser.created_at)}` : 'CHITRAVERSE MEMBER'}</span></header>
      {(error || props.error) && <div className="account-notice error" role="alert">{error || props.error}{!profile && <button className="text-button" onClick={() => setRetry(n => n + 1)}>Try again</button>}</div>}
      {success && <p className="account-notice success" role="status">{success}</p>}
      {!profile ? (!error ? <p className="account-loading" role="status">Loading your personal space…</p> : null) : <>
      {tab === 'Overview' && <>
        <div className="account-welcome"><div className="account-hero-art" aria-hidden="true">{profile.favorites.slice(0,3).map(item => posterUrl(item.poster) ? <img key={item.title_id} src={posterUrl(item.poster)} alt="" /> : null)}</div><div className="account-hero-copy"><span className="eyebrow">YOUR WORLD OF CINEMA</span><h2>Good stories stay with you.</h2><p>Keep the films you love close, and the ones you have yet to discover closer.</p><div className="account-hero-actions"><button className="primary-button" onClick={admin ? props.homepage : props.watchlists}>{admin ? 'Manage homepage' : 'My watchlists'} <span aria-hidden="true">&#8599;</span></button><button className="secondary-button" onClick={() => navigate('My account')}>Manage profile</button></div></div></div>
        <div className="account-stats">{Object.entries(profile?.counts || {}).map(([key, value]) => <button key={key} onClick={() => key === 'favorites' ? props.favorites() : key === 'playlists' ? props.watchlists() : navigate('Activity')} disabled={admin && (key === 'favorites' || key === 'playlists')}><strong>{value.toLocaleString()}</strong><span>{key}</span></button>)}</div>
        <div className="account-quick-actions"><button onClick={() => navigate('My account')}><span aria-hidden="true">◎</span><div><strong>My account</strong><small>Update your name and profile photo</small></div><b aria-hidden="true">↗</b></button><button onClick={() => navigate('Security')}><span aria-hidden="true">◇</span><div><strong>Password & security</strong><small>A little peace of mind for your account</small></div><b aria-hidden="true">↗</b></button></div>
        {admin ? <div className="account-quick-actions"><button onClick={props.homepage}>Manage homepage <b>↗</b></button><button onClick={props.activity}>Users & activity <b>↗</b></button></div> : <>
          <div className="account-section-heading"><h2>On your favorites shelf</h2><button className="text-button" onClick={props.favorites}>View all ↗</button></div>
          {profile?.favorites.length ? <div className="account-favorites">{profile.favorites.map(item => <button key={item.title_id} onClick={() => props.openTitle(item.title_id)}><span className="account-poster">{posterUrl(item.poster) ? <img src={posterUrl(item.poster)} alt="" loading="lazy" /> : <span>No poster</span>}<span className="account-poster-heart" aria-hidden="true">♥</span></span><strong>{item.title}</strong><small>{item.media_type === 'movie' ? 'Movie' : 'TV series'}{item.tmdb_rating ? ` · ★ ${item.tmdb_rating}` : ''}</small></button>)}</div> : <div className="account-empty"><span aria-hidden="true">♡</span><h3>Your favorites belong here.</h3><p>Tap the favorite button on a movie or series to start your collection.</p><button className="text-button" onClick={props.favorites}>Explore favorites ↗</button></div>}
          <div className="account-section-heading"><h2>Made for your next movie night</h2><button className="text-button" onClick={props.watchlists}>All playlists ↗</button></div>
          {profile?.playlists.length ? <div className="account-playlists">{profile.playlists.map(list => <button key={list.watchlist_id} onClick={() => props.openList(list.watchlist_id)}><span aria-hidden="true">▤</span><div><strong>{list.name}</strong><small>{list.title_count} {list.title_count === 1 ? 'title' : 'titles'} · Watchlist</small></div><b aria-hidden="true">↗</b></button>)}</div> : <div className="account-empty compact"><p>A weekend marathon or a list of hidden gems? Give your next watch a home.</p><button className="secondary-button" onClick={props.watchlists}>Create a playlist</button></div>}
        </>}
        <div className="account-community"><div><h2>Every film starts a conversation.</h2><p>Share a story with the ChitraVerse community.</p></div><button className="secondary-button" onClick={props.community}>Visit CVcommunity ↗</button></div>
      </>}
      {tab === 'My account' && <form className="account-settings" onSubmit={saveProfile}><h2>Profile details</h2><p>Let the community put a face to your name.</p><div className="account-photo-editor">{portrait(avatar, true)}<div><label className="secondary-button account-upload">{processing ? 'Preparing photo…' : 'Upload photo'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={saving || processing} onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; setProcessing(true); setError(''); setSuccess(''); try { setAvatar(await preparePhoto(file)); } catch (err) { setError(errorMessage(err)); } finally { setProcessing(false); } }} /></label><p>JPG, PNG or WebP. Up to 5 MB.<br />Your photo is cropped and optimized automatically.</p>{avatar && <button type="button" className="text-button" disabled={saving || processing} onClick={() => setAvatar(null)}>Remove photo</button>}</div></div><label className="account-field">Display name<input required maxLength={255} value={name} disabled={saving} onChange={e => setName(e.target.value)} autoComplete="name" /></label><label className="account-field">Email address<input value={displayedUser.email} readOnly type="email" /><small>Your email identifies your account.</small></label><div className="account-form-footer"><span>Visible on your stories and comments.</span><button className="primary-button" disabled={saving || processing || !name.trim()}>{saving ? 'Saving…' : 'Save changes'}</button></div></form>}
      {tab === 'Security' && <form className="account-settings" onSubmit={changePassword}><h2>Change password</h2><p>Use a unique password with at least 8 characters.</p><label className="account-field">Current password<input name="current_password" type="password" required maxLength={128} autoComplete="current-password" disabled={saving} /></label><label className="account-field">New password<input name="new_password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" disabled={saving} /></label><label className="account-field">Confirm new password<input name="confirm_password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" disabled={saving} /></label><div className="account-security-note"><span aria-hidden="true">◇</span><p>Changing your password signs out your other sessions. You will stay signed in here.</p></div><button className="primary-button" disabled={saving}>{saving ? 'Updating…' : 'Update password'}</button></form>}
      {tab === 'Activity' && <section className="account-settings account-activity"><div className="account-section-heading"><h2>Activity log</h2><span>Most recent first</span></div>{activityError && <p className="account-notice error" role="alert">{activityError}<button className="text-button" onClick={() => setRetry(n => n + 1)}>Try again</button></p>}<ol>{activities.map(item => <li key={`${item.kind}-${item.id}`}><span className={`account-activity-icon ${item.kind}`} aria-hidden="true">{{ rating: '★', favorite: '♡', playlist: '▤', comment: '“', story: '✎' }[item.kind]}</span><div><small>{{ rating: 'Rating activity', favorite: 'Added to favorites', playlist: 'Saved to a playlist', comment: 'Joined the conversation', story: 'Published a story' }[item.kind]}</small>{item.title_id ? <button className="account-activity-title" onClick={() => props.openTitle(item.title_id!)}>{item.title}</button> : <strong>{item.title}</strong>}{item.detail && <p>{item.detail}</p>}</div><time dateTime={item.occurred_at}>{dateLabel(item.occurred_at)}</time></li>)}</ol>{activityLoading && <p role="status">Loading activity…</p>}{!activityLoading && !activityError && !activities.length && <div className="account-empty"><span aria-hidden="true">◷</span><h3>Your journey is just beginning.</h3><p>Rate a movie, save a favorite, or share a story to see it here.</p></div>}{hasMore && <button className="secondary-button" disabled={activityLoading} onClick={moreActivity}>Load more activity</button>}</section>}
      </>}
    </div>
  </section>;
}

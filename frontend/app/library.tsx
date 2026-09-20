"use client";

import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type Media, type User } from './api';
import Dialog from './dialog';
import Card from './media-card';
import './library.css';

type Watchlist = { watchlist_id: number; name: string; title_count: number; contains_title: boolean };
const message = (error: unknown) => error instanceof ApiError ? error.message : 'Could not connect. Please try again.';

function NameForm({ name = '', label, busy, submit }: { name?: string; label: string; busy: boolean; submit: (name: string) => Promise<void> }) {
  const [value, setValue] = useState(name);
  async function save(event: FormEvent) { event.preventDefault(); await submit(value.trim()); }
  return <form className="account-form library-name-form" onSubmit={save}>
    <label>Watchlist name<input autoFocus required maxLength={255} value={value} disabled={busy} onChange={event => setValue(event.target.value)} placeholder="Weekend movies" /></label>
    <button className="primary-button" disabled={busy || !value.trim()}>{busy ? 'Saving…' : label}</button>
  </form>;
}

export function WatchlistChooser({ item, close }: { item: Media; close: () => void }) {
  const [lists, setLists] = useState<Watchlist[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api<{ watchlists: Watchlist[] }>(`/api/account/watchlists?title_id=${item.title_id}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) { setLists(data.watchlists); setError(''); } })
      .catch(error => { if (!controller.signal.aborted) setError(message(error)); });
    return () => controller.abort();
  }, [item.title_id, retry]);
  async function toggle(list: Watchlist) {
    setBusy(true); setError('');
    try {
      const result = await api<{ saved: boolean }>(`/api/account/watchlists/${list.watchlist_id}/items/${item.title_id}`, { method: list.contains_title ? 'DELETE' : 'PUT' });
      setLists(current => current?.map(row => row.watchlist_id === list.watchlist_id ? { ...row, contains_title: result.saved, title_count: row.title_count + (result.saved ? 1 : -1) } : row) ?? null);
    } catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  }
  async function create(name: string) {
    setBusy(true); setError('');
    try {
      const result = await api<{ watchlist: Watchlist }>('/api/account/watchlists', { method: 'POST', body: JSON.stringify({ name }) });
      setLists(current => [...(current ?? []), result.watchlist]); setCreating(false);
    } catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  }
  return <Dialog title="Add to watchlist" close={close}>
    <p className="eyebrow">YOUR LIBRARY</p><h2>Add to watchlist</h2><p>{item.title}</p>
    <p className="unavailable">Choose each list where you want to save this title. Changes save immediately.</p>
    {error && <p className="message error" role="alert">{error} <button disabled={busy} onClick={() => { setError(''); setLists(null); setRetry(value => value + 1); }}>Try again</button></p>}
    {!lists && !error && <p role="status">Loading watchlists…</p>}
    {lists && <><div className="watchlist-choices" aria-busy={busy}>{lists.map(list => <label key={list.watchlist_id} className="watchlist-choice">
      <input type="checkbox" checked={list.contains_title} disabled={busy} onChange={() => toggle(list)} />
      <span><strong>{list.name}</strong><small>{list.title_count} {list.title_count === 1 ? 'title' : 'titles'}</small></span>
    </label>)}</div>
      {!lists.length && <p className="message">No watchlists yet. Create a watchlist to organize movies and series you want to see.</p>}
      {creating ? <NameForm label="Create watchlist" busy={busy} submit={create} /> : <button className="text-button" disabled={busy} onClick={() => setCreating(true)}>+ Create new watchlist</button>}
    </>}
    <div className="detail-actions"><button className="primary-button" disabled={busy} onClick={close}>Done</button></div>
  </Dialog>;
}

export function TitleLibraryActions({ item, user, signIn }: { item: Media; user: User | null; signIn: () => void }) {
  const [chooser, setChooser] = useState(false);
  const [favorite, setFavorite] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!user || user.role === 'admin') return;
    const controller = new AbortController();
    api<{ saved: boolean }>(`/api/account/favorites/${item.title_id}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) { setFavorite(data.saved); setError(''); } })
      .catch(error => { if (!controller.signal.aborted) setError(message(error)); });
    return () => controller.abort();
  }, [item.title_id, user, retry]);
  async function toggleFavorite() {
    if (!user) return signIn();
    setBusy(true); setError('');
    try {
      const result = await api<{ saved: boolean }>(`/api/account/favorites/${item.title_id}`, { method: favorite ? 'DELETE' : 'PUT' });
      setFavorite(result.saved);
    } catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  }
  if (user?.role === 'admin') return null;
  return <><div className="detail-actions title-library-actions">
    <button className="secondary-button" onClick={() => user ? setChooser(true) : signIn()}>Add to watchlist</button>
    <button className="secondary-button favorite-button" aria-pressed={favorite === true} disabled={busy || (!!user && favorite === null)} onClick={toggleFavorite}>
      {busy ? 'Saving…' : user && favorite === null ? 'Loading favorites…' : favorite ? '♥ Favorited' : '♡ Add to favorites'}
    </button>
  </div>
    {error && <p className="message error" role="alert">{error} <button disabled={busy} onClick={() => { setError(''); setRetry(value => value + 1); }}>Try again</button></p>}
    {chooser && <WatchlistChooser item={item} close={() => setChooser(false)} />}
  </>;
}

export function LibraryPage({ kind, listId, user, signIn, openList, openTitle }: {
  kind: 'watchlist' | 'favorites'; listId: number | null; user: User | null; signIn: () => void;
  openList: (id: number | null) => void; openTitle: (id: number) => void;
}) {
  const [lists, setLists] = useState<Watchlist[]>([]);
  const [list, setList] = useState<Watchlist | null>(null);
  const [items, setItems] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [editing, setEditing] = useState<'create' | 'rename' | 'delete' | null>(null);
  const [editError, setEditError] = useState('');
  const favorites = kind === 'favorites';
  const showingTitles = favorites || listId !== null;
  useEffect(() => {
    if (!user || user.role === 'admin') return;
    const controller = new AbortController();
    const path = favorites ? '/api/account/favorites' : listId ? `/api/account/watchlists/${listId}` : '/api/account/watchlists';
    api<{ watchlists?: Watchlist[]; watchlist?: Watchlist; items?: Media[] }>(path, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) { setLists(data.watchlists ?? []); setList(data.watchlist ?? null); setItems(data.items ?? []); setError(''); } })
      .catch(error => { if (!controller.signal.aborted) setError(message(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [user, favorites, listId, retry]);
  async function saveList(name: string) {
    setBusy(true); setEditError('');
    try {
      const result = await api<{ watchlist: Watchlist }>(editing === 'rename' ? `/api/account/watchlists/${listId}` : '/api/account/watchlists', { method: editing === 'rename' ? 'PATCH' : 'POST', body: JSON.stringify({ name }) });
      if (editing === 'rename') setList(result.watchlist);
      else setLists(current => [...current, result.watchlist]);
      setEditing(null);
    } catch (error) { setEditError(message(error)); }
    finally { setBusy(false); }
  }
  async function deleteList() {
    setBusy(true); setEditError('');
    try { await api(`/api/account/watchlists/${listId}`, { method: 'DELETE' }); openList(null); }
    catch (error) { setEditError(message(error)); }
    finally { setBusy(false); }
  }
  async function remove(item: Media) {
    setBusy(true); setError('');
    try {
      await api(favorites ? `/api/account/favorites/${item.title_id}` : `/api/account/watchlists/${listId}/items/${item.title_id}`, { method: 'DELETE' });
      setItems(current => current.filter(row => row.title_id !== item.title_id));
    } catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  }
  function edit(value: 'create' | 'rename' | 'delete') { setEditError(''); setEditing(value); }
  return <section className="rail-section library-page">
    {listId && !favorites && <button className="back-button" onClick={() => openList(null)}>← My Watchlists</button>}
    <div className="section-heading"><div><p>YOUR LIBRARY</p><h2>{favorites ? 'Favorites' : listId ? list?.name || 'Watchlist' : 'My Watchlists'}</h2></div></div>
    {!user ? <div className="message">Sign in to organize your movies and series. <button onClick={signIn}>Sign in</button></div>
      : user.role === 'admin' ? <p className="message">Personal libraries are available to viewer accounts.</p> : <>
        {!favorites && <div className="detail-actions">{listId ? list && <><button className="secondary-button" disabled={busy} onClick={() => edit('rename')}>Rename watchlist</button><button className="secondary-button" disabled={busy} onClick={() => edit('delete')}>Delete watchlist</button></> : <button className="primary-button" disabled={busy} onClick={() => edit('create')}>+ Create Watchlist</button>}</div>}
        {error && <p className="message error" role="alert">{error} <button disabled={busy} onClick={() => { setError(''); setLoading(true); setRetry(value => value + 1); }}>Try again</button></p>}
        {loading ? <p className="message" role="status">Loading {favorites ? 'favorites' : 'watchlists'}…</p> : showingTitles ? <>
          {!error && <p className="result-count" role="status">{items.length} {items.length === 1 ? 'title' : 'titles'}</p>}
          <div className="media-grid">{items.map((item, index) => <article className="library-title" key={item.title_id}><Card item={item} index={index} open={openTitle} /><button className="text-button" aria-label={`Remove ${item.title} from ${favorites ? 'favorites' : list?.name || 'watchlist'}`} disabled={busy} onClick={() => remove(item)}>Remove {favorites ? 'favorite' : 'from list'}</button></article>)}</div>
          {!items.length && !error && <p className="message">{favorites ? 'No favorites yet. Movies and series you love will appear here.' : 'Nothing here yet. Add movies or series to this watchlist.'}</p>}
        </> : <><div className="watchlist-grid">{lists.map(row => <button className="watchlist-card" key={row.watchlist_id} onClick={() => openList(row.watchlist_id)}><span className="eyebrow">WATCHLIST</span><strong>{row.name}</strong><span>{row.title_count} {row.title_count === 1 ? 'title' : 'titles'}</span><span className="watchlist-arrow" aria-hidden="true">→</span></button>)}</div>
          {!lists.length && !error && <p className="message">No watchlists yet. Create a watchlist to organize movies and series you want to see.</p>}
        </>}
      </>}
    {editing && <Dialog title={editing === 'create' ? 'Create watchlist' : editing === 'rename' ? 'Rename watchlist' : 'Delete watchlist'} close={() => setEditing(null)}>
      <p className="eyebrow">YOUR LIBRARY</p><h2>{editing === 'create' ? 'Create watchlist' : editing === 'rename' ? 'Rename watchlist' : 'Delete watchlist'}</h2>
      {editing === 'delete' ? <><p>Delete “{list?.name}” and its saved titles? Your other watchlists and favorites will stay as they are.</p><div className="detail-actions"><button className="primary-button" disabled={busy} onClick={deleteList}>{busy ? 'Deleting…' : 'Delete watchlist'}</button><button className="secondary-button" disabled={busy} onClick={() => setEditing(null)}>Cancel</button></div></>
        : <NameForm name={editing === 'rename' ? list?.name : ''} label={editing === 'create' ? 'Create watchlist' : 'Save name'} busy={busy} submit={saveList} />}
      {editError && <p className="message error" role="alert">{editError}</p>}
    </Dialog>}
  </section>;
}

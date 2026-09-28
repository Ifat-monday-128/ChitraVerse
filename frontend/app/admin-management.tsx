"use client";
import { useEffect, useState, type FormEvent } from 'react';
import { api, type User } from './api';
import Dialog from './dialog';
import TmdbImport from './tmdb-import';
import MetadataEditor, { type Structured } from './metadata-editor';
import { Poster } from './media-card';

type Title = { title_id?: number; title: string; description: string; language: string; poster: string; trailer_link: string; media_type: 'movie' | 'series'; release_date: string; runtime: number | null };
type Entry = { kind: string; id: number; title: string; content: string; name: string; created_at: string };
type Row = Title & User & Entry;
type Section = 'catalog' | 'accounts' | 'moderation';
const blank: Title = { title: '', description: '', language: '', poster: '', trailer_link: '', media_type: 'movie', release_date: '', runtime: null };
const message = (e: unknown) => e instanceof Error ? e.message : 'Could not save. Please try again.';

export default function AdminManagement({ section, userId, changed }: { section: Section; userId: number; changed: () => void }) {
  const [rows, setRows] = useState<Row[]>([]), [query, setQuery] = useState(''), [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [version, setVersion] = useState(0);
  const [editing, setEditing] = useState<Title | null>(null);
  const [metadata,setMetadata]=useState<Structured>({cast:[],companies:[],awards:[]});
  const [metadataLoading,setMetadataLoading]=useState(false),[metadataReady,setMetadataReady]=useState(false);
  const [suspension,setSuspension]=useState<Row|null>(null),[suspensionReason,setSuspensionReason]=useState(''),[expiry,setExpiry]=useState('');
  useEffect(()=>{if(!editing)return;const c=new AbortController();Promise.resolve().then(()=>{if(c.signal.aborted)return;setMetadataReady(false);if(!editing.title_id){setMetadata({cast:[],companies:[],awards:[]});setMetadataReady(true);return;}setMetadataLoading(true);return api<Structured>(`/api/account/admin/catalog/${editing.title_id}/metadata`,{signal:c.signal});}).then(d=>{if(d&&!c.signal.aborted){setMetadata(d);setMetadataReady(true);}}).catch(e=>{if(!c.signal.aborted)setError(message(e));}).finally(()=>{if(!c.signal.aborted)setMetadataLoading(false);});return()=>c.abort();},[editing]);
  const [confirmation, setConfirmation] = useState<{ path: string; method: string; body?: object; title: string; detail: string; confirmLabel?: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true); setError('');
      api<{ items: Row[]; hasMore: boolean }>(`/api/account/admin/${section}?q=${encodeURIComponent(query)}&offset=${offset}`, { signal: controller.signal })
        .then(data => { if (!controller.signal.aborted) { setRows(data.items); setHasMore(data.hasMore); } })
        .catch(e => { if (!controller.signal.aborted) setError(message(e)); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [section, query, offset, version]);
  async function mutate(path: string, method: string, body?: object) {
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/account/admin/${path}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
      setEditing(null); setConfirmation(null); setNotice('Changes saved.'); setVersion(v => v + 1); changed();
      return true;
    } catch (e) { setError(message(e)); return false; } finally { setBusy(false); }
  }
  function save(event: FormEvent) {
    event.preventDefault(); if (!editing || !metadataReady) return;
    void mutate(`catalog${editing.title_id ? `/${editing.title_id}` : ''}`, editing.title_id ? 'PUT' : 'POST', {...editing,...metadata});
  }
  const descriptions = {
    catalog: 'Maintain accurate movie and series details. Search for an existing title before adding a new one.',
    accounts: 'Manage access by role or sign an account out of every device. Role changes also end its active sessions.',
    moderation: 'Review stories and comments. Remove spam, harassment, or spoilers that break your community rules; preserve respectful criticism.',
  };
  return <section className="management" aria-label={`${section} management`}>
    <p className="management-intro">{descriptions[section]}</p>
    <div className="management-toolbar"><label><span className="sr-only">Search {section}</span><input type="search" placeholder={`Search ${section}…`} value={query} maxLength={120} onChange={e => { setQuery(e.target.value); setOffset(0); }} /></label>{section === 'catalog' && <button className="primary-button" onClick={() => { setError(''); setEditing({ ...blank }); }}>+ Add title</button>}</div>
    {error && !editing && !confirmation && <p role="alert" className="admin-feedback error">{error} <button className="text-button" onClick={() => setVersion(v => v + 1)}>Retry</button></p>}
    {notice && <p role="status" className="admin-feedback">{notice}</p>}
    {loading ? <p role="status" className="admin-loading">Loading {section}…</p> : error ? null : <>
      {!rows.length && <div className="management-empty"><h3>{query ? 'No matching results' : 'Nothing here yet'}</h3><p>{query ? 'Try a different search.' : 'New records will appear here.'}</p></div>}
      {section === 'catalog' && <div className="management-catalog">{rows.map(row => <article key={row.title_id}>
        <div className="management-poster"><Poster item={{...row,title_id:row.title_id!,tmdb_rating:null}}/><span className="management-type">{row.media_type === 'movie' ? 'MOVIE' : 'SERIES'}</span></div>
        <div><h3>{row.title}</h3><p>{row.release_date?.slice(0,4) || 'Date not set'} · {row.language || 'Language not set'}</p><small>{!row.poster ? 'Missing poster' : !row.trailer_link ? 'Missing trailer' : 'Poster & trailer ready'}</small><div className="management-actions"><button className="secondary-button" onClick={() => { setError(''); setEditing({ ...row, description: row.description || '', language: row.language || '', poster: row.poster || '', trailer_link: row.trailer_link || '', release_date: row.release_date || '', runtime: row.runtime ?? null }); }}>Edit title</button><button className="text-button management-danger" onClick={() => { setError(''); setConfirmation({ path: `catalog/${row.title_id}`, method: 'DELETE', title: `Delete "${row.title}"?`, detail: 'This permanently removes the title, episodes, ratings, comments, favorites, and watchlist memberships. This cannot be undone.', body: { confirmation: row.title }, confirmLabel: 'Confirm delete' }); }}>Delete</button></div></div>
      </article>)}</div>}
      {section === 'accounts' && <div className="admin-table-wrap"><table><thead><tr><th>Member</th><th>Role</th><th>Access controls</th></tr></thead><tbody>{rows.map(row => <tr key={row.user_id}><td><strong>{row.name}{row.user_id === userId ? ' (you)' : ''}</strong><small>{row.email}</small></td><td><span className="admin-role-badge">{row.role}</span></td><td><div className="management-actions"><select aria-label={`Role for ${row.name}`} value={row.role || ''} disabled={busy || row.user_id === userId} onChange={e => { setError(''); setConfirmation({ path: `accounts/${row.user_id}`, method: 'PATCH', body: { role: e.target.value }, title: `Change ${row.name}'s role?`, detail: `Set this account to ${e.target.value}. Administrators can manage the catalog, community, and other accounts. All active sessions for this account will end.` }); }}><option value="user">User</option><option value="moderator">Moderator</option><option value="admin">Administrator</option></select><button className="text-button" disabled={busy || row.user_id === userId} onClick={() => { setError(''); setConfirmation({ path: `accounts/${row.user_id}/sessions`, method: 'DELETE', title: 'Sign out all devices?', detail: `${row.name} will need to sign in again. This does not suspend the account or change its password.` }); }}>Sign out devices</button><button className="text-button" disabled={busy||row.user_id===userId} onClick={()=>{setSuspension(row);setSuspensionReason('');setExpiry('');}}>{row.suspension_reason ? 'Manage suspension' : 'Suspend'}</button></div></td></tr>)}</tbody></table></div>}
      {section === 'moderation' && <div className="management-moderation">{rows.map(row => <article key={`${row.kind}-${row.id}`}><div className="management-moderation-meta"><span className="admin-role-badge">{row.kind}</span><span>{row.name} · {new Date(row.created_at).toLocaleDateString()}</span></div><h3>{row.title}</h3><p>{row.content}</p><button className="text-button management-danger" onClick={() => { setError(''); setConfirmation({ path: `moderation/${row.kind}/${row.id}`, method: 'DELETE', title: `Remove this ${row.kind}?`, detail: 'This permanently removes the content from the community. This action cannot be undone.' }); }}>Remove {row.kind}</button></article>)}</div>}
    </>}
    <div className="management-pagination"><button className="secondary-button" disabled={loading || !offset} onClick={() => setOffset(n => Math.max(0,n - 20))}>Previous</button><span>Page {offset / 20 + 1}</span><button className="secondary-button" disabled={loading || !hasMore} onClick={() => setOffset(n => n + 20)}>Next</button></div>
    {editing && <Dialog busy={busy} title={editing.title_id ? 'Edit title' : 'Add title'} close={() => { if (!busy) { setEditing(null); setError(''); } }}><form className="management-editor" onSubmit={save}><p className="eyebrow">CATALOG EDITOR</p><h2>{editing.title_id ? 'Edit title' : 'Add a new title'}</h2><p>Use verified metadata. Community ratings and imported TMDB scores cannot be edited here.</p>{error && <p role="alert" className="admin-feedback error">{error}</p>}{!editing.title_id && <TmdbImport busy={busy} setBusy={setBusy} complete={result => { setBusy(false); setEditing(null); setNotice(result.title + ' imported: ' + result.people + ' people, ' + result.genres + ' genres, ' + result.companies + ' companies, ' + result.seasons + ' seasons, ' + result.episodes + ' episodes, ' + result.providers + ' streaming providers (' + result.region + ').'); setVersion(v => v + 1); changed(); }} />}<fieldset disabled={busy}>
      <label>Title<input autoFocus required maxLength={255} value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} /></label>
      <div className="management-fields"><label>Type<select disabled={!!editing.title_id} value={editing.media_type} onChange={e => setEditing({ ...editing, media_type: e.target.value as Title['media_type'] })}><option value="movie">Movie</option><option value="series">TV series</option></select></label><label>{editing.media_type === 'series' ? 'First air date' : 'Release date'}<input type="date" value={editing.release_date} onChange={e => setEditing({ ...editing, release_date: e.target.value })} /></label></div>
      <label>Synopsis<textarea rows={5} maxLength={10000} value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} /></label>
      <div className="management-fields"><label>Language<input maxLength={50} placeholder="en" value={editing.language} onChange={e => setEditing({ ...editing, language: e.target.value })} /></label>{editing.media_type === 'movie' && <label>Runtime (minutes)<input type="number" min={1} max={10000} value={editing.runtime ?? ''} onChange={e => setEditing({ ...editing, runtime: e.target.value ? Number(e.target.value) : null })} /></label>}</div>
      <label>Poster URL (optional)<input maxLength={2000} placeholder="https://… or /tmdb-poster.jpg" value={editing.poster} onChange={e => setEditing({ ...editing, poster: e.target.value })} /></label>
      <label>YouTube trailer link or ID<input maxLength={2000} placeholder="https://www.youtube.com/watch?v=..." value={editing.trailer_link} onChange={e => setEditing({ ...editing, trailer_link: e.target.value })} /><small>Paste a YouTube watch, short, embed, or youtu.be link, or an 11-character ID. A valid link may still be private, removed, or unavailable for embedding.</small></label>
      {metadataLoading ? <p role="status">Loading cast, production houses and awards...</p> : metadataReady && <MetadataEditor value={metadata} change={setMetadata}/>}
      <div className="management-actions"><button className="primary-button" disabled={!editing.title.trim() || !metadataReady}>{busy ? 'Saving…' : 'Save title'}</button><button type="button" className="secondary-button" onClick={() => { setEditing(null); setError(''); }}>Cancel</button></div>
    </fieldset></form></Dialog>}
    {suspension && <Dialog busy={busy} title="Account suspension" close={()=>setSuspension(null)}><form className="account-form" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await api(`/api/account/moderation/users/${suspension.user_id}`,{method:'PATCH',body:JSON.stringify({action:'suspend',reason:suspensionReason,expires_at:expiry?new Date(expiry).toISOString():null})});setSuspension(null);setVersion(v=>v+1);}catch(e){setError(message(e));}finally{setBusy(false);}}}><h2>Access for {suspension.name}</h2>{suspension.suspension_reason&&<p>Suspension: {suspension.suspension_reason}</p>}<label>Reason<textarea required maxLength={2000} value={suspensionReason} onChange={e=>setSuspensionReason(e.target.value)}/></label><label>Expiry (optional)<input type="datetime-local" value={expiry} onChange={e=>setExpiry(e.target.value)}/></label>{error&&<p role="alert">{error}</p>}<button className="primary-button" disabled={busy}>Suspend account</button>{suspension.suspension_reason&&<button type="button" className="secondary-button" disabled={busy||!suspensionReason.trim()} onClick={async()=>{setBusy(true);try{await api(`/api/account/moderation/users/${suspension.user_id}`,{method:'PATCH',body:JSON.stringify({action:'unsuspend',reason:suspensionReason})});setSuspension(null);setVersion(v=>v+1);}catch(e){setError(message(e));}finally{setBusy(false);}}}>Unsuspend account</button>}</form></Dialog>}
    {confirmation && <Dialog busy={busy} title={confirmation.title} close={() => { if (!busy) { setConfirmation(null); setError(''); } }}><div className="management-editor"><h2>{confirmation.title}</h2><p>{confirmation.detail}</p>{error && <p role="alert" className="admin-feedback error">{error}</p>}<div className="management-actions"><button className="primary-button" disabled={busy} onClick={() => void mutate(confirmation.path, confirmation.method, confirmation.body)}>{busy ? 'Saving…' : confirmation.confirmLabel || 'Confirm'}</button><button className="secondary-button" disabled={busy} onClick={() => { setConfirmation(null); setError(''); }}>Cancel</button></div></div></Dialog>}
  </section>;
}

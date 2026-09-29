"use client";
import { useEffect, useState } from 'react';
import { usePageState } from './page-state';
import { api, type User } from './api';
import Dialog from './dialog';
type Report={report_id:number;post_id:number|null;title:string|null;content:string|null;author:string|null;author_id:number|null;reason:string;explanation:string;status:string;hidden:boolean;deleted_at:string|null;created_at:string;history:{action_id:number;actor:string;action:string;reason:string;created_at:string}[]};
type Notification={notification_id:number;report_id:number;read_at:string|null};
import './moderation.css';
import Select from './custom-select';

export default function Moderation({ user }: { user: User }) {
  const [rows, setRows] = useState<Report[]>([]);
const [status, setStatus] = usePageState('reports-status', '');
const [offset, setOffset] = usePageState('reports-offset', 0);
  const [more, setMore] = useState(false);
  const [version, setVersion] = useState(0);
  const [focus, setFocus] = useState<number | null>(null);
  
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  
  const [selected, setSelected] = useState<Report | null>(null);
  const [action, setAction] = useState('review');
  const [reason, setReason] = useState('');
  const [expiry, setExpiry] = useState('');

  useEffect(() => {
    const c = new AbortController();
    Promise.resolve().then(() => {
      if (c.signal.aborted) return;
      setLoading(true); setError('');
      return Promise.all([
        api<{ items: Report[]; hasMore: boolean }>(`/api/account/moderation/reports?status=${encodeURIComponent(status)}&offset=${offset}${focus ? `&report_id=${focus}` : ''}`, { signal: c.signal }),
        api<{ items: Notification[]; unread: number }>('/api/account/moderation/notifications', { signal: c.signal })
      ]);
    }).then(result => {
      if (result && !c.signal.aborted) {
        const [r, n] = result;
        setRows(r.items); setMore(r.hasMore);
        setNotifications(n.items); setUnread(n.unread);
      }
    }).catch(e => {
      if (!c.signal.aborted) setError(e.message);
    }).finally(() => {
      if (!c.signal.aborted) setLoading(false);
    });
    return () => c.abort();
  }, [status, offset, version, focus]);

  function choose(r: Report, a: string) {
    setSelected(r); setAction(a); setReason(''); setExpiry(''); setError('');
  }

  return (
    <section className="moderation-panel" aria-label="Moderation">
      <div className="moderation-header">
        <div className="moderation-title-area">
          <h2>CVCommunity Reports</h2>
          <p>Review reported stories, record a reason, and keep the community welcoming.</p>
        </div>
        <div className="moderation-controls">
          <Select className="moderation-select" value={status} onChange={(e: any) => { setStatus(e.target.value); setOffset(0); setFocus(null); }}>
            {['', 'Open', 'Under Review', 'Escalated', 'Resolved', 'Dismissed'].map(s => (
              <option key={s} value={s}>{s || 'All statuses'}</option>
            ))}
          </Select>
          <button className="moderation-action-btn" onClick={() => { setFocus(null); setVersion(v => v + 1); }}>↻ Refresh queue</button>
        </div>
      </div>

      {user.role === 'admin' && (
        <details className="moderation-notifications">
          <summary>Notifications {unread > 0 ? <span style={{color: '#f87171'}}>● {unread} unread</span> : '— all read'}</summary>
          <div className="moderation-notification-list">
            {notifications.map(n => (
              <button key={n.notification_id} onClick={async () => {
                try {
                  await api(`/api/account/moderation/notifications/${n.notification_id}`, { method: 'PATCH' });
                  setStatus(''); setOffset(0); setFocus(n.report_id); setVersion(v => v + 1);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}>
                <span style={{color: n.read_at ? 'transparent' : '#3b82f6'}}>● </span>Report #{n.report_id}
              </button>
            ))}
          </div>
        </details>
      )}

      {error && !selected && <p className="message error" role="alert">{error}</p>}
      
      {loading ? (
        <div className="admin-users-loading" role="status" style={{padding: '40px', textAlign: 'center', color: '#a1a6a3'}}>Loading reports…</div>
      ) : !rows.length ? (
        <div className="admin-users-loading" role="status" style={{padding: '40px', textAlign: 'center', color: '#a1a6a3'}}>No reports in this queue.</div>
      ) : (
        <div className="moderation-grid">
          {rows.map(r => (
            <article className="moderation-card" key={r.report_id}>
              <div className="moderation-card-header">
                <div className="moderation-card-meta">
                  <span className="moderation-card-id">#{r.report_id} · {new Date(r.created_at).toLocaleString()}</span>
                  <span className="moderation-card-status" data-status={r.status}>{r.status}</span>
                </div>
              </div>
              
              <div>
                <h3>{r.title || 'Removed story'}</h3>
                <p>By {r.author || 'Deleted account'}{r.hidden ? ' · Hidden' : ''}{r.deleted_at ? ' · Removed' : ''}</p>
                {r.content && <div className="moderation-card-content">{r.content}</div>}
              </div>
              
              <div className="moderation-card-reason">
                <strong>{r.reason}</strong> 
                <span>{r.explanation}</span>
              </div>
              
              <div className="moderation-actions">
                {['review', 'dismiss', 'escalate', 'resolve', ...(!r.deleted_at && r.post_id ? [r.hidden ? 'unhide' : 'hide'] : []), ...(user.role === 'admin' && r.post_id ? [...(!r.deleted_at ? ['delete'] : []), 'suspend', 'unsuspend'] : [])].map(a => (
                  <button className="moderation-action-btn" data-action={a} key={a} onClick={() => choose(r, a)}>
                    {({ review: 'Under review', dismiss: 'Dismiss', escalate: 'Escalate to Admin', resolve: 'Resolve', hide: 'Hide story', unhide: 'Unhide story', delete: 'Delete story', suspend: 'Suspend author', unsuspend: 'Unsuspend author' } as Record<string, string>)[a]}
                  </button>
                ))}
              </div>
              
              {r.history.length > 0 && (
                <details className="moderation-history">
                  <summary>Moderation history ({r.history.length})</summary>
                  {r.history.map(h => (
                    <p key={h.action_id}>
                      <strong>{h.actor || 'Deleted account'}</strong> · {h.action} · {new Date(h.created_at).toLocaleString()}<br />
                      <span style={{color: '#a1a6a3', marginTop: '4px', display: 'block'}}>{h.reason}</span>
                    </p>
                  ))}
                </details>
              )}
            </article>
          ))}
        </div>
      )}
      
      <div className="moderation-pagination">
        <button className="moderation-action-btn" disabled={loading || !offset} onClick={() => setOffset(n => Math.max(0, n - 20))}>← Previous</button>
        <button className="moderation-action-btn" disabled={loading || !more} onClick={() => setOffset(n => n + 20)}>Next →</button>
      </div>

      {selected && (
        <Dialog busy={busy} title="Moderation action" close={() => { setSelected(null); setError(''); }}>
          <form className="account-form" onSubmit={async e => {
            e.preventDefault(); setBusy(true); setError('');
            try {
              await api(`/api/account/moderation/reports/${selected.report_id}`, {
                method: 'PATCH',
                body: JSON.stringify({ action, reason, expires_at: expiry ? new Date(expiry).toISOString() : null })
              });
              setSelected(null); setVersion(v => v + 1);
              window.dispatchEvent(new Event('chitraverse:reports-changed'));
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}>
            <h2>{action[0].toUpperCase() + action.slice(1)} — report #{selected.report_id}</h2>
            <label>Reason<textarea required maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></label>
            {action === 'suspend' && (
              <label>Expiry (optional)<input type="datetime-local" value={expiry} onChange={e => setExpiry(e.target.value)} /></label>
            )}
            {action === 'delete' && (
              <>
                <p>The story will be removed from public view and retained for Admin audit.</p>
              </>
            )}
            {error && <p className="message error" role="alert">{error}</p>}
            <button className="primary-button" disabled={busy || !reason.trim()}>{busy ? 'Saving…' : 'Confirm action'}</button>
          </form>
        </Dialog>
      )}
    </section>
  );
}

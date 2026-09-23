"use client";
import { useEffect, useState } from 'react';
import { api, type User } from './api';
import { AdminUsers } from './role-features';
import AdminHomepage from './admin-homepage';
import Community from './community';
import './admin-dashboard.css';

type Summary = { totals: Record<string,number>; roles: {role:string;count:number}[]; users: User[]; activity: {kind:string;id:number;name:string;title:string;occurred_at:string}[]; registrations: {day:string;count:number}[]; updated_at:string };
type Tab = 'Overview'|'Users & activity'|'Manage homepage'|'Community';
type Props = { user:User; busy:boolean; error:string; logout:()=>void; signIn:()=>void; openTitle:(id:number)=>void; openPerson:(id:number)=>void; openGenre:(id:number)=>void };
const date = (value:string) => new Date(value).toLocaleDateString(undefined,{month:'short',day:'numeric'});

export default function AdminDashboard(props:Props) {
  const [tab,setTab]=useState<Tab>('Overview');
  const [data,setData]=useState<Summary|null>(null);
  const [error,setError]=useState(''); const [loading,setLoading]=useState(true);
  const [retry,setRetry]=useState(0); const [notice,setNotice]=useState('');
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('');
    api<Summary>('/api/account/admin/dashboard',{signal:controller.signal}).then(value=>{if(!controller.signal.aborted)setData(value);})
      .catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Could not load the dashboard.');})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[retry]);
  function navigate(next:Tab){setTab(next);setNotice('');if(next==='Overview')setRetry(n=>n+1);}
  const total=(key:string)=>data?.totals[key]??0;
  const maxJoins=Math.max(1,...(data?.registrations.map(row=>row.count)||[]));
  return <section className={`admin-workspace ${tab === 'Overview' ? 'admin-overview' : ''}`} aria-label="Administration">
    <aside className="admin-sidebar"><a className="admin-wordmark" href="/" aria-label="ChitraVerse homepage">CHITRA<span>VERSE</span><small>ADMINISTRATION</small></a>
      <div className="admin-identity"><span className="admin-avatar">{props.user.avatar?<img src={props.user.avatar} alt=""/>:props.user.name.slice(0,2).toUpperCase()}</span><strong>{props.user.name}</strong><small>Administrator</small></div>
      <nav aria-label="Admin navigation">{(['Overview','Users & activity','Manage homepage','Community'] as Tab[]).map((item,index)=><button key={item} onClick={()=>navigate(item)} aria-current={tab===item?'page':undefined}><span aria-hidden="true">{['◫','◎','◈','✎'][index]}</span>{item}<b aria-hidden="true">›</b></button>)}</nav>
      <a className="admin-back-home" href="/"><span aria-hidden="true">←</span> Back to homepage</a>
      <button className="admin-logout" disabled={props.busy} onClick={props.logout}>{props.busy?'Signing out…':'Sign out'}<span aria-hidden="true">↗</span></button>
    </aside>
    <div className="admin-main"><header className="admin-topline"><span>Workspace <span aria-hidden="true">/</span> <strong>{tab}</strong></span><span className="admin-access">● Admin access</span></header>
      <div className="admin-heading"><div><p className="eyebrow">THE BIG PICTURE</p><h1>{tab==='Overview'?'Admin dashboard':tab}</h1><p>{tab==='Overview'?`Welcome back, ${props.user.name}. Here’s what’s happening in ChitraVerse.`:'Your administration tools, together in one workspace.'}</p></div><button className="secondary-button" disabled={loading} onClick={()=>setRetry(n=>n+1)}>{loading?'Updating…':'↻ Refresh summary'}</button></div>
      {(error||props.error)&&<p className="admin-feedback error" role="alert">{error||props.error}<button className="text-button" disabled={loading} onClick={()=>setRetry(n=>n+1)}>Try again</button></p>}
      {notice&&<p className="admin-feedback" role="status">{notice}</p>}
      {tab==='Overview'&&<>{!data?(!error&&<p className="admin-loading" role="status">Loading database summary…</p>):<>
        <div className="admin-stats">{[
          ['users','Registered accounts','All roles in your database','◎'],['movies','Movies','Titles in the movie library','▣'],['series','TV series','Titles in the series library','▤'],['stories','Community stories','Published by your community','✎'],
        ].map(([key,label,caption,icon])=><article key={key}><div><span>{label}</span><i aria-hidden="true">{icon}</i></div><strong>{total(key).toLocaleString()}</strong><small>{caption}</small></article>)}</div>
        <div className="admin-columns"><div className="admin-primary">
          <section className="admin-panel"><div className="admin-panel-heading"><h2>Newest members</h2><button className="text-button" onClick={()=>navigate('Users & activity')}>View all ↗</button></div><div className="admin-table-wrap" tabIndex={0} role="region" aria-label="Newest members"><table><thead><tr><th>Member</th><th>Role</th><th>Joined</th></tr></thead><tbody>{data.users.map(user=><tr key={user.user_id}><td><strong>{user.name}</strong><small>{user.email}</small></td><td><span className="admin-role-badge">{user.role||'Unassigned'}</span></td><td>{user.created_at?date(user.created_at):'—'}</td></tr>)}</tbody></table>{!data.users.length&&<p className="admin-empty">No registered accounts yet.</p>}</div></section>
          <section className="admin-panel"><div className="admin-panel-heading"><h2>Across your library</h2><span>Database totals</span></div><dl className="admin-inventory">{[['people','Cast & crew'],['genres','Genres'],['studios','Studios'],['ratings','Ratings'],['favorites','Saved favorites'],['playlists','Watchlists']].map(([key,label])=><div key={key}><dt>{label}</dt><dd>{total(key).toLocaleString()}</dd></div>)}</dl></section>
        </div><div className="admin-secondary">
          <section className="admin-panel admin-growth"><div className="admin-panel-heading"><h2>New registrations</h2><span>7 calendar days</span></div><strong>{data.registrations.reduce((sum,row)=>sum+row.count,0).toLocaleString()} <small>new accounts</small></strong><div className="admin-bars" aria-label="Daily registrations">{data.registrations.map(row=><div key={row.day}><span>{row.count}</span><div><i style={{height:`${Math.max(2,row.count/maxJoins*100)}%`}}/></div><small>{date(row.day+'T12:00:00')}</small></div>)}</div></section>
          <section className="admin-panel"><div className="admin-panel-heading"><h2>Account overview</h2></div><ul className="admin-role-list">{data.roles.map(row=><li key={row.role}><span>{row.role}</span><strong>{row.count.toLocaleString()}</strong></li>)}</ul><div className="admin-session-count"><strong>{total('signed_in_accounts')}</strong><div>Accounts with valid sessions<small>Session count does not indicate who is online.</small></div></div></section>
          <section className="admin-panel"><div className="admin-panel-heading"><h2>Recent activity</h2><span>Latest 8</span></div><ol className="admin-recent" tabIndex={0} aria-label="Recent activity">{data.activity.map(item=><li key={`${item.kind}-${item.id}`}><span aria-hidden="true">{{story:'✎',comment:'“',rating:'★'}[item.kind]}</span><div><strong>{item.name}</strong><p>{item.kind==='story'?'Published':item.kind==='comment'?'Commented on':'Rated'} <b>{item.title}</b></p><time dateTime={item.occurred_at}>{date(item.occurred_at)}</time></div></li>)}</ol>{!data.activity.length&&<p className="admin-empty">Community activity will appear here.</p>}</section>
        </div></div><p className="admin-updated">Updated {new Date(data.updated_at).toLocaleString()} · Counts are read from your database.</p>
      </>}</>}
      {tab==='Users & activity'&&<div className="admin-panel admin-tool"><AdminUsers/></div>}
      {tab==='Manage homepage'&&<div className="admin-panel admin-tool"><AdminHomepage saved={()=>{setNotice('Homepage selection saved.');setTab('Overview');setRetry(n=>n+1);}}/></div>}
      {tab==='Community'&&<div className="admin-community"><Community user={props.user} signIn={props.signIn} sessionExpired={props.signIn} openTitle={props.openTitle} openPerson={props.openPerson} openGenre={props.openGenre}/></div>}
    </div>
  </section>;
}

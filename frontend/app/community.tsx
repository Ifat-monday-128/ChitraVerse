"use client";
import { useEffect, useState, type FormEvent } from 'react';
import { api, type User } from './api';
import './community.css';
import CommunityStory, { type CommunityPost as Post } from './community-story';
type Tag = { id:number;name:string };
const errorText=(e:unknown)=>e instanceof Error?e.message:'Could not reach the community.';
function TagSearch({kind,selected,change}:{kind:'media'|'people';selected:Tag|null;change:(tag:Tag|null)=>void}) {
  const [query,setQuery]=useState('');const [results,setResults]=useState<Tag[]>([]);const [error,setError]=useState('');const [searching,setSearching]=useState(false);
  useEffect(()=>{const controller=new AbortController();const timer=setTimeout(()=>{
    if(!query.trim()){setResults([]);setSearching(false);return;}
    api<{items:{title_id?:number;cast_crew_id?:number;title?:string;name?:string}[]}>(`/api/media/${kind==='people'?'people':'search'}?q=${encodeURIComponent(query)}&limit=8`,{signal:controller.signal})
      .then(d=>{setResults(d.items.map(i=>({id:(i.title_id??i.cast_crew_id)!,name:(i.title??i.name)!})));setError('');})
      .catch(e=>{if(!controller.signal.aborted)setError(errorText(e));}).finally(()=>{if(!controller.signal.aborted)setSearching(false);});
  },250);return()=>{clearTimeout(timer);controller.abort();};},[query,kind]);
  return <div className="tag-picker"><label>{kind==='media'?'Tag media':'Tag cast / crew'}<input type="search" maxLength={120} value={query} onChange={e=>{setQuery(e.target.value);setResults([]);setError('');setSearching(Boolean(e.target.value.trim()));}} placeholder={kind==='media'?'Search movies or TV shows':'Search people'}/></label>
    {selected&&<button type="button" className="community-tag" onClick={()=>change(null)} aria-label={`Remove ${selected.name} tag`}>{selected.name} ×</button>}
    {query.trim()&&<div className="tag-results" aria-busy={searching}>{searching ? <p role="status">Searching…</p> : !results.length && !error ? <p role="status">No matches. Try another name.</p> : null}{results.map(t=><button type="button" key={t.id} onClick={()=>{change(t);setQuery('');setResults([]);}}>{t.name}</button>)}</div>}{error&&<p role="alert">{error}</p>}
  </div>;
}
export default function Community({user,signIn,openTitle,openPerson,openGenre}:{user:User|null;signIn:()=>void;openTitle:(id:number)=>void;openPerson:(id:number)=>void;openGenre:(id:number)=>void}) {
  const [posts,setPosts]=useState<Post[]>([]);const [title,setTitle]=useState('');const [content,setContent]=useState('');const [error,setError]=useState('');
  const [media,setMedia]=useState<Tag|null>(null);const [person,setPerson]=useState<Tag|null>(null);const [genre,setGenre]=useState('');const [genres,setGenres]=useState<{genre_id:number;name:string}[]>([]);
  const [success,setSuccess]=useState('');const [loadingMore,setLoadingMore]=useState(false);const [busy,setBusy]=useState(false);const [loading,setLoading]=useState(true);const [hasMore,setHasMore]=useState(false);const [retry,setRetry]=useState(0);
  useEffect(()=>{if(!user)return;const controller=new AbortController();
    Promise.all([api<{posts:Post[];hasMore:boolean}>('/api/account/community',{signal:controller.signal}),api<{genres:{genre_id:number;name:string}[]}>('/api/media/filters',{signal:controller.signal})])
      .then(([d,f])=>{setPosts(d.posts);setHasMore(d.hasMore);setGenres(f.genres);setError('');}).catch(e=>{if(!controller.signal.aborted)setError(errorText(e));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();
  },[user,retry]);
  async function submit(e:FormEvent){e.preventDefault();if(!user){signIn();return;}if(busy||loadingMore)return;setBusy(true);setError('');setSuccess('');try{
    const d=await api<{post:Post}>('/api/account/community',{method:'POST',body:JSON.stringify({title,content,media_id:media?.id,cast_crew_id:person?.id,genre_id:genre?Number(genre):null})});
    setPosts(p=>[{...d.post,media_title:media?.name,cast_name:person?.name,genre_name:genres.find(g=>g.genre_id===Number(genre))?.name},...p]);setTitle('');setContent('');setMedia(null);setPerson(null);setGenre('');setSuccess('Your blog is published. Find it in Latest stories.');
  }catch(e){setError(errorText(e));}finally{setBusy(false);}}
  async function more(){if(loadingMore||busy)return;setLoadingMore(true);setError('');try{const d=await api<{posts:Post[];hasMore:boolean}>(`/api/account/community?offset=${posts.length}`);setPosts(p=>[...p,...d.posts]);setHasMore(d.hasMore);}catch(e){setError(errorText(e));}finally{setLoadingMore(false);}}
  return <section className="content-page community-page"><p className="eyebrow">STORIES · OPINIONS · CONVERSATIONS</p><h1>CVcommunity</h1><p className="description">Your corner of cinema. Share a blog and tag a title, a person, or a genre.</p>
    {!user?<button className="primary-button" onClick={signIn}>Sign in to join the community</button>:<>
      <form className="community-form" onSubmit={submit} aria-busy={busy}><h2>Write a blog</h2><p className="composer-hint">A review, a discovery, a different perspective. Make it yours.</p><fieldset disabled={busy} className="composer-fields"><label>Title<input required value={title} onChange={e=>setTitle(e.target.value)} placeholder="Give your story a title" aria-describedby="blog-title-count" maxLength={200}/></label><small className="character-count" id="blog-title-count">{title.length} / 200 characters</small><label>Your story<textarea required value={content} onChange={e=>setContent(e.target.value)} placeholder="What has you thinking about cinema?" aria-describedby="blog-content-count" maxLength={10000}/></label><small className="character-count" id="blog-content-count">{content.length.toLocaleString()} / 10,000 characters</small>
        <div className="community-tag-fields"><TagSearch kind="media" selected={media} change={setMedia}/><TagSearch kind="people" selected={person} change={setPerson}/><label>Tag genre<select value={genre} onChange={e=>setGenre(e.target.value)}><option value="">Choose a genre (optional)</option>{genres.map(g=><option key={g.genre_id} value={g.genre_id}>{g.name}</option>)}</select></label></div>
        </fieldset><div className="composer-footer"><span>Tags are optional. Your story is what matters.</span><button className="primary-button" disabled={busy||loadingMore||!title.trim()||!content.trim()}>{busy?'Publishing…':'Publish blog'}</button></div><p className="publish-success" role="status">{success}</p></form>
      {error&&<div className="message error" role="alert">{error}<button onClick={()=>setRetry(r=>r+1)}>Retry loading</button></div>}
      <h2>Latest stories</h2>{loading?<p role="status">Loading community…</p>:!posts.length&&!error?<p>Start the conversation. Publish the first story.</p>:null}
      <div className="community-posts">{posts.map(p=><CommunityStory key={p.post_id} post={p} openTitle={openTitle} openPerson={openPerson} openGenre={openGenre} />)}</div>
      {hasMore&&<button className="secondary-button" disabled={loadingMore||busy} onClick={more}>{loadingMore ? 'Loading stories…' : 'Load more stories'}</button>}
    </>}
  </section>;
}

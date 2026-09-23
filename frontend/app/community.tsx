"use client";
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Dialog from './dialog';
import { api, ApiError, type User } from './api';
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
export default function Community({user,signIn,sessionExpired,openTitle,openPerson,openGenre}:{user:User|null;signIn:()=>void;sessionExpired:()=>void;openTitle:(id:number)=>void;openPerson:(id:number)=>void;openGenre:(id:number)=>void}) {
  const [posts,setPosts]=useState<Post[]>([]);
  const [title,setTitle]=useState(''); const [content,setContent]=useState('');
  const [error,setError]=useState(''); const [postError,setPostError]=useState('');
  const [media,setMedia]=useState<Tag|null>(null); const [person,setPerson]=useState<Tag|null>(null);
  const [genre,setGenre]=useState(''); const [genres,setGenres]=useState<{genre_id:number;name:string}[]>([]);
  const [composer,setComposer]=useState(false); const [showTags,setShowTags]=useState(false);
  const [success,setSuccess]=useState(''); const [loadingMore,setLoadingMore]=useState(false);
  const [busy,setBusy]=useState(false); const [loading,setLoading]=useState(true);
  const [hasMore,setHasMore]=useState(false); const [retry,setRetry]=useState(0);
  const [offset,setOffset]=useState(0);
  const trigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    const controller=new AbortController(); setLoading(true); setError('');
    api<{posts:Post[];hasMore:boolean}>('/api/media/community',{signal:controller.signal})
      .then(d=>{if(!controller.signal.aborted){setPosts(d.posts);setOffset(d.posts.length);setHasMore(d.hasMore);}})
      .catch(e=>{if(!controller.signal.aborted)setError(errorText(e));})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[retry]);
  useEffect(()=>{
    if(!composer||!showTags)return;
    const controller=new AbortController();
    api<{genres:{genre_id:number;name:string}[]}>('/api/media/filters',{signal:controller.signal})
      .then(d=>{if(!controller.signal.aborted)setGenres(d.genres);})
      .catch(e=>{if(!controller.signal.aborted)setPostError(errorText(e));});
    return()=>controller.abort();
  },[composer,showTags]);
  function openComposer(){if(!user){signIn();return;}setPostError('');setSuccess('');setComposer(true);}
  function closeComposer(){if(busy)return;setComposer(false);requestAnimationFrame(()=>trigger.current?.focus());}
  async function submit(e:FormEvent){
    e.preventDefault();if(!user){signIn();return;}if(busy||loadingMore||loading)return;
    setBusy(true);setPostError('');setSuccess('');
    try{
      const d=await api<{post:Post}>('/api/account/community',{method:'POST',body:JSON.stringify({title,content,media_id:media?.id,cast_crew_id:person?.id,genre_id:genre?Number(genre):null})});
      setPosts(p=>[{...d.post,media_title:media?.name,cast_name:person?.name,genre_name:genres.find(g=>g.genre_id===Number(genre))?.name},...p]);
      setOffset(n=>n+1);setTitle('');setContent('');setMedia(null);setPerson(null);setGenre('');setShowTags(false);
      setComposer(false);setSuccess('Your blog is published. Find it in Latest stories.');
      requestAnimationFrame(()=>trigger.current?.focus());
    }catch(e){if(e instanceof ApiError&&e.status===401)sessionExpired();else setPostError(errorText(e));}
    finally{setBusy(false);}
  }
  async function more(){
    if(loadingMore||busy||loading)return;setLoadingMore(true);setError('');
    try{
      const d=await api<{posts:Post[];hasMore:boolean}>(`/api/media/community?offset=${offset}`);
      setPosts(p=>{const known=new Set(p.map(post=>post.post_id));return [...p,...d.posts.filter(post=>!known.has(post.post_id))];});
      setOffset(n=>n+d.posts.length);setHasMore(d.hasMore);
    }catch(e){setError(errorText(e));}finally{setLoadingMore(false);}
  }
  return <section className="content-page community-page">
    <header className="community-hero"><p className="eyebrow">FOR THE LOVE OF CINEMA</p><h1>CVcommunity<span>.</span></h1><p>A film that stayed with you. A scene worth talking about.<br />Every perspective has a place here.</p><span className="community-hero-note">YOUR STORIES. OUR SHARED SCREEN.</span></header>
    <div className="community-layout"><div className="community-feed">
      <div className="community-start"><div className="community-start-row"><span className="community-self-avatar" aria-hidden="true">{user?.avatar?<img src={user.avatar} alt="" />:user?user.name.slice(0,2).toUpperCase():'CV'}</span><button ref={trigger} className="community-prompt" onClick={openComposer} aria-haspopup="dialog">What's on your mind{user?`, ${user.name.split(' ')[0]}`:''}?</button><button className="community-write-icon" aria-label="Write a blog" onClick={openComposer}>✎</button></div><div className="community-start-footer"><span>Good cinema deserves a conversation.</span><button onClick={openComposer}>Share a story <span aria-hidden="true">↗</span></button></div></div>
      {success&&<p className="publish-success community-success" role="status">{success}</p>}
      <div className="community-feed-heading"><h2>Latest stories</h2><span>Newest first</span></div>
      {error&&<div className="message error" role="alert">{error}<button disabled={loading||loadingMore} onClick={()=>setRetry(r=>r+1)}>Retry loading</button></div>}
      {loading?<div className="community-loading" role="status"><span>Loading community…</span><div/><div/></div>:!posts.length&&!error?<div className="community-empty"><span aria-hidden="true">✎</span><h3>Be the first voice.</h3><p>Share a review, a discovery, or a new perspective on a favorite film.</p><button className="primary-button" onClick={openComposer}>Write the first story</button></div>:null}
      <div className="community-posts" aria-busy={loadingMore}>{posts.map(p=><CommunityStory key={p.post_id} post={p} openTitle={openTitle} openPerson={openPerson} openGenre={openGenre} />)}</div>
      {hasMore&&<button className="secondary-button community-more" disabled={loadingMore||busy||loading} onClick={more}>{loadingMore?'Loading stories…':'Load more stories'}</button>}
      {!hasMore&&posts.length>0&&!loading&&<p className="community-feed-end">You're all caught up. There's always another story to tell.</p>}
    </div><aside className="community-aside"><p className="eyebrow">A PLACE TO BELONG</p><h2>More than a watchlist.</h2><p>Discover what other film lovers are watching, thinking, and writing about.</p><div><span>01</span><p><strong>Make it personal</strong>A thoughtful review or a small discovery. Your voice matters.</p></div><div><span>02</span><p><strong>Connect the story</strong>Tag a film, a creator, or a genre to help others explore.</p></div><div><span>03</span><p><strong>Keep it kind</strong>Welcome different opinions. Give spoilers a heads-up.</p></div><button className="text-button" onClick={openComposer}>Join the conversation ↗</button></aside></div>
    {composer&&user&&<Dialog title="Create a community story" close={closeComposer}><form className="community-form" onSubmit={submit} aria-busy={busy}><p className="eyebrow">YOUR VOICE, YOUR STORY</p><h2>Write a blog</h2><p className="composer-hint">A review, a discovery, a different perspective. Make it yours.</p>
      <fieldset disabled={busy} className="composer-fields"><label>Title<input autoFocus required value={title} onChange={e=>setTitle(e.target.value)} placeholder="Give your story a title" aria-describedby="blog-title-count" maxLength={200}/></label><small className="character-count" id="blog-title-count">{title.length} / 200 characters</small><label>Your story<textarea required value={content} onChange={e=>setContent(e.target.value)} placeholder="What has you thinking about cinema?" aria-describedby="blog-content-count" maxLength={10000}/></label><small className="character-count" id="blog-content-count">{content.length.toLocaleString()} / 10,000 characters</small>
      <button type="button" className="composer-tag-toggle" aria-expanded={showTags} aria-controls="community-tag-options" onClick={()=>setShowTags(value=>!value)}><span>Add to your story</span><span>Film · Cast / crew · Genre <b aria-hidden="true">{showTags?'−':'+'}</b></span></button>
      {showTags&&<div className="community-tag-fields" id="community-tag-options"><TagSearch kind="media" selected={media} change={setMedia}/><TagSearch kind="people" selected={person} change={setPerson}/><label>Tag genre<select value={genre} onChange={e=>setGenre(e.target.value)}><option value="">Choose a genre (optional)</option>{genres.map(g=><option key={g.genre_id} value={g.genre_id}>{g.name}</option>)}</select></label></div>}
      {!showTags&&(media||person||genre)&&<p className="composer-hint">Your selected tags will be included.</p>}
      </fieldset>{postError&&<p role="alert" className="message error">{postError}</p>}
      <div className="composer-footer"><button type="button" className="text-button" disabled={busy} onClick={closeComposer}>Keep draft & close</button><button className="primary-button" disabled={busy||loadingMore||loading||!title.trim()||!content.trim()}>{busy?'Publishing…':'Publish blog'}</button></div><small className="composer-privacy">Published stories are visible to everyone. Drafts stay here while you remain on this page.</small>
    </form></Dialog>}
  </section>;
}

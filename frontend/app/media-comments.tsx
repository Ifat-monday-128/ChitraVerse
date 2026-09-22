"use client";
import { useEffect, useState, type FormEvent } from 'react';
import { api, type User } from './api';
import './community.css';
type Comment={comment_id:number;name:string;content:string;created_at:string};
export default function MediaComments({id,user,signIn}:{id:number;user:User|null;signIn:()=>void}) {
  const [success,setSuccess]=useState('');
  const [comments,setComments]=useState<Comment[]>([]);const [content,setContent]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [loading,setLoading]=useState(true);const [retry,setRetry]=useState(0);
  useEffect(()=>{const controller=new AbortController();api<{comments:Comment[]}>(`/api/media/${id}/comments`,{signal:controller.signal}).then(d=>{setComments(d.comments);setError('');}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[id,retry]);
  async function submit(e:FormEvent){e.preventDefault();if(!user){signIn();return;}if(busy)return;setBusy(true);setError('');setSuccess('');try{const d=await api<{comment:Comment}>('/api/account/comments',{method:'POST',body:JSON.stringify({title_id:id,content})});setComments(c=>[d.comment,...c]);setContent('');setSuccess('Comment posted.');}catch(e){setError(e instanceof Error?e.message:'Could not post comment.');}finally{setBusy(false);}}
  return <section className="comments"><h3>Comments {!loading && <span className="comment-count">{comments.length}</span>}</h3><p>Join the conversation. You can comment more than once.</p>{user?<form className="comment-compose" onSubmit={submit}><label htmlFor="media-comment">Your comment</label><textarea id="media-comment" disabled={busy} aria-describedby="comment-count" required maxLength={2000} value={content} onChange={e=>setContent(e.target.value)} placeholder="Share your thoughts…"/><small id="comment-count" className="character-count">{content.length.toLocaleString()} / 2,000 characters</small><button className="primary-button" disabled={busy||!content.trim()}>{busy?'Posting…':'Post comment'}</button></form>:<button className="primary-button" onClick={signIn}>Sign in to comment</button>}
    <p className="publish-success" role="status">{success}</p>
    {error&&<p className="message error" role="alert">{error} <button onClick={()=>setRetry(r=>r+1)}>Retry loading</button></p>}{loading?<p role="status">Loading comments…</p>:!comments.length&&!error?<p>No comments yet. Start the conversation.</p>:null}
    {comments.map(c=><article className="comment" key={c.comment_id}><strong>{c.name}</strong><time dateTime={c.created_at}>{new Date(c.created_at).toLocaleString()}</time><p>{c.content}</p></article>)}
  </section>;
}

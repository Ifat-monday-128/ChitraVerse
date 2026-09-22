"use client";
import { useState } from 'react';

export type CommunityPost = { post_id:number;title:string;content:string;name:string;created_at:string;media_id:number|null;cast_crew_id:number|null;genre_id:number|null;media_title?:string;cast_name?:string;genre_name?:string };

export default function CommunityStory({ post, openTitle, openPerson, openGenre }: { post:CommunityPost;openTitle:(id:number)=>void;openPerson:(id:number)=>void;openGenre:(id:number)=>void }) {
  const [expanded, setExpanded] = useState(false);
  const long = post.content.length > 600;
  const minutes = Math.max(1, Math.ceil(post.content.trim().split(/\s+/).length / 200));
  return <article className="community-post">
    <header className="story-author"><span className="story-avatar" aria-hidden="true">{post.name.slice(0,2).toUpperCase()}</span><div><strong>{post.name}</strong><small><time dateTime={post.created_at}>{new Date(post.created_at).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</time><span aria-hidden="true"> · </span>{minutes} min read</small></div></header>
    <h3>{post.title}</h3><p id={`story-${post.post_id}`}>{long && !expanded ? `${post.content.slice(0,600).trimEnd()}…` : post.content}</p>
    {long && <button className="story-read-more" aria-expanded={expanded} aria-controls={`story-${post.post_id}`} onClick={()=>setExpanded(!expanded)}>{expanded ? 'Show less' : 'Read full story'}</button>}
    <div className="community-tags">{post.media_id && <button className="community-tag" onClick={()=>openTitle(post.media_id!)}>{post.media_title}</button>}{post.cast_crew_id && <button className="community-tag" onClick={()=>openPerson(post.cast_crew_id!)}>{post.cast_name}</button>}{post.genre_id && <button className="community-tag" onClick={()=>openGenre(post.genre_id!)}>{post.genre_name}</button>}</div>
  </article>;
}

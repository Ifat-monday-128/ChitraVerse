"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type User } from './api';
export const libraryChanged=()=>{window.dispatchEvent(new Event('chitraverse:library-changed'));if(typeof BroadcastChannel!=='undefined'){const c=new BroadcastChannel('chitraverse-library');c.postMessage('changed');c.close();}};
const Context=createContext<{saved:Set<number>;loaded:boolean}>({saved:new Set(),loaded:false});
export const useLibrary=()=>useContext(Context);
export function LibraryProvider({user,children}:{user:User|null;children:ReactNode}){
 const [saved,setSaved]=useState<Set<number>>(new Set()),[loaded,setLoaded]=useState(false);
 useEffect(()=>{let current=true;const refresh=()=>{if(!user||user.role==='admin'){setSaved(new Set());setLoaded(true);return;}api<{items:{title_id:number}[]}>('/api/account/watchlist').then(d=>{if(current){setSaved(new Set(d.items.map(i=>i.title_id)));setLoaded(true);}}).catch(()=>{if(current)setLoaded(false);});};refresh();window.addEventListener('chitraverse:library-changed',refresh);const channel=typeof BroadcastChannel==='undefined'?null:new BroadcastChannel('chitraverse-library');if(channel)channel.onmessage=refresh;return()=>{current=false;window.removeEventListener('chitraverse:library-changed',refresh);channel?.close();};},[user]);
 return <Context.Provider value={{saved,loaded}}>{children}</Context.Provider>;
}

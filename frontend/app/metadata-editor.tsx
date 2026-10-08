"use client";
import { useState } from 'react';
export type CastEntry={cast_crew_id?:number;name:string;role_type:string;character_name:string|null;photo:string|null;display_order:number};
import Select from './custom-select';
export type CompanyEntry={name:string;logo:string|null};
export type AwardEntry={award_id?:number;name:string;category:string|null;year:number|null;result:'Won'|'Nominated'|null;recipient:string|null};
export type Structured={cast:CastEntry[];companies:CompanyEntry[];awards:AwardEntry[]};
const message=(error:unknown)=>error instanceof Error?error.message:'Could not prepare this photo.';
async function prepareCastPhoto(file:File){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw new Error('Choose a JPG, PNG, or WebP photo up to 5 MB.');
 const bitmap=await createImageBitmap(file);
 try{
  for(const width of [480,400,320,240]){
   const height=Math.round(width*1.5),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
   const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Photo processing is unavailable in this browser.');
   const target=width/height,source=bitmap.width/bitmap.height;
   const sw=source>target?bitmap.height*target:bitmap.width,sh=source>target?bitmap.height:bitmap.width/target;
   ctx.drawImage(bitmap,(bitmap.width-sw)/2,(bitmap.height-sh)/2,sw,sh,0,0,width,height);
   for(const quality of [.82,.65,.48,.32]){const result=canvas.toDataURL('image/jpeg',quality);if(result.length<55000)return result;}
  }
  throw new Error('This photo is too detailed. Try a smaller image.');
 }finally{bitmap.close();}
}
export default function MetadataEditor({value,change}:{value:Structured;change:(value:Structured)=>void}){
 const [processing,setProcessing]=useState<number|null>(null),[photoError,setPhotoError]=useState('');
 function cast(i:number,patch:Partial<CastEntry>){change({...value,cast:value.cast.map((r,n)=>i===n?{...r,...patch}:r)});}
 function company(i:number,patch:Partial<CompanyEntry>){change({...value,companies:value.companies.map((r,n)=>i===n?{...r,...patch}:r)});}
 function award(i:number,patch:Partial<AwardEntry>){change({...value,awards:value.awards.map((r,n)=>i===n?{...r,...patch}:r)});}
 return <div className="structured-metadata"><h3>Cast &amp; crew (optional)</h3><p className="metadata-help">Upload photos for reliable hosting. Facebook CDN links expire and should not be used.</p>{photoError&&<p className="admin-feedback error" role="alert">{photoError}</p>}{value.cast.map((r,i)=><div className="metadata-row" key={`${r.cast_crew_id||'new'}-${i}`}>
  <div className="metadata-photo-preview">{r.photo?<img src={r.photo.startsWith('/')?`https://image.tmdb.org/t/p/w185${r.photo}`:r.photo} alt="" referrerPolicy="no-referrer"/>:<span>No photo</span>}</div>
  <label>Person's name<input required maxLength={255} value={r.name} onChange={e=>cast(i,{name:e.target.value})}/></label><label>Credit / role<input required maxLength={100} placeholder="Actor, Director..." value={r.role_type||'Actor'} onChange={e=>cast(i,{role_type:e.target.value})}/></label><label>Character / credited as<input maxLength={255} value={r.character_name||''} onChange={e=>cast(i,{character_name:e.target.value})}/></label>
  <label>Photo URL (optional)<input maxLength={2000} placeholder={r.photo?.startsWith('data:')?'Uploaded photo selected':'https://example.com/photo.jpg'} value={r.photo?.startsWith('data:')?'':r.photo||''} onChange={e=>cast(i,{photo:e.target.value})}/></label>
  <div className="metadata-photo-actions"><label className="secondary-button">{processing===i?'Preparing…':'Upload photo'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={processing!==null} onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;setProcessing(i);setPhotoError('');try{cast(i,{photo:await prepareCastPhoto(file)});}catch(error){setPhotoError(message(error));}finally{setProcessing(null);}}}/></label>{r.photo&&<button type="button" className="text-button" onClick={()=>cast(i,{photo:null})}>Remove photo</button>}</div>
  <label>Display order<input type="number" min={0} max={10000} required value={r.display_order} onChange={e=>cast(i,{display_order:Number(e.target.value)})}/></label><button type="button" className="text-button" onClick={()=>change({...value,cast:value.cast.filter((_,n)=>n!==i)})}>Remove credit</button></div>)}<button type="button" className="secondary-button" onClick={()=>change({...value,cast:[...value.cast,{name:'',role_type:'Actor',character_name:'',photo:'',display_order:value.cast.length}]})}>+ Add cast or crew</button>
 <h3>Production houses (optional)</h3>{value.companies.map((r,i)=><div className="metadata-row" key={i}><label>Company name<input required maxLength={255} value={r.name} onChange={e=>company(i,{name:e.target.value})}/></label><label>Logo URL<input maxLength={2000} value={r.logo||''} onChange={e=>company(i,{logo:e.target.value})}/></label><button type="button" className="text-button" onClick={()=>change({...value,companies:value.companies.filter((_,n)=>n!==i)})}>Remove production house</button></div>)}<button type="button" className="secondary-button" onClick={()=>change({...value,companies:[...value.companies,{name:'',logo:''}]})}>+ Add production house</button>
 <h3>Awards (optional)</h3>{value.awards.map((r,i)=><div className="metadata-row" key={i}><label>Award / event name<input required maxLength={255} value={r.name} onChange={e=>award(i,{name:e.target.value})}/></label><label>Category<input maxLength={255} value={r.category||''} onChange={e=>award(i,{category:e.target.value})}/></label><label>Year<input type="number" min={1800} max={2200} value={r.year??''} onChange={e=>award(i,{year:e.target.value?Number(e.target.value):null})}/></label><label>Result<Select required={!r.award_id} value={r.result||''} onChange={(e: any)=>award(i,{result:e.target.value as AwardEntry['result']})}>{!r.result&&<option value="">Legacy record — unspecified</option>}<option>Won</option><option>Nominated</option></Select></label><label>Recipient<input maxLength={255} value={r.recipient||''} onChange={e=>award(i,{recipient:e.target.value})}/></label><button type="button" className="text-button" onClick={()=>change({...value,awards:value.awards.filter((_,n)=>n!==i)})}>Remove award</button></div>)}<button type="button" className="secondary-button" onClick={()=>change({...value,awards:[...value.awards,{name:'',category:'',year:null,result:'Won',recipient:''}]})}>+ Add award</button></div>;
}

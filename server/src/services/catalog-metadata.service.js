const bad = message => Object.assign(new Error(message),{status:400});
const text=(v,max,required=false)=>{if(v==null&&!required)return null;if(typeof v!=='string'||v.length>max||(required&&!v.trim()))throw bad('Complete each metadata row and respect its length limit.');return v.trim()||null;};
const image=v=>{v=text(v,2000);if(!v)return null;if(/^\/[A-Za-z0-9_.-]+\.(jpg|jpeg|png|webp)$/i.test(v))return v;try{const u=new URL(v);if(u.protocol==='https:'&&!u.username&&!u.password)return v;}catch{}throw bad('Photo and logo URLs must use HTTPS.');};
function validate(body){
 const result={};
 for(const key of ['cast','companies','awards']){
 if(body[key]===undefined)continue;
 if(!Array.isArray(body[key])||body[key].length>100)throw bad('Use at most 100 entries per section.');
 const seen=new Set();
 result[key]=body[key].map((r,i)=>{
 if(!r||typeof r!=='object')throw bad('Invalid metadata row.');
 const name=text(r.name,255,true);let row={name};
 if(key==='cast'){
 const order=r.display_order??i;if(!Number.isInteger(order)||order<0||order>10000)throw bad('Display order must be a whole number from 0 to 10,000.');
 row={...row,character_name:text(r.character_name,255),photo:image(r.photo),display_order:order};
 }else if(key==='companies')row={...row,logo:image(r.logo)};
 else {if(r.year!=null&&(!Number.isInteger(r.year)||r.year<1800||r.year>2200))throw bad('Award year must be between 1800 and 2200.');if(r.result!=null&&!['Won','Nominated'].includes(r.result))throw bad('Choose Won or Nominated.');if(!r.award_id&&!r.result)throw bad('Choose an award result.');row={...row,award_id:r.award_id||null,category:text(r.category,255),year:r.year??null,result:r.result??null,recipient:text(r.recipient,255)};}
 const identity=key==='awards'?[row.name,row.category,row.year,row.result,row.recipient].join('|').toLowerCase():name.toLowerCase();if(seen.has(identity))throw bad('Remove duplicate metadata entries.');seen.add(identity);return row;
 });
 }
 return result;
}
async function load(db,id){
 const [cast,companies,awards]=await Promise.all([
 db.query("SELECT c.cast_crew_id,c.name,c.photo,mc.character_name,mc.display_order FROM media_cast_crew mc JOIN cast_crew c USING(cast_crew_id) JOIN role r USING(role_id) WHERE title_id=$1 AND r.role_name='Actor' ORDER BY mc.display_order,c.name",[id]),
 db.query('SELECT p.company_id,p.name,p.logo FROM media_company mc JOIN production_house p USING(company_id) WHERE title_id=$1 ORDER BY p.name',[id]),
 db.query('SELECT award_id,name,category,year,result,recipient FROM awards WHERE title_id=$1 ORDER BY award_id',[id])]);return {cast:cast.rows,companies:companies.rows,awards:awards.rows};
}
async function save(db,id,data){
 if(data.cast){
 const {rows:[role]}=await db.query("INSERT INTO role(role_name) VALUES('Actor') ON CONFLICT(role_name) DO UPDATE SET role_name=EXCLUDED.role_name RETURNING role_id");
 await db.query('DELETE FROM media_cast_crew WHERE title_id=$1 AND role_id=$2',[id,role.role_id]);
 for(const r of data.cast){
 let person=(await db.query('SELECT cast_crew_id FROM cast_crew WHERE lower(name)=lower($1) AND photo IS NOT DISTINCT FROM $2 ORDER BY cast_crew_id LIMIT 1',[r.name,r.photo])).rows[0];
 if(!person)person=(await db.query('INSERT INTO cast_crew(name,photo) VALUES($1,$2) RETURNING cast_crew_id',[r.name,r.photo])).rows[0];
 await db.query('INSERT INTO media_cast_crew(title_id,cast_crew_id,role_id,character_name,display_order) VALUES($1,$2,$3,$4,$5)',[id,person.cast_crew_id,role.role_id,r.character_name,r.display_order]);
 }}
 if(data.companies){await db.query('DELETE FROM media_company WHERE title_id=$1',[id]);for(const r of data.companies){
 let company=(await db.query('SELECT company_id FROM production_house WHERE lower(name)=lower($1) AND logo IS NOT DISTINCT FROM $2 ORDER BY company_id LIMIT 1',[r.name,r.logo])).rows[0];
 if(!company)company=(await db.query('INSERT INTO production_house(name,logo) VALUES($1,$2) RETURNING company_id',[r.name,r.logo])).rows[0];
 await db.query('INSERT INTO media_company(title_id,company_id) VALUES($1,$2)',[id,company.company_id]);}}
 if(data.awards){const keep=[];for(const r of data.awards){
 if(r.award_id){const updated=await db.query('UPDATE awards SET name=$1,category=$2,year=$3,result=$4,recipient=$5 WHERE award_id=$6 AND title_id=$7 RETURNING award_id',[r.name,r.category,r.year,r.result,r.recipient,r.award_id,id]);if(!updated.rowCount)throw bad('This award no longer belongs to the title. Reload the editor.');keep.push(r.award_id);}
 else keep.push((await db.query('INSERT INTO awards(title_id,name,category,year,result,recipient) VALUES($1,$2,$3,$4,$5,$6) RETURNING award_id',[id,r.name,r.category,r.year,r.result,r.recipient])).rows[0].award_id);
 }await db.query('DELETE FROM awards WHERE title_id=$1 AND NOT (award_id=ANY($2::int[]))',[id,keep]);}
}
module.exports={validate,load,save};

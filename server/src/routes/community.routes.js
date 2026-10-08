const express = require('express');
const pool = require('../config/db');
const account = express.Router(), publicRoutes = express.Router();
const staff = u => ['moderator','admin'].includes(u.role);
const fail = (status,message) => Object.assign(new Error(message),{status});
const id = value => { if(!/^[1-9]\d*$/.test(String(value)) || Number(value)>2147483647) throw fail(400,'Invalid ID.'); return Number(value); };
const reason = value => { if(typeof value!=='string'||!value.trim()||value.length>2000) throw fail(400,'Enter a reason of 1–2,000 characters.'); return value.trim(); };
const wrap = fn => async(req,res,next)=>{try{await fn(req,res);}catch(e){if(e.status)res.status(e.status).json({error:e.message});else next(e);}};
const audit = (db,user,type,target,action,why,report=null) => db.query('INSERT INTO moderation_action(actor_id,target_type,target_id,action,reason,report_id) VALUES($1,$2,$3,$4,$5,$6)',[user.user_id,type,target,action,why,report]);
async function visible(db,postId,lock=false) {
 const {rows:[post]}=await db.query(`SELECT * FROM community_post WHERE post_id=$1 AND NOT hidden AND deleted_at IS NULL ${lock?'FOR UPDATE':''}`,[postId]);
 if(!post)throw fail(404,'Story unavailable.');return post;
}
async function activeActor(db,user,adminOnly=false) {
 // Serialize staff access changes, rechecking roles and suspension inside the transaction.
 await db.query('LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE');
 const {rows:[actor]}=await db.query('SELECT * FROM users WHERE user_id=$1',[user.user_id]);
 if(!actor || (adminOnly?actor.role!=='admin':!staff(actor)))throw fail(403,'Insufficient permissions.');
 if(actor.suspension_reason&&(!actor.suspended_until||new Date(actor.suspended_until)>new Date()))throw fail(403,'Account suspended.');
 return actor;
}
publicRoutes.get('/community/:postId/comments',wrap(async(req,res)=>{
 const postId=id(req.params.postId), after=Number(req.query.after||0);
 if(!Number.isSafeInteger(after)||after<0)throw fail(400,'Invalid pagination.');
 await visible(pool,postId);
 const {rows}=await pool.query('SELECT c.comment_id,c.user_id,c.content,c.created_at,c.updated_at,u.name FROM community_comment c JOIN users u USING(user_id) JOIN community_post p USING(post_id) WHERE c.post_id=$1 AND c.comment_id>$2 AND NOT c.hidden AND NOT p.hidden AND p.deleted_at IS NULL ORDER BY c.comment_id LIMIT 21',[postId,after]);
 const count=await pool.query('SELECT count(*)::int AS total FROM community_comment WHERE post_id=$1 AND NOT hidden',[postId]);
 res.json({comments:rows.slice(0,20),hasMore:rows.length>20,total:count.rows[0].total});
}));
account.post('/community/:postId/comments',wrap(async(req,res)=>{
 const postId=id(req.params.postId),content=reason(req.body?.content);
 const comment=await pool.withTransaction(async db=>{await visible(db,postId,true);return (await db.query('INSERT INTO community_comment(post_id,user_id,content) VALUES($1,$2,$3) RETURNING *',[postId,req.user.user_id,content])).rows[0];});
 res.status(201).json({comment:{...comment,name:req.user.name}});
}));
account.patch('/community/comments/:commentId',wrap(async(req,res)=>{
 const commentId=id(req.params.commentId);
 await pool.withTransaction(async db=>{
 const {rows:[comment]}=await db.query('SELECT * FROM community_comment WHERE comment_id=$1',[commentId]);
 if(!comment)throw fail(404,'Comment unavailable.');
 await visible(db,comment.post_id,true);
 if(req.body?.action==='hide') {
 await activeActor(db,req.user);await db.query('UPDATE community_comment SET hidden=true WHERE comment_id=$1',[commentId]);
 await audit(db,req.user,'comment',commentId,'hide',reason(req.body?.reason));
 }else{
 if(comment.user_id!==req.user.user_id)throw fail(403,'You can edit only your own comments.');
 if(comment.hidden)throw fail(403,'A hidden comment cannot be edited.');
 await db.query('UPDATE community_comment SET content=$1,updated_at=now() WHERE comment_id=$2',[reason(req.body?.content),commentId]);
 }
 });res.json({saved:true});
}));
account.delete('/community/comments/:commentId',wrap(async(req,res)=>{
 const commentId=id(req.params.commentId);
 await pool.withTransaction(async db=>{
 const {rows:[comment]}=await db.query('SELECT * FROM community_comment WHERE comment_id=$1',[commentId]);if(!comment)throw fail(404,'Comment unavailable.');
 await visible(db,comment.post_id,true);
 if(comment.user_id!==req.user.user_id){await activeActor(db,req.user,true);await audit(db,req.user,'comment',commentId,'delete',reason(req.body?.reason));}
 await db.query('DELETE FROM community_comment WHERE comment_id=$1',[commentId]);
 });res.json({deleted:true});
}));
account.patch('/community/:postId',wrap(async(req,res)=>{
 const postId=id(req.params.postId),title=req.body?.title,content=req.body?.content;
 if(typeof title!=='string'||!title.trim()||title.length>200||typeof content!=='string'||!content.trim()||content.length>10000)throw fail(400,'Enter a title and story within the length limits.');
 await pool.withTransaction(async db=>{const p=await visible(db,postId,true);if(p.user_id!==req.user.user_id)throw fail(403,'You can edit only your own stories.');await db.query('UPDATE community_post SET title=$1,content=$2 WHERE post_id=$3',[title.trim(),content.trim(),postId]);});res.json({saved:true});
}));
account.delete('/community/:postId',wrap(async(req,res)=>{
 const postId=id(req.params.postId);
 await pool.withTransaction(async db=>{const p=await visible(db,postId,true);if(p.user_id!==req.user.user_id)throw fail(403,'Use the Admin report queue to remove another member’s story.');await db.query('UPDATE community_post SET deleted_at=now() WHERE post_id=$1',[postId]);await audit(db,req.user,'post',postId,'delete-own','Removed by author');});res.json({deleted:true});
}));
account.post('/community/:postId/reports',wrap(async(req,res)=>{
 const postId=id(req.params.postId),why=req.body?.reason,explanation=req.body?.explanation??'';
 if(!['Spam','Harassment','Hate or abusive content','Inappropriate content','Misinformation','Other'].includes(why)||typeof explanation!=='string'||explanation.length>2000)throw fail(400,'Choose a report reason and an explanation up to 2,000 characters.');
 try{await pool.withTransaction(async db=>{const p=await visible(db,postId,true);if(p.user_id===req.user.user_id)throw fail(400,'You cannot report your own story.');
 const {rows:[report]}=await db.query('INSERT INTO community_report(post_id,reporter_id,reason,explanation) VALUES($1,$2,$3,$4) RETURNING report_id',[postId,req.user.user_id,why,explanation.trim()]);
 await db.query("INSERT INTO admin_notification(user_id,report_id) SELECT user_id,$1 FROM users WHERE role='admin'",[report.report_id]);
 });}catch(e){if(e.code==='23505')throw fail(409,'You already have an open report for this story.');throw e;}
 res.status(201).json({reported:true});
}));
account.use('/moderation',(req,res,next)=>staff(req.user)?next():res.status(403).json({error:'Moderator or Admin access required.'}));
account.get('/moderation/notifications',wrap(async(req,res)=>{
 const {rows}=await pool.query('SELECT notification_id,report_id,read_at,created_at FROM admin_notification WHERE user_id=$1 ORDER BY notification_id DESC LIMIT 100',[req.user.user_id]);
 const count=await pool.query('SELECT count(*)::int AS unread FROM admin_notification WHERE user_id=$1 AND read_at IS NULL',[req.user.user_id]);res.json({items:rows,unread:count.rows[0].unread});
}));
account.patch('/moderation/notifications/:notificationId',wrap(async(req,res)=>{await pool.write('UPDATE admin_notification SET read_at=now() WHERE notification_id=$1 AND user_id=$2',[id(req.params.notificationId),req.user.user_id]);res.json({saved:true});}));
account.get('/moderation/reports',wrap(async(req,res)=>{
 const offset=Number(req.query.offset||0),status=req.query.status||'',reportId=req.query.report_id? id(req.query.report_id):null;
 if(!Number.isSafeInteger(offset)||offset<0||offset>100000||!['','Open','Under Review','Escalated','Resolved','Dismissed'].includes(status))throw fail(400,'Invalid queue filter.');
 const {rows}=await pool.query(`SELECT r.*,p.title,p.content,p.user_id AS author_id,p.hidden,p.deleted_at,u.name AS author,
 COALESCE((SELECT json_agg(h ORDER BY h.action_id DESC) FROM (SELECT a.*,actor.name AS actor FROM moderation_action a LEFT JOIN users actor ON actor.user_id=a.actor_id WHERE (a.target_type='post' AND a.target_id=r.post_id) OR a.report_id=r.report_id) h),'[]') AS history
 FROM community_report r LEFT JOIN community_post p USING(post_id) LEFT JOIN users u ON u.user_id=p.user_id
 WHERE ($1='' OR r.status=$1) AND ($3::int IS NULL OR r.report_id=$3) ORDER BY r.report_id DESC LIMIT 21 OFFSET $2`,[status,offset,reportId]);
 res.json({items:rows.slice(0,20).map(r=>req.user.role==='admin'?r:{...r,content:r.deleted_at?null:r.content}),hasMore:rows.length>20});
}));
account.patch('/moderation/reports/:reportId',wrap(async(req,res)=>{
 const reportId=id(req.params.reportId),action=req.body?.action,why=reason(req.body?.reason);
 if(!['review','hide','unhide','dismiss','escalate','resolve','delete','suspend','unsuspend'].includes(action))throw fail(400,'Invalid moderation action.');
 await pool.withTransaction(async db=>{
 const actor=await activeActor(db,req.user,['delete','suspend','unsuspend'].includes(action));
 if(action==='escalate'&&actor.role!=='moderator')throw fail(403,'Only moderators can escalate reports to Admin.');
 const {rows:[report]}=await db.query('SELECT * FROM community_report WHERE report_id=$1 FOR UPDATE',[reportId]);if(!report)throw fail(404,'Report unavailable.');
 const {rows:[post]}=await db.query('SELECT * FROM community_post WHERE post_id=$1 FOR UPDATE',[report.post_id]);
 if(['hide','unhide','delete','suspend','unsuspend'].includes(action)&&!post)throw fail(409,'The story has already been removed. You can resolve or dismiss this report.');
 if(['hide','unhide','delete'].includes(action)&&post.deleted_at)throw fail(409,'This story has already been removed.');
 if(action==='delete') {await db.query('UPDATE community_post SET deleted_at=now() WHERE post_id=$1',[post.post_id]);}
 if(action==='hide'||action==='unhide')await db.query('UPDATE community_post SET hidden=$1 WHERE post_id=$2',[action==='hide',post.post_id]);
 if(action==='suspend'||action==='unsuspend')await changeSuspension(db,req.user,post.user_id,action,why,req.body?.expires_at,reportId);
 const status={review:'Under Review',escalate:'Escalated',dismiss:'Dismissed',resolve:'Resolved',delete:'Resolved'}[action];
 if(status)await db.query('UPDATE community_report SET status=$1 WHERE report_id=$2',[status,reportId]);
 await audit(db,req.user,'post',report.post_id||reportId,action,why,reportId);
 if(action==='escalate')await db.query("INSERT INTO admin_notification(user_id,report_id) SELECT user_id,$1 FROM users WHERE role='admin' ON CONFLICT(user_id,report_id) DO UPDATE SET read_at=NULL",[reportId]);
 });res.json({saved:true});
}));
async function changeSuspension(db,actor,userId,action,why,expiry,reportId=null){
 if(userId===actor.user_id)throw fail(400,'You cannot suspend your own account.');
 const {rows:[user]}=await db.query('SELECT * FROM users WHERE user_id=$1',[userId]);if(!user)throw fail(404,'Account not found.');
 if(action==='suspend'&&user.role==='admin'){
 const {rows:[count]}=await db.query("SELECT count(*)::int AS n FROM users WHERE role='admin' AND user_id<>$1 AND (suspension_reason IS NULL OR suspended_until<=now())",[userId]);if(!count.n)throw fail(409,'The last active Admin must retain access.');}
 if(expiry&&(typeof expiry!=='string'||!Number.isFinite(Date.parse(expiry))||new Date(expiry)<=new Date()))throw fail(400,'Choose a future suspension expiry.');
 await db.query('UPDATE users SET suspension_reason=$1,suspended_until=$2 WHERE user_id=$3',[action==='suspend'?why:null,action==='suspend'?(expiry||null):null,userId]);
 await audit(db,actor,'user',userId,action,why,reportId);
}
account.patch('/moderation/users/:userId',wrap(async(req,res)=>{
 const userId=id(req.params.userId),action=req.body?.action,why=reason(req.body?.reason);
 if(!['suspend','unsuspend'].includes(action))throw fail(400,'Invalid account action.');
 await pool.withTransaction(async db=>{await activeActor(db,req.user,true);await changeSuspension(db,req.user,userId,action,why,req.body?.expires_at);});res.json({saved:true});
}));
module.exports={account,public:publicRoutes,audit};

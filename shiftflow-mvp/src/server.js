import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { q, audit, ensureGeneralChat } from './database.js';
import { vapidPublicKey, saveSubscription, removeSubscription, sendToUser, sendToUsers } from './push.js';
import { attachRealtime, broadcastToUsers } from './realtime.js';
import { sendMail, templates, appUrl } from './mailer.js';
import { createEmailToken, consumeEmailToken } from './emailtokens.js';
import { clearSessionCookie, parseCookies, passwordHash, passwordMatches, randomToken, sessionCookie, tokenHash } from './security.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const publicDir = path.join(root, 'public');
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const sessionSeconds = Number(process.env.SESSION_DAYS || 14) * 86400;

const json = (res, status, data, headers = {}) => {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});
  res.end(JSON.stringify(data));
};
const fail = (res, status, message) => json(res,status,{error:message});
const cleanUser = u => u && ({id:u.id,name:u.name,email:u.email,role:u.role,jobTitle:u.job_title,phone:u.phone,status:u.status,emailVerified:!!u.email_verified,organizationId:u.organization_id,organizationName:u.organization_name});
const nowIso = () => new Date().toISOString();

// Email action links. In non-production a devToken can be surfaced in responses
// (guarded by MAIL_DEV_RETURN_TOKEN) so automated tests can follow the flow.
const emailPaths = { invite:'/accept-invite', reset:'/reset-password', verify:'/verify-email' };
const devTokenField = raw => process.env.MAIL_DEV_RETURN_TOKEN==='1' ? {devToken:raw} : {};
async function issueEmail(userId, to, purpose, vars={}) {
  const raw = await createEmailToken(userId, purpose);
  const link = `${appUrl}${emailPaths[purpose]}?token=${raw}`;
  const tpl = templates[purpose]({ link, ...vars });
  sendMail({ to, ...tpl }).catch(err => console.error('mail error:', err.message));
  return raw;
}
// Matches the DB timestamp format ('YYYY-MM-DD HH:MM:SS', UTC) used by
// created_at so that last_read_at string comparisons order correctly.
const nowStamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

async function body(req) {
  const chunks=[]; let size=0;
  for await (const chunk of req) { size += chunk.length; if(size>1_000_000) throw new Error('BODY_TOO_LARGE'); chunks.push(chunk); }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('INVALID_JSON'); }
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

async function currentUser(req) {
  const token = bearerToken(req) || parseCookies(req.headers.cookie).sf_session;
  if (!token) return null;
  return q.get(`SELECT u.*,o.name organization_name FROM sessions s JOIN users u ON u.id=s.user_id
    JOIN organizations o ON o.id=u.organization_id WHERE s.token_hash=? AND s.expires_at>? AND u.status='active'`,
    [tokenHash(token), nowIso()]);
}

async function createSession(userId) {
  const token=randomToken(), expires=new Date(Date.now()+sessionSeconds*1000).toISOString();
  await q.run('INSERT INTO sessions(user_id,token_hash,expires_at) VALUES(?,?,?)', [userId,tokenHash(token),expires]);
  return token;
}

const manager = user => ['owner','manager'].includes(user.role);
const idFrom = (pathname, base) => Number(pathname.slice(base.length).split('/')[0]);
const required = (value,name,max=200) => {
  if(typeof value!=='string'||!value.trim()) throw new Error(`${name}: обязательное поле`);
  return value.trim().slice(0,max);
};
const validDate = value => {
  const date=new Date(value); if(!value||Number.isNaN(date.valueOf())) throw new Error('Некорректная дата'); return date.toISOString();
};

async function api(req,res,url) {
  const {pathname}=url;
  if(pathname==='/api/health') return json(res,200,{status:'ok',time:nowIso()});
  if(req.method==='POST'&&pathname==='/api/auth/register') {
    const data=await body(req); const name=required(data.name,'Имя',100), company=required(data.company,'Компания',120);
    const email=required(data.email,'Email',200).toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||String(data.password||'').length<8) return fail(res,422,'Проверьте email; пароль должен быть не короче 8 символов');
    let uid;
    try {
      uid = await q.tx(async (t) => {
        const org = (await t.insert('INSERT INTO organizations(name) VALUES(?)', [company])).id;
        return (await t.insert(`INSERT INTO users(organization_id,name,email,password_hash,role,job_title) VALUES(?,?,?,?,?,'Управляющий')`,
          [org,name,email,passwordHash(data.password),'owner'])).id;
      });
    } catch(e) { if(e.code==='UNIQUE_VIOLATION') return fail(res,409,'Этот email уже используется'); throw e; }
    const token=await createSession(uid);
    const full=await q.get(`SELECT u.*,o.name organization_name FROM users u JOIN organizations o ON o.id=u.organization_id WHERE u.id=?`,[uid]);
    const verifyRaw=await issueEmail(uid,email,'verify');
    return json(res,201,{token,user:cleanUser(full),...devTokenField(verifyRaw)},{'Set-Cookie':sessionCookie(token,sessionSeconds)});
  }
  if(req.method==='POST'&&pathname==='/api/auth/login') {
    const data=await body(req);
    const user=await q.get(`SELECT u.*,o.name organization_name FROM users u JOIN organizations o ON o.id=u.organization_id WHERE u.email=? AND u.status='active'`,[String(data.email||'').toLowerCase()]);
    if(!user||!passwordMatches(String(data.password||''),user.password_hash)) return fail(res,401,'Неверный email или пароль');
    const token=await createSession(user.id); await audit(user,'login','session',null);
    return json(res,200,{token,user:cleanUser(user)},{'Set-Cookie':sessionCookie(token,sessionSeconds)});
  }
  if(req.method==='POST'&&pathname==='/api/auth/logout') {
    const token=bearerToken(req)||parseCookies(req.headers.cookie).sf_session;
    if(token) await q.run('DELETE FROM sessions WHERE token_hash=?', [tokenHash(token)]);
    return json(res,200,{ok:true},{'Set-Cookie':clearSessionCookie()});
  }
  if(req.method==='POST'&&pathname==='/api/auth/forgot-password') {
    const d=await body(req); const email=String(d.email||'').toLowerCase().trim();
    const found=email?await q.get(`SELECT id FROM users WHERE email=? AND status='active'`,[email]):null;
    let raw=null;
    if(found) raw=await issueEmail(found.id,email,'reset');
    // Always 200 so the endpoint does not reveal whether the email exists.
    return json(res,200,{ok:true,...(found?devTokenField(raw):{})});
  }
  if(req.method==='POST'&&pathname==='/api/auth/reset-password') {
    const d=await body(req);
    if(String(d.password||'').length<8) return fail(res,422,'Пароль должен быть не короче 8 символов');
    const uid=await consumeEmailToken(String(d.token||''),'reset');
    if(!uid) return fail(res,400,'Ссылка недействительна или устарела');
    await q.run('UPDATE users SET password_hash=?,email_verified=1 WHERE id=?', [passwordHash(d.password),uid]);
    await q.run('DELETE FROM sessions WHERE user_id=?', [uid]); // log out other sessions
    return json(res,200,{ok:true});
  }
  if(req.method==='POST'&&pathname==='/api/auth/accept-invite') {
    const d=await body(req);
    if(String(d.password||'').length<8) return fail(res,422,'Пароль должен быть не короче 8 символов');
    const uid=await consumeEmailToken(String(d.token||''),'invite');
    if(!uid) return fail(res,400,'Приглашение недействительно или устарело');
    await q.run(`UPDATE users SET password_hash=?,email_verified=1,status='active' WHERE id=?`, [passwordHash(d.password),uid]);
    const token=await createSession(uid);
    const full=await q.get(`SELECT u.*,o.name organization_name FROM users u JOIN organizations o ON o.id=u.organization_id WHERE u.id=?`,[uid]);
    return json(res,200,{token,user:cleanUser(full)},{'Set-Cookie':sessionCookie(token,sessionSeconds)});
  }
  if(req.method==='POST'&&pathname==='/api/auth/verify-email') {
    const d=await body(req);
    const uid=await consumeEmailToken(String(d.token||''),'verify');
    if(!uid) return fail(res,400,'Ссылка недействительна или устарела');
    await q.run('UPDATE users SET email_verified=1 WHERE id=?', [uid]);
    return json(res,200,{ok:true});
  }
  const user=await currentUser(req);
  if(!user) return fail(res,401,'Требуется авторизация');
  if(pathname==='/api/me'&&req.method==='GET') return json(res,200,{user:cleanUser(user)});
  if(pathname==='/api/me'&&req.method==='PATCH') {
    const d=await body(req);
    await q.run('UPDATE users SET name=?,job_title=?,phone=? WHERE id=?', [
      String(d.name??user.name).slice(0,100),String(d.jobTitle??user.job_title).slice(0,100),String(d.phone??user.phone).slice(0,40),user.id]);
    await audit(user,'update','profile',user.id);
    return json(res,200,{user:cleanUser({...user,name:d.name??user.name,job_title:d.jobTitle??user.job_title,phone:d.phone??user.phone})});
  }
  if(pathname==='/api/push/vapid-public-key'&&req.method==='GET') {
    return json(res,200,{publicKey:vapidPublicKey});
  }
  if(pathname==='/api/push/subscribe'&&req.method==='POST') {
    const d=await body(req);
    if(!d.subscription||!d.subscription.endpoint) return fail(res,422,'Некорректная подписка');
    await saveSubscription(user.id,d.subscription); return json(res,201,{ok:true});
  }
  if(pathname==='/api/push/unsubscribe'&&req.method==='POST') {
    const d=await body(req); if(d.endpoint) await removeSubscription(d.endpoint); return json(res,200,{ok:true});
  }
  if(pathname==='/api/organization'&&req.method==='GET') {
    const org=await q.get('SELECT id,name,timezone,locale,settings FROM organizations WHERE id=?', [user.organization_id]);
    let settings={}; try{settings=JSON.parse(org.settings||'{}');}catch{settings={};}
    const defaults={industry:'',language:org.locale||'ru',operatingDays:[1,2,3,4,5],defaultShiftHours:8,overtimeThreshold:40,autoApproveSwaps:false,managerOverrides:false,roles:[]};
    return json(res,200,{organization:{id:org.id,name:org.name,timezone:org.timezone,settings:{...defaults,...settings}}});
  }
  if(pathname==='/api/organization'&&req.method==='PATCH') {
    if(!manager(user)) return fail(res,403,'Недостаточно прав');
    const d=await body(req);
    const org=await q.get('SELECT name,settings FROM organizations WHERE id=?', [user.organization_id]);
    let current={}; try{current=JSON.parse(org.settings||'{}');}catch{current={};}
    const merged=d.settings&&typeof d.settings==='object'?{...current,...d.settings}:current;
    const name=typeof d.name==='string'&&d.name.trim()?d.name.trim().slice(0,120):org.name;
    await q.run('UPDATE organizations SET name=?,settings=? WHERE id=?', [name,JSON.stringify(merged),user.organization_id]);
    await audit(user,'update','organization',user.organization_id);
    return json(res,200,{ok:true});
  }
  if(pathname==='/api/notifications'&&req.method==='GET') {
    const org=user.organization_id;
    const sql=`SELECT r.id,r.type,r.status,r.starts_at,r.ends_at,r.reason,r.created_at,u.name user_name
      FROM requests r JOIN users u ON u.id=r.user_id
      WHERE r.organization_id=?${manager(user)?'':' AND r.user_id=?'} ORDER BY r.created_at DESC LIMIT 20`;
    const rows=manager(user)?await q.all(sql,[org]):await q.all(sql,[org,user.id]);
    const typeLabel={time_off:'Запрос на отгул',availability:'Доступность',swap:'Обмен сменами'};
    const statusLabel={pending:'Ожидает',approved:'Одобрено',rejected:'Отклонено'};
    const notifications=rows.map(r=>({
      id:r.id,category:r.type==='swap'?'swap':r.type==='time_off'?'leave':'availability',
      title:`${typeLabel[r.type]||'Заявка'}: ${statusLabel[r.status]}`,
      body:`${r.user_name} · ${r.starts_at.slice(0,10)} – ${r.ends_at.slice(0,10)}${r.reason?` · ${r.reason}`:''}`,
      status:r.status,createdAt:r.created_at,actionable:manager(user)&&r.status==='pending'
    }));
    return json(res,200,{notifications,unread:notifications.filter(n=>n.actionable).length});
  }

  if(pathname==='/api/dashboard'&&req.method==='GET') {
    const org=user.organization_id, today=nowIso().slice(0,10);
    const stats=await q.get(`SELECT
      (SELECT COUNT(*) FROM users WHERE organization_id=? AND status='active') staff,
      (SELECT COUNT(*) FROM shifts WHERE organization_id=? AND substr(starts_at,1,10)=? AND status IN ('active','scheduled')) "activeToday",
      (SELECT COUNT(*) FROM requests WHERE organization_id=? AND status='pending') pending,
      (SELECT COUNT(*) FROM shifts WHERE organization_id=? AND status='open' AND starts_at>=?) "openShifts"`,
      [org,org,today,org,org,nowIso()]);
    const shifts=await q.all(`SELECT s.*,u.name user_name,u.job_title FROM shifts s LEFT JOIN users u ON u.id=s.user_id
      WHERE s.organization_id=? AND substr(s.starts_at,1,10)=? ORDER BY s.starts_at LIMIT 8`, [org,today]);
    const activity=await q.all(`SELECT a.*,u.name user_name FROM audit_log a LEFT JOIN users u ON u.id=a.user_id
      WHERE a.organization_id=? ORDER BY a.id DESC LIMIT 6`, [org]);
    const num=(x)=>Number(x)||0;
    return json(res,200,{stats:{staff:num(stats.staff),activeToday:num(stats.activeToday),pending:num(stats.pending),openShifts:num(stats.openShifts)},shifts,activity});
  }
  if(pathname==='/api/staff'&&req.method==='GET') {
    return json(res,200,{staff:await q.all(`SELECT id,name,email,role,job_title "jobTitle",phone,status,created_at "createdAt" FROM users WHERE organization_id=? ORDER BY name`, [user.organization_id])});
  }
  if(pathname==='/api/staff'&&req.method==='POST') {
    if(!manager(user)) return fail(res,403,'Недостаточно прав');
    const d=await body(req), email=required(d.email,'Email').toLowerCase();
    // If a password is supplied, use it directly; otherwise create an inactive
    // account with a random password and email an invite to set one.
    const hasPassword=typeof d.password==='string'&&d.password.length>=8;
    const invite=!hasPassword;
    const passwordHashValue=passwordHash(hasPassword?d.password:randomToken());
    try {
      const result=await q.insert(`INSERT INTO users(organization_id,name,email,password_hash,role,job_title,phone) VALUES(?,?,?,?,?,?,?)`,
        [user.organization_id,required(d.name,'Имя',100),email,passwordHashValue,['manager','employee'].includes(d.role)?d.role:'employee',String(d.jobTitle||'').slice(0,100),String(d.phone||'').slice(0,40)]);
      await ensureGeneralChat(user.organization_id,result.id);
      await audit(user,'create','user',result.id,{email});
      let raw=null;
      if(invite) raw=await issueEmail(result.id,email,'invite',{orgName:user.organization_name});
      return json(res,201,{id:result.id,invited:invite,...(invite?devTokenField(raw):{})});
    } catch(e) { if(e.code==='UNIQUE_VIOLATION') return fail(res,409,'Сотрудник с таким email уже существует'); throw e; }
  }
  if(pathname.startsWith('/api/staff/')&&req.method==='PATCH') {
    if(!manager(user)) return fail(res,403,'Недостаточно прав'); const id=idFrom(pathname,'/api/staff/'),d=await body(req);
    const target=await q.get('SELECT * FROM users WHERE id=? AND organization_id=?', [id,user.organization_id]); if(!target)return fail(res,404,'Сотрудник не найден');
    await q.run(`UPDATE users SET name=?,role=?,job_title=?,phone=?,status=? WHERE id=?`, [
      String(d.name??target.name).slice(0,100), ['owner','manager','employee'].includes(d.role)?d.role:target.role,
      String(d.jobTitle??target.job_title).slice(0,100),String(d.phone??target.phone).slice(0,40),['active','inactive'].includes(d.status)?d.status:target.status,id]);
    await audit(user,'update','user',id); return json(res,200,{ok:true});
  }
  if(pathname==='/api/shifts'&&req.method==='GET') {
    const from=url.searchParams.get('from')||new Date(Date.now()-86400000).toISOString(), to=url.searchParams.get('to')||new Date(Date.now()+14*86400000).toISOString();
    const shifts=await q.all(`SELECT s.*,u.name user_name,u.job_title FROM shifts s LEFT JOIN users u ON u.id=s.user_id
      WHERE s.organization_id=? AND s.starts_at<? AND s.ends_at>? ORDER BY s.starts_at`, [user.organization_id,to,from]);
    return json(res,200,{shifts});
  }
  if(pathname==='/api/shifts'&&req.method==='POST') {
    if(!manager(user))return fail(res,403,'Недостаточно прав'); const d=await body(req),start=validDate(d.startsAt),end=validDate(d.endsAt);
    if(new Date(end)<=new Date(start))return fail(res,422,'Окончание должно быть позже начала');
    const assigned=d.userId?await q.get('SELECT id FROM users WHERE id=? AND organization_id=?', [Number(d.userId),user.organization_id]):null;
    if(d.userId&&!assigned)return fail(res,422,'Сотрудник не найден');
    const r=await q.insert(`INSERT INTO shifts(organization_id,user_id,title,starts_at,ends_at,location,notes,status,created_by) VALUES(?,?,?,?,?,?,?,?,?)`,
      [user.organization_id,d.userId||null,required(d.title,'Название',120),start,end,String(d.location||'').slice(0,120),String(d.notes||'').slice(0,1000),d.userId?'scheduled':'open',user.id]);
    await audit(user,'create','shift',r.id); return json(res,201,{id:r.id});
  }
  if(pathname.startsWith('/api/shifts/')&&req.method==='PATCH') {
    if(!manager(user))return fail(res,403,'Недостаточно прав'); const id=idFrom(pathname,'/api/shifts/'); const d=await body(req);
    const shift=await q.get('SELECT * FROM shifts WHERE id=? AND organization_id=?', [id,user.organization_id]);
    if(!shift)return fail(res,404,'Смена не найдена');
    const start=d.startsAt!==undefined?validDate(d.startsAt):shift.starts_at;
    const end=d.endsAt!==undefined?validDate(d.endsAt):shift.ends_at;
    if(new Date(end)<=new Date(start))return fail(res,422,'Окончание должно быть позже начала');
    let userId=shift.user_id;
    if(d.userId!==undefined){
      if(d.userId===null) userId=null;
      else { const a=await q.get('SELECT id FROM users WHERE id=? AND organization_id=?', [Number(d.userId),user.organization_id]);
        if(!a)return fail(res,422,'Сотрудник не найден'); userId=Number(d.userId); }
    }
    const status=d.status&&['scheduled','open','active','completed','cancelled'].includes(d.status)?d.status:(userId?(shift.status==='open'?'scheduled':shift.status):'open');
    await q.run('UPDATE shifts SET user_id=?,title=?,starts_at=?,ends_at=?,location=?,status=? WHERE id=?', [
      userId,d.title!==undefined?required(d.title,'Название',120):shift.title,start,end,
      d.location!==undefined?String(d.location).slice(0,120):shift.location,status,id]);
    await audit(user,'update','shift',id); return json(res,200,{ok:true});
  }
  if(pathname.startsWith('/api/shifts/')&&req.method==='DELETE') {
    if(!manager(user))return fail(res,403,'Недостаточно прав'); const id=idFrom(pathname,'/api/shifts/');
    const r=await q.run('DELETE FROM shifts WHERE id=? AND organization_id=?', [id,user.organization_id]); if(!r.changes)return fail(res,404,'Смена не найдена');
    await audit(user,'delete','shift',id); return json(res,200,{ok:true});
  }
  if(pathname==='/api/requests'&&req.method==='GET') {
    const sql=`SELECT r.*,u.name user_name FROM requests r JOIN users u ON u.id=r.user_id
      WHERE r.organization_id=?${manager(user)?'':' AND r.user_id=?'} ORDER BY r.created_at DESC`;
    const rows=manager(user)?await q.all(sql,[user.organization_id]):await q.all(sql,[user.organization_id,user.id]);
    return json(res,200,{requests:rows});
  }
  if(pathname==='/api/requests'&&req.method==='POST') {
    const d=await body(req),type=['time_off','availability','swap'].includes(d.type)?d.type:'time_off';
    const r=await q.insert(`INSERT INTO requests(organization_id,user_id,type,starts_at,ends_at,reason) VALUES(?,?,?,?,?,?)`,
      [user.organization_id,user.id,type,validDate(d.startsAt),validDate(d.endsAt),String(d.reason||'').slice(0,500)]);
    await audit(user,'create','request',r.id);
    const managers=(await q.all(`SELECT id FROM users WHERE organization_id=? AND role IN ('owner','manager') AND status='active' AND id!=?`, [user.organization_id,user.id])).map(m=>m.id);
    sendToUsers(managers,{title:'Новая заявка',body:`${user.name}: ${type==='time_off'?'отгул':type==='swap'?'обмен сменами':'доступность'}`,url:'/notifications'}).catch(()=>{});
    return json(res,201,{id:r.id});
  }
  if(/^\/api\/requests\/\d+\/review$/.test(pathname)&&req.method==='PATCH') {
    if(!manager(user))return fail(res,403,'Недостаточно прав'); const id=Number(pathname.split('/')[3]),d=await body(req);
    if(!['approved','rejected'].includes(d.status))return fail(res,422,'Некорректный статус');
    const target=await q.get('SELECT user_id FROM requests WHERE id=? AND organization_id=?', [id,user.organization_id]);
    const r=await q.run(`UPDATE requests SET status=?,reviewed_by=? WHERE id=? AND organization_id=? AND status='pending'`, [d.status,user.id,id,user.organization_id]);
    if(!r.changes)return fail(res,404,'Активная заявка не найдена'); await audit(user,'review','request',id,{status:d.status});
    if(target) sendToUser(target.user_id,{title:'Заявка рассмотрена',body:d.status==='approved'?'Ваша заявка одобрена':'Ваша заявка отклонена',url:'/'}).catch(()=>{});
    return json(res,200,{ok:true});
  }
  if(pathname==='/api/conversations'&&req.method==='GET') {
    await ensureGeneralChat(user.organization_id,user.id);
    const rows=await q.all(`SELECT c.id,c.type,c.title,c.is_general "isGeneral",
      (SELECT body FROM messages m WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1) "lastBody",
      (SELECT created_at FROM messages m WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1) "lastAt",
      (SELECT u.name FROM messages m JOIN users u ON u.id=m.user_id WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1) "lastAuthor",
      (SELECT u.name FROM conversation_members cm2 JOIN users u ON u.id=cm2.user_id WHERE cm2.conversation_id=c.id AND cm2.user_id!=? LIMIT 1) "otherName",
      (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id AND m.created_at>cm.last_read_at AND m.user_id!=?) unread
      FROM conversations c JOIN conversation_members cm ON cm.conversation_id=c.id AND cm.user_id=?
      WHERE c.organization_id=? ORDER BY "lastAt" DESC`, [user.id,user.id,user.id,user.organization_id]);
    const conversations=rows.map(r=>({
      id:r.id,type:r.type,isGeneral:!!r.isGeneral,
      title:r.type==='direct'?(r.otherName||'Диалог'):(r.title||'Чат'),
      lastBody:r.lastBody||'',lastAuthor:r.lastAuthor||'',lastAt:r.lastAt,unread:Number(r.unread)||0
    }));
    return json(res,200,{conversations});
  }
  if(/^\/api\/conversations\/\d+\/messages$/.test(pathname)&&req.method==='GET') {
    const id=Number(pathname.split('/')[3]);
    const member=await q.get(`SELECT 1 FROM conversation_members cm JOIN conversations c ON c.id=cm.conversation_id
      WHERE cm.conversation_id=? AND cm.user_id=? AND c.organization_id=?`, [id,user.id,user.organization_id]);
    if(!member) return fail(res,404,'Диалог не найден');
    const messages=await q.all(`SELECT m.id,m.body,m.created_at "createdAt",m.user_id "userId",u.name "userName"
      FROM messages m JOIN users u ON u.id=m.user_id WHERE m.conversation_id=? ORDER BY m.id`, [id]);
    await q.run('UPDATE conversation_members SET last_read_at=? WHERE conversation_id=? AND user_id=?', [nowStamp(),id,user.id]);
    return json(res,200,{messages});
  }
  if(/^\/api\/conversations\/\d+\/messages$/.test(pathname)&&req.method==='POST') {
    const id=Number(pathname.split('/')[3]);
    const member=await q.get(`SELECT 1 FROM conversation_members cm JOIN conversations c ON c.id=cm.conversation_id
      WHERE cm.conversation_id=? AND cm.user_id=? AND c.organization_id=?`, [id,user.id,user.organization_id]);
    if(!member) return fail(res,404,'Диалог не найден');
    const d=await body(req); const text=required(d.body,'Сообщение',2000);
    const r=await q.insert('INSERT INTO messages(conversation_id,user_id,body) VALUES(?,?,?)', [id,user.id,text]);
    await q.run('UPDATE conversation_members SET last_read_at=? WHERE conversation_id=? AND user_id=?', [nowStamp(),id,user.id]);
    // Fan out the new message to every member's live sockets.
    const created=await q.get('SELECT created_at FROM messages WHERE id=?', [r.id]);
    const members=(await q.all('SELECT user_id FROM conversation_members WHERE conversation_id=?', [id])).map(m=>m.user_id);
    broadcastToUsers(members,{type:'message',conversationId:id,message:{
      id:r.id,body:text,createdAt:created.created_at,userId:user.id,userName:user.name}});
    return json(res,201,{id:r.id});
  }
  if(pathname==='/api/conversations/direct'&&req.method==='POST') {
    const d=await body(req); const otherId=Number(d.userId);
    const other=await q.get(`SELECT id FROM users WHERE id=? AND organization_id=? AND status='active'`, [otherId,user.organization_id]);
    if(!other||otherId===user.id) return fail(res,422,'Сотрудник не найден');
    const existing=await q.get(`SELECT c.id FROM conversations c
      JOIN conversation_members a ON a.conversation_id=c.id AND a.user_id=?
      JOIN conversation_members b ON b.conversation_id=c.id AND b.user_id=?
      WHERE c.type='direct' AND c.organization_id=? LIMIT 1`, [user.id,otherId,user.organization_id]);
    if(existing) return json(res,200,{id:existing.id});
    const cid=await q.tx(async (t) => {
      const c=(await t.insert(`INSERT INTO conversations(organization_id,type) VALUES(?,'direct')`, [user.organization_id])).id;
      await t.run('INSERT INTO conversation_members(conversation_id,user_id) VALUES(?,?)', [c,user.id]);
      await t.run('INSERT INTO conversation_members(conversation_id,user_id) VALUES(?,?)', [c,otherId]);
      return c;
    });
    return json(res,201,{id:cid});
  }
  if(pathname==='/api/analytics'&&req.method==='GET') {
    const cutoff=new Date(Date.now()-13*86400000).toISOString();
    const raw=await q.all(`SELECT starts_at,ends_at,user_id FROM shifts WHERE organization_id=? AND starts_at>=? AND status!='cancelled'`, [user.organization_id,cutoff]);
    const byDay=new Map();
    for(const s of raw){
      const day=s.starts_at.slice(0,10);
      const hours=(new Date(s.ends_at)-new Date(s.starts_at))/3600000;
      const e=byDay.get(day)||{day,shifts:0,hours:0,people:new Set()};
      e.shifts+=1; e.hours+=hours; if(s.user_id!=null) e.people.add(s.user_id);
      byDay.set(day,e);
    }
    const days=[...byDay.values()].sort((a,b)=>a.day<b.day?-1:1)
      .map(e=>({day:e.day,shifts:e.shifts,hours:Math.round(e.hours*10)/10,people:e.people.size}));
    const rolesRaw=await q.all(`SELECT COALESCE(NULLIF(job_title,''),'Без должности') role,COUNT(*) count FROM users WHERE organization_id=? AND status='active' GROUP BY job_title ORDER BY count DESC`, [user.organization_id]);
    const roles=rolesRaw.map(r=>({role:r.role,count:Number(r.count)}));
    return json(res,200,{days,roles});
  }
  return fail(res,404,'Метод API не найден');
}

function staticFile(res,pathname) {
  let relative=pathname==='/'?'index.html':pathname.slice(1);
  if(!path.extname(relative)) relative='index.html';
  const file=path.resolve(publicDir,relative);
  if(!file.startsWith(publicDir)||!fs.existsSync(file)) return fail(res,404,'Файл не найден');
  const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':process.env.NODE_ENV==='production'&&path.extname(file)!=='.html'?'public, max-age=3600':'no-cache'});
  fs.createReadStream(file).pipe(res);
}

const allowedOrigins=(process.env.CORS_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
function applyCors(req,res){
  const origin=req.headers.origin;
  if(!origin) return;
  if(allowedOrigins.includes('*')||allowedOrigins.includes(origin)){
    res.setHeader('Access-Control-Allow-Origin',origin);
    res.setHeader('Vary','Origin');
    res.setHeader('Access-Control-Allow-Credentials','true');
    res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age','86400');
  }
}

const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  applyCors(req,res);
  if(req.method==='OPTIONS'){ res.writeHead(204); return res.end(); }
  try { if(url.pathname.startsWith('/api/')) await api(req,res,url); else staticFile(res,url.pathname); }
  catch(error) { console.error(error); fail(res,error.message==='BODY_TOO_LARGE'?413:400,error.message==='INVALID_JSON'?'Некорректный JSON':(error.message||'Ошибка запроса')); }
});
attachRealtime(server);
server.listen(port,host,()=>console.log(`ShiftFlow: http://${host}:${port} (${process.env.DATABASE_URL?'postgres':'sqlite'})`));
export { server };

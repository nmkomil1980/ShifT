import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, audit } from './database.js';
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
const cleanUser = u => u && ({id:u.id,name:u.name,email:u.email,role:u.role,jobTitle:u.job_title,phone:u.phone,status:u.status,organizationId:u.organization_id,organizationName:u.organization_name});

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

function currentUser(req) {
  const token = bearerToken(req) || parseCookies(req.headers.cookie).sf_session;
  if (!token) return null;
  return db.prepare(`SELECT u.*,o.name organization_name FROM sessions s JOIN users u ON u.id=s.user_id
    JOIN organizations o ON o.id=u.organization_id WHERE s.token_hash=? AND s.expires_at>datetime('now') AND u.status='active'`).get(tokenHash(token));
}

function createSession(userId) {
  const token=randomToken(), expires=new Date(Date.now()+sessionSeconds*1000).toISOString();
  db.prepare('INSERT INTO sessions(user_id,token_hash,expires_at) VALUES(?,?,?)').run(userId,tokenHash(token),expires);
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
  if(pathname==='/api/health') return json(res,200,{status:'ok',time:new Date().toISOString()});
  if(req.method==='POST'&&pathname==='/api/auth/register') {
    const data=await body(req); const name=required(data.name,'Имя',100), company=required(data.company,'Компания',120);
    const email=required(data.email,'Email',200).toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||String(data.password||'').length<8) return fail(res,422,'Проверьте email; пароль должен быть не короче 8 символов');
    db.exec('BEGIN');
    try {
      const org=db.prepare('INSERT INTO organizations(name) VALUES(?)').run(company).lastInsertRowid;
      const uid=db.prepare(`INSERT INTO users(organization_id,name,email,password_hash,role,job_title) VALUES(?,?,?,?,?,'Управляющий')`)
        .run(org,name,email,passwordHash(data.password),'owner').lastInsertRowid;
      db.exec('COMMIT'); const token=createSession(uid);
      return json(res,201,{token,user:cleanUser(currentUser({headers:{cookie:`sf_session=${token}`}}))},{'Set-Cookie':sessionCookie(token,sessionSeconds)});
    } catch(e) { db.exec('ROLLBACK'); if(String(e).includes('UNIQUE')) return fail(res,409,'Этот email уже используется'); throw e; }
  }
  if(req.method==='POST'&&pathname==='/api/auth/login') {
    const data=await body(req);
    const user=db.prepare(`SELECT u.*,o.name organization_name FROM users u JOIN organizations o ON o.id=u.organization_id WHERE u.email=? AND u.status='active'`).get(String(data.email||'').toLowerCase());
    if(!user||!passwordMatches(String(data.password||''),user.password_hash)) return fail(res,401,'Неверный email или пароль');
    const token=createSession(user.id); audit(user,'login','session',null);
    return json(res,200,{token,user:cleanUser(user)},{'Set-Cookie':sessionCookie(token,sessionSeconds)});
  }
  if(req.method==='POST'&&pathname==='/api/auth/logout') {
    const token=bearerToken(req)||parseCookies(req.headers.cookie).sf_session;
    if(token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(token));
    return json(res,200,{ok:true},{'Set-Cookie':clearSessionCookie()});
  }
  const user=currentUser(req);
  if(!user) return fail(res,401,'Требуется авторизация');
  if(pathname==='/api/me'&&req.method==='GET') return json(res,200,{user:cleanUser(user)});
  if(pathname==='/api/me'&&req.method==='PATCH') {
    const d=await body(req);
    db.prepare('UPDATE users SET name=?,job_title=?,phone=? WHERE id=?').run(
      String(d.name??user.name).slice(0,100),String(d.jobTitle??user.job_title).slice(0,100),String(d.phone??user.phone).slice(0,40),user.id);
    audit(user,'update','profile',user.id);
    return json(res,200,{user:cleanUser({...user,name:d.name??user.name,job_title:d.jobTitle??user.job_title,phone:d.phone??user.phone})});
  }
  if(pathname==='/api/notifications'&&req.method==='GET') {
    const org=user.organization_id;
    const requests=db.prepare(`SELECT r.id,r.type,r.status,r.starts_at,r.ends_at,r.reason,r.created_at,u.name user_name
      FROM requests r JOIN users u ON u.id=r.user_id
      WHERE r.organization_id=?${manager(user)?'':' AND r.user_id=?'} ORDER BY r.created_at DESC LIMIT 20`);
    const rows=manager(user)?requests.all(org):requests.all(org,user.id);
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
    const org=user.organization_id, today=new Date().toISOString().slice(0,10);
    const stats=db.prepare(`SELECT
      (SELECT COUNT(*) FROM users WHERE organization_id=? AND status='active') staff,
      (SELECT COUNT(*) FROM shifts WHERE organization_id=? AND date(starts_at)=? AND status IN ('active','scheduled')) activeToday,
      (SELECT COUNT(*) FROM requests WHERE organization_id=? AND status='pending') pending,
      (SELECT COUNT(*) FROM shifts WHERE organization_id=? AND status='open' AND starts_at>=datetime('now')) openShifts`).get(org,org,today,org,org);
    const shifts=db.prepare(`SELECT s.*,u.name user_name,u.job_title FROM shifts s LEFT JOIN users u ON u.id=s.user_id
      WHERE s.organization_id=? AND date(s.starts_at)=? ORDER BY s.starts_at LIMIT 8`).all(org,today);
    const activity=db.prepare(`SELECT a.*,u.name user_name FROM audit_log a LEFT JOIN users u ON u.id=a.user_id
      WHERE a.organization_id=? ORDER BY a.id DESC LIMIT 6`).all(org);
    return json(res,200,{stats,shifts,activity});
  }
  if(pathname==='/api/staff'&&req.method==='GET') {
    return json(res,200,{staff:db.prepare(`SELECT id,name,email,role,job_title jobTitle,phone,status,created_at createdAt FROM users WHERE organization_id=? ORDER BY name`).all(user.organization_id)});
  }
  if(pathname==='/api/staff'&&req.method==='POST') {
    if(!manager(user)) return fail(res,403,'Недостаточно прав');
    const d=await body(req), email=required(d.email,'Email').toLowerCase();
    try {
      const result=db.prepare(`INSERT INTO users(organization_id,name,email,password_hash,role,job_title,phone) VALUES(?,?,?,?,?,?,?)`)
        .run(user.organization_id,required(d.name,'Имя',100),email,passwordHash(d.password||'Welcome123!'),['manager','employee'].includes(d.role)?d.role:'employee',String(d.jobTitle||'').slice(0,100),String(d.phone||'').slice(0,40));
      audit(user,'create','user',result.lastInsertRowid,{email}); return json(res,201,{id:Number(result.lastInsertRowid)});
    } catch(e) { if(String(e).includes('UNIQUE')) return fail(res,409,'Сотрудник с таким email уже существует'); throw e; }
  }
  if(pathname.startsWith('/api/staff/')&&req.method==='PATCH') {
    if(!manager(user)) return fail(res,403,'Недостаточно прав'); const id=idFrom(pathname,'/api/staff/'),d=await body(req);
    const target=db.prepare('SELECT * FROM users WHERE id=? AND organization_id=?').get(id,user.organization_id); if(!target)return fail(res,404,'Сотрудник не найден');
    db.prepare(`UPDATE users SET name=?,role=?,job_title=?,phone=?,status=? WHERE id=?`).run(
      String(d.name??target.name).slice(0,100), ['owner','manager','employee'].includes(d.role)?d.role:target.role,
      String(d.jobTitle??target.job_title).slice(0,100),String(d.phone??target.phone).slice(0,40),['active','inactive'].includes(d.status)?d.status:target.status,id);
    audit(user,'update','user',id); return json(res,200,{ok:true});
  }
  if(pathname==='/api/shifts'&&req.method==='GET') {
    const from=url.searchParams.get('from')||new Date(Date.now()-86400000).toISOString(), to=url.searchParams.get('to')||new Date(Date.now()+14*86400000).toISOString();
    const shifts=db.prepare(`SELECT s.*,u.name user_name,u.job_title FROM shifts s LEFT JOIN users u ON u.id=s.user_id
      WHERE s.organization_id=? AND s.starts_at<? AND s.ends_at>? ORDER BY s.starts_at`).all(user.organization_id,to,from);
    return json(res,200,{shifts});
  }
  if(pathname==='/api/shifts'&&req.method==='POST') {
    if(!manager(user))return fail(res,403,'Недостаточно прав'); const d=await body(req),start=validDate(d.startsAt),end=validDate(d.endsAt);
    if(new Date(end)<=new Date(start))return fail(res,422,'Окончание должно быть позже начала');
    const assigned=d.userId?db.prepare('SELECT id FROM users WHERE id=? AND organization_id=?').get(Number(d.userId),user.organization_id):null;
    if(d.userId&&!assigned)return fail(res,422,'Сотрудник не найден');
    const r=db.prepare(`INSERT INTO shifts(organization_id,user_id,title,starts_at,ends_at,location,notes,status,created_by) VALUES(?,?,?,?,?,?,?,?,?)`)
      .run(user.organization_id,d.userId||null,required(d.title,'Название',120),start,end,String(d.location||'').slice(0,120),String(d.notes||'').slice(0,1000),d.userId?'scheduled':'open',user.id);
    audit(user,'create','shift',r.lastInsertRowid); return json(res,201,{id:Number(r.lastInsertRowid)});
  }
  if(pathname.startsWith('/api/shifts/')&&req.method==='DELETE') {
    if(!manager(user))return fail(res,403,'Недостаточно прав'); const id=idFrom(pathname,'/api/shifts/');
    const r=db.prepare('DELETE FROM shifts WHERE id=? AND organization_id=?').run(id,user.organization_id); if(!r.changes)return fail(res,404,'Смена не найдена');
    audit(user,'delete','shift',id); return json(res,200,{ok:true});
  }
  if(pathname==='/api/requests'&&req.method==='GET') {
    const sql=`SELECT r.*,u.name user_name FROM requests r JOIN users u ON u.id=r.user_id
      WHERE r.organization_id=?${manager(user)?'':' AND r.user_id=?'} ORDER BY r.created_at DESC`;
    const rows=manager(user)?db.prepare(sql).all(user.organization_id):db.prepare(sql).all(user.organization_id,user.id);
    return json(res,200,{requests:rows});
  }
  if(pathname==='/api/requests'&&req.method==='POST') {
    const d=await body(req),type=['time_off','availability','swap'].includes(d.type)?d.type:'time_off';
    const r=db.prepare(`INSERT INTO requests(organization_id,user_id,type,starts_at,ends_at,reason) VALUES(?,?,?,?,?,?)`)
      .run(user.organization_id,user.id,type,validDate(d.startsAt),validDate(d.endsAt),String(d.reason||'').slice(0,500));
    audit(user,'create','request',r.lastInsertRowid); return json(res,201,{id:Number(r.lastInsertRowid)});
  }
  if(/^\/api\/requests\/\d+\/review$/.test(pathname)&&req.method==='PATCH') {
    if(!manager(user))return fail(res,403,'Недостаточно прав'); const id=Number(pathname.split('/')[3]),d=await body(req);
    if(!['approved','rejected'].includes(d.status))return fail(res,422,'Некорректный статус');
    const r=db.prepare(`UPDATE requests SET status=?,reviewed_by=? WHERE id=? AND organization_id=? AND status='pending'`).run(d.status,user.id,id,user.organization_id);
    if(!r.changes)return fail(res,404,'Активная заявка не найдена'); audit(user,'review','request',id,{status:d.status}); return json(res,200,{ok:true});
  }
  if(pathname==='/api/analytics'&&req.method==='GET') {
    const rows=db.prepare(`SELECT date(starts_at) day,COUNT(*) shifts,ROUND(SUM((julianday(ends_at)-julianday(starts_at))*24),1) hours,
      COUNT(DISTINCT user_id) people FROM shifts WHERE organization_id=? AND starts_at>=date('now','-13 day') AND status!='cancelled' GROUP BY date(starts_at) ORDER BY day`).all(user.organization_id);
    const roles=db.prepare(`SELECT COALESCE(NULLIF(job_title,''),'Без должности') role,COUNT(*) count FROM users WHERE organization_id=? AND status='active' GROUP BY job_title ORDER BY count DESC`).all(user.organization_id);
    return json(res,200,{days:rows,roles});
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
server.listen(port,host,()=>console.log(`ShiftFlow: http://${host}:${port}`));
export { server };

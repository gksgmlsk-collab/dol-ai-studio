import {cookieAttributes} from './cookies.mjs';
import {randomBytes,createHash} from 'node:crypto';
import {createGoogleVerifier,validClientId} from './google-token.mjs';

const challengeCookie='dol_teacher_challenge';
const random=()=>randomBytes(32).toString('base64url');
const hash=x=>createHash('sha256').update(x).digest('hex');
const error=(status,message)=>{throw Object.assign(new Error(message),{status,code:'google_'+status});};
const normalEmail=x=>typeof x==='string'?x.trim().toLowerCase():'';
const validEmail=x=>x.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);

export function createTeacherGoogle({db,one,all,run,tx,session,issueSession,checkPassword,rate,envClient=process.env.DOL_GOOGLE_CLIENT_ID,verifyToken=createGoogleVerifier()}){
  db.exec(`
    CREATE TABLE IF NOT EXISTS teacher_google(userId TEXT PRIMARY KEY REFERENCES users ON DELETE CASCADE,subject TEXT NOT NULL UNIQUE,email TEXT NOT NULL,linkedAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS teacher_google_invites(userId TEXT PRIMARY KEY REFERENCES users ON DELETE CASCADE,email TEXT NOT NULL UNIQUE,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS teacher_google_challenges(tokenHash TEXT PRIMARY KEY,nonce TEXT NOT NULL,clientId TEXT NOT NULL,userId TEXT REFERENCES users ON DELETE CASCADE,csrfHash TEXT NOT NULL,expires INTEGER NOT NULL);
  `);
  function config(){
    const id=(envClient||one("SELECT value FROM school_config WHERE key='google_client_id'")?.value||'').trim();
    return validClientId(id)?id:'';
  }
  function currentLink(id){return one('SELECT email FROM teacher_google WHERE userId=?',id)?.email||null;}
  function teacher(id){
    const t=one("SELECT id,name,role FROM users WHERE id=? AND role='teacher'",id||'');
    if(!t)error(404,'교사 계정을 찾을 수 없어요.');
    return t;
  }
  function adminInfo(){
    return {clientId:config(),managedByEnvironment:!!envClient,accounts:all("SELECT u.id,g.email AS linked,i.email AS invited,i.expires FROM users u LEFT JOIN teacher_google g ON g.userId=u.id LEFT JOIN teacher_google_invites i ON i.userId=u.id AND i.expires>? WHERE u.role='teacher'",Date.now())};
  }
  function manage(action,body){
    if(action==='config'){
      if(envClient)error(409,'서버 환경 변수에서 Google 웹 클라이언트 ID를 관리하고 있어요.');
      const id=typeof body.clientId==='string'?body.clientId.trim():null;
      if(id===null||id&&!validClientId(id))error(400,'Google 웹 애플리케이션의 공개 클라이언트 ID를 입력해 주세요.');
      tx(()=>{run("INSERT INTO school_config VALUES('google_client_id',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",id);run('DELETE FROM teacher_google_challenges');});
      return {enabled:!!id};
    }
    const t=teacher(body.teacherId);
    if(action==='invite'){
      const email=normalEmail(body.email);
      if(!validEmail(email))error(400,'초대할 교사의 Google 이메일 주소를 확인해 주세요.');
      if(currentLink(t.id))error(409,'이 교사는 이미 Google 계정을 연결했어요.');
      tx(()=>{
        run('DELETE FROM teacher_google_invites WHERE expires<=?',Date.now());
        if(one('SELECT 1 FROM teacher_google_invites WHERE email=? AND userId<>?',email,t.id)||one('SELECT 1 FROM teacher_google WHERE email=?',email))
          error(409,'이 이메일은 다른 교사 계정이 사용하고 있어요.');
        run('INSERT INTO teacher_google_invites VALUES(?,?,?) ON CONFLICT(userId) DO UPDATE SET email=excluded.email,expires=excluded.expires',t.id,email,Date.now()+7*86400000);
      });
      return {ok:true};
    }
    if(action==='revoke'){
      tx(()=>{run('DELETE FROM teacher_google_invites WHERE userId=?',t.id);run('DELETE FROM teacher_google WHERE userId=?',t.id);
        run('DELETE FROM teacher_google_challenges WHERE userId=?',t.id);run('DELETE FROM sessions WHERE userId=?',t.id);});
      return {ok:true};
    }
    error(404,'Google 계정 관리 기능을 찾을 수 없어요.');
  }
  function setChallenge(req,res,value,seconds){
    res.appendHeader('Set-Cookie',challengeCookie+'='+value+cookieAttributes(req,seconds,'/api/school/google'));
  }
  function eligible(req,url){
    if(req.headers.origin!==url.origin)error(403,'현재 작업실 주소에서 Google 로그인을 열어 주세요.');
    if(url.protocol!=='https:'&&!(url.protocol==='http:'&&url.hostname==='localhost'))error(400,'같은 포트의 localhost 주소나 등록한 HTTPS 주소에서 Google 로그인을 이용해 주세요.');
    const clientId=config();if(!clientId)error(503,'운영자가 Google 웹 클라이언트 ID를 설정하면 사용할 수 있어요.');
    return clientId;
  }
  function start(req,res,url,u,body){
    const clientId=eligible(req,url);
    rate('google-start:'+req.socket.remoteAddress,40,10*60000);
    if(!['login','link'].includes(body.mode))error(400,'Google 로그인 과정을 다시 시작해 주세요.');
    if(body.mode==='link'){
      if(u?.role!=='teacher')error(403,'먼저 기존 교사 계정으로 로그인해 주세요.');
      rate('google-password:'+u.id,8,10*60000);
      if(!checkPassword(u.id,body.password))error(403,'현재 교사 비밀번호를 확인해 주세요.');
      if(currentLink(u.id))error(409,'이미 Google 계정이 연결되어 있어요.');
    }else if(u)error(409,'다른 계정으로 로그인하려면 현재 수업 계정에서 먼저 로그아웃해 주세요.');
    const cookie=random(),nonce=random(),csrf=random();
    tx(()=>{run('DELETE FROM teacher_google_challenges WHERE expires<=?',Date.now());
      run('INSERT INTO teacher_google_challenges VALUES(?,?,?,?,?,?)',hash(cookie),nonce,clientId,u?.id||null,hash(csrf),Date.now()+5*60000);});
    setChallenge(req,res,cookie,300);return {clientId,nonce,csrf};
  }
  function matchAccount(claims,userId){
    const existing=one('SELECT userId FROM teacher_google WHERE subject=?',claims.subject);
    if(existing){
      if(userId&&existing.userId!==userId)error(409,'이 Google 계정은 이미 다른 교사와 연결되어 있어요.');
      run('UPDATE teacher_google SET email=? WHERE subject=?',claims.email,claims.subject);
      return teacher(existing.userId);
    }
    const invite=one('SELECT * FROM teacher_google_invites WHERE email=? AND expires>?',claims.email,Date.now());
    if(userId&&invite&&invite.userId!==userId)error(403,'다른 교사에게 초대된 Google 계정이에요.');
    const id=userId||(claims.authoritative&&invite?.userId);
    if(!id)error(403,'해당 교사의 초대가 필요해요. 기존 교사 계정이 있으면 비밀번호로 로그인한 뒤 Google 계정을 연결해 주세요.');
    if(currentLink(id))error(409,'이 교사 계정은 이미 Google 계정과 연결되어 있어요.');
    const t=teacher(id);run('INSERT INTO teacher_google VALUES(?,?,?,?)',id,claims.subject,claims.email,new Date().toISOString());
    run('DELETE FROM teacher_google_invites WHERE userId=?',id);return t;
  }
  async function finish(req,res,url,u,body){
    const clientId=eligible(req,url);
    rate('google-finish:'+req.socket.remoteAddress,50,10*60000);
    const cookie=String(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(challengeCookie+'='))?.slice(challengeCookie.length+1);
    const c=cookie&&one('SELECT * FROM teacher_google_challenges WHERE tokenHash=? AND expires>?',hash(cookie),Date.now());
    if(!c||typeof body.csrf!=='string'||body.csrf.length>80||hash(body.csrf)!==c.csrfHash||c.clientId!==clientId||c.userId!==(u?.id||null))
      error(403,'로그인 요청이 만료되었어요. 새로 시작해 주세요.');
    run('DELETE FROM teacher_google_challenges WHERE tokenHash=?',c.tokenHash);
    const claims=await verifyToken(body.credential,clientId,c.nonce);
    if(config()!==clientId||(session(req)?.id||null)!==c.userId||c.expires<=Date.now())error(409,'로그인 설정이나 세션이 바뀌었어요. 다시 시작해 주세요.');
    const user=tx(()=>{const account=matchAccount(claims,c.userId);issueSession(req,res,account);return account;});
    setChallenge(req,res,'',0);return {user};
  }
  return {enabled:()=>!!config(),currentLink,adminInfo,manage,start,finish};
}

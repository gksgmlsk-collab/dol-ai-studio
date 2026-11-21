import {cookieAttributes} from './cookies.mjs';
import {handleSwitchSource} from './switch-source.mjs';
import * as sqlite from 'node:sqlite';
import {randomBytes,randomUUID,createHash,scryptSync,timingSafeEqual} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {suggestObservation} from './school-observer.mjs';
import {createTeacherGoogle} from './school-google.mjs';
import {createClassLive} from './school-live.mjs';
import {join} from 'node:path';
import {galleryKinds,classifyGalleryAssets,filterGallery,publicCityUrl} from '../dist/gallery-types.mjs';

const uid=randomUUID, now=()=>new Date().toISOString(), json=JSON.stringify;
const tools=['dialogue','image','video','web','3d','robot','city'];
const axes=['문제 파악과 개념 적용','계획·순서·조건 설정','대안 생성과 확장','근거를 들어 비교·선택','시험·점검·수정'];
const feedbackKinds=['궁금해요','이런 방법은 어때요?','이 부분이 도움이 됐어요','선생님의 질문'];
const answers=['반영했어요','일부 반영했어요','다른 방법을 선택했어요'];
const fail=(status,message)=>{throw Object.assign(Error(message),{status,code:'school_'+status})};
const text=(v,n=2400)=>typeof v==='string'?v.trim().slice(0,n):'';
function required(v,n=2400){const s=text(v,n);if(!s)fail(400,'필수 내용을 입력해 주세요.');return s;}
function choice(v,values){if(!values.includes(v))fail(400,'목록에서 사용할 값을 골라 주세요.');return v;}
const list=v=>Array.isArray(v)?v:[];
const parse=(v,fallback=null)=>v?JSON.parse(v):fallback;
const nonce=n=>randomBytes(n).toString('base64url');
const digest=v=>createHash('sha256').update(v).digest('hex');
function secretHash(value,salt=nonce(16)){return salt+':'+scryptSync(value,salt,32).toString('hex');}
function matches(value,encoded){const [salt,expected]=encoded.split(':');return timingSafeEqual(Buffer.from(expected,'hex'),scryptSync(value,salt,32));}
const cleanDraft=d=>Object.fromEntries(['goal','resources','plan','alternatives','reason','prediction','actual','cause','change','retest','next'].map(key=>[key,text(d?.[key],4500)]));
const cleanSettings=s=>({goal:text(s?.goal),resources:text(s?.resources,5000),checkpoint:text(s?.checkpoint,400),help:['질문 중심','힌트와 예시','제작 지원'].includes(s?.help)?s.help:'질문 중심',tools:Array.isArray(s?.tools)?[...new Set(s.tools.filter(t=>tools.includes(t)))]:[...tools],quota:Number.isInteger(s?.quota)?Math.max(0,Math.min(200,s.quota)):12,criteria:text(s?.criteria,2200)});
const assetColumns='id,projectId,authorId,kind,title,description,filename,mime,length(bytes) AS size,createdAt';
function assetInput(input){
  const kind=choice(input.kind,['image','video','web','3d','robot','dialogue','audio','file','note','storyboard','city']);
  const payload=text(input.data,24e6);
  if(payload && (!/^[\w+/=]+$/.test(payload)||payload.length>22369624))fail(413,'파일은 16MB 이하로 등록해 주세요.');
  const bytes=Buffer.from(payload,'base64'),mime=text(input.mime,100).split(';')[0].toLowerCase()||'application/octet-stream';
  if(bytes.length>16*1024*1024)fail(413,'파일은 16MB 이하로 등록해 주세요.');
  const ascii=(a,b)=>bytes.subarray(a,b).toString('ascii'),hex=(a,b)=>bytes.subarray(a,b).toString('hex');
  const signatures={
    'image/png':hex(0,8)==='89504e470d0a1a0a','image/jpeg':hex(0,3)==='ffd8ff','image/webp':ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP',
    'video/mp4':ascii(4,8)==='ftyp','video/webm':hex(0,4)==='1a45dfa3','audio/webm':hex(0,4)==='1a45dfa3','audio/ogg':ascii(0,4)==='OggS','audio/wav':ascii(0,4)==='RIFF'&&ascii(8,12)==='WAVE','audio/mpeg':ascii(0,3)==='ID3'||bytes[0]===255&&((bytes[1]||0)&224)===224
  };
  if(bytes.length && /^(image|video|audio)\//.test(mime)&&!signatures[mime])fail(415,'읽을 수 있는 PNG, JPEG, WebP, MP4, WebM 또는 녹음 파일을 골라 주세요.');
  if(!bytes.length&&!text(input.description,24000))fail(400,'파일이나 작품 설명을 추가해 주세요.');
  return {kind,title:required(input.title,120),description:text(input.description,24000),filename:text(input.filename,160).replace(/[\\/\r\n"]/g,'_'),mime:signatures[mime]?mime:'application/octet-stream',bytes};
}
function exhibitCityUrl(asset){
  if(asset.kind!=='city')return '';
  const line=String(asset.description||'').split(/\r?\n/).findLast(value=>value.startsWith('작품 주소 · '));
  return publicCityUrl(line?.slice('작품 주소 · '.length));
}
function publicAsset(row){
  if(!row)return null;
  let bytes=row.bytes;
  if(row.kind==='robot' && row.mime==='application/octet-stream'){
    let content;try{content=JSON.parse(Buffer.from(row.bytes).toString('utf8'));}catch{}
    if(content?.format==='dol-device-independent-plan'){
      const allowed=['when','action','seconds','length_mm','switch_distance_mm','tolerance_mm','hold_seconds'];
      const steps=list(content.steps).slice(0,30).map(step=>Object.fromEntries(allowed.filter(k=>typeof step?.[k]==='number'||typeof step?.[k]==='string').map(k=>[k,typeof step[k]==='string'?text(step[k],60):step[k]])));
      bytes=Buffer.from(json({format:content.format,schema:1,execution:'simulation',timeBasis:'elapsed-seconds-after-start',start:content.start==='sensor'?'sensor':'button',steps,cancel:'cancel_and_return_to_rest'}));
    }
  }
  const ext=text(row.filename,160).split('.').at(-1);
  return {...row,bytes,filename:'작품'+(/^[a-zA-Z0-9]{1,8}$/.test(ext)?'.'+ext:'')};
}
async function readJson(req,max=100000){
  if(req.headers['content-type']?.split(';')[0]!=='application/json')fail(415,'JSON 형식이 필요해요.');
  if(Number(req.headers['content-length'])>max)fail(413,'한 번에 보내는 자료가 너무 커요.');
  const chunks=[];let size=0;
  for await(const part of req){size+=part.length;if(size>max)fail(413,'한 번에 보내는 자료가 너무 커요.');chunks.push(part);}
  try{const data=JSON.parse(Buffer.concat(chunks));if(data&&typeof data==='object'&&!Array.isArray(data))return data;}catch{}
  fail(400,'요청을 다시 확인해 주세요.');
}
function reply(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(json(value));}
function deliver(req,res,row){
  const data=Buffer.from(row.bytes),total=data.length, playable=/^(image|video|audio)\//.test(row.mime);
  const headers={'Content-Type':row.mime,'X-Content-Type-Options':'nosniff','Cache-Control':'private,no-store','Accept-Ranges':'bytes','Content-Security-Policy':"default-src 'none'; sandbox",'Content-Disposition':(playable?'inline':'attachment')+"; filename*=UTF-8''"+encodeURIComponent(row.filename||row.title||'작품')};
  let start=0,end=total-1,status=200;
  if(req.headers.range){const m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);if(!m||(!m[1]&&!m[2]))fail(416,'범위가 올바르지 않아요.');start=m[1]?Number(m[1]):Math.max(0,total-Number(m[2]));end=m[1]&&m[2]?Math.min(total-1,Number(m[2])):total-1;if(start>end||start>=total)fail(416,'범위가 올바르지 않아요.');status=206;headers['Content-Range']='bytes '+start+'-'+end+'/'+total;}
  headers['Content-Length']=Math.max(0,end-start+1);res.writeHead(status,headers);res.end(req.method==='HEAD'?undefined:data.subarray(start,end+1));
}

export function createSchool({dataDir=process.env.DOL_SCHOOL_DIR||join(process.env.LOCALAPPDATA||homedir(),'DOL-AI-Studio','school'),bootstrapSecret=process.env.DOL_TEACHER_SECRET,operatorSecret=process.env.DOL_OPERATOR_SECRET,googleVerifier,googleClientId}={}){
  mkdirSync(dataDir,{recursive:true,mode:0o700});
  const db=new (sqlite.Database||sqlite.DatabaseSync)(join(dataDir,'classroom.sqlite'),{timeout:3000});
  db.exec(readFileSync(new URL('./school-schema.sql',import.meta.url),'utf8'));
  const run=(sql,...args)=>db.prepare(sql).run(...args),one=(sql,...args)=>db.prepare(sql).get(...args),all=(sql,...args)=>db.prepare(sql).all(...args);
  function tx(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
  if(!one("SELECT id FROM users WHERE role='teacher'")){
    if(bootstrapSecret && bootstrapSecret.length<12)throw Error('DOL_TEACHER_SECRET must have at least 12 characters.');
    const secret=bootstrapSecret||nonce(24);
    if(!bootstrapSecret)writeFileSync(join(dataDir,'first-teacher.txt'),'교사 아이디: teacher\n초기 비밀번호: '+secret+'\n',{flag:'wx',mode:0o600});
    run('INSERT INTO users VALUES (?,?,?,?,?,?)',uid(),'teacher','담당 교사','teacher',secretHash(secret),now());
  }
  if(!one("SELECT id FROM users WHERE role='operator'")){
    if(operatorSecret && operatorSecret.length<12)throw Error('DOL_OPERATOR_SECRET must have at least 12 characters.');
    const value=operatorSecret||nonce(24);
    if(!operatorSecret)writeFileSync(join(dataDir,'first-operator.txt'),'운영 아이디: operator\n초기 비밀번호: '+value+'\n',{flag:'wx',mode:0o600});
    run('INSERT INTO users VALUES(?,?,?,?,?,?)',uid(),'operator','로컬 운영자','operator',secretHash(value),now());
  }
  const enabledTools=()=>parse(one("SELECT value FROM school_config WHERE key='tools'")?.value,[...tools]);
  const dummyHash=secretHash(nonce(16)),limits=new Map(),cookieName='dol_class_session';
  const tokenOf=req=>String(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
  function session(req){const token=tokenOf(req);return token?one('SELECT u.id,u.name,u.role FROM sessions s JOIN users u ON u.id=s.userId WHERE s.token=? AND s.expires>?',digest(token),Date.now())||null:null;}
  function rate(key,limit,span){const t=Date.now();if(limits.size>3000)for(const [k,v] of limits)if(v.end<=t)limits.delete(k);const old=limits.get(key)||{count:0,end:0};if(old.end<=t){old.count=0;old.end=t+span;}old.count++;limits.set(key,old);if(old.count>limit)fail(429,'요청이 많아요. 잠시 후 다시 시도해 주세요.');}
  function issueSession(req,res,account){
    const raw=nonce(32);
    run('DELETE FROM sessions WHERE expires<=? OR token=?',Date.now(),digest(tokenOf(req)));
    run('INSERT INTO sessions VALUES(?,?,?)',digest(raw),account.id,Date.now()+8*3600000);
    res.setHeader('Set-Cookie',cookieName+'='+raw+cookieAttributes(req,28800));
  }
  const google=createTeacherGoogle({db,one,all,run,tx,session,issueSession,rate,verifyToken:googleVerifier,envClient:googleClientId,
    checkPassword:(id,password)=>matches(text(password,256),one('SELECT hash FROM users WHERE id=?',id).hash)});
  function classFor(user,id,teacherOnly=false){
    const c=one('SELECT * FROM classes WHERE id=?',id);
    if(!c||!(c.teacherId===user.id||!teacherOnly&&one('SELECT 1 FROM members WHERE classId=? AND userId=?',id,user.id)))fail(404,'학급을 열 수 없어요.');
    return c;
  }
  const groupMember=(u,team)=>!!one('SELECT 1 FROM team_members WHERE teamId=? AND userId=?',team,u.id);
  function projectFor(user,id){
    const p=one('SELECT p.*,c.teacherId FROM projects p JOIN classes c ON c.id=p.classId WHERE p.id=?',id);
    if(!p || !(p.teacherId===user.id || one('SELECT 1 FROM members WHERE classId=? AND userId=?',p.classId,user.id)&&(p.teamId?groupMember(user,p.teamId):p.ownerId===user.id)))fail(404,'이 프로젝트를 열 수 없어요.');
    return p;
  }
  const live=createClassLive({db,one,all,run,tx,classFor,projectFor});
  function teacherOf(u,p){if(u.id!==p.teacherId)fail(403,'담당 교사만 사용할 수 있어요.');}
  function allowed(u,classId,teamId,assignmentId){
    const c=classFor(u,classId);
    if(teamId){const g=one('SELECT * FROM teams WHERE id=? AND classId=?',teamId,classId);if(!g || (u.id!==c.teacherId&&!groupMember(u,teamId)))fail(404,'이 모둠을 찾을 수 없어요.');}
    if(assignmentId&&!one('SELECT 1 FROM assignments WHERE id=? AND classId=?',assignmentId,classId))fail(404,'이 과제를 찾을 수 없어요.');
  }
  function versionOf(p,id){const v=one('SELECT * FROM versions WHERE id=? AND projectId=?',id,p.id);if(!v)fail(404,'버전을 찾을 수 없어요.');return {...v,snapshot:parse(v.snapshot)};}
  function recordOf(u,p,id){const r=one('SELECT * FROM records WHERE id=? AND projectId=?',id,p.id);if(!r || (r.personal&&![p.teacherId,r.authorId].includes(u.id)))fail(404,'기록을 찾을 수 없어요.');return r;}
  function projectList(u){return all('SELECT DISTINCT p.id,p.title,p.classId,p.teamId,p.assignmentId,p.ownerId,p.revision,p.updatedAt FROM projects p JOIN classes c ON c.id=p.classId WHERE c.teacherId=? OR (EXISTS(SELECT 1 FROM members m WHERE m.classId=p.classId AND m.userId=?) AND ((p.teamId IS NULL AND p.ownerId=?) OR EXISTS(SELECT 1 FROM team_members tm WHERE tm.teamId=p.teamId AND tm.userId=?))) ORDER BY p.updatedAt DESC',u.id,u.id,u.id,u.id);}
  function state(u){if(!u)return {user:null,classes:[],projects:[],assignments:[],teams:[]};const classes=all('SELECT c.id,c.name,c.code FROM classes c WHERE c.teacherId=? OR EXISTS(SELECT 1 FROM members m WHERE m.classId=c.id AND m.userId=?)',u.id,u.id);
    return {user:u,supportedTools:enabledTools(),classes,projects:projectList(u),assignments:classes.flatMap(c=>all('SELECT * FROM assignments WHERE classId=? ORDER BY createdAt DESC',c.id).map(a=>({...a,settings:parse(a.settings)}))),teams:classes.flatMap(c=>all('SELECT t.* FROM teams t WHERE t.classId=? AND (? OR EXISTS(SELECT 1 FROM team_members m WHERE m.teamId=t.id AND m.userId=?))',c.id,u.role==='teacher'?1:0,u.id))};
  }
  function projectDetail(u,p){
    const versions=all('SELECT * FROM versions WHERE projectId=? ORDER BY n DESC',p.id).map(v=>({...v,snapshot:parse(v.snapshot)}));
    const records=all('SELECT r.*,u.name AS author,u.role AS authorRole FROM records r JOIN users u ON u.id=r.authorId WHERE r.projectId=? AND (r.personal=0 OR r.authorId=? OR ?) ORDER BY r.createdAt DESC',p.id,u.id,u.id===p.teacherId?1:0);
    const allowedRecords=new Set(records.map(r=>r.id));
    const comments=all('SELECT f.*,u.name AS author,u.role AS authorRole FROM feedback f JOIN users u ON u.id=f.authorId WHERE f.projectId=? ORDER BY f.createdAt DESC',p.id).filter(f=>!f.recordId||allowedRecords.has(f.recordId)).map(f=>({...f,responses:all('SELECT r.*,u.name AS author FROM responses r JOIN users u ON u.id=r.authorId WHERE feedbackId=? ORDER BY createdAt',f.id)}));
    return {...p,draft:parse(p.draft),origin:parse(p.origin),versions,records,feedback:comments,assets:all('SELECT '+assetColumns+' FROM assets WHERE projectId=? ORDER BY createdAt DESC',p.id),exhibits:all('SELECT id,versionId,status,title FROM exhibits WHERE projectId=? ORDER BY createdAt DESC',p.id),observations:u.id===p.teacherId?all('SELECT o.*,EXISTS(SELECT 1 FROM observation_support x WHERE x.observationId=o.id) AS support,d.id AS draftId,d.note AS proposal,d.quote,d.model,d.promptVersion FROM observations o LEFT JOIN observation_sources s ON s.observationId=o.id LEFT JOIN observation_drafts d ON d.id=s.draftId WHERE o.projectId=? ORDER BY o.createdAt DESC',p.id):[]};
  }
  function createProject(u,b,origin=null,draft={}){
    const id=uid(),time=now(),cl=required(b.classId,80),team=text(b.teamId,80)||null,task=text(b.assignmentId,80)||null;
    allowed(u,cl,team,task);run('INSERT INTO projects VALUES(?,?,?,?,?,?,?,?,?,?,?)',id,cl,u.id,team,task,required(b.title,120),json(cleanDraft(draft)),0,origin?json(origin):null,time,time);return {id};
  }
  function makeVersion(u,p,b,prior){
    if(b.revision!==p.revision)fail(409,'다른 창에서 프로젝트가 바뀌었어요. 최신 버전을 확인해 주세요.');
    const n=1+one('SELECT coalesce(max(n),0) AS n FROM versions WHERE projectId=?',p.id).n,id=uid();
    const available=all('SELECT id FROM assets WHERE projectId=? ORDER BY createdAt',p.id).map(x=>x.id);
    const chosen=b.assetIds===undefined?available:[...new Set(list(b.assetIds))];
    if(chosen.some(id=>!available.includes(id)))fail(400,'프로젝트 안의 작품만 버전에 담을 수 있어요.');
    const data=prior?prior.snapshot:{title:p.title,draft:parse(p.draft),assetIds:chosen,recordIds:all('SELECT id FROM records WHERE projectId=? AND personal=0 ORDER BY createdAt',p.id).map(x=>x.id)};
    return tx(()=>{run('INSERT INTO versions VALUES(?,?,?,?,?,?,?,?)',id,p.id,n,u.id,json(data),text(b.reason,1500),prior?.id||null,now());run('UPDATE projects SET revision=revision+1,title=?,draft=?,updatedAt=? WHERE id=?',data.title,json(data.draft),now(),p.id);return {id,n,revision:p.revision+1};});
  }
  function exhibitFor(u,id,approved=true){
    const e=one('SELECT e.*,p.classId,c.teacherId FROM exhibits e JOIN projects p ON p.id=e.projectId JOIN classes c ON c.id=p.classId WHERE e.id=?',id);
    if(!e || (approved&&e.status!=='approved'))fail(404,'전시 작품을 열 수 없어요.');classFor(u,e.classId);return {...e,assets:parse(e.assets,[])};
  }
  function exhibitView(u,e){
    const selected=e.assets.map(id=>one('SELECT id,kind,title,mime,filename,description,length(bytes) AS size FROM assets WHERE id=? AND projectId=?',id,e.projectId)).filter(Boolean);
    return {id:e.id,classId:e.classId,versionId:e.versionId,title:e.title,description:e.description,stage:e.stage,displayName:e.displayName,remix:!!e.remix,createdAt:e.createdAt,
      number:one('SELECT n FROM versions WHERE id=?',e.versionId).n,
      types:classifyGalleryAssets(selected),
      assets:selected.map(a=>({id:a.id,kind:a.kind,title:a.title,mime:a.mime,size:a.size,description:!a.size&&a.kind!=='city'?a.description:'',publicUrl:exhibitCityUrl(a)||undefined,previewable:!!({web:/\.html?$/i,'3d':/\.stl$/i,robot:/\.json$/i}[a.kind]?.test(a.filename)&&!/\.dol(?:-(?:web|3d|robot|storyboard))?\.json$/i.test(a.filename))})),
      comments:all('SELECT id,kind,body,createdAt FROM feedback WHERE exhibitId=? AND published=1 ORDER BY createdAt',e.id)};
  }

  function authorizeGeneration(req,projectId,tool,versionId){
    choice(tool,tools);
    if(!enabledTools().includes(tool))fail(403,'운영자가 현재 중지한 도구예요.');
    const u=session(req);
    if(!u){if(projectId)fail(401,'수업 계정으로 로그인해 주세요.');return {guest:true,tools:[...tools]};}
    if(!projectId)fail(403,'수업에서 사용할 프로젝트를 먼저 열어 주세요.');
    const p=projectFor(u,projectId),assignment=p.assignmentId?one('SELECT * FROM assignments WHERE id=?',p.assignmentId):null;
    const s=assignment?parse(assignment.settings):cleanSettings({});
    if(!s.tools.includes(tool))fail(403,'이 과제에서 선생님이 허용한 도구를 골라 주세요.');
    const v=versionId?versionOf(p,versionId):null;
    return {...s,guest:false,userId:u.id,projectId:p.id,assignmentId:p.assignmentId,projectTitle:p.title,plan:parse(p.draft),selectedVersion:v?{n:v.n,reason:v.reason,plan:v.snapshot.draft}:null};
  }
  function reserveGeneration(req,projectId,tool){
    const s=authorizeGeneration(req,projectId,tool);if(s.guest)return null;
    return tx(()=>{const used=one("SELECT count(*) AS n FROM job_claims j JOIN projects p ON p.id=j.projectId WHERE j.userId=? AND p.classId=(SELECT classId FROM projects WHERE id=?) AND coalesce(p.assignmentId,'')=coalesce(?,'') AND j.status!='rejected' AND substr(j.createdAt,1,10)=?",s.userId,s.projectId,s.assignmentId,now().slice(0,10)).n;
      if(used>=s.quota)fail(429,'오늘 이 과제에서 사용할 생성 횟수를 모두 사용했어요.');
      const id=uid();run('INSERT INTO job_claims VALUES(?,?,?,?,?,?,?)',id,s.userId,s.projectId,tool,null,'reserved',now());return id;});
  }
  function authorizeJob(req,id,{write=false}={}){
    const j=one('SELECT * FROM job_claims WHERE jobId=?',id);if(!j)return null;
    const u=session(req);if(!u)fail(401,'로그인해 주세요.');const p=projectFor(u,j.projectId);
    if(u.id!==j.userId && (write||p.teacherId!==u.id))fail(404,'작업을 찾을 수 없어요.');return true;
  }
  function exportData(u,classId,b){
    classFor(u,classId,true);
    if(b.approved!==true)fail(400,'내보낼 프로젝트와 범위를 확인해 주세요.');
    const ids=[...new Set(list(b.projectIds))];if(!ids.length||ids.length>100)fail(400,'내보낼 프로젝트를 골라 주세요.');
    const names=new Map();function anon(type,id){if(!id)return null;const key=type+'-'+id;if(!names.has(key))names.set(key,type+'-'+(names.size+1));return names.get(key);}
    const data=ids.map(id=>{const p=projectFor(u,id);if(p.classId!==classId)fail(403,'선택한 학급의 프로젝트만 내보낼 수 있어요.');const d=projectDetail(u,p);
      return {id:anon('P',p.id),scope:p.teamId?'group':'individual',group:anon('G',p.teamId),assignment:anon('L',p.assignmentId),owner:anon('U',p.ownerId),title:p.title,plan:d.draft,
        versions:d.versions.map(v=>({id:anon('V',v.id),n:v.n,author:anon('U',v.authorId),time:v.createdAt,plan:v.snapshot.draft,reason:v.reason,restoredFrom:anon('V',v.restoredFrom),assets:v.snapshot.assetIds.map(i=>anon('A',i)),records:v.snapshot.recordIds.map(i=>anon('R',i))})),
        records:d.records.filter(r=>!r.personal||b.includePersonal===true).map(r=>({id:anon('R',r.id),author:anon('U',r.authorId),role:r.authorRole,kind:r.kind,source:r.source,personal:!!r.personal,body:r.body,time:r.createdAt})),
        assets:d.assets.map(a=>({id:anon('A',a.id),kind:a.kind,title:a.title,description:b.includeAssets?a.description:undefined,author:anon('U',a.authorId),time:a.createdAt})),
        feedback:d.feedback.filter(f=>!f.recordId||b.includePersonal||!d.records.find(r=>r.id===f.recordId)?.personal).map(f=>({id:anon('F',f.id),version:anon('V',f.versionId),record:anon('R',f.recordId),author:anon('U',f.authorId),role:f.authorRole,body:f.body,time:f.createdAt,responses:f.responses.map(r=>({status:r.status,reason:r.reason,author:anon('U',r.authorId),time:r.createdAt}))})),
        observations:b.includeObservations?d.observations.filter(o=>!o.recordId||b.includePersonal||!d.records.find(r=>r.id===o.recordId)?.personal).map(o=>({axis:o.axis,note:o.note,question:o.nextQuestion,state:o.state,version:anon('V',o.versionId),record:anon('R',o.recordId),support:!!o.support,time:o.createdAt,source:o.model?'교사가 검토한 로컬 AI 초안':'교사 직접 관찰',analysisModel:o.model||null,analysisPromptVersion:o.promptVersion||null,initialDraft:o.proposal||undefined,evidenceQuote:o.quote||undefined})):[]};
    });return {schema:'dol-research-v1',exportedAt:now(),analysisModels:[...new Set(data.flatMap(p=>p.observations.map(o=>o.analysisModel)).filter(Boolean))],analysisPromptVersions:[...new Set(data.flatMap(p=>p.observations.map(o=>o.analysisPromptVersion)).filter(Boolean))],projects:data};
  }
  async function handle(req,res,url){
    if(!url.pathname.startsWith('/api/school/'))return false;
    try{
      const method=req.method,route=url.pathname.slice('/api/school/'.length).split('/').filter(Boolean),[base,id,part,sub]=route;
      const host=req.headers.host,origin=req.headers.origin;
      if((origin && origin!=='http://'+host && origin!=='https://'+host)||req.headers['sec-fetch-site']==='cross-site')fail(403,'같은 작업실 화면에서 이용해 주세요.');
      const u=session(req),send=(value,status=200)=>{reply(res,status,value);return true;};
      if(method==='GET'&&base==='me')return send({...state(u),google:{enabled:google.enabled(),linkedEmail:u?.role==='teacher'?google.currentLink(u.id):undefined}});
      if(method==='GET'&&base==='google'&&id==='current'&&!part)return send({user:u,google:{enabled:google.enabled(),linkedEmail:u?.role==='teacher'?google.currentLink(u.id):undefined}});
      if(method==='POST'&&base==='google'&&!part){
        const body=await readJson(req,20000);
        if(id==='start')return send(google.start(req,res,url,u,body));
        if(id==='finish')return send(await google.finish(req,res,url,u,body));
        fail(404,'Google 로그인 기능을 찾을 수 없어요.');
      }
      if(method==='POST'&&base==='login'){
        const ip=req.socket.remoteAddress||'';rate('login:'+ip,45,15*60000);
        const b=await readJson(req),login=text(b.login,64).toLowerCase();rate('identity:'+ip+':'+login,12,10*60000);
        const account=one('SELECT * FROM users WHERE login=?',login);
        const valid=matches(text(b.secret,256),account?.hash||dummyHash);
        const classroom=account?.role==='student'?one('SELECT 1 FROM members m JOIN classes c ON c.id=m.classId WHERE m.userId=? AND c.code=?',account.id,text(b.classCode,32).toUpperCase()):true;
        if(!account||!valid||!classroom)fail(401,'참여 정보 또는 비밀번호를 다시 확인해 주세요.');
        tx(()=>issueSession(req,res,account));
        return send({user:{id:account.id,name:account.name,role:account.role}});
      }
      if(method==='POST'&&base==='logout'){run('DELETE FROM sessions WHERE token=?',digest(tokenOf(req)));res.setHeader('Set-Cookie',cookieName+'='+cookieAttributes(req,0));return send({ok:true});}
      if(!u)fail(401,'수업에 참여한 뒤 열 수 있어요.');
      if(!['GET','HEAD'].includes(method))rate('write:'+u.id,320,60000);
      if(base==='presence'&&!id&&method==='POST'){
        const b=await readJson(req,2048),current=session(req);
        if(!current||current.id!==u.id)fail(401,'다시 로그인해 주세요.');
        return send(live.pulse(current,digest(tokenOf(req)),b));
      }
      if(base==='classes'&&id&&part==='live'&&!sub&&method==='GET')return send(live.snapshot(u,id));
      if(base==='switch-source'&&id&&!sub&&(!part||part==='default-file')){classFor(u,id,method==='PUT'||part==='default-file');await handleSwitchSource(req,res,id,db,part);return true;}
      if(base==='account'&&id==='password'&&method==='POST'){
        const b=await readJson(req),old=one('SELECT hash FROM users WHERE id=?',u.id);
        rate('change:'+u.id,8,10*60000);if(!matches(text(b.current,256),old.hash))fail(403,'현재 비밀번호를 확인해 주세요.');
        if(typeof b.next!=='string'||b.next.length<(u.role==='student'?8:12)||b.next.length>128)fail(400,'새 비밀번호의 길이를 확인해 주세요.');
        tx(()=>{run('UPDATE users SET hash=? WHERE id=?',secretHash(b.next),u.id);run('DELETE FROM sessions WHERE userId=?',u.id);});
        res.setHeader('Set-Cookie',cookieName+'='+cookieAttributes(req,0));return send({ok:true});
      }
      if(base==='ops'){
        if(u.role!=='operator')fail(403,'운영 계정으로 로그인해 주세요.');
        if(method==='GET'&&!id)return send({google:google.adminInfo(),teachers:all("SELECT id,name,login FROM users WHERE role='teacher' ORDER BY createdAt"),
          counts:{classes:one('SELECT count(*) AS n FROM classes').n,students:one("SELECT count(*) AS n FROM users WHERE role='student'").n,projects:one('SELECT count(*) AS n FROM projects').n},
          storageBytes:one('SELECT coalesce(sum(length(bytes)),0) AS n FROM assets').n,dbBytes:one('PRAGMA page_count').page_count*one('PRAGMA page_size').page_size,tools:enabledTools(),jobs:all('SELECT status,count(*) AS count FROM job_claims GROUP BY status')});
        const b=await readJson(req);
        if(method==='POST'&&id==='google'&&['config','invite','revoke'].includes(part))return send(google.manage(part,b));
        if(method==='POST'&&id==='teachers'&&!part){const teacher=uid(),name=required(b.name,60),login='t'+randomBytes(4).toString('hex'),secret=nonce(18);
          run('INSERT INTO users VALUES(?,?,?,?,?,?)',teacher,'teacher',name,login,secretHash(secret),now());return send({id:teacher,name,login,secret},201);}
        if(method==='POST'&&id==='reset'){const teacher=one("SELECT * FROM users WHERE id=? AND role='teacher'",b.teacherId);if(!teacher)fail(404,'교사 계정을 찾을 수 없어요.');
          const secret=nonce(18);tx(()=>{run('UPDATE users SET hash=? WHERE id=?',secretHash(secret),teacher.id);run('DELETE FROM sessions WHERE userId=?',teacher.id);});return send({id:teacher.id,name:teacher.name,login:teacher.login,secret});}
        if(method==='POST'&&id==='tools'){if(!Array.isArray(b.tools)||b.tools.some(t=>!tools.includes(t)))fail(400,'지원 도구를 선택해 주세요.');const allowed=[...new Set(b.tools)];run("INSERT INTO school_config VALUES('tools',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",json(allowed));return send({tools:allowed});}
        fail(404,'운영 기능을 찾을 수 없어요.');
      }
      if(base==='classes'){
        if(method==='POST'&&!id){if(u.role!=='teacher')fail(403,'교사가 학급을 만들 수 있어요.');const b=await readJson(req),classId=uid(),code=randomBytes(4).toString('hex').toUpperCase();run('INSERT INTO classes VALUES(?,?,?,?,?)',classId,u.id,required(b.name,80),code,now());return send({id:classId,code},201);}
        const c=classFor(u,id,true);
        if(method==='GET'&&!part){
          const studentList=all('SELECT u.id,u.name,u.login FROM users u JOIN members m ON m.userId=u.id WHERE m.classId=? ORDER BY u.name',id);
          const exhibits=all("SELECT e.id,e.title,e.description,e.stage,e.remix,e.displayName,e.assets,e.versionId,e.status,e.projectId,v.n FROM exhibits e JOIN projects p ON p.id=e.projectId JOIN versions v ON v.id=e.versionId WHERE p.classId=? ORDER BY e.createdAt DESC",id).map(e=>({...e,assets:parse(e.assets,[]).map(a=>one('SELECT id,kind,title,mime,filename,length(bytes) AS size FROM assets WHERE id=? AND projectId=?',a,e.projectId)).filter(Boolean)}));
          const observations=all('SELECT o.*,p.title FROM observations o JOIN projects p ON p.id=o.projectId WHERE p.classId=? ORDER BY o.createdAt DESC LIMIT 100',id);
          const support=all("SELECT o.id,o.recordId,o.versionId,o.axis,o.note,o.nextQuestion,r.body AS quote,v.n,p.id AS projectId,p.title,coalesce(t.name,u.name) AS learner FROM observation_support s JOIN observations o ON o.id=s.observationId JOIN projects p ON p.id=o.projectId JOIN users u ON u.id=p.ownerId LEFT JOIN teams t ON t.id=p.teamId LEFT JOIN records r ON r.id=o.recordId LEFT JOIN versions v ON v.id=o.versionId WHERE p.classId=? ORDER BY o.createdAt DESC",id);
          const changes=all("SELECT p.id AS projectId,p.title,f.body AS feedback,v.n AS fromN,vNext.n AS toN,vNext.id AS versionId,vNext.reason FROM projects p JOIN feedback f ON f.projectId=p.id JOIN versions v ON v.id=f.versionId JOIN versions vNext ON vNext.projectId=p.id AND vNext.n=(SELECT min(n) FROM versions step WHERE step.projectId=p.id AND step.n>v.n AND step.createdAt>=f.createdAt) WHERE p.classId=? ORDER BY vNext.createdAt DESC LIMIT 12",id);
          return send({class:c,support,changes,students:studentList,teams:all('SELECT * FROM teams WHERE classId=?',id).map(t=>({...t,members:all('SELECT userId FROM team_members WHERE teamId=?',t.id).map(m=>m.userId)})),exhibits,observations});
        }
        const b=await readJson(req);
        if(method==='POST'&&part==='students'){
          const studentId=uid(),login='s'+randomBytes(4).toString('hex'),secret=randomBytes(6).toString('hex').toUpperCase(),name=required(b.name,45);
          tx(()=>{run('INSERT INTO users VALUES(?,?,?,?,?,?)',studentId,'student',name,login,secretHash(secret),now());run('INSERT INTO members VALUES(?,?)',id,studentId);});return send({id:studentId,name,login,secret,classCode:c.code},201);
        }
        if(method==='POST'&&part==='reset-student'){
          const student=one("SELECT u.* FROM users u JOIN members m ON m.userId=u.id WHERE u.id=? AND m.classId=? AND u.role='student'",b.userId,id);if(!student)fail(404,'학생을 찾을 수 없어요.');
          const secret=randomBytes(6).toString('hex').toUpperCase();tx(()=>{run('UPDATE users SET hash=? WHERE id=?',secretHash(secret),student.id);run('DELETE FROM sessions WHERE userId=?',student.id);});return send({id:student.id,name:student.name,login:student.login,secret,classCode:c.code});
        }
        if(method==='POST'&&part==='teams'){
          const members=[...new Set(list(b.members))];if(!members.length||members.length>80)fail(400,'학급 학생을 선택해 주세요.');
          const team=uid();tx(()=>{run('INSERT INTO teams VALUES(?,?,?)',team,id,required(b.name,80));for(const member of members){if(!one('SELECT 1 FROM members WHERE classId=? AND userId=?',id,member))fail(400,'선택한 학생이 이 학급에 없어요.');run('INSERT INTO team_members VALUES(?,?)',team,member);}});return send({id:team},201);
        }
        if(method==='POST'&&part==='assignments'){const assignment=uid();run('INSERT INTO assignments VALUES(?,?,?,?,?)',assignment,id,required(b.title,140),json(cleanSettings(b)),now());return send({id:assignment},201);}
        if(method==='PATCH'&&part==='assignments'&&sub){if(!one('SELECT id FROM assignments WHERE classId=? AND id=?',id,sub))fail(404,'과제를 찾을 수 없어요.');run('UPDATE assignments SET title=?,settings=? WHERE id=?',required(b.title,140),json(cleanSettings(b)),sub);return send({id:sub});}
        if(method==='POST'&&part==='export')return send(exportData(u,id,b));
        if(method==='DELETE'&&!part){if(b.confirm!==c.name)fail(400,'삭제할 학급 이름을 정확히 입력해 주세요.');tx(()=>{const members=all('SELECT userId FROM members WHERE classId=?',id);run('DELETE FROM classes WHERE id=?',id);for(const m of members)if(!one('SELECT 1 FROM members WHERE userId=?',m.userId))run("DELETE FROM users WHERE id=? AND role='student'",m.userId);});return send({ok:true});}
      }
      if(base==='projects'){
        if(method==='POST'&&!id)return send(createProject(u,await readJson(req)),201);
        let p=projectFor(u,id);
        if((method==='GET'||method==='HEAD')&&part==='asset'&&sub){const a=one('SELECT * FROM assets WHERE id=? AND projectId=?',sub,id);if(!a)fail(404,'자료를 찾을 수 없어요.');deliver(req,res,a);return true;}
        if(method==='GET'&&!part)return send(projectDetail(u,p));
        const b=await readJson(req,part==='assets'?23*1024*1024:100000);
        p=projectFor(u,id);
        if(method==='PATCH'&&!part){
          if(b.revision!==p.revision)fail(409,'다른 창이나 모둠원이 먼저 저장했어요. 최신 내용을 확인해 주세요.');
          const updatedAt=now();
          tx(()=>{const result=run('UPDATE projects SET title=?,draft=?,revision=revision+1,updatedAt=? WHERE id=? AND revision=?',required(b.title,120),json(cleanDraft(b.draft)),updatedAt,id,b.revision);
            if(!result.changes)fail(409,'다른 창에서 저장했어요. 최신 내용을 확인해 주세요.');
            live.markDraft(id,u.id,b.revision+1,updatedAt);
          });
          return send({revision:b.revision+1,updatedAt});
        }
        if(method==='POST'&&part==='records'){const rid=uid();run('INSERT INTO records VALUES(?,?,?,?,?,?,?,?)',rid,id,u.id,choice(b.kind,['생각','결정','대화','시험','기여']),choice(b.source,['학생','친구','AI','수업 자료','교사']),required(b.body,5000),b.personal===true?1:0,now());run('UPDATE projects SET updatedAt=? WHERE id=?',now(),id);return send({id:rid},201);}
        if(method==='POST'&&part==='assets'){
          const a=assetInput(b),key=text(b.clientKey,180);if(b.clientKey && (typeof b.clientKey!=='string'||b.clientKey.length>180))fail(400,'자료 저장 번호가 너무 길어요.');
          const fingerprint=key?digest(json([a.kind,a.title,a.description,a.filename,a.mime,digest(a.bytes)])):null;
          const previous=key?one('SELECT assetId,fingerprint FROM asset_keys WHERE projectId=? AND authorId=? AND clientKey=?',id,u.id,key):null;
          if(previous){if(previous.fingerprint!==fingerprint)fail(409,'같은 저장 번호로 다른 자료를 보내지 않도록 새 버전을 만들어 주세요.');return send({id:previous.assetId,title:a.title,projectId:id});}
          const aid=uid(),total=one('SELECT COALESCE(sum(length(bytes)),0) AS n FROM assets WHERE projectId=?',id).n;if(total+a.bytes.length>180*1024*1024)fail(413,'프로젝트 파일 공간을 모두 사용했어요.');
          if(tools.includes(a.kind))authorizeGeneration(req,id,a.kind);
          tx(()=>{run('INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?,?)',aid,id,u.id,a.kind,a.title,a.description,a.filename,a.mime,a.bytes,now());if(key)run('INSERT INTO asset_keys VALUES(?,?,?,?,?)',id,u.id,key,fingerprint,aid);run('UPDATE projects SET updatedAt=? WHERE id=?',now(),id);});return send({id:aid,title:a.title,projectId:id},201);
        }
        if(method==='POST'&&part==='versions')return send(makeVersion(u,p,b,b.restoreId?versionOf(p,b.restoreId):null),201);
        if(method==='POST'&&part==='feedback'){const v=versionOf(p,b.versionId),cid=uid();if(b.recordId)recordOf(u,p,b.recordId);run('INSERT INTO feedback VALUES(?,?,?,?,?,?,?,?,?,?)',cid,id,v.id,u.id,null,b.recordId||null,required(b.body),u.id===p.teacherId?'선생님의 질문':'궁금해요',0,now());return send({id:cid},201);}
        if(method==='POST'&&part==='respond'){
          const f=one('SELECT * FROM feedback WHERE projectId=? AND id=?',id,b.feedbackId);if(!f)fail(404,'의견을 찾을 수 없어요.');if(f.recordId)recordOf(u,p,f.recordId);const rid=uid();run('INSERT INTO responses VALUES(?,?,?,?,?,?)',rid,f.id,u.id,choice(b.status,answers),text(b.reason,1200),now());return send({id:rid},201);
        }
        if(method==='POST'&&part==='observation-drafts'){
          teacherOf(u,p);
          const v=b.versionId?versionOf(p,b.versionId):null,r=b.recordId?recordOf(u,p,b.recordId):null,axis=choice(b.axis,axes);
          const evidence=[];
          if(r)evidence.push({field:r.kind,text:r.body});
          if(v){if(v.reason)evidence.push({field:'버전 '+v.n+' 수정 이유',text:v.reason});for(const [field,val] of Object.entries(v.snapshot.draft))if(val)evidence.push({field,text:val.slice(0,450)});}
          if(!evidence.length)fail(400,'관찰에 사용할 내용이 있는 버전이나 발화·결정을 선택해 주세요.');
          rate('observer:'+u.id,8,60000);
          const s=await suggestObservation(axis,evidence),did=uid();
          const current=session(req);if(!current||current.id!==u.id)fail(401,'다시 로그인해 주세요.');
          teacherOf(current,projectFor(current,id));
          run('INSERT INTO observation_drafts VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',did,id,u.id,v?.id||null,r?.id||null,axis,s.note,s.quote,s.nextQuestion,s.model,s.promptVersion,now());
          return send({...s,id:did},201);
        }
        if(method==='POST'&&part==='observations'){
          teacherOf(u,p);const v=b.versionId?versionOf(p,b.versionId):null,r=b.recordId?recordOf(u,p,b.recordId):null;
          const state=choice(b.state,['검토 중','확인','보류']);if(state==='확인' && !v && !r)fail(400,'확인한 관찰에는 발화나 작품 버전을 연결해 주세요.');
          const oid=b.id||uid();if(b.id&&!one('SELECT id FROM observations WHERE id=? AND projectId=? AND teacherId=?',oid,id,u.id))fail(404,'관찰을 찾을 수 없어요.');
          const source=b.draftId?one('SELECT * FROM observation_drafts WHERE id=? AND projectId=? AND teacherId=?',b.draftId,id,u.id):null;
          if(b.draftId&&(!source||source.axis!==b.axis||source.versionId!==(v?.id||null)||source.recordId!==(r?.id||null)))fail(400,'초안을 만들 때 선택한 관찰 항목과 근거를 확인해 주세요.');
          tx(()=>{run('INSERT INTO observations VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET versionId=excluded.versionId,recordId=excluded.recordId,axis=excluded.axis,note=excluded.note,nextQuestion=excluded.nextQuestion,state=excluded.state,createdAt=excluded.createdAt',oid,id,u.id,v?.id||null,r?.id||null,choice(b.axis,axes),text(b.note,3000),text(b.nextQuestion,1500),state,now());
            run('DELETE FROM observation_support WHERE observationId=?',oid);if(b.support===true)run('INSERT INTO observation_support VALUES(?)',oid);
            run('DELETE FROM observation_sources WHERE observationId=?',oid);if(source)run('INSERT INTO observation_sources VALUES(?,?)',oid,source.id);
          });return send({id:oid},201);
        }
        if(method==='POST'&&part==='exhibits'){
          const v=versionOf(p,b.versionId),ids=[...new Set(list(b.assetIds))];if(ids.length>8||ids.some(a=>!v.snapshot.assetIds.includes(a)))fail(400,'해당 버전에 담긴 자료만 전시할 수 있어요.');
          const eid=uid();run('INSERT INTO exhibits VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',eid,id,v.id,u.id,required(b.title,120),text(b.description,2200),choice(b.stage,['만드는 중','친구 의견 기다리는 중','새 버전','완성']),b.showName===true?u.name:'우리 반 창작자',json(ids),b.remix===true?1:0,'pending',now());return send({id:eid,status:'pending'},201);
        }
      }
      if(base==='gallery'){
        if(method==='GET'&&!id){const classId=url.searchParams.get('classId');if(classId)classFor(u,classId);
          const cs=classId?[{id:classId}]:state(u).classes;
          const selectedType=url.searchParams.get('type')||'all';
          if(!Object.hasOwn(galleryKinds,selectedType))fail(400,'표시할 작품 유형을 목록에서 골라 주세요.');
          const works=cs.flatMap(c=>all("SELECT e.id FROM exhibits e JOIN projects p ON p.id=e.projectId WHERE p.classId=? AND e.status='approved' ORDER BY e.createdAt DESC",c.id).map(x=>exhibitView(u,exhibitFor(u,x.id))));
          return send(filterGallery(works,selectedType).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));}
        if(method==='POST'&&part==='moderate'){const e=exhibitFor(u,id,false);teacherOf(u,e);const b=await readJson(req);const status=choice(b.status,['approved','revoked']);run('UPDATE exhibits SET status=? WHERE id=?',status,id);return send({id,status});}
        let e=exhibitFor(u,id);
        if(method==='GET'&&!part)return send(exhibitView(u,e));
        if((method==='GET'||method==='HEAD')&&part==='asset'){if(!e.assets.includes(sub))fail(404,'공개된 자료가 아니에요.');const a=publicAsset(one('SELECT * FROM assets WHERE projectId=? AND id=?',e.projectId,sub));if(!a)fail(404,'자료를 찾을 수 없어요.');deliver(req,res,a);return true;}
        const b=await readJson(req);
        e=exhibitFor(u,id);
        if(method==='POST'&&part==='feedback'){const fid=uid();run('INSERT INTO feedback VALUES(?,?,?,?,?,?,?,?,?,?)',fid,e.projectId,e.versionId,u.id,id,null,required(b.body),choice(b.kind,feedbackKinds.slice(0,3)),b.public===true?1:0,now());return send({id:fid},201);}
        if(method==='POST'&&part==='remix'){
          if(!e.remix)fail(403,'원작자가 이어 만들기를 허용해야 해요.');
          return send(tx(()=>{const p=createProject(u,{...b,classId:e.classId,title:text(b.title,120)||e.title+' 이어 만들기'}, {exhibitId:e.id,title:e.title,displayName:e.displayName,versionId:e.versionId,description:e.description}, {goal:e.description,change:text(b.change)});
            for(const aid of e.assets){const a=publicAsset(one('SELECT * FROM assets WHERE id=? AND projectId=?',aid,e.projectId));if(a)run('INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?,?)',uid(),p.id,u.id,a.kind,a.title,exhibitCityUrl(a)?'작품 주소 · '+exhibitCityUrl(a):'전시 작품에서 가져온 자료',a.filename,a.mime,a.bytes,now());}return p;}),201);
        }
      }
      fail(404,'요청한 학급 기능을 찾을 수 없어요.');
    }catch(e){if(!res.headersSent)reply(res,e.status||500,{error:e.status?e.message:'학급 자료를 처리하지 못했어요.',code:e.status?e.code:'school_internal'});else res.destroy();return true;}
  }
  return {handle,close:()=>db.close(),getIdentity:session,authorizeGeneration,reserveGeneration,authorizeJob,
    completeGeneration:(id,jobId)=>{if(id)run("UPDATE job_claims SET jobId=?,status='submitted' WHERE id=?",jobId,id);},
    updateGenerationJob:(jobId,status)=>{if(['queued','running','completed','succeeded','failed','cancelled','canceled'].includes(status))run('UPDATE job_claims SET status=? WHERE jobId=?',status,jobId);},
    releaseGeneration:id=>{if(id)run("UPDATE job_claims SET status='rejected' WHERE id=? AND jobId IS NULL",id);}};
}

import {createSchool} from './server/school.mjs';
import {submit,checkJob,ensurePracticeSession} from './server/job-access.mjs';
import {cancelJob} from './server/engines.mjs';
import http from 'node:http';
import https from 'node:https';
import {readFileSync} from 'node:fs';
import { open } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { engines, error, jobsDir, mimeTypes, nextQuestion, readJob, refreshJob, submitGeneration } from './server/engines.mjs';
import {setupProgress} from './server/setup-progress.mjs';

const dist = fileURLToPath(new URL('./dist/',import.meta.url));
const flag = process.argv.indexOf('--port');
const port = Number(flag>=0?process.argv[flag+1]:process.env.PORT || 5175);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('Port must be an integer from 1 to 65535.');
const railway=Boolean(process.env.RAILWAY_ENVIRONMENT_ID);
const tlsCert=process.env.DOL_TLS_CERT,tlsKey=process.env.DOL_TLS_KEY;
const bind=process.env.DOL_BIND_HOST||(railway?'0.0.0.0':'127.0.0.1');
const publicHost=process.env.DOL_CLASS_HOST||(railway?process.env.RAILWAY_PUBLIC_DOMAIN:'');
if(Boolean(tlsCert)!==Boolean(tlsKey))throw Error('DOL_TLS_CERT and DOL_TLS_KEY must be paired');
if(!railway && bind!=='127.0.0.1' && (!tlsCert||!publicHost))throw Error('Classroom access requires DOL_TLS_CERT, DOL_TLS_KEY and DOL_CLASS_HOST');
// Railway terminates HTTPS at its edge. Use configured hosts for public origins.
const protocol=tlsCert||railway?'https:':'http:';
const hosts=new Set(railway?[]:['127.0.0.1:'+port,'localhost:'+port]);
for(const name of [publicHost,railway&&process.env.RAILWAY_PUBLIC_DOMAIN]){
  if(name)hosts.add(name.toLowerCase());
}
const types = {...mimeTypes,'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon','.json':'application/json; charset=utf-8','.woff2':'font/woff2'};
const json = (res,status,obj) => { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(obj)); };
async function readBody(req,limit) {
  if(req.headers['content-type']?.split(';')[0]?.trim()!=='application/json')throw error(415,'json_required','JSON 형식이 필요해요.');
  if(Number(req.headers['content-length'])>limit)throw error(413,'too_large','파일이나 대화 내용을 조금 줄여 주세요.');
  const chunks=[];let length=0;
  for await(const chunk of req){
    length+=chunk.length;
    if(length>limit)throw error(413,'too_large','파일이나 대화 내용을 조금 줄여 주세요.');
    chunks.push(chunk);
  }
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch{throw error(400,'invalid_json','요청 내용을 읽을 수 없어요.');}
}
async function serveFile(req,res,filename) {
  let file;
  try{ file=await open(filename,'r'); }
  catch { throw error(404,'not_found','파일을 찾을 수 없어요.'); }
  let stream;
  try {
    const meta=await file.stat(),type=types[extname(filename).toLowerCase()];
    if(!meta.isFile()||!type)throw error(404,'not_found','파일을 찾을 수 없어요.');
    const headers={'Content-Type':type,'Accept-Ranges':'bytes','Content-Length':meta.size};
    let status=200,start=0,end=meta.size-1;
    if(req.headers.range && req.method==='GET'){
      const range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if(range && (range[1]||range[2])){
        if(range[1]){start=Number(range[1]);if(range[2])end=Math.min(end,Number(range[2]));}
        else start=Math.max(0,meta.size-Number(range[2]));
      } else start=meta.size;
      if(start> end || start>=meta.size) {res.writeHead(416,{'Content-Range':'bytes */'+meta.size});res.end();return;}
      status=206;headers['Content-Range']='bytes '+start+'-'+end+'/'+meta.size;headers['Content-Length']=end-start+1;
    }
    res.writeHead(status,headers);
    if(req.method==='HEAD'||!meta.size){res.end();return;}
    stream=file.createReadStream({start,end});
    res.on('close',()=>stream.destroy());
    stream.on('error',()=>res.destroy());
    stream.pipe(res);
  } finally{if(!stream) await file.close();}
}
const school=createSchool();
const handler=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','same-origin');
  try {
    const host=req.headers.host?.toLowerCase();
    const healthProbe=railway && host==='healthcheck.railway.app';
    if((healthProbe||hosts.has(host)) && req.url==='/healthz' && ['GET','HEAD'].includes(req.method)){
      res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});
      res.end(req.method==='HEAD'?undefined:'ok');return;
    }
    if(!hosts.has(host))throw error(403,'local_only','이 컴퓨터의 작업실 주소로 접속해 주세요.');
    const origin=protocol+'//'+host;
    const url=new URL(req.url,origin);
    if(url.origin!==origin)throw error(403,'origin_mismatch','같은 작업실 화면에서 요청해 주세요.');
    if(url.pathname==='/google-teacher.html'){res.setHeader('Cross-Origin-Opener-Policy','same-origin-allow-popups');res.setHeader('Referrer-Policy',protocol==='https:'?'strict-origin-when-cross-origin':'no-referrer-when-downgrade');}
    if(req.method==='GET'&&['/','/index.html','/api/status'].includes(url.pathname)&&!school.getIdentity(req))ensurePracticeSession(req,res);
    if(url.pathname.startsWith('/api/')){
      if((req.headers.origin && req.headers.origin!==origin) || req.headers['sec-fetch-site']==='cross-site') throw error(403,'origin_mismatch','같은 작업실 화면에서 요청해 주세요.');
      const expected=req.headers['x-dol-account'];if(expected&&expected!==(school.getIdentity(req)?.id||'guest')){res.setHeader('X-Dol-Account-Changed','1');throw error(409,'account_changed','현재 탭의 로그인 계정이 바뀌었어요.');}
      if((railway||bind!=='127.0.0.1')&&['/api/generate','/api/question'].includes(url.pathname)&&!school.getIdentity(req))throw error(401,'class_required','수업 계정으로 로그인해 주세요.');
      if(await school.handle(req,res,url))return;
      if(req.method==='GET'&&url.pathname==='/api/tool-policy'){school.authorizeGeneration(req,url.searchParams.get('project'),url.searchParams.get('tool'));json(res,200,{allowed:true});return;}
      if(req.method==='GET' && url.pathname==='/api/status'){
        const {chat,image,video}=await engines();
        json(res,200,{chat,image,video});return;
      }
      if(req.method==='GET' && url.pathname==='/api/setup-progress'){
        json(res,200,{packages:await setupProgress()});return;
      }
      if(req.method==='POST' && url.pathname==='/api/question'){
        const data=await readBody(req,256*1024);const lesson=school.authorizeGeneration(req,data.schoolProjectId,'dialogue',data.schoolVersionId);json(res,200,await nextQuestion({...data,lesson}));return;
      }
      if(req.method==='POST' && url.pathname==='/api/generate'){
        json(res,202,await submit(req,res,await readBody(req,17*1024*1024),school));return;
      }
      const match=/^\/api\/jobs\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\/output)?$/.exec(url.pathname);
      if(match && req.method==='DELETE'&&!match[2]){await checkJob(req,match[1],school,true);const job=await cancelJob(match[1]);school.updateGenerationJob?.(match[1],job.status);json(res,200,job);return;}
      if(match && (req.method==='GET' || (req.method==='HEAD' && match[2]))){
        const [,id,output]=match;await checkJob(req,id,school);
        if(!output){const job=await refreshJob(id);school.updateGenerationJob?.(id,job.status);json(res,200,job);return;}
        const job=await readJob(id);
        if(job.status!=='completed'||!Object.hasOwn(mimeTypes,job.extension))throw error(409,'not_ready','아직 생성 중이에요.');
        await serveFile(req,res,join(jobsDir,id+job.extension));return;
      }
      throw error(404,'not_found','요청한 기능을 찾을 수 없어요.');
    }
    if(req.method!=='GET' && req.method!=='HEAD')throw error(405,'method_not_allowed','페이지는 브라우저에서 열어 주세요.');
    const path=decodeURIComponent(url.pathname).slice(1)||'index.html';
    if(!path.split('/').every(part=>part && !part.startsWith('.') && /^[\p{L}\p{N} _.-]+$/u.test(part)) || !Object.hasOwn(types,extname(path).toLowerCase()))throw error(404,'not_found','페이지를 찾을 수 없어요.');
    await serveFile(req,res,resolve(dist,path));
  } catch(e){
    if(res.headersSent){res.destroy();return;}
    json(res,e.status||500,{code:e.code&&e.status?e.code:'internal_error',error:e.status?e.message:'작업실이 요청을 처리하지 못했어요.'});
  }
};
const app=tlsCert?https.createServer({cert:readFileSync(tlsCert),key:readFileSync(tlsKey)},handler):http.createServer(handler);
app.on('close',()=>school.close());
app.on('error',e=>{console.error(e.code==='EADDRINUSE'?'해당 포트를 사용 중이에요. 다른 --port 값을 선택해 주세요.':e.message);process.exitCode=1;});
app.listen(port,bind,()=>console.log('돌 AI 창작연구소 '+protocol+'//'+(publicHost||bind+':'+port)+'/'));

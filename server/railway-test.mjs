import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempDisposableSync} from 'node:fs';
import {request} from 'node:http';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';

const temp=mkdtempDisposableSync(join(tmpdir(),'dol-railway-test-'));
const hold=createServer();
hold.listen(0,'127.0.0.1');
await once(hold,'listening');
const port=hold.address().port;
await new Promise(done=>hold.close(done));

const publicHost='studio.example.test';
const customHost='classroom.example.test';
const teacherSecret=randomUUID();
const env={...process.env,PORT:String(port),RAILWAY_ENVIRONMENT_ID:randomUUID(),
  RAILWAY_PUBLIC_DOMAIN:publicHost,DOL_CLASS_HOST:customHost,DOL_SCHOOL_DIR:join(temp.path,'school'),
  THINKING_LAB_DATA:join(temp.path,'jobs'),DOL_TEACHER_SECRET:teacherSecret,DOL_OPERATOR_SECRET:randomUUID(),
  DOL_GOOGLE_CLIENT_ID:'100-regression.apps.googleusercontent.com'};
delete env.DOL_TLS_CERT; delete env.DOL_TLS_KEY; delete env.DOL_BIND_HOST; delete env.DOL_COOKIE_SECURE;
const teacher={login:'teacher',secret:teacherSecret};
let proc;
function call(path,{method='GET',host=publicHost,headers={},body}={}) {
  return new Promise((resolve,reject)=>{
    const req=request({hostname:'127.0.0.1',port,path,method,
      headers:{Host:host,...(body?{'Content-Type':'application/json'}:{}),...headers}},res=>{
      const chunks=[];
      res.on('data',chunk=>chunks.push(chunk));
      res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text:Buffer.concat(chunks).toString('utf8')}));
      res.on('error',reject);
    });
    req.on('error',reject);
    req.setTimeout(5000,()=>req.destroy(new Error('Test server timeout')));
    req.end(body?JSON.stringify(body):undefined);
  });
}
async function start() {
  proc=spawn(process.execPath,['server.mjs'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env,
    stdio:['ignore','ignore','inherit'],windowsHide:true});
  for(let i=0;i<100;i++){
    if(proc.exitCode!==null)throw Error('Test server exited');
    try{if((await call('/healthz',{host:'healthcheck.railway.app'})).status===200)return;}catch{}
    await delay(40);
  }
  throw Error('Healthcheck did not pass');
}
async function stop() {
  if(!proc||proc.exitCode!==null||proc.signalCode!==null)return;
  const closed=once(proc,'close');proc.kill();await closed;
}
function cookie(response) {
  assert.equal(response.status,200);
  const value=response.headers['set-cookie']?.[0]||'';
  assert.match(value,/; Secure(?:;|$)/);assert.match(value,/; HttpOnly;/);assert.match(value,/; SameSite=Strict;/);
  return value.split(';')[0];
}
try {
  await start();
  const origin='https://'+publicHost;
  assert.equal((await call('/healthz',{method:'HEAD',host:'healthcheck.railway.app'})).status,200);
  assert.equal((await call('/healthz',{host:'other.example.test'})).status,403);
  assert.equal((await call('/',{host:'healthcheck.railway.app'})).status,403);
  assert.equal((await call('/',{host:customHost})).status,200);
  cookie(await call('/'));
  assert.equal((await call('/api/question',{method:'POST',headers:{origin},body:{}})).status,401);
  assert.equal((await call('/api/generate',{method:'POST',headers:{origin},body:{}})).status,401);
  assert.equal((await call('/api/school/login',{method:'POST',headers:{origin:'https://another.example.test'},body:teacher})).status,403);
  const token=cookie(await call('/api/school/login',{method:'POST',headers:{origin},body:teacher}));
  const classroom=await call('/api/school/classes',{method:'POST',headers:{origin,cookie:token},body:{name:'테스트 교실'}});
  assert.equal(classroom.status,201);
  const id=JSON.parse(classroom.text).id;
  cookie(await call('/api/school/google/start',{method:'POST',headers:{origin},body:{mode:'login'}}));
  await stop();await start();
  const after=await call('/api/school/me',{headers:{cookie:token}});
  assert.equal(after.status,200);
  assert.ok(JSON.parse(after.text).classes.some(c=>c.id===id));
  cookie(await call('/api/school/logout',{method:'POST',headers:{origin,cookie:token},body:{}}));
  console.log('PASS Railway health probes, public/custom host, HTTPS account/Google cookies, guest limits, private class survives server restart');
}finally {
  await stop();temp.remove();
}

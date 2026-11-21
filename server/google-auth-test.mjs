import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

import {createGoogleVerifier} from './google-token.mjs';
import {createSchool} from './school.mjs';

const client='1234567890-testclass.apps.googleusercontent.com',kid='test-signing-key';
const keys=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...keys.publicKey.export({format:'jwk'}),kid,alg:'RS256',use:'sig'};
let fetches=0;
const verifier=createGoogleVerifier(async url=>{
  assert.equal(url,'https://www.googleapis.com/oauth2/v3/certs');fetches++;
  return new Response(JSON.stringify({keys:[jwk]}),{headers:{'cache-control':'public, max-age=600'}});
});
function token(nonce,changes={},header={},key=keys.privateKey){
  const now=Math.floor(Date.now()/1000),enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
  const unsigned=enc({alg:'RS256',kid,...header})+'.'+enc({iss:'https://accounts.google.com',aud:client,iat:now,exp:now+3600,nonce,sub:'subject-1',email:'primary@gmail.com',email_verified:true,...changes});
  return unsigned+'.'+sign('RSA-SHA256',Buffer.from(unsigned),key).toString('base64url');
}
const assertInvalid=async(tok,nonce='n')=>assert.rejects(verifier(tok,client,nonce),e=>e.status===401);
assert.equal((await verifier(token('n'),client,'n')).subject,'subject-1');
for(const d of [{aud:client+'other'},{iss:'invalid'},{exp:1},{iat:Math.floor(Date.now()/1000)+1000},{email_verified:false},{sub:''},{azp:'other'}])await assertInvalid(token('n',d));
await assertInvalid(token('n'),'other');
await assertInvalid(token('n',{}, {alg:'none'}));
await assertInvalid(token('n',{}, {},generateKeyPairSync('rsa',{modulusLength:2048}).privateKey));
assert.equal(fetches,1);
const dir=mkdtempSync(join(tmpdir(),'dol-google-test-')),password=randomUUID(),opPassword=randomUUID();
let school;
const open=()=>createSchool({dataDir:dir,bootstrapSecret:password,operatorSecret:opPassword,googleClientId:'',googleVerifier:verifier});
school=open();
const server=createServer((req,res)=>school.handle(req,res,new URL(req.url,'http://'+req.headers.host)));
server.listen(0,'localhost');await once(server,'listening');
const origin='http://localhost:'+server.address().port;
async function request(path,{body,cookie,code=200,source=origin}={}){
  const r=await fetch(origin+'/api/school/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',cookie:cookie||'',origin:source},body:body?JSON.stringify(body):undefined});
  const result=await r.json();assert.equal(r.status,code,path+' '+JSON.stringify(result));
  const cookies=r.headers.getSetCookie().map(v=>v.split(';')[0]);return {result,cookies,session:cookies.find(s=>s.startsWith('dol_class_session=')),challenge:cookies.find(s=>s.startsWith('dol_teacher_challenge='))};
}
const login=async(user,pw)=>(await request('login',{body:{login:user,secret:pw}})).session;
const start=async(cookie='',body={mode:'login'},code=200)=>request('google/start',{body,cookie,code});
const finish=async(ctx,credential,{cookie,csrf=ctx.result.csrf,code=200,source}={})=>request('google/finish',{body:{csrf,credential},cookie:[cookie,ctx.challenge].filter(Boolean).join('; '),code,source});
try{
 const op=await login('operator',opPassword),owner=await login('teacher',password);
 const existing=(await request('me',{cookie:owner})).result.user;
 assert.equal((await request('me')).result.google.enabled,false);await start('',{mode:'login'},503);
 await request('ops/google/config',{cookie:owner,body:{clientId:client},code:403});
 await request('ops/google/config',{cookie:op,body:{clientId:'wrong-value'},code:400});
 await request('ops/google/config',{cookie:op,body:{clientId:client}});
 await request('google/start',{body:{mode:'login'},source:'https://other.invalid',code:403});
 await start(op,{mode:'link',password:opPassword},403);await start(owner,{mode:'link',password:'incorrect'},403);
 const uninvited=await start();await finish(uninvited,token(uninvited.result.nonce),{code:403});
 const c=await start(owner,{mode:'link',password});const t=token(c.result.nonce,{email:'new@thirdparty.example'});
 await request('google/finish',{cookie:owner,body:{csrf:c.result.csrf,credential:t},code:403});
 await finish(c,t,{cookie:owner,csrf:'other',code:403});
 const linked=await finish(c,t,{cookie:owner});assert.equal(linked.result.user.id,existing.id);
 await finish(c,t,{cookie:linked.session,code:403});
 assert.equal((await request('me',{cookie:owner})).result.user,null);
 const back=await start();const relog=await finish(back,token(back.result.nonce,{email:'changed@gmail.com'}));assert.equal(relog.result.user.id,existing.id);
 const staff=(await request('ops/teachers',{cookie:op,body:{name:'초대한 교사'},code:201})).result;
 const invite=email=>request('ops/google/invite',{cookie:op,body:{teacherId:staff.id,email}});
 await invite('third@unmanaged.example');let a=await start();
 await finish(a,token(a.result.nonce,{sub:'other',email:'third@unmanaged.example'}),{code:403});
 await invite('school.user@example.edu');
 a=await start();const second=await finish(a,token(a.result.nonce,{sub:'school-subject',email:'school.user@example.edu',hd:'example.edu'}));
 assert.equal(second.result.user.id,staff.id);
 const details=(await request('ops',{cookie:op})).result.google.accounts.find(v=>v.id===staff.id);assert.equal(details.linked,'school.user@example.edu');assert.equal(details.invited,null);
 await request('ops/google/revoke',{cookie:op,body:{teacherId:staff.id}});
 assert.equal((await request('me',{cookie:second.session})).result.user,null);
 a=await start();await finish(a,token(a.result.nonce,{sub:'school-subject',email:'school.user@example.edu',hd:'example.edu'}),{code:403});
 assert.ok(await login(staff.login,staff.secret));
 school.close();school=open();const afterRestart=await start();
 assert.equal((await finish(afterRestart,token(afterRestart.result.nonce))).result.user.id,existing.id);
 assert.equal(fetches,1);
 console.log('PASS verified signatures/claims, configured client ID and JWKS cache, teacher-only reauthenticated links, invited Workspace account, email changes, stable sub, one-use browser challenge/origin/CSRF, subject revocation, persistent sessions and password fallback.');
}finally{server.close();school.close();}

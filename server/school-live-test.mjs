import assert from 'node:assert/strict';
import * as sqlite from 'node:sqlite';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createSchool} from './school.mjs';

const baseDir=mkdtempSync(join(tmpdir(),'dol-class-live-test-')),teacherPassword=randomUUID(),opsPassword=randomUUID();
const service=createSchool({dataDir:baseDir,bootstrapSecret:teacherPassword,operatorSecret:opsPassword});
const http=createServer((req,res)=>service.handle(req,res,new URL(req.url,'http://'+req.headers.host)));
http.listen(0,'127.0.0.1');await once(http,'listening');
const origin='http://127.0.0.1:'+http.address().port;
const inspector=new (sqlite.Database||sqlite.DatabaseSync)(join(baseDir,'classroom.sqlite'));
async function call(cookie,method,path,body,expected=200){
  const res=await fetch(origin+'/api/school/'+path,{method,headers:{cookie:cookie||'',origin,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const result=await res.json();assert.equal(res.status,expected,method+' '+path+' '+JSON.stringify(result));
  return {result,cookie:res.headers.get('set-cookie')?.split(';')[0]};
}
const login=async(login,secret,classCode)=>(await call('','POST','login',{login,secret,classCode})).cookie;
const post=async(c,path,b,status=201)=>(await call(c,'POST',path,b,status)).result;
const snapshot=async(c,id,status=200)=>(await call(c,'GET','classes/'+id+'/live',undefined,status)).result;
const pulse=(c,b,status=200)=>post(c,'presence',b,status);
const member=(s,id)=>s.students.find(u=>u.id===id);
try{
  const t=await login('teacher',teacherPassword),op=await login('operator',opsPassword);
  const otherTeacher=await post(op,'ops/teachers',{name:'보라 선생님'}),t2=await login(otherTeacher.login,otherTeacher.secret);
  const cl=await post(t,'classes',{name:'나무 교실'}),other=await post(t2,'classes',{name:'다른 학교 구름반'});
  assert.deepEqual((await snapshot(t,cl.id)).students,[]);await snapshot(t2,cl.id,404);await snapshot(op,cl.id,404);await snapshot('',cl.id,401);
  const enroll=async(c,group,name)=>{const person=await post(c,'classes/'+group.id+'/students',{name});return {...person,cookie:await login(person.login,person.secret,group.code)};};
  const a=await enroll(t,cl,'별이'),b=await enroll(t,cl,'달이'),inactive=await enroll(t,cl,'해솔'),foreign=await enroll(t2,other,'구름');
  const roster=await snapshot(t,cl.id);assert.equal(roster.students.length,3);assert.equal(roster.events.length,0);assert.equal(member(roster,inactive.id).lastSeenAt,null);
  await snapshot(a.cookie,cl.id,404);await snapshot(foreign.cookie,cl.id,404);await pulse(t,{tool:'home'},403);await pulse('',{tool:'home'},401);
  const team=await post(t,'classes/'+cl.id+'/teams',{name:'산책 모둠',members:[a.id,b.id]});
  const personal=await post(a.cookie,'projects',{classId:cl.id,title:'개인 길 지도'});
  const group=await post(a.cookie,'projects',{classId:cl.id,teamId:team.id,title:'여름 그늘 지도'});
  const elsewhere=await post(foreign.cookie,'projects',{classId:other.id,title:'다른 학교 프로젝트'});
  await pulse(b.cookie,{tool:'project',projectId:personal.id},404);await pulse(a.cookie,{tool:'project',projectId:elsewhere.id},404);
  await pulse(foreign.cookie,{tool:'studio',classId:cl.id},404);await pulse(a.cookie,{tool:'project',projectId:group.id,classId:other.id},404);
  await pulse(foreign.cookie,{active:false,classId:cl.id,tabId:'fake'},404);
  await pulse(a.cookie,{tool:'교사 전용 비공개',classId:cl.id},400);
  await pulse(a.cookie,{tool:'city',projectId:group.id,tabId:'a1',seq:1,userId:b.id});
  let view=await snapshot(t,cl.id);
  assert.equal(member(view,a.id).tool,'city');assert.equal(member(view,a.id).teamId,team.id);assert.equal(member(view,b.id).online,false);assert.equal(member(view,b.id).lastSave,null);
  // A new tab can lead. Hiding it leaves another open tab visible. Late network deliveries cannot revive a hidden tab.
  await pulse(a.cookie,{tool:'gallery',tabId:'a2',seq:1});
  assert.equal(member(await snapshot(t,cl.id),a.id).tool,'gallery');
  await pulse(a.cookie,{tabId:'a2',active:false,seq:3});await pulse(a.cookie,{tool:'web',projectId:group.id,tabId:'a2',seq:2});
  assert.equal(member(await snapshot(t,cl.id),a.id).tool,'city');
  await pulse(b.cookie,{tool:'3d',projectId:group.id,tabId:'b1',seq:1});
  const patch=await call(b.cookie,'PATCH','projects/'+group.id,{revision:0,title:'여름 그늘 지도',draft:{plan:'PRIVATE_DRAFT_TEXT'}});
  assert.equal(patch.result.revision,1);
  await post(a.cookie,'projects/'+group.id+'/records',{personal:true,kind:'기여',source:'학생',body:'PRIVATE_THOUGHT'});
  const asset=await post(b.cookie,'projects/'+group.id+'/assets',{kind:'note',title:'PRIVATE_FILENAME',description:'PRIVATE_PROMPT'});
  const ver=await post(a.cookie,'projects/'+group.id+'/versions',{revision:1,assetIds:[asset.id],reason:'PRIVATE_REASON'});
  view=await snapshot(t,cl.id);assert.ok(!JSON.stringify(view).includes('PRIVATE_'));
  assert.equal(member(view,a.id).lastSave.kind,'version');assert.equal(member(view,b.id).lastSave.kind,'asset');
  assert.equal(member(view,inactive.id).lastSave,null);assert.equal(member(view,inactive.id).online,false);
  assert.ok(view.events.find(e=>e.kind==='draft'&&e.authorId===b.id&&e.teamId===team.id));
  assert.ok(view.events.find(e=>e.kind==='version'&&e.authorId===a.id&&e.versionNumber===1&&e.versionId===ver.id));
  assert.ok(!JSON.stringify(view).includes(elsewhere.id));
  // Enrollment currently creates one membership. Add a second membership for this fixture to exercise class switching.
  inspector.prepare('INSERT INTO members VALUES(?,?)').run(other.id,a.id);
  await pulse(a.cookie,{tabId:'a1',tool:'home',seq:2},400);
  await pulse(a.cookie,{classId:other.id,tool:'home',tabId:'a1',seq:3});await pulse(a.cookie,{classId:cl.id,active:false,tabId:'a1',seq:2});
  assert.equal(member(await snapshot(t,cl.id),a.id).online,false);
  assert.equal(member(await snapshot(t2,other.id),a.id).tool,'home');assert.equal(member(await snapshot(t2,other.id),a.id).lastSave,null);
  // Keep the test fast while exercising the stored-clock TTL and last-seen retention.
  inspector.prepare('UPDATE class_live_tabs SET seenAt=? WHERE userId=?').run(Date.now()-61000,b.id);
  let row=member(await snapshot(t,cl.id),b.id);assert.equal(row.online,false);assert.equal(row.tool,null);assert.equal(row.projectId,null);assert.ok(row.lastSeenAt);
  inspector.prepare('UPDATE class_live_seen SET seenAt=? WHERE userId=?').run(Date.now()-86500000,b.id);
  assert.equal(member(await snapshot(t,cl.id),b.id).lastSeenAt,null);
  await pulse(a.cookie,{classId:cl.id,tool:'gallery',tabId:'a1',seq:4});await post(a.cookie,'logout',{},200);
  row=member(await snapshot(t,cl.id),a.id);assert.equal(row.online,false);assert.ok(row.lastSeenAt);
  console.log('PASS actual HTTP: isolated schools and roles, full roster, tab TTL/order/class switching/logout, own/shared project access, real contributor-only autosave/asset/version events and private content omitted.');
}finally{inspector.close();http.close();service.close();}

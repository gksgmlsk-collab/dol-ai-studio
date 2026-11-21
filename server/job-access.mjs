import {cookieAttributes} from './cookies.mjs';
import {randomBytes,createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,unlink,readdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {jobsDir,error,submitGeneration,readJob,refreshJob} from './engines.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const submissions=new Map(),ownerQueues=new Map();
function practiceCookie(req){return /(?:^|;\s*)dol_practice=([\w-]{43})(?:;|$)/.exec(req.headers.cookie||'')?.[1];}
export function ensurePracticeSession(req,res){
  const existing=practiceCookie(req);
  if(existing)return existing;
  const token=randomBytes(32).toString('base64url');
  res.appendHeader('Set-Cookie','dol_practice='+token+cookieAttributes(req,2592000));
  return token;
}
async function checkCapacity(owner){
  const entries=await readdir(jobsDir).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
  let active=0;
  for(const name of entries){
    if(!/^[a-f0-9-]{36}\.json$/.test(name))continue;
    const job=await readJob(name.slice(0,-5));
    if(job.owner!==owner||!['queued','running'].includes(job.status))continue;
    let state=job.status;
    try{state=(await refreshJob(job.id)).status;}catch{}
    if(['queued','running'].includes(state)&&++active>=3)throw error(429,'queue_limit','기다리는 작품이 세 개 있어요. 한 작품이 끝난 뒤 요청해 주세요.');
  }
}
function forOwner(owner,fn){
  const queue=ownerQueues.get(owner)||{tail:Promise.resolve(),length:0};
  if(queue.length>=3)throw error(429,'busy','앞선 생성 요청이 접수된 뒤 다시 시도해 주세요.');
  ownerQueues.set(owner,queue);queue.length++;
  const result=queue.tail.catch(()=>{}).then(fn);queue.tail=result;
  return result.finally(()=>{if(--queue.length===0)ownerQueues.delete(owner);});
}
export async function submit(req,res,body,school){
  const policy=school.authorizeGeneration(req,body?.schoolProjectId,body?.kind);
  const scopedId=typeof body.requestId==='string'&&/^[a-z\d-]{8,80}$/i.test(body.requestId)?body.requestId:null;
  if(policy.guest&&scopedId&&!practiceCookie(req)){
    ensurePracticeSession(req,res);
    throw error(428,'practice_session','개인 작업실 연결을 확인했어요. 같은 요청을 다시 보내 주세요.');
  }
  const owner=policy.guest?'guest:'+hash(ensurePracticeSession(req,res)):'user:'+policy.userId;
  const projectId=policy.projectId||'';
  const key=scopedId?hash(owner+'|'+projectId+'|'+scopedId):null;
  const fingerprint=hash(JSON.stringify([body.kind,body.prompt,body.translate,body.image||'']));
  const filename=key?join(jobsDir,'requests',key+'.json'):null;
  const conflict=()=>error(409,'different_request','이 요청 번호에 이미 다른 프롬프트가 있어요. 새 요청으로 시작해 주세요.');
  if(key&&submissions.has(key)){const prior=submissions.get(key);if(prior.fingerprint!==fingerprint)throw conflict();return prior.result;}
  const result=forOwner(owner,async()=>{
    if(filename){
      await mkdir(join(jobsDir,'requests'),{recursive:true});
      try{const previous=JSON.parse(await readFile(filename,'utf8'));if(previous.fingerprint!==fingerprint)throw conflict();
        const old=await readJob(previous.id);if(!['failed','canceled'].includes(old.status))return {id:old.id,status:old.status};
      }catch(e){if(e.code!=='ENOENT')throw e;}
    }
    await checkCapacity(owner);
    const reservation=school.reserveGeneration(req,projectId,body.kind);let jobId;
    try{
      return await submitGeneration(body,{owner,schoolProjectId:projectId},async id=>{
        jobId=id;school.completeGeneration(reservation,id);
        if(filename){const temp=filename+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify({id,fingerprint}));await rename(temp,filename);}
      });
    }catch(e){
      if(!jobId)school.releaseGeneration(reservation);
      else if(e.code!=='submission_uncertain'){school.updateGenerationJob?.(jobId,'failed');if(filename)await unlink(filename).catch(()=>{});}
      throw e;
    }
  });
  if(key)submissions.set(key,{fingerprint,result});
  try{return await result;}finally{if(key)submissions.delete(key);}
}
export async function checkJob(req,id,school,write=false){
  const job=await readJob(id);
  if(school.authorizeJob(req,id,{write}))return;
  if(job.schoolProjectId||job.owner?.startsWith('user:')||school.getIdentity(req))throw error(404,'not_found','생성 기록을 찾을 수 없어요.');
  if(job.owner&&(!practiceCookie(req)||job.owner!=='guest:'+hash(practiceCookie(req))))throw error(404,'not_found','생성 기록을 찾을 수 없어요.');
  if(!job.owner&&(write||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)))throw error(403,'legacy_local_only','이전 생성 기록은 이 PC에서만 열 수 있어요.');
}

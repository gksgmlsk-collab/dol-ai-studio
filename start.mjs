import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import {mkdir,open,stat,rm} from 'node:fs/promises';
import {connect} from 'node:net';
import {join} from 'node:path';
import { fileURLToPath } from 'node:url';

const port=5174;
const url='http://127.0.0.1:'+port+'/';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const site=fileURLToPath(new URL('.',import.meta.url)),local=join(site,'.local');
function listening(port){
  return new Promise(resolve=>{
    const socket=connect({host:'127.0.0.1',port});
    const end=present=>{socket.destroy();resolve(present);};
    socket.once('connect',()=>end(true));socket.once('error',()=>end(false));socket.setTimeout(800,()=>end(false));
  });
}
async function startEngine(name,port,marker,command,args,env){
  if(!existsSync(marker)||await listening(port))return;
  const lock=join(local,name+'.starting');
  await mkdir(local,{recursive:true});
  try{if(Date.now()-(await stat(lock)).mtimeMs>60000)await rm(lock);}catch{}
  let handle;
  try{handle=await open(lock,'wx');}catch{return;}
  await handle.close();
  const engine=spawn(command,args,{env,cwd:site,detached:true,windowsHide:true,stdio:'ignore'});
  engine.once('error',()=>{rm(lock,{force:true}).catch(()=>{});});
  engine.unref();
}
if(process.platform==='win32'){
  const ollama=join(local,'ollama','ollama.exe'),comfy=join(local,'comfy','ComfyUI_windows_portable','python_embeded','python.exe');
  await Promise.all([
    startEngine('ollama',11434,ollama,ollama,['serve'],{...process.env,OLLAMA_HOST:'127.0.0.1:11434',OLLAMA_MODELS:join(local,'ollama','models'),OLLAMA_NO_CLOUD:'1',OLLAMA_KEEP_ALIVE:'90s',OLLAMA_NUM_PARALLEL:'1',OLLAMA_CONTEXT_LENGTH:'4096',OLLAMA_VULKAN:'0',CUDA_VISIBLE_DEVICES:'-1'}),
    startEngine('comfy',8188,comfy,'powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',join(site,'server','start-comfy.ps1')],process.env)
  ]);
}
async function ready(){
  try{
    const response=await fetch(url+'api/status',{signal:AbortSignal.timeout(4500)});
    if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))return false;
    const result=await response.json();
    return result.chat && result.image && result.video && (await fetch(url+'api/school/me',{signal:AbortSignal.timeout(2500)})).ok;
  }catch{return false;}
}
if(!await ready()){
  const proc=spawn(process.execPath,[fileURLToPath(new URL('./server.mjs',import.meta.url)),'--port',String(port)],{cwd:fileURLToPath(new URL('.',import.meta.url)),windowsHide:true,detached:true,stdio:'ignore'});
  let failed=false;proc.once('error',()=>{failed=true;});proc.unref();
  for(let i=0;i<30 && !failed && proc.exitCode===null;i++){await pause(250);if(await ready())break;}
  if(!await ready()){console.error('작업실을 열 수 없어요. 5174번 포트를 사용 중인 프로그램을 확인해 주세요.');process.exit(1);}
}
console.log('돌 AI 창작연구소 '+url);
const chrome=process.env.ProgramFiles+'/Google/Chrome/Application/chrome.exe';
if(process.platform==='win32'){
  const browser=existsSync(chrome)?spawn(chrome,['--new-window',url],{detached:true,stdio:'ignore'}):spawn('powershell.exe',['-NoProfile','-Command','Start-Process '+url],{detached:true,stdio:'ignore',windowsHide:true});
  browser.unref();
}

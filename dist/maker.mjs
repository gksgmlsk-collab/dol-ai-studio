import {demoImage} from './generation-demo.mjs';
import {storage as localStorage,dbName} from './workspace-data.mjs';
import {getMediaProjects, renderMediaFrame} from './media.mjs';

const KEY='thinking-lab.maker.v1';
const modes={sketch:'직접 그린 이미지',imageAI:'AI 생성 이미지',animatic:'카메라 애니매틱',videoAI:'AI 생성 영상'};
const cameras={auto:'프롬프트에서 읽기',closer:'천천히 다가가기',left:'왼쪽으로 이동',right:'오른쪽으로 이동',still:'고정하기'};
const backgrounds={paper:'빈 종이',sunset:'노을',night:'밤하늘',meadow:'들판'};
const inkColors=['#243348','#395ad3','#c46aa0','#ef9548','#7bbca5','#fff9e8'];
const uid=()=>globalThis.crypto?.randomUUID?.()||('mk-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
const now=()=>new Date().toISOString();
const copy=v=>JSON.parse(JSON.stringify(v));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mediaName=kind=>kind==='video'?'영상':'이미지';
const call=(type,detail)=>window.dispatchEvent(new CustomEvent(type,{detail}));
const blobFromCanvas=(c,type='image/png')=>new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('그림을 파일로 변환할 수 없어요.')),type));
const asDataURL=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('그림을 읽지 못했어요.'));r.readAsDataURL(blob);});
function canvas(width=960,height=540){const c=document.createElement('canvas');c.width=width;c.height=height;return c;}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let memory=[],tempData=false,dbPromise;
const tempAssets=new Map();
export function getMakerProjects(){
  if(!tempData)try{const raw=JSON.parse(localStorage.getItem(KEY)||'[]');if(Array.isArray(raw))memory=raw.filter(p=>p&&p.id&&['image','video'].includes(p.kind)&&Array.isArray(p.versions));}catch{}
  return copy(memory);
}
function write(p,keepFeedback=true){
  const all=getMakerProjects(),i=all.findIndex(r=>r.id===p.id);
  if(keepFeedback&&i>=0)for(const v of p.versions){
    const saved=all[i].versions.find(x=>x.id===v.id);if(saved)v.teacherFeedback=saved.teacherFeedback||'';
  }
  p.updatedAt=now();if(i<0)all.push(p);else all[i]=p;memory=copy(all);
  try{localStorage.setItem(KEY,JSON.stringify(memory));tempData=false;}catch{tempData=true;}
  return !tempData;
}
export function saveMakerFeedback(projectId,versionId,text){
  const p=getMakerProjects().find(v=>v.id===projectId),v=p?.versions.find(x=>x.id===versionId);
  if(!v)return false;
  v.teacherFeedback=String(text||'').trim().slice(0,4000);write(p,false);call('labchange',{source:'maker'});return true;
}
function database(){
  if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(dbName('thinking-lab-maker-files'),1);
    req.onupgradeneeded=()=>req.result.createObjectStore('assets');req.onsuccess=()=>{req.result.onversionchange=()=>{req.result.close();dbPromise=null;};resolve(req.result);};req.onerror=()=>reject(req.error);
  }).catch(error=>{dbPromise=null;throw error;});
  return dbPromise;
}
async function putAsset(id,blob){
  try{const db=await database();await new Promise((resolve,reject)=>{const tx=db.transaction('assets','readwrite');tx.objectStore('assets').put(blob,id);tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error);});return true;}
  catch{tempAssets.set(id,blob);return false;}
}
export async function getMakerAsset(id){
  if(!id)return null;if(tempAssets.has(id))return tempAssets.get(id);
  try{const db=await database();return await new Promise((resolve,reject)=>{const q=db.transaction('assets').objectStore('assets').get(id);q.onsuccess=()=>resolve(q.result||null);q.onerror=()=>reject(q.error);});}catch{return null;}
}
function draft(kind,ctx){
  return {title:ctx.title||'',plan:ctx.plan||'',prompt:ctx.prompt||'',prediction:ctx.prediction||'',mode:kind==='video'?'videoAI':'sketch',sourceImageId:ctx.sourceImageId||'',background:'paper',strokes:[],baseId:null,camera:'auto',revisionReason:'',parentVersion:null};
}
function references(){
  const local=getMakerProjects().filter(p=>p.kind==='image').flatMap(p=>p.versions.map(v=>({projectId:p.id,versionId:v.id,title:v.title||p.title,prompt:v.prompt,number:v.number,assetId:v.assetId,createdAt:v.createdAt})));
  const older=getMediaProjects().filter(p=>p.kind==='image').flatMap(p=>p.versions.map(v=>({projectId:p.id,versionId:v.id,title:v.title||p.title,prompt:v.plan,number:v.number,assetId:null,createdAt:v.createdAt,legacy:true,design:v.design})));
  return [...local,...older].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
}
async function referenceBlob(src){
  if(src?.demo){const r=await fetch(demoImage);if(!r.ok)throw Error('예시 이미지를 열 수 없어요.');return r.blob();}
  if(src?.schoolAsset){const res=await fetch('/api/school/projects/'+encodeURIComponent(src.projectId)+'/asset/'+encodeURIComponent(src.schoolAsset),{cache:'no-store'});if(!res.ok)throw Error('수업 프로젝트에서 이미지 파일을 열 수 없어요.');return res.blob();}
  if(!src)return null;
  if(src.legacy&&src.design){const c=canvas(720,405);renderMediaFrame(c,src.design);return blobFromCanvas(c);}
  return getMakerAsset(src.assetId);
}
async function bitmap(blob){
  if(!blob)throw Error('이 브라우저에서 원본 파일을 찾을 수 없어요.');
  if(globalThis.createImageBitmap)return createImageBitmap(blob);
  return new Promise((resolve,reject)=>{const url=URL.createObjectURL(blob),img=new Image();img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('이미지를 읽을 수 없어요.'));};img.src=url;});
}
async function api(path,options={}){
  if(!/^https?:$/.test(location.protocol))throw Error('로컬 서버 주소로 열면 생성 모델에 연결할 수 있어요.');
  const res=await fetch(path,{cache:'no-store',...options});
  const data=await res.json().catch(()=>({}));if(!res.ok){const err=Error(data.error||'로컬 서버 응답을 받지 못했어요.');err.status=res.status;throw err;}return data;
}
function drawBase(ctx,d,base){
  const w=ctx.canvas.width,h=ctx.canvas.height;ctx.fillStyle='#fffdf9';ctx.fillRect(0,0,w,h);
  if(base){const k=Math.min(w/base.width,h/base.height);ctx.drawImage(base,(w-base.width*k)/2,(h-base.height*k)/2,base.width*k,base.height*k);}
  else if(d.background!=='paper'){
    const colors={sunset:['#eda88f','#ffe9c4','#b7a0b8','#785e89'],night:['#283652','#68759a','#526182','#324562'],meadow:['#b4deec','#f6f1ce','#aac5ac','#81a99f']}[d.background]||['#fff','#ddd','#bbb','#999'];
    const grad=ctx.createLinearGradient(0,0,0,h);grad.addColorStop(0,colors[0]);grad.addColorStop(1,colors[1]);ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);
    ctx.beginPath();ctx.arc(w*.72,h*.33,h*.105,0,Math.PI*2);ctx.fillStyle=d.background==='night'?'#e3e7d9':'#ffeca8';ctx.fill();
    [[.71,.34,.78,colors[2]],[.84,.56,.86,colors[3]]].forEach(([low,high,end,color])=>{ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,h*low);ctx.bezierCurveTo(w*.32,h*high,w*.6,h*end,w,h*(low-.08));ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.fill();});
  }
}
function stroke(ctx,s){
  const w=ctx.canvas.width,h=ctx.canvas.height,points=s.points;
  if(!points.length)return;
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=ctx.fillStyle=s.color;ctx.lineWidth=s.size*w/960;ctx.beginPath();ctx.moveTo(points[0][0]*w,points[0][1]*h);
  if(points.length===1){ctx.arc(points[0][0]*w,points[0][1]*h,ctx.lineWidth/2,0,Math.PI*2);ctx.fill();}
  else{points.slice(1).forEach(pt=>ctx.lineTo(pt[0]*w,pt[1]*h));ctx.stroke();}
  ctx.restore();
}
function motionFrom(prompt,setting){
  if(setting!=='auto')return setting;
  if(/왼\s*쪽|왼편|\bleft\b/i.test(prompt))return 'left';
  if(/오른\s*쪽|오른편|\bright\b/i.test(prompt))return 'right';
  if(/고정|가만|멈[추춰]|정지|\bstill\b/i.test(prompt))return 'still';
  if(/다가|가까|확대|줌|크게|\bzoom\b/i.test(prompt))return 'closer';
  return null;
}
async function recordMotion(blob,camera,progress){
  const img=await bitmap(blob), w=img.width, h=img.height, k=Math.min(1,960/Math.max(w,h));
  const c=canvas(Math.max(2,Math.round(w*k/2)*2),Math.max(2,Math.round(h*k/2)*2)),cx=c.getContext('2d');
  const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/mp4','video/webm'].find(t=>globalThis.MediaRecorder?.isTypeSupported(t));
  let stream,rec,timer;
  function frame(t){
    const ease=t*t*(3-2*t),z=camera==='still'?1:1+ease*(camera==='closer'?.28:.18);
    const pos=camera==='left'?0:camera==='right'?1:.5;
    cx.drawImage(img,(c.width-c.width*z)*pos,(c.height-c.height*z)*.5,c.width*z,c.height*z);
  }
  try{
    if(!mime||!c.captureStream)throw Error('애니매틱 녹화는 Chrome 또는 Edge에서 열어 주세요.');
    frame(0);stream=c.captureStream(24);rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:2200000});
    return await new Promise((resolve,reject)=>{
      const chunks=[];rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};rec.onerror=()=>reject(Error('동영상을 기록하지 못했어요.'));rec.onstop=()=>chunks.length?resolve(new Blob(chunks,{type:mime})):reject(Error('동영상 파일이 비어 있어요.'));
      rec.start();const at=performance.now();function tick(){const t=Math.min(1,(performance.now()-at)/3000);frame(t);progress(t);if(t>=1)rec.stop();else timer=setTimeout(tick,1000/24);}tick();
    });
  }finally{clearTimeout(timer);if(rec?.state==='recording')rec.stop();stream?.getTracks().forEach(t=>t.stop());img.close?.();}
}
const field=(key,label,val,hint,rows=2)=>`<label class="mk-lab"><span>${label}</span><textarea data-key="${key}" rows="${rows}" maxlength="2600" placeholder="${esc(hint)}">${esc(val)}</textarea></label>`;
const options=(items,value)=>Object.entries(items).map(([id,label])=>`<option value="${id}" ${value===id?'selected':''}>${esc(label)}</option>`).join('');
const button=(key,label,cls='mk-secondary',other='')=>`<button type="button" data-action="${key}" class="${cls}" ${other}>${label}</button>`;
const safeMode=(mode,kind)=>Object.hasOwn(modes,mode)?modes[mode]:mediaName(kind);
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
const extension=mime=>mime.includes('webm')?'webm':mime.includes('mp4')?'mp4':mime.includes('webp')?'webp':mime.includes('jpeg')?'jpg':mime.includes('gif')?'gif':'png';

export function mountMaker(element,kind='image',ctx={}){
  kind=kind==='video'?'video':'image';
  const video=kind==='video',all=getMakerProjects().filter(p=>p.kind===kind).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const existing=all.find(p=>p.id===ctx.projectId)||(!ctx.createNew&&!ctx.projectId&&!ctx.sourceImageId&&!ctx.dialogueId?all[0]:null);
  const project=existing||{id:ctx.projectId||uid(),kind,title:ctx.title||('나의 '+mediaName(kind)),dialogueId:ctx.dialogueId||null,dialogueVersionId:ctx.dialogueVersionId||null,createdAt:now(),updatedAt:now(),versions:[],draft:draft(kind,ctx)};
  const root=document.createElement('div');root.className='mk';element.replaceChildren(root);
  let active=true,busy=false,paintId=0,pendingMonitor=false,status=null,toolColor=inkColors[0],brush=7,base=null,baseId=null,routeBlob=null,pointer=null,selected=project.versions.find(v=>v.id===ctx.versionId);
  let view=selected||(!project.draft&&project.versions.at(-1))?'review':'edit',selectedId=selected?.id||project.versions.at(-1)?.id;
  let statusText='',previewUrl='',mediaVolatile=false,selectReadyImageModel=!video&&!existing;
  const current=()=>project.versions.find(v=>v.id===selectedId)||project.versions.at(-1);
  const $=selector=>root.querySelector(selector);
  const stopUrl=()=>{if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl='';};
  let classroomImages=[];const sourceList=()=>[...references(),...classroomImages,{versionId:'dol-example-boat',projectId:'paperboat',assetId:null,demo:true,title:'연구소 예시 · 노란 종이배',number:1}];
  const source=()=>sourceList().find(s=>s.versionId===project.draft?.sourceImageId);
  const storageMessage=()=>tempData||mediaVolatile?'일부 기록은 이 창에만 있어요. 작품 파일을 내려받아 주세요.':'이 브라우저에 저장';
  function persist(){write(project);if($('[data-store]'))$('[data-store]').textContent=storageMessage();}
  function notice(msg){statusText=msg;if(active&&$('[data-msg]'))$('[data-msg]').textContent=msg;}
  function syncButtons(){for(const control of root.querySelectorAll('[data-busy],[data-key],[data-brush],[data-upload],[data-action="mode"]'))control.disabled=busy;}
  function setBusy(value){busy=value;syncButtons();}
  async function checkStatus(){
    if(!active)return;
    try{status=await api('/api/status',{signal:AbortSignal.timeout(6500)});}catch{status={};}
    if(!active)return;
    if(selectReadyImageModel&&status?.image?.ready&&project.draft?.mode==='sketch'){
      selectReadyImageModel=false;project.draft.mode='imageAI';render();
    }else showService();
    selectReadyImageModel=false;
  }
  function showService(){
    const el=$('[data-service]');if(!el)return;
    const cfg=status?.[kind],ready=cfg?.ready===true;
    el.innerHTML=`<div><strong>${status===null?'로컬 모델 확인 중':ready?'로컬 생성 모델 연결됨':'로컬 생성 모델 연결 대기'}</strong><p>${esc(cfg?.detail || (status===null?'이 컴퓨터의 생성 엔진을 확인하고 있어요.':'이 컴퓨터에서 ComfyUI와 생성 모델을 실행하면 AI 생성을 사용할 수 있어요.'))}</p></div>${button('status','다시 확인','mk-link')}`;
    const ai=$('[data-action="create"]');if(ai&&project.draft?.mode.endsWith('AI'))ai.disabled=busy||!ready;
  }
  function controls(d,refs){
    const formTitle=video?'영상 설계':'이미지 설계';
    const parent=project.versions.find(v=>v.number===d.parentVersion);
    const modesFor=video?[['videoAI','AI 영상 생성'],['animatic','카메라 애니매틱']]:[['sketch','직접 그리기'],['imageAI','AI 이미지 생성']];
    const refSelect=video?`<div class="mk-ref"><label class="mk-lab"><span>첫 프레임 이미지</span><select data-key="sourceImageId" aria-label="첫 프레임 이미지"><option value="">이미지 공방에서 만든 작품 선택</option>${refs.map(r=>`<option value="${esc(r.versionId)}" ${r.versionId===d.sourceImageId?'selected':''}>${esc(r.title)} · v${r.number}</option>`).join('')}</select></label>${refs.length?'':button('image','이미지 공방 열기','mk-link')}</div>`:'';
    return `<section class="mk-panel"><div class="mk-panel-head"><h2>${formTitle}</h2><span class="mk-ver">버전 ${project.versions.length+1}</span></div>
      ${project.dialogueId?`<p class="mk-origin">생각 대화에서 가져온 계획</p>`:''}
      <label class="mk-lab"><span>작품 이름</span><input data-key="title" maxlength="80" value="${esc(d.title)}" placeholder="${video?'나의 짧은 영화':'내가 상상한 장면'}"></label>
      ${refSelect}${video&&source()?.prompt?`<details class="mk-details"><summary>원본 이미지의 프롬프트</summary><p>${esc(source().prompt)}</p></details>`:''}${d.plan?`<details class="mk-details"><summary>대화에서 정한 계획</summary><p>${esc(d.plan)}</p></details>`:''}
      ${field('prompt',video?'영상 프롬프트':'그림 프롬프트',d.prompt,video?'무엇이 어떻게 움직일까요? 카메라는 어디를 바라볼까요?':'어떤 장면을 그리고 싶나요? 색, 빛, 중요한 대상을 적어 보세요.',3)}
      ${field('prediction','어떤 결과를 예상하나요?',d.prediction,video?'움직임이 시작되면 무엇이 먼저 눈에 들어올까요?':'보는 사람이 가장 먼저 알아차릴 부분은 무엇인가요?')}
      ${parent?`<details class="mk-details"><summary>버전 ${parent.number}의 관찰과 피드백</summary><p>${esc([parent.observation,parent.feedback,parent.teacherFeedback].filter(Boolean).join('\n'))}</p></details>`+field('revisionReason','무엇을 왜 바꾸나요?',d.revisionReason,'지난 결과나 피드백에서 떠올린 변화를 적어요.'):''}
      <fieldset class="mk-fieldset"><legend>제작 방식</legend><div class="mk-seg">${modesFor.map(([key,label])=>button('mode',label,'mk-mode',`data-value="${key}" aria-pressed="${d.mode===key}"`)).join('')}</div></fieldset>
      ${d.mode.endsWith('AI')?'<div class="mk-service" data-service></div>':d.mode==='animatic'?`<label class="mk-lab"><span>카메라 움직임</span><select data-key="camera">${options(cameras,d.camera)}</select></label><p class="mk-hint">원본 이미지를 3초 동안 이동하거나 확대해 카메라 구도를 시험해요. 프롬프트에 ‘왼쪽’, ‘오른쪽’, ‘가까이’, ‘고정’을 써도 돼요.</p>`:'<p class="mk-hint">옆의 그림판에 직접 그리거나 가지고 있는 이미지를 불러와요.</p>'}
      ${d.mode.endsWith('AI')?'<label class="mk-translate"><input type="checkbox" data-translate '+(d.translate===false?'':'checked')+'> 대화 모델이 연결되면 한국어 프롬프트를 영어로 옮겨 생성하기</label>':''}
      <div class="mk-actions">${button('create',d.mode==='sketch'?'이 그림으로 버전 저장':d.mode==='animatic'?'애니매틱 영상 만들기':mediaName(kind)+' 생성하기','mk-primary','data-busy')}</div>
    </section>`;
  }
  function canvasPanel(d){
    return `<section class="mk-panel mk-screen"><div class="mk-panel-head"><h2>${video?'첫 프레임':d.mode==='sketch'?'그림판':'이미지 미리보기'}</h2>${!video&&d.mode==='sketch'?'<span class="mk-small">16 ∶ 9</span>':''}</div>
    <div class="mk-stage" data-stage>${!video&&d.mode==='sketch'?'<canvas data-draw width="960" height="540" aria-label="그림판. 마우스나 손가락으로 선을 그리세요."></canvas>':`<p class="mk-placeholder">${video?'이미지를 선택하면 영상의 첫 프레임이 보여요.':'생성을 마치면 여기에 이미지가 나타나요.'}</p>`}</div>
    ${!video&&d.mode==='sketch'?`<div class="mk-tools"><label>배경 <select data-key="background">${options(backgrounds,d.background)}</select></label><label class="mk-upload">이미지 불러오기<input type="file" accept="image/png,image/jpeg,image/webp" data-upload></label>${button('sample','돛단배 밑그림','mk-link')}${d.baseId?button('clearbase','밑그림 빼기','mk-link'):''}</div>
    <div class="mk-tools"> <div class="mk-swatches" aria-label="붓 색">${inkColors.map(c=>button('color','', 'mk-swatch',`style="--c:${c}" data-color="${c}" aria-label="${({'#243348':'남색','#395ad3':'파랑','#c46aa0':'자주','#ef9548':'주황','#7bbca5':'민트','#fff9e8':'크림'})[c]}" aria-pressed="${c===toolColor}"`)).join('')}</div><label>붓 굵기 <select data-brush>${options({3:'가는 선',7:'보통',16:'굵은 선'},String(brush))}</select></label>${button('undo','선 되돌리기','mk-link','data-busy')}</div>`:''}</section>`;
  }
  function reviewPanels(v){
    return `<section class="mk-panel"><div class="mk-panel-head"><h2>작품과 비교해 보기</h2><span class="mk-ver">버전 ${v.number}</span></div>
    <dl class="mk-notes">${v.source?`<dt>첫 프레임</dt><dd>${esc(v.source.title)} · v${v.source.number}</dd>`:''}<dt>사용한 프롬프트</dt><dd>${esc(v.prompt)}</dd><dt>나의 예상</dt><dd>${esc(v.prediction)}</dd>${v.revisionReason?`<dt>수정한 이유</dt><dd>${esc(v.revisionReason)}</dd>`:''}</dl>
    ${v.enginePrompt && v.enginePrompt!==v.prompt?`<details class="mk-details"><summary>모델에 전달한 영어 프롬프트</summary><p>${esc(v.enginePrompt)}</p></details>`:''}
    ${field('observation','예상과 결과는 어떻게 달랐나요?',v.observation,'작품에서 발견한 구체적인 점을 하나 적어 보세요.')}
    ${field('feedback','다음에는 어떤 점을 시험해 볼까요?',v.feedback,'내 생각이나 함께 본 친구의 의견을 적어요.')}
    ${v.teacherFeedback?`<p class="mk-feedback"><strong>선생님의 질문</strong> ${esc(v.teacherFeedback)}</p>`:''}
    <div class="mk-actions">${button('save','관찰 기록 저장')}${project.draft?button('resume','작성 중인 버전 열기','mk-primary'):v.id===project.versions.at(-1)?.id?button('revise','다음 버전 만들기','mk-primary'):''}</div></section>`;
  }
  function resultPanel(v){
    return `<section class="mk-panel mk-screen"><div class="mk-panel-head"><h2>${esc(v.title)}</h2><span class="mk-small">${safeMode(v.mode,kind)}</span></div><div class="mk-stage" data-stage><p class="mk-placeholder">작품을 불러오는 중이에요.</p></div><div class="mk-actions">${button('download','파일 내려받기')}${!video?button('tovideo','이 이미지로 영상 만들기','mk-primary'):''}</div></section>`;
  }
  function draw(){
    const c=$('[data-draw]'),d=project.draft;if(!c||!d)return;
    const pen=c.getContext('2d');drawBase(pen,d,base);d.strokes.forEach(s=>stroke(pen,s));if(pointer)stroke(pen,pointer.stroke);
  }
  async function preview(token){
    const stage=$('[data-stage]');if(!stage)return;
    try{
      if(view==='edit'&&!video){
        const d=project.draft;if(d.mode!=='sketch')return;
        if(d.baseId!==baseId){const img=d.baseId?await bitmap(await getMakerAsset(d.baseId)):null;if(token!==paintId||!active){img?.close?.();return;}base?.close?.();base=img;baseId=d.baseId;}
        draw();return;
      }
      let blob;
      if(view==='review')blob=await getMakerAsset(current().assetId);
      else{const src=source();if(!src)return;blob=await referenceBlob(src);}
      if(token!==paintId||!active)return;
      if(!blob)throw Error('이 브라우저에서 작품 파일을 찾을 수 없어요.');
      routeBlob=blob;previewUrl=URL.createObjectURL(blob);const playable=view==='review'&&video;
      const media=document.createElement(playable?'video':'img');if(playable){media.controls=true;media.playsInline=true;media.preload='metadata';}else media.alt=view==='review'?'이 버전에서 만든 이미지':'영상에 사용할 원본 첫 프레임';
      media.src=previewUrl;stage.replaceChildren(media);
    }catch(e){if(active&&token===paintId){stage.textContent=e.message;notice(e.message);}}
  }
  function render(){
    if(!active)return;
    const token=++paintId;stopUrl();routeBlob=null;
    const d=project.draft,v=current(),refs=video?sourceList():[];
    if(!v)view='edit';if(!d)view='review';
    if(view==='edit'&&d.pending){root.innerHTML=`<div class="mk-back">${button('home','작업실 홈','mk-link')}</div><section class="mk-panel mk-wait"><h1>${mediaName(kind)} 생성 중</h1><p>${esc(d.prompt)}</p><p role="status" data-msg>로컬 생성 작업을 확인하는 중이에요.</p>${button('poll','진행 상태 확인','mk-secondary')}${button('abandon','생성 요청 취소','mk-link')}</section>`;return;}
    const projects=getMakerProjects().filter(p=>p.kind===kind);
    root.innerHTML=`<div class="mk-back">${button('home','작업실 홈','mk-link')}<span data-store>${storageMessage()}</span></div>
      <header class="mk-head"><div><h1>${video?'영상 작업실':'이미지 공방'}</h1><p>${video?'내 이미지에서 출발해, 움직임과 카메라를 프롬프트로 연출해요.':'내가 생각한 장면을 그리고, 프롬프트와 함께 한 버전으로 남겨요.'}</p></div>
      <div class="mk-project-menu">${projects.length?`<select data-project aria-label="작품 고르기"><option value="">내 작품 고르기</option>${projects.map(p=>`<option value="${esc(p.id)}" ${p.id===project.id?'selected':''}>${esc(p.title)}</option>`).join('')}</select>`:''}${button('new','새 작품','mk-secondary')}</div></header>
      <div class="mk-layout"><div>${view==='edit'?controls(d,refs):reviewPanels(v)}</div><div>${view==='edit'?canvasPanel(d):resultPanel(v)}
      ${project.versions.length?`<section class="mk-panel mk-history"><h2>작품 버전</h2><div>${project.versions.map(x=>button('version','v'+x.number,'mk-version',`data-id="${esc(x.id)}" aria-pressed="${view==='review'&&x.id===v?.id}"`)).join('')}${project.draft?button('resume','작성 중','mk-version',`aria-pressed="${view==='edit'}"`):''}</div></section>`:''}</div></div><p role="status" aria-live="polite" class="mk-message" data-msg>${esc(statusText)}</p>`;
    syncButtons();showService();void preview(token);
  }
  function requireText(key,msg){const el=$('[data-key="'+key+'"]');if(!el?.value.trim()){notice(msg);el?.focus();return false;}return true;}
  function learnDraft(d){return {background:d.background,baseId:d.baseId,strokes:copy(d.strokes),camera:d.camera};}
  async function storeVersion(blob,d,origin,jobId){
    if(!blob?.size)throw Error('생성된 파일이 비어 있어요.');
    const assetId=jobId?'job-'+project.id+'-'+jobId:uid(),stored=await putAsset(assetId,blob);if(!stored)mediaVolatile=true;
    const latest=getMakerProjects().find(p=>p.id===project.id);
    if(jobId&&latest?.versions.some(v=>v.jobId===jobId)){Object.assign(project,latest);selectedId=latest.versions.find(v=>v.jobId===jobId).id;view='review';render();return;}
    if(latest)project.versions=latest.versions;
    const ref=origin?{projectId:origin.projectId,versionId:origin.versionId,number:origin.number,title:origin.title,prompt:origin.prompt||'',assetId:origin.assetId,schoolAsset:origin.schoolAsset||null}:null;
    const v={id:uid(),number:project.versions.length+1,createdAt:now(),title:d.title.trim()||('나의 '+mediaName(kind)),plan:d.plan,prompt:d.prompt.trim(),prediction:d.prediction.trim(),revisionReason:d.revisionReason.trim(),parentVersion:d.parentVersion,mode:d.mode,mime:blob.type,source:ref,assetId,observation:'',feedback:'',teacherFeedback:'',design:learnDraft(d),jobId:jobId||null,dialogueId:project.dialogueId,dialogueVersionId:project.dialogueVersionId};
    if(d.enginePrompt)v.enginePrompt=d.enginePrompt;
    project.title=v.title;project.versions.push(v);project.draft=null;selectedId=v.id;view='review';persist();statusText=stored?'새 버전을 저장했어요. 예상과 비교해 보세요.':'이 창에서 작품을 볼 수 있어요. 작품 파일을 내려받아 주세요.';render();call('labchange',{source:'maker',projectId:project.id});
  }
  async function poll(){
    const d=project.draft;if(!d?.pending||pendingMonitor)return;
    const pending=d.pending;pendingMonitor=true;
    try{
      while(active&&project.draft?.pending?.id===pending.id){
        const info=await api('/api/jobs/'+encodeURIComponent(pending.id),{signal:AbortSignal.timeout(12000)});
        if(!active||project.draft?.pending?.id!==pending.id)return;
        if(info.status==='completed'){
          const path='/api/jobs/'+encodeURIComponent(pending.id)+'/output';
          if(info.url!==path)throw Error('생성 결과의 주소를 확인할 수 없어요.');
          const res=await fetch(path,{cache:'no-store'});if(!res.ok)throw Error('완성된 작품을 아직 가져올 수 없어요. 진행 상태를 다시 확인해 주세요.');
          const out=await res.blob();
          if(!out.type.startsWith(video?'video/':'image/'))throw Error('생성 모델의 출력 형식을 확인해 주세요.');
          if(active&&project.draft?.pending?.id===pending.id){d.enginePrompt=info.enginePrompt;await storeVersion(out,d,source(),pending.id);}return;
        }
        if(info.status==='failed'||info.status==='canceled'){d.pending=null;persist();render();throw Error(info.message||'로컬 모델에서 생성을 완료하지 못했어요.');}
        if(!['queued','running'].includes(info.status))throw Error('작업 상태를 확인할 수 없어요.');
        notice(info.status==='queued'?'내 컴퓨터의 생성 대기열에서 기다리고 있어요.':'로컬 모델이 작품을 생성하고 있어요.');await wait(1400);
      }
    }catch(e){if(active&&project.draft){if(e.status===404){project.draft.pending=null;persist();render();}notice(e.message||'진행 상태를 읽을 수 없어요.');}}
    finally{pendingMonitor=false;}
  }
  function changed(d){
    const parent=project.versions.find(v=>v.number===d.parentVersion);
    if(!parent)return true;
    return ['prompt','prediction','mode'].some(k=>String(d[k]).trim()!==String(parent[k]).trim())||
      (video?d.camera!==parent.design.camera||d.sourceImageId!==parent.source?.versionId:
        d.mode==='sketch'&&JSON.stringify(learnDraft(d))!==JSON.stringify(parent.design));
  }
  async function create(){
    const d=project.draft;if(!d||busy||d.pending)return;
    if(video&&!source()){notice('영상의 첫 프레임이 될 이미지를 골라 주세요.');$('[data-key="sourceImageId"]')?.focus();return;}
    if(!requireText('prompt','먼저 만들고 싶은 모습을 프롬프트에 적어 주세요.'))return;
    
    if(!changed(d)){notice('지난 버전과 비교할 수 있도록 프롬프트, 예상이나 작품 설계를 하나 바꿔 주세요.');return;}
    if(d.mode==='sketch'&&!d.baseId&&!d.strokes.length&&d.background==='paper'){notice('그림판에 선을 그리거나, 배경 또는 이미지를 골라 주세요.');return;}
    const camera=d.mode==='animatic'?motionFrom(d.prompt,d.camera):null;
    if(d.mode==='animatic'&&!camera){notice('프롬프트에서 카메라 방향을 찾지 못했어요. 원하는 움직임을 선택해 주세요.');$('[data-key="camera"]')?.focus();return;}
    const frozen=copy(d),src=video?source():null;
    setBusy(true);
    try{
      let out;
      if(frozen.mode==='sketch'){
        const img=frozen.baseId?await bitmap(await getMakerAsset(frozen.baseId)):null;
        const c=canvas(),pen=c.getContext('2d');try{drawBase(pen,frozen,img);frozen.strokes.forEach(s=>stroke(pen,s));}finally{img?.close?.();}
        out=await blobFromCanvas(c);
      }else if(frozen.mode==='animatic'){
        const img=await referenceBlob(src);if(!img)throw Error('첫 프레임 파일을 찾을 수 없어요.');
        out=await recordMotion(img,camera,t=>notice('카메라 애니매틱을 기록하는 중이에요. '+Math.round(t*100)+'%'));
      }else{
        if(status?.[kind]?.ready!==true)throw Error('로컬 생성 모델을 연결한 뒤 다시 확인해 주세요.');
        const request={kind,schoolProjectId:ctx.schoolProjectId||null,requestId:(d.requestId||=uid()),prompt:frozen.prompt,translate:frozen.translate!==false};
        if(video){
          let blob=await referenceBlob(src);if(!blob)throw Error('첫 프레임 파일을 찾을 수 없어요.');
          if(blob.type!=='image/png'){const img=await bitmap(blob);try{const c=canvas(img.width,img.height);c.getContext('2d').drawImage(img,0,0);blob=await blobFromCanvas(c);}finally{img.close?.();}}
          request.image=await asDataURL(blob);
        }
        persist();const submit=()=>api('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});let result;try{result=await submit();}catch(e){if(e.status!==428)throw e;result=await submit();}
        if(!result.id)throw Error('로컬 모델에서 작업 번호를 받지 못했어요.');
        frozen.pending={id:result.id};project.draft=frozen;persist();render();void poll();return;
      }
      await storeVersion(out,frozen,src);
    }catch(error){notice(error.message||'작품을 만들지 못했어요. 다시 시도해 주세요.');}
    finally{setBusy(false);showService();}
  }
  async function addBase(blob){
    const id=uid(),durable=await putAsset(id,blob);if(!active||!project.draft)return;
    if(!durable)mediaVolatile=true;project.draft.baseId=id;persist();render();
  }
  async function upload(file){
    if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>16*1024*1024){notice('16MB 이하의 PNG, JPG 또는 WebP 이미지를 골라 주세요.');return;}
    try{const img=await bitmap(file);try{const k=Math.min(1,1440/Math.max(img.width,img.height)),c=canvas(Math.max(1,Math.round(img.width*k)),Math.max(1,Math.round(img.height*k)));c.getContext('2d').drawImage(img,0,0,c.width,c.height);await addBase(await blobFromCanvas(c));}finally{img.close?.();}}catch{notice('이미지 파일을 열지 못했어요.');}
  }
  async function action(btn){
    const a=btn?.dataset.action;if(!a)return;
    selectReadyImageModel=false;
    if(a==='home'){call('labhome');return;}
    if(a==='status'){void checkStatus();return;}
    if(a==='poll'){void poll();return;}
    if(a==='abandon'&&project.draft?.pending){try{await api('/api/jobs/'+encodeURIComponent(project.draft.pending.id),{method:'DELETE'});project.draft.pending=null;delete project.draft.requestId;persist();statusText='요청을 취소했어요. 프롬프트를 다시 편집할 수 있어요.';render();}catch(e){notice(e.message);}return;}
    if(busy)return;
    if(a==='new'||a==='image'){call('labopen',{type:'maker',kind:a==='image'?'image':kind,createNew:true});return;}
    if(a==='create'){void create();return;}
    const v=current(),d=project.draft;
    if(a==='mode'&&d){d.mode=btn.dataset.value;persist();statusText='';render();return;}
    if(a==='version'){selectedId=btn.dataset.id;view='review';statusText='';render();return;}
    if(a==='resume'&&d){view='edit';statusText='';render();return;}
    if(a==='color'){toolColor=btn.dataset.color;root.querySelectorAll('[data-color]').forEach(x=>x.setAttribute('aria-pressed',String(x===btn)));return;}
    if(a==='undo'&&d){d.strokes.pop();persist();draw();return;}
    if(a==='clearbase'&&d){d.baseId=null;persist();render();return;}
    if(a==='sample'&&d){try{const {paintLake}=await import('./art-studio.mjs');const c=canvas();paintLake(c,0);await addBase(await blobFromCanvas(c));}catch{notice('밑그림을 열지 못했어요.');}return;}
    if(a==='save'&&v){persist();notice('관찰과 다음 실험 아이디어를 저장했어요.');call('labchange',{source:'maker'});return;}
    if(a==='revise'&&v&&!d){
      if(!requireText('observation','먼저 예상과 실제 결과를 비교해 주세요.'))return;
      if(!v.feedback.trim()&&!v.teacherFeedback?.trim()){notice('다음 버전에 반영할 생각이나 피드백을 적어 주세요.');$('[data-key="feedback"]')?.focus();return;}
      project.draft={...draft(kind,{}),...copy(v.design),title:v.title,plan:v.plan,prompt:v.prompt,prediction:v.prediction,mode:v.mode,parentVersion:v.number,sourceImageId:v.source?.versionId||''};
      persist();view='edit';statusText='';render();$('[data-key="revisionReason"]')?.focus();return;
    }
    if(a==='download'&&v){const b=routeBlob||await getMakerAsset(v.assetId);if(!b){notice('작품 파일을 찾을 수 없어요.');return;}download(b,(v.title||'작품').replace(/[<>:"/\\|?*]/g,' ')+'-v'+v.number+'.'+extension(v.mime));return;}
    if(a==='tovideo'&&v){call('labopen',{type:'videoFromImage',sourceImageId:v.id,title:v.title+' · 영상',plan:v.plan,dialogueId:project.dialogueId,dialogueVersionId:project.dialogueVersionId});}
  }
  root.addEventListener('click',e=>{const b=e.target.closest('button[data-action]');if(b)void action(b);});
  root.addEventListener('input',e=>{
    selectReadyImageModel=false;
    const t=e.target,k=t.dataset.key;if(!k||busy||!t.matches('input,textarea'))return;
    if(view==='review'&&['observation','feedback'].includes(k)){current()[k]=t.value;persist();}
    if(view==='edit'&&['title','prompt','prediction','revisionReason'].includes(k)){project.draft[k]=t.value;delete project.draft.requestId;if(k==='title')project.title=t.value.trim()||'나의 '+mediaName(kind);persist();}
  });
  root.addEventListener('change',e=>{
    selectReadyImageModel=false;
    const t=e.target,d=project.draft;
    if(t.hasAttribute('data-project')&&t.value){call('labopen',{type:'maker',kind,projectId:t.value});return;}
    if(!d||busy)return;
    if(t.hasAttribute('data-translate')){d.translate=t.checked;persist();return;}
    if(t.hasAttribute('data-upload')){void upload(t.files[0]);return;}if(t.hasAttribute('data-brush')){brush=Number(t.value);return;}
    if(['camera','sourceImageId','background'].includes(t.dataset.key)){d[t.dataset.key]=t.value;if(t.dataset.key==='background')d.baseId=null;persist();render();}
  });
  function point(e,c){const r=c.getBoundingClientRect();return [Math.round(Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*1000)/1000,Math.round(Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))*1000)/1000];}
  root.addEventListener('pointerdown',e=>{
    selectReadyImageModel=false;
    const c=e.target;if(!c.matches('[data-draw]')||e.button!==0||busy||pointer)return;
    if(project.draft.strokes.length>=150){notice('이 버전의 선을 모두 사용했어요. 선을 되돌리거나 버전을 저장해 주세요.');return;}
    pointer={id:e.pointerId,stroke:{size:brush,color:toolColor,points:[point(e,c)]}};c.setPointerCapture(e.pointerId);draw();
  });
  root.addEventListener('pointermove',e=>{if(!pointer||pointer.id!==e.pointerId)return;const pts=pointer.stroke.points,p=point(e,e.target);if(pts.length<800&&(pts.at(-1)[0]!==p[0]||pts.at(-1)[1]!==p[1])){pts.push(p);draw();}});
  function endStroke(e){if(pointer?.id!==e.pointerId)return;project.draft.strokes.push(pointer.stroke);pointer=null;persist();draw();}
  root.addEventListener('pointerup',endStroke);root.addEventListener('pointercancel',endStroke);
  render();void checkStatus();if(video&&ctx.schoolProjectId)void api('/api/school/projects/'+encodeURIComponent(ctx.schoolProjectId)).then(p=>{if(!active)return;classroomImages=(p.assets||[]).filter(a=>a.mime?.startsWith('image/')).map(a=>({projectId:p.id,versionId:'school-'+a.id,schoolAsset:a.id,number:p.versions?.find(v=>v.snapshot.assetIds.includes(a.id))?.n||1,title:a.title+' · 수업 자료',prompt:a.description||'',createdAt:a.createdAt}));render();if(project.draft?.pending)void poll();}).catch(e=>notice(e.message));else if(project.draft?.pending)void poll();
  return ()=>{active=false;paintId++;stopUrl();base?.close?.();};
}

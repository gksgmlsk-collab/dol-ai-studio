import {dbName} from './workspace-data.mjs';
import {newWeb,mountWeb,webDocument,webFrame,webThumbnail} from './fab-web.mjs';
import {newMesh,mountMesh,drawMesh,meshSTL,meshThumbnail} from './fab-mesh.mjs';
import {newRobot,mountRobot,robotPlan,robotThumbnail} from './fab-robot.mjs';
const specs={web:{title:'웹사이트',description:'누가 읽을지 떠올리며 문구와 페이지 배치를 시험해요.',create:newWeb,mount:mountWeb,thumb:webThumbnail},'3d':{title:'3D 설계',description:'부품의 치수와 위치를 바꾸고 여러 방향에서 구조를 살펴봐요.',create:newMesh,mount:mountMesh,thumb:meshThumbnail},robot:{title:'발명 · 로봇',description:'모형 스위치를 누르는 장치를 설계하고 시작부터 복귀까지 시험해요.',create:newRobot,mount:mountRobot,thumb:robotThumbnail}};
const uid=()=>crypto.randomUUID?.()||'f-'+Date.now()+'-'+Math.random().toString(36).slice(2);
const clone=v=>structuredClone(v);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text=(v,m=1600)=>typeof v==='string'?v.slice(0,m):'';
const num=(v,def,min,max)=>Number.isFinite(v)?Math.max(min,Math.min(max,v)):def;
const enumOf=(v,choices,otherwise)=>choices.includes(v)?v:otherwise;
const databaseBase='dol-fabrication-v1',databases=new Map(),localFallback=new Map();
function db(name){
  if(!databases.has(name)){
    const pending=new Promise((ok,no)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>{r.result.createObjectStore('projects');r.result.createObjectStore('files');};r.onsuccess=()=>{const d=r.result;d.onversionchange=()=>{d.close();databases.delete(name);};ok(d);};r.onerror=()=>no(r.error);}).catch(error=>{databases.delete(name);throw error;});
    databases.set(name,pending);
  }
  return databases.get(name);
}
async function fetchLocal(name,bucket,key){try{const d=await db(name);return await new Promise((ok,no)=>{const r=d.transaction(bucket).objectStore(bucket).get(key);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});}catch{return localFallback.get(name+':'+bucket+':'+key);}}
async function storeLocal(name,bucket,key,val){try{const d=await db(name);await new Promise((ok,no)=>{const t=d.transaction(bucket,'readwrite');t.objectStore(bucket).put(val,key);t.oncomplete=ok;t.onerror=t.onabort=()=>no(t.error);});return true;}catch{localFallback.set(name+':'+bucket+':'+key,clone(val));return false;}}
const modelKey=(owner,project,kind)=>JSON.stringify([owner||'local',project||'personal',kind]);
const draftMeta=title=>({title,goal:'',reason:'',prediction:'',observation:'',feedback:'',origin:'student'});
function normalize(kind,r){
  const s=specs[kind].create();if(!r||typeof r!=='object')return s;
  if(kind==='web'){
    for(const k of ['title','lead','heading','text','extra','alt','purpose','audience'])s[k]=text(r[k]??s[k],1600);
    s.mode=enumOf(r.mode,['basic','code'],'basic');s.template=enumOf(r.template,['town','art','invention'],'town');s.layout=enumOf(r.layout,['stack','side'],'stack');s.color=enumOf(r.color,['sage','sky','coral','violet'],'sage');
    s.html=r.html==null?null:text(r.html,2600000);s.css=r.css==null?null:text(r.css,60000);
    s.image=/^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=\s]+$/i.test(r.image||'')?text(r.image,2200000):'';
  }else if(kind==='3d'){
    const good=[];let total=0;
    for(const p of Array.isArray(r.parts)?r.parts.slice(0,24):[]){
      if(!p||!['box','sphere','cylinder','mesh'].includes(p.type))continue;
      let triangles;if(p.type==='mesh'){if(!Array.isArray(p.triangles)||p.triangles.length>8000||(total+=p.triangles.length)>18000||!p.triangles.every(t=>Array.isArray(t)&&t.length===3&&t.every(point=>Array.isArray(point)&&point.length===3&&point.every(n=>Number.isFinite(n)&&Math.abs(n)<=2))))continue;triangles=p.triangles;}
      const axis=(k,def,min,max)=>[0,1,2].map(i=>num(p[k]?.[i],def,min,max));
      good.push({id:text(p.id,90)||uid(),type:p.type,name:text(p.name,80)||'부품',size:axis('size',12,.1,2000),pos:axis('pos',0,-5000,5000),rot:axis('rot',0,-360,360),color:/^#[\da-f]{6}$/i.test(p.color)?p.color:'#80a18a',note:text(p.note),...(triangles?{triangles}:{})});
    }
    if(Array.isArray(r.parts))s.parts=good;s.selected=s.parts.some(p=>p.id===r.selected)?r.selected:s.parts[0]?.id||'';s.link=text(r.link,600);s.description=text(r.description);
    s.view={yaw:num(r.view?.yaw,-.78,-1e6,1e6),pitch:num(r.view?.pitch,.54,-1.45,1.45),zoom:num(r.view?.zoom,1,.35,4)};
  }else{
    s.start=enumOf(r.start,['button','sensor'],'button');s.delay=num(r.delay,3,0,60);s.hold=num(r.hold,1,0,10);s.arm=num(r.arm,48,10,150);s.target=num(r.target,48,10,150);
    for(const k of ['parts','related3D','prediction','cause','changeReason','physicalNote'])s[k]=text(r[k]??s[k]);
    s.files=(Array.isArray(r.files)?r.files:[]).slice(0,8).filter(f=>f&&typeof f.id==='string').map(f=>({id:text(f.id,100),name:text(f.name,150),type:text(f.type,70),at:text(f.at,40)}));
    s.runs=(Array.isArray(r.runs)?r.runs:[]).slice(-24).filter(t=>t&&Array.isArray(t.events)).map(t=>({id:text(t.id,100),at:text(t.at,45),summary:text(t.summary,200),settings:{start:enumOf(t.settings?.start,['button','sensor'],'button'),delay:num(t.settings?.delay,0,0,60),hold:num(t.settings?.hold,0,0,10),arm:num(t.settings?.arm,48,10,150),target:num(t.settings?.target,48,10,150),related3D:text(t.settings?.related3D,100)},result:enumOf(t.result,['pressed','missed','cancelled'],'cancelled'),events:t.events.slice(0,12).map(e=>({key:text(e?.key,20),label:text(e?.label,40),seconds:num(e?.seconds,0,0,86400)}))}));
  }return s;
}
function metaOf(m,defaults){const base=draftMeta(defaults);for(const k of Object.keys(base))base[k]=text(m?.[k]??base[k],k==='title'?100:1600);return base;}
function summary(kind,s){if(kind==='web')return [s.mode==='code'?'HTML·CSS 편집':'문구·배치 편집',s.title,s.audience].filter(Boolean).join(' · ');if(kind==='3d')return s.parts.length+'개 부품'+(s.parts.length?' · '+s.parts.slice(0,4).map(p=>p.name).join(', '):'');return (s.start==='sensor'?'센서':'버튼')+' 신호 후 '+s.delay+'초 · 팔 '+s.arm+'mm / 스위치 '+s.target+'mm'+(s.runs.length?' · '+s.runs.at(-1).summary:'');}
function report(kind,s){if(kind==='web')return [s.purpose,s.audience,s.lead,s.heading].filter(Boolean);if(kind==='3d')return s.parts.slice(0,10).map(p=>p.name+' · '+p.size.map(n=>Math.round(n*10)/10).join(' × ')+' mm'+(p.note?' · '+p.note:''));return [s.prediction,s.runs.at(-1)?.summary,s.cause,s.changeReason,s.physicalNote].filter(Boolean);}
export function fabricationFile(kind,source,title='작품'){
  const s=normalize(kind,source),name=(title||specs[kind].title).replace(/[\\/:*?"<>|]/g,' ').trim().slice(0,80)||'작품';
  if(kind==='web')return new File([webDocument(s)],name+'.html',{type:'text/html'});
  if(kind==='3d')return new File([meshSTL(s)],name+'.stl',{type:'model/stl'});
  return new File([JSON.stringify(robotPlan(s),null,2)],name+'-동작계획.json',{type:'application/json'});
}
export function renderFabricationPreview(el,kind,source){
  if(!Object.hasOwn(specs,kind))return ()=>{};const s=normalize(kind,source);el.replaceChildren();
  if(kind==='web'){const f=document.createElement('iframe');f.className='fb-webframe';el.append(f);webFrame(f,s);return ()=>f.remove();}
  if(kind==='3d'){const c=document.createElement('canvas');c.width=600;c.height=360;c.className='fb-mesh';c.tabIndex=0;c.setAttribute('aria-label','회전 가능한 3D 작품. 방향키로 회전해요.');el.append(c);let pt=null;const paint=()=>drawMesh(c,s);c.onpointerdown=e=>{pt=[e.clientX,e.clientY];c.setPointerCapture(e.pointerId);};c.onpointermove=e=>{if(pt){s.view.yaw+=(e.clientX-pt[0])*.014;s.view.pitch=num(s.view.pitch-(e.clientY-pt[1])*.012,0,-1.45,1.45);pt=[e.clientX,e.clientY];paint();}};c.onpointerup=c.onpointercancel=()=>{pt=null;};c.onkeydown=e=>{const d={ArrowLeft:[-.2,0],ArrowRight:[.2,0],ArrowUp:[0,.16],ArrowDown:[0,-.16]}[e.key];if(d){e.preventDefault();s.view.yaw+=d[0];s.view.pitch=num(s.view.pitch+d[1],0,-1.45,1.45);paint();}};paint();return ()=>c.remove();}
  const img=document.createElement('img');img.alt='모형 팔과 스위치 구조';img.src=robotThumbnail(s);el.append(img);return ()=>img.remove();
}
function download(file,name=file.name){const u=URL.createObjectURL(file),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),50000);}
export function mountFabrication(el,kind,ctx={}){
  if(!Object.hasOwn(specs,kind))throw Error('지원하지 않는 제작 방식');
  const spec=specs[kind],owner=String(ctx.ownerId||ctx.userId||ctx.accountId||ctx.session?.user?.id||'local'),projectId=String(ctx.projectId||'personal'),key=modelKey(owner,projectId,kind+(ctx.draftScope?'.'+ctx.draftScope:'')),fileKey=id=>JSON.stringify([owner,projectId,id]);
  const databaseName=dbName(databaseBase),read=(bucket,k)=>fetchLocal(databaseName,bucket,k),put=(bucket,k,v)=>dbName(databaseBase)===databaseName?storeLocal(databaseName,bucket,k,v):Promise.resolve(false);
  const root=document.createElement('section');root.className='fb';root.dataset.tool=kind;el.replaceChildren(root);root.textContent='작업을 불러오는 중이에요.';
  let alive=true,doc=null,unmount=null,previewEnd=null,timer=0,saveQueue=Promise.resolve(),busy=false,selection='',changes=0,meshRefs=[];
  const $=sel=>root.querySelector(sel),msg=s=>{const n=$('[data-message]');if(n)n.textContent=s;},stamp=s=>{const n=$('[data-store]');if(n)n.textContent=s;};
  function flush(){
    clearTimeout(timer);if(!doc)return Promise.resolve();const rev=changes,value=clone(doc);saveQueue=saveQueue.then(()=>put('projects',key,value)).then(ok=>{if(alive&&rev===changes)stamp(ok?'이 브라우저에 저장됨':'이 창에서 임시 저장 중');}).catch(()=>{if(alive)stamp('이 창에서 임시 저장 중');});return saveQueue;
  }
  function dirty(){changes++;stamp('저장 중');clearTimeout(timer);timer=setTimeout(flush,180);}
  function evidenceFile(f){return read('files',fileKey(f));}
  function tools(){
    unmount?.();const previous=$('[data-tool-body]'),host=document.createElement('div');host.dataset.toolBody='';previous.replaceWith(host);
    unmount=spec.mount(host,doc.source,dirty,msg,{meshRefs,getFile:evidenceFile,putFile:async(id,f)=>{const ok=await put('files',fileKey(id),f);if(!ok)msg('시험 파일은 이 창에 임시 보관했어요.');},download});
  }
  const field=(k,label)=>'<label>'+label+'<textarea data-meta="'+k+'" rows="2" maxlength="1600">'+esc(doc.meta[k])+'</textarea></label>';
  function paint(){
    unmount?.();unmount=null;previewEnd?.();previewEnd=null;
    root.innerHTML=`<div class="fb-top"><button type="button" data-action="back">프로젝트로 돌아가기</button><span data-store>이 브라우저에 저장됨</span></div><header class="fb-hero"><div><h1>${spec.title}</h1><p>${spec.description}</p></div><div class="fb-choices"><button type="button" data-action="export">${kind==='web'?'HTML':kind==='3d'?'STL':'동작 계획'} 내려받기</button><button class="fb-primary" type="button" data-action="save">버전 저장</button></div></header>
    <div class="fb-meta"><label>작품 이름<input maxlength="100" data-meta="title" value="${esc(doc.meta.title)}"></label><details><summary>계획·결정·피드백 기록</summary><div class="fb-cols">${field('goal','무엇을 만들고 싶나요?')}${field('reason','왜 이 방법을 골랐거나 바꾸었나요?')}${field('prediction','예상한 결과')}${field('observation','실제로 발견한 점')}${field('feedback','반영하거나 다시 생각할 의견')}<label>아이디어의 출발점<select data-meta="origin">${Object.entries({student:'나',peer:'친구',ai:'AI 대화',lesson:'수업 자료'}).map(([k,v])=>'<option value="'+k+'" '+(doc.meta.origin===k?'selected':'')+'>'+v+'</option>').join('')}</select></label></div></details></div><div data-tool-body></div>
    <section class="fb-box fb-history"><h2>버전 비교·복구</h2><div data-history></div></section><details class="fb-archive"><summary>편집 가능한 설계 파일 주고받기</summary><div class="fb-choices"><button type="button" data-action="archive">설계 기록 내려받기</button><label>설계 기록 가져오기<input data-import-record type="file" accept=".json,application/json"></label></div></details><p class="fb-message" role="status" aria-live="polite" data-message></p>`;
    tools();history();dirty();
  }
  function history(){
    const n=$('[data-history]');if(!n)return;previewEnd?.();previewEnd=null;
    if(!doc.versions.length){n.innerHTML='<p class="fb-help">현재 작업을 저장하면 이곳에서 이전 작품과 비교할 수 있어요.</p>';return;}
    const v=doc.versions.find(x=>x.id===selection)||doc.versions.at(-1),idx=doc.versions.indexOf(v),prior=doc.versions[idx-1];
    const cell=(x,tag)=>'<div><strong>'+tag+'</strong><img src="'+esc(x.thumbnail)+'" alt="'+esc(x.title)+' 버전 '+x.number+' 대표 그림"><p>'+esc(x.summary)+'</p>'+(x.reason?'<small>'+esc(x.reason)+'</small>':'')+'</div>';
    n.innerHTML=`<label>살펴볼 버전<select data-history-select>${doc.versions.map(x=>'<option value="'+esc(x.id)+'" '+(v.id===x.id?'selected':'')+'>v'+x.number+' · '+esc(x.title)+'</option>').join('')}</select></label><div class="fb-compare">${prior?cell(prior,'수정 전 · v'+prior.number):''}${cell(v,'선택한 버전 · v'+v.number)}</div><div class="fb-choices"><button type="button" data-action="historical">선택한 작품 보기</button><button type="button" data-action="restore">이 버전을 새 버전으로 복구</button>${typeof ctx.onSave==='function'&&doc.links[v.id]==='failed'?'<button type="button" data-action="resend">프로젝트 저장 재시도</button>':''}${doc.recovery?'<button type="button" data-action="recovery">복구 전 초안 열기</button>':''}</div><div data-historical></div>`;
  }
  async function share(v){
    const file=fabricationFile(kind,v.source,v.title+'-v'+v.number),details=report(kind,v.source),portfolio={...v,kind,projectId,text:[v.summary,...details,v.reason,v.observation].filter(Boolean).join('\n'),file,artifact:{name:file.name,type:file.type,blob:file},attachments:[]};
    if(kind==='robot')for(const f of v.source.files){const blob=await evidenceFile(f.id);if(blob)portfolio.attachments.push(new File([blob],f.name,{type:f.type}));}
    if(typeof ctx.onSave==='function'){try{await ctx.onSave(portfolio);doc.links[v.id]='saved';msg('버전 '+v.number+'을 프로젝트에 저장했어요.');}catch(e){doc.links[v.id]='failed';msg('버전은 이 브라우저에 저장했어요. 프로젝트 저장을 다시 시도해 주세요. '+(e.message||''));}await flush();}
    else{window.dispatchEvent(new CustomEvent('labartifact',{detail:portfolio}));msg('이 브라우저에 버전 '+v.number+'을 저장했어요.');}
    if(alive)history();
  }
  async function commit(restored=null){
    if(busy)return;busy=true;
    try{
      if(kind==='3d'&&!doc.source.parts.length&&!restored){msg('내보낼 부품을 하나 이상 넣어 주세요.');return;}
      if(restored){unmount?.();unmount=null;doc.recovery={source:clone(doc.source),meta:clone(doc.meta)};doc.source=clone(restored.source);doc.meta=clone(restored.meta);doc.meta.reason='v'+restored.number+'에서 복구';}
      const meta=clone(doc.meta),source=clone(doc.source);const v={id:uid(),kind,number:(doc.versions.at(-1)?.number||0)+1,title:meta.title||spec.title,createdAt:new Date().toISOString(),reason:meta.reason,prediction:meta.prediction,observation:meta.observation,feedback:meta.feedback,meta,source,summary:summary(kind,source),thumbnail:spec.thumb(source),restoredFrom:restored?.id||null};
      doc.versions.push(v);selection=v.id;changes++;if(restored)paint();else history();await flush();await share(v);
    }catch(e){msg(e.message||'버전을 저장하지 못했어요.');}finally{busy=false;}
  }
  root.addEventListener('input',e=>{const m=e.target.dataset.meta;if(doc&&m&&Object.hasOwn(doc.meta,m)){doc.meta[m]=e.target.value;dirty();}});
  root.addEventListener('change',async e=>{
    if(e.target.hasAttribute('data-history-select')){selection=e.target.value;history();return;}
    if(e.target.hasAttribute('data-import-record')&&e.target.files[0]){
      try{const f=e.target.files[0];if(f.size>8e6)throw Error('8MB 이하의 설계 기록 파일을 골라 주세요.');const r=JSON.parse(await f.text());if(r.format!=='dol-fabrication-project'||r.kind!==kind||!r.source||r.schema!==1)throw Error('이 제작 방식에서 내보낸 설계 기록을 선택해 주세요.');
        unmount?.();unmount=null;doc.recovery={meta:clone(doc.meta),source:clone(doc.source)};doc.meta=metaOf(r.meta,spec.title);doc.source=normalize(kind,r.source);paint();msg('편집 가능한 사본을 가져왔어요. 버전으로 저장할 수 있어요.');
      }catch(err){msg(err.message);}e.target.value='';
    }
  });
  root.addEventListener('click',async e=>{
    const act=e.target.closest('[data-action]')?.dataset.action;if(!act||!doc)return;
    const v=doc.versions.find(x=>x.id===selection)||doc.versions.at(-1);
    try{
      if(act==='back'){await flush();if(typeof ctx.onBack==='function')ctx.onBack();else window.dispatchEvent(new CustomEvent('labhome'));return;}
      if(act==='save')await commit();else if(act==='restore'&&v)await commit(v);
      else if(act==='resend'&&v&&!busy){busy=true;try{await share(v);}finally{busy=false;}}
      else if(act==='recovery'&&doc.recovery){unmount?.();unmount=null;doc.source=doc.recovery.source;doc.meta=doc.recovery.meta;doc.recovery=null;paint();msg('직전 초안을 다시 열었어요.');}
      else if(act==='historical'&&v){previewEnd?.();previewEnd=renderFabricationPreview($('[data-historical]'),kind,v.source);}
      else if(act==='export')download(fabricationFile(kind,doc.source,doc.meta.title));
      else if(act==='archive')download(new File([JSON.stringify({format:'dol-fabrication-project',schema:1,kind,meta:doc.meta,source:doc.source})],spec.title+'-설계.json',{type:'application/json'}));
    }catch(err){msg(err.message||'작업을 마치지 못했어요.');}
  });
  (async()=>{
    const local=await read('projects',key),raw=ctx.initialSnapshot||ctx.snapshot;
    const projectTitle=ctx.title||spec.title+' 작품';
    doc=local&&local.kind===kind?local:{kind,source:normalize(kind,raw?.source||raw),meta:metaOf(raw?.meta,projectTitle),versions:[],links:{},recovery:null};
    doc.links||={};selection=ctx.versionId||'';
    if(kind==='robot'){
      const models=await read('projects',modelKey(owner,projectId,'3d'));meshRefs=(models?.versions||[]).map(v=>({id:v.id,number:v.number,title:v.title}));
      for(const v of ctx.relatedVersions||[])if(v.kind==='3d'&&!meshRefs.some(r=>r.id===v.id))meshRefs.push(v);
    }
    if(alive)paint();
  })().catch(()=>{if(alive)root.textContent='이 작업실의 저장 기록을 읽지 못했어요.';});
  return ()=>{unmount?.();previewEnd?.();alive=false;void flush();};
}
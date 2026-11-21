import {mountSwitchFrame} from './switch-frame.mjs';

const maxSize=32*1024*1024,allowed=/\.(html?|[cm]?js|css|json|map|png|jpe?g|gif|webp|svg|ico|bmp|avif|woff2?|ttf|otf|stl|gltf|glb|obj|mtl|bin|wasm|drc|ktx2?|hdr|exr|webm|mp4|mp3|wav|ogg)$/i;
const exact='Seokam_Switch_3D.html',esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const bytes=n=>n<1024*1024?Math.max(1,Math.round(n/1024))+' KB':(n/1024/1024).toFixed(1)+' MB';
const dataOf=f=>new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result.slice(r.result.indexOf(',')+1));r.onerror=()=>no(Error('선택한 파일을 읽을 수 없어요.'));r.readAsDataURL(f);});
async function packageFiles(list){
  const files=[],paths=new Set();let size=0;
  for(const f of list){const rel=(f.webkitRelativePath||f.name).split('/');if(f.webkitRelativePath)rel.shift();if(rel.some(s=>!s||s.startsWith('.')||s==='node_modules'||/[\\:%?#\x00-\x1f]/.test(s)))continue;
    const path=rel.join('/');if(path.length>300||!allowed.test(path))continue;if(paths.has(path))throw Error('파일 이름이 겹쳐요. 자료 폴더 전체를 선택해 주세요.');paths.add(path);files.push([path,f]);size+=f.size;}
  if(files.length>300||size>maxSize)throw Error('HTML과 필요한 자료만 모아 300개·32MB 이하로 선택해 주세요.');
  const pages=files.filter(([p,f])=>/\.html?$/i.test(p)&&f.size>0).map(x=>x[0]);
  if(!pages.length)throw Error('폴더 안에 있는 시작 HTML 또는 '+exact+' 파일을 선택해 주세요.');
  const entry=pages.find(p=>p.split('/').at(-1).toLowerCase()===exact.toLowerCase())||pages.find(p=>/^index\.html?$/i.test(p.split('/').at(-1)))||pages[0];
  return {entry,size,files:await Promise.all(files.map(async([path,f])=>({path,data:await dataOf(f)})))};
}
async function api(path,opts={}){const r=await fetch(path,{credentials:'same-origin',cache:'no-store',...opts});const value=await r.json();if(!r.ok)throw Error(value.error||'학급 원본을 열 수 없어요.');return value;}
export function mountSwitchTool(el,ctx={}){
  const root=document.createElement('section');root.className='sw';el.replaceChildren(root);
  let active=true,classId=ctx.classId||'',role=ctx.role||ctx.user?.role||'',classes=ctx.classes||[],pack=null,meta={available:false,revision:0},local=false,builtin=false;
  let generation=0,disposeViewer=null,notice='',state='loading',serverIssue='',loadedClass='',shownHint='',busy=false,fixed=null,checkedAt=0;
  const q=s=>root.querySelector(s),endpoint=()=>'/api/school/switch-source/'+encodeURIComponent(classId),isHttp=['https:','http:'].includes(location.protocol);
  const msg=text=>{notice=text;const n=q('[data-sw-status]');if(n)n.textContent=text;};
  root.innerHTML=`<header class="sw-head"><div><h1>3D 발명품</h1><p>스위치를 여러 방향에서 살펴보고, 조작을 바꾸면 어느 부분이 움직이는지 시험해 보세요.</p></div>${ctx.onBack?'<button type="button" data-sw-back>돌아가기</button>':''}</header><div class="sw-meta" data-sw-meta></div><div class="sw-stage" data-sw-stage></div><div class="sw-foot" data-sw-foot></div><p class="sw-status" aria-live="polite" role="status" data-sw-status></p>`;
  const stopViewer=()=>{disposeViewer?.();disposeViewer=null;};
  function controls(){if(!active)return;const options=classes.map(c=>'<option '+(c.id===classId?'selected':'')+' value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join('');
    q('[data-sw-meta]').innerHTML='<div><b>'+esc(pack?(local?'내 기기에서 연 원본':builtin?'기본 원본 · 교실 스위치 구동 실험대':'학급에 등록한 원본'):state==='loading'?'원본 확인 중':meta.available?'학급 원본':'원본 등록 대기')+'</b>'+(pack?' <span>'+esc(pack.entry.split('/').at(-1))+' · 파일 '+pack.files.length+'개</span>':'')+'</div>'+
    (classId&&ctx.schoolProjectId?'<small>'+esc(classes.find(c=>c.id===classId)?.name||'수업 프로젝트')+'</small>':classes.length?'<label>학급 <select data-sw-class '+(busy?'disabled':'')+'>'+options+'</select></label>':'');
    const pages=pack?.files.map(x=>x.path).filter(x=>/\.html?$/i.test(x))||[];
    q('[data-sw-foot]').innerHTML=`<div class="sw-actions">${role==='teacher'&&classId&&fixed?.available?'<button type="button" data-sw-fixed>지정한 위치의 원본 열기</button>':''}<label class="sw-file">HTML 파일 열기<input type="file" data-sw-files multiple accept=".html,.htm,.js,.mjs,.css,.json,.png,.jpg,.webp,.svg,.bin,.stl,.gltf,.glb,.wasm,.woff2"></label><label class="sw-file">자료 폴더 열기<input type="file" data-sw-files webkitdirectory multiple></label>${pack?'<button type="button" data-sw-restart>원본 다시 시작</button>':''}${local?'<button type="button" data-sw-load>'+(meta.available?'학급':'기본')+' 원본 다시 열기</button>':''}${role==='teacher'&&classId&&local?'<button type="button" class="sw-strong" data-sw-save '+(busy||loadedClass!==classId?'disabled':'')+'>'+esc(classes.find(c=>c.id===classId)?.name||'우리 반')+'에 '+(meta.available?'새 원본 등록':'원본 등록')+'</button>':''}${pack?'<button type="button" data-sw-full>화면 크게 보기</button>':''}</div>${pages.length>1&&local?'<label class="sw-entry">처음 열 HTML<select data-sw-entry>'+pages.map(p=>'<option value="'+esc(p)+'" '+(p===pack.entry?'selected':'')+'>'+esc(p)+'</option>').join('')+'</select></label>':''}<p>${role==='teacher'&&classId?'등록하면 이 학급의 학생 기기에서도 같은 원본을 열 수 있어요. ':''}별도 자바스크립트, 도면, 이미지가 있으면 HTML과 함께 담긴 폴더를 골라 주세요.</p>${pack&&local?'<details><summary>선택한 파일 '+pack.files.length+'개 · '+bytes(pack.size||0)+'</summary><ul>'+pack.files.map(f=>'<li>'+esc(f.path)+'</li>').join('')+'</ul></details>':''}${role==='teacher'&&classId?'<details><summary>교사용 원본 등록 안내</summary><p>수업 서버 PC의 <code>문서 / 카카오톡 받은 파일 / Seokam_Switch_3D.html</code>을 확인해요. 파일이 있으면 ‘지정한 위치의 원본 열기’를 눌러 먼저 조작해 보세요. 부속 자료가 있는 원본은 파일 탐색기에서 HTML과 자료가 함께 있는 폴더를 선택하세요. ‘'+esc(classes.find(c=>c.id===classId)?.name||'우리 반')+'에 원본 등록’을 누르면 이 학급에서 같은 화면이 열려요.</p>'+(!fixed?.available?'<button type="button" data-sw-check>지정한 위치 다시 확인</button>':'')+'</details>':''}${serverIssue?'<p>'+esc(serverIssue)+' '+(classId?'<button type="button" data-sw-load>다시 확인</button>':'')+'</p>':''}`;
  }
  function renderViewer(){stopViewer();const n=q('[data-sw-stage]');if(!n)return;
    if(!pack){n.innerHTML=state==='loading'?'<p class="sw-empty">학급 원본을 확인하고 있어요.</p>':'<div class="sw-empty"><h2>'+(!classId?'3D 원본 파일 열기':'학급 원본을 기다리고 있어요')+'</h2><p>'+(classId&&role!=='teacher'?'선생님이 등록하면 이 화면에서 바로 조작할 수 있어요.':'<strong>'+exact+'</strong>을 선택하면 원본의 조작 화면이 여기에 열려요.')+'</p></div>';return;}
    n.replaceChildren();shownHint='';const slot=document.createElement('div');slot.className='sw-viewport';n.append(slot);
    disposeViewer=mountSwitchFrame(slot,pack,(type,text)=>{if(!active)return;if(type==='missing'){shownHint='원본에서 찾는 자료를 함께 넣어 주세요. '+text;msg(shownHint);}else if(type==='error'){if(!shownHint){shownHint='원본 실행 메시지 · '+text;msg(shownHint);}}else if(!shownHint)msg((local?'내 기기의 원본':builtin?'교실 스위치 구동 실험대':'학급 원본')+'을 열었어요.');});
  }
  async function refreshFixed(manual=false){const id=classId;if(!active||!id||role!=='teacher'||!isHttp||!manual&&Date.now()-checkedAt<4000)return;checkedAt=Date.now();try{const fresh=await api(endpoint()+'/default-file');if(active&&classId===id){fixed=fresh;controls();if(manual)msg(fresh.available?'지정한 위치에서 원본을 찾았어요.':'지정한 위치에 아직 원본이 없어요.');}}catch(e){if(manual&&active&&classId===id)msg(e.message);}}
  const scanOnFocus=()=>{if(document.visibilityState==='visible')void refreshFixed();};window.addEventListener('focus',scanOnFocus);document.addEventListener('visibilitychange',scanOnFocus);
  async function loadClass(){const token=++generation;fixed=null;checkedAt=0;stopViewer();pack=null;local=false;builtin=false;loadedClass='';serverIssue='';state='loading';meta={available:false,revision:0};notice='';controls();renderViewer();msg('');
    if(classId&&isHttp){void refreshFixed();try{const data=await api(endpoint()+'?bundle=1');if(!active||token!==generation)return;loadedClass=classId;const {bundle,...metadata}=data;meta=metadata;pack=bundle||null;}
      catch(e){if(!active||token!==generation)return;serverIssue=e.message;}}
    if(!pack){try{const {switchOriginal}=await import('./switch-original.mjs');if(!active||token!==generation)return;pack=switchOriginal;builtin=true;}catch{if(!active||token!==generation)return;serverIssue='기본 원본 파일을 불러오지 못했어요. 페이지를 다시 열거나 원본 파일을 선택해 주세요.';}}
    state=pack?'ready':'empty';controls();renderViewer();}
  async function init(){try{if(isHttp){if(!Array.isArray(ctx.classes)){const session=await api('/api/school/me');if(!active)return;role=session.user?.role||'';classes=session.classes||[];}
      if(ctx.schoolProjectId&&!classId){const p=await api('/api/school/projects/'+encodeURIComponent(ctx.schoolProjectId));if(!active)return;classId=p.classId||'';}if(!classId&&role)classId=classes[0]?.id||'';}
      if(active)await loadClass();}catch(e){if(active){if(!ctx.schoolProjectId)await loadClass();else {serverIssue=e.message;state='empty';controls();renderViewer();}}}}
  root.onchange=async e=>{const t=e.target;if(t.matches('[data-sw-class]')){classId=t.value;void loadClass();return;}if(t.matches('[data-sw-entry]')){pack.entry=t.value;controls();renderViewer();return;}
    if(t.matches('[data-sw-files]')&&t.files.length){const id=++generation;msg('자료 파일을 읽고 있어요.');try{const next=await packageFiles([...t.files]);if(!active||id!==generation)return;if(classId&&role==='teacher'&&loadedClass!==classId){const remote=await api(endpoint());if(!active||id!==generation)return;meta=remote;loadedClass=classId;}pack=next;local=true;builtin=false;state='ready';controls();renderViewer();}catch(err){if(active&&id===generation)msg(err.message);}}};
  root.onclick=async e=>{const b=e.target.closest('button');if(!b||!active)return;
    if(b.hasAttribute('data-sw-back'))ctx.onBack?.();
    if(b.hasAttribute('data-sw-load'))void loadClass();
    if(b.hasAttribute('data-sw-check'))void refreshFixed(true);
    if(b.hasAttribute('data-sw-fixed')&&role==='teacher'&&classId){const token=++generation;b.disabled=true;try{const v=await api(endpoint()+'/default-file?open=1');if(!active||generation!==token)return;if(!v.available){fixed=null;controls();msg('지정한 위치에서 파일을 찾을 수 없어요. 파일 선택으로 열어 주세요.');return;}if(loadedClass!==classId){const remote=await api(endpoint());if(!active||generation!==token)return;meta=remote;loadedClass=classId;}pack=v.bundle;local=true;builtin=false;state='ready';controls();renderViewer();}catch(err){if(active&&generation===token)msg(err.message);}finally{b.disabled=false;}}
    if(b.hasAttribute('data-sw-restart'))renderViewer();
    if(b.hasAttribute('data-sw-full')){try{if(document.fullscreenElement)await document.exitFullscreen();else await q('[data-sw-stage]').requestFullscreen();}catch{msg('이 브라우저에서 전체 화면을 열 수 없어요.');}}
    if(b.hasAttribute('data-sw-save')&&role==='teacher'&&local&&pack&&classId&&loadedClass===classId&&!busy){const token=generation,where=classId;busy=true;controls();try{
      const res=await api(endpoint(),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({entry:pack.entry,files:pack.files,revision:meta.revision})});
      if(!active||token!==generation||classId!==where)return;meta=res;local=false;builtin=false;msg('이 학급에 원본을 등록했어요. 학생은 같은 화면에서 열 수 있어요.');
    }catch(err){if(active&&classId===where)msg(err.message);}finally{busy=false;if(active)controls();}}};
  controls();renderViewer();void init();return ()=>{active=false;generation++;window.removeEventListener('focus',scanOnFocus);document.removeEventListener('visibilitychange',scanOnFocus);stopViewer();root.onchange=root.onclick=null;root.remove();};
}
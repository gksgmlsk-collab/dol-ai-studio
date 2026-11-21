import {dbName,storage} from './workspace-data.mjs';
import {getMakerProjects,getMakerAsset} from './maker.mjs';

const wave='./assets/artwork-wave.jpg';
const museum={type:'museum',title:'가나가와 앞바다의 큰 파도',artist:'가쓰시카 호쿠사이',credit:'메트로폴리탄 미술관 · 퍼블릭 도메인 · JP1847',url:'https://www.metmuseum.org/art/collection/search/45434',date:'1830~1832년경 · 다색 목판화'};
const focuses=['색','구도','시점','분위기','공간'];
const uid=()=>crypto.randomUUID();
const esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const string=(x,max=1600)=>String(x??'').slice(0,max);
const clone=x=>structuredClone(x);
const secs=n=>Math.min(120,Math.max(1,Math.round(Number(n)||4)));
const sum=b=>b.scenes.reduce((a,s)=>a+secs(s.seconds),0);
const dataImage=s=>/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=\s]+$/.test(s||'')&&s.length<1300000;
function safeLink(s){try{const u=new URL(s);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}}
function scene(n=1){return {id:uid(),title:'장면 '+n,seconds:4,intent:'',camera:'',caption:'',prompt:'',ref:null};}
function cleanScene(raw,i){
  const s=scene(i+1);if(!raw||typeof raw!=='object')return s;
  for(const k of ['title','intent','camera','caption','prompt'])s[k]=string(raw[k],k==='title'?100:1600);
  s.id=string(raw.id,120)||s.id;s.seconds=secs(raw.seconds);
  const r=raw.ref;if(r&&['image','video'].includes(r.kind)&&r.versionId)s.ref={kind:r.kind,projectId:string(r.projectId,160),versionId:string(r.versionId,160),assetId:string(r.assetId,160),title:string(r.title,100),number:Math.max(1,Number(r.number)||1)};
  return s;
}
function board(raw={}){
  const b={id:string(raw.id,120)||uid(),title:string(raw.title,100)||'나의 영상 스토리보드',source:{...museum},focus:[],observation:'',interpretation:'',evidence:'',place:'',goal:'',feedback:'',reason:'',scenes:[]};
  if(raw.source?.type==='custom'&&dataImage(raw.source.image))b.source={type:'custom',image:raw.source.image,title:string(raw.source.title,100),artist:string(raw.source.artist,100),credit:string(raw.source.credit,300),url:safeLink(raw.source.url),date:''};
  for(const k of ['observation','interpretation','evidence','place','goal','feedback','reason'])b[k]=string(raw[k]);
  b.focus=focuses.filter(x=>Array.isArray(raw.focus)&&raw.focus.includes(x));
  b.scenes=Array.isArray(raw.scenes)&&raw.scenes.length?raw.scenes.slice(0,30).map(cleanScene):[scene(1)];
  const ids=new Set();for(const s of b.scenes){if(ids.has(s.id))s.id=uid();ids.add(s.id);}return b;
}
function storeFor(key){
  const name=dbName('dol-storyboard-v1'),fallback='dol.storyboard.'+key;let connection;
  const open=()=>connection??=new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>r.result.createObjectStore('work');r.onerror=()=>reject(r.error);r.onsuccess=()=>{r.result.onversionchange=()=>{r.result.close();connection=null;};resolve(r.result);};});
  async function transact(transform){
    if(name!==dbName('dol-storyboard-v1'))throw Error('계정이 바뀌었어요.');
    const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('work',transform?'readwrite':'readonly'),store=tx.objectStore('work'),get=store.get(key);let result;
      get.onsuccess=()=>{try{result=get.result||{draft:null,versions:[],links:{}};if(transform){result=transform(result);store.put(result,key);}}catch(e){tx.abort();reject(e);}};tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(tx.error||Error('저장소를 열지 못했어요.'));});
  }
  return {async run(transform){try{return await transact(transform);}catch(error){
    if(name!==dbName('dol-storyboard-v1'))throw error;
    const old=JSON.parse(storage.getItem(fallback)||'null')||{draft:null,versions:[],links:{}};if(!transform)return old;const next=transform(old);storage.setItem(fallback,JSON.stringify(next));return next;
  }},close(){connection?.then(db=>db.close()).catch(()=>{});}};
}
async function photo(file){if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>16*1024*1024)throw Error('16MB 이하 JPG·PNG·WebP 이미지를 골라 주세요.');
  const u=URL.createObjectURL(file),im=new Image();try{im.src=u;await im.decode();const c=document.createElement('canvas'),ratio=Math.min(1,800/Math.max(im.width,im.height));c.width=Math.max(1,Math.round(im.width*ratio));c.height=Math.max(1,Math.round(im.height*ratio));const p=c.getContext('2d');p.fillStyle='#fff';p.fillRect(0,0,c.width,c.height);p.drawImage(im,0,0,c.width,c.height);return {type:'custom',image:c.toDataURL('image/jpeg',.79),title:file.name.replace(/\.[^.]+$/,''),artist:'',credit:'',url:'',date:''};}finally{URL.revokeObjectURL(u);}}
function makerRefs(){return getMakerProjects().flatMap(p=>p.versions.filter(v=>v.assetId).map(v=>({kind:p.kind,projectId:p.id,versionId:v.id,assetId:v.assetId,title:v.title||p.title,number:v.number}))).reverse();}
const refName=r=>(r.kind==='video'?'영상':'이미지')+' · '+r.title+' v'+r.number;
const headline=b=>b.scenes.length+'개 장면 · 계획 길이 '+sum(b)+'초';
function report(b){return ['감상 작품 — '+b.source.title+' / '+[b.source.artist,b.source.credit].filter(Boolean).join(' · '),b.focus.length&&'주목한 점 — '+b.focus.join(', '),
  ...[['관찰','observation'],['해석','interpretation'],['근거','evidence'],['내가 본 장소','place'],['전하고 싶은 생각','goal']].map(([label,k])=>b[k]&&label+' — '+b[k]),...b.scenes.map((s,i)=>[i+1+'. '+s.title+' ('+s.seconds+'초)',s.intent&&'의도 — '+s.intent,s.camera&&'카메라 — '+s.camera,s.caption&&'자막 — '+s.caption,s.prompt&&'프롬프트 — '+s.prompt,s.ref&&'연결 작품 — '+refName(s.ref)].filter(Boolean).join('\n')),b.feedback&&'받은 의견 — '+b.feedback,b.reason&&'수정 이유 — '+b.reason].filter(Boolean).join('\n');}
function fileFor(b,n){return new File([JSON.stringify({format:'dol-storyboard-v1',...b},null,2)],(b.title.replace(/[\\/:*?"<>|]/g,' ').trim().slice(0,70)||'스토리보드')+'-v'+n+'.json',{type:'application/json'});}
function download(f){const u=URL.createObjectURL(f),a=document.createElement('a');a.href=u;a.download=f.name;a.click();setTimeout(()=>URL.revokeObjectURL(u),4000);}
function field(group,k,label,value,short=false,example=''){const attr='data-'+group+'="'+k+'" maxlength="'+(short?100:1600)+'" placeholder="'+esc(example)+'"';return '<label>'+label+(short?'<input '+attr+' value="'+esc(value)+'">':'<textarea rows="2" '+attr+'>'+esc(value)+'</textarea>')+'</label>';}

export function mountStoryboard(el,ctx={}){
  const key=String(ctx.schoolProjectId||'personal')+(ctx.draftScope?'.'+ctx.draftScope:''),db=storeFor(key),root=document.createElement('section');root.className='sb';el.replaceChildren(root);root.textContent='스토리보드를 불러오고 있어요.';
  const q=sel=>root.querySelector(sel),msg=s=>{const p=q('[data-sb-status]');if(p)p.textContent=s;},stamp=s=>{const p=q('[data-sb-stamp]');if(p)p.textContent=s;};
  let b,versions=[],links={},selected='',prior='',timer=0,alive=true,busy=false,saved=Promise.resolve(),refs=[],playTimer=0,playing=false,seq=0,objectUrl='',draftRevision=0;
  function persist(transform){const op=saved.then(()=>db.run(transform));saved=op.catch(()=>{});return op;}
  function draft(){clearTimeout(timer);if(!b)return Promise.resolve();const snap=clone(b),rev=draftRevision;return persist(doc=>({...doc,draft:snap})).then(()=>{if(alive&&rev===draftRevision)stamp('초안 저장됨');}).catch(()=>{if(alive)stamp('초안을 저장하지 못했어요. 파일로 보관해 주세요.');});}
  function change(){draftRevision++;stamp('저장 중');clearTimeout(timer);timer=setTimeout(draft,250);}
  function current(){return b.scenes.find(s=>s.id===selected)||b.scenes[0];}
  function stop(){clearTimeout(playTimer);playTimer=0;playing=false;const v=q('[data-sb-visual] video');if(v)v.pause();const button=q('[data-act="play"]');if(button)button.textContent='장면 순서대로 보기';}
  function free(){seq++;if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl='';}}
  function hero(){root.innerHTML=`<div class="sb-top"><button type="button" data-act="back">‹ 돌아가기</button><span data-sb-stamp>초안 저장됨</span></div><header class="sb-hero"><div><h1>미술 감상과 스토리보드</h1><p>그림에서 발견한 단서를 나의 영상 장면으로 옮겨 보세요.</p></div><div class="sb-actions"><label class="sb-pick">설계 파일 열기<input type="file" accept=".json,application/json" data-sb-import></label><button type="button" data-act="export">설계 파일 받기</button><button type="button" class="sb-primary" data-act="save">버전 저장</button></div></header><section class="sb-card"><div class="sb-heading"><h2>작품 들여다보기</h2><label class="sb-pick">내 이미지 가져오기<input type="file" accept="image/png,image/jpeg,image/webp" data-sb-photo></label></div><div class="sb-art-grid"><div data-sb-art></div><div class="sb-fields"><fieldset class="sb-focus"><legend>어디에 눈이 갔나요?</legend>${focuses.map(x=>'<button type="button" data-focus="'+x+'" aria-pressed="'+b.focus.includes(x)+'">'+x+'</button>').join('')}</fieldset>${field('board','observation','실제로 보이는 것은 무엇인가요?',b.observation,false,'색이나 모양, 위치를 하나 골라 적어요.')}${field('board','interpretation','어떤 느낌이나 이야기가 떠오르나요?',b.interpretation)}${field('board','evidence','그렇게 생각하게 한 단서는 어디에 있나요?',b.evidence)}</div></div></section>
  <section class="sb-card"><div class="sb-heading"><h2>나의 영상 기획</h2></div><div class="sb-formgrid">${field('board','title','스토리보드 이름',b.title,true)}${field('board','place','내가 살펴본 장소나 문제',b.place,true)}${field('board','goal','어떤 이야기나 변화를 보여 주고 싶나요?',b.goal)}</div></section>
  <section class="sb-card"><div class="sb-heading"><div><h2>장면 편집</h2><p data-sb-total></p></div><div class="sb-actions"><button type="button" data-act="play">장면 순서대로 보기</button><button type="button" data-act="add">＋ 장면 추가</button></div></div><div class="sb-strip" data-sb-strip role="group" aria-label="편집할 장면"></div><div class="sb-edit" data-sb-scene></div></section>
  <section class="sb-card"><div class="sb-heading"><h2>피드백과 수정</h2></div><div class="sb-formgrid">${field('board','feedback','장면을 본 친구나 선생님은 무엇을 물었나요?',b.feedback)}${field('board','reason','어떤 장면을 왜 바꾸었나요?',b.reason)}</div><div class="sb-history" data-sb-history></div></section><p data-sb-status class="sb-status" role="status" aria-live="polite"></p>`;
    art();strip();editor();history();}
  function art(){const a=b.source,custom=a.type==='custom',href=safeLink(a.url);q('[data-sb-art]').innerHTML=`<figure><img src="${esc(custom?a.image:wave)}" alt="${esc(custom?(a.title||'내가 가져온 감상 이미지'):'화면 왼쪽의 큰 파도 아래에 배 세 척이 있고 멀리 후지산이 보이는 목판화')}"><figcaption><strong>${esc(a.title||'내 이미지')}</strong><small>${esc([a.artist,a.date,a.credit].filter(Boolean).join(' · '))}</small>${href?'<a target="_blank" rel="noopener noreferrer" href="'+esc(href)+'">작품 출처 보기 ↗</a>':''}</figcaption></figure>${custom?'<details><summary>작품 이름과 출처 편집</summary><div class="sb-fields">'+field('source','title','작품 이름',a.title,true)+field('source','artist','만든 사람',a.artist,true)+field('source','credit','출처·이용 조건',a.credit,true)+field('source','url','출처 주소',a.url,true)+'</div></details><button type="button" data-act="museum">미술관 판화로 바꾸기</button>':''}`;}
  function strip(){const s=current();q('[data-sb-total]').textContent=headline(b);q('[data-sb-strip]').innerHTML=b.scenes.map((u,i)=>'<button type="button" data-select="'+esc(u.id)+'" aria-pressed="'+(s.id===u.id)+'"><b>'+String(i+1).padStart(2,'0')+'</b><span>'+esc(u.title||'이름 없는 장면')+'</span><small>'+u.seconds+'초</small></button>').join('');}
  async function media(s,autoplay){free();const n=q('[data-sb-visual]');if(!n)return;const token=seq;n.replaceChildren();
    const caption=document.createElement('span');caption.className='sb-caption';caption.textContent=s.caption;n.append(caption);
    const empty=document.createElement('p');empty.textContent=s.ref?'연결 작품을 불러오는 중이에요.':'이 장면에 연결한 이미지나 영상이 없어요.';n.prepend(empty);if(!s.ref)return;
    const blob=await getMakerAsset(s.ref.assetId);if(!alive||token!==seq)return;if(!blob){empty.textContent='이 브라우저에서 연결한 작품 파일을 찾을 수 없어요.';return;}
    objectUrl=URL.createObjectURL(blob);const asset=document.createElement(s.ref.kind==='video'?'video':'img');asset.src=objectUrl;if(s.ref.kind==='video'){asset.controls=!autoplay;asset.playsInline=true;if(autoplay){asset.muted=true;void asset.play().catch(()=>{});}}else asset.alt=s.ref.title;empty.replaceWith(asset);}
  function editor(){const s=current(),i=b.scenes.indexOf(s),opts=[...refs];if(s.ref&&!opts.some(r=>r.versionId===s.ref.versionId))opts.push(s.ref);
    q('[data-sb-scene]').innerHTML=`<div class="sb-preview"><div class="sb-visual" data-sb-visual></div><label>공방에서 저장한 작품 연결<select data-sb-ref><option value="">연결할 작품 선택</option>${opts.map(r=>'<option value="'+esc(r.versionId)+'" '+(s.ref?.versionId===r.versionId?'selected':'')+'>'+esc(refName(r))+'</option>').join('')}</select></label><div class="sb-actions"><button type="button" data-act="image">이미지 공방에서 만들기</button><button type="button" data-act="video">영상 공방에서 만들기</button></div><small>영상 공방에서 첫 이미지와 움직임을 정해 실제 영상을 만들어요.</small></div><div class="sb-fields"><div class="sb-pair">${field('scene','title','장면 이름',s.title,true)}<label>계획 시간 (초)<input type="number" min="1" max="120" data-scene="seconds" value="${s.seconds}"></label></div>${field('scene','intent','이 장면에서 무엇을 알아차리면 좋을까요?',s.intent)}${field('scene','camera','카메라 위치와 움직임',s.camera,true,'예: 낮은 위치에서 천천히 가까이')}${field('scene','caption','화면에 보일 자막',s.caption,true)}${field('scene','prompt','내가 작성한 장면 프롬프트',s.prompt)}<div class="sb-actions"><button type="button" data-act="left" ${i===0?'disabled':''}>앞으로</button><button type="button" data-act="right" ${i===b.scenes.length-1?'disabled':''}>뒤로</button><button type="button" data-act="remove" ${b.scenes.length<2?'disabled':''}>장면 지우기</button></div></div>`;void media(s,playing);}
  function showVersion(v){const z=v.source;return '<article><small>v'+v.number+' · '+esc(v.title)+'</small><p>'+esc(headline(z))+'</p><ol>'+z.scenes.map(s=>'<li><strong>'+esc(s.title)+'</strong> · '+s.seconds+'초'+(s.intent?' — '+esc(s.intent):'')+(s.camera?'<br><small>카메라 · '+esc(s.camera)+'</small>':'')+(s.caption?'<br><small>자막 · '+esc(s.caption)+'</small>':'')+(s.prompt?'<br><small>프롬프트 · '+esc(s.prompt)+'</small>':'')+'</li>').join('')+'</ol>'+(z.reason?'<p>수정 이유 · '+esc(z.reason)+'</p>':'')+'<details><summary>감상과 장면 전체 기록</summary><pre>'+esc(report(z))+'</pre></details></article>';}
  function history(){const n=q('[data-sb-history]');if(!n)return;n.innerHTML='<h3>버전 비교</h3>';if(!versions.length){n.insertAdjacentHTML('beforeend','<p>첫 버전을 저장하면 이곳에서 전후 장면을 비교할 수 있어요.</p>');return;}
    const v=versions.find(x=>x.id===prior)||versions.at(-1),idx=versions.indexOf(v);n.insertAdjacentHTML('beforeend','<label>살펴볼 버전<select data-sb-version>'+versions.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===v.id?'selected':'')+'>v'+x.number+' · '+esc(x.title)+'</option>').join('')+'</select></label><div class="sb-compare">'+(idx>0?showVersion(versions[idx-1]):'')+showVersion(v)+'</div><div class="sb-actions"><button type="button" data-act="restore">이 버전을 새 버전으로 복구</button>'+(links[v.id]==='failed'?'<button type="button" data-act="retry">프로젝트 저장 재시도</button>':'')+'</div>');}
  async function share(v){const file=fileFor(v.source,v.number),payload={...v,kind:'storyboard',file,text:report(v.source),observation:v.source.observation,feedback:v.source.feedback,prediction:v.source.goal,thumbnail:v.source.source.type==='custom'?v.source.source.image:'',meta:{artwork:v.source.source.title,artist:v.source.source.artist,sceneCount:v.source.scenes.length,duration:sum(v.source)}};
    if(typeof ctx.onSave==='function'){let state;try{await ctx.onSave(payload);state='saved';msg('버전 '+v.number+'을 프로젝트에 저장했어요.');}catch{state='failed';msg('이 브라우저에는 저장했어요. 프로젝트 저장은 다시 시도할 수 있어요.');}
      const doc=await persist(doc=>({...doc,links:{...doc.links,[v.id]:state}}));links=doc.links;if(alive)history();
    }else{window.dispatchEvent(new CustomEvent('labartifact',{detail:payload}));msg('이 브라우저에 버전 '+v.number+'을 저장했어요.');}}
  async function commit(restored){if(busy)return;busy=true;stop();clearTimeout(timer);
    try{const snap=clone(restored?.source||b),base={id:uid(),createdAt:new Date().toISOString(),title:snap.title||'나의 영상 스토리보드',summary:headline(snap),source:snap,reason:snap.reason,restoredFrom:restored?.id||null};const doc=await persist(doc=>({...doc,draft:snap,versions:[...doc.versions,{...base,number:(doc.versions.at(-1)?.number||0)+1}]}));versions=doc.versions;links=doc.links;prior=base.id;const v=versions.find(x=>x.id===base.id);
      if(restored&&alive){b=board(snap);selected=b.scenes[0].id;hero();}if(alive){stamp('초안 저장됨');history();}await share(v);
    }catch{msg('버전을 저장하지 못했어요. 설계 파일을 받아 보관해 주세요.');}finally{busy=false;}}
  function step(i){if(!alive||!playing)return;if(i>=b.scenes.length){stop();msg('스토리보드 시사회를 마쳤어요.');return;}selected=b.scenes[i].id;strip();editor();q('[data-act="play"]').textContent='시사회 멈추기';msg('시사회 · '+(i+1)+' / '+b.scenes.length+' · '+current().title);playTimer=setTimeout(()=>step(i+1),current().seconds*1000);}
  root.oninput=e=>{const t=e.target;if(t.matches('[data-board]'))b[t.dataset.board]=t.value;else if(t.matches('[data-scene]')){stop();const s=current(),k=t.dataset.scene;s[k]=k==='seconds'?secs(t.value):t.value;if(k==='caption'){const cap=q('.sb-caption');if(cap)cap.textContent=s.caption;}if(k==='seconds'||k==='title')strip();}
    else if(t.matches('[data-source]')){b.source[t.dataset.source]=t.value;const f=q('figcaption strong');if(f)f.textContent=b.source.title||'내 이미지';const sm=q('figcaption small');if(sm)sm.textContent=[b.source.artist,b.source.credit].filter(Boolean).join(' · ');}
    else return;change();};
  root.onchange=async e=>{const t=e.target;if(t.matches('[data-sb-import]')){try{const f=t.files[0];if(!f)return;if(f.size>3*1024*1024)throw Error('3MB 이하의 스토리보드 설계 파일을 골라 주세요.');const raw=JSON.parse(await f.text());if(raw.format!=='dol-storyboard-v1'||!Array.isArray(raw.scenes)||!raw.scenes.length)throw Error('스토리보드에서 받은 설계 파일을 골라 주세요.');if(!alive)return;stop();free();b=board(raw);selected=b.scenes[0].id;hero();change();msg('설계 파일을 초안으로 열었어요. 수정한 뒤 새 버전으로 저장할 수 있어요.');}catch(err){msg(err instanceof SyntaxError?'설계 파일을 읽지 못했어요.':err.message);}return;}if(t.matches('[data-sb-photo]'))try{const a=await photo(t.files[0]);if(alive){b.source=a;art();change();msg('감상할 이미지를 가져왔어요. 작품 이름과 출처를 기록해 보세요.');}}catch(err){msg(err.message);}
    if(t.matches('[data-source="url"]')){b.source.url=safeLink(t.value);art();change();}
    if(t.matches('[data-scene="seconds"]'))t.value=current().seconds;
    if(t.matches('[data-sb-version]')){prior=t.value;history();}
    if(t.matches('[data-sb-ref]')){stop();current().ref=refs.find(r=>r.versionId===t.value)||null;void media(current(),false);change();}};
  root.onclick=async e=>{const t=e.target.closest('button');if(!t||!root.contains(t))return;const a=t.dataset.act,s=current(),i=b.scenes.indexOf(s);
    if('focus'in t.dataset){const k=t.dataset.focus;b.focus=b.focus.includes(k)?b.focus.filter(x=>x!==k):[...b.focus,k];t.setAttribute('aria-pressed',String(b.focus.includes(k)));change();return;}
    if('select'in t.dataset){stop();selected=t.dataset.select;strip();editor();return;}
    if(a==='play'){if(playing){stop();msg('시사회를 멈췄어요.');}else{playing=true;step(0);}return;}
    if(a==='save')return commit();if(a==='restore')return commit(versions.find(x=>x.id===prior)||versions.at(-1));if(a==='retry'){const v=versions.find(x=>x.id===prior)||versions.at(-1);if(v&&!busy){busy=true;try{await share(v);}finally{busy=false;}}return;}
    if(a==='export'){download(fileFor(b,(versions.at(-1)?.number||0)+1));return;}
    if(a==='back'){await draft();if(alive){if(ctx.onBack)ctx.onBack();else window.dispatchEvent(new Event('labhome'));}return;}
    if(a==='image'||a==='video'){await draft();if(!alive)return;const next={schoolProjectId:ctx.schoolProjectId,title:b.title+' · '+s.title,plan:[b.goal,s.intent].filter(Boolean).join('\n'),prompt:[s.prompt,a==='video'&&s.camera].filter(Boolean).join('\n'),prediction:s.intent,storyboardId:b.id,sceneId:s.id};if(a==='video'&&s.ref?.kind==='image')next.sourceImageId=s.ref.versionId;const handler=a==='image'?ctx.onImage:ctx.onVideo;if(handler)handler(next);else window.dispatchEvent(new CustomEvent('labopen',{detail:{...next,type:'maker',kind:a,createNew:true}}));return;}
    if(a==='museum'){b.source={...museum};art();change();return;}
    stop();if(a==='add'){if(b.scenes.length>=30){msg('한 스토리보드에 30개 장면까지 넣을 수 있어요.');return;}const n=scene(b.scenes.length+1);b.scenes.splice(i+1,0,n);selected=n.id;}
    else if(a==='remove'&&b.scenes.length>1){b.scenes.splice(i,1);selected=b.scenes[Math.min(i,b.scenes.length-1)].id;}
    else if(a==='left'&&i>0)[b.scenes[i-1],b.scenes[i]]=[s,b.scenes[i-1]];
    else if(a==='right'&&i<b.scenes.length-1)[b.scenes[i+1],b.scenes[i]]=[s,b.scenes[i+1]];
    else return;strip();editor();change();};
  void db.run().then(doc=>{if(!alive)return;const initial=ctx.initialSnapshot?.scenes?ctx.initialSnapshot:ctx.initialSnapshot?.source;b=board(doc.draft||initial||{});versions=doc.versions;links=doc.links||{};selected=b.scenes[0].id;refs=makerRefs();hero();}).catch(()=>{if(alive){b=board();selected=b.scenes[0].id;refs=makerRefs();hero();stamp('저장 공간을 열지 못했어요.');}});
  return ()=>{alive=false;stop();free();clearTimeout(timer);if(b)void draft().finally(()=>db.close());else db.close();root.onclick=root.oninput=root.onchange=null;root.remove();};
}
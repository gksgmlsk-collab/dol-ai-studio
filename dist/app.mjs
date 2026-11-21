import {studentPresence} from './student-presence.mjs';
import {studentTools,preferredClass} from './student-workspace.mjs';
import {mountTeacherLive} from './teacher-live.mjs';
import {mountLinkedProject} from './linked-projects.mjs';
import {showDemo} from './generation-demo.mjs';
import {siteConfig} from './site-config.mjs';
import {mountStoryboard} from './storyboard.mjs';
import {attachSchoolArtifact} from './school.mjs';
import {assets,renderHome,renderStudentMain,mediaPage,samplePage,materialsPage} from './home.mjs';
import {mountSchool,getSchoolContext} from './school.mjs';
import {mountFabrication} from './fabrication.mjs';
import {classTools,saveFabrication} from './class-tools.mjs';
import {storage,clearPastAccount} from './workspace-data.mjs';
import {getDialogues,mountDialogue} from './dialogue.mjs';
import {getMakerProjects,mountMaker} from './maker.mjs';
import {getMission,mountStudio} from './studio.mjs';
import {mountMedia} from './media.mjs';
import {mountJournal} from './journal.mjs';

const drawings={
 layout:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 book:'<path d="M3 5c3-1 6-.8 9 1.2C15 4.2 18 4 21 5v14c-3-.8-6-.5-9 1.4C9 18.5 6 18.2 3 19zM12 6v14"/>',
 board:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M12 17v4m-5 0 3-4m7 4-3-4M7 12l3-3 3 2 4-4"/>',
 help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.6 2.6 0 1 1 4.5 1.8c-1.4 1-2 1.5-2 3.2m0 2.8v.2"/>',
 chip:'<rect x="5" y="5" width="14" height="14" rx="3"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v3m6-3v3m-6 14v3m6-3v3M2 9h3m-3 6h3m14-6h3m-3 6h3"/>',
 dialogue:'<path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-9l-6 4v-4H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M8 10h.2m3.8 0h.2m3.8 0h.2"/>',
 image:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="m4 18 6-6 3 3 3-3 5 5"/>',
 video:'<rect x="3" y="6" width="13" height="13" rx="2"/><path d="m16 10 5-3v11l-5-3"/>',
 history:'<path d="M3 11a9 9 0 1 1 2 7m-2-7h5m-5 0V6m9 1v5l3 2"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>'
};
const main=document.querySelector('#main'),dialog=document.querySelector('#info'),body=document.querySelector('#dialog-body');
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>globalThis.crypto?.randomUUID?.()||('p-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
const ic=k=>'<span data-icon="'+k+'"></span>';
function icons(el){el.querySelectorAll('[data-icon]').forEach(n=>{n.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24">'+(drawings[n.dataset.icon]||'')+'</svg>';});}
function modal(title,content){body.innerHTML='<div class="dialog-pad"><div class="modal-head"><h2 class="window-title" id="dialog-title">'+title+'</h2><button class="dialog-close" aria-label="닫기">'+ic('close')+'</button></div>'+content+'</div>';dialog.setAttribute('aria-labelledby','dialog-title');icons(body);body.querySelector('.dialog-close').onclick=()=>dialog.close();if(!dialog.open)dialog.showModal();}
dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
document.querySelector('#help').onclick=()=>modal('돌 AI 창작연구소 이용 안내','<ol><li><b>생각 대화</b>에서 떠오른 생각을 적고, 되돌아온 질문에 내 말로 답해요.</li><li>대화에서 고른 아이디어를 내 프롬프트로 정리해 <b>이미지 공방</b>에 가져가요.</li><li>완성한 그림에서 <b>이 그림으로 영상 만들기</b>를 선택하고 움직임을 글로 설명해요.</li><li>기대와 달랐던 점과 바꾼 이유를 <b>생각 기록장</b>에서 비교해요.</li></ol><p class="hint">연습 작품은 이 브라우저에 저장돼요. 수업에서는 선택한 버전을 프로젝트에 담아 선생님과 함께 볼 수 있어요.</p>');
async function engineDialog(){
  modal('로컬 모델 연결','<p role="status">이 컴퓨터의 모델을 확인하고 있어요.</p>');
  let state;
  if(location.protocol!=='file:')try{const r=await fetch('/api/status',{signal:AbortSignal.timeout(9000),cache:'no-store'});if(r.ok)state=await r.json();}catch{}
  if(!dialog.open||body.querySelector('.window-title')?.textContent!=='로컬 모델 연결')return;
  const names={chat:'대화 · Ollama',image:'이미지 · ComfyUI',video:'영상 · ComfyUI'};
  const list=Object.entries(names).map(([key,label])=>{const s=state?.[key];return '<li><strong>'+label+'</strong><span class="engine-state '+(s?.ready?'connected':'')+'">'+(s?.ready?'연결됨':'연결 대기')+'</span><p>'+safe(s?.ready?(s.model||s.detail||'사용할 수 있어요.'):(s?.detail||'작업실 서버에서 로컬 모델을 확인할 수 있어요.'))+'</p></li>';}).join('');
  const localHelp=location.protocol==='file:'?'<p><a href="http://127.0.0.1:5174/">로컬 작업실 열기</a></p>':'';
  modal('로컬 모델 연결','<ul class="engine-list">'+list+'</ul><div data-install-progress></div>'+localHelp+'<p class="hint">모델이 준비되기 전에는 질문 카드, 그림 그리기, 카메라 움직임 미리보기를 사용할 수 있어요.</p><button class="plain-action" id="recheck">연결 다시 확인</button>');
  body.querySelector('#recheck').onclick=engineDialog;
  const display=body.querySelector('[data-install-progress]');
  async function update(){
    if(!display.isConnected||!dialog.open||!state)return;
    try{
      const response=await fetch('/api/setup-progress',{cache:'no-store'}),items=(await response.json()).packages;
      if(!Array.isArray(items)||!items.length||!items.some(p=>!p.installed))return;
      display.innerHTML='<h3>모델 파일 설치 현황</h3>'+items.map(p=>'<label class="dl-progress"><span>'+safe(p.label)+'<b>'+Math.floor(100*p.received/p.total)+'%</b></span><progress value="'+Number(p.received)+'" max="'+Number(p.total)+'"></progress></label>').join('');
      setTimeout(update,8000);
    }catch{}
  }
  void update();
}
document.querySelector('#engines').onclick=engineDialog;
const drafts=new Map();
let presence={visit(){}};
let session={user:null,projects:[]},ready=false,dispose=null,activeContext=null;
const fabKinds=['web','3d','robot'];
const toolNames={city:'도시개발 프로젝트',switch:'3D 발명품 프로젝트',web:'웹사이트','3d':'3D 설계',robot:'발명·로봇',storyboard:'감상·스토리보드',image:'이미지',video:'영상',dialogue:'생각 대화'};
function practiceIndex(){try{return JSON.parse(storage.getItem('dol.practice-index')||'[]');}catch{return [];}}
function keepPractice(type,id,route,title){if(session.user)return;const rows=practiceIndex().filter(x=>x.path!==route);rows.unshift({type,id,path:route,title:title||toolNames[type]+' 작업',updated:new Date().toISOString()});try{storage.setItem('dol.practice-index',JSON.stringify(rows.slice(0,150)));}catch{}}
function practicePanel(){const node=document.createElement('section');node.className='dol-practices';const list=[...getDialogues().map(p=>({title:p.title||'생각 대화',type:'dialogue',path:'#dialogue/'+encodeURIComponent(p.id),updated:p.updatedAt})),...getMakerProjects().map(p=>({title:p.title,type:p.kind,path:'#make/'+p.kind+'/'+encodeURIComponent(p.id),updated:p.updatedAt})),...practiceIndex()].sort((a,b)=>String(b.updated).localeCompare(String(a.updated)));node.innerHTML='<h2>이 브라우저의 프로젝트</h2>'+(list.length?'<ul>'+list.map(x=>'<li><a href="'+safe(x.path)+'"><b>'+safe(x.title)+'</b><span>'+safe(toolNames[x.type])+'</span></a></li>').join('')+'</ul>':'<p>대화와 공방에서 시작한 작품을 여기서 이어갈 수 있어요.</p>')+'<div class="dol-actions"><a class="dol-primary" href="#start">프로젝트 시작하기</a><a href="#journal">생각 기록장</a></div>';return node;}

function go(hash){if(location.hash===hash)render();else location.hash=hash;}
const contextKey=id=>'dol.tool-context.'+id;
function recall(id){if(!id)return {};try{return JSON.parse(storage.getItem(contextKey(id))||'{}');}catch{return {};}}
function saveContext(id,c){if(c.schoolProjectId)storage.setItem(contextKey(id),JSON.stringify({schoolProjectId:c.schoolProjectId,title:c.title||'',goal:c.goal||'',resources:c.resources||'',schoolVersionId:c.schoolVersionId||null,draftScope:c.draftScope||null}));}
function start(type,c={}){if(session.user&&!c.schoolProjectId){chooseProject(type,c);return;}const id=uid();drafts.set(id,c);saveContext(id,c);go(type==='storyboard'?'#storyboard/'+id:type==='dialogue'?'#dialogue/'+id:fabKinds.includes(type)?'#fab/'+type+'/'+id:'#make/'+type+'/'+id);}
async function chooseProject(type,c){let data;try{data=await getSchoolContext();}catch(e){modal('프로젝트 열기','<p>'+safe(e.message)+'</p>');return;}const ps=data.projects||[];modal('어느 프로젝트에서 만들까요?',(ps.length?'<div class="mission-list">'+ps.map((p,i)=>'<button class="mission-choice" data-p="'+i+'">'+safe(p.title)+'</button>').join('')+'</div>':'<p>수업에 참여하고 프로젝트를 만들면 작품과 생각의 버전을 함께 보관할 수 있어요.</p>')+'<a href="#projects">내 프로젝트로 이동 →</a>');body.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{const p=ps[Number(b.dataset.p)];dialog.close();openClassTool(type,p.id,{...c,title:p.title});});}
async function openClassTool(type,projectId,context={}){try{if(type==='city'||type==='switch'){go('#'+type+'/'+encodeURIComponent(projectId));return;}const r=await fetch('/api/school/projects/'+encodeURIComponent(projectId),{cache:'no-store'});const p=await r.json();if(!r.ok)throw Error(p.error||'프로젝트를 열 수 없어요.');const verified=await getSchoolContext(),assignment=(verified.assignments||[]).find(a=>a.id===p.assignmentId);if(type!=='storyboard'&&assignment?.settings?.tools&&!assignment.settings.tools.includes(type))throw Error('선생님이 이 과제에서 허용한 도구를 골라 주세요.');const c={...context,title:context.title||p.title,schoolProjectId:projectId,schoolVersionId:context.schoolVersionId||context.versionId||p.versions?.[0]?.id||null};const selectedVersion=context.schoolVersionId?p.versions?.find(v=>v.id===context.schoolVersionId):null;if(selectedVersion&&selectedVersion.id!==p.versions?.[0]?.id)c.draftScope=selectedVersion.id;const available=selectedVersion?p.assets.filter(a=>selectedVersion.snapshot.assetIds.includes(a.id)):p.assets;if(fabKinds.includes(type)||type==='storyboard'){const src=available.find(a=>type==='storyboard'?a.kind==='storyboard':a.filename?.endsWith('.dol-'+type+'.json'));if(src){const response=await fetch('/api/school/projects/'+encodeURIComponent(projectId)+'/asset/'+encodeURIComponent(src.id));if(response.ok){const snapshot=await response.json();if(snapshot?.kind===type||(type==='storyboard'&&snapshot?.format==='dol-storyboard-v1'))c.initialSnapshot=snapshot;}}}if(typeof c.plan!=='string')c.plan=String(c.goal||'');const key='dol.tool-instance.'+projectId+'.'+type+(c.draftScope?'.'+c.draftScope:'');const fresh=context.createNew||context.initialIdea||context.sourceImageId||context.prompt;let id=fresh?null:storage.getItem(key);if(!id){id=uid();storage.setItem(key,id);}saveContext(id,c);drafts.set(id,c);go(type==='storyboard'?'#storyboard/'+id:type==='dialogue'?'#dialogue/'+id:fabKinds.includes(type)?'#fab/'+type+'/'+id:'#make/'+type+'/'+id);}catch(e){modal('프로젝트 공방','<p>'+safe(e.message)+'</p>');}}
function mountClassBar(type,id,ctx){if(!ctx.schoolProjectId)return;const stop=classTools(main,type,id,ctx),old=dispose;dispose=()=>{stop();if(typeof old==='function')old();};}
let renderNumber=0;async function render(){if(!ready)return;const number=++renderNumber;if(dialog.open)dialog.close();if(typeof dispose==='function')dispose();dispose=null;activeContext=null;main.replaceChildren();
 const [view,kind,id,ver]=(location.hash.slice(1)||'home').split('/');const full=['home','models','student','start','workshop','sample','materials','demo'].includes(view);main.classList.toggle('dol-full',full);document.querySelectorAll('[data-nav]').forEach(n=>n.dataset.nav===view?n.setAttribute('aria-current','page'):n.removeAttribute('aria-current'));
 let title='돌 AI 창작연구소';
 if(['student','start'].includes(view)){
   title='학생 프로젝트';let launch;
   renderStudentMain(main,type=>launch?.(type));
   const root=main.querySelector('.entry-student'),extra=document.createElement('div');extra.className='student-classroom-utils';
   if(session.user)root.querySelector('.entry-choices').before(extra);else root.append(extra);
   const buttons=[...root.querySelectorAll('[data-launch]')];
   if(session.user){buttons.forEach(b=>b.disabled=true);extra.setAttribute('role','status');extra.textContent='수업 프로젝트를 확인하고 있어요.';}
   const context=session.user?await getSchoolContext():session;if(number!==renderNumber)return;
   if(session.user&&context.reachable&&session.user.id!==context.user?.id){location.reload();return;}extra.removeAttribute('role');
   if(session.user&&!context.reachable){presence.visit(null);extra.innerHTML='<span role="status">수업 정보를 불러오지 못했어요.</span> <button type="button">다시 연결하기</button>';extra.querySelector('button').onclick=()=>render();}
   else{extra.replaceChildren();launch=studentTools(extra,context,{start,open:openClassTool,modal,dialog,projectId:kind,onClass:classId=>presence.visit('student',{classId})});buttons.forEach(b=>b.disabled=false);}
 }
 else if(view==='teacher-live'){title='교사 학급 현황';presence.visit(null);dispose=mountTeacherLive(main,{classId:kind||'',session});}
 else if(view==='city'||view==='switch'){
 title=view==='city'?'도시개발 프로젝트':'3D 발명품 프로젝트';let project=null;
 if(kind){try{const r=await fetch('/api/school/projects/'+encodeURIComponent(kind),{cache:'no-store'});const p=await r.json();if(!r.ok)throw Error(p.error||'수업 프로젝트를 열 수 없어요.');
 const policy=await fetch('/api/tool-policy?'+new URLSearchParams({project:p.id,tool:view==='city'?'city':'3d'}),{cache:'no-store'});if(!policy.ok)throw Error((await policy.json()).error||'선생님이 허용한 도구를 선택해 주세요.');project=p;
 }catch(e){if(number!==renderNumber)return;presence.visit(null);main.innerHTML='<div class="dol-page"><h1>'+title+'</h1><p>'+safe(e.message)+'</p><a href="#projects">내 프로젝트로 이동</a></div>';return;}}
 const fresh=session.user?await getSchoolContext():session;if(number!==renderNumber)return;
 if(!project&&!session.user)keepPractice(view,view,'#'+view,title);
 dispose=mountLinkedProject(main,view,{project,user:fresh.user,classes:fresh.classes,choose:()=>chooseProject(view,{}),freeDesign:()=>project?openClassTool('3d',project.id):go('#fab/3d')});
 }
 else if(view==='workshop'){title='영상·이미지';mediaPage(main,start);}
 else if(view==='demo'){title='노란 종이배의 여행';showDemo(main,start);}
 else if(view==='materials'){title='재료실';materialsPage(main);}
 else if(view==='sample'){title='창작 아이디어 예시';samplePage(main,kind,start);}
 else if(['join','projects','project','gallery','teacher','operator'].includes(view)){
 title=({join:'수업 참여',projects:'내 프로젝트',project:'수업 프로젝트',gallery:'친구 작품',teacher:'교사 공간',operator:'운영 공간'})[view];
 const panel=document.createElement('section');main.append(panel);
 const entryRole=view==='join'?(kind==='teacher-live'?'teacher':kind==='student'?'student':null):null;
 dispose=mountSchool(panel,{view,id:kind,entryRole,returnHash:entryRole==='teacher'?'#teacher-live'+(id&&/^[0-9a-z-]{1,80}$/i.test(id)?'/'+id:''):null});
 if(view==='project'&&session.user&&kind){const bar=document.createElement('div');bar.className='dol-classbar';const btn=document.createElement('button');btn.textContent='미술 감상·스토리보드';btn.onclick=()=>openClassTool('storyboard',kind);bar.append(btn);main.append(bar);}if(view==='projects'&&!session.user){main.prepend(practicePanel());}
 }else if(view==='storyboard'){
 const k=kind||'personal-storyboard',c={...recall(k),...(drafts.get(k)||{})};drafts.delete(k);
 if(session.user&&!c.schoolProjectId){presence.visit(null);main.innerHTML='<div class="dol-page"><h1>미술 감상·스토리보드</h1><button class="dol-primary">수업 프로젝트 고르기</button></div>';main.querySelector('button').onclick=()=>chooseProject('storyboard',c);return;}activeContext=c;keepPractice('storyboard',k,'#storyboard/'+k,c.title);title='미술 감상·스토리보드';dispose=mountStoryboard(main,{...c,projectId:c.schoolProjectId||k,onBack:()=>go(c.schoolProjectId?'#project/'+c.schoolProjectId:'#workshop'),onSave:c.schoolProjectId?v=>attachSchoolArtifact(c.schoolProjectId,{kind:'storyboard',title:v.title+' · 장면 계획 v'+v.number,description:v.text,file:v.file,filename:v.file.name,clientKey:'story-'+v.id}):undefined,onImage:data=>start('image',{...c,...data}),onVideo:data=>start('video',{...c,...data})});
 }else if(view==='dialogue'||view==='make'||view==='fab'){
 const type=view==='dialogue'?'dialogue':view==='make'?(kind==='video'?'video':'image'):fabKinds.includes(kind)?kind:'web';
 const localId=(view==='dialogue'?kind:id)||(view==='fab'&&!session.user?'local-'+type:uid());const c={...recall(localId),...(drafts.get(localId)||{})};drafts.delete(localId);
 if(session.user&&!c.schoolProjectId){presence.visit(null);main.innerHTML='<div class="dol-page"><h1>수업 프로젝트에서 시작해요</h1><p>도구로 만든 작품을 모을 프로젝트를 골라 주세요.</p><button class="dol-primary">프로젝트 고르기</button></div>';main.querySelector('button').onclick=()=>chooseProject(type,c);void chooseProject(type,c);return;}
 if(session.user){try{const query=new URLSearchParams({tool:type,project:c.schoolProjectId});const response=await fetch('/api/tool-policy?'+query,{cache:'no-store'});if(!response.ok)throw Error((await response.json()).error||'이 공방을 열 수 없어요.');}catch(e){if(number!==renderNumber)return;presence.visit(null);main.innerHTML='<div class="dol-page"><h1>수업 프로젝트</h1><p>'+safe(e.message)+'</p><a href="#projects">내 프로젝트로 돌아가기</a></div>';return;}if(number!==renderNumber)return;}
 activeContext=c;saveContext(localId,c);if(!(view==='dialogue'?kind:id))history.replaceState(null,'',view==='dialogue'?'#dialogue/'+localId:'#'+view+'/'+type+'/'+localId);
 if(view==='dialogue'){title='생각 대화';dispose=mountDialogue(main,localId,{...c,versionId:id});mountClassBar(type,localId,c);}
 else if(view==='make'){title=type==='image'?'이미지 공방':'영상 공방';dispose=mountMaker(main,type,{...c,projectId:localId,createNew:!getMakerProjects().some(p=>p.id===localId),versionId:ver});mountClassBar(type,localId,c);}
 else{keepPractice(type,localId,'#fab/'+type+'/'+localId,c.title);title=({web:'웹사이트',robot:'발명·로봇','3d':'3D 설계'})[type];dispose=mountFabrication(main,type,{...c,projectId:c.schoolProjectId||localId,ownerId:session.user?.id,onBack:()=>go(c.schoolProjectId?'#project/'+c.schoolProjectId:'#student'),onSave:c.schoolProjectId?v=>saveFabrication(c.schoolProjectId,v):undefined});if(['3d','robot'].includes(type)){const nav=document.createElement('nav');nav.className='lp-entry';const link=document.createElement('a');link.href='#switch'+(c.schoolProjectId?'/'+encodeURIComponent(c.schoolProjectId):'');link.textContent='Seokam 3D 스위치 프로젝트 열기 →';nav.append(link);main.prepend(nav);}}
 }else if(view==='journal'){title='생각 기록장';dispose=mountJournal(main,'journal');}
 else if(view==='studio'&&kind){title=getMission(kind).title;dispose=mountStudio(main,kind);}
 else if(view==='media'&&id){title='이전 작품';dispose=mountMedia(main,kind,{projectId:id,versionId:ver});}
 else {main.classList.add('dol-full');renderHome(main);if(view==='models')void engineDialog();}
 if(!['student','start'].includes(view)){
   const personal=new Set(['teacher','teacher-live','operator','journal']);
   const category=view==='fab'||view==='make'?kind:view==='media'?kind:view==='home'?'cover':view;
   const projectId=activeContext?.schoolProjectId||(['city','switch','project'].includes(view)?kind:null);
   const supported=['cover','projects','project','studio','workshop','dialogue','image','video','web','3d','robot','switch','city','storyboard','gallery','materials','models','sample','demo','join'];
   const classId=projectId?null:preferredClass(session);
   // The project screen publishes its section after it verifies access and loads the project.
   presence.visit(view==='project'||personal.has(view)||!supported.includes(category)?null:category,{classId,projectId});
 }
 document.title=title==='돌 AI 창작연구소'?siteConfig.name:title+' · '+siteConfig.name;window.scrollTo(0,0);
}
window.addEventListener('hashchange',()=>{render();main.focus({preventScroll:true});});
window.addEventListener('schoolactivity',({detail:d})=>{if(d&&location.hash.split('/')[0]==='#project'&&location.hash.split('/')[1]===d.projectId)presence.visit(d.tool,{projectId:d.projectId,classId:d.classId});});
window.addEventListener('schooltool',({detail:d})=>{if(d?.projectId)void openClassTool(d.tool,d.projectId,d.context);});
window.addEventListener('labhome',()=>go(activeContext?.schoolProjectId?'#project/'+activeContext.schoolProjectId:'#student'));
window.addEventListener('labopen',({detail:d})=>{if(!d)return;const scope=activeContext?.schoolProjectId?{schoolProjectId:activeContext.schoolProjectId}:{};
 if(d.type==='practice')return go('#student');
 if(d.type==='newDialogue')return start('dialogue',{...scope,createNew:true});
 if(d.type==='dialogue')return go('#dialogue/'+encodeURIComponent(d.id||d.dialogueId||uid())+(d.versionId?'/'+encodeURIComponent(d.versionId):''));
 if(d.type==='imageFromDialogue')return start('image',{...scope,dialogueId:d.dialogueId,dialogueVersionId:d.versionId,plan:d.plan,prompt:d.prompt,prediction:d.prediction,title:d.title});
 if(d.type==='videoFromImage')return start('video',{...scope,...d});
 if(d.type==='maker')return d.projectId?go('#make/'+d.kind+'/'+encodeURIComponent(d.projectId)+(d.versionId?'/'+encodeURIComponent(d.versionId):'')):start(d.kind==='video'?'video':'image',{...scope,...d});
 if(d.type==='studio')return go('#studio/'+encodeURIComponent(d.id||'star'));
 if(d.type==='media')return go('#media/'+(d.kind==='video'?'video':'image')+'/'+encodeURIComponent(d.projectId||d.id||'')+(d.versionId?'/'+encodeURIComponent(d.versionId):''));
 if(d.type==='newmedia')return start(d.kind==='video'?'video':'image',scope);
});
document.querySelector('.brand span').textContent=siteConfig.name;document.querySelector('.brand').setAttribute('aria-label',siteConfig.name+' 홈');document.querySelector('.dol-footer b').textContent=siteConfig.name;document.querySelector('.dol-compass').src=assets.compass;document.querySelector('.dol-profile img').src=assets.city;
document.querySelector('.skip').onclick=e=>{e.preventDefault();main.focus();};
const nativeFetch=window.fetch.bind(window);
function monitorAccount(){if(location.protocol==='file:')return;
 window.fetch=async(input,options={})=>{const url=new URL(typeof input==='string'?input:input.url||input,location.href);if(url.origin!==location.origin||!url.pathname.startsWith('/api/')||url.pathname==='/api/school/me')return nativeFetch(input,options);
 const headers=new Headers(options.headers||(input instanceof Request?input.headers:undefined));headers.set('X-Dol-Account',session.user?.id||'guest');const response=await nativeFetch(input,{...options,headers});if(response.status===409&&response.headers.get('X-Dol-Account-Changed')==='1')location.reload();return response;};
 let checking=false;const check=async()=>{if(checking||document.hidden)return;checking=true;try{const r=await nativeFetch('/api/school/me',{cache:'no-store'});if(r.ok){const current=await r.json();if((current.user?.id||'')!==(session.user?.id||''))location.reload();}}catch{}finally{checking=false;}};
 window.addEventListener('focus',check);document.addEventListener('visibilitychange',check);window.addEventListener('pageshow',e=>{if(e.persisted)void check();});}
async function boot(){if(location.protocol!=='file:')try{session=await getSchoolContext();}catch{}clearPastAccount(session?.user?.id||'');if(session.user)document.querySelector('[data-account]').textContent=session.user.name+' · 내 계정';monitorAccount();presence=studentPresence(session?.user,session?.classes);ready=true;render();}
void boot();

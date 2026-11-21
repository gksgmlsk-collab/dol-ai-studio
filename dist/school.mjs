import {filterGallery,galleryKind,publicCityUrl} from './gallery-types.mjs';
import {galleryListUrl,homeListUrl,galleryRoute,galleryFilters,galleryEmpty,exhibitCards,sampleCards} from './gallery.mjs';
import {gallerySamples} from './home.mjs';
const home='/api/school/';
const names={city:'도시개발',dialogue:'생각 대화',image:'이미지',video:'영상',web:'웹사이트','3d':'3D 설계',robot:'발명 · 로봇',audio:'녹음',file:'파일',note:'메모',storyboard:'스토리보드'};
const toolList=['dialogue','image','video','web','3d','robot','city'];
const axes=['문제 파악과 개념 적용','계획·순서·조건 설정','대안 생성과 확장','근거를 들어 비교·선택','시험·점검·수정'];
const phases=['만드는 중','친구 의견 기다리는 중','새 버전','완성'];
const reactions=['궁금해요','이런 방법은 어때요?','이 부분이 도움이 됐어요'];
const adopted=['반영했어요','일부 반영했어요','다른 방법을 선택했어요'];
const statuses={approved:'전시 중',pending:'선생님 확인 중',revoked:'전시 종료'};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean=v=>String(v??'').trim();
const today=d=>d?new Intl.DateTimeFormat('ko-KR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(d)):'';
async function api(method,path,data,keepalive=false){
  if(!['https:','http:'].includes(location.protocol))throw Error('로컬 작업실 서버에서 수업에 참여할 수 있어요.');
  const r=await fetch(home+path,{method,keepalive,credentials:'same-origin',cache:'no-store',headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});
  let o;try{o=await r.json();}catch{throw Error('학급 서버에 연결할 수 없어요.');}
  if(!r.ok)throw Object.assign(Error(o.error||'요청을 처리하지 못했어요.'),{status:r.status});
  return o;
}
export async function getSchoolContext(){
  try{return {...await api('GET','me'),reachable:true};}catch(e){return {user:null,classes:[],teams:[],assignments:[],projects:[],reachable:false,error:e.message};}
}
export async function attachSchoolArtifact(projectId,item){
  const file=item.file;
  if(file && (!(file instanceof Blob)||file.size>16*1024*1024))throw Error('파일은 16MB 이하로 골라 주세요.');
  const data=file?await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');reader.onerror=()=>reject(Error('파일을 읽지 못했어요.'));reader.readAsDataURL(file);}):'';
  return api('POST','projects/'+encodeURIComponent(projectId)+'/assets',{kind:item.kind||'file',clientKey:item.clientKey||undefined,title:item.title||file?.name||'작품',filename:item.filename||file?.name||item.title,mime:file?.type||'application/octet-stream',data,description:item.description??item.text??''});
}
const button=(action,label,cls='sc-secondary',more='')=>`<button type="button" class="${cls}" data-sc="${action}" ${more}>${esc(label)}</button>`;
const row=(title,body)=>`<section class="sc-panel"><h2>${esc(title)}</h2>${body}</section>`;
const input=(name,title,value='',type='text',extra='')=>`<label class="sc-input"><span>${esc(title)}</span><input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const area=(name,title,value='',extra='')=>`<label class="sc-input"><span>${esc(title)}</span><textarea name="${name}" rows="2" ${extra}>${esc(value)}</textarea></label>`;
const options=(items,selected='')=>items.map(i=>{const [v,l]=Array.isArray(i)?i:[i,i];return `<option value="${esc(v)}" ${v===selected?'selected':''}>${esc(l)}</option>`}).join('');
const select=(key,label,opts,selected='')=>`<label class="sc-input"><span>${esc(label)}</span><select name="${key}">${options(opts,selected)}</select></label>`;
const check=(name,label,value='1',checked=false)=>`<label class="sc-check"><input type="checkbox" name="${name}" value="${esc(value)}" ${checked?'checked':''}>${esc(label)}</label>`;
const form=(act,inside,label)=>`<form data-sc-form="${act}">${inside}<button class="sc-primary" type="submit">${esc(label)}</button></form>`;
const hint=text=>`<p class="sc-hint">${esc(text)}</p>`;
const tag=s=>`<span class="sc-tag">${esc(s)}</span>`;
const details=(s,content,open=false)=>`<details class="sc-details" ${open?'open':''}><summary>${esc(s)}</summary>${content}</details>`;
const value=(f,k)=>String(f.get(k)||'').trim();
const viewTitles={projects:'내 프로젝트',project:'프로젝트 작업실',join:'수업 참여',gallery:'친구 작품',teacher:'선생님 교실',operator:'운영 관리'};
const viewIntros={projects:'내가 발견한 문제와 표현하고 싶은 생각을 한 작품에서 키워요.',project:'생각과 작품을 이어 보고, 다음에 해 볼 일을 골라요.',join:'개인 참여 정보를 이용해 우리 반 작업실을 열어요.',gallery:'우리 반이 함께 보도록 허락한 작품에 의견을 남겨요.',teacher:'과제와 모둠을 관리하고 학생이 남긴 근거를 살펴보세요.',operator:'계정, 도구와 저장 상태를 관리해요.'};
const projectPath=id=>'projects/'+encodeURIComponent(id);
const projectLink=(id,label)=>`<a class="sc-inline" href="#project/${encodeURIComponent(id)}">${esc(label)}</a>`;
const rubricState=s=>s==='보류'?'근거 보류':s;
const stageLabel=s=>s||'만드는 중';

export function mountSchool(element,optionsArg={},legacyId){
  const opt=typeof optionsArg==='string'?{view:optionsArg,id:legacyId}:optionsArg,view=opt.view||'projects';
  const root=document.createElement('section');root.className='sc';element.replaceChildren(root);
  const galleryLocation=galleryRoute(location.hash);
  let typeFilter=galleryLocation.type,exhibitDetail=null;
  const events=new AbortController();let active=true,state,project,management,opsState,engineFlags={},exhibits=[],classId=view==='gallery'?galleryLocation.classId:'',tab='plan',selectedVersion='',selectedExhibit=view==='gallery'?galleryLocation.id:'',editTask='',editObservation='',issued=null;
  const [,linkedProject,linkedTab,linkedEntry]=location.hash.slice(1).split('/');
  if(view==='project'&&linkedProject===opt.id){
    if(linkedTab==='versions'){tab='versions';selectedVersion=linkedEntry||'';}
    if(linkedTab==='observe'){tab='observe';editObservation=linkedEntry||'';}
  }
  let timer=0,dirty=false,saving=null,conflict=false,notice='',isError=false;
  const query=s=>root.querySelector(s),base=()=>projectPath(project.id),classData=()=>state.classes.find(c=>c.id===classId),assignment=()=>state.assignments.find(a=>a.id===project?.assignmentId);
  const teacher=()=>state?.user?.role==='teacher';
  const send=(type,detail)=>window.dispatchEvent(new CustomEvent(type,{detail}));
  function say(message,error=false){notice=message;isError=error;const el=query('[data-sc-status]');if(el){el.textContent=message;el.classList.toggle('sc-error',error);}}
  function version(){return project?.versions.find(v=>v.id===selectedVersion)||project?.versions[0];}
  async function init(){
    state=await getSchoolContext();if(!active)return;
    if(view==='gallery'){if(!state.classes.some(c=>c.id===classId))classId='';}
    else if(!classId||!state.classes.some(c=>c.id===classId))classId=state.classes[0]?.id||'';
    if(state.user){
      if(view==='project'&&opt.id){project=await api('GET',projectPath(opt.id));classId=project.classId;if(tab==='observe'&&!teacher())tab='plan';}
      if((view==='teacher'||view==='join')&&teacher()&&classId)management=await api('GET','classes/'+classId);
      if(view==='operator'&&state.user.role==='operator'){opsState=await api('GET','ops');try{const response=await fetch('/api/status',{cache:'no-store'});if(response.ok)engineFlags=await response.json();}catch{}}
      if(view==='gallery'){
        if(selectedExhibit){
          try{exhibitDetail=await api('GET','gallery/'+encodeURIComponent(selectedExhibit));if(classId&&classId!==exhibitDetail.classId)classId=exhibitDetail.classId;}
          catch(err){if(err.status!==404&&err.status!==403)throw err;exhibitDetail=null;}
        }else exhibits=await api('GET','gallery'+(classId?'?classId='+encodeURIComponent(classId):''));
      }
    }
    if(active)render();
  }
  function googleEntry(link=false){
    if(!state.google?.enabled)return details('교사 Google 로그인 준비',hint('운영자가 운영 관리에서 학교의 Google 웹 클라이언트 ID를 등록하면 열려요.')+hint('운영자는 교사 계정에 Google 이메일 초대를 등록할 수 있어요. 기존 교사는 설정 후 수업 참여에서 직접 연결할 수 있어요.'),true);
    if(link&&state.google.linkedEmail)return hint('연결한 Google 계정 · '+state.google.linkedEmail);
    const target=new URL('/google-teacher.html',location.origin);
    if(location.protocol==='http:'&&location.hostname==='127.0.0.1'){
      target.hostname='localhost';
      if(link){target.pathname='/';target.hash='join';return hint('localhost에서 이 교사 계정으로 로그인한 뒤 연결해 주세요.')+'<a class="sc-secondary" href="'+esc(target.href)+'">localhost 수업 참여 열기</a>';}
    }
    const match=/^#teacher-live(?:\/([0-9a-z-]{1,80}))?$/i.exec(opt.returnHash||'');
    target.hash=link?'link':match?'login/teacher-live'+(match[1]?'/'+match[1]:''):'login';
    const entry='<a class="sc-secondary" href="'+esc(target.href)+'">'+(link?'Google 계정 연결하기':'교사 Google 로그인')+'</a>';
    return link?entry:entry+details('Google 계정으로 처음 로그인한다면',hint('초대받은 교사는 운영자에게 알려 준 Google 이메일로 7일 안에 로그인해요. 기존 교사는 교사 아이디로 로그인한 뒤 수업 참여에서 Google 계정 연결하기를 선택해요.'));
  }
  function loginPanel(){
    const studentLogin=()=>row('학생으로 참여하기',form('student-login',input('classCode','학급 코드','','text','required maxlength="32" autocapitalize="characters"')+input('login','개인 아이디','','text','required maxlength="64" autocomplete="username"')+input('secret','개인 PIN','','password','required maxlength="128" autocomplete="current-password"'),'수업 참여하기'));
    const teacherLogin=()=>row(opt.entryRole==='teacher'?'교사 로그인':'교사 · 운영자 로그인',form('teacher-login',input('login','교사 또는 운영 아이디','teacher','text','required autocomplete="username"')+input('secret','비밀번호','','password','required autocomplete="current-password"'),'교실 열기')+googleEntry()+hint('처음 실행할 때 서버의 수업 데이터 폴더에 별도 접속 정보가 준비돼요.'));
    if(opt.entryRole==='teacher')return teacherLogin();
    if(opt.entryRole==='student')return studentLogin();
    return '<div class="sc-cols">'+studentLogin()+teacherLogin()+'</div>';
  }
  function guest(){
    if(view==='join'&&opt.entryRole&&state.reachable)return loginPanel();
    const desc=view==='gallery'?'우리 반 작품은 그 학급에 참여한 뒤 볼 수 있어요.':view==='teacher'?'학생 기록과 전시 요청은 담당 교사가 열 수 있어요.':'개인과 모둠 프로젝트를 이어 가려면 우리 반에 참여해요.';
    return (state.reachable?view==='join'?loginPanel():row('수업 작업실 열기',hint(desc)+'<a class="sc-primary" href="#join">수업 참여</a>'):row('수업 서버 연결이 필요해요',hint('로컬 작업실을 실행하면 학급 로그인과 공동 저장을 사용할 수 있어요.')))+
      row('이 기기에서 연습',hint('연습 작품은 이 브라우저의 개인 작업실에 저장돼요.')+button('practice','개인 연습 시작하기'));
  }
  function classPicker(){return state.classes.length>1?select('active-class','학급 선택',state.classes.map(c=>[c.id,c.name]),classId):'';}
  function projectCards(items){
    return items.length?`<div class="sc-cards">${items.map(p=>`<a class="sc-project" href="#project/${encodeURIComponent(p.id)}">${tag(p.teamId?'모둠 프로젝트':'개인 프로젝트')}<strong>${esc(p.title)}</strong><small>${esc(today(p.updatedAt))} 저장</small></a>`).join('')}</div>`:hint('아직 시작한 프로젝트가 없어요.');
  }
  function projectsPage(){
    const assignments=state.assignments.filter(a=>a.classId===classId),teams=state.teams.filter(t=>t.classId===classId);
    return classPicker()+row('이어서 만들기',projectCards(state.projects.filter(p=>p.classId===classId)))+
      (classId?row('새 프로젝트',form('project',input('title','프로젝트 이름','','text','required maxlength="120" placeholder="우리 동네 그늘 지도"')+select('teamId','누구와 만들까요?',[['','나 혼자'],...teams.map(g=>[g.id,g.name])])+select('assignmentId','수업 과제',[['','자유 프로젝트'],...assignments.map(a=>[a.id,a.title])]),'프로젝트 시작하기')):row('학급이 필요해요',`<a href="#teacher" class="sc-inline">학급 만들기</a>`))+
      (assignments.length?row('우리 반 과제',assignments.map(a=>details(a.title,`<p>${esc(a.settings.goal)}</p>${hint(a.settings.resources)}${hint('사용 도구 · '+a.settings.tools.map(t=>names[t]).join(', '))}`)).join('')):'');
  }
  function accessCard(){
    return row('나의 수업 계정',`<p><strong>${esc(state.user.name)}</strong> · ${state.user.role==='operator'?'운영자':teacher()?'교사':'학생'}</p><p>${state.classes.map(c=>esc(c.name)).join(' · ')||'아직 만든 학급이 없어요.'}</p><div class="sc-actions"><a class="sc-primary" href="#projects">내 프로젝트 열기</a>${teacher()?'<a class="sc-primary" href="#teacher-live">학급 현황 보기</a><a class="sc-secondary" href="#teacher">교실 관리</a>':''}${state.user.role==='operator'?'<a class="sc-secondary" href="#operator">운영 관리</a>':''}${button('logout','로그아웃')}</div>`)+(teacher()?row('교사 Google 계정',googleEntry(true)):'')+row('계정 보안',details('비밀번호 변경',form('password',input('current','현재 비밀번호','','password','required autocomplete="current-password"')+input('next','새 비밀번호 (학생 8자 이상, 교사·운영자 12자 이상)','','password','required maxlength="128" autocomplete="new-password"'),'변경하고 다시 로그인')));
  }
  function teacherPage(){
    if(!teacher())return row('선생님 교실',hint('담당 교사 계정으로 로그인해 주세요.'));
    const createClass=details('새 학급 만들기',form('class',input('name','학급 이름','','text','required maxlength="80"'),'학급 만들기'),!classId);
    if(!classId||!management)return row('우리 교실',createClass);
    const mgr=management,cl=classData(),students=mgr.students,assignments=state.assignments.filter(a=>a.classId===classId),task=assignments.find(a=>a.id===editTask),set=task?.settings||{};
    const sourceLink=(o,part,label)=>'<a class="sc-inline" href="#project/'+encodeURIComponent(o.projectId)+'/'+part+'/'+encodeURIComponent(part==='observe'?o.id:o.versionId)+'">'+esc(label)+'</a>';
    const needs=mgr.support||[],patterns=axes.map(axis=>[axis,new Set(needs.filter(o=>o.axis===axis).map(o=>o.projectId)).size]).filter(([,n])=>n>=2);
    const supportView=row('다음 점검에서 함께할 학생·모둠',needs.length?needs.slice(0,12).map(o=>'<article class="sc-feedback">'+sourceLink(o,'observe',o.learner+' · '+o.title)+tag(o.axis)+'<p>'+esc(o.note)+'</p>'+hint(o.quote?'근거가 된 원문 · '+o.quote:o.n?'작품 버전 '+o.n:'근거를 더 모으고 있어요.')+(o.nextQuestion?hint('다음 질문 · '+o.nextQuestion):'')+'</article>').join(''):hint('프로젝트의 교사 관찰에서 다음 점검에 함께할 항목을 표시할 수 있어요.'))+
      row('여러 프로젝트에 공통된 점검 항목',patterns.length?patterns.map(([axis,n])=>hint(axis+' · '+n+'개 프로젝트에서 교사가 점검을 선택했어요.')).join(''):hint('두 개 이상의 프로젝트에서 함께 점검하기로 한 관찰 항목이 아직 없어요.'))+
      row('피드백 뒤 처음 달라진 버전',mgr.changes?.length?mgr.changes.map(v=>'<article class="sc-feedback">'+sourceLink(v,'versions',v.title+' · 버전 '+v.fromN+' → '+v.toN)+hint('받은 의견 · '+v.feedback)+hint('학생이 남긴 수정 이유 · '+(v.reason||'기록 전'))+'</article>').join(''):hint('피드백을 받은 뒤 새 작품 버전이 생기면 이곳에서 비교해요.'));
    const pending=mgr.exhibits.filter(e=>e.status==='pending');
    const credentials=issued?`<section class="sc-issued" role="status"><strong>${esc(issued.name)} 개인 참여 정보</strong><p>학급 코드 <b>${esc(issued.classCode)}</b> · 아이디 <b>${esc(issued.login)}</b> · PIN <b>${esc(issued.secret)}</b></p>${hint('학생에게 개별로 전달해 주세요. 화면을 닫으면 PIN은 다시 표시되지 않아요.')}${button('dismiss','전달 완료')}</section>`:'';
    const studentsForm=form('student',input('name','학생 별명','','text','required maxlength="45" placeholder="실명 대신 별명"'),'개인 참여 정보 발급');
    const teamForm=students.length?form('team',input('name','모둠 이름','','text','required maxlength="80"')+'<fieldset><legend>함께할 학생</legend>'+students.map(s=>check('members',s.name,s.id)).join('')+'</fieldset>','선택한 학생으로 모둠 만들기'):hint('먼저 학생 별명을 등록해 주세요.');
    const taskForm=form('assignment',input('title','과제 이름',task?.title||'','text','required maxlength="140"')+area('goal','학습 목표·수업 질문',set.goal)+area('resources','탐구 자료와 출처',set.resources)+area('criteria','교사가 관찰할 근거',set.criteria)+input('checkpoint','함께 점검할 시점',set.checkpoint)+select('help','AI 도움 정도',['질문 중심','힌트와 예시','제작 지원'],set.help)+
      '<fieldset><legend>허용할 제작 도구</legend>'+toolList.map(t=>check('tools',names[t],t,(set.tools||toolList).includes(t))).join('')+'</fieldset>'+input('quota','학생별 하루 이미지·영상 생성 한도',set.quota??12,'number','min="0" max="200" required'),task?'과제 수정 저장':'과제 등록');
    return classPicker()+row(cl.name,tag('학급 코드 '+cl.code)+hint('학생에게는 개인 아이디와 PIN도 전달해 주세요.')+createClass)+credentials+
      row('학생과 모둠',details('학생 등록 · 참여 정보 관리',studentsForm+students.map(s=>`<div class="sc-item"><span>${esc(s.name)} · ${esc(s.login)}</span>${button('resetpin','PIN 재발급','sc-secondary','data-id="'+esc(s.id)+'"')}</div>`).join(''),!students.length)+details('모둠 구성',teamForm+mgr.teams.map(g=>hint(g.name+' · '+g.members.map(id=>students.find(s=>s.id===id)?.name||'학생').join(', '))).join('')))+
      row('과제와 자료',assignments.map(a=>`<div class="sc-item"><span>${esc(a.title)}</span>${button('edittask','설정 수정','sc-secondary','data-id="'+esc(a.id)+'"')}</div>`).join('')+details(task?'선택한 과제 수정':'새 과제 만들기',taskForm,!!task||!assignments.length))+
      row('작품 전시 확인',pending.length?hint('승인할 버전과 공개 자료를 프로젝트에서 먼저 확인해 주세요.'):hint('확인을 기다리는 작품이 없어요.'))+
      (mgr.exhibits.length?row('전시 요청과 승인 상태',mgr.exhibits.map(e=>`<div class="sc-item"><div>${projectLink(e.projectId,e.title)} ${tag(statuses[e.status])}${details('신청한 버전 '+e.n+' 확인',hint(e.description||'별도 전시 소개가 없어요.')+hint(e.displayName+' · '+e.stage+' · '+(e.remix?'이어 만들기 허용':'감상만 허용'))+e.assets.map(a=>artifact(a,home+projectPath(e.projectId)+'/asset/'+a.id)).join(''))}</div>${button(e.status==='approved'?'revoke':'approve',e.status==='approved'?'전시 취소':'선택 버전 승인','sc-secondary','data-id="'+esc(e.id)+'"')}</div>`).join('')):'')+
      supportView+row('학생 프로젝트와 관찰',projectCards(state.projects.filter(p=>p.classId===classId))+(mgr.observations.length?mgr.observations.slice(0,10).map(o=>`<div class="sc-item"><div>${projectLink(o.projectId,o.title)} ${tag(rubricState(o.state))}<p>${esc(o.axis)} · ${esc(o.note||'현재 기록만으로 확인하기 어려움')}</p>${o.nextQuestion?hint('다음 질문 · '+o.nextQuestion):''}</div></div>`).join(''):hint('프로젝트에서 발화·결정 또는 작품 버전을 골라 관찰을 남길 수 있어요.')))+
      row('선택한 연구 기록 내보내기',form('export','<fieldset><legend>승인받은 프로젝트</legend>'+state.projects.filter(p=>p.classId===classId).map(p=>check('projectIds',p.title,p.id)).join('')+'</fieldset>'+check('observations','교사 관찰 포함')+check('personal','모둠원의 개인 기록 포함')+check('assets','첨부 자료 설명 포함')+check('approved','연구에 사용할 범위와 참여 동의를 확인했어요.')+hint('계정 식별자는 가명으로 바뀌어요. 본문에 학생이 적은 이름 등은 공유 전에 검토해 주세요.'),'가명 처리 JSON 내려받기'));
  }

  function artifact(a,url,allowText=true){
    const mime=a.mime||'',label=esc(a.title||'작품'),href=esc(url),present=a.size>0;
    const expectedFile=({web:/\.html?$/i,'3d':/\.stl$/i,robot:/\.json$/i})[a.kind];
    const canPreview=a.previewable??(expectedFile?.test(a.filename||'')&&!/\.dol(?:-(?:web|3d|robot|storyboard))?\.json$/i.test(a.filename||''));
    const fab=present&&canPreview&&['web','3d','robot'].includes(a.kind)?button('preview','작품 미리보기','sc-secondary','data-url="'+esc(url)+'" data-kind="'+a.kind+'"'):'';
    const media=!present?'':mime.startsWith('image/')?`<img loading="lazy" src="${href}" alt="${label}">`:mime.startsWith('video/')?`<video controls preload="metadata" src="${href}" aria-label="${label}"></video>`:mime.startsWith('audio/')?`<audio controls preload="none" src="${href}" aria-label="${label}"></audio>`:'';
    const publicLink=a.kind==='city'?publicCityUrl(a.publicUrl):'';
    const city=publicLink?'<a class="sc-inline" href="'+esc(publicLink)+'" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">도시 작품 열기 ↗</a>':'';
    return `<figure class="sc-art"><figcaption><strong>${label}</strong></figcaption>${media}${fab}${city}${allowText&&a.description?`<p class="sc-text">${esc(a.description)}</p>`:''}${present?`<a class="sc-inline" href="${href}" download="${esc(a.filename||a.title)}">파일 내려받기</a>`:''}</figure>`;
  }
  async function previewFabrication(button){
    const figure=button.closest('figure'),url=button.dataset.url,kind=button.dataset.kind;
    if(figure.querySelector('.sc-fab-preview'))return;
    const panel=document.createElement('div');panel.className='sc-fab-preview';figure.append(panel);button.disabled=true;
    try {
      const response=await fetch(url,{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw Error('작품 파일을 열 수 없어요.');
      const {renderFabricationPreview}=await import('./fabrication.mjs');
      let source;
      if(kind==='web'){const html=await response.text();source={mode:'code',html,css:''};}
      else if(kind==='3d'){const {readSTL}=await import('./fab-mesh.mjs');const part=readSTL(await response.arrayBuffer(),'전시 모형');source={parts:[part],selected:part.id};}
      else{const plan=await response.json();if(plan.format!=='dol-device-independent-plan')throw Error('이 자료는 모형 동작 계획 형식이 아니에요.');const steps=Array.isArray(plan.steps)?plan.steps:[];const move=steps.find(s=>s.action==='move_model_arm')||{};source={start:plan.start,delay:steps.find(s=>s.action==='wait')?.seconds,arm:move.length_mm,target:move.switch_distance_mm,hold:steps.find(s=>s.action==='check_contact')?.hold_seconds};}
      if(!root.contains(panel))return;renderFabricationPreview(panel,kind,source);
      if(kind==='robot'){const p=document.createElement('p');p.textContent='장치 독립형 모형 계획 · 실제 장치 작동 미검증';panel.append(p);}
    }catch(e){panel.textContent=e.message||'이 파일을 미리 볼 수 없어요.';}
  }
  function galleryPage(){
    const e=exhibitDetail,back=galleryLocation.home?homeListUrl(typeFilter):galleryListUrl(typeFilter,classId);
    const backLink='<a class="sc-inline" href="'+esc(back)+'">'+(galleryLocation.home?'← 연구소 홈':'← 작품 목록')+'</a>';
    if(selectedExhibit&&!e)return backLink+row('작품을 열 수 없어요.',hint(state.user?'이 학급에서 전시 중인 작품만 볼 수 있어요.':'친구 작품을 보려면 해당 학급에 참여해 주세요.')+(!state.user?'<a class="sc-inline" href="#join">수업 참여</a>':''));
    if(e)return backLink+row(e.title,tag(stageLabel(e.stage))+`<p>${esc(e.displayName)} · 버전 ${e.number}</p><p class="sc-text">${esc(e.description)}</p>`+
      e.assets.map(a=>artifact(a,home+'gallery/'+e.id+'/asset/'+a.id)).join(''))+
      row('친구에게 남기는 의견',form('peer',select('kind','어떤 의견인가요?',reactions)+area('body','궁금한 점이나 구체적인 의견','','required maxlength="2400"')+check('public','다른 친구에게도 이 의견을 보여요.'),'의견 남기기')+
      (e.comments.length?e.comments.map(c=>`<div class="sc-feedback">${tag(c.kind)}<p>${esc(c.body)}</p></div>`).join(''):hint('아직 공개한 의견이 없어요.')))+
      (e.remix?row('이 아이디어 이어 만들기',form('remix',input('title','새 프로젝트 이름',e.title+' 이어 만들기','text','required maxlength="120"')+area('change','내가 다르게 해 보고 싶은 점'),'내 프로젝트로 이어 만들기')):'');
    const rows=filterGallery(exhibits,typeFilter),examples=filterGallery(gallerySamples(),typeFilter);
    const classSelect=state.classes.length>1 ? select('active-class','학급 선택',[['','참여한 모든 학급'],...state.classes.map(c=>[c.id,c.name])],classId) : '';
    const approved=state.user ? row('학급 전시',rows.length ? exhibitCards(rows,typeFilter,classId) : hint(exhibits.length && typeFilter!=='all'?'이 유형으로 전시한 학급 작품이 아직 없어요.':'아직 선생님이 전시를 승인한 작품이 없어요.')) : '';
    const exampleList=examples.length ? row('창작 아이디어 예시',sampleCards(examples,typeFilter,'gallery',classId)) : '';
    const empty=!rows.length&&!examples.length ? galleryEmpty(typeFilter) : '';
    const join=!state.user&&state.reachable ? '<p class="sc-hint"><a class="sc-inline" href="#join">수업에 참여</a>하면 우리 반 친구들이 전시한 작품도 볼 수 있어요.</p>' : '';
    return classSelect+galleryFilters(typeFilter)+join+(!rows.length&&!examples.length ? empty : approved+exampleList);
  }
  const draftLabels={goal:'발견한 문제나 표현하고 싶은 생각',resources:'감상 자료 · 출처 · 생활 속 관찰',plan:'어떤 순서와 조건으로 만들까요?',alternatives:'다르게 해 볼 방법',reason:'이 방법을 선택한 이유',prediction:'예상한 모습',actual:'직접 시험하거나 감상한 결과',cause:'그렇게 된 까닭',change:'다음에 바꿀 점',retest:'다시 시험한 결과',next:'다음에 이어 할 일'};
  function draftFields(keys){return keys.map(k=>area('draft-'+k,draftLabels[k],project.draft[k],'data-draft="'+k+'" maxlength="4500"')).join('');}
  function notesPage(){
    const a=assignment();
    const info=a?row('수업 자료와 목표',`<strong>${esc(a.title)}</strong><p class="sc-text">${esc(a.settings.goal)}</p>${a.settings.resources?hint(a.settings.resources):''}${a.settings.checkpoint?hint('점검 시점 · '+a.settings.checkpoint):''}`):'';
    const custom=project.origin?row('아이디어의 출발점',hint(project.origin.title+' · '+project.origin.displayName)+hint(project.origin.description)):'';
    return info+custom+row('목표와 계획',input('draft-title','프로젝트 이름',project.title,'text','data-draft-title maxlength="120"')+draftFields(['goal','resources','plan','alternatives','reason','next']))+
      row('생각 · 결정 · 개인 기여',form('record',select('kind','기록할 내용',['생각','결정','대화','시험','기여'])+select('source','아이디어의 출발점',['학생','친구','AI','수업 자료','교사'])+area('body','무엇을 검토하고 선택했나요?','','required maxlength="5000"')+(project.teamId?check('personal','나와 담당 선생님에게만 보이는 개인 기록'):''),
      '기록 남기기')+project.records.map(r=>`<article class="sc-feedback">${tag(r.kind)} ${tag(r.personal?'개인 기록':r.source)} <strong>${esc(r.author)}</strong><p class="sc-text">${esc(r.body)}</p><small>${esc(today(r.createdAt))}</small></article>`).join(''));
  }
  function operatorPage(){
    if(state.user.role!=='operator'||!opsState)return row('운영 관리',hint('운영 계정으로 로그인해 주세요.'));
    const x=opsState,statusLabels={reserved:'접수 준비',submitted:'엔진에 제출',running:'실행 중',queued:'대기 중',completed:'완료',succeeded:'완료',failed:'실패',cancelled:'취소',canceled:'취소',rejected:'제출 실패'};
    const g=x.google||{},teacherOptions=x.teachers.map(t=>[t.id,t.name+' · '+t.login]);
    const googleConfig=g.managedByEnvironment?hint('서버 환경 변수 DOL_GOOGLE_CLIENT_ID에서 관리 중이에요.'):form('google-config',input('clientId','Google 웹 클라이언트 ID',g.clientId||'','text','autocomplete="off" maxlength="256" placeholder="…apps.googleusercontent.com"')+hint('웹 애플리케이션을 만든 뒤 승인된 JavaScript 원본에 '+location.origin.replace('://127.0.0.1', '://localhost')+' 를 등록해요. 비우고 저장하면 Google 로그인을 닫아요.')+'<p><a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noopener noreferrer">Google 웹 클라이언트 발급 화면 열기 ↗</a></p>','로그인 설정 저장');
    const googleAccounts=x.teachers.map(t=>{const a=(g.accounts||[]).find(i=>i.id===t.id);if(!a?.invited&&!a?.linked)return '';return '<div class="sc-item"><div><strong>'+esc(t.name)+'</strong><p>'+esc(a.linked?'연결 · '+a.linked:'초대 · '+a.invited+' · '+today(a.expires)+'까지')+'</p></div>'+button('google-revoke',a.linked?'연결 해제':'초대 취소','sc-secondary','data-id="'+esc(t.id)+'"')+'</div>';}).join('');
    const googleAdmin=row('교사 Google 로그인',googleConfig+hint('로컬 승인된 JavaScript 원본 · http://localhost 와 http://localhost'+(location.port?':'+location.port:''))+form('google-invite',select('teacherId','연결할 기존 교사 계정',teacherOptions)+input('email','초대할 교사의 Google 이메일','','email','required maxlength="254" autocomplete="off"')+hint('교사가 7일 안에 해당 Google 계정으로 로그인하면 연결돼요. 초대 이메일은 발송되지 않아요.'),'이메일 초대 등록')+googleAccounts);
    const mb=n=>(Number(n||0)/1048576).toFixed(1)+' MB';
    return (issued?row('새로 발급한 교사 접속 정보',`<p>${esc(issued.name)} · 아이디 <b>${esc(issued.login)}</b> · 비밀번호 <b>${esc(issued.secret)}</b></p>${button('dismiss','별도로 전달했어요.')}`):'')+
      row('운영 현황',hint('학급 '+x.counts.classes+'개 · 학생 계정 '+x.counts.students+'개 · 프로젝트 '+x.counts.projects+'개')+hint('첨부 파일 '+mb(x.storageBytes)+' · 데이터베이스 본체 '+mb(x.dbBytes)))+
      googleAdmin+row('교사 계정',form('staff',input('name','교사 표시 이름','','text','required maxlength="60"'),'교사 접속 정보 발급')+x.teachers.map(t=>`<div class="sc-item"><strong>${esc(t.name)} · ${esc(t.login)}</strong>${button('resetstaff','비밀번호 재발급','sc-secondary','data-id="'+esc(t.id)+'"')}</div>`).join(''))+
      row('지원 도구',form('optools','<fieldset><legend>수업에서 사용할 수 있는 도구</legend>'+toolList.map(t=>check('tools',names[t],t,x.tools.includes(t))).join('')+'</fieldset>','도구 설정 저장'))+
      row('엔진 연결과 수업 작업',Object.entries({chat:'대화 모델',image:'이미지 엔진',video:'영상 엔진'}).map(([k,name])=>hint(name+' · '+(engineFlags[k]?.ready?'연결됨':'연결 필요'))).join('')+
      (x.jobs.length?x.jobs.map(j=>hint((statusLabels[j.status]||j.status)+' · '+j.count+'건')).join(''):hint('아직 수업에서 요청한 생성 작업이 없어요.')));
  }
  function makePage(){
    const allow=(assignment()?.settings.tools||toolList).filter(t=>(state.supportedTools||toolList).includes(t));
    return row('제작 도구',hint('하나의 프로젝트에서 여러 도구를 사용하고, 담을 결과를 직접 선택해요.')+`<div class="sc-toolgrid">${allow.map(t=>button('tool',names[t],'sc-tool','data-tool="'+t+'"')).join('')+(allow.includes('3d')?button('tool','Seokam 3D 스위치','sc-tool','data-tool="switch"'):'')}</div>`)+
      row('프로젝트에 자료 담기',form('asset',input('title','자료 이름','','text','required maxlength="120"')+select('kind','자료 종류',Object.entries(names))+area('description','그림이나 파일에 관한 설명','','maxlength="24000"')+input('file','파일 · 그림 · 녹음 · 시험 영상 (최대 16MB)','','file'),'선택한 자료 등록'))+
      row('프로젝트 자료',project.assets.length?project.assets.map(a=>artifact(a,home+base()+'/asset/'+a.id)).join(''):hint('아직 등록한 작품이나 시험 자료가 없어요.'));
  }
  function feedbackPage(){
    const versions=project.versions;
    return row('작품과 연결된 피드백',versions.length?form('feedback',select('versionId','함께 살펴본 작품 버전',versions.map(v=>[v.id,'버전 '+v.n]),version()?.id)+select('recordId','함께 살펴본 발화·결정',[['','버전 전체'],...project.records.map(r=>[r.id,r.kind+' · '+r.body.slice(0,46)])])+area('body','질문이나 구체적인 의견','','required maxlength="2400"'),'피드백 남기기'):hint('먼저 작품 버전을 저장하면 그 버전과 연결해 의견을 남길 수 있어요.'))+
      row('받은 의견과 다음 선택',project.feedback.length?project.feedback.map(f=>`<article class="sc-feedback">${tag(f.kind)} <strong>${esc(f.author)}</strong> · 버전 ${project.versions.find(v=>v.id===f.versionId)?.n||''}<p class="sc-text">${esc(f.body)}</p>${f.responses.map(r=>hint(r.author+' · '+r.status+(r.reason?' · '+r.reason:''))).join('')}${details('내가 선택한 방법',form('respond',`<input type="hidden" name="feedbackId" value="${esc(f.id)}">`+select('status','의견을 어떻게 다루었나요?',adopted)+area('reason','선택한 이유'),'반영 기록 남기기'))}</article>`).join(''):hint('아직 받은 피드백이 없어요.'));
  }
  function versionsPage(){
    const v=version(),arr=project.versions;
    let inspected='';
    if(v){
      const old=arr.find(x=>x.n===v.n-1),fields=Object.keys(draftLabels).filter(k=>v.snapshot.draft[k]||old?.snapshot.draft[k]);
      const comparison=fields.map(k=>`<tr><th scope="row">${esc(draftLabels[k])}</th>${old?`<td>${esc(old.snapshot.draft[k]||'—')}</td>`:''}<td>${esc(v.snapshot.draft[k]||'—')}</td></tr>`).join('');
      const files=project.assets.filter(a=>v.snapshot.assetIds.includes(a.id));
      inspected=row('이전 버전과 비교',select('inspect-version','살펴볼 버전',arr.map(x=>[x.id,'버전 '+x.n]),v.id)+`<p>${esc(v.reason)} ${v.restoredFrom?tag('이전 버전에서 복구'):''}</p>`+(comparison?`<div class="sc-table"><table><thead><tr><th>기록</th>${old?`<th>버전 ${old.n}</th>`:''}<th>버전 ${v.n}</th></tr></thead><tbody>${comparison}</tbody></table></div>`:'')+
      files.map(a=>artifact(a,home+base()+'/asset/'+a.id)).join('')+
      (v.snapshot.recordIds.length?details('이 버전에 담긴 공동 기록',project.records.filter(r=>v.snapshot.recordIds.includes(r.id)).map(r=>hint(r.kind+' · '+r.body)).join('')):'')+
      form('restore',area('reason','이 상태부터 다시 만드는 이유','','maxlength="1500"'),'이 버전을 새 버전으로 복구'))+
      row('학급 전시 신청',hint('선택한 버전의 전시 소개와 체크한 작품만 선생님 승인 후 같은 학급에 보여요.')+form('exhibit',input('title','전시할 제목',v.snapshot.title,'text','required maxlength="120"')+area('description','친구에게 공개할 소개·바꾼 점·다음 시도')+select('stage','현재 상태',phases)+
      '<fieldset><legend>공개할 작품 선택</legend>'+files.map(a=>check('assetIds',a.title+(/\.dol(?:-(?:web|3d|robot|storyboard))?\.json$/i.test(a.filename||'')?' · 편집 원본 전체를 함께 공개':''),a.id)).join('')+'</fieldset>'+check('showName','내 별명을 전시에 표시')+check('remix','친구가 공개한 자료를 가져가 새 프로젝트로 이어 만들어도 좋아요.'),'선택 버전 전시 신청')+
      project.exhibits.map(e=>hint(e.title+' · '+statuses[e.status])).join(''));
    }
    return row('작품 버전 남기기',form('version',(project.assets.length?'<fieldset><legend>이 버전에 담을 작품</legend>'+project.assets.map(a=>check('assetIds',a.title,a.id,!project.versions[0]||project.versions[0].snapshot.assetIds.includes(a.id)||a.createdAt>project.versions[0].createdAt)).join('')+'</fieldset>':'')+area('reason','이번 버전에서 시도하거나 바꾼 점','','maxlength="1500"'),'현재 기록과 작품을 버전으로 저장'))+inspected;
  }
  function observePage(){
    const o=project.observations.find(o=>o.id===editObservation);
    return row('근거를 보고 관찰 기록',hint('발화·결정이나 작품 버전을 선택하고 학생이 한 일을 기록해요. 로컬 AI 초안도 선택한 근거를 바탕으로 담당 교사가 검토해요.')+
      form('observe',select('axis','관찰 항목',axes,o?.axis)+select('versionId','근거가 되는 버전',[['','아직 선택하지 않음'],...project.versions.map(v=>[v.id,'버전 '+v.n])],o?.versionId||'')+
      select('recordId','근거가 되는 발화·결정',[['','아직 선택하지 않음'],...project.records.map(r=>[r.id,r.author+' · '+r.body.slice(0,42)])],o?.recordId||'')+
      button('obsdraft','선택한 근거로 로컬 AI 초안 받기')+'<input type="hidden" name="draftId" value="'+esc(o?.draftId||'')+'"><p class="sc-hint" data-draft-info aria-live="polite">'+esc(o?.model?o.model+' · 인용 근거 「'+o.quote+'」':'모델이 연결되어 있을 때 사용할 수 있어요.')+'</p>'+area('note','학생이 보여 준 행동이나 설명',o?.note)+area('nextQuestion','다음 질문',o?.nextQuestion)+select('state','검토 상태',['검토 중','확인','보류'],o?.state)+check('support','다음 점검에서 이 학생·모둠과 함께 살펴보기','1',!!o?.support),o?'관찰 수정 저장':'관찰 저장'))+
      row('교사 전용 관찰',project.observations.length?project.observations.map(o=>`<article class="sc-feedback">${tag(o.state)} <strong>${esc(o.axis)}</strong>${o.model?tag('로컬 AI 초안 · 교사 검토'):''}<p>${esc(o.note||'현재 기록만으로 확인하기 어려움')}</p>${o.recordId?hint('발화·결정 · '+(project.records.find(r=>r.id===o.recordId)?.body||'')):''}${o.versionId?hint('연결 작품 · 버전 '+(project.versions.find(v=>v.id===o.versionId)?.n||'')):''}${button('editobs','근거·검토 수정','sc-secondary','data-id="'+esc(o.id)+'"')}</article>`).join(''):hint('현재 기록만으로 확인하기 어려운 항목은 보류로 남길 수 있어요.'));
  }
  function projectPage(){
    if(!project)return row('프로젝트를 열 수 없어요','<a class="sc-inline" href="#projects">내 프로젝트로 돌아가기</a>');
    const tabs=[['plan','목표와 계획'],['make','만들기'],['test','시험과 수정'],['feedback','피드백'],['versions','버전과 전시'],...(teacher()?[['observe','교사 관찰']]:[])];
    return `<div class="sc-projecthead"><div>${tag(project.teamId?'모둠 작품':'개인 작품')} <strong>${esc(project.title)}</strong></div><span data-save-state>${dirty?'저장 중':'마지막 저장 '+esc(today(project.updatedAt))}</span></div><nav class="sc-tabs" aria-label="프로젝트 활동">${tabs.map(([id,label])=>button('tab',label,'sc-tab','data-tab="'+id+'" aria-pressed="'+(id===tab)+'"')).join('')}</nav>`+
      (tab==='plan'?notesPage():tab==='make'?makePage():tab==='test'?row('시험하고 다시 확인하기',draftFields(['prediction','actual','cause','change','retest'])):tab==='feedback'?feedbackPage():tab==='versions'?versionsPage():observePage());
  }
  function render(){
    if(!active)return;
    const body=view==='gallery'?galleryPage():!state?.user?guest():view==='projects'?projectsPage():view==='join'?accessCard():view==='teacher'?teacherPage() :view==='operator'?operatorPage():projectPage();
    root.innerHTML=`<header class="sc-head" ${opt.entryRole==='teacher'&&opt.returnHash&&!state?.user&&location.hash.startsWith('#teacher-live')?'hidden':''}><div><h1>${esc(view==='join'&&opt.entryRole?(opt.entryRole==='teacher'?'교사 수업 참여':'학생 수업 참여'):viewTitles[view]||'프로젝트')}</h1><p>${esc(viewIntros[view]||'')}</p></div>${state?.user?`<a class="sc-account" href="#join">${esc(state.user.name)} · ${state.user.role==='operator'?'운영자':teacher()?'교사':'학생'}</a>`:''}</header><p class="sc-status ${isError?'sc-error':''}" role="status" aria-live="polite" data-sc-status>${esc(notice)}</p>${body}`;
    if(view==='project'&&project&&state?.user?.role==='student')send('schoolactivity',{projectId:project.id,classId:project.classId,tool:['plan','make','test','feedback','versions'].includes(tab)?tab:'project'});
  }
  async function flush(leaving=false){
    clearTimeout(timer);if(saving)await saving;if(!dirty||!project)return;if(conflict)throw Error('다른 창에서 저장한 내용이 있어요. 현재 입력을 복사해 두고 프로젝트를 다시 열어 주세요.');
    const payload={revision:project.revision,title:project.title,draft:{...project.draft}};dirty=false;const ref=project;
    const keep=leaving&&new Blob([JSON.stringify(payload)]).size<60000;
    saving=api('PATCH',projectPath(ref.id),payload,keep).then(r=>{ref.revision=r.revision;ref.updatedAt=r.updatedAt;if(active&&query('[data-save-state]'))query('[data-save-state]').textContent='저장됨 · '+today(r.updatedAt);}).catch(e=>{dirty=true;conflict=e.status===409;if(active){if(query('[data-save-state]'))query('[data-save-state]').textContent='저장하지 못했어요';say(e.message,true);}throw e;}).finally(()=>{saving=null;});
    await saving;if(dirty)await flush(leaving);
  }
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&dirty)flush(true).catch(()=>{});},{signal:events.signal});
  window.addEventListener('pagehide',()=>{if(dirty)flush(true).catch(()=>{});},{signal:events.signal});
  window.addEventListener('beforeunload',e=>{if(dirty||saving){flush(true).catch(()=>{});e.preventDefault();e.returnValue='';}},{signal:events.signal});
  root.addEventListener('input',e=>{
    const t=e.target;if(!project||(!t.hasAttribute('data-draft')&&!t.hasAttribute('data-draft-title')))return;
    if(t.hasAttribute('data-draft-title'))project.title=t.value;else project.draft[t.dataset.draft]=t.value;
    dirty=true;if(query('[data-save-state]'))query('[data-save-state]').textContent='작성 중';clearTimeout(timer);timer=setTimeout(()=>flush().catch(()=>{}),500);
  },{signal:events.signal});
  root.addEventListener('change',async e=>{
    const t=e.target;try{
      if(view==='gallery'&&t.name==='active-class'){location.hash=galleryListUrl(typeFilter,t.value);return;}
      if(t.name==='active-class'){classId=t.value;issued=null;selectedExhibit='';editTask='';await init();}
      if(t.name==='inspect-version'){selectedVersion=t.value;render();}
      const form=t.closest('form[data-sc-form="observe"]');
      if(form&&['axis','versionId','recordId'].includes(t.name)&&form.elements.draftId.value){
        form.elements.draftId.value='';form.elements.note.value='';form.elements.nextQuestion.value='';
        form.querySelector('[data-draft-info]').textContent='근거가 바뀌었어요. 이 근거로 직접 작성하거나 새 초안을 확인해 주세요.';
      }
    }catch(err){say(err.message,true);}
  },{signal:events.signal});
  async function refresh(msg=''){notice=msg;isError=false;await init();}
  root.addEventListener('click',async e=>{
    const filter=e.target.closest('[data-work-type]');
    if(view==='gallery'&&filter){typeFilter=galleryKind(filter.dataset.workType);history.replaceState(history.state,'',galleryListUrl(typeFilter,classId));render();root.querySelector('[data-work-type="'+typeFilter+'"]').focus({preventScroll:true});return;}
    const b=e.target.closest('[data-sc]');if(!b)return;const a=b.dataset.sc;try{
      if(a==='practice'){send('labopen',{type:'practice'});return;}
      if(a==='logout'){await flush();await api('POST','logout',{});location.hash='join';location.reload();return;}
      if(a==='dismiss'){issued=null;render();return;}
      if(a==='edittask'){editTask=b.dataset.id;render();return;}
      if(a==='obsdraft'){
        const form=b.form,fields=form.elements,info=form.querySelector('[data-draft-info]');
        const selection=()=>({axis:fields.axis.value,versionId:fields.versionId.value,recordId:fields.recordId.value});
        const evidence=selection();if(!evidence.versionId&&!evidence.recordId)throw Error('초안을 받을 버전이나 발화·결정을 먼저 선택해 주세요.');
        if((fields.note.value||fields.nextQuestion.value)&&!confirm('현재 관찰 입력란을 새 초안으로 바꿀까요?'))return;
        b.disabled=true;info.textContent='선택한 근거로 로컬 모델에 관찰 초안을 요청하고 있어요.';
        try{
          const s=await api('POST',base()+'/observation-drafts',evidence);
          if(!form.isConnected||JSON.stringify(selection())!==JSON.stringify(evidence)){if(form.isConnected)info.textContent='근거가 바뀌었어요. 선택한 근거로 다시 요청해 주세요.';return;}
          fields.draftId.value=s.id;fields.note.value=s.note;fields.nextQuestion.value=s.nextQuestion;fields.state.value='검토 중';
          info.textContent=s.model+' · 인용 근거 「'+s.quote+'」 · 근거와 표현을 확인한 뒤 저장해 주세요.';
        }catch(err){info.textContent=err.message;say(err.message,true);}finally{b.disabled=false;}return;
      }
      if(a==='editobs'){editObservation=b.dataset.id;render();return;}
      if(a==='tab'){await flush();tab=b.dataset.tab;render();root.querySelector('[aria-pressed="true"][data-tab]')?.focus();return;}
      if(a==='tool'){await flush();const d=project.draft,s=assignment()?.settings;send('schooltool',{tool:b.dataset.tool,projectId:project.id,context:{projectId:project.id,schoolVersionId:version()?.id||null,title:project.title,goal:d.goal||s?.goal||'',plan:d.plan,resources:s?.resources||'',help:s?.help||'질문 중심',assignmentId:project.assignmentId}});return;}
      if(a==='preview'){await previewFabrication(b);return;}
      if(a==='google-revoke'){if(!confirm('이 교사의 Google 초대·연결을 해제하고 현재 수업 세션을 종료할까요?'))return;await api('POST','ops/google/revoke',{teacherId:b.dataset.id});await refresh('Google 초대와 연결을 해제했어요.');return;}
      if(a==='resetstaff'){if(!confirm('이 교사의 기존 비밀번호와 로그인 세션을 종료하고 새 비밀번호를 발급할까요?'))return;issued=await api('POST','ops/reset',{teacherId:b.dataset.id});await refresh();return;}
      if(a==='resetpin'){if(!confirm('이 학생의 이전 PIN과 로그인 세션을 종료하고 새 PIN을 발급할까요?'))return;issued=await api('POST','classes/'+classId+'/reset-student',{userId:b.dataset.id});await refresh();return;}
      if(a==='approve'||a==='revoke'){await api('POST','gallery/'+b.dataset.id+'/moderate',{status:a==='approve'?'approved':'revoked'});await refresh(a==='approve'?'선택한 버전을 학급에 전시했어요.':'전시를 종료했어요.');}
    }catch(err){say(err.message,true);}
  },{signal:events.signal});
  root.addEventListener('submit',async e=>{
    const f=e.target;if(!f.matches('[data-sc-form]'))return;e.preventDefault();
    const data=new FormData(f),v=k=>value(data,k),body=Object.fromEntries(data),act=f.dataset.scForm,submit=f.querySelector('[type=submit]');
    if(submit.disabled)return;submit.disabled=true;
    try{
      if(act.endsWith('-login')){const result=await api('POST','login',body);const target=result.user.role==='operator'?'#operator':result.user.role==='teacher'?(/^#teacher-live(?:\/[0-9a-z-]{1,80})?$/i.test(opt.returnHash||'')?opt.returnHash:'#teacher-live'):'#student';history.replaceState(null,'',target);location.reload();return;}
      await flush();
      if(act==='password'){await api('POST','account/password',body);location.hash='join';location.reload();return;}
      if(act==='google-config'){await api('POST','ops/google/config',{clientId:v('clientId')});await refresh('교사 Google 로그인 설정을 저장했어요.');return;}
      if(act==='google-invite'){await api('POST','ops/google/invite',{teacherId:v('teacherId'),email:v('email')});await refresh('선택한 교사의 이메일 초대를 등록했어요.');return;}
      if(act==='staff'){issued=await api('POST','ops/teachers',body);await refresh('교사 계정을 발급했어요.');return;}
      if(act==='optools'){await api('POST','ops/tools',{tools:data.getAll('tools')});await refresh('사용할 수 있는 도구를 저장했어요.');return;}
      if(act==='class'){const c=await api('POST','classes',body);classId=c.id;await refresh('학급을 만들었어요.');return;}
      if(act==='student'){issued=await api('POST','classes/'+classId+'/students',body);await refresh('개인 참여 정보를 발급했어요.');return;}
      if(act==='team'){await api('POST','classes/'+classId+'/teams',{name:v('name'),members:data.getAll('members')});await refresh('모둠을 만들었어요.');return;}
      if(act==='assignment'){await api(editTask?'PATCH':'POST','classes/'+classId+'/assignments'+(editTask?'/'+editTask:''),{...body,quota:Number(v('quota')),tools:data.getAll('tools')});editTask='';await refresh('과제 설정을 저장했어요.');return;}
      if(act==='project'){const p=await api('POST','projects',{...body,classId});location.hash='project/'+p.id;return;}
      if(act==='export'){const doc=await api('POST','classes/'+classId+'/export',{projectIds:data.getAll('projectIds'),approved:data.has('approved'),includeObservations:data.has('observations'),includePersonal:data.has('personal'),includeAssets:data.has('assets')});const url=URL.createObjectURL(new Blob([JSON.stringify(doc,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='돌AI-선택한-연구기록.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);say('선택한 기록의 가명 처리 파일을 만들었어요.');return;}
      if(act==='peer'){await api('POST','gallery/'+selectedExhibit+'/feedback',{...body,public:data.has('public')});await refresh('작품 버전에 의견을 남겼어요.');return;}
      if(act==='remix'){const p=await api('POST','gallery/'+selectedExhibit+'/remix',body);location.hash='project/'+p.id;return;}
      if(act==='record')await api('POST',base()+'/records',{...body,personal:data.has('personal')});
      if(act==='asset'){const file=data.get('file');await attachSchoolArtifact(project.id,{...body,file:file?.size?file:undefined});}
      if(act==='version'||act==='restore'){const result=await api('POST',base()+'/versions',{reason:v('reason'),revision:project.revision,assetIds:act==='version'?data.getAll('assetIds'):undefined,restoreId:act==='restore'?version()?.id:null});selectedVersion=result.id;}
      if(act==='feedback')await api('POST',base()+'/feedback',body);
      if(act==='respond')await api('POST',base()+'/respond',body);
      if(act==='observe'){await api('POST',base()+'/observations',{...body,support:data.has('support'),id:editObservation||undefined});editObservation='';}
      if(act==='exhibit')await api('POST',base()+'/exhibits',{...body,versionId:version()?.id,assetIds:data.getAll('assetIds'),showName:data.has('showName'),remix:data.has('remix')});
      await refresh(act==='restore'?'선택한 상태를 새 버전으로 저장했어요.':act==='exhibit'?'선생님에게 전시 승인을 요청했어요.':'저장했어요.');
    }catch(err){say(err.message,true);}finally{submit.disabled=false;}
  },{signal:events.signal});
  root.innerHTML='<p role="status">작업실을 열고 있어요.</p>';
  init().catch(err=>{if(active){root.innerHTML='<h1>프로젝트</h1><p role="status">'+esc(err.message)+'</p><a class="sc-inline" href="#projects">내 프로젝트로 돌아가기</a>';}});
  return ()=>{active=false;events.abort();clearTimeout(timer);flush().catch(()=>{});};
}

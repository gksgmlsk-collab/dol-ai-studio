import {storage} from './workspace-data.mjs';
const titleFor={dialogue:'생각 대화',image:'이미지',video:'영상','3d':'3D 설계',web:'홈페이지'};
const allowed=(context,project,type)=>{const a=context.assignments?.find(a=>a.id===project.assignmentId);return (!context.supportedTools||context.supportedTools.includes(type))&&(!a?.settings?.tools||a.settings.tools.includes(type));};
const option=(value,label)=>new Option(label,value);
export function preferredClass(ctx){if(ctx.user?.role!=='student')return '';try{const id=storage.getItem('dol.current-class');if(ctx.classes?.some(c=>c.id===id))return id;}catch{}return ctx.classes?.length===1?ctx.classes[0].id:'';}
function field(text,control){const label=document.createElement('label');label.append(document.createTextNode(text),control);return label;}
function actionLink(url,label){const a=document.createElement('a');a.href=url;a.textContent=label;return a;}
export function studentTools(el,context,{start,open,modal,dialog,projectId,onClass}){
 const classes=context.classes||[],projects=context.projects||[];
 const initial=projects.find(p=>p.id===projectId);
 let classId=initial?.classId||preferredClass(context)||(classes.length===1?classes[0].id:'');
 let selected='';
 function setClass(id){classId=id||'';if(context.user?.role==='student')try{if(id)storage.setItem('dol.current-class',id);else storage.removeItem('dol.current-class');}catch{}onClass(classId);}
 function remember(id){selected=id;try{storage.setItem('dol.student-project.'+classId,id);}catch{}}
 function createProject(type,chosen){
   modal('어떤 프로젝트에서 시작할까요?','<form class="student-create"><label>작품 이름<input name="title" required maxlength="120"></label><div data-class></div><div data-assignment></div><div data-team></div><p role="status"></p><button type="submit" class="dol-primary">프로젝트 만들고 '+titleFor[type]+' 열기</button></form>');
   const form=dialog.querySelector('.student-create');const c=document.createElement('select'),a=document.createElement('select'),team=document.createElement('select');
   form.elements.title.value=type==='dialogue'?'나의 아이디어':('나의 '+titleFor[type]+' 프로젝트');
   classes.forEach(v=>c.add(option(v.id,v.name)));c.value=chosen||classes[0]?.id||'';
   const assign=()=>{a.replaceChildren(option('','자유 프로젝트'));context.assignments?.filter(v=>v.classId===c.value&&(!v.settings?.tools||v.settings.tools.includes(type))).forEach(v=>a.add(option(v.id,v.title)));team.replaceChildren(option('','개인 프로젝트'));context.teams?.filter(v=>v.classId===c.value).forEach(v=>team.add(option(v.id,v.name)));};
   assign();c.onchange=assign;
   form.querySelector('[data-class]').append(field('학급',c));form.querySelector('[data-assignment]').append(field('과제',a));form.querySelector('[data-team]').append(field('작업 단위',team));
   form.onsubmit=async e=>{e.preventDefault();const status=form.querySelector('[role=status]'),btn=form.querySelector('button');const title=form.elements.title.value.trim();if(!title){status.textContent='작품 이름을 적어 주세요.';return;}btn.disabled=true;
    try{const r=await fetch('/api/school/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,classId:c.value,assignmentId:a.value||undefined,teamId:team.value||undefined})});const saved=await r.json();if(!r.ok)throw Error(saved.error||'프로젝트를 만들 수 없어요.');if(!form.isConnected||!dialog.open)return;setClass(c.value);remember(saved.id);dialog.close();open(type,saved.id,{title});}
    catch(error){status.textContent=error.message;btn.disabled=false;}
   };
 }
 function controls(){
   el.replaceChildren();const nav=document.createElement('nav');nav.className='student-links';nav.setAttribute('aria-label','학생 프로젝트 메뉴');
   if(!context.user){const n=document.createElement('span');n.className='student-guest';n.textContent='개인 연습 중';nav.append(n,actionLink('#join/student','학급 코드로 수업 참여'));}
   nav.append(actionLink('#projects','내 프로젝트'),actionLink('#city','도시개발 프로젝트'),actionLink('#switch','3D 스위치 실험'));
   if(context.user&&classes.length){const bar=document.createElement('div');bar.className='student-class-controls';
    if(classes.length>1){const c=document.createElement('select');c.add(option('','학급 선택'));classes.forEach(v=>c.add(option(v.id,v.name)));c.value=classId;c.onchange=()=>{setClass(c.value);controls();};bar.append(field('학급',c));}else{const n=document.createElement('strong');n.textContent=classes[0].name;bar.append(n);}
    const rows=projects.filter(p=>p.classId===classId);
    const p=document.createElement('select');p.add(option('','새 프로젝트'));rows.forEach(v=>p.add(option(v.id,v.title)));let stored=null;try{stored=storage.getItem('dol.student-project.'+classId);}catch{}
    const next=initial?.classId===classId&&initial.id===projectId?initial.id:stored!==null?(rows.some(r=>r.id===stored)?stored:''):(rows.length===1?rows[0].id:'');selected=next;p.value=next;p.onchange=()=>remember(p.value);if(classId)bar.append(field('작업할 프로젝트',p));el.append(bar);
   }
   el.append(nav);
 }
 setClass(classId);controls();
 return type=>{
   if(!context.user){start(type,{createNew:true});return;}
   if(context.user.role==='operator'||!classes.length){modal('수업 프로젝트','<p>학생이나 교사 계정으로 학급에 참여하면 작품을 만들 수 있어요.</p><a href="#join">수업 계정 열기</a>');return;}
   if(context.supportedTools&&!context.supportedTools.includes(type)){modal('수업 도구','<p>현재 학교에서 이 도구를 사용하지 않아요. 다른 공방을 골라 주세요.</p>');return;}
   const p=projects.find(x=>x.id===selected&&x.classId===classId);
   if(p){if(!allowed(context,p,type)){modal('다른 공방을 골라 주세요.','<p>선택한 프로젝트의 과제에서 사용할 수 있는 공방을 확인해 주세요.</p><a href="#project/'+encodeURIComponent(p.id)+'">과제와 제작 도구 보기</a>');return;}open(type,p.id,{title:p.title});return;}
   createProject(type,classId);
 };
}

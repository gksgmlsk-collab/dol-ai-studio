import {assets,escapeHtml as esc} from './home.mjs';
import {attachSchoolArtifact} from './school.mjs';
import {mountSwitchTool} from './switch-tool.mjs';
const cityUrl='https://namijini-future-city-production.up.railway.app/future-city/';
const specs={
 city:{name:'도시개발 프로젝트',title:'우리 동네의 미래를 설계해요',asset:'city',image:assets.city,question:'어떤 동네 문제를 해결하고 싶나요?',test:'도시를 바꾼 뒤 무엇이 달라졌나요?',kind:'city'},
 switch:{name:'3D 발명품 프로젝트',title:'3D 스위치를 설계하고 시험해요',asset:'switch',image:'./assets/original-switch.jpg',question:'누가 어떤 상황에서 이 스위치를 쓸까요?',test:'스위치를 작동시켜 보니 예상과 무엇이 같거나 달랐나요?',kind:'3d'}
};
export function linkedCards(){return '<section class="lp-cards"><h2>수업 프로젝트</h2><div>'+Object.entries(specs).map(([key,s])=>'<a href="#'+key+'"><img src="'+s.image+'" alt=""><span><strong>'+s.name+'</strong><small>'+(key==='city'?'미추홀 미래도시':'Seokam 3D 스위치')+' 열기 →</small></span></a>').join('')+'</div></section>';}
async function localDb(){return new Promise((ok,no)=>{const req=indexedDB.open('dol-private-practice-projects-v1',1);req.onupgradeneeded=()=>{req.result.createObjectStore('trials',{keyPath:'id'}).createIndex('type','type');};req.onsuccess=()=>ok(req.result);req.onerror=()=>no(req.error);});}
async function localTrials(type,entry){
 const db=await localDb();try{return await new Promise((ok,no)=>{const tx=db.transaction('trials',entry?'readwrite':'readonly'),store=tx.objectStore('trials');let rows=[];
 const request=entry?store.put(entry):store.index('type').getAll(type);request.onsuccess=()=>{if(!entry)rows=request.result.sort((a,b)=>b.date.localeCompare(a.date));};tx.oncomplete=()=>ok(rows);tx.onerror=tx.onabort=()=>no(tx.error||Error('저장 공간을 확인해 주세요.'));});}finally{db.close();}
}
const formats='.png,.jpg,.jpeg,.webp,.pdf,.zip,.json,.txt,.stl,.obj,.mp4,.webm';
function safeCityLink(value){if(!value.trim())return '';const u=new URL(value);if(u.origin!==new URL(cityUrl).origin||!u.pathname.startsWith('/future-city/')||u.username||u.password)throw Error('미래도시 사이트에서 복사한 작품 주소를 입력해 주세요.');return u.href;}
function link(href,text){const a=document.createElement('a');a.href=href;a.textContent=text;a.target='_blank';a.rel='noopener noreferrer';return a;}
function appendText(parent,tag,text){const e=document.createElement(tag);e.textContent=text;parent.append(e);return e;}
export function mountLinkedProject(el,type,ctx={}){
 const spec=specs[type],project=ctx.project,projectId=project?.id,user=ctx.user;let alive=true,stop=null,pending=false,requestId=crypto.randomUUID();const urls=new Set();
 const base=projectId?'/api/school/projects/'+encodeURIComponent(projectId):'';
 el.innerHTML='<div class="lp-page"><a class="dol-back" href="'+(project?'#project/'+encodeURIComponent(project.id):'#home')+'">← '+(project?esc(project.title):'연구소 홈')+'</a><header><div><p>'+spec.name+'</p><h1>'+spec.title+'</h1></div><img src="'+spec.image+'" alt=""></header><section data-tool></section><section class="lp-record"><h2>이번 시도 기록하기</h2><div data-record></div></section><section class="lp-past"><h2>'+ (project?'프로젝트에 담은 기록':'이 브라우저에서 담은 기록')+'</h2><div data-past></div></section></div>';
 const tool=el.querySelector('[data-tool]'),slot=el.querySelector('[data-record]'),past=el.querySelector('[data-past]');
 if(type==='city'){
 tool.className='lp-launch';tool.innerHTML='<h2>미추홀 미래도시</h2><p>지도에서 바꾸고 싶은 곳을 찾고, 정해진 예산 안에서 도시를 설계해 보세요. 새 탭에서 작업한 뒤 이곳에 결과를 담을 수 있어요.</p><div class="dol-actions"></div><small>미래도시 사이트에서 발급한 학급 코드로 참여해요.</small>';const actions=tool.querySelector('.dol-actions');const open=link(cityUrl,'미래도시 프로젝트 열기 ↗');open.className='dol-primary';actions.append(open,link(cityUrl+'community.html','미래도시 공개 작품 보기 ↗'));if(user?.role==='teacher')actions.append(link(cityUrl+'teacher.html','미래도시 교사 화면 ↗'));
 }else{stop=mountSwitchTool(tool,{user,role:user?.role,classes:ctx.classes||[],schoolProjectId:projectId,classId:project?.classId,onBack:()=>{location.hash=project?'#project/'+project.id:'#home';}});const free=document.createElement('button');free.type='button';free.className='lp-free';free.textContent='자유 3D 설계 공방 열기 →';free.onclick=()=>ctx.freeDesign?.();tool.append(free);}
 function release(){for(const u of urls)URL.revokeObjectURL(u);urls.clear();}
 async function historyRows(){if(projectId){const response=await fetch(base,{cache:'no-store'});if(!response.ok)throw Error('프로젝트 기록을 열 수 없어요.');const data=await response.json();return data.assets.filter(x=>x.kind===spec.kind&&(type==='city'||x.description?.startsWith('Seokam 3D 스위치 · 실험 기록'))).map(a=>({id:a.id,title:a.title,text:a.description,date:a.createdAt,href:a.size?base+'/asset/'+encodeURIComponent(a.id):null,filename:a.filename}));}return localTrials(type);}
 async function drawPast(){try{const rows=await historyRows();if(!alive)return;release();past.replaceChildren();if(!rows.length){past.textContent='첫 시도를 담으면 여기서 다시 볼 수 있어요.';return;}for(const row of rows){const item=document.createElement('details');appendText(item,'summary',row.title);if(row.text)appendText(item,'p',row.text);let href=row.href;if(row.file){href=URL.createObjectURL(row.file);urls.add(href);}if(href){const a=link(href,row.filename||'결과 파일 열기');a.download=row.filename||'작품';item.append(a);}if(row.cityLink)item.append(link(row.cityLink,'미래도시 작품 열기 ↗'));else if(type==='city'){const raw=row.text?.split('\n').find(v=>v.startsWith('작품 주소 · '))?.slice('작품 주소 · '.length);try{if(raw)item.append(link(safeCityLink(raw),'미래도시 작품 열기 ↗'));}catch{}}past.append(item);}}catch(e){if(alive)past.textContent=e.message||'기록 저장소를 열 수 없어요.';}}
 if(user&&!project){
 el.querySelector('.lp-past').hidden=true;slot.innerHTML='<p>이번 시도를 담을 수업 프로젝트를 골라 주세요.</p><button class="dol-primary" type="button">수업 프로젝트 고르기</button> <a href="#projects">새 수업 프로젝트 만들기</a>';slot.querySelector('button').onclick=()=>ctx.choose?.();
 }else{
 slot.innerHTML='<form><label>작품 이름<input name="title" required maxlength="100" placeholder="'+(type==='city'?'예) 학교 앞을 걷기 좋은 길로':'예) 손바닥으로 누르는 스위치')+'"></label><label>'+spec.question+'<textarea name="reason" rows="2" maxlength="1200"></textarea></label><label>'+spec.test+'<textarea name="observed" rows="2" maxlength="1200"></textarea></label><label>다음에는 무엇을 고치고 싶나요?<input name="next" maxlength="700"></label>'+(type==='city'?'<label>공유할 미래도시 작품 주소 (선택)<input name="cityLink" type="url" placeholder="https://namijini-future-city-production.up.railway.app/future-city/…"></label>':'')+'<label>결과 파일 (선택 · 16MB까지)<input type="file" name="file" accept="'+formats+'"></label><small>'+(type==='city'?'미래도시에서 내려받은 보고서 PDF·PNG, 결과 묶음 ZIP 또는 작품 화면을 담을 수 있어요.':'설계 파일이나 스위치 시험 사진·영상을 담을 수 있어요.')+'</small><button class="dol-primary">'+(project?'수업 프로젝트에 담기':'이 브라우저에 담기')+'</button><p role="status"></p></form>';
 const form=slot.querySelector('form'),status=form.querySelector('[role=status]');form.oninput=()=>{requestId=crypto.randomUUID();};
 form.onsubmit=async e=>{e.preventDefault();if(pending)return;const fd=new FormData(form),value=k=>String(fd.get(k)||'').trim(),title=value('title'),file=fd.get('file')?.size?fd.get('file'):null;let cityLink='';
 try{if(type==='city'&&value('cityLink'))cityLink=safeCityLink(value('cityLink'));if(!title)throw Error('작품 이름을 입력해 주세요.');if(file?.size>16*1024*1024)throw Error('결과 파일은 16MB 이하로 골라 주세요.');const notes=[['처음 생각',value('reason')],['확인한 점',value('observed')],['다음 시도',value('next')],['작품 주소',cityLink]].filter(([,v])=>v).map(x=>x.join(' · '));if(!file&&!notes.length)throw Error('생각이나 확인한 점을 한 줄 쓰거나 결과 파일을 골라 주세요.');
 const text=[type==='city'?'미추홀 미래도시 · 설계 기록':'Seokam 3D 스위치 · 실험 기록',...notes].join('\n');pending=true;const controls=[...form.elements];controls.forEach(b=>b.disabled=true);status.textContent='기록을 담고 있어요.';
 if(projectId){await attachSchoolArtifact(projectId,{kind:spec.kind,title,description:text,file,filename:file?.name,clientKey:'linked-'+type+'-'+requestId});}
 else{await localTrials(type,{id:requestId,type,title,text,cityLink,file,filename:file?.name,date:new Date().toISOString()});}
 if(!alive)return;form.reset();requestId=crypto.randomUUID();status.textContent=project?'기록을 담았어요. 수업 프로젝트에서 이 결과를 버전으로 저장하고 전시를 신청할 수 있어요.':'이 브라우저에 기록을 담았어요.';await drawPast();
 }catch(err){if(alive)status.textContent=err.message||'저장하지 못했어요. 같은 기록을 다시 시도해 주세요.';}finally{pending=false;if(alive)for(const field of form.elements)field.disabled=false;}};
 void drawPast();
 }
 return ()=>{alive=false;release();if(typeof stop==='function')stop();};
}

import {getDialogues} from './dialogue.mjs';
import {getMakerProjects,getMakerAsset} from './maker.mjs';
import {attachSchoolArtifact} from './school.mjs';
import {escapeHtml as E} from './home.mjs';
const label={dialogue:'생각 카드',image:'이미지',video:'영상'};
export function classTools(container,type,localId,ctx){const bar=document.createElement('section');bar.className='dol-classbar';bar.innerHTML='<a href="#project/'+encodeURIComponent(ctx.schoolProjectId)+'">← '+E(ctx.title||'수업 프로젝트')+'</a><details><summary>수업 프로젝트에 담기</summary><label>보낼 버전 <select></select></label> '+(type==='dialogue'?'<label><input type="checkbox"> 이 카드까지 나눈 대화 포함</label> ':'')+'<button type="button">선택한 버전 담기</button></details><span role="status"></span>';container.prepend(bar);
 const select=bar.querySelector('select'),button=bar.querySelector('button'),status=bar.querySelector('[role=status]');
 const lookup=()=>type==='dialogue'?getDialogues().find(p=>p.id===localId):getMakerProjects().find(p=>p.id===localId);
 function refresh(){const current=select.value,rows=lookup()?.versions||[];select.replaceChildren(...rows.slice().reverse().map(v=>new Option((label[type]||'작품')+' v'+v.number,v.id)));if(rows.some(v=>v.id===current))select.value=current;button.disabled=!rows.length;if(!rows.length)status.textContent='공방에서 작품이나 생각 카드를 한 버전 저장한 뒤 담을 수 있어요.';}
 bar.querySelector('details').ontoggle=()=>{if(bar.querySelector('details').open){status.textContent='';refresh();}};
 button.onclick=async()=>{const p=lookup(),v=p?.versions.find(x=>x.id===select.value);if(!v)return;button.disabled=true;try{const pieces=[['내가 정한 생각',v.prompt],['예상',v.prediction],['관찰',v.observation],['피드백',v.feedback],['바꾼 이유',v.reason||v.revisionReason],['첫 장면',v.source?.title],['생성 방식',v.mode]].filter(x=>x[1]).map(x=>x.join(' — '));if(type==='dialogue'&&bar.querySelector('input').checked)pieces.push(...p.messages.filter(m=>m.createdAt<=v.createdAt).map(m=>(m.role==='user'?'나의 말':'돌아온 질문')+' — '+m.content));const file=type==='dialogue'?undefined:await getMakerAsset(v.assetId);if(type!=='dialogue'&&!file)throw Error('이 브라우저에서 작품 파일을 찾을 수 없어요.');const ext=file?.type?.split('/')[1]?.split(';')[0];await attachSchoolArtifact(ctx.schoolProjectId,{kind:type,clientKey:'class-'+type+'-'+v.id+'-'+(type==='dialogue'&&bar.querySelector('input').checked?'dialogue':'work'),title:(v.title||p.title||label[type])+' · v'+v.number,description:pieces.join('\n'),file,filename:file?'작품-v'+v.number+'.'+ext:undefined});status.textContent='수업 프로젝트에 담았어요. 프로젝트에서 작품 모음을 새 버전으로 저장할 수 있어요.';}catch(e){status.textContent=e.message;}finally{button.disabled=false;}};
 window.addEventListener('labchange',refresh);return ()=>window.removeEventListener('labchange',refresh);}
export async function saveFabrication(projectId,v){
 const notes=[v.text,v.reason&&'바꾼 이유 — '+v.reason,v.prediction&&'예상 — '+v.prediction,v.observation&&'관찰 — '+v.observation,v.feedback&&'피드백 — '+v.feedback].filter(Boolean).join('\n');
 await attachSchoolArtifact(projectId,{kind:v.kind,clientKey:'fab-'+v.id+'-output',title:v.title+' · v'+v.number,description:notes,file:v.file,filename:v.file.name});
 const source=new Blob([JSON.stringify({kind:v.kind,id:v.id,number:v.number,title:v.title,source:v.source,meta:v.meta})],{type:'application/json'});
 await attachSchoolArtifact(projectId,{kind:'file',title:v.title+' · 편집 원본 v'+v.number,description:'공방에서 다시 편집할 수 있는 원본',file:source,filename:v.id+'.dol-'+v.kind+'.json',clientKey:'fab-'+v.id+'-source'});
 for(const [i,file] of (v.attachments||[]).entries()){await attachSchoolArtifact(projectId,{kind:'file',clientKey:'fab-'+v.id+'-evidence-'+i,title:file.name,description:'실물 시험 기록 · '+v.title,file,filename:file.name});}
}

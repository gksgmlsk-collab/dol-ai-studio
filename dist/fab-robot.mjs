const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const phaseNames={idle:'준비',armed:'센서 신호 대기',wait:'시간 대기',move:'팔 이동',hold:'접촉 확인',back:'복귀',done:'종료',cancel:'취소'};
const uid=()=>crypto.randomUUID?.()||'run-'+Math.random().toString(36).slice(2);
export function newRobot(){return {start:'button',delay:3,hold:1,arm:48,target:48,parts:'고정대, 모형 팔, 모형 스위치',related3D:'',prediction:'',cause:'',changeReason:'',physicalNote:'',files:[],runs:[]};}
export const contact=s=>Math.abs(s.arm-s.target)<=4;
export function robotPlan(s){return {format:'dol-device-independent-plan',schema:1,execution:'simulation',timeBasis:'elapsed-seconds-after-start',start:s.start,steps:[{when:s.start==='sensor'?'simulated_sensor_signal':'start_button',action:'start_elapsed_timer'},{action:'wait',seconds:s.delay},{action:'move_model_arm',length_mm:s.arm,switch_distance_mm:s.target},{action:'check_contact',tolerance_mm:4,hold_seconds:s.hold},{action:'return_to_start'},{action:'finish'}],cancel:'cancel_and_return_to_rest',materials:s.parts,linkedDesign:s.related3D||null,prediction:s.prediction,observations:s.runs,possibleCause:s.cause,revision:s.changeReason,physicalTrial:{studentNote:s.physicalNote,attachments:s.files.map(f=>({id:f.id,name:f.name,type:f.type}))}};}
function draw(c,s,t,phase){
  const g=c.getContext('2d'),w=c.width,h=c.height;g.save();g.scale(w/700,h/340);g.fillStyle='#f6f1e4';g.fillRect(0,0,700,340);
  const ground=250,pivot=[110,152],scale=470/Math.max(95,s.arm+12,s.target+12),ang=(-42+(49*t))*Math.PI/180;
  const targetX=pivot[0]+s.target*scale,tip=[pivot[0]+s.arm*scale*Math.cos(ang),pivot[1]+s.arm*scale*Math.sin(ang)],pushed=(phase==='hold'&&contact(s));
  function polygon(coords,fill){g.fillStyle=fill;g.beginPath();coords.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();g.fill();}
  function box(x,y,bw,bh,fill){g.fillStyle=fill;g.fillRect(x,y,bw,bh);}
  box(35,ground,625,14,'#a79070');polygon([[35,ground],[47,ground-10],[666,ground-10],[660,ground]],'#d3b996');
  box(75,143,61,ground-143,'#9fb5a1');polygon([[136,143],[145,135],[145,239],[136,250]],'#72937c');box(72,135,65,14,'#76977e');
  const top=pivot[1]+s.target*scale*.12+9;box(targetX-25,top+15,50,ground-top-15,'#8eabb0');box(targetX-23,top+8,46,12,'#728d90');box(targetX-17,top+(pushed?8:0),34,pushed?5:12,pushed?'#4b7859':'#df996a');
  g.setLineDash([4,5]);g.strokeStyle='#a9a68f';g.beginPath();g.moveTo(pivot[0],ground+30);g.lineTo(targetX,ground+30);g.stroke();g.setLineDash([]);
  g.lineCap='round';g.strokeStyle='#926a43';g.lineWidth=22;g.beginPath();g.moveTo(...pivot);g.lineTo(...tip);g.stroke();g.strokeStyle='#dfb570';g.lineWidth=13;g.stroke();g.fillStyle='#395f4a';g.beginPath();g.arc(...pivot,13,0,Math.PI*2);g.fill();g.fillStyle='#f2e8bb';g.beginPath();g.arc(...pivot,5,0,Math.PI*2);g.fill();g.fillStyle='#aa7957';g.beginPath();g.arc(...tip,8,0,Math.PI*2);g.fill();
  g.font='18px sans-serif';g.fillStyle='#33483c';g.fillText('팔 '+s.arm+' mm',175,59);g.fillText('스위치 거리 '+s.target+' mm',125,307);g.font='bold 17px sans-serif';g.fillText(phaseNames[phase],555,42);g.restore();
}
export function robotThumbnail(s){const c=document.createElement('canvas');c.width=420;c.height=230;draw(c,s,.6,'move');return c.toDataURL('image/jpeg',.8);}
export function mountRobot(root,s,change,notice,env){
  let run=null,frame=0,phase='idle',progress=0,lastTick=-1;
  const $=sel=>root.querySelector(sel);
  const notes=(k,label)=>'<label>'+label+'<textarea data-robot="'+k+'" maxlength="1600">'+esc(s[k])+'</textarea></label>';
  const numeric=(k,label,min,max,step)=>'<label>'+label+'<input type="number" data-robot="'+k+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+s[k]+'"></label>';
  const related=env.meshRefs||[];
  function render(){
    root.innerHTML=`<div class="fb-work"><section class="fb-box"><h2>모형 스위치 계획</h2><label>시작 조건<select data-robot="start"><option value="button">시작 버튼 누르기</option><option value="sensor" ${s.start==='sensor'?'selected':''}>모형 센서 신호 받기</option></select></label><div class="fb-cols">${numeric('delay','시작 후 대기 (초)',0,60,.1)}${numeric('hold','동작 유지 (초)',0,10,.1)}</div><div class="fb-cols">${numeric('arm','팔 길이 (mm)',10,150,1)}${numeric('target','스위치 거리 (mm)',10,150,1)}</div>
    <label>연결할 3D 설계 버전<select data-robot="related3D"><option value="">연결할 버전 선택</option>${related.map(r=>'<option value="'+esc(r.id)+'" '+(r.id===s.related3D?'selected':'')+'>'+esc(r.title)+' · v'+esc(r.number)+'</option>').join('')}${s.related3D&&!related.some(r=>r.id===s.related3D)?'<option selected value="'+esc(s.related3D)+'">기록에 연결한 설계</option>':''}</select></label>
    ${notes('parts','모형에 필요한 부품')}${notes('prediction','예상한 결과')}<p class="fb-help">화면 속 팔과 스위치를 시험해요. 실제 보드와 모터 연결은 학교 장비 확인이 필요해요.</p></section>
    <section class="fb-box"><h2>경과 시간 시뮬레이션</h2><canvas class="fb-machine" width="700" height="340" aria-label="고정대 위의 모형 팔과 스위치"></canvas><p data-phase role="status"></p><div class="fb-choices"><button type="button" data-sim="start">시작</button><button type="button" data-sim="signal">센서 신호 보내기</button><button type="button" data-sim="cancel">취소</button><button type="button" data-sim="restart">다시 시작</button></div><p data-time class="fb-help"></p><p class="fb-help">시작 신호부터 초를 세어요. 팔 끝과 스위치 중심의 거리 차가 4mm 이내이면 모형 접점이 닿아요.</p><div data-runs></div></section></div>
    <section class="fb-box"><h2>시험·수정 기록</h2><div class="fb-cols">${notes('cause','결과가 나온 까닭은?')}${notes('changeReason','다음 시험에서 바꿀 점')}</div><details><summary>실물 시험 자료 등록</summary>${notes('physicalNote','내가 실제로 해 본 일·관찰')}<label>사진·영상 파일 추가<input type="file" data-evidence accept="image/png,image/jpeg,image/webp,video/mp4,video/webm"></label><div data-files></div><p class="fb-help">실물 시험 사진과 영상은 학생이 직접 등록해요.</p></details></section>`;
    showStatus();showRuns();files();
  }
  function showStatus(){
    const txt=$('[data-phase]');if(!txt)return;txt.textContent='현재 상태 · '+phaseNames[phase]+(phase==='hold'||phase==='done'?' · '+(contact(s)?'스위치 접촉':'팔 끝이 스위치를 벗어남'):'');
    const running=!!run;root.querySelectorAll('input[data-robot],select[data-robot]').forEach(e=>e.disabled=running);
    $('[data-sim="start"]').disabled=running;$('[data-sim="cancel"]').disabled=!running;$('[data-sim="signal"]').disabled=phase!=='armed';$('[data-sim="signal"]').hidden=s.start!=='sensor';draw($('canvas'),s,progress,phase);
  }
  function showRuns(){const n=$('[data-runs]');if(!n)return;n.innerHTML=s.runs.length?'<h3>시험 기록</h3><ol class="fb-runs">'+s.runs.slice(-5).reverse().map(r=>'<li><strong>'+esc(r.summary)+'</strong><small>'+esc(r.events.map(x=>x.label+' '+x.seconds+'초').join(' · '))+'</small></li>').join('')+'</ol>':'';}
  function files(){
    const n=$('[data-files]');if(!n)return;n.replaceChildren();for(const f of s.files){const b=document.createElement('button');b.type='button';b.textContent=f.name+' 내려받기';b.onclick=async()=>{const blob=await env.getFile(f.id);if(blob)env.download(blob,f.name);else notice('이 브라우저에서 원본 자료를 찾을 수 없어요.');};n.append(b);}
  }
  function mark(k,seconds){if(!run||run.events.at(-1)?.key===k)return;run.events.push({key:k,label:phaseNames[k],seconds:Math.round(seconds*10)/10});}
  function finish(k,seconds){
    if(!run)return;cancelAnimationFrame(frame);mark(k,seconds);phase=k;progress=0;
    const summary=k==='cancel'?'시뮬레이션 취소':contact(s)?'접점이 닿은 뒤 복귀했어요.':'스위치에 닿지 않고 복귀했어요.';
    s.runs.push({id:run.id,at:run.at,settings:run.settings,result:k==='cancel'?'cancelled':contact(s)?'pressed':'missed',summary,events:run.events});s.runs=s.runs.slice(-24);run=null;change();showStatus();showRuns();
  }
  function tick(){
    if(!run||run.startAt===null)return;
    const t=(performance.now()-run.startAt)/1000,move=.65,atMove=s.delay,atHold=atMove+move,atBack=atHold+s.hold,atEnd=atBack+move;
    for(const [key,time] of [['move',atMove],['hold',atHold],['back',atBack]])if(t>=time&&!run.events.some(x=>x.key===key))mark(key,time);
    if(t>=atEnd){$('[data-time]').textContent='경과 '+atEnd.toFixed(1)+'초';finish('done',atEnd);return;}
    const next=t<atMove?'wait':t<atHold?'move':t<atBack?'hold':'back';progress=next==='wait'?0:next==='move'?(t-atMove)/move:next==='hold'?1:1-(t-atBack)/move;
    if(next!==phase){phase=next;showStatus();}
    const n=Math.floor(t*12);if(n!==lastTick){lastTick=n;draw($('canvas'),s,progress,phase);$('[data-time]').textContent='경과 '+t.toFixed(1)+'초';}
    frame=requestAnimationFrame(tick);
  }
  function signal(){if(!run)return;run.startAt=performance.now();phase='wait';mark('wait',0);showStatus();tick();}
  function start(){run={id:uid(),at:new Date().toISOString(),settings:{start:s.start,delay:s.delay,hold:s.hold,arm:s.arm,target:s.target,related3D:s.related3D},startAt:null,events:[]};phase=s.start==='sensor'?'armed':'wait';progress=0;lastTick=-1;mark(phase,0);$('[data-time]').textContent='경과 0.0초';if(phase==='wait')signal();else showStatus();}
  root.addEventListener('click',e=>{const a=e.target.closest('[data-sim]')?.dataset.sim;if(!a)return;if(a==='cancel'||a==='restart')finish('cancel',run?.startAt?(performance.now()-run.startAt)/1000:0);if((a==='start'&&!run)||a==='restart')start();if(a==='signal'&&phase==='armed')signal();});
  root.addEventListener('input',e=>{const k=e.target.dataset.robot;if(k&&e.target.tagName==='TEXTAREA'){s[k]=e.target.value;change();}});
  root.addEventListener('change',async e=>{
    const t=e.target,k=t.dataset.robot;
    if(k&&t.tagName!=='TEXTAREA'&&!run){if(t.type==='number'){if(!Number.isFinite(t.valueAsNumber)||!t.checkValidity()){t.value=s[k];notice('표시된 범위에 맞는 수를 입력해 주세요.');return;}s[k]=t.valueAsNumber;}else s[k]=t.value;phase='idle';progress=0;change();showStatus();}
    if(t.hasAttribute('data-evidence')&&t.files?.[0]){
      try{const f=t.files[0];if(!['image/png','image/jpeg','image/webp','video/mp4','video/webm'].includes(f.type)||f.size>16*1024*1024)throw Error('16MB 이하의 사진 또는 MP4·WebM 영상을 골라 주세요.');if(s.files.length>=8)throw Error('한 설계에는 시험 자료를 8개까지 연결할 수 있어요.');const id=uid();await env.putFile(id,f);s.files.push({id,name:f.name.slice(0,150),type:f.type,at:new Date().toISOString()});change();files();notice('실물 시험 자료를 연결했어요.');}catch(error){notice(error.message);}t.value='';
    }
  });render();return ()=>{if(run)finish('cancel',run.startAt?(performance.now()-run.startAt)/1000:0);cancelAnimationFrame(frame);};
}
import {storage as localStorage,dbName} from './workspace-data.mjs';
const KEY = 'thinking-lab.dialogue.v1.';
const temporary = new Map();
const now = () => new Date().toISOString();
const uid = () => globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2);
const tidy = s => String(s ?? '').trim();
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = v => JSON.parse(JSON.stringify(v));
const opening = '요즘 궁금한 것이나 만들어 보고 싶은 장면은 무엇인가요?';
const stages = {
  auto:'대화에 맞춰서', clarify:'생각을 구체화하기', compare:'다른 방법과 비교하기',
  predict:'결과를 예상하기', evidence:'근거를 찾아보기', revise:'다시 생각하기'
};
const blankDraft = () => ({message:'', stage:'auto', prompt:'', prediction:'', reason:'', editing:false});
const message = (role,content,stage='clarify',mode='student') => ({id:uid(),role,content,stage,mode,createdAt:now()});
function makeThread(id) {
  const date=now();
  return {id, title:'새 생각 대화', createdAt:date, updatedAt:date,
    messages:[message('assistant',opening,'clarify','opening')], versions:[], draft:blankDraft(), teacherFeedback:''};
}
function load(id) {
  if(temporary.has(id))return clone(temporary.get(id));
  try {
    const value=JSON.parse(localStorage.getItem(KEY+id));
    if(value?.id===id && Array.isArray(value.messages) && Array.isArray(value.versions) && value.draft)return value;
  } catch {}
  return null;
}
function save(thread,notify=true) {
  thread.updatedAt=now();
  try{localStorage.setItem(KEY+thread.id,JSON.stringify(thread));temporary.delete(thread.id);}
  catch {temporary.set(thread.id,clone(thread));}
  if(notify)window.dispatchEvent(new CustomEvent('labchange',{detail:{source:'dialogue',id:thread.id,persisted:!temporary.has(thread.id)}}));
}
export function getDialogues() {
  const ids=new Set(temporary.keys());
  try {
    for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith(KEY))ids.add(key.slice(KEY.length));}
  } catch {}
  return Array.from(ids,id=>load(id)).filter(Boolean).sort((a,b)=>String(b.updatedAt).localeCompare(a.updatedAt));
}
export function saveDialogueFeedback(id,versionId,text) {
  const thread=load(id);
  if(!thread)return false;
  const record=versionId==='live'?thread:thread.versions.find(v=>v.id===versionId);
  if(!record)return false;
  record.teacherFeedback=tidy(text).slice(0,4000);
  save(thread);
  return true;
}

function chosenStage(thread) {
  if(thread.draft.stage!=='auto' && Object.hasOwn(stages,thread.draft.stage))return thread.draft.stage;
  const users=thread.messages.filter(m=>m.role==='user'),last=users.at(-1)?.content || '';
  if(/바꿔|바꾸|고치|다음에는|피드백|수정/.test(last))return 'revise';
  if(/보였|해 보니|해보니|실제로|달랐|관찰|나왔|봤는데/.test(last))return 'evidence';
  if(/비교|둘 중|다른 방법|어느 쪽|대신/.test(last))return 'compare';
  if(/예상|것 같|할 텐데|해 볼래|해볼래/.test(last))return 'predict';
  return ['clarify','compare','predict','evidence','revise'][(Math.max(1,users.length)-1)%5];
}
function excerpt(s,length=32) {
  const compact=tidy(s).replace(/\s+/gu,' ').replace(/[“”「」?!。]+/gu,'').replace(/[.,…]+$/u,'');
  return Array.from(compact).length>length?Array.from(compact).slice(0,length).join('')+'…':compact;
}
function guidedQuestion(thread,stage) {
  const users=thread.messages.filter(m=>m.role==='user'),last=users.at(-1)?.content||'';
  const context=excerpt(last);
  const quote='“'+context+'”';
  const previous=users.length>1?excerpt(users.at(-2).content,21):'';
  if(/^(모르|잘 모르|글쎄|몰라|막막)/.test(last))return previous?'아까 말한 “'+previous+'”에서 지금 가장 궁금한 부분은 무엇인가요?':'최근에 보거나 해 본 것 중에서 조금 더 알아보고 싶은 것은 무엇인가요?';
  if(/답을?\s*(알려|말해)|그냥\s*(해줘|해 줘)|대신\s*(써|만들|정해)/.test(last))return '직접 정해 보고 싶은 부분을 하나 고른다면 무엇인가요?';
  if(/^(네|응|예|맞아|맞아요|아니|좋아|그래)[.!~\s]*$/.test(last))return previous?'앞서 말한 “'+previous+'”에 대해 한 가지 예를 든다면 어떤 모습일까요?':'지금 떠올린 생각을 한 가지 예로 어떻게 보여 줄 수 있을까요?';
  let specific='';
  const card=thread.versions.at(-1);
  if(stage==='revise' && (card?.teacherFeedback||card?.feedback||thread.teacherFeedback)){
    const note=excerpt(card?.teacherFeedback||card?.feedback||thread.teacherFeedback,25);
    specific='“'+note+'”라는 의견을 보고 처음 생각의 어느 부분을 다시 시험하고 싶나요?';
  }else if(stage==='evidence' && card?.prediction){
    specific='처음에 “'+excerpt(card.prediction,25)+'”라고 예상했는데 실제로 본 모습에서 어떤 점이 같거나 달랐나요?';
  }else if(stage==='clarify' && /움직|영상|카메라|촬영|회전|날아|날아가|다가가|달려|뛰어/.test(last)){
    specific=quote+'에서 첫 장면과 마지막 장면의 모습은 어떻게 달라지면 좋을까요?';
  }else if(stage==='clarify' && /이미지|그림|그리|색깔|풍경|사진|장면/.test(last)){
    specific=quote+'라는 장면에서 보는 사람이 가장 먼저 발견했으면 하는 것은 무엇인가요?';
  }else if(stage==='clarify' && /왜|원리|궁금|실험/.test(last)){
    specific=quote+'에 대해 이미 관찰한 것은 무엇인가요?';
  }
  if(specific && !thread.messages.some(m=>m.content===specific))return specific;
  const questions={
    clarify:[
      quote+'에서 가장 자세히 들여다보고 싶은 부분은 무엇인가요?',
      quote+'라고 생각하게 된 계기는 무엇인가요?',
      quote+'를 처음 듣는 친구에게 어떤 예를 들 수 있을까요?'
    ],
    compare:[
      quote+'에서 한 가지만 다르게 해 본다면 무엇을 바꿔 볼까요?',
      quote+'와 다른 방법을 비교할 때 어떤 점을 살펴보면 좋을까요?',
      quote+'를 다른 사람의 눈으로 보면 어떤 점이 다르게 보일까요?'
    ],
    predict:[
      quote+'를 실제로 시험하면 가장 먼저 어떤 변화가 보일까요?',
      quote+'라는 예상이 맞는다면 어떤 장면을 볼 수 있을까요?',
      quote+'를 시도했을 때 예상 밖의 결과가 나온다면 어떤 모습일까요?'
    ],
    evidence:[
      quote+'라고 판단한 근거를 어디에서 찾았나요?',
      quote+'를 확인하려면 무엇을 직접 관찰해 보면 좋을까요?',
      quote+'에 대해 다른 친구도 확인할 수 있는 단서는 무엇인가요?'
    ],
    revise:[
      quote+'를 반영한 다음 시도에서 무엇을 확인하고 싶나요?',
      quote+'를 고려하면 처음 생각의 어느 부분을 다듬고 싶나요?',
      quote+'를 적용한 뒤 무엇을 보면 더 나아졌다고 할 수 있을까요?'
    ]
  };
  const seen=thread.messages.filter(m=>m.role==='assistant' && m.stage===stage && m.mode==='guide').length;
  return questions[stage][seen%questions[stage].length];
}

// Only a single Korean question can enter the transcript as a generated turn.
// A model explanation or an answer followed by a question uses a local card.
function singleQuestion(raw) {
  const q=tidy(raw).replace(/^[“"「]|[”"」]$/g,'').trim();
  if(!q || q.length>280 || !/[가-힣]/.test(q) || !/^[^?？!.。！\n]+[?？]$/.test(q))return '';
  if(!/무엇|무슨|뭐|왜|어떤|어디|어떻|어떨|어땠|어때|얼마|어느|누구|누가|언제|몇/.test(q))return '';
  if(/정답은|답을 알려|하면 됩니다|추천할게|추천해요/.test(q))return '';
  return q.replace(/？$/,'?');
}
const icons={
  chat:'<path d="M20 12a7 7 0 0 1-7 7H7l-4 3v-7a7 7 0 0 1-1-4 8 8 0 0 1 8-8h3a7 7 0 0 1 7 7z"/><path d="M7 10h8m-8 4h5"/>',
  note:'<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8m-8 4h8m-8 4h5"/>',
  image:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m3 16 5-5 5 5 3-3 5 5"/><circle cx="15" cy="9" r="1.5"/>',
  send:'<path d="m3 10 18-7-6 18-3-8-9-3zM12 13l9-10"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  back:'<path d="m15 5-7 7 7 7"/>',
  save:'<path d="m4 13 5 5L20 7"/>'
};
const icon=n=>'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'+icons[n]+'</svg>';
const button=(action,label,cls='dq-secondary')=>'<button type="button" data-action="'+action+'" class="'+cls+'">'+label+'</button>';
const dayTime=d=>new Intl.DateTimeFormat('ko-KR',{hour:'numeric',minute:'2-digit'}).format(new Date(d));
function bubble(m) {
  const human=m.role==='user',who=human?'나의 생각':m.mode==='opening'?'시작 질문':m.mode==='model'?'로컬 AI의 질문':'질문 카드';
  return '<article class="dq-turn '+(human?'dq-mine':'dq-guide')+'"><div class="dq-who"><span>'+who+'</span><time datetime="'+esc(m.createdAt)+'">'+esc(dayTime(m.createdAt))+'</time></div><p class="dq-bubble">'+esc(m.content)+'</p></article>';
}
function field(name,label,value,placeholder='',required=false) {
  return '<label class="dq-field"><span>'+label+'</span><textarea data-field="'+name+'" rows="2" maxlength="1600" '+(required?'required':'')+' placeholder="'+esc(placeholder)+'">'+esc(value||'')+'</textarea></label>';
}
function briefEditor(thread) {
  const d=thread.draft, parent=thread.versions.at(-1);
  return '<form class="dq-brief"><h3>'+icon('note')+(parent?'다음 생각 카드':'첫 생각 카드')+'</h3>'+
    '<p class="dq-explain">대화에서 내가 정한 내용을 내 말로 남겨요. 장면을 적으면 이미지 공방에서도 쓸 수 있어요.</p>'+
    field('prompt','지금 정한 생각이나 장면',d.prompt,'내가 표현하거나 확인하고 싶은 것은…',true)+
    field('prediction','어떤 결과를 예상하나요?',d.prediction,'어떤 모습이 보일지 떠올려 보세요.')+
    (parent?field('reason','이번에 바꿀 점과 그 이유',d.reason,'지난번에 살펴보니…'):'')+
    '<div class="dq-actions"><button class="dq-primary" type="submit">'+icon('save')+' 카드 저장하기</button></div></form>';
}
function evidencePanel(thread,chosenId) {
  const versions=thread.versions,last=versions.at(-1);
  const v=versions.find(it=>it.id===chosenId)||last;
  const userCount=thread.messages.filter(m=>m.role==='user').length;
  const startButton=button('startbrief',icon('note')+' 생각 카드 쓰기');
  let body='';
  if(v) {
    body='<div class="dq-versionpick"><label>살펴볼 카드 <select data-version>'+versions.map(x=>'<option value="'+esc(x.id)+'" '+(v.id===x.id?'selected':'')+'>생각 카드 '+x.number+'</option>').join('')+'</select></label></div>'+
      '<dl class="dq-snapshot"><dt>내가 정한 생각</dt><dd>'+esc(v.prompt)+'</dd><dt>예상한 결과</dt><dd>'+esc(v.prediction)+'</dd>'+
      (v.reason?'<dt>바꾼 이유</dt><dd>'+esc(v.reason)+'</dd>':'')+'</dl>'+
      button('image',icon('image')+' 이 카드로 이미지 만들기','dq-primary')+
      '<details class="dq-review" '+(thread.draft.editing?'':'open')+'><summary>해 보고 돌아보기</summary>'+
      field('observation','실제로 확인한 점',v.observation,'예상과 무엇이 같거나 달랐나요?')+
      field('feedback','다음 시도에 참고할 의견',v.feedback,'내가 발견했거나 친구에게 들은 점')+
      (v.teacherFeedback?'<p class="dq-teacher"><strong>선생님의 질문</strong>'+esc(v.teacherFeedback)+'</p>':'')+'</details>'+
      (thread.draft.editing?briefEditor(thread):button('startbrief',icon('plus')+' 다음 생각 카드 쓰기'));
  } else if(thread.draft.editing) body=briefEditor(thread);
  else body='<p class="dq-explain">'+(userCount?'대화를 더 이어 가거나, 지금까지 정한 생각을 카드로 남겨요.':'첫 생각을 이야기해 보세요. 나눈 대화는 생각 기록장에 차곡차곡 남아요.')+'</p>'+(userCount?startButton:'');
  return '<aside class="dq-side"><div class="dq-sidehead">'+icon('note')+'<h2>내 생각 카드</h2></div>'+
    (thread.teacherFeedback?'<p class="dq-teacher"><strong>대화에 남긴 선생님의 질문</strong>'+esc(thread.teacherFeedback)+'</p>':'')+body+'</aside>';
}

export function mountDialogue(element,id,options={}) {
  const existing=id?load(id):!options.createNew?getDialogues()[0]:null;
  const threadId=existing?.id||id||uid();
  let local=existing||makeThread(threadId);
  const room=document.createElement('section');
  room.className='dq';element.replaceChildren(room);
  let chosenId=options.versionId||'',alive=true,job=null,statusMode='checking',modelName='';
  const events=new AbortController();
  const read=()=>load(threadId)||local;
  function edit(func,notify=true) {
    const thread=read();func(thread);local=thread;save(thread,notify);
    const label=room.querySelector('.dq-store');
    if(label)label.textContent=temporary.has(threadId)?'현재 탭에 임시 저장됨':'이 브라우저에 저장됨';
    return thread;
  }
  function statusText() {
    if(statusMode==='ready')return '로컬 AI 연결됨'+(modelName?' · '+modelName:'');
    if(statusMode==='offline')return '질문 카드 사용 중 · 로컬 AI 미연결';
    if(statusMode==='guide')return '질문 카드 사용 중';
    return '로컬 AI 확인 중';
  }
  function paintStatus() {const el=room.querySelector('.dq-status');if(el)el.textContent=statusText();}
  function render(focus=false) {
    const thread=read(), last=thread.messages.at(-1),waiting=last?.role==='user';
    room.innerHTML='<div class="dq-nav">'+button('home',icon('back')+' 작업실 홈','dq-link')+'<span class="dq-store">'+(temporary.has(threadId)?'현재 탭에 임시 저장됨':load(threadId)?'이 브라우저에 저장됨':'')+'</span></div>'+
      '<div class="dq-heading"><div><h1>생각 대화실</h1><p>친구에게 설명하듯 내 생각을 말하고, 질문을 따라 한 걸음 더 생각해 봐요.</p></div>'+
      button('new',icon('plus')+' 새 대화')+'</div>'+
      '<div class="dq-layout"><div class="dq-card"><div class="dq-cardhead"><h2>'+icon('chat')+esc(thread.title==='새 생각 대화'?'생각 나누기':thread.title)+'</h2><span class="dq-status">'+esc(statusText())+'</span></div>'+
      '<div class="dq-log" role="log" aria-label="내 생각과 이어지는 질문" tabindex="0">'+thread.messages.map(bubble).join('')+'</div>'+
      (waiting?'<div class="dq-pending" role="status">'+(job?'다음 질문을 생각하고 있어요. '+button('guide','질문 카드로 계속하기','dq-link'):button('retry','이어서 질문 받기'))+'</div>':'')+
      '<form class="dq-composer"><label class="dq-compose-label" for="dq-writing">내 생각</label><textarea id="dq-writing" data-field="message" rows="2" maxlength="1600" placeholder="떠오른 생각이나 아직 궁금한 점을 써 보세요.">'+esc(thread.draft.message)+'</textarea>'+
      '<div class="dq-controls"><label class="dq-select"><span>질문 방향</span><select data-stage>'+Object.entries(stages).map(([key,value])=>'<option value="'+key+'" '+(thread.draft.stage===key?'selected':'')+'>'+value+'</option>').join('')+'</select></label>'+
      '<button type="submit" class="dq-primary" '+(waiting?'disabled':'')+'>'+icon('send')+' 생각 보내기</button></div></form></div>'+
      evidencePanel(thread,chosenId)+'</div><p class="dq-notice" role="status" aria-live="polite"></p>';
    const log=room.querySelector('.dq-log');log.scrollTop=log.scrollHeight;
    if(focus)room.querySelector('[data-field="message"]')?.focus({preventScroll:true});
  }
  const announce=s=>{const el=room.querySelector('.dq-notice');if(el)el.textContent=s;};
  const isHttp=()=>/^https?:$/.test(globalThis.location?.protocol||'');
  async function probe() {
    if(!isHttp()){statusMode='offline';paintStatus();return;}
    const ac=new AbortController(), timeout=setTimeout(()=>ac.abort(),2500);
    try {
      const response=await fetch('/api/status',{cache:'no-store',signal:ac.signal});
      if(!response.ok)throw Error();
      const result=await response.json();
      if(!alive||job||statusMode!=='checking')return;
      statusMode=result.chat?.ready?'ready':'offline';
      modelName=String(result.chat?.model||'');
    } catch {if(alive&&!job&&statusMode==='checking')statusMode='offline';}
    finally {clearTimeout(timeout);if(alive)paintStatus();}
  }
  async function follow() {
    const thread=read(),last=thread.messages.at(-1);
    if(!alive||job||last?.role!=='user')return;
    const token={controller:new AbortController(),target:last.id};
    job=token;render();
    const stage=chosenStage(thread);
    let question='',mode='guide';
    const timeout=setTimeout(()=>token.controller.abort(),75000);
    try {
      if(!isHttp())throw Error('offline');
      const latest=thread.versions.at(-1);
      const messages=thread.messages.slice(-24).map(({role,content})=>({role,content}));
      const response=await fetch('/api/question',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({messages,stage,schoolProjectId:options.schoolProjectId||null,schoolVersionId:options.schoolVersionId||null,previousVersion:latest?{prompt:latest.prompt,prediction:latest.prediction,observation:latest.observation,feedback:latest.feedback,reason:latest.reason}:null}),signal:token.controller.signal});
      if(!response.ok)throw Error('offline');
      const result=await response.json();
      question=singleQuestion(result.question);
      if(question && !['guided','guide','fallback','card'].includes(result.mode)){mode='model';modelName=String(result.model||'');statusMode='ready';}
      else statusMode='guide';
    } catch {statusMode=token.controller.signal.aborted?'guide':'offline';}
    finally {clearTimeout(timeout);}
    if(!alive||job!==token)return;
    job=null;
    if(read().messages.at(-1)?.id!==token.target){render();return;}
    edit(t=>t.messages.push(message('assistant',question||guidedQuestion(thread,stage),stage,mode)));
    render(true);
  }
  function send() {
    const thread=read(), content=tidy(room.querySelector('[data-field="message"]')?.value).slice(0,1600);
    if(thread.messages.at(-1)?.role==='user'||job)return;
    if(!content){announce('먼저 떠오른 생각을 적어 주세요.');room.querySelector('[data-field="message"]').focus();return;}
    edit(t=>{
      if(!t.messages.some(m=>m.role==='user'))t.title=excerpt(content,28)||'나의 생각 대화';
      t.messages.push(message('user',content,t.draft.stage));
      t.draft.message='';
    });
    follow();
  }
  function saveBrief(form) {
    const thread=read(),d=thread.draft,last=thread.versions.at(-1);
    for(const input of form.querySelectorAll('[required]'))input.setCustomValidity(tidy(input.value)?'':'내 말로 생각을 적어 주세요.');
    if(!form.reportValidity())return;
    if(last && tidy(d.prompt)===last.prompt && tidy(d.prediction)===last.prediction){
      announce('다음 카드에 남길 생각이나 예상이 어떻게 달라졌는지 적어 주세요.');
      form.querySelector('[data-field="prompt"]').focus();return;
    }
    const v={id:uid(),number:(last?.number||0)+1,parentVersion:last?.number||null,createdAt:now(),
      prompt:tidy(d.prompt),plan:tidy(d.prompt),prediction:tidy(d.prediction),reason:tidy(d.reason),
      observation:'',feedback:'',teacherFeedback:'',messages:clone(thread.messages)};
    edit(t=>{t.versions.push(v);Object.assign(t.draft,{editing:false,prompt:'',prediction:'',reason:''});});
    chosenId=v.id;render();announce('생각 카드 '+v.number+'을 기록장에 저장했어요.');
  }
  const opts={signal:events.signal};
  room.addEventListener('input',e=>{
    const input=e.target, key=input.dataset.field;
    if(!key)return;
    input.setCustomValidity('');
    if(['message','prompt','prediction','reason'].includes(key)){edit(t=>{t.draft[key]=input.value;},false);return;}
    if(key==='observation'||key==='feedback'){
      edit(t=>{const v=t.versions.find(x=>x.id===chosenId)||t.versions.at(-1);if(v)v[key]=input.value;},false);
    }
  },opts);
  room.addEventListener('change',e=>{
    if(e.target.hasAttribute('data-stage') && Object.hasOwn(stages,e.target.value))edit(t=>{t.draft.stage=e.target.value;},false);
    else if(e.target.hasAttribute('data-version')){chosenId=e.target.value;render();room.querySelector('[data-version]')?.focus();}
  },opts);
  room.addEventListener('submit',e=>{
    e.preventDefault();
    if(e.target.matches('.dq-composer'))send();else if(e.target.matches('.dq-brief'))saveBrief(e.target);
  },opts);
  room.addEventListener('keydown',e=>{
    if(e.target.dataset.field==='message'&&e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229){e.preventDefault();send();}
  },opts);
  room.addEventListener('click',e=>{
    const a=e.target.closest('[data-action]')?.dataset.action;
    if(a==='home'){window.dispatchEvent(new Event('labhome'));return;}
    if(a==='new'){window.dispatchEvent(new CustomEvent('labopen',{detail:{type:'newDialogue',id:uid()}}));return;}
    if(a==='retry'){follow();return;}
    if(a==='guide'&&job){job.controller.abort();return;}
    if(a==='startbrief'){
      edit(t=>{t.draft.editing=true;const last=t.versions.at(-1);if(last){t.draft.prompt=last.prompt;t.draft.prediction=last.prediction;}});
      chosenId=read().versions.at(-1)?.id||'';
      render();room.querySelector('[data-field="prompt"]')?.focus();return;
    }
    if(a==='image'){
      const t=read(),v=t.versions.find(x=>x.id===chosenId)||t.versions.at(-1);
      if(v)window.dispatchEvent(new CustomEvent('labopen',{detail:{type:'imageFromDialogue',dialogueId:t.id,versionId:v.id,title:t.title,plan:v.plan,prompt:v.prompt,prediction:v.prediction}}));
    }
  },opts);
  render();probe();
  if(!existing && tidy(options.initialIdea)) {
    room.querySelector('[data-field="message"]').value=tidy(options.initialIdea).slice(0,1600);
    send();
  }
  return ()=>{alive=false;job?.controller.abort();events.abort();};
}

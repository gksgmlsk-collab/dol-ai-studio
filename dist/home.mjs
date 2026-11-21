import {siteConfig} from './site-config.mjs';
import {storage} from './workspace-data.mjs';
import {showDemo,demoImage} from './generation-demo.mjs';
import {sampleReturn} from './gallery.mjs';
const assets={media:'./assets/tool-media.jpg',web:'./assets/tool-web.jpg','3d':'./assets/tool-3d.jpg',robot:'./assets/tool-robot.jpg',city:'./assets/example-city.jpg',switch:'./assets/example-switch.jpg',light:'./assets/example-light.jpg',compass:'./assets/compass.jpg'};
export {assets};
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const E=escapeHtml;
const samples=[
 {id:'city',types:['city','image'],title:'우리 동네 미래 도시',kind:'영상·이미지',tool:'image',question:'우리 동네에서 가장 먼저 바꾸고 싶은 장소는 어디인가요?',idea:'우리 동네의 한 장소를 미래 도시의 첫 장면으로 그리고 싶어.',stages:['오늘의 동네에서 지키고 싶은 장소를 한 곳 골라요.','달라진 모습을 첫 장면으로 그리고, 카메라가 어디로 움직일지 정해요.','영상에서 잘 보인 변화와 더 보여 주고 싶은 변화를 비교해요.']},
 {id:'switch',types:['3d','robot'],title:'시간을 지키는 스위치',kind:'발명·로봇',tool:'robot',question:'시간이 다 되었음을 어떤 신호로 알 수 있을까요?',idea:'누르면 기다렸다가 빛으로 시간을 알려 주는 스위치를 만들고 싶어.',stages:['누가 어떤 순간에 신호를 필요로 하는지 정해요.','버튼을 눌렀을 때 기다리는 시간과 반응을 바꿔 시험해요.','기다리는 중에 다시 눌렀을 때의 결과를 예상과 비교해요.']},
 {id:'light',types:['image'],title:'빛으로 그리는 이야기',kind:'영상·이미지',tool:'image',question:'같은 장면에서 빛이 달라지면 이야기가 어떻게 달라질까요?',idea:'밤이 되면 벽에 별과 고래가 나타나는 장면을 표현하고 싶어.',stages:['빛을 보는 사람이 느꼈으면 하는 감정을 골라요.','모양과 색을 정해 첫 장면을 만들고 빛의 움직임을 적어요.','어떤 모양과 움직임이 그 감정을 잘 전했는지 찾아요.']}
];
export function gallerySamples() {
  return [...samples.map(s => ({...s, image:assets[s.id]})), {
    id:'boat', title:'노란 종이배의 여행', types:['video','image'], image:demoImage
  }];
}

const studioChoices=[
  {kind:'dialogue',name:'아이디어부터 설계하기',hint:'AI의 질문에 답하며 무엇을 만들지 정해요.',image:assets.compass},
  {kind:'image',name:'이미지 만들기',hint:'떠올린 장면을 글과 그림으로 표현해요.',image:demoImage},
  {kind:'video',name:'영상 만들기',hint:'첫 그림에 움직임을 더해 장면을 만들어요.',image:assets.media},
  {kind:'3d',name:'3D 설계하기',hint:'입체 도형을 놓고 돌려 보며 구조를 정해요.',image:assets['3d']},
  {kind:'web',name:'홈페이지 만들기',hint:'글과 그림을 배치해 나만의 페이지를 만들어요.',image:assets.web}
];

const entryArrow='<span class="entry-arrow" aria-hidden="true">↗</span>';
export function renderHome(el) {
  const headline=siteConfig.headline.map(line=>'<span>'+E(line)+'</span>').join(' ');
  el.innerHTML=`<section class="entry-cover" aria-labelledby="entry-headline">
    <img class="entry-scene" src="./assets/cover-workshop.jpg" alt="" width="1672" height="941" fetchpriority="high">
    <div class="entry-intro">
      <h1 id="entry-headline">${headline}</h1>
      <p>${E(siteConfig.subtitle)}</p>
      <nav class="entry-portals" aria-label="연구소 시작하기">
        <a class="entry-portal entry-learner" href="#student">학생 프로젝트 시작하기 <span aria-hidden="true">→</span></a>
        <a class="entry-portal entry-teacher" href="#teacher-live">교사 학급 현황 보기 <span aria-hidden="true">→</span></a>
      </nav>
    </div>
  </section>`;
}

export function renderStudentMain(el,launch){
  const choices=studioChoices.map(s=>'<li><button type="button" class="entry-choice" data-launch="'+s.kind+'" aria-labelledby="entry-name-'+s.kind+'" aria-describedby="entry-hint-'+s.kind+'"><img src="'+s.image+'" alt="" decoding="async"><span class="entry-choice-copy"><strong id="entry-name-'+s.kind+'">'+s.name+'</strong><span id="entry-hint-'+s.kind+'">'+s.hint+'</span></span>'+entryArrow+'</button></li>').join('');
  el.innerHTML='<section class="entry-student" aria-labelledby="entry-student-heading"><header><h1 id="entry-student-heading">어디에서 시작할까요?</h1><p>아이디어가 필요하면 질문으로 시작해요. 만들고 싶은 작품이 있다면 바로 공방을 골라요.</p></header><ul class="entry-choices" aria-label="프로젝트 시작 방법">'+choices+'</ul></section>';
  for(const button of el.querySelectorAll('[data-launch]'))button.onclick=()=>launch(button.dataset.launch);
}

const panel=(title,description,content)=>'<div class="dol-page"><a class="dol-back" href="#home">← 연구소 홈</a><h1>'+title+'</h1><p class="dol-intro">'+description+'</p>'+content+'</div>';
export function mediaPage(el,start){el.innerHTML=panel('영상·이미지 공방','내가 그리거나 만든 이미지를 영상의 첫 장면으로 쓸 수 있어요.','<div class="dol-choice"><img src="'+assets.media+'" alt=""><div><button class="dol-primary" data-tool="image">이미지 공방 열기 →</button><p>그림을 그리거나 가져와도 좋아요. 내 프롬프트로 새 그림을 만들 수도 있어요.</p><button data-tool="video">영상 공방 열기 →</button><p>이미지 버전을 고르고, 무엇이 어떻게 움직일지 내 말로 적어요.</p><button data-tool="dialogue">질문으로 아이디어 찾기</button> <button data-tool="storyboard">감상·스토리보드 열기</button><p><a class="dol-back" href="#demo">이 PC에서 만든 종이배 예시 보기 →</a></p></div></div>');el.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>start(b.dataset.tool,{}));}
export function samplePage(el,id,start){
  const sample=samples.find(s=>s.id===id);
  if(id==='boat') showDemo(el,start);
  else if(sample){
    const s=sample;
    el.innerHTML=panel(s.title,'창작 아이디어 예시 · '+s.kind,'<div class="dol-choice"><img src="'+assets[s.id]+'" alt="'+s.title+'의 작품 예시"><div><h2>'+s.question+'</h2><ol>'+s.stages.map(x=>'<li>'+x+'</li>').join('')+'</ol><div class="dol-actions"><button class="dol-primary" data-chat>내 아이디어로 대화하기</button><button data-tool>공방 열기</button></div></div></div>');
    el.querySelector('[data-chat]').onclick=()=>start('dialogue',{initialIdea:s.idea,createNew:true});
    el.querySelector('[data-tool]').onclick=()=>{
      if(id==='city'||id==='switch') location.hash=id;
      else start(s.tool,{title:s.title,prompt:s.idea});
    };
  }else el.innerHTML=panel('예시를 찾을 수 없어요.','','');
  const back=sampleReturn(location.hash), link=el.querySelector('.dol-back');
  if(link){link.href=back.href;link.textContent=back.label;}
}
export function materialsPage(el){const key='dol-material-notes';let notes=[];try{notes=JSON.parse(storage.getItem(key)||'[]');}catch{}const draw=()=>{el.innerHTML=panel('재료실','보고 들은 것 중 작품에 쓰고 싶은 단서를 모아 보세요.','<div class="dol-resource"><div><h2>시작 질문</h2><p><a class="dol-back" href="#storyboard">미술 감상·스토리보드 열기 →</a></p><details open><summary>미술 감상</summary><p>그림에서 눈이 가장 오래 머무는 곳은 어디인가요? 어떤 색과 모양이 그렇게 느끼게 했나요?</p></details><details><summary>미래 도시 영상</summary><p>첫 장면, 달라지는 순간, 마지막 장면을 각각 한 문장으로 떠올려 보세요.</p></details><details><summary>발명의 동작</summary><p>누가 무엇을 하면, 얼마나 기다렸다가 어떤 변화가 생길까요?</p></details></div><div><h2>내 재료 노트</h2><form><label>자료 이름<input name="name" required maxlength="100"></label><label>출처나 관찰한 내용<textarea name="note" required maxlength="3000" rows="3"></textarea></label><button class="dol-primary">재료 담기</button></form><ul>'+notes.map(n=>'<li><strong>'+E(n.name)+'</strong><p>'+E(n.note)+'</p></li>').join('')+'</ul></div></div>');el.querySelector('form').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);notes.unshift({name:String(f.get('name')).trim(),note:String(f.get('note')).trim()});try{storage.setItem(key,JSON.stringify(notes));draw();}catch{notes.shift();e.target.insertAdjacentHTML('beforeend','<p role="alert">저장 공간이 부족해요.</p>');}};};draw();}


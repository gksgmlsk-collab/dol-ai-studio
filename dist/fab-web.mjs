const colors={sage:['#31583f','#e9eee4'],sky:['#285574','#e3eff3'],coral:['#844b37','#f8e8dd'],violet:['#63547b','#eeebf4']};
const templates={
  town:['우리 동네 산책 안내','처음 오는 친구에게 산책길을 소개해요.','먼저 둘러볼 곳','우리가 찾은 공간과 걷는 방법을 적어 보세요.'],
  art:['작은 온라인 전시','그림 속 빛과 색을 함께 살펴봐요.','감상 포인트','어떤 부분을 먼저 보았는지 소개해 보세요.'],
  invention:['우리 모둠의 발명','생활 속에서 발견한 문제를 소개해요.','시험해 본 것','첫 실험에서 무엇을 바꾸었는지 적어 보세요.']
};
const safeTags=new Set('main section article header footer nav aside div span h1 h2 h3 h4 h5 h6 p strong em b i small mark blockquote ul ol li a figure figcaption img details summary br hr table thead tbody tfoot tr td th dl dt dd pre code'.split(' '));
const skipTags=new Set('script style svg math iframe object embed link meta base form input select textarea button audio video source template noscript'.split(' '));
const allowedProps=new Set('color background background-color display align-items justify-content flex-direction flex-wrap flex grid-template-columns gap row-gap column-gap margin margin-top margin-right margin-bottom margin-left padding padding-top padding-right padding-bottom padding-left width height max-width min-width max-height min-height border border-width border-style border-color border-radius line-height font-size font-weight font-family text-align text-decoration letter-spacing white-space overflow-wrap list-style-type box-sizing'.split(' '));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function declarations(text){
  return String(text).split(';').map(pair=>{
    const i=pair.indexOf(':'),key=pair.slice(0,i).trim().toLowerCase(),value=pair.slice(i+1).trim();
    if(i<0||!allowedProps.has(key)||!value||value.length>180||!/^[-\w\s#%,.()/'"]+$/.test(value)||/\b(?:url|var|attr|image|paint|element|expression)\s*\(/i.test(value))return '';
    for(const m of value.matchAll(/([a-z-]+)\s*\(/gi))if(!/^(rgb|rgba|hsl|hsla|repeat|minmax|calc)$/i.test(m[1]))return '';
    return key+':'+value+';';
  }).join('');
}
function rules(css){
  const out=[];
  for(const row of String(css||'').replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/([^{}]+)\{([^{}]*)\}/g)){
    const selector=row[1].trim(),body=declarations(row[2]);
    if(selector.length<180&&/^[\w\s.,#*:>+~-]+$/.test(selector)&&body)out.push(selector+'{'+body+'}');
  }
  return out.join('\n');
}
function imageAllowed(v){return typeof v==='string'&&v.length<=2200000&&/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(v);}
export function sanitizeWeb(html,css=''){
  const template=document.createElement('template');template.innerHTML=String(html||'').slice(0,2600000);
  const root=document.createElement('div'),styles=[...template.content.querySelectorAll('style')].map(s=>s.textContent).concat(css);
  let count=0;
  function walk(node,to,depth){
    if(depth>45||++count>10000)return;
    if(node.nodeType===3){to.append(document.createTextNode(node.textContent));return;}
    if(node.nodeType!==1)return;
    const tag=node.localName.toLowerCase();if(skipTags.has(tag))return;
    let dest=to;
    if(safeTags.has(tag)){
      if(tag==='img'&&!imageAllowed(node.getAttribute('src')))return;
      dest=document.createElement(tag);to.append(dest);
      for(const key of ['id','class']){const val=node.getAttribute(key);if(val&&/^[\w -]{1,140}$/.test(val))dest.setAttribute(key,val);}
      if(node.hasAttribute('style')){const style=declarations(node.getAttribute('style'));if(style)dest.setAttribute('style',style);}
      if(tag==='a'){const href=node.getAttribute('href');if(href&&/^#[a-zA-Z][\w-]{0,70}$/.test(href))dest.setAttribute('href',href);}
      if(tag==='img'){dest.setAttribute('src',node.getAttribute('src'));dest.setAttribute('alt',(node.getAttribute('alt')||'작품 이미지').slice(0,250));}
      if(tag==='details'&&node.hasAttribute('open'))dest.setAttribute('open','');
    }
    node.childNodes.forEach(n=>walk(n,dest,depth+1));
  }
  template.content.childNodes.forEach(n=>walk(n,root,0));
  return {html:root.innerHTML,css:rules(styles.join('\n').slice(0,60000))};
}
const baseStyles='*{box-sizing:border-box}body{margin:0;color:#293b34;background:white;font:16px/1.6 system-ui,sans-serif}main{padding:24px;max-width:850px;margin:auto}img{max-width:100%;height:auto}h1,h2,p{overflow-wrap:anywhere}details{margin-top:12px}a{color:#245a49}';
export const newWeb=()=>({mode:'basic',template:'town',title:templates.town[0],lead:templates.town[1],heading:templates.town[2],text:templates.town[3],extra:'',image:'',alt:'',color:'sage',layout:'stack',html:null,css:null,purpose:'',audience:''});
function basic(s){
  const [accent,pale]=colors[s.color]||colors.sage;
  const picture=imageAllowed(s.image)?'<figure><img src="'+s.image+'" alt="'+esc(s.alt)+'"></figure>':'';
  const html=`<main><header><h1>${esc(s.title)}</h1><p>${esc(s.lead)}</p></header><section class="content">${picture}<article><h2>${esc(s.heading)}</h2><p>${esc(s.text).replaceAll('\n','<br>')}</p>${s.extra?'<details><summary>더 알아보기</summary><p>'+esc(s.extra).replaceAll('\n','<br>')+'</p></details>':''}</article></section></main>`;
  const css=`header{padding:22px;background:${pale};color:${accent};border-radius:16px}h1{margin:0;font-size:32px}header p{margin:6px 0 0}.content{display:${s.layout==='side'&&picture?'flex':'block'};gap:16px;margin-top:18px;flex-wrap:wrap}.content article{flex:1;min-width:160px}figure{margin:0;max-width:${s.layout==='side'?'45%':'100%'}}figure img{border-radius:12px}h2{color:${accent}}summary{color:${accent};font-weight:650}`;
  return {html,css};
}
function content(s){return s.mode==='code'?sanitizeWeb(s.html||'',s.css||''):basic(s);}
export function webDocument(s){
  const v=content(s);return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; img-src data:; style-src &#39;unsafe-inline&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(s.title||'나의 웹 작품')+'</title><style>'+baseStyles+v.css+'</style></head><body>'+v.html+'</body></html>';
}
export function webFrame(frame,s){frame.setAttribute('sandbox','');frame.referrerPolicy='no-referrer';frame.title='학생 웹 작품 미리보기';frame.srcdoc=webDocument(s);}
export function webThumbnail(s){
  const c=document.createElement('canvas');c.width=420;c.height=230;const p=c.getContext('2d');const [accent,bg]=colors[s.color]||colors.sage;
  p.fillStyle='#fdfcf6';p.fillRect(0,0,420,230);p.fillStyle=bg;p.fillRect(15,17,390,108);
  const safe=s.mode==='code'?sanitizeWeb(s.html,s.css):null,holder=document.createElement('template');if(safe)holder.innerHTML=safe.html;
  const title=safe?(holder.content.querySelector('h1,h2')?.textContent||s.title):s.title;
  p.fillStyle=accent;p.font='bold 22px sans-serif';p.fillText((title||'나의 웹 작품').slice(0,21),30,68,355);
  p.font='14px sans-serif';p.fillStyle='#47574c';p.fillText((safe?(holder.content.querySelector('p')?.textContent||''):s.lead).slice(0,34),30,98,355);
  p.fillStyle=accent;p.fillRect(32,151,116,9);p.fillStyle='#d7ded6';p.fillRect(32,174,333,7);p.fillRect(32,193,230,7);return c.toDataURL('image/jpeg',.76);
}
export function mountWeb(root,s,change,notice){
  let timer;
  const ta=(k,name,n=2)=>`<label>${name}<textarea data-w="${k}" rows="${n}" maxlength="${k==='html'?2600000:k==='css'?60000:1600}">${esc(s[k])}</textarea></label>`;
  function paint(){
    root.innerHTML=`<div class="fb-work"><section class="fb-box"><h2>웹 페이지 편집</h2><div class="fb-choices"><button type="button" data-wmode="basic" aria-pressed="${s.mode==='basic'}">문구·배치</button><button type="button" data-wmode="code" aria-pressed="${s.mode==='code'}">HTML·CSS</button></div>
      ${s.mode==='basic'?`<label>템플릿<select data-w="template">${Object.entries(templates).map(([k,v])=>'<option value="'+k+'" '+(s.template===k?'selected':'')+'>'+v[0]+'</option>').join('')}</select></label>${ta('title','큰 제목',1)}${ta('lead','소개 문장')}${ta('heading','글 제목',1)}${ta('text','본문',3)}${ta('extra','펼쳐서 볼 내용 (선택)')}<div class="fb-cols"><label>색<select data-w="color">${Object.keys(colors).map((k,i)=>'<option value="'+k+'" '+(s.color===k?'selected':'')+'>'+['세이지','하늘','코랄','라벤더'][i]+'</option>').join('')}</select></label><label>배치<select data-w="layout"><option value="stack">위아래</option><option value="side" ${s.layout==='side'?'selected':''}>나란히</option></select></label></div><label>작품 이미지<input type="file" data-photo accept="image/png,image/jpeg,image/webp"></label>${s.image?ta('alt','이미지 설명',1)+'<button type="button" data-clear>이미지 빼기</button>':''}`:`${ta('html','HTML',8)}${ta('css','CSS',6)}<p class="fb-help">문장, 표, 그림과 접기·펼치기를 지원해요. 그림은 파일 안에 포함된 PNG·JPG·WebP를 사용해요.</p>`}
      <details><summary>목적과 읽는 사람</summary>${ta('purpose','무엇을 전하고 싶나요?')}${ta('audience','누가 볼 페이지인가요?')}</details>
      <label>HTML 또는 CSS 가져오기<input type="file" data-import accept=".html,.htm,.css,text/html,text/css"></label></section><section class="fb-box"><h2>웹 작품 미리보기</h2><iframe class="fb-webframe" sandbox="" referrerpolicy="no-referrer" title="학생 웹 작품 미리보기"></iframe></section></div>`;
    webFrame(root.querySelector('iframe'),s);
  }
  function refresh(){clearTimeout(timer);timer=setTimeout(()=>{const frame=root.querySelector('iframe');if(frame)webFrame(frame,s);},150);}
  root.addEventListener('input',e=>{const k=e.target.dataset.w;if(!k||e.target.tagName!=='TEXTAREA')return;s[k]=e.target.value;change();refresh();});
  root.addEventListener('click',e=>{
    const m=e.target.closest('[data-wmode]');if(m){if(m.dataset.wmode==='code'&&s.html===null){const v=basic(s);s.html=v.html;s.css=v.css;}s.mode=m.dataset.wmode;change();paint();}
    if(e.target.closest('[data-clear]')){s.image='';change();paint();}
  });
  root.addEventListener('change',async e=>{
    const t=e.target,k=t.dataset.w;
    if(k&&t.tagName==='SELECT'){s[k]=t.value;if(k==='template'){[s.title,s.lead,s.heading,s.text]=templates[t.value];s.extra='';}change();paint();return;}
    const file=t.files?.[0];if(!file)return;
    try{
      if(t.hasAttribute('data-photo')){
        if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>12e6)throw Error('12MB 이하의 PNG·JPG·WebP를 골라 주세요.');
        const img=await createImageBitmap(file);try{const f=Math.min(1,960/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*f));c.height=Math.max(1,Math.round(img.height*f));const p=c.getContext('2d');p.fillStyle='#fff';p.fillRect(0,0,c.width,c.height);p.drawImage(img,0,0,c.width,c.height);s.image=c.toDataURL('image/jpeg',.82);s.alt=file.name.replace(/\.[^.]+$/,'');}finally{img.close();}
      }else if(t.hasAttribute('data-import')){
        if(file.size>2500000)throw Error('2.5MB 이하의 HTML 또는 CSS 파일을 선택해 주세요.');
        const text=await file.text();if(/\.css$/i.test(file.name)){if(s.html===null)s.html=basic(s).html;s.css=rules(text);}else if(/\.html?$/i.test(file.name)){const v=sanitizeWeb(text);s.html=v.html;s.css=v.css;}else throw Error('HTML 또는 CSS 파일을 골라 주세요.');s.mode='code';
      }else return;
      change();paint();notice('파일을 작업에 반영했어요.');
    }catch(e){notice(e.message||'파일을 읽지 못했어요.');}
  });paint();return ()=>clearTimeout(timer);
}
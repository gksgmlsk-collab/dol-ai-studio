const palette = ['#eef4ff','#5675db','#95c9bf','#ffbd65'];
const swatches=['하늘빛','파랑','민트','살구'];
const initial = [
  0,0,0,0,0,0,
  0,1,0,0,1,0,
  1,3,1,1,3,1,
  0,1,2,2,1,0,
  0,2,0,0,2,0,
  2,0,0,0,0,2
];
function read(value){
  return {
    enabled:value?.enabled===true,
    cells:Array.isArray(value?.cells)&&value.cells.length===36?value.cells.map(n=>Number.isInteger(n)&&n>=0&&n<=3?n:0):[...initial],
    seed:Number.isSafeInteger(value?.seed)?value.seed>>>0:317,
    palette:[...palette]
  };
}
// Train empirical conditional color frequencies on a tiled sample. For unseen
// neighborhoods, back off to a one-neighbor model, then to global frequencies.
function sample(v,w,h){
  const hist=new Map();
  function count(key,color){if(!hist.has(key))hist.set(key,[0,0,0,0]);hist.get(key)[color]++;}
  for(let y=0;y<6;y++)for(let x=0;x<6;x++){
    const color=v.cells[y*6+x],left=v.cells[y*6+(x+5)%6],up=v.cells[((y+5)%6)*6+x];
    for(const key of [left+','+up,'L'+left,'U'+up,'all'])count(key,color);
  }
  let s=v.seed;
  function choose(weights){
    s=(Math.imul(s,1664525)+1013904223)>>>0;
    let r=(s/4294967296)*weights.reduce((a,b)=>a+b,0);
    for(let i=0;i<4;i++){r-=weights[i];if(r<0)return i;}
    return 0;
  }
  const cells=[];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const left=x?cells[y*w+x-1]:undefined,up=y?cells[(y-1)*w+x]:undefined;
    cells.push(choose(hist.get(left+','+up)??hist.get('L'+left)??hist.get('U'+up)??hist.get('all')));
  }
  return cells;
}
const cached=new Map();
export function drawLearnedPattern(ctx,value,x,y,width,height){
  if(!value?.enabled)return;
  const v=read(value),w=18,h=8,key=v.seed+'/'+v.cells.join('');
  if(!cached.has(key)){if(cached.size>20)cached.clear();cached.set(key,sample(v,w,h));}
  const cells=cached.get(key);
  for(let j=0;j<h;j++)for(let i=0;i<w;i++){
    ctx.fillStyle=v.palette[cells[j*w+i]];
    const left=Math.round(width*i/w),top=Math.round(height*j/h);
    ctx.fillRect(x+left,y+top,Math.round(width*(i+1)/w)-left,Math.round(height*(j+1)/h)-top);
  }
}
export function mountPatternEditor(container,value,onChange){
  if(!container)return;
  const v=read(value),panel=document.createElement('details');
  panel.className='pattern-box';
  panel.innerHTML='<summary>내 그림으로 무늬 학습하기</summary><div class="pattern-content"><p>색을 고르고 예시를 그려 보세요. 컴퓨터가 이웃한 색의 관계를 배워 새 무늬를 만들어요.</p><div class="pattern-colors" aria-label="그릴 색"></div><div class="pattern-pair"><div><strong>내가 그린 예시</strong><div class="pattern-grid" role="group" aria-label="예시 그림 6행 6열"></div></div><div><strong>학습한 무늬</strong><canvas width="144" height="64" aria-label="예시에서 학습한 무늬"></canvas><button type="button" class="pattern-next">다른 무늬 실험</button></div></div><label class="pattern-use"><input type="checkbox"> 이 무늬를 작품에 넣기</label></div>';
  container.replaceChildren(panel);
  const $=s=>panel.querySelector(s), grid=$('.pattern-grid'), colors=$('.pattern-colors'), use=$('input'),ctx=$('canvas').getContext('2d');
  use.checked=v.enabled;let selected=1;
  palette.forEach((color,i)=>{
    const b=document.createElement('button');b.type='button';b.style.setProperty('--swatch',color);
    b.title=swatches[i];b.setAttribute('aria-label',swatches[i]);b.setAttribute('aria-pressed',String(i===selected));colors.append(b);
    b.onclick=()=>{selected=i;[...colors.children].forEach((e,k)=>e.setAttribute('aria-pressed',String(k===i)));};
  });
  function paint(){drawLearnedPattern(ctx,{...v,enabled:true},0,0,144,64);}
  function changed(){paint();onChange({...v,cells:[...v.cells],palette:[...v.palette]});}
  function label(i){return (Math.floor(i/6)+1)+'행 '+(i%6+1)+'열, '+swatches[v.cells[i]];}
  v.cells.forEach((n,i)=>{
    const b=document.createElement('button');b.type='button';b.style.background=palette[n];b.setAttribute('aria-label',label(i));grid.append(b);
    b.onclick=()=>{v.cells[i]=selected;b.style.background=palette[selected];b.setAttribute('aria-label',label(i));changed();};
  });
  $('.pattern-next').onclick=()=>{v.seed=(Math.imul(v.seed,1103515245)+12345)>>>0;changed();};
  use.onchange=()=>{v.enabled=use.checked;changed();};paint();
}

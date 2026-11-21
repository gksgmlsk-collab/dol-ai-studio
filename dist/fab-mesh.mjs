const shades=['#80a18a','#e7bd71','#9dbfce','#d58f79','#b9aad3'];
const kinds={box:'상자',cylinder:'원기둥',sphere:'구',mesh:'가져온 STL'};
const uid=()=>crypto.randomUUID?.()||'part-'+Math.random().toString(36).slice(2);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
function part(type,name,size,pos,color){return {id:uid(),type,name,size,pos,rot:[0,0,0],color,note:''};}
export function newMesh(){
  const parts=[part('box','받침대',[62,35,5],[0,0,2.5],shades[0]),part('cylinder','기둥',[12,12,29],[-15,0,19.5],shades[1]),part('box','모형 팔',[49,9,6],[3,0,37],shades[2])];
  return {parts,selected:parts[0].id,description:'고정대 위에서 모형 팔이 움직일 공간을 살펴봐요.',link:'',view:{yaw:-.78,pitch:.54,zoom:1}};
}
function shapes(type){
  const t=[],quad=(a,b,c,d)=>t.push([a,b,c],[a,c,d]);
  if(type==='box'){
    const v=[[-.5,-.5,-.5],[.5,-.5,-.5],[.5,.5,-.5],[-.5,.5,-.5],[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]];
    for(const f of [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]])quad(...f.map(i=>v[i]));
  }else if(type==='cylinder'){
    for(let i=0;i<24;i++){const a=i*Math.PI/12,b=(i+1)*Math.PI/12;const p=[Math.cos(a)/2,Math.sin(a)/2],q=[Math.cos(b)/2,Math.sin(b)/2];quad([...p,-.5],[...q,-.5],[...q,.5],[...p,.5]);t.push([[0,0,-.5],[...q,-.5],[...p,-.5]],[[0,0,.5],[...p,.5],[...q,.5]]);}
  }else{
    const at=(i,j)=>{const a=i*Math.PI/10,b=-Math.PI/2+j*Math.PI/10;return [Math.cos(a)*Math.cos(b)/2,Math.sin(a)*Math.cos(b)/2,Math.sin(b)/2];};
    for(let i=0;i<20;i++)for(let j=0;j<10;j++){const a=at(i,j),b=at(i+1,j),c=at(i+1,j+1),d=at(i,j+1);if(j>0)t.push([a,b,c]);if(j<9)t.push([a,c,d]);}
  }return t;
}
const primitive={box:shapes('box'),cylinder:shapes('cylinder'),sphere:shapes('sphere')};
function faces(p){
  const r=p.rot.map(v=>v*Math.PI/180),co=r.map(Math.cos),si=r.map(Math.sin);
  const world=a=>{let [x,y,z]=a.map((v,i)=>v*p.size[i]);[y,z]=[y*co[0]-z*si[0],y*si[0]+z*co[0]];[x,z]=[x*co[1]+z*si[1],-x*si[1]+z*co[1]];[x,y]=[x*co[2]-y*si[2],x*si[2]+y*co[2]];return [x+p.pos[0],y+p.pos[1],z+p.pos[2]];};
  return (p.type==='mesh'?p.triangles:primitive[p.type]).map(tri=>tri.map(world));
}
function bounds(tris){
  const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];for(const f of tris)for(const p of f)for(let i=0;i<3;i++){if(p[i]<low[i])low[i]=p[i];if(p[i]>high[i])high[i]=p[i];}
  if(!tris.length)return {low:[-1,-1,0],high:[1,1,2],size:[2,2,2],centre:[0,0,1]};
  return {low,high,size:high.map((n,i)=>n-low[i]),centre:high.map((n,i)=>(n+low[i])/2)};
}
function normal(tri){const [a,b,c]=tri,u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],d=Math.hypot(...n);return d?n.map(x=>x/d):[0,0,0];}
export function meshSTL(s){
  const triangles=s.parts.flatMap(faces).filter(t=>normal(t).some(Boolean));
  if(!triangles.length)throw Error('면이 있는 부품을 먼저 추가해 주세요.');
  const b=new ArrayBuffer(84+50*triangles.length),v=new DataView(b);new Uint8Array(b,0,80).set(new TextEncoder().encode('DOL AI STUDIO | coordinate unit: mm | unverified for printing'));v.setUint32(80,triangles.length,true);
  let offset=84;for(const t of triangles){for(const n of [...normal(t),...t.flat()]){if(!Number.isFinite(n))throw Error('좌표를 확인해 주세요.');v.setFloat32(offset,n,true);offset+=4;}offset+=2;}return new Blob([b],{type:'model/stl'});
}
export function readSTL(buffer,name='가져온 STL'){
  if(buffer.byteLength>2300000)throw Error('2.3MB 이하·삼각형 8,000개 이하의 STL을 골라 주세요.');
  const v=new DataView(buffer),triangles=[];const count=buffer.byteLength>=84?v.getUint32(80,true):0;
  if(count>0&&84+count*50===buffer.byteLength){
    if(count>8000)throw Error('이 작업실은 STL 삼각형 8,000개까지 지원해요.');
    for(let n=0;n<count;n++){let i=84+n*50+12;const t=[];for(let j=0;j<3;j++){t.push([v.getFloat32(i,true),v.getFloat32(i+4,true),v.getFloat32(i+8,true)]);i+=12;}triangles.push(t);}
  }else{
    const text=new TextDecoder().decode(buffer);if(!/^\s*solid\b/i.test(text)||!/endsolid\b/i.test(text))throw Error('ASCII 또는 바이너리 STL 파일을 선택해 주세요.');
    const verts=[];for(const m of text.matchAll(/\bvertex\s+([-+.\deE]+)\s+([-+.\deE]+)\s+([-+.\deE]+)/gi)){verts.push(m.slice(1).map(Number));if(verts.length>24000)throw Error('삼각형이 너무 많아요.');}
    if(!verts.length||verts.length%3)throw Error('STL 삼각형을 읽을 수 없어요.');
    for(let n=0;n<verts.length;n+=3)triangles.push(verts.slice(n,n+3));
  }
  if(!triangles.length||triangles.some(t=>t.some(pt=>pt.some(n=>!Number.isFinite(n)||Math.abs(n)>10000))))throw Error('유효한 mm 좌표의 STL이 필요해요.');
  const b=bounds(triangles);if(b.size.some(n=>n<=0||n>2000))throw Error('가로·세로·높이가 0보다 크고 각각 2,000mm 이하여야 해요.');
  const p=part('mesh',name,b.size,b.centre,shades[2]);p.triangles=triangles.map(t=>t.map(a=>a.map((n,i)=>(n-b.centre[i])/b.size[i])));return p;
}
function tint(col,n){const raw=parseInt(col.replace('#',''),16);return 'rgb('+[16,8,0].map(s=>clamp(Math.round(((raw>>s)&255)*n),0,255)).join(',')+')';}
export function drawMesh(c,s){
  const g=c.getContext('2d'),w=c.width,h=c.height;g.fillStyle='#f5f1e6';g.fillRect(0,0,w,h);
  const all=s.parts.map(p=>({p,faces:faces(p)})),bb=bounds(all.flatMap(f=>f.faces)),{yaw,pitch,zoom}=s.view;
  const scale=Math.min(w*.86,h*.83)/Math.max(26,Math.hypot(...bb.size))*zoom,a=Math.cos(yaw),b=Math.sin(yaw),u=Math.sin(pitch),v=Math.cos(pitch);
  function proj(p){const x=p[0]-bb.centre[0],y=p[1]-bb.centre[1],z=p[2]-bb.centre[2],d=x*b+y*a;return [w/2+(x*a-y*b)*scale,h*.53-(z*v-d*u)*scale,d*v+z*u];}
  const span=Math.max(50,Math.ceil(Math.max(...bb.size)*1.5/10)*10),step=Math.max(5,Math.ceil(span/14/5)*5);
  g.lineWidth=1;g.strokeStyle='#dedccd';for(let n=-span;n<=span;n+=step){for(const l of [[[n,-span,0],[n,span,0]],[[-span,n,0],[span,n,0]]]){const [aa,zz]=l.map(proj);g.beginPath();g.moveTo(aa[0],aa[1]);g.lineTo(zz[0],zz[1]);g.stroke();}}
  const surfaces=[];for(const {p,faces:ts} of all)for(const t of ts){const pts=t.map(proj),n=normal(t),shade=clamp(.79+n[2]*.18-n[1]*.12-n[0]*.12,.56,1.14);surfaces.push({pts,depth:(pts[0][2]+pts[1][2]+pts[2][2])/3,color:tint(p.color,shade)});}
  surfaces.sort((x,y)=>x.depth-y.depth);for(const f of surfaces){g.fillStyle=g.strokeStyle=f.color;g.lineWidth=.55;g.beginPath();g.moveTo(...f.pts[0].slice(0,2));g.lineTo(...f.pts[1].slice(0,2));g.lineTo(...f.pts[2].slice(0,2));g.closePath();g.fill();g.stroke();}return bb;
}
export function meshThumbnail(s){const c=document.createElement('canvas');c.width=420;c.height=230;drawMesh(c,s);return c.toDataURL('image/jpeg',.79);}
export function mountMesh(root,s,change,notice){
  let drag=null;const selected=()=>s.parts.find(p=>p.id===s.selected);
  function renderCanvas(){const c=root.querySelector('canvas');if(!c)return;const b=drawMesh(c,s),dim=root.querySelector('[data-dim]');dim.textContent='전체 크기 '+b.size.map(n=>Math.round(n*10)/10).join(' × ')+' mm';}
  function paint(){
    const p=selected(),labels=['X','Y','Z'];
    const row=(key,title,min,max)=>'<fieldset><legend>'+title+'</legend><div class="fb-xyz">'+labels.map((l,i)=>'<label>'+l+'<input type="number" step="0.1" min="'+min+'" max="'+max+'" data-axis="'+i+'" data-field="'+key+'" value="'+Number(p[key][i].toFixed(2))+'"></label>').join('')+'</div></fieldset>';
    root.innerHTML=`<div class="fb-work"><section class="fb-box"><h2>부품 설계</h2><div class="fb-choices">${['box','cylinder','sphere'].map(k=>'<button type="button" data-add="'+k+'">'+kinds[k]+' 추가</button>').join('')}</div><label>편집할 부품<select data-select>${s.parts.map(v=>'<option value="'+esc(v.id)+'" '+(p?.id===v.id?'selected':'')+'>'+esc(v.name)+'</option>').join('')}</select></label>
      ${p?`<div class="fb-cols"><label>부품 이름<input data-part="name" maxlength="80" value="${esc(p.name)}"></label><label>색<input type="color" data-part="color" value="${p.color}"></label></div>${row('size','치수 (mm)',.1,2000)}${row('pos','중심 위치 (mm)',-5000,5000)}${row('rot','회전 (도)',-360,360)}<label>이 부위의 질문·피드백<textarea data-part="note" maxlength="1500">${esc(p.note)}</textarea></label><button type="button" data-remove>선택한 부품 빼기</button>`:''}
      <label>STL 부품 가져오기<input type="file" accept=".stl" data-stl></label>
    </section><section class="fb-box"><h2>3D 모델 미리보기</h2><canvas class="fb-mesh" width="760" height="470" aria-label="회전할 수 있는 3차원 모델" tabindex="0"></canvas><div class="fb-choices">${[['l','왼쪽 회전'],['r','오른쪽 회전'],['u','위에서 보기'],['d','아래에서 보기'],['+','확대'],['-','축소'],['fit','처음 시점']].map(([k,t])=>'<button type="button" data-view="'+k+'">'+t+'</button>').join('')}</div><p class="fb-help" data-dim></p><p class="fb-help">드래그로 회전하고 휠로 확대해요. STL 좌표를 mm로 읽어요. 출력 전 슬라이서에서 단위, 겹침, 벽 두께를 확인해 주세요.</p><label>구조 설명<textarea data-main="description" maxlength="1600">${esc(s.description)}</textarea></label><label>외부 설계 프로젝트 주소 (선택)<input data-main="link" type="url" value="${esc(s.link)}" placeholder="https://…"></label><div data-link></div></section></div>`;
    drawLink();renderCanvas();
  }
  function drawLink(){const node=root.querySelector('[data-link]');node.replaceChildren();try{const u=new URL(s.link);if(u.protocol!=='https:'||u.username||u.password)return;const a=document.createElement('a');a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent='연결한 설계 페이지 열기';node.append(a);}catch{}}
  function view(action){
    const v=s.view;if(action==='fit')s.view={yaw:-.78,pitch:.54,zoom:1};else if(action==='l'||action==='r')v.yaw+=action==='l'?-.22:.22;else if(action==='u'||action==='d')v.pitch=clamp(v.pitch+(action==='u'?.16:-.16),-1.45,1.45);else v.zoom=clamp(v.zoom*(action==='+'?1.15:1/1.15),.35,4);
    renderCanvas();change();
  }
  root.addEventListener('click',e=>{const a=e.target.closest('button');if(!a)return;
    if(a.hasAttribute('data-add')){if(s.parts.length>=24){notice('한 설계에 부품을 24개까지 넣을 수 있어요.');return;}const k=a.dataset.add,p=part(k,kinds[k]+' '+(s.parts.length+1),[14,14,14],[s.parts.length*4,0,7],shades[s.parts.length%5]);s.parts.push(p);s.selected=p.id;change();paint();}
    else if(a.hasAttribute('data-remove')){s.parts=s.parts.filter(v=>v.id!==s.selected);s.selected=s.parts[0]?.id||'';change();paint();}
    else if(a.hasAttribute('data-view'))view(a.dataset.view);
  });
  root.addEventListener('input',e=>{const t=e.target,p=selected();if(t.dataset.main){s[t.dataset.main]=t.value;if(t.dataset.main==='link')drawLink();change();}else if(p&&t.dataset.part){p[t.dataset.part]=t.value;if(t.dataset.part==='color')renderCanvas();if(t.dataset.part==='name'){const o=root.querySelector('[data-select]')?.selectedOptions[0];if(o)o.textContent=p.name;}change();}});
  root.addEventListener('change',async e=>{const t=e.target,p=selected();
    if(t.hasAttribute('data-select')){s.selected=t.value;change();paint();}
    else if(t.hasAttribute('data-field')&&p){const i=+t.dataset.axis,k=t.dataset.field,n=t.valueAsNumber;if(!Number.isFinite(n)||!t.checkValidity()){t.value=p[k][i];notice('표시된 범위에 맞는 수를 입력해 주세요.');return;}p[k][i]=n;change();renderCanvas();}
    else if(t.hasAttribute('data-stl')&&t.files?.[0]){try{if(s.parts.length>=24)throw Error('부품을 24개까지 넣을 수 있어요.');const f=t.files[0];const item=readSTL(await f.arrayBuffer(),f.name.slice(0,80));s.parts.push(item);s.selected=item.id;change();paint();notice('STL 부품을 추가했어요.');}catch(e){notice(e.message);}}
  });
  root.addEventListener('pointerdown',e=>{if(!e.target.matches('.fb-mesh'))return;drag={x:e.clientX,y:e.clientY,id:e.pointerId};e.target.setPointerCapture(e.pointerId);});
  root.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;s.view.yaw+=(e.clientX-drag.x)*.014;s.view.pitch=clamp(s.view.pitch-(e.clientY-drag.y)*.012,-1.45,1.45);drag.x=e.clientX;drag.y=e.clientY;renderCanvas();});
  const stop=()=>{if(drag){drag=null;change();}};root.addEventListener('pointerup',stop);root.addEventListener('pointercancel',stop);
  root.addEventListener('wheel',e=>{if(!e.target.matches('.fb-mesh'))return;e.preventDefault();view(e.deltaY<0?'+':'-');},{passive:false});
  root.addEventListener('keydown',e=>{if(!e.target.matches('.fb-mesh'))return;const k={ArrowLeft:'l',ArrowRight:'r',ArrowUp:'u',ArrowDown:'d','+':'+','-':'-',Home:'fit'}[e.key];if(k){e.preventDefault();view(k);}});paint();return ()=>{};
}
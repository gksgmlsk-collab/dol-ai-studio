import {storage as localStorage,dbName} from './workspace-data.mjs';
import { mountPatternEditor, drawLearnedPattern } from './pattern.mjs';

const STORE = 'thinking-lab-media-v1';
const LABEL = {
  subject: { robot: '탐험 로봇', rabbit: '토끼', cat: '고양이' },
  palette: { blue: '파란 하늘', coral: '노을빛', mint: '초록빛', violet: '보랏빛' },
  place: { garden: '언덕 정원', space: '달 표면', sea: '바닷속' },
  position: { left: '왼쪽', center: '가운데', right: '오른쪽' },
  motion: { stay: '제자리', right: '오른쪽으로', left: '왼쪽으로', jump: '통통 뛰기' },
  detail: { star: '반짝이는 별', flower: '작은 꽃', heart: '하트', crystal: '수정' }
};
const COLORS = {
  blue: ['#abe0ff','#e1f6ff','#4372df','#b9d8ff'],
  coral: ['#ffc5af','#ffe9af','#eb6e61','#ffcfb9'],
  mint: ['#a2dfcd','#e3f4c9','#288b79','#b1edcb'],
  violet: ['#cfb6f4','#ffdced','#8656d3','#dfc3ff']
};
const ink = '#252f4c';
const FRAME_MS = 1800;
const when = () => new Date().toISOString();
const tidy = value => String(value ?? '').replace(/\r\n?/g,'\n').trim();
const compareText = value => tidy(value).replace(/\s+/g,' ');
const uid = () => globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2);
const clone = item => JSON.parse(JSON.stringify(item));
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mediaLabel = kind => kind === 'video' ? '영상' : '이미지';
const scene = (place = 'garden') => ({ place, position:'center', motion:'jump', detail:'star' });
const makeDraft = kind => ({
  title: '', plan: '', prediction: '', revisionReason: '', parentVersion: null,
  design: { subject:'robot', palette:'blue', scenes: kind === 'video' ? [scene('garden'), {...scene('space'), motion:'right'}] : [scene()], source:null }
});
let active = null;
let memory = [];
let storageFailed = false;

function cleanDesign(design, kind) {
  const pick = (group, value) => Object.hasOwn(LABEL[group], value) ? value : Object.keys(LABEL[group])[0];
  const source = design?.source;
  const validSource = source && Array.isArray(source.points) && source.points.length && source.points.every(p => Array.isArray(p) && p.length === 2 && p.every(n => Number.isFinite(n) && n >= 0 && n <= 4));
  return {
    subject: pick('subject', design?.subject), palette: pick('palette', design?.palette),
    pattern: design?.pattern && typeof design.pattern === 'object' ? clone(design.pattern) : undefined,
    scenes: (Array.isArray(design?.scenes) && design.scenes.length ? design.scenes : [scene()]).slice(0, kind === 'image' ? 1 : 4).map(s => Object.fromEntries(['place','position','motion','detail'].map(k => [k,pick(k,s?.[k])]))),
    source: validSource ? {title:String(source.title || ''), missionId:String(source.missionId || ''),version:Number(source.version) || 1,points:source.points.slice(0,150)} : null
  };
}

export function getMediaProjects() {
  try {
    const raw = localStorage.getItem(STORE);
    if (!storageFailed) {
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) memory = parsed.filter(p => p && p.id && ['image','video'].includes(p.kind) && Array.isArray(p.versions));
    }
  } catch { storageFailed = true; }
  return clone(memory);
}

function saveProject(project) {
  const projects = getMediaProjects();
  const index = projects.findIndex(p => p.id === project.id);
  const stored = projects[index];
  if (stored) {
    for (const version of project.versions) {
      const current = stored.versions.find(v => v.id === version.id);
      if (current) version.teacherFeedback = current.teacherFeedback || '';
    }
  }
  project.updatedAt = when();
  if (index >= 0) projects[index] = project;
  else projects.push(project);
  memory = clone(projects);
  try { localStorage.setItem(STORE,JSON.stringify(projects)); storageFailed = false; }
  catch { storageFailed = true; }
  if (active?.el?.isConnected) {
    const msg = active.el.querySelector('.ml-store');
    if (msg) msg.textContent = storageFailed ? '브라우저 저장 공간이 부족하거나 꺼져 있어요. 이 창에서 기록을 볼 수 있어요.' : '이 기기에 저장됨';
  }
}

export function saveMediaTeacherFeedback(projectId, versionId, text) {
  const projects = getMediaProjects();
  const project = projects.find(p => p.id === projectId);
  const version = project?.versions.find(v => v.id === versionId);
  if (!version) return false;
  version.teacherFeedback = tidy(text).slice(0,2400);
  project.updatedAt = when();
  memory = clone(projects);
  try { localStorage.setItem(STORE, JSON.stringify(projects)); storageFailed = false; }
  catch { storageFailed = true; }
  if (active?.p.id === projectId) {
    const live = active.p.versions.find(v => v.id === versionId);
    if (live) live.teacherFeedback = version.teacherFeedback;
  }
  window.dispatchEvent(new Event('labchange'));
  return true;
}

// All drawing coordinates refer to the same small pixel canvas, including the
// exported frames. Downloaded pictures and video match the classroom preview.
const surfaces = new WeakMap();
function stamp(ctx, x, y, rows, colors, scale = 1) {
  rows.forEach((row,j) => [...row].forEach((c,i) => {
    if (!colors[c]) return;
    ctx.fillStyle = colors[c]; ctx.fillRect(x+i*scale,y+j*scale,scale,scale);
  }));
}
function poly(ctx, points, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(...points[0]);
  points.slice(1).forEach(p => ctx.lineTo(...p));
  ctx.closePath(); ctx.fill();
}
function dot(ctx,x,y,c,w=1,h=w) { ctx.fillStyle=c; ctx.fillRect(x,y,w,h); }
const STAR = ['..a..','..a..','aaaaa','..a..','..a..'];
const FLOWER = ['.a.a.','aa.aa','.aba.','aa.aa','.a.a.','..c..','..c.c'];
const HEART = ['.aa.aa.','aaaaaaa','aaaaaaa','.aaaaa.','..aaa..','...a...'];
const GEM = ['..aa..','.abba.','abbbba','.abba.','..aa..'];
const tree = ['...aa...','..abba..','.abbbba.','abbbbbba','.abbbba.','..acca..','...cc...','...cc...'];
function backdrop(c, place, palette) {
  const [sky,light,accent] = COLORS[palette];
  dot(c,0,0,place==='space' ? '#292947' : sky,240,135);
  if (place === 'space') {
    for(let i=0;i<52;i++) dot(c,(i*67+11)%240,(i*37+8)%90, i%5 ? '#d4cdeb' : '#fff2a8',i%8?1:2,1);
    stamp(c,184,18,['....aaaa....','..aabbbbaa..','.abbbbbbbba.','abccbbbbbbba','accccbbbbbaa','.acccccccca.','..aaccccaa..','....aaaa....'],{a:'#a387c4',b:light,c:accent},2);
    poly(c,[[167,37],[183,29],[220,18],[224,18],[204,29],[180,39],[168,40]],'#c8b8f7');
    poly(c,[[0,87],[23,74],[45,78],[73,66],[103,82],[140,67],[172,78],[202,71],[240,80],[240,135],[0,135]],'#777993');
    poly(c,[[0,88],[23,79],[48,86],[77,75],[101,87],[138,79],[160,91],[189,84],[218,91],[240,86],[240,135],[0,135]],'#b9b3ce');
    for(let i=0;i<12;i++) {
      const x=(i*57+5)%240,y=92+(i*13)%40,w=4+(i*3)%11;
      dot(c,x,y,'#8c8aa7',w,2);dot(c,x+2,y+2,'#d8d3e4',w-1,1);
    }
  } else if (place === 'garden') {
    dot(c,0,43,light,240,44);
    for(const [x,y,s] of [[3,21,1],[145,13,1],[189,33,1],[54,10,1]]) {
      stamp(c,x,y,['....aaaa......','..aaaaaaaa....','aaaaaaaaaaaaa.','.aaaaaaaaaaaaa'],{a:'#fff8ee'},s);
    }
    poly(c,[[0,82],[0,63],[22,55],[42,61],[69,46],[90,57],[111,59],[129,48],[155,64],[185,51],[217,64],[240,55],[240,82]],'#89bda9');
    poly(c,[[0,91],[0,76],[29,65],[50,70],[77,58],[105,73],[132,68],[150,79],[171,67],[215,74],[240,69],[240,95]],'#67a290');
    dot(c,0,83,'#8acb79',240,52);dot(c,0,84,'#b2df89',240,3);
    poly(c,[[82,83],[89,83],[125,99],[116,105],[152,118],[175,135],[146,135],[129,122],[95,108],[103,100]],'#8ad6e0');
    [[15,59,3],[44,68,2],[197,59,3],[224,72,2]].forEach(([x,y,s])=>stamp(c,x,y,tree,{a:'#427e68',b:'#64b37b',c:'#775d53'},s));
    for(let i=0;i<28;i++) {
      const x=(i*57+7)%240, y=91+(i*17)%41;
      dot(c,x,y,i%5?'#71b376':'#ffe49a',2,2);dot(c,x+2,y-1,'#80bc72',2,1);
    }
  } else {
    dot(c,0,0,light,240,4);dot(c,0,4,sky,240,57);dot(c,0,61,'#6db8cb',240,32);dot(c,0,93,'#479ba8',240,42);
    for(let i=0;i<10;i++) {
      const x=i*35-22;
      poly(c,[[x,4],[x+6,4],[x-16,48],[x-22,51]],'#bce6e2');
    }
    for(let i=0;i<16;i++) {
      const x=(i*47+27)%240,y=(i*43+7)%90;
      stamp(c,x,y,['.aa.','a..a','.aa.'],{a:'#e3f9ed'});
    }
    poly(c,[[0,108],[24,100],[59,106],[92,98],[127,106],[151,101],[185,109],[221,99],[240,100],[240,135],[0,135]],'#ebcf97');
    for(const [x,y] of [[15,89],[27,99],[209,91],[222,88]]) {
      stamp(c,x,y,['.a...','aa..a','.a.a.','..aa.','..a..','.aa..'],{a:'#48916e'},2);
    }
    for(let i=0;i<12;i++) dot(c,(i*41+8)%240,113+(i*8)%20,'#c9b68d',2,1);
  }
}
const ROBOT = ['......nn......','.....nggn.....','......nn......','...nnnnnnnn...','..nwwwwwwwwn..','.nwwnnnnnnwwn.','.nwnggnggnwwn.','.nwwnnnnnnwwn.','..nwwwwwwwwn..','...nnaaaann...','.nnaabbaaaann.','.nnaaaaaaaann.','...nnaaaann...','...nwwnnwwn...','..nnnn..nnnn..'];
const CAT = ['.nn......nn.','.nan....nan.','.naan..naan.','.naannnnaan.','naaaaaaaaaan','nawwnaanfwan','naaananaaa an'.replace(/ /g,''),'naaaannaaaan','.nawwwwwaan.','..naaaaan...','.nawwwwaann.','.nawwwwaan.n','..nn..nn.nn.'];
const RABBIT = ['..nn..nn..','.nwwnnwwn.','.nwannawn.','.nwannawn.','.nwwnnwwn.','..nwwwwn..','.nwwwwwwn.','nwwnwwnwwn','nwwwggwwwn','.nwwwwwwn.','..naaa an..'.replace(/ /g,''),'.nwwaawwn.','.naaaaaan.','.nwwnnwwn.','.nnn..nnn.'];
function drawArt(canvas, design, index=0, t=1) {
  const current = design.scenes[index] || design.scenes[0];
  let buffer = surfaces.get(canvas);
  if (!buffer) { buffer=document.createElement('canvas');buffer.width=240;buffer.height=135;surfaces.set(canvas,buffer); }
  const c=buffer.getContext('2d');
  c.imageSmoothingEnabled=false;
  backdrop(c,current.place,design.palette);
  if (design.pattern?.enabled) drawLearnedPattern(c,design.pattern,12,13,70,33);
  const [,,accent,soft]=COLORS[design.palette];
  const object = { star:[STAR,{a:'#fff4a4'}],flower:[FLOWER,{a:'#f77fa1',b:'#ffdf6b',c:'#549665'}],heart:[HEART,{a:'#ff7897'}],crystal:[GEM,{a:'#865ab7',b:'#e7aef8'}] }[current.detail];
  const baseX={left:57,center:119,right:179}[current.position];
  const detailX=baseX>127 ? 60 : 169;
  stamp(c,detailX,77,object[0],object[1],2);
  let x=baseX, y=107;
  const path=design.source?.points;
  if (path?.length) {
    const point=([gx,gy])=>[Math.round(47+gx*35),Math.round(87+gy*8)];
    const progress=t*(path.length-1),index=Math.floor(progress);
    const a=point(path[index]), b=point(path[Math.min(index+1,path.length-1)]);
    for(let i=0;i<=index;i++){
      const [px,py]=point(path[i]);dot(c,px-1,py-1,'#fff4bc',3,3);
      if(i<index) {
        const [nx,ny]=point(path[i+1]);
        for(let n=0;n<1;n+=.15) dot(c,Math.round(px+(nx-px)*n),Math.round(py+(ny-py)*n),'#fff4bc',2,2);
      }
    }
    x=a[0]+(b[0]-a[0])*(progress-index);y=a[1]+(b[1]-a[1])*(progress-index);
  } else {
    if(current.motion==='right') x+=-22+44*t;
    if(current.motion==='left') x+=22-44*t;
    if(current.motion==='jump') y-=Math.abs(Math.sin(t*Math.PI*2))*15;
  }
  x=Math.round(x);y=Math.round(y);
  dot(c,x-11,path?.length?y:108,current.place==='space'?'#9690a9':current.place==='garden'?'#669f67':'#c2ac84',22,3);
  const sprite={robot:ROBOT,cat:CAT,rabbit:RABBIT}[design.subject];
  stamp(c,x-Math.floor(sprite[0].length),y-sprite.length*2,sprite,{n:ink,w:'#fff9e9',a:accent,b:soft,g:'#8df0cd',f:'#fff9e9'},2);
  const out=canvas.getContext('2d');
  out.imageSmoothingEnabled=false;out.drawImage(buffer,0,0,canvas.width,canvas.height);
}

export function renderMediaFrame(canvas, design, sceneIndex=0, progress=1) {
  const normalized=cleanDesign(design,'video');
  const index=Math.min(normalized.scenes.length-1,Math.max(0,Math.floor(Number(sceneIndex)||0)));
  drawArt(canvas,normalized,index,Math.min(1,Math.max(0,Number(progress)||0)));
}

function download(blob, name) {
  const url=URL.createObjectURL(blob), link=document.createElement('a');
  link.href=url;link.download=name;document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
const canvasBlob = (canvas,type,quality) => new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('이미지를 저장할 수 없어요.')),type,quality));
const bytes = s=>Uint8Array.from(s,c=>c.charCodeAt(0));
function words(...v) { const b=new Uint8Array(v.length*4); const d=new DataView(b.buffer);v.forEach((n,i)=>d.setUint32(i*4,n,true));return b; }
function riffChunk(id,parts) {
  const data=new Blob(parts);
  return new Blob([bytes(id),words(data.size),data,...(data.size%2?[new Uint8Array(1)]:[])]);
}
// MJPEG/AVI preserves a downloadable moving picture in browsers without a
// usable MediaRecorder codec. Each index entry points into the movi list.
async function avi(canvas, design, onProgress) {
  const fps=10, framesPerScene=18, count=design.scenes.length*framesPerScene;
  const chunks=[],index=[],w=canvas.width,h=canvas.height;
  let offset=4,maxSize=0;
  for(let i=0;i<count;i++){
    drawArt(canvas,design,Math.floor(i/framesPerScene),(i%framesPerScene)/(framesPerScene-1));
    const jpeg=await canvasBlob(canvas,'image/jpeg',.86);
    const chunk=riffChunk('00dc',[jpeg]);
    chunks.push(chunk);index.push(bytes('00dc'),words(16,offset,jpeg.size));
    offset+=chunk.size;maxSize=Math.max(maxSize,jpeg.size);
    onProgress((i+1)/count);
  }
  const avih=riffChunk('avih',[words(1000000/fps,maxSize*fps,0,16,count,0,1,maxSize,w,h,0,0,0,0)]);
  const rect=new Uint8Array(8);const coords=new DataView(rect.buffer);coords.setInt16(4,w,true);coords.setInt16(6,h,true);
  const strh=riffChunk('strh',[bytes('vidsMJPG'),words(0,0,0,1,fps,0,count,maxSize,0xffffffff,0),rect]);
  const strf=riffChunk('strf',[words(40,w,h,24*65536+1),bytes('MJPG'),words(w*h*3,0,0,0,0)]);
  const hdrl=riffChunk('LIST',[bytes('hdrl'),avih,riffChunk('LIST',[bytes('strl'),strh,strf])]);
  const result=riffChunk('RIFF',[bytes('AVI '),hdrl,riffChunk('LIST',[bytes('movi'),...chunks]),riffChunk('idx1',index)]);
  return {blob:new Blob([result],{type:'video/x-msvideo'}),ext:'avi'};
}

async function makeVideo(design, onProgress) {
  const canvas=document.createElement('canvas');canvas.width=720;canvas.height=405;
  const formats=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/mp4','video/webm'];
  const mime=globalThis.MediaRecorder?.isTypeSupported && formats.find(f=>MediaRecorder.isTypeSupported(f));
  if (mime && canvas.captureStream && document.visibilityState!=='hidden') {
    let stream, recorder, timer;
    try {
      drawArt(canvas,design,0,0);
      stream=canvas.captureStream(24);
      recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:1800000});
      const blob=await new Promise((resolve,reject)=>{
        const parts=[];
        recorder.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};
        recorder.onerror=()=>reject(new Error('인코더를 사용할 수 없어요.'));
        recorder.onstop=()=>parts.length?resolve(new Blob(parts,{type:mime})):reject(new Error('영상 데이터가 없어요.'));
        recorder.start();
        const start=performance.now(),duration=design.scenes.length*FRAME_MS;
        const tick=()=>{
          try {
            const ms=Math.min(performance.now()-start,duration-1);
            drawArt(canvas,design,Math.floor(ms/FRAME_MS),(ms%FRAME_MS)/(FRAME_MS-1));
            onProgress(ms/duration);
            if(performance.now()-start>=duration) recorder.stop();
            else timer=setTimeout(tick,1000/24);
          } catch(error) { reject(error); }
        };
        tick();
      });
      return {blob,ext:mime.includes('mp4')?'mp4':'webm'};
    } catch { /* Retry with the frame-based encoder below. */ }
    finally {
      clearTimeout(timer);
      if(recorder?.state==='recording') recorder.stop();
      stream?.getTracks().forEach(track=>track.stop());
    }
  }
  return avi(canvas,design,onProgress);
}

const ICONS = {
  image:'<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="9" r="1.5"/><path d="m4 17 5-5 4 4 3-3 4 4"/>',
  video:'<rect x="3" y="5" width="13" height="14" rx="3"/><path d="m16 10 5-3v10l-5-3z"/>',
  pencil:'<path d="m4 16-1 5 5-1L20 8l-4-4zM13 7l4 4"/>',
  play:'<path d="m7 4 13 8-13 8z"/>',
  stop:'<rect x="6" y="6" width="12" height="12" rx="1"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
  stack:'<path d="m3 8 9-5 9 5-9 5zM3 12l9 5 9-5M3 16l9 5 9-5"/>',
  back:'<path d="m14 5-7 7 7 7"/>',
  save:'<path d="m5 12 4 4 10-10"/>',
  plus:'<path d="M12 5v14M5 12h14"/>'
};
const icon = key => `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[key]||''}</svg>`;
const btn = (action, label, options='')=>`<button type="button" data-action="${action}" ${options}>${label}</button>`;
const select = (key,current,label)=>`<label class="ml-field"><span>${label}</span><select data-design="${key}">${Object.entries(LABEL[key]).map(([value,name])=>`<option value="${value}"${current===value?' selected':''}>${name}</option>`).join('')}</select></label>`;
const field = (name,label,value,hint,required=true)=>`<label class="ml-field"><span>${label}</span><textarea rows="2" maxlength="1300" data-text="${name}" ${required?'required':''} placeholder="${esc(hint)}">${esc(value)}</textarea></label>`;
const tick = (s,msg)=>{const box=s.el.querySelector('.ml-message');if(box)box.textContent=msg;};
const signalChange=()=>window.dispatchEvent(new Event('labchange'));
const versionOf=s=>s.p.versions.find(v=>v.id===s.versionId) || s.p.versions.at(-1);
const designOf=s=>s.edit?s.p.draft.design:versionOf(s)?.design;

function stopPlayback(s) {
  if (s.playing) cancelAnimationFrame(s.playing);
  s.playing=0;
}
function paintPreview(s) {
  const canvas=s.el.querySelector('.ml-canvas'), design=designOf(s);
  if(!canvas||!design)return;
  stopPlayback(s);
  const i=Math.min(design.scenes.length-1,s.index);
  drawArt(canvas,design,i,s.p.kind==='image'?1:0);
  const button=s.el.querySelector('[data-action="play"]');
  if(button)button.innerHTML=icon('play')+' 재생';
  const caption=s.el.querySelector('.ml-frame-caption');
  if(caption) caption.textContent=`장면 ${i+1} · ${LABEL.place[design.scenes[i].place]}`;
}
function play(s) {
  if(s.playing){paintPreview(s);return;}
  const canvas=s.el.querySelector('.ml-canvas'), design=designOf(s), button=s.el.querySelector('[data-action="play"]');
  if(!canvas||!design||!button)return;
  const start=performance.now();
  button.innerHTML=icon('stop')+' 멈추기';
  const frame=t=>{
    if(active!==s||!s.el.contains(canvas)||!canvas.isConnected){stopPlayback(s);return;}
    const end=FRAME_MS*design.scenes.length,ms=Math.max(0,Math.min(t-start,end-1)),index=Math.floor(ms/FRAME_MS);
    drawArt(canvas,design,index,(ms%FRAME_MS)/(FRAME_MS-1));
    const caption=s.el.querySelector('.ml-frame-caption');
    if(caption)caption.textContent=`장면 ${index+1} · ${LABEL.place[design.scenes[index].place]}`;
    if(t-start<end)s.playing=requestAnimationFrame(frame);
    else{ s.playing=0;button.innerHTML=icon('play')+' 다시 재생'; }
  };
  s.playing=requestAnimationFrame(frame);
}

function history(s) {
  if(!s.p.versions.length)return '';
  return `<section class="ml-card ml-history"><h2>${icon('stack')} 버전 기록</h2><div class="ml-version-list">${s.p.versions.map(v=>btn('version',`<b>v${Number(v.number)}</b><span>${esc(v.revisionReason || v.plan || '첫 번째 작품')}</span>`,`class="ml-version ${!s.edit&&s.versionId===v.id?'ml-selected':''}" data-id="${esc(v.id)}"`)).join('')}</div>${!s.edit&&s.p.draft?btn('resume','작성 중인 버전 이어가기','class="ml-quiet"'):''}</section>`;
}
function sourceSection(s) {
  const source=s.p.draft?.design.source;
  return s.sources.length || source ? `<label class="ml-field"><span>코딩 실험의 이동 경로</span><select data-source><option value="">이 장면에서 정한 움직임</option>${s.sources.map((v,i)=>`<option value="${i}" ${source?.missionId===v.missionId&&source?.version===v.version?'selected':''}>${esc(v.title)} · v${Number(v.version)}</option>`).join('')}${source&&!s.sources.some(v=>v.missionId===source.missionId&&v.version===source.version)?`<option value="saved" selected>${esc(source.title)} · v${Number(source.version)}</option>`:''}</select><small>기록한 경로를 고르면 주인공이 코드의 발자국을 따라가요.</small></label>`:'';
}
function sceneFields(s) {
  const d=s.p.draft.design, video=s.p.kind==='video', item=d.scenes[s.index];
  return `<section class="ml-card"><h2>${icon('stack')} ${video?'스토리보드':'그림 구성'}</h2>
    ${video?`<div aria-label="장면 선택" class="ml-tabs">${d.scenes.map((_,i)=>btn('scene',`장면 ${i+1}`,`class="ml-tab ${i===s.index?'ml-selected':''}" aria-pressed="${i===s.index}" data-index="${i}"`)).join('')}${d.scenes.length<4?btn('add',icon('plus')+' 장면','class="ml-tab"'):''}</div>`:''}
    <div class="ml-fields">${select('subject',d.subject,'주인공')}${select('palette',d.palette,'빛과 색')}${select('place',item.place,'배경')}${select('detail',item.detail,'등장할 물건')}
    ${!d.source?select('position',item.position,'주인공 위치'):''}${video&&!d.source?select('motion',item.motion,'움직임'):''}</div>
    <div class="ml-source">${sourceSection(s)}</div>
    ${video&&d.scenes.length>1?`<div class="ml-scene-actions">${btn('moveleft','앞으로 옮기기',`class="ml-quiet" ${s.index===0?'disabled':''}`)}${btn('moveright','뒤로 옮기기',`class="ml-quiet" ${s.index===d.scenes.length-1?'disabled':''}`)}${btn('remove','이 장면 빼기','class="ml-quiet"')}</div>`:''}
    <div class="ml-pattern"></div></section>`;
}
function previousNote(s,v) {
  if(!v)return '';
  return `<div class="ml-note"><strong>v${v.number}에서 받은 피드백</strong><p>${esc(v.feedback || '아직 기록한 피드백이 없어요.')}</p>${v.teacherFeedback?`<small>선생님의 피드백</small><p>${esc(v.teacherFeedback)}</p>`:''}</div>`;
}
function form(s) {
  const d=s.p.draft, parent=s.p.versions.find(v=>v.number===d.parentVersion);
  return `<form class="ml-edit"><section class="ml-card"><h2>${icon('pencil')} 나의 제작 계획</h2>
    <label class="ml-field"><span>작품 이름 <small>선택</small></span><input data-text="title" maxlength="60" value="${esc(d.title)}" placeholder="나의 작품에 이름을 지어 주세요"></label>
    ${field('plan','어떤 이야기를 전하고 싶나요?',d.plan,'예: 길을 잃은 로봇이 별을 찾는 모습을 보여 주고 싶어요.')}
    ${field('prediction','어떤 모습이 나올까요?',d.prediction,s.p.kind==='video'?'예: 첫 장면에서 로봇이 뛰고, 다음 장면에서는 달 위를 걸을 거예요.':'예: 초록 언덕 왼쪽에 로봇이 있고, 반대편에 별이 보일 거예요.')}
    ${parent?previousNote(s,parent)+field('revisionReason','피드백을 보고 왜 바꾸기로 했나요?',d.revisionReason,'예: 친구가 별을 찾기 어렵다고 해서 배경의 색을 바꿀 거예요.'):''}</section>
    ${sceneFields(s)}<div class="ml-form-actions"><button type="submit" class="ml-primary">${icon(s.p.kind)} ${mediaLabel(s.p.kind)} v${s.p.versions.length+1} 만들기</button></div></form>`;
}
function review(s,v) {
  const latest=s.p.versions.at(-1)?.id===v.id;
  return `<section class="ml-card"><h2>${icon('pencil')} 결과를 보고 생각하기</h2><dl class="ml-summary"><dt>내가 예상한 모습</dt><dd>${esc(v.prediction)}</dd>${v.revisionReason?`<dt>이 버전에서 바꾸려던 점</dt><dd>${esc(v.revisionReason)}</dd>`:''}</dl>
  <form class="ml-review">${field('observation','예상과 실제는 어떻게 달랐나요?',v.observation,'같았던 점이나 뜻밖이었던 장면을 하나 찾아보세요.')}
  ${field('feedback','내가 발견하거나 친구에게 들은 개선점은?',v.feedback,'어디를 어떻게 바꾸면 더 잘 전달될까요?')}
  ${v.teacherFeedback?`<div class="ml-note"><strong>선생님의 피드백</strong><p>${esc(v.teacherFeedback)}</p></div>`:''}
  <div class="ml-form-actions"><button type="submit" class="ml-secondary">${icon('save')} 기록 저장</button>
  ${latest&&!s.p.draft?btn('revise','다음 버전 만들기','class="ml-primary"'):''}</div></form></section>`;
}
function render(s) {
  stopPlayback(s);const p=s.p,video=p.kind==='video',v=versionOf(s), design=designOf(s);
  if(!design)return;
  s.index=Math.min(s.index,design.scenes.length-1);
  s.el.innerHTML=`<div class="ml"><div class="ml-top">${btn('home',icon('back')+' 작업실 홈','class="ml-back"')}<span class="ml-store">${storageFailed?'이 창에 임시 저장됨':p.versions.length||p.draft?.plan?'이 기기에 저장됨':''}</span></div>
    <div class="ml-title"><div class="ml-icon">${icon(p.kind)}</div><div><h1>${mediaLabel(p.kind)} 작업실</h1><p>${video?'장면을 순서대로 연결하고, 움직임이 생각한 대로 이어지는지 살펴봐요.':'주인공과 배경을 정하고, 그림에 담긴 이야기가 잘 전해지는지 살펴봐요.'}</p></div></div>
    <div class="ml-layout"><div class="ml-work">${s.edit?form(s):review(s,v)}</div><div class="ml-aside">
    <section class="ml-card ml-preview"><div class="ml-preview-head"><h2>${icon(p.kind)} ${s.edit?'장면 밑그림':esc(v.title || p.title)}</h2><span class="ml-tag">${s.edit?'구상 중':'v'+v.number}</span></div>
    <div class="ml-art"><canvas class="ml-canvas" width="720" height="405" role="img" aria-label="${esc(LABEL.place[design.scenes[s.index].place]+'에 있는 '+LABEL.subject[design.subject])}"></canvas></div>
    <div class="ml-controls"><span class="ml-frame-caption"></span><div>${video?btn('play',icon('play')+' 재생','class="ml-quiet"'):''}${!s.edit?btn('download',icon('download')+' 내려받기','class="ml-secondary"'):''}</div></div>
    ${design.source?`<p class="ml-caption">${esc(design.source.title)} v${Number(design.source.version)}의 경로를 담았어요.</p>`:''}
    ${s.edit?`<p class="ml-caption">${video?`장면 ${design.scenes.length}개 · 전체 ${(design.scenes.length*1.8).toFixed(1)}초`:'PNG 이미지 · 720 × 405'}</p>`:''}</section>
    ${history(s)}${!s.edit?btn('new',icon('plus')+' 새 작품 시작','class="ml-secondary"'):''}</div></div>
    <p class="ml-message" role="status" aria-live="polite"></p></div>`;
  paintPreview(s);
  if(s.edit) {
    const d=s.p.draft.design;
    mountPatternEditor(s.el.querySelector('.ml-pattern'),d.pattern,value=>{
      d.pattern=value;saveProject(s.p);paintPreview(s);
    });
  }
}
function persist(s) {
  const d=s.p.draft;
  if(d?.title?.trim())s.p.title=d.title.trim();
  saveProject(s.p);
}
function designSignature(design, kind) {
  const normalized=cleanDesign(design,kind);
  if(!normalized.pattern?.enabled)delete normalized.pattern;
  if(kind==='image')normalized.scenes.forEach(scene=>delete scene.motion);
  return JSON.stringify(normalized);
}
function saveReview(s,v) {
  v.observation=tidy(v.observation);
  v.feedback=tidy(v.feedback);
  saveProject(s.p);
}
function createVersion(s) {
  const d=s.p.draft;
  const parent=s.p.versions.find(v=>v.number===d.parentVersion);
  if(parent && compareText(parent.plan)===compareText(d.plan) && compareText(parent.prediction)===compareText(d.prediction) && designSignature(parent.design,s.p.kind)===designSignature(d.design,s.p.kind)){
    const message='다음 버전에는 제작 계획, 예상, 장면 구성 중 한 가지를 바꿔 보세요.';
    tick(s,message);
    const subject=s.el.querySelector('[data-design="subject"]');
    if(subject){subject.setCustomValidity(message);subject.reportValidity();subject.setCustomValidity('');}
    return;
  }
  const title=d.title.trim() || `${LABEL.place[d.design.scenes[0].place]}의 ${LABEL.subject[d.design.subject]}`;
  const v={id:uid(),number:s.p.versions.length+1,createdAt:when(),title,plan:d.plan.trim(),prediction:d.prediction.trim(),revisionReason:d.revisionReason.trim(),parentVersion:d.parentVersion||null,design:cleanDesign(d.design,s.p.kind),observation:'',feedback:'',teacherFeedback:''};
  s.p.title=title;s.p.versions.push(v);s.p.draft=null;s.edit=false;s.versionId=v.id;s.index=0;
  saveProject(s.p);render(s);tick(s,`v${v.number}를 저장했어요. 작품에서 발견한 점을 기록해 보세요.`);signalChange();
  s.el.querySelector('.ml-preview h2')?.scrollIntoView({block:'nearest'});
}
function verify(form) {
  for(const input of form.querySelectorAll('[required]')) {
    input.setCustomValidity(input.value.trim()?'':'생각한 내용을 적어 주세요.');
  }
  return form.reportValidity();
}
function handleSubmit(s,e) {
  const form=e.target;
  if(!form.matches('.ml-edit,.ml-review'))return;
  e.preventDefault();
  if(!verify(form))return;
  if(form.matches('.ml-edit'))createVersion(s);
  else{saveReview(s,versionOf(s));tick(s,'관찰한 점과 피드백을 저장했어요.');signalChange();}
}
function handleInput(s,e) {
  const target=e.target,key=target.dataset.text;
  if(!key)return;
  const data=s.edit?s.p.draft:versionOf(s);
  if(!data || !['title','plan','prediction','revisionReason','observation','feedback'].includes(key))return;
  target.setCustomValidity('');data[key]=target.value;persist(s);
}
function handleSelect(s,e) {
  if(!s.edit)return;
  const target=e.target,d=s.p.draft.design,key=target.dataset.design;
  if(key&&Object.hasOwn(LABEL,key) && Object.hasOwn(LABEL[key],target.value)) {
    if(key==='subject'||key==='palette')d[key]=target.value;
    else d.scenes[s.index][key]=target.value;
  } else if(target.hasAttribute('data-source')) {
    if(target.value==='saved')return;
    d.source=target.value!==''&&s.sources[Number(target.value)]?clone(s.sources[Number(target.value)]):null;
    persist(s);render(s);return;
  } else return;
  persist(s);paintPreview(s);
  const c=s.el.querySelector('.ml-canvas');
  if(c)c.setAttribute('aria-label',LABEL.place[d.scenes[s.index].place]+'에 있는 '+LABEL.subject[d.subject]);
}
async function exportVersion(s,button) {
  if(s.exporting)return;
  const v=versionOf(s), design=cleanDesign(v.design,s.p.kind);
  const title=(v.title||s.p.title||'나의 작품').replace(/[<>:"/\\|?*\u0000-\u001f]/g,' ').trim();
  s.exporting=true;button.disabled=true;let result;
  try {
    if(s.p.kind==='image'){
      const c=document.createElement('canvas');c.width=720;c.height=405;drawArt(c,design);
      result={blob:await canvasBlob(c,'image/png'),ext:'png'};
    }else{
      let last=-1;
      result=await makeVideo(design,progress=>{
        const pct=Math.floor(progress*10)*10;
        if(pct!==last){tick(s,`영상 파일을 만드는 중이에요. ${pct}%`);last=pct;}
      });
    }
    download(result.blob,`${title}-v${v.number}.${result.ext}`);
    tick(s,`${result.ext.toUpperCase()} 파일을 만들었어요.${result.ext==='avi'?' 내려받은 영상은 AVI를 지원하는 동영상 재생기에서 볼 수 있어요.':''}`);
  }catch { tick(s,'파일을 만들지 못했어요. 잠시 후 다시 시도해 보세요.'); }
  finally {s.exporting=false;button.disabled=false;}
}
function handleClick(s,e) {
  const button=e.target.closest('[data-action]');if(!button?.closest('.ml')||!s.el.contains(button))return;
  const a=button.dataset.action, p=s.p,v=versionOf(s);
  if(a==='home'){stopPlayback(s);window.dispatchEvent(new Event('labhome'));return;}
  if(a==='play'){play(s);return;}
  if(a==='download'){exportVersion(s,button);return;}
  if(a==='version'){s.versionId=button.dataset.id;s.edit=false;s.index=0;render(s);return;}
  if(a==='resume'&&p.draft){s.edit=true;s.index=0;render(s);return;}
  if(a==='new'){window.dispatchEvent(new CustomEvent('labopen',{detail:{type:'newmedia',kind:p.kind}}));return;}
  if(a==='revise'){
    if(p.draft){s.edit=true;s.index=0;render(s);tick(s,'작성 중이던 다음 버전을 열었어요.');return;}
    const form=s.el.querySelector('.ml-review');if(!form||!verify(form))return;
    saveReview(s,v);
    p.draft={title:v.title||p.title,plan:v.plan,prediction:v.prediction,revisionReason:'',parentVersion:v.number,design:clone(v.design)};
    s.edit=true;s.index=0;persist(s);render(s);signalChange();
    s.el.querySelector('[data-text="revisionReason"]')?.focus();return;
  }
  if(!s.edit)return;
  const scenes=p.draft.design.scenes;
  if(a==='scene')s.index=Number(button.dataset.index);
  else if(a==='add'&&scenes.length<4){scenes.push({...scene(),place:['garden','space','sea'][scenes.length%3]});s.index=scenes.length-1;}
  else if(a==='remove'&&scenes.length>1){scenes.splice(s.index,1);s.index=Math.min(s.index,scenes.length-1);}
  else if(a==='moveleft'||a==='moveright'){
    const next=s.index+(a==='moveleft'?-1:1);if(next<0||next>=scenes.length)return;
    [scenes[s.index],scenes[next]]=[scenes[next],scenes[s.index]];s.index=next;
  }else return;
  if(a!=='scene')persist(s);render(s);
  s.el.querySelector(`[data-action="scene"][data-index="${s.index}"]`)?.focus();
}
async function loadCode(s) {
  try {
    const {getProjects,getMission}=await import('./studio.mjs');
    if(active!==s)return;
    for(const project of getProjects()){
      const mission=getMission(project.missionId);
      if(!mission)continue;
      for(const attempt of project.attempts||[]){
        const traced=(attempt.trace||[]).map(step=>[step.x,step.y]);
        const points=(attempt.trace?.[0]?.step===0?traced:[mission.start,...traced]).filter(pt=>Array.isArray(pt)&&pt.length===2&&pt.every(n=>Number.isFinite(n)&&n>=0&&n<=4));
        if(!points.length)continue;
        s.sources.push({missionId:project.missionId,title:project.title,version:attempt.version,points});
      }
    }
    if(s.sources.length && s.edit) {
      const field=s.el.querySelector('.ml-source');if(field)field.innerHTML=sourceSection(s);
    }
  }catch{ /* Local scene design works without linked coding experiments. */ }
}
export function mountMedia(element,initialKind='image',context={}) {
  if(active){stopPlayback(active);active.events.abort();}
  const projects=getMediaProjects(), kind=initialKind==='video'?'video':'image';
  const matched=context.projectId?projects.find(p=>p.id===context.projectId):null;
  const existing=matched||(!context.createNew&&projects.filter(p=>p.kind===kind&&(!context.missionId||p.missionId===context.missionId)).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))[0]);
  const p=existing||{id:context.createNew&&context.projectId?String(context.projectId):uid(),kind,missionId:context.missionId||null,title:context.title||`나의 ${mediaLabel(kind)}`,createdAt:when(),updatedAt:when(),versions:[],draft:makeDraft(kind)};
  if(!p.draft&&!p.versions.length)p.draft=makeDraft(p.kind);
  if(p.draft){p.draft={...makeDraft(p.kind),...p.draft,design:cleanDesign(p.draft.design,p.kind)};if(!existing&&context.title)p.draft.title=context.title;}
  p.versions.forEach(v=>{v.design=cleanDesign(v.design,p.kind);});
  const requested=p.versions.find(v=>v.id===context.versionId);
  const s={el:element,p,edit:!!p.draft&&!requested,versionId:requested?.id||p.versions.at(-1)?.id,index:0,sources:[],playing:0,exporting:false,events:new AbortController()};
  active=s;
  const options={signal:s.events.signal};
  element.addEventListener('click',e=>handleClick(s,e),options);
  element.addEventListener('change',e=>handleSelect(s,e),options);
  element.addEventListener('input',e=>handleInput(s,e),options);
  element.addEventListener('submit',e=>handleSubmit(s,e),options);
  render(s);loadCode(s);
  return ()=>{stopPlayback(s);s.events.abort();if(active===s)active=null;};
}

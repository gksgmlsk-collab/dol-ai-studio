import {storage as localStorage,dbName} from './workspace-data.mjs';
import { COMMAND_LABELS, getProjects, saveTeacherFeedback } from './studio.mjs'
import { getMediaProjects, renderMediaFrame, saveMediaTeacherFeedback } from './media.mjs'
import { getDialogues, saveDialogueFeedback } from './dialogue.mjs'
import { getMakerProjects, getMakerAsset, saveMakerFeedback } from './maker.mjs'

const STORAGE_KEY = 'thinking-lab.journal.v1'
const FORMAT = 'thinking-lab-portfolio'
const FILE_LIMIT = 2 * 1024 * 1024
const kindNames = { code: '코딩', image: '이미지', video: '영상', dialogue:'생각 대화', 'maker-image':'이미지 공방', 'maker-video':'영상 작업실' }
const modeNames = {sketch:'직접 그린 이미지',imageAI:'AI 생성 이미지',animatic:'카메라 애니매틱',videoAI:'AI 생성 영상'}
const isMaker = p => p.kind==='maker-image' || p.kind==='maker-video'
const levels = ['살펴보는 중', '도움받아 설명', '스스로 설명']
const criteria = [
  ['질문과 생각의 근거', '질문을 듣고 자기 생각과 그 근거를 자기 말로 설명했나요?'],
  ['예상과 관찰', '예상한 모습과 실제 결과를 구체적으로 비교했나요?'],
  ['피드백과 수정', '받은 의견을 살펴보고 무엇을 왜 바꿨는지 설명했나요?']
]
const legacyCriteria=[['순서 설계','목표에 맞게 명령이나 장면의 순서를 정하고 설명했나요?'],...criteria.slice(1)]
const sceneTerms = {
  robot: '로봇', rabbit: '토끼', cat: '고양이', blue: '파랑', coral: '산호색', mint: '민트색', violet: '보라',
  garden: '정원', space: '우주', sea: '바다', left: '왼쪽', center: '가운데', right: '오른쪽',
  stay: '제자리', jump: '뛰기', star: '별', flower: '꽃', heart: '하트', crystal: '수정'
}
const blankState = () => ({
  owner: globalThis.crypto?.randomUUID?.() || 'lab-' + Date.now().toString(36) + Math.random().toString(36).slice(2),
  name: '', imports: [], reviews: []
})
let fallback = null
const text = (value, max = 4000) => typeof value === 'string' ? value.slice(0, max) : ''
const list = value => Array.isArray(value) ? value : []
const esc = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
const term = value => sceneTerms[value] || ''
const asDate = value => {
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : ''
}
const dateLabel = value => asDate(value)
  ? new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : ''
const projectKey = p => JSON.stringify([p.kind, p.id])
const keyOf = (owner, project, version) => JSON.stringify([owner, project.kind, project.id, version.id])
const availableVersion = (projects, kind, projectId, versionId) =>
  projects.find(p => p.kind === kind && p.id === projectId)?.versions.find(v => v.id === versionId)

function readState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (saved?.owner && Array.isArray(saved.imports) && Array.isArray(saved.reviews)) {
      fallback = saved
      return saved
    }
  } catch {}
  if (!fallback) {
    fallback = blankState()
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback)) } catch {}
  }
  return fallback
}

function writeState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    fallback = state
    return true
  } catch { return false }
}

function sceneSteps(design) {
  if (!design) return []
  const common = [term(design.subject), term(design.palette)].filter(Boolean).join(' · ')
  return [common, ...list(design.scenes).map((scene, index) =>
    (index + 1) + '장면 · ' + [term(scene.place), term(scene.position), term(scene.motion), term(scene.detail)].filter(Boolean).join(' / ')
  )].filter(Boolean)
}

function snapshotDesign(d) {
  if (!d || !Array.isArray(d.scenes) || !d.scenes.length) return null
  const source = d.source
  const pattern = d.pattern
  return {
    subject: text(d.subject,20), palette: text(d.palette,20),
    scenes: d.scenes.slice(0,4).map(s => Object.fromEntries(['place','position','motion','detail'].map(k=>[k,text(s?.[k],20)]))),
    source: source && Array.isArray(source.points) ? {title:text(source.title,160), missionId:text(source.missionId,160),
      version:Number.isInteger(source.version) ? source.version : 1,
      points:source.points.slice(0,150).filter(p=>Array.isArray(p) && p.length===2 && p.every(n=>Number.isInteger(n) && n>=0 && n<=4))
    } : null,
    pattern: pattern && Array.isArray(pattern.cells) && pattern.cells.length===36 ? {
      enabled:pattern.enabled===true, cells:pattern.cells.map(n=>Number.isInteger(n) && n>=0 && n<=3 ? n : 0),
      palette:list(pattern.palette).slice(0,4).map(v=>text(v,9)),seed:Number.isSafeInteger(pattern.seed) ? pattern.seed>>>0 : 317
    } : null
  }
}

function localProjects(state=readState()) {
  const conversations=getDialogues()
  const oldMedia=getMediaProjects()
  const dialogue=conversations.filter(p=>p.messages.some(m=>m.role==='user')).map(p=>{
    const versions=p.versions.map(v=>({
      id:v.id, number:v.number, parent:v.parentVersion, createdAt:v.createdAt,
      steps:[], trace:[], plan:v.plan, prompt:v.prompt, prediction:v.prediction, observation:v.observation, feedback:v.feedback,
      reason:v.reason, teacherFeedback:v.teacherFeedback, messages:transcript(v.messages)
    }))
    const last=p.versions.at(-1)
    const hasLiveReview=state.reviews.some(r=>r.owner===state.owner && r.kind==='dialogue' && r.projectId===p.id && r.versionId==='live')
    if(!last || last.messages?.at(-1)?.id!==p.messages.at(-1)?.id || p.teacherFeedback || hasLiveReview){
      versions.push({id:'live',number:(last?.number||0)+1,parent:last?.number||null,createdAt:p.messages.at(-1).createdAt,
        steps:[], trace:[], prompt:'',plan:'',prediction:'',observation:'',feedback:'',reason:'',teacherFeedback:p.teacherFeedback,messages:transcript(p.messages)})
    }
    return {id:p.id,title:p.title,kind:'dialogue',updatedAt:p.updatedAt,versions}
  })
  const maker=getMakerProjects().map(p=>({
    id:p.id,title:p.title,kind:'maker-'+p.kind,updatedAt:p.updatedAt,
    versions:p.versions.map(v=>{
      const thread=conversations.find(t=>t.id===(v.dialogueId||p.dialogueId))
      const card=thread?.versions.find(c=>c.id===(v.dialogueVersionId||p.dialogueVersionId))
      const source=sourceRef(v.source)
      if(source && !source.assetId)source.design=snapshotDesign(oldMedia.find(p=>p.id===source.projectId)?.versions.find(v=>v.id===source.versionId)?.design)
      return {id:v.id,number:v.number,parent:v.parentVersion,createdAt:v.createdAt,title:v.title,steps:[],trace:[],plan:v.plan,prompt:v.prompt,
        prediction:v.prediction,observation:v.observation,feedback:v.feedback,reason:v.revisionReason,teacherFeedback:v.teacherFeedback,
        mode:v.mode,assetId:v.assetId,source,dialogueSource:thread?{id:thread.id,title:thread.title,versionId:card?.id,number:card?.number,prompt:card?.prompt}:null}
    })
  }))
  const code = getProjects().map(p => ({
    id: p.id, kind: 'code', title: p.title, missionId: p.missionId, updatedAt: p.updatedAt,
    versions: list(p.attempts).map(v => ({
      id: v.id, number: v.version, parent: v.parentVersion, createdAt: v.createdAt,
      steps: list(v.commands).map(cmd => COMMAND_LABELS[cmd] || String(cmd)), plan: '', prediction: v.prediction,
      result: v.result?.summary, observation: v.reflection, feedback: v.feedback, reason: v.reason,
      teacherFeedback: v.teacherFeedback, trace: list(v.trace).map(t => text(t.message)).filter(Boolean)
    }))
  }))
  const media = oldMedia.map(p => ({
    id: p.id, kind: p.kind, title: p.title, missionId: p.missionId, updatedAt: p.updatedAt,
    versions: list(p.versions).map((v, i, versions) => ({
      id: v.id, number: v.number, parent: i > 0 ? versions[i-1].number : null, createdAt: v.createdAt,
      steps: sceneSteps(v.design), design: snapshotDesign(v.design), plan: v.plan, prediction: v.prediction, result: '',
      observation: v.observation, feedback: v.feedback, reason: v.revisionReason, teacherFeedback: v.teacherFeedback, trace: []
    }))
  }))
  return [...dialogue,...maker,...code, ...media].filter(p => p.versions.length).sort((a,b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0))
}

function transcript(messages) {
  return list(messages).filter(m=>m && ['user','assistant'].includes(m.role)).map(m=>({
    role:m.role, content:text(m.content,1800), mode:['opening','guide','model','student'].includes(m.mode)?m.mode:'',
    stage:text(m.stage,24),createdAt:asDate(m.createdAt)
  }))
}
function sourceRef(s) {
  if(!s || typeof s!=='object' || !s.versionId)return null
  return {projectId:text(s.projectId,160),versionId:text(s.versionId,160),number:Number.isInteger(s.number)?s.number:null,
    title:text(s.title,160),prompt:text(s.prompt),assetId:text(s.assetId,160),design:snapshotDesign(s.design)}
}
function safeThumbnail(s) {
  return typeof s==='string' && s.length<90000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(s)?s:''
}

function checked(condition) {
  if (!condition) throw new Error('이 작업실에서 내보낸 학습 기록 파일을 선택해 주세요.')
}

function parsePortfolio(raw) {
  const f = JSON.parse(raw)
  checked(f?.format === FORMAT && f.schema === 1 && typeof f.owner === 'string' && /^[\w-]{4,100}$/.test(f.owner))
  checked(Array.isArray(f.projects) && f.projects.length <= 200 && Array.isArray(f.reviews) && f.reviews.length <= 4000)
  const seenProjects = new Set()
  const projects = f.projects.map(p => {
    checked(p && Object.hasOwn(kindNames, p.kind) && typeof p.id === 'string' && p.id.length > 0 && p.id.length <= 160)
    checked(Array.isArray(p.versions) && p.versions.length > 0 && p.versions.length <= 1000 && !seenProjects.has(projectKey(p)))
    seenProjects.add(projectKey(p))
    const seen = new Set()
    const versions = p.versions.map(v => {
      checked(v && typeof v.id === 'string' && v.id.length > 0 && v.id.length <= 160 && !seen.has(v.id))
      checked(Number.isInteger(v.number) && v.number > 0 && Array.isArray(v.steps) && v.steps.length <= 300)
      seen.add(v.id)
      return {
        id: v.id, number: v.number, parent: Number.isInteger(v.parent) ? v.parent : null, createdAt: asDate(v.createdAt),
        steps: v.steps.map(s => text(s, 500)), design:p.kind==='code' ? null : snapshotDesign(v.design), plan: text(v.plan), prediction: text(v.prediction), result: text(v.result),
        observation: text(v.observation), feedback: text(v.feedback), reason: text(v.reason),
        teacherFeedback: text(v.teacherFeedback), trace: list(v.trace).slice(0, 300).map(s => text(s, 500)),
        ...(p.kind==='dialogue'?{prompt:text(v.prompt),messages:transcript(v.messages)}:{}),
        ...(isMaker(p)?{title:text(v.title,160),prompt:text(v.prompt),mode:Object.hasOwn(modeNames,v.mode)?v.mode:'',
          source:sourceRef(v.source), thumbnail:safeThumbnail(v.thumbnail),sourceThumbnail:safeThumbnail(v.sourceThumbnail),
          dialogueSource:v.dialogueSource?.id?{id:text(v.dialogueSource.id,160),title:text(v.dialogueSource.title,160),
            versionId:text(v.dialogueSource.versionId,160),number:Number.isInteger(v.dialogueSource.number)?v.dialogueSource.number:null,prompt:text(v.dialogueSource.prompt)}:null}:{})
      }
    }).sort((a,b) => a.number - b.number)
    return { kind: p.kind, id: p.id, title: text(p.title, 160) || '제목 없는 작업', missionId: text(p.missionId, 160), updatedAt: asDate(p.updatedAt), versions }
  })
  const reviews = f.reviews.map(r => {
    checked(r && Array.isArray(r.scores) && r.scores.length === 3 && r.scores.every(s => Number.isInteger(s) && s >= -1 && s <= 2))
    checked(availableVersion(projects, r.kind, r.projectId, r.versionId) && !!asDate(r.updatedAt))
    return { owner: f.owner, kind: r.kind, projectId: r.projectId, versionId: r.versionId, scores: r.scores, comment: text(r.comment), updatedAt: asDate(r.updatedAt) }
  })
  return {owner: f.owner, name: text(f.name, 32) || '가져온 기록', exportedAt: asDate(f.exportedAt), projects, reviews}
}

function setTeacherNote(project, version, comment) {
  if(project.kind==='dialogue')return saveDialogueFeedback(project.id,version.id,comment)
  if(isMaker(project))return saveMakerFeedback(project.id,version.id,comment)
  return project.kind === 'code' ? saveTeacherFeedback(project.missionId, version.id, comment) : saveMediaTeacherFeedback(project.id, version.id, comment)
}

function mergePortfolio(state, file, own) {
  const ours = state.owner === file.owner
  const reviews = new Map(state.reviews.map(r => [JSON.stringify([r.owner, r.kind, r.projectId, r.versionId]), r]))
  const notes = []
  for (const r of file.reviews) {
    const key = JSON.stringify([r.owner, r.kind, r.projectId, r.versionId])
    const savedProject=own.find(p=>p.kind===r.kind && p.id===r.projectId)
    const version = availableVersion(own, r.kind, r.projectId, r.versionId) || (savedProject?.kind==='dialogue' && r.versionId==='live'?{id:'live'}:null)
    if ((ours && !version) || (reviews.get(key)?.updatedAt || '') >= r.updatedAt) continue
    reviews.set(key, r)
    if (ours) notes.push([own.find(p => p.kind === r.kind && p.id === r.projectId), version, r.comment])
  }
  let imports = state.imports
  if (!ours) {
    const previous = imports.find(p => p.owner === file.owner)
    const records = new Map(list(previous?.projects).map(p => [projectKey(p), p]))
    for (const p of file.projects) {
      const prior = records.get(projectKey(p))
      const latest = !prior || (prior.updatedAt || '') <= (p.updatedAt || '')
      const versions = new Map(list(prior?.versions).map(v => [v.id, v]))
      p.versions.forEach(v => { if (latest || !versions.has(v.id)) versions.set(v.id, v) })
      records.set(projectKey(p), {...(latest ? p : prior), versions: [...versions.values()].sort((a,b) => a.number-b.number)})
    }
    imports = [...imports.filter(p => p.owner !== file.owner), {owner: file.owner, name: file.name, projects: [...records.values()]}]
  }
  const next = {...state, reviews: [...reviews.values()], imports}
  if (!writeState(next)) throw new Error('이 기기에 저장할 공간이 부족하거나 브라우저 저장이 꺼져 있어요.')
  notes.forEach(([project, version, comment]) => setTeacherNote(project, version, comment))
  return ours ? '돌려받은 교사 피드백을 확인할 수 있어요.' : '학습 기록을 가져왔어요.'
}

async function exportFile(state, collection) {
  const name = collection.name || '나의 작업실'
  const obj = {format: FORMAT, schema: 1, owner: collection.owner, name, exportedAt: new Date().toISOString(), projects: collection.projects,
    reviews: state.reviews.filter(r => r.owner === collection.owner && availableVersion(collection.projects, r.kind, r.projectId, r.versionId))}
  obj.projects=collection.projects.map(p=>({...p,versions:p.versions.map(v=>({...v}))}))
  const makeBlob=()=>new Blob([JSON.stringify(obj)], {type:'application/json'})
  const coreSize=makeBlob().size
  if (coreSize>FILE_LIMIT) throw new Error('이 기록은 파일로 주고받을 수 있는 크기(2MB)를 넘었어요.')
  if (state.owner===collection.owner) {
    const previews=new Map()
    async function thumb(assetId,kind){
      if(!assetId)return ''
      if(!previews.has(assetId))previews.set(assetId,await thumbnail(assetId,kind))
      return previews.get(assetId)
    }
    let budget=FILE_LIMIT-coreSize-1024
    for(const p of obj.projects.filter(isMaker))for(const v of [...p.versions].reverse()){
      if(budget<800)break
      const preview=await thumb(v.assetId,p.kind==='maker-video'?'video':'image')
      if(preview && preview.length+30<budget){v.thumbnail=preview;budget-=preview.length+30}
      if(v.source?.assetId){
        const input=await thumb(v.source.assetId,'image')
        if(input && input.length+30<budget){v.sourceThumbnail=input;budget-=input.length+30}
      }
    }
  }
  const blob=makeBlob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_') + '-학습기록.json'
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function thumbnail(assetId,kind) {
  let url='',el
  try {
    const blob=await getMakerAsset(assetId)
    if(!(blob instanceof Blob) || !blob.size)return ''
    url=URL.createObjectURL(blob)
    el=document.createElement(kind==='video'?'video':'img')
    if(kind==='video'){el.muted=true;el.preload='auto';el.playsInline=true}
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('preview timeout')),2500)
      const end=fn=>()=>{clearTimeout(timer);fn()}
      el.addEventListener(kind==='video'?'loadeddata':'load',end(resolve),{once:true})
      el.addEventListener('error',end(reject),{once:true});el.src=url
    })
    const w=el.videoWidth||el.naturalWidth,h=el.videoHeight||el.naturalHeight
    if(!w||!h)return ''
    const scale=Math.min(1,224/w,144/h),c=document.createElement('canvas')
    c.width=Math.max(1,Math.round(w*scale));c.height=Math.max(1,Math.round(h*scale))
    c.getContext('2d').drawImage(el,0,0,c.width,c.height)
    return safeThumbnail(c.toDataURL('image/jpeg',.62))
  } catch {return ''}
  finally {if(el?.tagName==='VIDEO'){el.removeAttribute('src');el.load()}if(url)URL.revokeObjectURL(url)}
}

const rubricGuide = () => `<div class="tj-guide"><h2>어떤 생각을 살펴볼까요?</h2><ul>${criteria.map(([name, desc]) =>
  `<li><strong>${name}</strong><span>${desc}</span></li>`).join('')}</ul></div>`

function emptyView(teacher) {
  return `<div class="tj-empty"><div class="tj-book" aria-hidden="true"><i></i><b></b></div>
    <h2>${teacher ? '학생의 첫 기록을 기다리고 있어요' : '첫 번째 생각을 기록해 볼까요?'}</h2>
    <p>${teacher ? '학생의 학습 기록 파일을 가져오면 질문과 대답, 작품을 만들고 고친 이유를 살펴볼 수 있어요.' : '생각 대화실에 첫 생각을 보내면 여기에서 나눈 대화를 다시 읽을 수 있어요.'}</p>
    <button class="tj-primary" data-do="${teacher ? 'pick' : 'start'}">${teacher ? '학습 기록 가져오기' : '생각 대화 시작하기'}</button></div>
    ${teacher ? rubricGuide() : ''}`
}

const field = (label, value, missing='아직 기록하지 않았어요.') =>
  `<div class="tj-field"><h4>${label}</h4><p class="${value ? '' : 'tj-muted'}">${esc(value || missing)}</p></div>`
const versionLabel = n => '버전 ' + n
const versionCaption=(project,version)=>project.kind==='dialogue'?(version.id==='live'?'현재 대화':'생각 카드 '+version.number):versionLabel(version.number)
const stepsMarkup = (steps, base) => list(steps).length ? `<ol class="tj-steps">${steps.map((s,i) =>
  `<li${base && base[i] !== s ? ' class="tj-step-change"' : ''}><span>${i+1}</span>${esc(s)}</li>`).join('')}</ol>` : '<p class="tj-muted">기록된 단계가 없어요.</p>'

function mediaPreview(project,v) {
  if (!v.design) return ''
  return `<div class="tj-frame-view" data-frame-version="${esc(v.id)}">
    <canvas class="tj-frame" width="720" height="405" role="img" aria-label="${versionLabel(v.number)} 작품, ${esc(v.steps.join(', '))}"></canvas>
    ${project.kind==='video' ? `<label>영상 살펴보기<input data-frame-time type="range" min="0" max="${v.design.scenes.length*100}" value="0"><output>1장면</output></label>` : ''}</div>`
}

function dialogueEvidence(project,v,parent) {
  const roleName=m=>m.role==='user'?'학생':m.mode==='model'?'로컬 AI의 질문':m.mode==='opening'?'시작 질문':m.mode==='guide'?'질문 카드':'질문'
  const thread=list(v.messages)
  const brief=v=>field('학생이 정한 생각이나 장면',v.prompt)+field('학생의 예상',v.prediction)+(v.observation?field('실제로 확인한 점',v.observation):'')
  let cards=''
  if(v.id!=='live') {
    cards='<section class="tj-card tj-evidence"><h3>'+(parent?'생각 카드의 변화':'학생이 정한 생각')+'</h3><div class="tj-compare '+(parent?'tj-pair':'')+'">'+
      (parent?'<div><h4>'+versionCaption(project,parent)+'</h4>'+brief(parent)+'</div>':'')+'<div><h4>'+versionCaption(project,v)+'</h4>'+brief(v)+'</div></div>'+
      (v.reason?field('바꾼 이유',v.reason):'')+(parent?.feedback?field('이전 카드의 의견',parent.feedback):'')+
      (parent?.teacherFeedback?field('이전 카드에 남긴 선생님의 질문',parent.teacherFeedback):'')+(v.feedback?field('다음 시도에 참고할 의견',v.feedback):'')+'</section>'
  }
  return cards+'<section class="tj-card tj-evidence"><h3>'+(v.id==='live'?'나누고 있는 대화':'카드를 쓰기까지 나눈 대화')+'</h3>'+
    '<ol class="tj-transcript" aria-label="질문과 학생의 말">'+thread.map(m=>'<li class="'+(m.role==='user'?'tj-student':'tj-question')+'"><strong>'+roleName(m)+'</strong><p>'+esc(m.content)+'</p></li>').join('')+'</ol></section>'
}
function assetFigure(kind,id,preview,caption,own,legacy=false) {
  const alt=esc(caption)
  if(own && id)return '<figure class="tj-asset" data-asset="'+esc(id)+'" data-kind="'+kind+'"><figcaption>'+alt+'</figcaption><span class="tj-muted">작품 불러오는 중…</span></figure>'
  if(preview)return '<figure class="tj-asset"><figcaption>'+alt+' · 대표 이미지</figcaption><img src="'+esc(preview)+'" alt="'+alt+'"></figure>'
  if(legacy)return '<figure class="tj-asset"><figcaption>'+alt+'</figcaption><canvas class="tj-frame" width="720" height="405" data-legacy-ref aria-label="'+alt+'"></canvas></figure>'
  return '<p class="tj-muted">'+alt+'의 미리보기는 이 파일에 들어 있지 않아요.</p>'
}
function makerEvidence(project,v,parent,own) {
  const video=project.kind==='maker-video',kind=video?'video':'image'
  const renderOne=x=>'<div data-maker-version="'+esc(x.id)+'"><h4>'+versionCaption(project,x)+(x.mode?' · '+esc(modeNames[x.mode]||''):'')+'</h4>'+
    (x.source?'<div class="tj-provenance">'+field('첫 프레임으로 쓴 이미지',x.source.title+(x.source.number?' · 버전 '+x.source.number:''))+
      (x.source.prompt?field('원본 이미지의 프롬프트',x.source.prompt):'')+
      assetFigure('image',x.source.assetId,x.sourceThumbnail,'입력 이미지',own,!!x.source.design)+'</div>':'')+
    field(video?'움직임·카메라 프롬프트':'이미지 프롬프트',x.prompt)+(x.plan && x.plan!==x.prompt?field('제작 계획',x.plan):'')+
    field('학생의 예상',x.prediction)+assetFigure(kind,x.assetId,x.thumbnail,video?'완성한 영상':'완성한 이미지',own)+
    field('실제로 확인한 점',x.observation)+'</div>'
  const source=v.dialogueSource
  return '<section class="tj-card tj-evidence"><h3>'+(parent?'두 작품 비교하기':'프롬프트와 작품')+'</h3>'+
    (source?'<p class="tj-origin">생각 대화에서 시작 · '+esc(source.title)+(source.number?' · 생각 카드 '+source.number:'')+'</p>'+(source.prompt?field('대화에서 학생이 정한 생각',source.prompt):''):'')+
    '<div class="tj-compare '+(parent?'tj-pair':'')+'">'+(parent?renderOne(parent):'')+renderOne(v)+'</div>'+
    (v.reason?field('프롬프트나 연출을 바꾼 이유',v.reason):'')+(parent?.feedback?field('이전 작품에서 얻은 의견',parent.feedback):'')+
    (parent?.teacherFeedback?field('이전 작품에 남긴 선생님의 질문',parent.teacherFeedback):'')+field('다음 시도에 참고할 의견',v.feedback)+'</section>'
}
function evidenceView(project, version, parent, own) {
  if(project.kind==='dialogue')return dialogueEvidence(project,version,parent)
  if(isMaker(project))return makerEvidence(project,version,parent,own)
  const code = project.kind === 'code'
  return `<section class="tj-card tj-evidence"><h3>${parent ? '두 버전 비교하기' : '내가 계획한 순서'}</h3>
    <div class="tj-compare ${parent ? 'tj-pair' : ''}">
      ${parent ? `<div><h4>${versionLabel(parent.number)} · 수정 전</h4>${stepsMarkup(parent.steps)}${mediaPreview(project,parent)}${parent.result ? field('실행 결과',parent.result) : ''}${field('내가 살펴본 점',parent.observation)}</div>` : ''}
      <div><h4>${versionLabel(version.number)} · ${code ? '명령 순서' : '장면 설계'}</h4>${stepsMarkup(version.steps,parent?.steps)}
      ${mediaPreview(project,version)}
      ${parent && version.result ? field('실행 결과',version.result) : ''}${parent ? field('내가 살펴본 점',version.observation) : ''}</div>
    </div>
    ${parent ? field('이렇게 바꾼 이유', version.reason) + (parent.feedback ? field('지난 버전에서 받은 의견',parent.feedback) : '') + (parent.teacherFeedback ? field('지난 버전의 선생님 의견',parent.teacherFeedback) : '') : ''}
    </section>
    <section class="tj-card tj-evidence"><h3>예상과 관찰</h3>
      ${version.plan ? field('만들기 전 계획',version.plan) : ''}${field('시작할 때 예상한 결과',version.prediction)}
      ${code && !parent ? field('실제로 실행한 결과',version.result) : ''}${!parent ? field('결과를 보고 발견한 점',version.observation) : ''}
      ${field('다음 작업에 참고할 의견',version.feedback)}
      ${version.trace.length ? `<details class="tj-trace"><summary>단계별 실행 기록 (${version.trace.length})</summary><ol>${version.trace.map(t=>`<li>${esc(t)}</li>`).join('')}</ol></details>` : ''}
    </section>`
}

function reviewView(teacher, review, version, project) {
  const selectedCriteria=project.kind==='dialogue'||isMaker(project)?criteria:legacyCriteria
  const scores = review?.scores || [-1,-1,-1]
  const comment = review ? review.comment : version.teacherFeedback
  if (!teacher) {
    if (!review && !comment) return ''
    return `<section class="tj-card tj-evidence"><h3>선생님의 피드백</h3>
      <div class="tj-scores">${scores.map((n,i) => n < 0 ? '' : `<span>${selectedCriteria[i][0]} · ${levels[n]}</span>`).join('')}</div>
      ${comment ? `<p class="tj-note">${esc(comment)}</p>` : ''}</section>`
  }
  return `<form class="tj-card tj-review" data-review><h3>이 버전의 교사 피드백</h3>
    <p>기록에서 확인한 내용을 골라 주세요. 아직 관찰하기 어려운 항목은 비워 둘 수 있어요.</p>
    ${selectedCriteria.map(([title, desc], i) => `<fieldset><legend>${title}</legend><p>${desc}</p><div class="tj-options">
      ${['판단 보류',...levels].map((label,k) => `<label><input type="radio" name="level${i}" value="${k-1}" ${scores[i]===k-1?'checked':''}><span>${label}</span></label>`).join('')}</div></fieldset>`).join('')}
    <label class="tj-comment">학생에게 건네는 질문<textarea name="comment" maxlength="4000" rows="3" placeholder="어느 단계에서 예상과 달랐나요? 다음 버전에서는 무엇을 바꾸고 싶나요?">${esc(comment || '')}</textarea></label>
    <div class="tj-form-end"><small>${review?.updatedAt ? '마지막 저장 ' + esc(dateLabel(review.updatedAt)) : '현재 선택한 버전에 저장해요.'}</small>
    <button class="tj-primary" type="submit">피드백 저장</button></div></form>`
}

export function mountJournal(element, mode='journal') {
  const teacher = mode === 'teacher'
  let selectedOwner = readState().owner
  let selectedProject = '', selectedVersion = '', shareOpen = false
  let current = null
  const notesInProgress = new Map()
  const urls = new Set()
  let renderId=0,active=true
  function releaseAssets(){for(const url of urls)URL.revokeObjectURL(url);urls.clear()}
  async function loadAsset(figure,token){
    let blob
    try {blob=await getMakerAsset(figure.dataset.asset)} catch {}
    if(!active || token!==renderId || !wrapper.contains(figure))return
    const waiting=figure.querySelector('span')
    if(!blob?.size){waiting.textContent='이 브라우저에서 작품 파일을 찾을 수 없어요.';return}
    const kind=figure.dataset.kind,tag=document.createElement(kind==='video'?'video':'img')
    const url=URL.createObjectURL(blob);urls.add(url)
    if(kind==='video'){tag.controls=true;tag.playsInline=true;tag.preload='metadata'}
    else tag.alt=figure.querySelector('figcaption').textContent
    tag.addEventListener('error',()=>{
      if(!active||token!==renderId)return
      const a=document.createElement('a');a.href=url;a.download='작품.'+({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','video/mp4':'mp4','video/x-msvideo':'avi','video/avi':'avi','video/webm':'webm'}[blob.type.split(';')[0]]||'bin')
      a.textContent='작품 파일 내려받기';tag.replaceWith(a)
    },{once:true})
    tag.src=url;waiting.replaceWith(tag)
  }
  const wrapper = document.createElement('section')
  wrapper.className = 'tj'
  element.replaceChildren(wrapper)
  const say = msg => {
    const status = wrapper.querySelector('[data-status]')
    if (status) status.textContent = msg
  }
  function drawFrame(view) {
    const v = current.project?.versions.find(v=>v.id===view.dataset.frameVersion)
    if (!v?.design) return
    const slider = view.querySelector('[data-frame-time]')
    const tick = slider ? Number(slider.value) : 100
    const frame = slider ? Math.min(v.design.scenes.length-1,Math.floor(tick/100)) : 0
    renderMediaFrame(view.querySelector('canvas'),v.design,frame,Math.min(1,(tick-frame*100)/100))
    if (slider) view.querySelector('output').value = (frame+1)+'장면'
  }
  function render(message='') {
    renderId++;releaseAssets()
    const state = readState()
    const own = {owner: state.owner, name: state.name || '나의 작업실', projects: localProjects(state)}
    const all = [own,...state.imports]
    const collection = all.find(c=>c.owner === selectedOwner) || own
    selectedOwner = collection.owner
    const project = collection.projects.find(p=>projectKey(p) === selectedProject) || collection.projects[0]
    const version = project?.versions.find(v=>v.id === selectedVersion) || project?.versions.at(-1)
    selectedProject = project ? projectKey(project) : ''
    selectedVersion = version?.id || ''
    const reviewFor = v => state.reviews.find(r=>r.owner===collection.owner && r.kind===project?.kind && r.projectId===project?.id && r.versionId===v?.id)
    const parentRaw = version?.parent ? project.versions.find(v=>v.number===version.parent) : null
    const parent = parentRaw ? {...parentRaw,teacherFeedback:reviewFor(parentRaw)?.comment ?? parentRaw.teacherFeedback} : null
    current = {state, collection, own, project, version}
    const ownData = collection.owner === own.owner
    const visibleReview = version && (notesInProgress.get(keyOf(collection.owner,project,version)) || reviewFor(version))
    wrapper.innerHTML = `<header class="tj-header"><div><h1>${teacher?'선생님 보기':'생각 기록장'}</h1>
      <p>${teacher ? '학생이 남긴 예상과 관찰을 읽고, 다음 시도를 이끌 질문을 남겨 주세요.' : '내가 어떤 생각으로 만들고 바꿨는지, 버전별로 돌아봐요.'}</p></div>
      <button class="tj-secondary" data-do="share" aria-expanded="${shareOpen}">기록 주고받기</button></header>
      <div role="status" aria-live="polite" class="tj-status" data-status>${esc(message)}</div>
      <input type="file" accept=".json,application/json" hidden data-import>
      ${shareOpen ? `<section class="tj-card tj-share"><h2>학습 기록 파일</h2>
        <p>파일에는 학생의 대화, 버전별 프롬프트, 첫 프레임 정보와 피드백이 담겨요. 이미지·영상의 축소 미리보기는 가능한 경우에 함께 담고, 원본 파일은 이 브라우저에 보관해요.</p>
        ${ownData ? `<label>기록에 쓸 별명<input maxlength="32" data-alias value="${esc(state.name)}" placeholder="예: 별사탕 모둠"></label>` : ''}
        <div class="tj-actions"><button class="tj-secondary" data-do="pick">파일 가져오기</button>
          <button class="tj-primary" data-do="export" ${collection.projects.length ? '' : 'disabled'}>${ownData ? '내 기록 내보내기' : '피드백과 기록 내보내기'}</button></div></section>` : ''}
      ${all.length > 1 ? `<label class="tj-owner">기록 선택<select data-owner>${all.map(c=>`<option value="${esc(c.owner)}" ${c.owner===selectedOwner?'selected':''}>${esc(c.name)}${c.owner===own.owner?' · 이 기기':all.some(x=>x!==c && x.name===c.name)?' · '+esc(c.owner.slice(-4)):''}</option>`).join('')}</select></label>` : ''}
      ${project && version ? `<div class="tj-layout"><aside class="tj-library tj-card"><h2>작업 목록 <span>${collection.projects.length}</span></h2>
        <div class="tj-projects">${collection.projects.map((p,i)=>`<button data-project="${i}" aria-pressed="${projectKey(p)===selectedProject}">
        <span class="tj-kind tj-${esc(p.kind)}">${kindNames[p.kind]}</span><strong>${esc(p.title)}</strong><small>${p.kind==='dialogue'?(p.versions.filter(v=>v.id!=='live').length?'생각 카드 '+p.versions.filter(v=>v.id!=='live').length+'개':'대화 중'):'버전 '+p.versions.length+'개'}</small></button>`).join('')}</div></aside>
        <article class="tj-work"><div class="tj-work-head"><div><span class="tj-kind tj-${esc(project.kind)}">${kindNames[project.kind]}</span><h2>${esc(project.title)}</h2></div>
        ${ownData ? '<button class="tj-secondary" data-do="open">작업 열기</button>' : ''}</div>
        <div class="tj-version"><label>살펴볼 기록<select data-version>${[...project.versions].reverse().map(v=>`<option value="${esc(v.id)}" ${v.id===selectedVersion?'selected':''}>${versionCaption(project,v)}</option>`).join('')}</select></label>
        <time datetime="${esc(version.createdAt)}">${esc(dateLabel(version.createdAt))}</time></div>
        ${evidenceView(project,version,parent,ownData)}${reviewView(teacher,visibleReview,version,project)}</article></div>` : emptyView(teacher)}`
    wrapper.querySelectorAll('[data-frame-version]').forEach(drawFrame)
    wrapper.querySelectorAll('[data-asset]').forEach(el=>loadAsset(el,renderId))
    wrapper.querySelectorAll('[data-legacy-ref]').forEach(c=>{
      const model=project?.versions.find(v=>v.id===c.closest('[data-maker-version]')?.dataset.makerVersion)?.source?.design
      if(model)renderMediaFrame(c,model,0,1)
    })
  }
  const launch = detail => window.dispatchEvent(new CustomEvent('labopen',{detail}))
  wrapper.addEventListener('click', async event => {
    const button = event.target.closest('button')
    if (!button || !current) return
    if (button.hasAttribute('data-project')) {
      const next = current.collection.projects[Number(button.dataset.project)]
      if (next) { selectedProject = projectKey(next); selectedVersion=''; render() }
      return
    }
    const {project, version, collection} = current
    switch (button.dataset.do) {
      case 'share':
        shareOpen=!shareOpen; render(); wrapper.querySelector('[data-do="share"]')?.focus(); break
      case 'pick': wrapper.querySelector('[data-import]').click(); break
      case 'start': launch({type:'newDialogue'}); break
      case 'open':
        if (project.kind==='dialogue')launch({type:'dialogue',id:project.id,versionId:version.id})
        else if (isMaker(project))launch({type:'maker',kind:project.kind==='maker-video'?'video':'image',projectId:project.id,versionId:version.id})
        else if (project.kind==='code') launch({type:'studio',id:project.missionId || project.id})
        else launch({type:'media',id:project.id,projectId:project.id,versionId:version.id,missionId:project.missionId,kind:project.kind})
        break
      case 'export': {
        const fresh = readState()
        let name = collection.name
        const alias = wrapper.querySelector('[data-alias]')
        if (alias) {
          name = alias.value.trim() || '나의 작업실'
          writeState({...fresh,name})
        }
        try {
          button.disabled=true;say('학습 기록 파일을 준비하고 있어요.')
          await exportFile(fresh,{...collection,name})
          say('학습 기록 파일을 만들었어요.')
        } catch (e) { say(e.message) } finally {button.disabled=false}
        break
      }
    }
  })
  wrapper.addEventListener('input', event => {
    if (event.target.matches('[data-frame-time]')) drawFrame(event.target.closest('[data-frame-version]'))
    const form = event.target.closest('[data-review]')
    if (form && current?.version) {
      const fields = new FormData(form)
      const {collection,project,version} = current
      notesInProgress.set(keyOf(collection.owner,project,version), {
        comment:String(fields.get('comment') || ''), scores:criteria.map((_,i)=>Number(fields.get('level'+i) ?? -1))
      })
    }
  })
  wrapper.addEventListener('change', async event => {
    if (event.target.matches('[data-owner]')) {
      selectedOwner = event.target.value; selectedProject=''; selectedVersion=''; render()
    } else if (event.target.matches('[data-version]')) {
      selectedVersion = event.target.value; render(); wrapper.querySelector('[data-version]')?.focus()
    } else if (event.target.matches('[data-import]')) {
      const file = event.target.files[0]
      if (!file) return
      try {
        if (file.size > FILE_LIMIT) throw new Error('2MB 이하의 학습 기록 파일을 골라 주세요.')
        let data
        try { data = parsePortfolio(await file.text()) } catch { throw new Error('이 작업실에서 내보낸 학습 기록 JSON 파일을 골라 주세요.') }
        const notice = mergePortfolio(readState(),data,localProjects())
        selectedOwner=data.owner; selectedProject=''; selectedVersion=''; render(notice)
      } catch(e) { say(e.message); event.target.value='' }
    }
  })
  wrapper.addEventListener('submit', event => {
    if (!event.target.matches('[data-review]')) return
    event.preventDefault()
    const {project,version,collection} = current
    const state = readState()
    const form = new FormData(event.target)
    const saved = {owner: collection.owner, kind:project.kind, projectId:project.id, versionId:version.id,
      comment: String(form.get('comment')||'').trim().slice(0,4000), scores: criteria.map((_,i)=>Number(form.get('level'+i) ?? -1)), updatedAt:new Date().toISOString()}
    const key = keyOf(collection.owner,project,version)
    const others = state.reviews.filter(r=>JSON.stringify([r.owner,r.kind,r.projectId,r.versionId])!==key)
    if (!writeState({...state,reviews:[...others,saved]})) {
      say('피드백을 저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.'); return
    }
    if (collection.owner===state.owner) setTeacherNote(project,version,saved.comment)
    notesInProgress.delete(key)
    render('이 버전의 피드백을 저장했어요.')
    window.dispatchEvent(new CustomEvent('labchange',{detail:{source:'journal',persisted:true}}))
  })
  render()
  return ()=>{active=false;renderId++;releaseAssets()}
}

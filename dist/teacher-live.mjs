import {getSchoolContext, mountSchool} from './school.mjs';
import {escapeHtml as esc} from './home.mjs';

const interval = 5000;
const toolNames = {
  cover:'연구소 입구', home:'연구소 홈', student:'학생 작업실', projects:'내 프로젝트', project:'프로젝트 작업실',
  start:'프로젝트 시작', studio:'창작 공방', workshop:'영상·이미지 공방', make:'창작 공방',
  dialogue:'생각 대화', image:'이미지 공방', video:'영상 공방', web:'웹사이트 공방', '3d':'3D 설계',
  robot:'발명·로봇', switch:'3D 발명품 프로젝트', city:'도시개발 프로젝트', storyboard:'감상·스토리보드',
  gallery:'친구 작품', materials:'재료실', journal:'생각 기록장', plan:'계획', test:'시험',
  feedback:'피드백', versions:'작품 버전', models:'로컬 모델 상태', sample:'예시 작품', demo:'영상 예시', join:'수업 참여'
};
const dateFormat = new Intl.DateTimeFormat('ko-KR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const clockFormat = new Intl.DateTimeFormat('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});

const quiet = text => '<span class="tl-muted">' + esc(text) + '</span>';
function stamp(value, short = false) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '—';
  return '<time datetime="' + esc(date.toISOString()) + '">' + (short ? clockFormat : dateFormat).format(date) + '</time>';
}
function projectLink(event, version = false) {
  if (!event?.projectId) return '';
  const suffix = version && event.versionId ? '/versions/' + encodeURIComponent(event.versionId) : '';
  return '<a class="tl-project" href="#project/' + encodeURIComponent(event.projectId) + suffix + '">' + esc(event.projectTitle || '프로젝트 열기') + '</a>';
}
function saveLabel(event) {
  if (event.kind === 'version') return event.versionNumber ? '버전 ' + event.versionNumber + ' 저장' : '버전 저장';
  return ({created:'프로젝트 시작', draft:'계획 수정 저장', asset:'작품 자료 저장'})[event.kind] || '프로젝트 저장';
}
function studentRow(student) {
  const online = student.online === true;
  const tool = online && (toolNames[student.tool] || (student.tool ? '작업실' : ''));
  const current = online ? (tool ? '<strong>' + esc(tool) + '</strong>' : '') + projectLink(student) : '';
  const save = student.lastSave;
  return '<tr><th scope="row"><span class="tl-name">' + esc(student.name) + '</span><span class="tl-presence' + (online ? ' is-online' : '') + '">' + (online ? '접속 중' : '현재 접속 없음') + '</span></th>' +
    '<td data-title="열린 작업">' + (current || quiet(online ? '연결됨' : '—')) + (online && student.teamName ? '<small>' + esc(student.teamName) + '</small>' : '') + '</td>' +
    '<td data-title="최근 접속">' + (student.lastSeenAt ? stamp(student.lastSeenAt) : quiet('기록 없음')) + '</td>' +
    '<td data-title="최근 저장">' + (save ? '<strong>' + esc(saveLabel(save)) + '</strong>' + projectLink(save,true) + '<small>' + stamp(save.at) + '</small>' : quiet('저장 기록 없음')) + '</td></tr>';
}
function eventRow(event) {
  return '<li><div><strong>' + esc(event.authorName || '수업 참여자') + '</strong>' + (event.authorRole === 'teacher' ? '<small>교사</small>' : '') +
    '<span>' + esc(saveLabel(event)) + '</span></div><div>' + projectLink(event,true) + (event.teamName ? '<small>' + esc(event.teamName) + '</small>' : '') + '</div>' + stamp(event.at) + '</li>';
}

// Only update changed lists. A teacher following a project link with the
// keyboard keeps that link focused when a new heartbeat or save arrives.
function listWriter(node) {
  let previous;
  return html => {
    if (previous === html) return;
    previous = html;
    const focus = node.contains(document.activeElement) ? document.activeElement : null;
    const links = [...node.querySelectorAll('a')];
    const href = focus?.getAttribute('href');
    const ordinal = href ? links.slice(0,links.indexOf(focus)).filter(a=>a.getAttribute('href')===href).length : -1;
    node.innerHTML = html;
    if (href) [...node.querySelectorAll('a')].filter(a=>a.getAttribute('href')===href)[ordinal]?.focus({preventScroll:true});
  };
}

export function mountTeacherLive(el, options = {}) {
  const host = document.createElement('section');
  host.className = 'teacher-live';
  host.innerHTML = '<header class="tl-heading"><h1>실시간 교실</h1><a data-tl-manage href="#teacher" hidden>학급 관리 <span aria-hidden="true">↗</span></a></header><div data-tl-body><p class="tl-empty" role="status">담당 학급을 확인하고 있어요.</p></div>';
  el.replaceChildren(host);
  const body = host.querySelector('[data-tl-body]'), manage = host.querySelector('[data-tl-manage]');
  const events = new AbortController();
  let alive = true, active = false, classId = options.classId || '', timer, pending, loginCleanup, dashboard, lastSnapshot = false;
  let contextCheck = 0;

  function stop() {
    active = false;
    clearTimeout(timer);
    pending?.abort();
    pending = null;
  }
  function clearLogin() { loginCleanup?.(); loginCleanup = null; }
  function showInfo(text, action = '') {
    body.innerHTML = '<div class="tl-message"><p>' + esc(text) + '</p>' + action + '</div>';
  }
  function login() {
    stop();
    clearLogin();
    manage.hidden = true;
    body.replaceChildren();
    loginCleanup = mountSchool(body,{view:'join',entryRole:'teacher',returnHash:'#teacher-live' + (classId ? '/' + encodeURIComponent(classId) : '')});
  }
  const retryContext = '<button type="button" class="tl-retry" data-tl-context>다시 확인</button>';
  async function initialize() {
    const check = ++contextCheck;
    const school = await getSchoolContext();
    if (!alive || check !== contextCheck) return;
    stop();
    clearLogin();
    if (!school.reachable) {
      manage.hidden = true;
      showInfo('학급 서버에 연결할 수 없어요. 작업실 서버가 열려 있는지 확인해 주세요.',retryContext);
      return;
    }
    if (!school.user) { login(); return; }
    if (school.user.role !== 'teacher') {
      manage.hidden = true;
      showInfo('실시간 교실은 담당 교사 계정에서 열 수 있어요.','<a href="#join" class="tl-action">내 계정 확인</a>');
      return;
    }
    manage.hidden = false;
    const classes = school.classes || [];
    if (!classes.length) {
      showInfo('아직 담당 학급이 없어요. 학급 관리에서 수업할 학급을 만들어 주세요.');
      return;
    }
    if (!classId) classId = classes[0].id;
    if (!classes.some(c=>c.id===classId)) {
      showInfo('이 학급을 열 권한이 없거나 학급이 종료됐어요.','<a class="tl-action" href="#teacher-live">담당 학급 보기</a>');
      return;
    }
    openDashboard(classes);
    active = true;
    if (!document.hidden) void refresh();
  }
  function openDashboard(classes) {
    const choices = classes.map(c=>'<option value="' + esc(c.id) + '"' + (c.id===classId ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('');
    body.innerHTML = '<div class="tl-bar"><label>학급 선택<select data-tl-class>' + choices + '</select></label><div class="tl-connection"><span data-tl-status role="status">학생의 활동을 불러오는 중이에요.</span><span data-tl-clock></span><button type="button" class="tl-retry" data-tl-refresh>새로고침</button></div></div>' +
      '<section class="tl-panel" data-tl-roster hidden><header><h2>학생별 활동</h2><span data-tl-count></span></header><p class="tl-help" data-tl-window></p><div data-tl-names></div></section>' +
      '<section class="tl-panel" data-tl-saves hidden><header><h2>최근 프로젝트 저장</h2></header><div data-tl-history></div></section>';
    const find = key=>body.querySelector('[data-tl-'+key+']');
    dashboard={status:find('status'),clock:find('clock'),refresh:find('refresh'),roster:find('roster'),saves:find('saves'),count:find('count'),window:find('window'),names:listWriter(find('names')),history:listWriter(find('history'))};
    lastSnapshot = false;
  }
  function setStatus(message, stale = false) {
    if (dashboard.status.textContent !== message) dashboard.status.textContent = message;
    dashboard.status.classList.toggle('has-error',stale);
  }
  function renderSnapshot(data) {
    const students = data.students;
    dashboard.count.textContent = '접속 중 ' + students.filter(s=>s.online).length + '명 / 전체 ' + students.length + '명';
    dashboard.window.textContent = '접속 여부는 최근 ' + data.activeWithinSeconds + '초 동안 작업실에서 받은 연결 신호를 기준으로 표시해요.';
    dashboard.names(students.length ? '<table class="tl-table"><thead><tr><th scope="col">학생</th><th scope="col">열린 작업</th><th scope="col">최근 접속</th><th scope="col">최근 저장</th></tr></thead><tbody>' + students.map(studentRow).join('') + '</tbody></table>' : '<p class="tl-empty">아직 등록한 학생이 없어요.</p>');
    dashboard.history(data.events.length ? '<ol class="tl-events">' + data.events.map(eventRow).join('') + '</ol>' : '<p class="tl-empty">이 학급에서 저장한 프로젝트 기록이 아직 없어요.</p>');
    dashboard.clock.innerHTML = '마지막 확인 ' + stamp(data.asOf,true);
    dashboard.roster.hidden = dashboard.saves.hidden = false;
    setStatus('5초마다 확인 중');
    lastSnapshot = true;
  }
  async function refresh() {
    if (!alive || !active || document.hidden || pending) return;
    clearTimeout(timer);
    const controller = new AbortController();
    pending = controller;
    const timeout = setTimeout(()=>controller.abort(),10000);
    dashboard.refresh.disabled = true;
    try {
      const response = await fetch('/api/school/classes/' + encodeURIComponent(classId) + '/live',{credentials:'same-origin',cache:'no-store',signal:controller.signal});
      if (!alive || pending !== controller) return;
      if (response.status===401) { login(); return; }
      if ([403,404,409].includes(response.status)) {
        stop();
        showInfo('현재 계정에서 이 학급의 활동을 확인할 수 없어요.',retryContext);
        return;
      }
      if (!response.ok) throw Error('live');
      const data = await response.json();
      if (!alive || pending !== controller) return;
      if (data.class?.id!==classId || !Array.isArray(data.students) || !Array.isArray(data.events) || !(data.activeWithinSeconds>0)) throw Error('snapshot');
      renderSnapshot(data);
    } catch {
      if (alive && pending===controller) setStatus(lastSnapshot ? '연결 재시도 중 · 마지막 확인 자료' : '학급 서버 연결을 재시도하고 있어요.',true);
    } finally {
      clearTimeout(timeout);
      if (pending===controller) {
        pending=null;
        dashboard.refresh.disabled=false;
        if (alive && active && !document.hidden) timer=setTimeout(refresh,interval);
      }
    }
  }
  host.addEventListener('change',e=>{
    if (e.target.matches('[data-tl-class]')) location.hash='teacher-live/' + encodeURIComponent(e.target.value);
  },{signal:events.signal});
  host.addEventListener('click',e=>{
    if (e.target.closest('[data-tl-refresh]')) void refresh();
    if (e.target.closest('[data-tl-context]')) void initialize();
  },{signal:events.signal});
  document.addEventListener('visibilitychange',()=>{
    clearTimeout(timer);
    if (document.hidden) {
      pending?.abort();
      pending=null;
      if (dashboard && active) {dashboard.refresh.disabled=false;setStatus('자동 확인 일시 정지');}
    } else if (active) void refresh();
  },{signal:events.signal});
  void initialize();
  return ()=>{alive=false;stop();clearLogin();events.abort();};
}

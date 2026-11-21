import {storage as localStorage,dbName} from './workspace-data.mjs';
/**
 * mountStudio(element, missionId) opens the student's latest draft or run.
 * getProjects() returns a copy of all local projects. Attempts are oldest first.
 * saveTeacherFeedback(missionId, attemptId, text) returns { ok, persisted }.
 * Changes dispatch "labchange" on window. The back button dispatches "labhome".
 */
export const COMMAND_LABELS = Object.freeze({
  up: "위로 한 칸",
  down: "아래로 한 칸",
  left: "왼쪽으로 한 칸",
  right: "오른쪽으로 한 칸",
});

const MOVES = {up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0]};
const MISSIONS = {
  star: {
    id: "star", title: "별을 모으는 로봇", goal: "바위를 피해 반짝이는 별이 있는 칸에 도착해요.",
    start: [0, 3], target: [3, 1], obstacles: [[1, 2], [2, 2], [3, 3]],
    starter: ["up", "right"], icon: "star", object: "별", blocker: "바위",
  },
  garden: {
    id: "garden", title: "정원에 물을 배달해요", goal: "울타리를 돌아 새싹이 있는 칸까지 물을 배달해요.",
    start: [0, 4], target: [4, 2], obstacles: [[1, 3], [2, 3], [3, 3]],
    starter: ["right", "up"], icon: "leaf", object: "새싹", blocker: "울타리",
  },
  signal: {
    id: "signal", title: "등대에 신호를 보내요", goal: "암초를 피해 등대가 있는 칸까지 신호를 가져가요.",
    start: [1, 4], target: [3, 0], obstacles: [[1, 2], [2, 2], [3, 2]],
    starter: ["up", "up"], icon: "radio", object: "등대", blocker: "암초",
  },
};

const clone = (value) => JSON.parse(JSON.stringify(value));
export function getMission(id) { return clone(Object.hasOwn(MISSIONS, id) ? MISSIONS[id] : MISSIONS.star); }

const STORAGE_KEY = "thinking-lab.projects.v1";
const MAX_COMMANDS = 40;
let memory = [];
let dirty = false;
function readProjects() {
  if (!dirty) {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (Array.isArray(parsed)) {
        memory = parsed.filter(p => p && Object.hasOwn(MISSIONS, p.missionId) && p.draft && Array.isArray(p.attempts));
      }
    } catch { /* A blocked browser store falls back to this tab's memory. */ }
  }
  return memory;
}
export function getProjects() { return clone(readProjects()); }
function persist(projects, missionId, source = "studio") {
  memory = projects;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    dirty = false;
  } catch { dirty = true; }
  window.dispatchEvent(new CustomEvent("labchange", {detail: {missionId, source, persisted: !dirty}}));
  return !dirty;
}
function makeDraft(mission) {
  return {commands: [...mission.starter], prediction: "", reason: "", parentVersion: null};
}
function makeProject(mission) {
  return {
    id: mission.id, missionId: mission.id, title: mission.title, updatedAt: new Date().toISOString(),
    phase: "draft", draft: makeDraft(mission), attempts: [],
  };
}
function modify(missionId, change, source) {
  const projects = readProjects();
  let project = projects.find(p => p.missionId === missionId);
  if (!project) { project = makeProject(MISSIONS[missionId]); projects.push(project); }
  change(project);
  project.updatedAt = new Date().toISOString();
  return persist(projects, missionId, source);
}
export function saveTeacherFeedback(missionId, attemptId, text) {
  if (typeof text !== "string" || !Object.hasOwn(MISSIONS, missionId)) return {ok: false, persisted: false};
  const project = readProjects().find(p => p.missionId === missionId);
  const attempt = project?.attempts.find(a => a.id === attemptId);
  if (!attempt) return {ok: false, persisted: false};
  attempt.teacherFeedback = text.trim();
  project.updatedAt = new Date().toISOString();
  return {ok: true, persisted: persist(memory, missionId, "teacher")};
}

const coord = (x, y) => `${x + 1}열 ${y + 1}행`;
/** Execute the whole list in order. A blocked command leaves the robot in place. */
export function runCommands(missionId, commands) {
  const m = getMission(missionId);
  let [x, y] = m.start;
  const trace = [{step: 0, x, y, message: `${coord(x, y)}에서 출발했어요.`, blocked: false}];
  for (const command of commands) {
    if (!Object.hasOwn(MOVES, command)) continue;
    const [dx, dy] = MOVES[command];
    const nx = x + dx, ny = y + dy;
    const outside = nx < 0 || nx > 4 || ny < 0 || ny > 4;
    const blocked = outside || m.obstacles.some(([ox, oy]) => ox === nx && oy === ny);
    if (!blocked) { x = nx; y = ny; }
    const message = blocked
      ? `${COMMAND_LABELS[command]} · ${outside ? "지도 끝" : m.blocker}에 막혀 제자리에 있어요.`
      : `${COMMAND_LABELS[command]} · ${coord(x, y)}에 왔어요.`;
    trace.push({step: trace.length, x, y, command, message, blocked});
  }
  const success = x === m.target[0] && y === m.target[1];
  const summary = success ? `${coord(x, y)}에 도착해 미션을 해결했어요.` : `${coord(x, y)}에서 멈췄어요. 목적지는 ${coord(...m.target)}예요.`;
  return {trace, result: {success, summary, x, y}};
}

const lineArt = {
  up: '<path d="M12 19V5m-6 6 6-6 6 6"/>',
  down: '<path d="M12 5v14m-6-6 6 6 6-6"/>',
  left: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  right: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  play: '<path fill="currentColor" stroke="none" d="M7 4.6a1 1 0 0 1 1.5-.86l12 7.4a1 1 0 0 1 0 1.72l-12 7.4A1 1 0 0 1 7 19.4Z"/>',
  replay: '<path d="M3.5 11a8.5 8.5 0 1 1 1.8 6.3M3 5v6h6"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  cloud: '<path d="M6.5 17H6a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4-1A5 5 0 0 1 19 16.7"/><path d="m8.5 15.5 2.4 2.5 4.7-5"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 10v7m4-7v7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  map: '<path d="m3 5 6-2 6 3 6-2v15l-6 2-6-3-6 2Zm6-2v15m6-12v15"/>',
  layers: '<path d="m3 8 9-5 9 5-9 5Zm0 5 9 5 9-5m-18 5 9 5 9-5"/>',
  idea: '<path d="M8.5 16c0-2.3-3-3.2-3-7a6.5 6.5 0 1 1 13 0c0 3.8-3 4.7-3 7ZM9 19h6m-5 3h4"/>',
  chat: '<path d="M20.5 11.5a8.5 8.5 0 0 1-8.5 8.5H5l-3 2 1.8-6A8.5 8.5 0 1 1 20.5 11.5Z"/><path d="M7.5 9h9m-9 4h6"/>',
  flag: '<path d="M5 21V3c4-3 9 4 14 0v10c-5 4-10-3-14 0"/>',
};
const icon = (name, size = 18) => `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${lineArt[name] || ""}</svg>`;
const pixel = (body, size = 26) => `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 16 16" shape-rendering="crispEdges">${body}</svg>`;
const robot = () => pixel('<path fill="#25315b" d="M7 0h2v2h4v2h2v7h-2v2h-2v2H9v-2H6v2H4v-2H3v-2H1V4h2V2h4z"/><path fill="#8299ff" d="M4 3h8v2h2v5h-2v2H4v-2H2V5h2z"/><path fill="#d6e3ff" d="M4 4h8v2H4z"/><path fill="#29355a" d="M4 6h8v4H4z"/><path fill="#c4f8ff" d="M5 7h2v2H5zm4 0h2v2H9z"/><path fill="#ffce5a" d="M7 0h2v2H7z"/>', 35);
const targetArt = {
  star: pixel('<path fill="#a16a13" d="M7 1h2v3h2v1h4v3h-2v2h-1v4H9v-1H7v1H4v-4H3V8H1V5h4V4h2z"/><path fill="#ffd849" d="M7 3h2v3h5v1h-2v2h-1v3H9v-1H7v1H5V9H4V7H2V6h5z"/><path fill="#fff4ab" d="M7 5h2v2H6v1H4V7h3z"/>', 29),
  leaf: pixel('<path fill="#246b47" d="M7 3H2v5h2v2h3v4h3V8h3V6h2V1h-5v2H8v3H7z"/><path fill="#7bc76e" d="M3 4h3v2h1v2H5V7H3zm6 0h2V2h3v3h-2v2H9z"/>', 29),
  radio: pixel('<path fill="#4a4567" d="M7 1h2v2h3v6h-2v4h3v2H3v-2h3V9H4V3h3z"/><path fill="#ffbc53" d="M5 4h6v4H5z"/><path fill="#ffecac" d="M6 4h2v2H6z"/><path fill="#e78372" d="M7 9h2v2H7z"/>', 29),
};
const obstacleArt = {
  star: pixel('<path fill="#768296" d="M1 10h1V7h2V5h3V3h4v2h2v3h2v5H1z"/><path fill="#a9b8cb" d="M3 8h2V6h3V4h3v4H8v2H3z"/><path fill="#8d9db2" d="M2 11h6v-1h6v2H2z"/>', 29),
  garden: pixel('<path fill="#8d6944" d="M1 6h14v3H1zM1 10h14v2H1z"/><path fill="#bd8b53" d="M2 3h2v11H2zm5-1h2v12H7zm5 1h2v11h-2z"/>', 29),
  signal: pixel('<path fill="#6b819a" d="M1 11h2V7h2V4h3v4h2V6h2v3h2v3H1z"/><path fill="#5fafe0" d="M1 11h3v1h3v-1h3v1h3v-1h2v2h-3v1H9v-1H6v1H3v-1H1z"/>', 29),
};
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pill = (cmd, i) => `<span class="sl-code-pill ${cmd}">${i + 1}. ${esc(COMMAND_LABELS[cmd])}</span>`;
const samePos = (a, x, y) => a[0] === x && a[1] === y;
function board(m, pos, trace) {
  let cells = "";
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      const isRobot = samePos(pos, x, y), isTarget = samePos(m.target, x, y);
      const obstacle = m.obstacles.some(p => samePos(p, x, y));
      const passed = trace.some(t => t.x === x && t.y === y);
      const description = [isRobot && "로봇", isTarget && m.object, obstacle && m.blocker, passed && "지나간 길"].filter(Boolean).join(", ") || "빈칸";
      cells += `<div class="sl-cell${isTarget ? " target" : ""}${isRobot ? " robot" : ""}${passed ? " passed" : ""}" role="img" aria-label="${coord(x, y)} ${description}">
        ${isRobot ? robot() : isTarget ? targetArt[m.icon] : obstacle ? obstacleArt[m.id] : passed ? '<i class="sl-footprint"></i>' : ""}
        ${isRobot && isTarget ? '<i class="sl-goal-corner">★</i>' : ""}</div>`;
    }
  }
  return `<div class="sl-map" role="group" aria-label="5행 5열 실험 지도">${cells}</div>`;
}
function field(key, label, value, placeholder, hint = "") {
  return `<label class="sl-field"><span>${label}</span>${hint ? `<small>${hint}</small>` : ""}<textarea data-field="${key}" maxlength="1200" rows="2" placeholder="${placeholder}">${esc(value)}</textarea></label>`;
}
function lines(commands, editable) {
  if (!commands.length) return '<p class="sl-empty">아래에서 첫 번째 명령을 골라요.</p>';
  return commands.map((c, i) => `<li class="sl-command"><span class="sl-line-no">${String(i + 1).padStart(2, "0")}</span><span class="sl-dir ${c}">${icon(c, 16)}</span><strong>${COMMAND_LABELS[c]}</strong>${editable ? `<div class="sl-row-buttons"><button data-act="earlier" data-index="${i}" aria-label="${i + 1}번째 명령 앞으로 옮기기" title="앞으로 옮기기" ${i === 0 ? "disabled" : ""}>${icon("up", 15)}</button><button data-act="later" data-index="${i}" aria-label="${i + 1}번째 명령 뒤로 옮기기" title="뒤로 옮기기" ${i === commands.length - 1 ? "disabled" : ""}>${icon("down", 15)}</button><button data-act="remove" data-index="${i}" aria-label="${i + 1}번째 명령 지우기" title="지우기">${icon("trash", 15)}</button></div>` : ""}</li>`).join("");
}
function compare(p, attempt) {
  const previous = p.attempts.find(a => a.version === attempt.parentVersion);
  if (!previous) return "";
  return `<section class="sl-panel"><h3>${icon("layers")} 두 버전 비교</h3>
    <div class="sl-compare">${[previous, attempt].map(a => `<div><h4>버전 ${a.version}</h4><div class="sl-code-list">${a.commands.map(pill).join("")}</div><p>${esc(a.result.summary)}</p></div>`).join("")}</div>
    <h4 class="sl-minor-heading">내가 바꾼 이유</h4><p class="sl-quote">${esc(attempt.reason)}</p></section>`;
}
function savedLabel() { return dirty ? "이 탭에 임시 저장됨 · 창을 열어 두세요" : "이 기기에 저장됨"; }

export function mountStudio(element, missionId = "star") {
  const m = getMission(missionId);
  const load = () => readProjects().find(p => p.missionId === m.id);
  if (!load()) modify(m.id, () => {});
  let timer = null;
  let showStep = null;
  element.innerHTML = '<section class="sl-studio"></section>';
  const root = element.firstElementChild;
  const current = (p) => p.attempts.at(-1);
  const edit = (change) => {
    const persisted = modify(m.id, change);
    const label = root.querySelector("[data-saved]");
    if (label) label.textContent = savedLabel();
    return persisted;
  };
  const stop = () => { if (timer !== null) clearInterval(timer); timer = null; };
  function note(message, focusKey) {
    const status = root.querySelector("[data-error]");
    status.textContent = message;
    status.hidden = false;
    if (focusKey) root.querySelector(`[data-field="${focusKey}"]`)?.focus();
    else status.focus();
  }
  function draw() {
    const p = load(), a = current(p), review = p.phase === "review" && !!a, d = p.draft;
    const version = review ? a.version : (a?.version || 0) + 1;
    const step = review ? Math.min(showStep ?? a.trace.length - 1, a.trace.length - 1) : 0;
    const pos = review ? [a.trace[step].x, a.trace[step].y] : m.start;
    root.innerHTML = `
      <div class="sl-crumb"><button data-act="home">${icon("back", 15)} 작업실 홈</button><span class="sl-saved">${icon("cloud", 16)} <span data-saved>${savedLabel()}</span></span></div>
      <header class="sl-heading"><span class="sl-tag">코딩 미션 · 버전 ${version}</span><h1>${m.title}</h1><p>${m.goal}</p></header>
      <div class="sl-workspace"><div class="sl-main">
      ${review ? `
        <section class="sl-panel"><div class="sl-panel-title"><h2>${icon("flag")} 실행 결과</h2><span class="sl-state ${a.result.success ? "success" : ""}">${a.result.success ? "목표 도착" : "실험 완료"}</span></div>
          <dl class="sl-findings"><div><dt>나의 예상</dt><dd>${esc(a.prediction)}</dd></div><div><dt>실제 결과</dt><dd>${esc(a.result.summary)}</dd></div></dl>
          <details class="sl-details"><summary>실행한 코드 보기 · 명령 ${a.commands.length}개</summary><div class="sl-code-list">${a.commands.map(pill).join("")}</div></details></section>
        ${compare(p, a)}
        <section class="sl-panel"><h2>${icon("chat")} 피드백 남기기</h2>
          ${field("reflection", "예상과 같거나 달랐던 점은 무엇인가요?", a.reflection, "예) 두 번째 명령에서 바위에 막혔어요.")}
          ${field("feedback", "다음 실험에서 무엇을 바꿔 볼까요?", a.feedback, "친구의 조언이나 내가 떠올린 방법을 적어요.")}
          ${a.teacherFeedback ? `<div class="sl-teacher"><h4>선생님 피드백</h4><p>${esc(a.teacherFeedback)}</p></div>` : ""}
          <div data-error class="sl-error" role="alert" tabindex="-1" hidden></div>
          <button class="sl-primary" data-act="revise">${icon("plus")} 다음 버전 만들기</button></section>
      ` : `
        <section class="sl-panel"><h2>${icon("idea")} 먼저 예상해요</h2>
          ${d.parentVersion ? `<div class="sl-previous"><strong>버전 ${d.parentVersion}의 피드백</strong><p>${esc(a?.feedback)}</p>${a?.teacherFeedback ? `<p>선생님 · ${esc(a.teacherFeedback)}</p>` : ""}</div>
          ${field("reason", "이번에는 무엇을, 왜 바꾸나요?", d.reason, "지난 실험에서 발견한 점과 이어서 적어요.")}` : ""}
          ${field("prediction", "이 명령대로 움직이면 어떻게 될까요?", d.prediction, "예) 위로 한 칸 간 뒤 오른쪽으로 가면 별에 가까워질 것 같아요.")}
        </section>
        <section class="sl-panel"><div class="sl-panel-title"><h2>${icon("layers")} 명령 조립하기</h2><span class="sl-count">명령 ${d.commands.length}개</span></div>
          <p class="sl-explain">위에서 아래로 차례대로 움직여요. 방향을 누르면 맨 아래에 명령이 추가돼요.</p>
          <ol class="sl-commands">${lines(d.commands, true)}</ol>
          <div class="sl-palette">${Object.keys(COMMAND_LABELS).map(c => `<button data-act="add" data-dir="${c}" class="${c}" ${d.commands.length >= MAX_COMMANDS ? "disabled" : ""}>${icon(c, 16)} ${COMMAND_LABELS[c]}</button>`).join("")}</div>
          <div data-error class="sl-error" role="alert" tabindex="-1" hidden></div>
          <button class="sl-primary" data-act="run">${icon("play", 17)} 코드 실행하기</button>
        </section>`}
      </div><aside class="sl-side"><section class="sl-panel sl-map-panel"><div class="sl-panel-title"><h2>${icon("map")} 실험 지도</h2><span class="sl-count">5 × 5</span></div>
        <div data-board>${board(m, pos, review ? a.trace.slice(0, step + 1) : [])}</div>
        <div class="sl-legend"><span>${robot()} 로봇</span><span>${targetArt[m.icon]} 목적지</span><span>${obstacleArt[m.id]} ${m.blocker}</span></div>
        ${review ? `<div class="sl-playback"><div class="sl-playback-title"><strong data-step>명령 ${step} / ${a.commands.length}</strong><button data-act="replay">${icon("replay", 15)} 다시 보기</button></div>
        <label class="sl-range"><span>실행 단계</span><input data-scrub aria-label="실행 단계" type="range" min="0" max="${a.trace.length - 1}" value="${step}" /></label>
        <p data-trace aria-live="polite">${esc(a.trace[step].message)}</p></div>` :
        `<p class="sl-map-hint">로봇은 <strong>${coord(...m.start)}</strong>에서 출발해요. 장애물이나 지도 끝에 닿으면 그 자리에 머물러요.</p>`}</section>
      ${review ? `<section class="sl-panel sl-trace"><h3>명령별 발자국</h3><ol>${a.trace.slice(1).map(t => `<li><button data-act="step" data-index="${t.step}" ${t.step === step ? 'aria-current="step"' : ""}><b>${t.step}</b><span>${esc(t.message)}</span></button></li>`).join("")}</ol></section>` : ""}
      </aside></div>`;
  }
  function updateMap(a, step) {
    if (!root.parentElement || !root.querySelector("[data-scrub]")) { stop(); return; }
    const t = a.trace[step];
    showStep = step;
    root.querySelector("[data-board]").innerHTML = board(m, [t.x, t.y], a.trace.slice(0, step + 1));
    root.querySelector("[data-step]").textContent = `명령 ${step} / ${a.commands.length}`;
    root.querySelector("[data-scrub]").value = step;
    root.querySelector("[data-trace]").textContent = t.message;
    root.querySelectorAll('[data-act="step"]').forEach(b => {
      if (Number(b.dataset.index) === step) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
    });
  }
  function replay(a) {
    stop(); updateMap(a, 0);
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { updateMap(a, a.trace.length - 1); return; }
    timer = setInterval(() => {
      const step = (showStep ?? 0) + 1;
      if (step >= a.trace.length || !root.isConnected) { stop(); return; }
      updateMap(a, step);
      if (step === a.trace.length - 1) stop();
    }, 460);
  }
  root.addEventListener("input", e => {
    const el = e.target;
    if (el.hasAttribute("data-scrub")) { stop(); updateMap(current(load()), Number(el.value)); return; }
    const key = el.dataset.field;
    if (!["reason", "prediction", "reflection", "feedback"].includes(key)) return;
    edit(p => { (p.phase === "review" ? current(p) : p.draft)[key] = el.value; });
    const error = root.querySelector("[data-error]");
    if (error) error.hidden = true;
  });
  root.addEventListener("click", e => {
    const b = e.target.closest("button[data-act]");
    if (!b || b.disabled) return;
    const action = b.dataset.act, index = Number(b.dataset.index), p = load(), a = current(p);
    if (action === "home") { stop(); window.dispatchEvent(new CustomEvent("labhome")); return; }
    if (action === "replay") { replay(a); return; }
    if (action === "step") { stop(); updateMap(a, index); return; }
    if (["add", "earlier", "later", "remove"].includes(action)) {
      edit(project => {
        const commands = project.draft.commands;
        if (action === "add" && commands.length < MAX_COMMANDS) commands.push(b.dataset.dir);
        if (action === "remove") commands.splice(index, 1);
        if (action === "earlier" || action === "later") {
          const dest = index + (action === "earlier" ? -1 : 1);
          if (dest >= 0 && dest < commands.length) [commands[dest], commands[index]] = [commands[index], commands[dest]];
        }
      });
      draw();
      if (action === "add") root.querySelector(`[data-dir="${b.dataset.dir}"]`)?.focus();
      else {
        const cmdCount = load().draft.commands.length;
        const destIndex = Math.min(cmdCount - 1, index + (action === "earlier" ? -1 : action === "later" ? 1 : 0));
        const control = root.querySelector(`[data-act="${action}"][data-index="${destIndex}"]:not(:disabled)`) ||
          root.querySelector(`[data-act="remove"][data-index="${destIndex}"]`) || root.querySelector('[data-act="add"]');
        control?.focus();
      }
      return;
    }
    if (action === "run") {
      if (p.draft.parentVersion && !p.draft.reason.trim()) { note("지난 실험을 보고 무엇을 바꾸는지 적어 주세요.", "reason"); return; }
      if (!p.draft.prediction.trim()) { note("실행하기 전에 로봇이 어떻게 움직일지 예상해 보세요.", "prediction"); return; }
      if (!p.draft.commands.length) { note("로봇이 따라 할 명령을 한 개 이상 골라 주세요."); return; }
      if (p.draft.parentVersion && a && JSON.stringify(a.commands) === JSON.stringify(p.draft.commands) && a.prediction.trim() === p.draft.prediction.trim()) {
        note("이전 버전과 비교할 수 있게 명령이나 예상을 한 가지 바꿔 주세요.", "prediction"); return;
      }
      const execution = runCommands(m.id, p.draft.commands);
      const attempt = {
        ...clone(p.draft), ...execution, version: (a?.version || 0) + 1,
        id: globalThis.crypto?.randomUUID?.() || `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
        createdAt: new Date().toISOString(), reflection: "", feedback: "", teacherFeedback: "",
      };
      edit(project => { project.attempts.push(attempt); project.phase = "review"; });
      showStep = 0; draw(); window.scrollTo({top: 0, behavior: "instant"}); replay(attempt);
      return;
    }
    if (action === "revise") {
      if (!a.reflection.trim()) { note("예상과 실제 결과를 비교해 적어 주세요.", "reflection"); return; }
      if (!a.feedback.trim() && !a.teacherFeedback?.trim()) { note("다음 버전에 담고 싶은 피드백을 적어 주세요.", "feedback"); return; }
      stop();
      edit(project => {
        project.draft = {commands: [...a.commands], prediction: "", reason: "", parentVersion: a.version};
        project.phase = "draft";
      });
      showStep = null; draw(); window.scrollTo({top: 0, behavior: "instant"}); root.querySelector('[data-field="reason"]')?.focus({preventScroll:true});
    }
  });
  draw();
  return stop;
}

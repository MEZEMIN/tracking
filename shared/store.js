/* 업무 트래킹 - 공용 데이터 모델 / 저장소 / 날짜 유틸 */

const STORAGE_KEY = 'tracking.workdata.v1';
const SCHEMA_VERSION = 1;

const PRIORITIES = [
  { id: 'high', label: '높음', rank: 0 },
  { id: 'mid', label: '보통', rank: 1 },
  { id: 'low', label: '낮음', rank: 2 },
];

const STATUSES = [
  { id: 'todo', label: '할 일' },
  { id: 'doing', label: '진행 중' },
  { id: 'done', label: '완료' },
];

const PROJECT_COLORS = [
  '#e0533d', '#e08a2e', '#c9a227', '#4f9d4f',
  '#3d8f8f', '#3f74c4', '#7a5cc4', '#c04f92',
];

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function emptyData() {
  return {
    version: SCHEMA_VERSION,
    publishedAt: null,
    owner: '',
    sample: false,
    projects: [],
    tasks: [],
  };
}

/* ---------- 날짜 유틸 (모두 로컬 타임존 기준, YYYY-MM-DD 문자열) ---------- */

function todayISO() {
  return toISO(new Date());
}

function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fromISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 마감일까지 남은 일수. 오늘이면 0, 지났으면 음수. */
function daysUntil(iso, fromIso) {
  if (!iso) return null;
  const a = fromISO(fromIso || todayISO());
  const b = fromISO(iso);
  return Math.round((b - a) / 86400000);
}

/** D-Day 표기: D-3, D-DAY, D+2 */
function ddayLabel(iso, fromIso) {
  const n = daysUntil(iso, fromIso);
  if (n === null) return '';
  if (n === 0) return 'D-DAY';
  return n > 0 ? `D-${n}` : `D+${-n}`;
}

/** 마감 임박도 등급 — 배지 색상에 사용 */
function ddayTone(iso, status, fromIso) {
  if (status === 'done') return 'done';
  const n = daysUntil(iso, fromIso);
  if (n === null) return 'none';
  if (n < 0) return 'overdue';
  if (n === 0) return 'today';
  if (n <= 3) return 'soon';
  if (n <= 7) return 'week';
  return 'later';
}

function formatDate(iso) {
  if (!iso) return '';
  const d = fromISO(iso);
  const week = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${week})`;
}

/* ---------- 마감 임박 (불타는 이펙트) ---------- */

/** 마감까지 이 일수 이하로 남으면 "불탄다". 지난 것도 포함. */
const BURN_DAYS = 3;

function isBurning(dueISO, isDone) {
  if (!dueISO || isDone) return false;
  const n = daysUntil(dueISO);
  return n !== null && n <= BURN_DAYS;
}

/** 프로젝트는 자체 마감일 기준. 완료 표시했으면 타지 않는다. */
function isProjectBurning(project) {
  return isBurning(project.dueDate, project.done);
}

/** 겹친 불꽃 3겹. 흔들림은 CSS 가 준다. */
const FLAME_HTML =
  '<span class="flame" aria-hidden="true">' +
  '<svg viewBox="0 0 24 32" preserveAspectRatio="xMidYMax meet">' +
  '<path class="f1" d="M12 1S4.6 10 4.6 18.4a7.4 7.4 0 0 0 14.8 0C19.4 10 12 1 12 1Z"/>' +
  '<path class="f2" d="M12.4 10.5S8.2 16 8.2 20.6a3.9 3.9 0 0 0 7.8 0c0-4.6-3.6-10.1-3.6-10.1Z"/>' +
  '<path class="f3" d="M12 18.6S10.1 21.6 10.1 23.4a1.9 1.9 0 0 0 3.8 0c0-1.8-1.9-4.8-1.9-4.8Z"/>' +
  '</svg></span>';

/* ---------- 캘린더 레이아웃 ---------- */

function addDays(iso, n) {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/**
 * [startISO, endISO] 기간이 weekStartISO 로 시작하는 7일 주와 겹치는 구간을 구한다.
 * 겹치지 않으면 null. s/e 는 0~6 열 번호(양끝 포함),
 * openStart/openEnd 는 막대가 이 주 밖으로 이어지는지 여부 — 끝을 둥글게 할지 판단에 쓴다.
 */
function spanInWeek(startISO, endISO, weekStartISO) {
  if (!startISO && !endISO) return null;
  let a = startISO || endISO;
  let b = endISO || startISO;
  if (a > b) [a, b] = [b, a];

  const ws = weekStartISO;
  const we = addDays(weekStartISO, 6);
  if (b < ws || a > we) return null;

  const clipA = a < ws ? ws : a;
  const clipB = b > we ? we : b;
  return {
    s: daysUntil(clipA, ws),
    e: daysUntil(clipB, ws),
    openStart: a < ws,
    openEnd: b > we,
  };
}

/**
 * 겹치는 막대가 서로 가리지 않도록 레인(행)을 배정한다.
 * 배열 순서를 우선하는 단순 그리디 — 앞쪽 항목이 위 레인을 차지한다.
 */
function packLanes(bars, firstLane) {
  const lanes = [];          // lanes[i] = 그 레인에 이미 놓인 [s,e] 목록
  for (const bar of bars) {
    let i = 0;
    while (lanes[i] && lanes[i].some(([s, e]) => bar.s <= e && bar.e >= s)) i++;
    (lanes[i] = lanes[i] || []).push([bar.s, bar.e]);
    bar.lane = (firstLane || 0) + i;
  }
  return lanes.length;
}

/* ---------- 정렬 ---------- */

/**
 * 우선순위 정렬: 완료된 업무는 항상 뒤로, 그 다음 마감 임박 순,
 * 마감일이 같으면 우선순위, 마감일 없는 업무는 맨 뒤.
 */
function sortTasks(tasks) {
  const today = todayISO();
  const prank = (id) => (PRIORITIES.find((p) => p.id === id) || { rank: 1 }).rank;
  return [...tasks].sort((a, b) => {
    const adone = a.status === 'done', bdone = b.status === 'done';
    if (adone !== bdone) return adone ? 1 : -1;
    const ad = daysUntil(a.dueDate, today);
    const bd = daysUntil(b.dueDate, today);
    if (ad === null && bd !== null) return 1;
    if (bd === null && ad !== null) return -1;
    if (ad !== null && bd !== null && ad !== bd) return ad - bd;
    const pr = prank(a.priority) - prank(b.priority);
    if (pr !== 0) return pr;
    return (a.title || '').localeCompare(b.title || '', 'ko');
  });
}

/* ---------- 파생 값 ---------- */

function checklistProgress(task) {
  const items = task.checklist || [];
  if (!items.length) return null;
  const done = items.filter((i) => i.done).length;
  return { done, total: items.length, pct: Math.round((done / items.length) * 100) };
}

/** 진척률: 명시값이 있으면 그걸 쓰고, 없으면 체크리스트에서 유추 */
function effectiveProgress(task) {
  if (task.status === 'done') return 100;
  if (typeof task.progress === 'number') return task.progress;
  const cl = checklistProgress(task);
  return cl ? cl.pct : 0;
}

function projectOf(data, task) {
  return data.projects.find((p) => p.id === task.projectId) || null;
}

/* ---------- 저장소 (입력 앱 전용) ---------- */

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyData();
    return migrate(JSON.parse(raw));
  } catch (e) {
    console.error('저장된 데이터를 읽지 못했습니다.', e);
    return emptyData();
  }
}

function saveLocal(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** 스키마가 올라가면 여기서 이전 버전 데이터를 보정한다. */
function migrate(data) {
  const base = emptyData();
  const out = { ...base, ...data };
  out.projects = Array.isArray(out.projects) ? out.projects : [];
  out.projects = out.projects.map((p) => ({
    id: p.id || uid(),
    name: p.name || '',
    color: p.color || PROJECT_COLORS[0],
    startDate: p.startDate || null,
    dueDate: p.dueDate || null,
    done: !!p.done,
    notes: p.notes || '',
  }));
  out.tasks = Array.isArray(out.tasks) ? out.tasks : [];
  out.tasks = out.tasks.map((t) => ({
    id: t.id || uid(),
    title: t.title || '',
    projectId: t.projectId || null,
    priority: t.priority || 'mid',
    status: t.status || 'todo',
    progress: typeof t.progress === 'number' ? t.progress : 0,
    startDate: t.startDate || null,
    dueDate: t.dueDate || null,
    estimateHours: typeof t.estimateHours === 'number' ? t.estimateHours : null,
    spentHours: typeof t.spentHours === 'number' ? t.spentHours : null,
    notes: t.notes || '',
    checklist: Array.isArray(t.checklist) ? t.checklist : [],
    createdAt: t.createdAt || new Date().toISOString(),
    updatedAt: t.updatedAt || new Date().toISOString(),
  }));
  out.version = SCHEMA_VERSION;
  return out;
}

window.Tracking = {
  STORAGE_KEY, SCHEMA_VERSION, PRIORITIES, STATUSES, PROJECT_COLORS,
  uid, emptyData, migrate, loadLocal, saveLocal,
  todayISO, toISO, fromISO, addDays, daysUntil, ddayLabel, ddayTone, formatDate,
  BURN_DAYS, isBurning, isProjectBurning, FLAME_HTML,
  spanInWeek, packLanes,
  sortTasks, checklistProgress, effectiveProgress, projectOf,
};

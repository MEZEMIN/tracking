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
  todayISO, toISO, fromISO, daysUntil, ddayLabel, ddayTone, formatDate,
  sortTasks, checklistProgress, effectiveProgress, projectOf,
};

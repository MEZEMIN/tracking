/* 조회 앱 - data.json 을 읽어 읽기 전용으로 표시한다. */

const T = window.Tracking;
const $ = (s) => document.querySelector(s);

let data = T.emptyData();
let view = 'priority';
let calCursor = new Date();      // 캘린더가 보고 있는 달
let hideDone = true;
let filterProject = '';

const REFRESH_MS = 30_000;       // 게시된 내용을 이 주기로 다시 확인한다
let lastRaw = null;              // 마지막으로 받은 원문 — 바뀐 게 없으면 다시 그리지 않는다

/* ---------- 데이터 로드 ---------- */

/** 캐시된 옛 스냅샷이 보이지 않도록 매번 새로 받는다. */
async function fetchRaw() {
  const res = await fetch(`data.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function boot() {
  try {
    lastRaw = await fetchRaw();
    data = T.migrate(JSON.parse(lastRaw));
  } catch (e) {
    console.warn('data.json 을 불러오지 못했습니다.', e);
    showLoadError();
    return;
  }
  renderPublished();
  fillProjectFilter();
  render();

  // 띄워만 놔도 최신이 보이도록 주기적으로 다시 확인한다.
  setInterval(poll, REFRESH_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
}

/** 바뀐 게 있을 때만 다시 그린다. 보고 있는 탭·달·필터는 그대로 유지된다. */
async function poll() {
  if (document.hidden) return;            // 안 보이는 탭은 굳이 받지 않는다
  let raw;
  try {
    raw = await fetchRaw();
  } catch (e) {
    return;                               // 일시적 실패는 다음 주기에 다시 시도
  }
  if (raw === lastRaw) return;
  lastRaw = raw;
  try {
    data = T.migrate(JSON.parse(raw));
  } catch (e) {
    return;
  }
  renderPublished();
  fillProjectFilter();
  render();
  flashUpdated();
}

let flashTimer;
function flashUpdated() {
  const el = $('#updated');
  el.textContent = '방금 갱신됨';
  el.hidden = false;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { el.hidden = true; }, 4000);
}

function showLoadError() {
  $('#stats').innerHTML = '';
  $('#task-groups').innerHTML =
    '<div class="empty">아직 게시된 데이터가 없습니다.<br>' +
    '입력 앱에서 <b>게시용 파일 내보내기</b>로 <code>data.json</code>을 만들어 저장소에 올려주세요.</div>';
}

function renderPublished() {
  if (data.sample) {
    $('#published').innerHTML =
      '<b style="color:var(--today)">샘플 데이터</b> — 입력 앱에서 처음 게시하면 실제 데이터로 바뀝니다.';
    return;
  }
  if (!data.publishedAt) return;
  const d = new Date(data.publishedAt);
  $('#published').textContent =
    `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. ` +
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} 기준`;
}

function fillProjectFilter() {
  const sel = $('#filter-project');
  sel.innerHTML = '<option value="">전체 프로젝트</option>' +
    data.projects.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  // 고르고 있던 프로젝트가 아직 있으면 선택을 유지한다.
  if (filterProject && data.projects.some((p) => p.id === filterProject)) sel.value = filterProject;
  else filterProject = '';
}

/* ---------- 렌더 ---------- */

function visibleTasks() {
  return data.tasks.filter((t) => {
    if (hideDone && t.status === 'done') return false;
    if (filterProject && t.projectId !== filterProject) return false;
    return true;
  });
}

function render() {
  renderStats();
  if (view === 'priority') renderPriority();
  if (view === 'calendar') renderCalendar();
  if (view === 'projects') renderProjects();
}

function renderStats() {
  const open = data.tasks.filter((t) => t.status !== 'done');
  const overdue = open.filter((t) => t.dueDate && T.daysUntil(t.dueDate) < 0);
  const week = open.filter((t) => {
    const n = T.daysUntil(t.dueDate);
    return n !== null && n >= 0 && n <= 7;
  });
  const done = data.tasks.filter((t) => t.status === 'done');

  const cards = [
    { n: open.length, k: '진행 중인 업무' },
    { n: overdue.length, k: '마감 지남', tone: 'overdue' },
    { n: week.length, k: '이번 주 마감', tone: 'today' },
    { n: done.length, k: '완료' },
  ];
  $('#stats').innerHTML = cards.map((c) =>
    `<div class="stat"${c.tone ? ` data-tone="${c.tone}"` : ''}>
       <div class="n">${c.n}</div><div class="k">${esc(c.k)}</div>
     </div>`).join('');
}

/** 마감 임박도로 묶어 보여준다 — "오늘 뭘 할지"가 바로 보이도록. */
function renderPriority() {
  const tasks = T.sortTasks(visibleTasks());
  if (!tasks.length) {
    $('#task-groups').innerHTML = '<div class="empty">표시할 업무가 없습니다.</div>';
    return;
  }

  const buckets = [
    { key: 'overdue', title: '마감 지남', tone: 'overdue', test: (n) => n !== null && n < 0 },
    { key: 'today', title: '오늘', tone: 'today', test: (n) => n === 0 },
    { key: 'soon', title: '3일 이내', test: (n) => n !== null && n >= 1 && n <= 3 },
    { key: 'week', title: '이번 주', test: (n) => n !== null && n >= 4 && n <= 7 },
    { key: 'later', title: '이후', test: (n) => n !== null && n > 7 },
    { key: 'none', title: '마감일 없음', test: (n) => n === null },
  ];

  const open = tasks.filter((t) => t.status !== 'done');
  const done = tasks.filter((t) => t.status === 'done');

  let html = '';
  for (const b of buckets) {
    const items = open.filter((t) => b.test(T.daysUntil(t.dueDate)));
    if (!items.length) continue;
    html += group(b.title, items, b.tone);
  }
  if (done.length) html += group('완료', done);

  $('#task-groups').innerHTML = html;
  bindTaskClicks($('#task-groups'));
}

function group(title, tasks, tone) {
  return `<div class="group"${tone ? ` data-tone="${tone}"` : ''}>
    <div class="group-title">${esc(title)} · ${tasks.length}</div>
    <div class="task-list">${tasks.map(taskRow).join('')}</div>
  </div>`;
}

function taskRow(t) {
  const p = T.projectOf(data, t);
  const pct = T.effectiveProgress(t);
  const cl = T.checklistProgress(t);
  const status = T.STATUSES.find((s) => s.id === t.status);

  const meta = [];
  if (p) meta.push(`<span class="proj"><i class="dot" style="background:${esc(p.color)}"></i>${esc(p.name)}</span>`);
  if (t.dueDate) meta.push(esc(T.formatDate(t.dueDate)));
  if (status && t.status !== 'todo') meta.push(esc(status.label));
  if (cl) meta.push(`체크리스트 ${cl.done}/${cl.total}`);
  if (t.estimateHours) meta.push(`${t.spentHours || 0}/${t.estimateHours}h`);

  return `<button class="task${t.status === 'done' ? ' is-done' : ''}" data-id="${esc(t.id)}">
    <i class="pri" data-p="${esc(t.priority)}"></i>
    <div class="main">
      <div class="title">${esc(t.title)}</div>
      <div class="meta">${meta.join('<span>·</span>')}</div>
    </div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    <div class="pct">${pct}%</div>
    <span class="dday" data-tone="${T.ddayTone(t.dueDate, t.status)}">${T.ddayLabel(t.dueDate)}</span>
  </button>`;
}

/* ---------- 캘린더 ---------- */

/*
 * 한 주를 7칸 그리드 두 겹으로 그린다.
 *  - 아래: 날짜 칸 (.cell)
 *  - 위: 여러 날에 걸치는 막대들 (.lanes) — grid-column 으로 기간만큼 늘린다
 * 프로젝트 일정은 위 레인부터, 내 일정은 그 아래 레인부터 채운다.
 */
function renderCalendar() {
  const y = calCursor.getFullYear();
  const m = calCursor.getMonth();
  $('#cal-title').textContent = `${y}년 ${m + 1}월`;

  const first = new Date(y, m, 1);
  const gridStart = new Date(first);
  gridStart.setDate(1 - first.getDay());      // 그 주의 일요일부터

  const projItems = data.projects
    .map((p, order) => ({ ...p, order }))
    .filter((p) => (p.startDate || p.dueDate) && !(filterProject && p.id !== filterProject))
    .filter((p) => !(hideDone && p.done))
    .map((p) => ({
      kind: 'project', id: p.id, color: p.color, label: p.name, order: p.order,
      start: p.startDate, end: p.dueDate,
      done: p.done, burning: T.isProjectBurning(p),
    }));

  const taskItems = visibleTasks()
    .filter((t) => t.startDate || t.dueDate)
    .map((t) => {
      const pr = T.projectOf(data, t);
      return {
        kind: 'task', id: t.id, color: pr ? pr.color : null, label: t.title,
        start: t.startDate, end: t.dueDate, done: t.status === 'done',
      };
    });

  // 프로젝트 줄은 달 전체에서 레인을 한 번만 배정한다 — 주가 바뀌어도 같은 줄에 머문다.
  const gridStartISO = T.toISO(gridStart);
  const gridEndISO = T.addDays(gridStartISO, 41);
  const projSpans = [];
  for (const it of projItems) {
    let a = it.start || it.end;
    let b = it.end || it.start;
    if (a > b) [a, b] = [b, a];
    if (b < gridStartISO || a > gridEndISO) continue;
    projSpans.push({
      id: it.id,
      s: Math.max(0, T.daysUntil(a, gridStartISO)),
      e: Math.min(41, T.daysUntil(b, gridStartISO)),
    });
  }
  const projLaneCount = T.packLanes(projSpans, 0);
  const laneOf = Object.fromEntries(projSpans.map((x) => [x.id, x.lane]));

  const today = T.todayISO();
  let html = '';

  for (let w = 0; w < 6; w++) {
    const ws = new Date(gridStart);
    ws.setDate(gridStart.getDate() + w * 7);
    const wsISO = T.toISO(ws);

    // 프로젝트는 미리 정해둔 레인을 그대로 쓰고, 내 일정만 그 아래에서 주별로 채운다.
    const projBars = clip(projItems, wsISO).map((b) => ({ ...b, lane: laneOf[b.id] }));
    const taskBars = clip(taskItems, wsISO);
    T.packLanes(taskBars, projLaneCount);
    const all = [...projBars, ...taskBars];
    const laneCount = all.length ? Math.max(...all.map((b) => b.lane)) + 1 : 0;

    let cells = '';
    for (let i = 0; i < 7; i++) {
      const d = new Date(ws);
      d.setDate(ws.getDate() + i);
      const iso = T.toISO(d);
      cells += `<div class="cell${d.getMonth() !== m ? ' is-out' : ''}${iso === today ? ' is-today' : ''}">
        <div class="d">${d.getDate()}</div>
      </div>`;
    }

    const bars = all.map(barHTML).join('');
    html += `<div class="week" style="--lanes:${laneCount}">
      ${cells}<div class="lanes">${bars}</div>
    </div>`;
  }

  $('#cal-grid').innerHTML = html;
  bindTaskClicks($('#cal-grid'));
}

/** 이번 주와 겹치는 항목만 골라 열 번호를 붙인다. */
function clip(items, weekStartISO, cmp) {
  const out = [];
  for (const it of items) {
    const sp = T.spanInWeek(it.start, it.end, weekStartISO);
    if (sp) out.push({ ...it, ...sp });
  }
  return out.sort(cmp || ((a, b) => a.s - b.s || b.e - a.e));
}

function barHTML(b) {
  const cls = [
    'cbar',
    b.kind === 'project' ? 'cbar-proj' : 'cbar-task',
    b.done ? 'is-done' : '',
    b.openStart ? 'open-start' : '',
    b.openEnd ? 'open-end' : '',
    b.burning ? 'is-burning' : '',
  ].filter(Boolean).join(' ');

  const style = `grid-column:${b.s + 1}/${b.e + 2};grid-row:${b.lane + 1};` +
                `--c:${b.color || 'var(--border-strong)'}`;

  // 내 일정은 막대 끝(= 마감 지점)에만 프로젝트 색을 칠한다.
  const cap = b.kind === 'task' && !b.openEnd ? '<i class="cap"></i>' : '';
  const flame = b.burning ? T.FLAME_HTML : '';

  return `<button class="${cls}" style="${style}" data-id="${esc(b.id)}" data-kind="${b.kind}" title="${esc(b.label)}">
    ${flame}<span class="lbl">${esc(b.label)}</span>${cap}
  </button>`;
}

/* ---------- 프로젝트 ---------- */

function renderProjects() {
  if (!data.projects.length) {
    $('#project-cards').innerHTML = '<div class="empty">등록된 프로젝트가 없습니다.</div>';
    return;
  }
  $('#project-cards').innerHTML = data.projects.map((p) => {
    const items = data.tasks.filter((t) => t.projectId === p.id);
    const done = items.filter((t) => t.status === 'done').length;
    const pct = items.length ? Math.round((done / items.length) * 100) : 0;
    const open = items.filter((t) => t.status !== 'done' && t.dueDate);
    const next = T.sortTasks(open)[0];
    const overdue = open.filter((t) => T.daysUntil(t.dueDate) < 0).length;
    const burning = T.isProjectBurning(p);

    const period = (p.startDate || p.dueDate)
      ? `${p.startDate ? T.formatDate(p.startDate) : '—'} ~ ${p.dueDate ? T.formatDate(p.dueDate) : '—'}`
      : '기간 미정';

    return `<div class="pcard${burning ? ' is-burning' : ''}${p.done ? ' is-closed' : ''}" data-id="${esc(p.id)}" data-kind="project">
      <div class="pcard-head">
        <i class="dot" style="background:${esc(p.color)}"></i>
        <h3>${burning ? T.FLAME_HTML : ''}${esc(p.name)}</h3>
        ${p.dueDate ? `<span class="dday${burning ? ' is-burning' : ''}" data-tone="${T.ddayTone(p.dueDate, p.done ? 'done' : 'doing')}">${T.ddayLabel(p.dueDate)}</span>` : ''}
        <span class="count">${done}/${items.length} 완료</span>
      </div>
      <div class="pperiod">${esc(period)}</div>
      <div class="pbar"><i style="width:${pct}%;background:${esc(p.color)}"></i></div>
      <div class="pcard-foot">
        ${next ? `<span>다음 일정: ${esc(next.title)} <span class="dday" data-tone="${T.ddayTone(next.dueDate, next.status)}">${T.ddayLabel(next.dueDate)}</span></span>` : '<span>예정된 일정 없음</span>'}
        ${overdue ? `<span style="color:var(--overdue)">지연 ${overdue}건</span>` : ''}
      </div>
    </div>`;
  }).join('');
  bindTaskClicks($('#project-cards'));
}

/* ---------- 상세 패널 ---------- */

function bindTaskClicks(root) {
  root.querySelectorAll('[data-id]').forEach((el) => {
    el.addEventListener('click', () => {
      if (el.dataset.kind === 'project') openProjectDetail(el.dataset.id);
      else openDetail(el.dataset.id);
    });
  });
}

/** 프로젝트 막대를 누르면 그 프로젝트 개요와 속한 업무 목록을 보여준다. */
function openProjectDetail(id) {
  const p = data.projects.find((x) => x.id === id);
  if (!p) return;
  const items = T.sortTasks(data.tasks.filter((t) => t.projectId === p.id));
  const done = items.filter((t) => t.status === 'done').length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  const burning = T.isProjectBurning(p);

  const rows = [];
  if (p.startDate || p.dueDate) {
    rows.push(['기간', `${p.startDate ? esc(T.formatDate(p.startDate)) : '—'} ~ ${p.dueDate ? esc(T.formatDate(p.dueDate)) : '—'}`]);
  }
  if (p.dueDate) {
    rows.push(['마감', `<span class="dday${burning ? ' is-burning' : ''}" data-tone="${T.ddayTone(p.dueDate, p.done ? 'done' : 'doing')}">${T.ddayLabel(p.dueDate)}</span>`]);
  }
  rows.push(['진행', `<span class="pctrow"><span class="bar" style="width:120px"><i style="width:${pct}%;background:${esc(p.color)}"></i></span> ${done}/${items.length}</span>`]);
  if (p.notes) rows.push(['메모', `<div class="notes">${esc(p.notes)}</div>`]);
  if (items.length) {
    rows.push(['업무', `<ul class="cl">${items.map((t) =>
      `<li class="${t.status === 'done' ? 'done' : ''}">${t.status === 'done' ? '☑' : '☐'} ${esc(t.title)}` +
      `${t.dueDate ? ` <span class="dday" data-tone="${T.ddayTone(t.dueDate, t.status)}">${T.ddayLabel(t.dueDate)}</span>` : ''}</li>`).join('')}</ul>`]);
  }

  $('#detail').innerHTML =
    `<button class="ghost close" id="detail-close" aria-label="닫기">✕</button>
     <div class="detail-kind"><i class="dot" style="background:${esc(p.color)}"></i> 프로젝트 일정</div>
     <h2>${burning ? T.FLAME_HTML : ''}${esc(p.name)}</h2>
     ${rows.map(([k, v]) => `<div class="row"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('')}`;
  $('#detail-backdrop').hidden = false;
  $('#detail-close').addEventListener('click', closeDetail);
}

function openDetail(id) {
  const t = data.tasks.find((x) => x.id === id);
  if (!t) return;
  const p = T.projectOf(data, t);
  const status = T.STATUSES.find((s) => s.id === t.status);
  const pri = T.PRIORITIES.find((x) => x.id === t.priority);
  const pct = T.effectiveProgress(t);

  const rows = [];
  if (p) rows.push(['프로젝트', `<i class="dot" style="background:${esc(p.color)}"></i> ${esc(p.name)}`]);
  rows.push(['상태', esc(status ? status.label : t.status)]);
  rows.push(['우선순위', esc(pri ? pri.label : t.priority)]);
  rows.push(['진척률', `<span class="pctrow"><span class="bar" style="width:120px"><i style="width:${pct}%"></i></span> ${pct}%</span>`]);
  if (t.startDate) rows.push(['시작일', esc(T.formatDate(t.startDate))]);
  if (t.dueDate) rows.push(['마감일', `${esc(T.formatDate(t.dueDate))} <span class="dday" data-tone="${T.ddayTone(t.dueDate, t.status)}">${T.ddayLabel(t.dueDate)}</span>`]);
  if (t.estimateHours || t.spentHours) {
    const hrs = (v) => (v || v === 0 ? `${v}h` : '-');
    rows.push(['소요 시간', `예상 ${hrs(t.estimateHours)} · 실제 ${hrs(t.spentHours)}`]);
  }
  if (t.checklist && t.checklist.length) {
    rows.push(['체크리스트', `<ul class="cl">${t.checklist.map((i) =>
      `<li class="${i.done ? 'done' : ''}">${i.done ? '☑' : '☐'} ${esc(i.text)}</li>`).join('')}</ul>`]);
  }
  if (t.notes) rows.push(['메모', `<div class="notes">${esc(t.notes)}</div>`]);

  $('#detail').innerHTML =
    `<button class="ghost close" id="detail-close" aria-label="닫기">✕</button>
     <div class="detail-kind"><i class="dot" style="background:${esc(p ? p.color : 'var(--border-strong)')}"></i> 내 일정</div>
     <h2>${esc(t.title)}</h2>
     ${rows.map(([k, v]) => `<div class="row"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('')}`;
  $('#detail-backdrop').hidden = false;
  $('#detail-close').addEventListener('click', closeDetail);
}

function closeDetail() { $('#detail-backdrop').hidden = true; }

/* ---------- 이벤트 ---------- */

$('#tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  view = btn.dataset.view;
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('is-on', b === btn));
  $('#view-priority').hidden = view !== 'priority';
  $('#view-calendar').hidden = view !== 'calendar';
  $('#view-projects').hidden = view !== 'projects';
  render();
});

$('#hide-done').addEventListener('change', (e) => { hideDone = e.target.checked; render(); });
$('#filter-project').addEventListener('change', (e) => { filterProject = e.target.value; render(); });

$('#cal-prev').addEventListener('click', () => { calCursor.setMonth(calCursor.getMonth() - 1); renderCalendar(); });
$('#cal-next').addEventListener('click', () => { calCursor.setMonth(calCursor.getMonth() + 1); renderCalendar(); });
$('#cal-today').addEventListener('click', () => { calCursor = new Date(); renderCalendar(); });

$('#detail-backdrop').addEventListener('click', (e) => {
  if (e.target === $('#detail-backdrop')) closeDetail();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDetail(); });

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

boot();

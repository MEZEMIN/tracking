/* 조회 앱 - data.json 을 읽어 읽기 전용으로 표시한다. */

const T = window.Tracking;
const $ = (s) => document.querySelector(s);

let data = T.emptyData();
let view = 'priority';
let calCursor = new Date();      // 캘린더가 보고 있는 달
let hideDone = true;
let filterProject = '';

/* ---------- 데이터 로드 ---------- */

async function boot() {
  try {
    // 캐시된 옛 스냅샷이 보이지 않도록 매번 새로 받는다.
    const res = await fetch(`data.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = T.migrate(await res.json());
  } catch (e) {
    console.warn('data.json 을 불러오지 못했습니다.', e);
    showLoadError();
    return;
  }
  renderPublished();
  fillProjectFilter();
  render();
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
  for (const p of data.projects) {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.name;
    sel.append(o);
  }
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

function renderCalendar() {
  const y = calCursor.getFullYear();
  const m = calCursor.getMonth();
  $('#cal-title').textContent = `${y}년 ${m + 1}월`;

  const first = new Date(y, m, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());          // 그 주의 일요일부터 시작

  const byDate = new Map();
  for (const t of visibleTasks()) {
    if (!t.dueDate) continue;
    if (!byDate.has(t.dueDate)) byDate.set(t.dueDate, []);
    byDate.get(t.dueDate).push(t);
  }

  const today = T.todayISO();
  let html = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = T.toISO(d);
    const out = d.getMonth() !== m;
    const items = T.sortTasks(byDate.get(iso) || []);

    const pills = items.slice(0, 3).map((t) => {
      const p = T.projectOf(data, t);
      return `<button class="pill${t.status === 'done' ? ' is-done' : ''}" data-id="${esc(t.id)}" title="${esc(t.title)}">
        <i class="dot" style="background:${esc(p ? p.color : 'var(--text-3)')}"></i><span>${esc(t.title)}</span>
      </button>`;
    }).join('');
    const more = items.length > 3 ? `<div class="more">+${items.length - 3}건</div>` : '';

    html += `<div class="cell${out ? ' is-out' : ''}${iso === today ? ' is-today' : ''}">
      <div class="d">${d.getDate()}</div>${pills}${more}
    </div>`;
  }
  $('#cal-grid').innerHTML = html;
  bindTaskClicks($('#cal-grid'));
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

    return `<div class="pcard">
      <div class="pcard-head">
        <i class="dot" style="background:${esc(p.color)}"></i>
        <h3>${esc(p.name)}</h3>
        <span class="count">${done}/${items.length} 완료</span>
      </div>
      <div class="pbar"><i style="width:${pct}%;background:${esc(p.color)}"></i></div>
      <div class="pcard-foot">
        ${next ? `<span>다음 마감: ${esc(next.title)} <span class="dday" data-tone="${T.ddayTone(next.dueDate, next.status)}">${T.ddayLabel(next.dueDate)}</span></span>` : '<span>예정된 마감 없음</span>'}
        ${overdue ? `<span style="color:var(--overdue)">지연 ${overdue}건</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

/* ---------- 상세 패널 ---------- */

function bindTaskClicks(root) {
  root.querySelectorAll('[data-id]').forEach((el) => {
    el.addEventListener('click', () => openDetail(el.dataset.id));
  });
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

/* 입력 앱 - localStorage 에 저장하고, 게시용 data.json 을 내보낸다.
 *
 * 프로젝트 일정과 내 일정을 따로 입력한다.
 *  - 프로젝트: 이름 / 색 / 기간(시작~마감). 캘린더에 그 색 단색 줄로 그려진다.
 *  - 업무: 어떤 프로젝트에 속하는지 고른다. 같은 색이되 끝부분만 칠해진 줄이 된다.
 */

const T = window.Tracking;
const $ = (s) => document.querySelector(s);

let data = T.loadLocal();
let sel = null;                 // { kind: 'task' | 'project', id }
let hideDone = false;

/* ---------- 저장 ---------- */

function commit(msg) {
  T.saveLocal(data);
  stampSaved();
  if (msg) toast(msg);
}

function stampSaved() {
  const d = new Date();
  $('#saved-at').textContent =
    `저장됨 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

function isSel(kind, id) { return sel && sel.kind === kind && sel.id === id; }

function thisMonth() { return monthFromNow(0); }

/** 이번 달 기준 n 개월 뒤를 'YYYY-MM' 으로. */
function monthFromNow(n) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * "프로젝트에 맞춤" 이 켜진 일정의 날짜를 프로젝트 기간에 다시 맞춘다.
 * 프로젝트 날짜가 바뀌거나, 일정의 소속 프로젝트가 바뀔 때 부른다.
 */
function syncTaskDates(t) {
  const p = T.projectOf(data, t);
  if (!p) { t.followProjectStart = false; t.followProjectDue = false; return; }
  const r = T.projectRange(p);
  if (t.followProjectStart) t.startDate = r.start;
  if (t.followProjectDue) t.dueDate = r.end;
}

function syncLinkedTasks(projectId) {
  data.tasks.forEach((t) => { if (t.projectId === projectId) syncTaskDates(t); });
}

/* ---------- 프로젝트 목록 ---------- */

function renderProjects() {
  const box = $('#project-list');
  if (!data.projects.length) {
    box.innerHTML = '<div class="hint">아직 프로젝트가 없습니다. 먼저 프로젝트를 만들고 그 아래에 일정을 넣으세요.</div>';
    return;
  }
  box.innerHTML = data.projects.map((p) => {
    const burning = T.isProjectBurning(p);
    const count = data.tasks.filter((t) => t.projectId === p.id).length;
    return `<button class="trow${isSel('project', p.id) ? ' is-on' : ''}${p.done ? ' is-done' : ''}" data-id="${esc(p.id)}">
      <i class="dot" style="background:${esc(p.color)}"></i>
      <span class="t">${burning ? T.FLAME_HTML : ''}${esc(p.name || '(이름 없음)')}</span>
      <span class="n">${count}</span>
      <span class="dday${burning ? ' is-burning' : ''}" data-tone="${T.ddayTone(p.dueDate, p.done ? 'done' : 'doing')}">${T.ddayLabel(p.dueDate)}</span>
    </button>`;
  }).join('');
  box.querySelectorAll('.trow').forEach((b) => {
    b.addEventListener('click', () => { sel = { kind: 'project', id: b.dataset.id }; renderAll(); });
  });
}

$('#btn-add-project').addEventListener('click', () => {
  const n = data.projects.length;
  const p = {
    id: T.uid(),
    name: '',
    color: T.PROJECT_COLORS[n % T.PROJECT_COLORS.length],
    startDate: null,
    dueDate: null,
    done: false,
    notes: '',
  };
  data.projects.push(p);
  sel = { kind: 'project', id: p.id };
  commit();
  renderAll();
  focusFirst();
});

/* ---------- 업무 목록 ---------- */

function renderTasks() {
  const box = $('#task-list');
  const list = T.sortTasks(data.tasks.filter((t) => !(hideDone && t.status === 'done')));
  if (!list.length) {
    box.innerHTML = '<div class="hint">표시할 일정이 없습니다.</div>';
    return;
  }
  box.innerHTML = list.map((t) => {
    const p = T.projectOf(data, t);
    const due = T.taskDue(t);
    return `<button class="trow${isSel('task', t.id) ? ' is-on' : ''}${t.status === 'done' ? ' is-done' : ''}" data-id="${esc(t.id)}">
      <i class="dot" style="background:${esc(p ? p.color : 'var(--border-strong)')}"></i>
      <span class="t">${T.hasRepeat(t) ? '<b class="rep">↻</b>' : ''}${esc(t.title || '(제목 없음)')}</span>
      <span class="dday" data-tone="${T.ddayTone(due, t.status)}">${T.ddayLabel(due)}</span>
    </button>`;
  }).join('');
  box.querySelectorAll('.trow').forEach((b) => {
    b.addEventListener('click', () => { sel = { kind: 'task', id: b.dataset.id }; renderAll(); });
  });
}

$('#hide-done').addEventListener('change', (e) => { hideDone = e.target.checked; renderTasks(); });

$('#btn-add-task').addEventListener('click', () => {
  // 프로젝트를 보고 있었다면 그 프로젝트에 자동으로 묶어준다.
  const preset = sel && sel.kind === 'project' ? sel.id
    : (sel && sel.kind === 'task' ? (data.tasks.find((t) => t.id === sel.id) || {}).projectId : null);

  const t = {
    id: T.uid(),
    title: '',
    projectId: preset || (data.projects[0] ? data.projects[0].id : null),
    priority: 'mid',
    status: 'todo',
    progress: 0,
    startDate: null,
    dueDate: null,
    followProjectStart: false,
    followProjectDue: false,
    repeat: null,
    doneDates: [],
    estimateHours: null,
    spentHours: null,
    notes: '',
    checklist: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  data.tasks.push(t);
  sel = { kind: 'task', id: t.id };
  commit();
  renderAll();
  focusFirst();
});

function focusFirst() {
  const el = $('#editor [data-f=name], #editor [data-f=title]');
  if (el) el.focus();
}

/* ---------- 편집 폼 ---------- */

function renderEditor() {
  const box = $('#editor');
  if (!sel) {
    box.innerHTML = '<div class="empty">왼쪽에서 항목을 고르거나 <b>새 프로젝트</b> · <b>새 일정</b>을 눌러 시작하세요.</div>';
    return;
  }
  if (sel.kind === 'project') renderProjectEditor();
  else renderTaskEditor();
}

/** 대략 일정이 실제로 어느 날짜 범위가 되는지 덧붙인다. */
function rangeHint(p) {
  const r = T.projectRange(p);
  if (!r.start || !r.end) return ' — 달을 고르면 범위가 잡힙니다.';
  return ` — 캘린더에는 ${T.formatDate(r.start)} ~ ${T.formatDate(r.end)} 로 흐리게 표시됩니다.`;
}

/* 프로젝트 일정 편집 */
function renderProjectEditor() {
  const p = data.projects.find((x) => x.id === sel.id);
  if (!p) { sel = null; return renderEditor(); }
  const count = data.tasks.filter((t) => t.projectId === p.id).length;
  const burning = T.isProjectBurning(p);

  $('#editor').innerHTML = `
    <div class="editor-kind"><i class="dot" style="background:${esc(p.color)}"></i> 프로젝트 일정
      ${burning ? `${T.FLAME_HTML} <span style="color:var(--overdue)">마감 임박</span>` : ''}</div>

    <div class="field">
      <input class="title-input" type="text" data-f="name" value="${esc(p.name)}" placeholder="프로젝트 이름 (예: 농심 자판기)">
    </div>

    <div class="field">
      <label>색상 — 캘린더에서 이 색 단색 줄로 그려집니다</label>
      <div class="swatches" data-f="color">
        ${T.PROJECT_COLORS.map((c) =>
          `<button data-c="${c}" style="background:${c}" class="${c === p.color ? 'is-on' : ''}" aria-label="${c}"></button>`).join('')}
      </div>
    </div>

    <div class="field">
      <label>일정</label>
      <div class="seg" data-f="dateMode">
        <button data-v="exact" class="${p.dateMode !== 'approx' ? 'is-on' : ''}">정확한 날짜</button>
        <button data-v="approx" class="${p.dateMode === 'approx' ? 'is-on' : ''}">아직 미정 (대략)</button>
      </div>
    </div>

    ${p.dateMode === 'approx' ? `
    <div class="field-row">
      <div class="field">
        <label>어느 달</label>
        <input type="month" data-f="approxMonth" value="${esc(p.approxMonth || '')}">
        <div class="quick">
          <button data-month="0">이번 달</button>
          <button data-month="1">다음 달</button>
          <button data-month="2">다다음 달</button>
        </div>
      </div>
      <div class="field">
        <label>그 달의 언제쯤</label>
        <div class="seg seg-wrap" data-f="approxPart">
          ${T.APPROX_PARTS.map((x) =>
            `<button data-v="${x.id}" class="${x.id === (p.approxPart || 'whole') ? 'is-on' : ''}">${x.label}</button>`).join('')}
        </div>
      </div>
    </div>
    <div class="approx-preview">${esc(T.projectPeriodLabel(p))}${rangeHint(p)}</div>
    ` : `
    <div class="field-row">
      <div class="field">
        <label>시작일</label>
        <input type="date" data-f="startDate" value="${esc(p.startDate || '')}">
      </div>
      <div class="field">
        <label>마감일 (D-Day 기준)</label>
        <input type="date" data-f="dueDate" value="${esc(p.dueDate || '')}">
      </div>
    </div>
    `}

    <div class="field">
      <label class="check"><input type="checkbox" data-f="done"${p.done ? ' checked' : ''}> 프로젝트 완료 (불꽃 이펙트가 꺼집니다)</label>
    </div>

    <div class="field">
      <label>메모</label>
      <textarea data-f="notes" placeholder="범위, 담당, 참고 링크 등">${esc(p.notes)}</textarea>
    </div>

    <div class="publish-note">
      마감 <b>${T.BURN_DAYS}일</b> 이내로 들어오면 캘린더와 프로젝트 카드에 불타는 이펙트가 붙습니다.
      이 프로젝트에 묶인 내 일정은 <b>${count}건</b>입니다.
    </div>

    <div class="editor-foot">
      <button class="ghost" id="btn-add-here">+ 이 프로젝트에 일정 추가</button>
      <button class="danger" id="btn-delete">삭제</button>
    </div>`;

  const box = $('#editor');

  bindFields(box, p, {
    dates: ['startDate', 'dueDate'],
    nullable: ['approxMonth'],
    onChange: (f) => {
      // bindFields 는 이미 저장한 뒤에 부르므로, 연동 일정을 고친 뒤 한 번 더 저장한다.
      if (f === 'startDate' || f === 'dueDate' || f === 'approxMonth') {
        syncLinkedTasks(p.id);
        commit();
      }
      renderProjects(); renderTasks();
      // 날짜·색·완료는 헤더의 "마감 임박" 표시와 미리보기에도 영향을 준다
      if (f !== 'name' && f !== 'notes') renderProjectEditor();
    },
  });

  // 일정 방식(정확/대략)과 구간(초·중순·말·전체) 전환
  box.querySelectorAll('.seg[data-f]').forEach((seg) => {
    const f = seg.dataset.f;
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (!b) return;
      p[f] = b.dataset.v;
      // 대략으로 처음 바꾸면 이번 달을 기본값으로 넣어준다.
      if (f === 'dateMode' && p.dateMode === 'approx' && !p.approxMonth) p.approxMonth = thisMonth();
      syncLinkedTasks(p.id);
      commit();
      renderAll();
    });
  });

  // 이번 달 / 다음 달 빠른 선택
  const quick = box.querySelector('.quick');
  if (quick) {
    quick.addEventListener('click', (e) => {
      const b = e.target.closest('[data-month]');
      if (!b) return;
      p.approxMonth = monthFromNow(Number(b.dataset.month));
      syncLinkedTasks(p.id);
      commit();
      renderAll();
    });
  }

  box.querySelector('.swatches').addEventListener('click', (e) => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    p.color = b.dataset.c;
    commit();
    renderAll();
  });

  $('#btn-add-here').addEventListener('click', () => $('#btn-add-task').click());
  $('#btn-delete').addEventListener('click', () => {
    const q = count
      ? `"${p.name || '(이름 없음)'}" 프로젝트를 삭제할까요? 이 프로젝트의 내 일정 ${count}건은 남고 프로젝트 연결만 해제됩니다.`
      : `"${p.name || '(이름 없음)'}" 프로젝트를 삭제할까요?`;
    if (!confirm(q)) return;
    data.tasks.forEach((t) => { if (t.projectId === p.id) t.projectId = null; });
    data.projects = data.projects.filter((x) => x.id !== p.id);
    sel = null;
    commit('삭제했습니다.');
    renderAll();
  });
}

/* 내 일정 편집 */
function touch(o) { o.updatedAt = new Date().toISOString(); }

function renderTaskEditor() {
  const t = data.tasks.find((x) => x.id === sel.id);
  if (!t) { sel = null; return renderEditor(); }
  const p = T.projectOf(data, t);
  const pr = p ? T.projectRange(p) : null;      // 맞출 기준이 되는 프로젝트 기간
  const pct = T.effectiveProgress(t);

  $('#editor').innerHTML = `
    <div class="editor-kind"><i class="dot" style="background:${esc(p ? p.color : 'var(--border-strong)')}"></i> 내 일정${
      pr && pr.approx ? ' <span class="tag-approx">프로젝트 일정 미확정</span>' : ''}</div>

    <div class="field">
      <input class="title-input" type="text" data-f="title" value="${esc(t.title)}" placeholder="일정 제목">
    </div>

    <div class="field-row">
      <div class="field">
        <label>어떤 프로젝트의 일정인가요</label>
        <select data-f="projectId">
          <option value="">(프로젝트 없음)</option>
          ${data.projects.map((x) =>
            `<option value="${esc(x.id)}"${x.id === t.projectId ? ' selected' : ''}>${esc(x.name || '(이름 없음)')}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>우선순위</label>
        <div class="seg" data-f="priority">
          ${T.PRIORITIES.map((x) =>
            `<button data-v="${x.id}" class="${x.id === t.priority ? 'is-on' : ''}">${x.label}</button>`).join('')}
        </div>
      </div>
    </div>

    <div class="field">
      <label>상태</label>
      <div class="seg" data-f="status">
        ${T.STATUSES.map((x) =>
          `<button data-v="${x.id}" class="${x.id === t.status ? 'is-on' : ''}">${x.label}</button>`).join('')}
      </div>
    </div>

    <div class="field">
      <label>진척률</label>
      <div class="range-row">
        <input type="range" min="0" max="100" step="5" data-f="progress" value="${pct}">
        <span class="val" id="pct-val">${pct}%</span>
      </div>
    </div>

    <div class="field-row">
      <div class="field">
        <label>시작일 (비우면 마감일 하루짜리)</label>
        <input type="date" data-f="startDate" value="${esc(t.startDate || '')}"${t.followProjectStart ? ' disabled' : ''}>
        ${pr && pr.start ? `<label class="check follow">
          <input type="checkbox" data-follow="start"${t.followProjectStart ? ' checked' : ''}>
          프로젝트 시작일에 맞춤 <span class="d">${esc(T.formatDate(pr.start))}</span>
        </label>` : ''}
      </div>
      <div class="field">
        <label>마감일 (D-Day 기준)</label>
        <input type="date" data-f="dueDate" value="${esc(t.dueDate || '')}"${t.followProjectDue ? ' disabled' : ''}>
        ${pr && pr.end ? `<label class="check follow">
          <input type="checkbox" data-follow="due"${t.followProjectDue ? ' checked' : ''}>
          프로젝트 마감일에 맞춤 <span class="d">${esc(T.formatDate(pr.end))}</span>
        </label>` : ''}
      </div>
    </div>

    <div class="field-row">
      <div class="field">
        <label>예상 시간 (h)</label>
        <input type="number" min="0" step="0.5" data-f="estimateHours" value="${t.estimateHours ?? ''}">
      </div>
      <div class="field">
        <label>실제 투입 (h)</label>
        <input type="number" min="0" step="0.5" data-f="spentHours" value="${t.spentHours ?? ''}">
      </div>
    </div>

    <div class="field">
      <label>반복</label>
      <div class="seg" data-f="repeatFreq">
        <button data-v="" class="${!T.hasRepeat(t) ? 'is-on' : ''}">안 함</button>
        ${T.REPEAT_FREQS.map((f) =>
          `<button data-v="${f.id}" class="${t.repeat && t.repeat.freq === f.id ? 'is-on' : ''}">${f.label}</button>`).join('')}
      </div>
      ${T.hasRepeat(t) ? repeatDetailHTML(t) : ''}
    </div>

    ${T.hasRepeat(t) ? occurrenceListHTML(t) : ''}

    <div class="field">
      <label>체크리스트</label>
      <div id="cl-list">${(t.checklist || []).map((it, i) => `
        <div class="cl-item" data-i="${i}">
          <input type="checkbox" data-act="done"${it.done ? ' checked' : ''}>
          <input type="text" data-act="text" value="${esc(it.text)}" placeholder="할 일">
          <button class="ghost del" data-act="del" aria-label="삭제">✕</button>
        </div>`).join('')}</div>
      <button class="ghost" id="cl-add" style="margin-top:4px">+ 항목 추가</button>
    </div>

    <div class="field">
      <label>메모</label>
      <textarea data-f="notes" placeholder="세부 내용, 참고 링크 등">${esc(t.notes)}</textarea>
    </div>

    <div class="editor-foot">
      <button class="ghost" id="btn-duplicate">복제</button>
      <button class="danger" id="btn-delete">삭제</button>
    </div>`;

  const box = $('#editor');

  bindFields(box, t, {
    dates: ['startDate', 'dueDate'],
    numbers: ['estimateHours', 'spentHours'],
    nullable: ['projectId'],
    onChange: (f) => {
      // 소속 프로젝트가 바뀌면 맞춰둔 날짜도 새 프로젝트 기준으로 다시 잡는다.
      if (f === 'projectId') { syncTaskDates(t); commit(); renderEditor(); }
      if (f === 'title' || f === 'dueDate' || f === 'startDate' || f === 'projectId') renderTasks();
    },
  });

  // 반복 주기 전환 (안 함 / 매일 / 매주 / 매월)
  const freqSeg = box.querySelector('.seg[data-f=repeatFreq]');
  freqSeg.addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    const v = b.dataset.v;
    t.repeat = v ? {
      freq: v,
      interval: t.repeat ? t.repeat.interval || 1 : 1,
      weekdays: v === 'weekly' && t.dueDate ? [T.fromISO(t.dueDate).getDay()] : [],
      monthDay: v === 'monthly' && t.dueDate ? T.fromISO(t.dueDate).getDate() : null,
      until: t.repeat ? t.repeat.until : null,
    } : null;
    if (!t.repeat) t.doneDates = [];      // 반복을 끄면 회차 기록도 의미가 없다
    touch(t); commit();
    renderEditor(); renderTasks();
  });

  // 반복 세부 설정
  box.querySelectorAll('[data-r]').forEach((el) => {
    const f = el.dataset.r;
    el.addEventListener(el.type === 'date' ? 'change' : 'input', (e) => {
      const v = e.target.value;
      if (f === 'until') t.repeat.until = v || null;
      else t.repeat[f] = v === '' ? null : Math.max(1, Number(v));
      touch(t); commit();
      renderEditor(); renderTasks();
    });
  });

  // 매주 반복의 요일 선택
  const wdays = box.querySelector('.wdays');
  if (wdays) {
    wdays.addEventListener('click', (e) => {
      const b = e.target.closest('[data-wd]');
      if (!b) return;
      const i = Number(b.dataset.wd);
      const cur = new Set(t.repeat.weekdays && t.repeat.weekdays.length
        ? t.repeat.weekdays
        : (t.dueDate ? [T.fromISO(t.dueDate).getDay()] : []));
      if (cur.has(i)) cur.delete(i); else cur.add(i);
      if (cur.size === 0) return;          // 최소 하나는 남긴다
      t.repeat.weekdays = [...cur].sort((a, b2) => a - b2);
      touch(t); commit();
      renderEditor(); renderTasks();
    });
  }

  // 회차별 완료 표시
  box.querySelectorAll('[data-occ]').forEach((el) => {
    el.addEventListener('change', (e) => {
      const iso = el.dataset.occ;
      const set = new Set(t.doneDates || []);
      if (e.target.checked) set.add(iso); else set.delete(iso);
      t.doneDates = [...set].sort();
      touch(t); commit();
      renderTasks();
    });
  });

  // "프로젝트에 맞춤" — 시작일과 마감일을 따로 켜고 끌 수 있다.
  box.querySelectorAll('[data-follow]').forEach((el) => {
    el.addEventListener('change', (e) => {
      const which = el.dataset.follow;
      if (which === 'start') t.followProjectStart = e.target.checked;
      else t.followProjectDue = e.target.checked;
      syncTaskDates(t);
      t.updatedAt = new Date().toISOString();
      commit();
      renderEditor(); renderTasks();
    });
  });

  // 진척률 슬라이더
  box.querySelector('[data-f=progress]').addEventListener('input', (e) => {
    t.progress = Number(e.target.value);
    $('#pct-val').textContent = `${t.progress}%`;
    t.updatedAt = new Date().toISOString();
    commit();
  });

  // 우선순위 / 상태
  box.querySelectorAll('.seg').forEach((seg) => {
    const f = seg.dataset.f;
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (!b) return;
      t[f] = b.dataset.v;
      if (f === 'status' && t.status === 'done') t.progress = 100;   // 완료면 진척률도 채운다
      t.updatedAt = new Date().toISOString();
      commit();
      renderEditor(); renderTasks();
    });
  });

  // 체크리스트
  box.querySelectorAll('.cl-item').forEach((row) => {
    const i = Number(row.dataset.i);
    row.querySelector('[data-act=done]').addEventListener('change', (e) => {
      t.checklist[i].done = e.target.checked; commit(); renderTasks();
    });
    row.querySelector('[data-act=text]').addEventListener('input', (e) => {
      t.checklist[i].text = e.target.value; commit();
    });
    row.querySelector('[data-act=del]').addEventListener('click', () => {
      t.checklist.splice(i, 1); commit(); renderEditor();
    });
  });
  $('#cl-add').addEventListener('click', () => {
    t.checklist.push({ id: T.uid(), text: '', done: false });
    commit(); renderEditor();
    const items = $('#editor').querySelectorAll('.cl-item [data-act=text]');
    if (items.length) items[items.length - 1].focus();
  });

  $('#btn-duplicate').addEventListener('click', () => {
    const copy = JSON.parse(JSON.stringify(t));
    copy.id = T.uid();
    copy.title = `${t.title} (복사본)`;
    copy.checklist = (copy.checklist || []).map((i) => ({ ...i, id: T.uid() }));
    copy.doneDates = [];          // 회차 완료 기록은 복제하지 않는다
    copy.createdAt = copy.updatedAt = new Date().toISOString();
    data.tasks.push(copy);
    sel = { kind: 'task', id: copy.id };
    commit('복제했습니다.');
    renderAll();
  });

  $('#btn-delete').addEventListener('click', () => {
    if (!confirm(`"${t.title || '(제목 없음)'}" 일정을 삭제할까요?`)) return;
    data.tasks = data.tasks.filter((x) => x.id !== t.id);
    sel = null;
    commit('삭제했습니다.');
    renderAll();
  });
}

/** 반복 세부 설정: 간격 / (매주) 요일 / 종료일 */
function repeatDetailHTML(t) {
  const r = t.repeat;
  const f = T.REPEAT_FREQS.find((x) => x.id === r.freq);
  const anchorDay = t.dueDate ? T.fromISO(t.dueDate).getDay() : 0;
  const picked = r.weekdays && r.weekdays.length ? r.weekdays : [anchorDay];

  return `
    <div class="repeat-box">
      <div class="repeat-row">
        <span class="rl">간격</span>
        <input type="number" min="1" max="30" data-r="interval" value="${r.interval || 1}">
        <span class="rl">${f ? f.unit : ''}마다</span>
      </div>

      ${r.freq === 'weekly' ? `
      <div class="repeat-row">
        <span class="rl">요일</span>
        <div class="wdays">
          ${T.WEEKDAYS.map((w, i) =>
            `<button data-wd="${i}" class="${picked.includes(i) ? 'is-on' : ''}">${w}</button>`).join('')}
        </div>
      </div>` : ''}

      ${r.freq === 'monthly' ? `
      <div class="repeat-row">
        <span class="rl">며칠</span>
        <input type="number" min="1" max="31" data-r="monthDay"
               value="${r.monthDay || (t.dueDate ? T.fromISO(t.dueDate).getDate() : 1)}">
        <span class="rl">일 (없는 달은 말일)</span>
      </div>` : ''}

      <div class="repeat-row">
        <span class="rl">종료</span>
        <input type="date" data-r="until" value="${esc(r.until || '')}">
        <span class="rl">비우면 계속</span>
      </div>

      <div class="repeat-summary">${esc(T.repeatLabel(t))} — 마감일(${esc(t.dueDate || '미정')})부터 시작합니다.</div>
    </div>`;
}

/** 최근·다가오는 회차를 체크박스로 보여준다. 회차별로 따로 완료 표시한다. */
function occurrenceListHTML(t) {
  const today = T.todayISO();
  const list = T.occurrencesBetween(t, T.addDays(today, -14), T.addDays(today, 35), 12);
  if (!list.length) {
    return '<div class="field"><label>회차</label><div class="hint">마감일을 정하면 회차가 잡힙니다.</div></div>';
  }
  return `<div class="field">
    <label>회차별 완료</label>
    <div class="occ-list">${list.map((iso) => {
      const done = T.isOccurrenceDone(t, iso);
      const past = iso < today;
      return `<label class="occ${iso === today ? ' is-today' : ''}${past && !done ? ' is-late' : ''}">
        <input type="checkbox" data-occ="${iso}"${done ? ' checked' : ''}>
        <span>${esc(T.formatDate(iso))}</span>
        ${iso === today ? '<b>오늘</b>' : ''}
      </label>`;
    }).join('')}</div>
  </div>`;
}

/**
 * data-f 를 가진 입력들을 대상 객체에 묶는다.
 * 텍스트는 input, 날짜/셀렉트는 change 에 반응하고 빈 값은 null 로 저장한다.
 */
function bindFields(box, obj, opt) {
  const o = opt || {};
  box.querySelectorAll('[data-f]').forEach((el) => {
    const f = el.dataset.f;
    if (el.classList.contains('seg') || el.classList.contains('swatches')) return;
    if (el.type === 'range') return;

    if (el.type === 'checkbox') {
      el.addEventListener('change', (e) => {
        obj[f] = e.target.checked;
        obj.updatedAt = new Date().toISOString();
        commit();
        if (o.onChange) o.onChange(f);
      });
      return;
    }

    const ev = el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input';
    el.addEventListener(ev, (e) => {
      const v = e.target.value;
      if ((o.numbers || []).includes(f)) obj[f] = v === '' ? null : Number(v);
      else if ((o.dates || []).includes(f) || (o.nullable || []).includes(f)) obj[f] = v || null;
      else obj[f] = v;
      obj.updatedAt = new Date().toISOString();
      commit();
      if (o.onChange) o.onChange(f);
    });
  });
}

/* ---------- 내보내기 / 가져오기 ---------- */

function download(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('#btn-export').addEventListener('click', () => {
  download(`tracking-backup-${T.todayISO()}.json`, JSON.stringify(data, null, 2));
  toast('백업 파일을 내려받았습니다.');
});

/*
 * 게시.
 *
 * 로컬 게시 서버(node serve.js) 위에서 열렸다면 버튼 한 번으로
 * data.json 쓰기 → 커밋 → 푸시까지 서버가 처리한다.
 * GitHub Pages 등 그냥 정적으로 열린 경우엔 파일 다운로드로 되돌아간다.
 */
let localServer = null;

async function detectLocalServer() {
  try {
    const r = await fetch('/api/status', { cache: 'no-store' });
    if (!r.ok) return;
    const info = await r.json();
    if (!info.ok) return;
    localServer = info;
  } catch (e) {
    // 로컬 서버가 아닌 곳에서 열렸다 — 다운로드 방식으로 간다.
  }
  renderPublishMode();
}

function renderPublishMode() {
  const btn = $('#btn-publish');
  const badge = $('#mode');
  if (localServer) {
    btn.textContent = '게시';
    btn.title = 'data.json 을 커밋하고 푸시합니다';
    badge.textContent = '로컬 게시 서버 연결됨';
    badge.dataset.state = 'live';
  } else {
    btn.textContent = '게시용 파일 내보내기';
    btn.title = 'data.json 을 내려받아 직접 저장소에 올려야 합니다';
    badge.textContent = '';
    badge.dataset.state = '';
  }
}

$('#btn-publish').addEventListener('click', async () => {
  data.publishedAt = new Date().toISOString();
  data.sample = false;   // 저장소에 들어있던 샘플 표시를 지운다
  commit();

  if (!localServer) {
    download('data.json', JSON.stringify(data, null, 2));
    showPublishNote();
    return;
  }

  const btn = $('#btn-publish');
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = '게시 중…';
  try {
    const r = await fetch('/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const out = await r.json();
    if (!out.ok) throw new Error(out.error || '알 수 없는 오류');
    toast(out.unchanged
      ? '지난 게시 이후 바뀐 내용이 없습니다.'
      : `게시했습니다 (${out.commit}). 1분 안에 조회 앱에 반영됩니다.`);
  } catch (e) {
    alert(`게시하지 못했습니다.\n\n${e.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
});

function showPublishNote() {
  const old = document.querySelector('#publish-guide');
  if (old) old.remove();
  const note = document.createElement('div');
  note.id = 'publish-guide';
  note.className = 'publish-note';
  note.innerHTML =
    '<b>data.json</b> 을 내려받았습니다. 저장소 최상단에 덮어쓰고 커밋·푸시하면 ' +
    '조회 앱에 반영됩니다.<br>' +
    '버튼 한 번으로 끝내려면 저장소에서 <code>node serve.js</code> 를 띄우고 ' +
    '<code>localhost:8765/input/</code> 로 여세요.';
  $('#editor').prepend(note);
}

$('#btn-import').addEventListener('click', () => $('#file-input').click());
$('#file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const incoming = T.migrate(JSON.parse(await file.text()));
    if (!confirm(`현재 데이터를 이 파일의 내용으로 교체합니다.\n일정 ${incoming.tasks.length}건 · 프로젝트 ${incoming.projects.length}개\n계속할까요?`)) return;
    data = incoming;
    sel = null;
    commit('가져왔습니다.');
    renderAll();
  } catch (err) {
    alert(`파일을 읽지 못했습니다: ${err.message}`);
  } finally {
    e.target.value = '';
  }
});

/* ---------- ---------- */

function renderAll() { renderProjects(); renderTasks(); renderEditor(); }

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

renderAll();
stampSaved();
detectLocalServer();

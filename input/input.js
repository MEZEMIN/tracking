/* 입력 앱 - localStorage 에 저장하고, 게시용 data.json 을 내보낸다. */

const T = window.Tracking;
const $ = (s) => document.querySelector(s);

let data = T.loadLocal();
let selectedId = null;
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

/* ---------- 프로젝트 ---------- */

function renderProjects() {
  const box = $('#project-list');
  if (!data.projects.length) {
    box.innerHTML = '<div style="color:var(--text-3);font-size:13px;padding:4px 0">아직 프로젝트가 없습니다.</div>';
    return;
  }
  box.innerHTML = data.projects.map((p, i) => `
    <div class="prow" data-i="${i}">
      <button class="swatch" data-act="color" style="background:${esc(p.color)}" aria-label="색상 변경"></button>
      <input type="text" data-act="name" value="${esc(p.name)}" placeholder="프로젝트 이름">
      <button class="ghost" data-act="del" aria-label="삭제">✕</button>
    </div>`).join('');

  box.querySelectorAll('.prow').forEach((row) => {
    const i = Number(row.dataset.i);
    row.querySelector('[data-act=name]').addEventListener('input', (e) => {
      data.projects[i].name = e.target.value;
      commit();
      renderTasks();
    });
    row.querySelector('[data-act=color]').addEventListener('click', () => openSwatches(row, i));
    row.querySelector('[data-act=del]').addEventListener('click', () => {
      const used = data.tasks.filter((t) => t.projectId === data.projects[i].id).length;
      const q = used
        ? `"${data.projects[i].name}" 프로젝트를 삭제할까요? 업무 ${used}건은 남고 프로젝트만 해제됩니다.`
        : `"${data.projects[i].name}" 프로젝트를 삭제할까요?`;
      if (!confirm(q)) return;
      const id = data.projects[i].id;
      data.tasks.forEach((t) => { if (t.projectId === id) t.projectId = null; });
      data.projects.splice(i, 1);
      commit();
      renderAll();
    });
  });
}

function openSwatches(row, i) {
  const exist = row.nextElementSibling;
  if (exist && exist.classList.contains('swatches')) { exist.remove(); return; }
  const bar = document.createElement('div');
  bar.className = 'swatches';
  bar.innerHTML = T.PROJECT_COLORS.map((c) =>
    `<button style="background:${c}" data-c="${c}" aria-label="${c}"></button>`).join('');
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    data.projects[i].color = b.dataset.c;
    commit();
    renderAll();
  });
  row.after(bar);
}

$('#btn-add-project').addEventListener('click', () => {
  const used = data.projects.length;
  data.projects.push({
    id: T.uid(),
    name: `프로젝트 ${used + 1}`,
    color: T.PROJECT_COLORS[used % T.PROJECT_COLORS.length],
  });
  commit();
  renderAll();
});

/* ---------- 업무 목록 ---------- */

function renderTasks() {
  const box = $('#task-list');
  const list = T.sortTasks(data.tasks.filter((t) => !(hideDone && t.status === 'done')));
  if (!list.length) {
    box.innerHTML = '<div style="color:var(--text-3);font-size:13px;padding:8px 0">표시할 업무가 없습니다.</div>';
    return;
  }
  box.innerHTML = list.map((t) => {
    const p = T.projectOf(data, t);
    return `<button class="trow${t.id === selectedId ? ' is-on' : ''}${t.status === 'done' ? ' is-done' : ''}" data-id="${esc(t.id)}">
      <i class="dot" style="background:${esc(p ? p.color : 'var(--border-strong)')}"></i>
      <span class="t">${esc(t.title || '(제목 없음)')}</span>
      <span class="dday" data-tone="${T.ddayTone(t.dueDate, t.status)}">${T.ddayLabel(t.dueDate)}</span>
    </button>`;
  }).join('');
  box.querySelectorAll('.trow').forEach((b) => {
    b.addEventListener('click', () => { selectedId = b.dataset.id; renderAll(); });
  });
}

$('#hide-done').addEventListener('change', (e) => { hideDone = e.target.checked; renderTasks(); });

$('#btn-add-task').addEventListener('click', () => {
  const t = {
    id: T.uid(),
    title: '',
    projectId: data.projects[0] ? data.projects[0].id : null,
    priority: 'mid',
    status: 'todo',
    progress: 0,
    startDate: null,
    dueDate: null,
    estimateHours: null,
    spentHours: null,
    notes: '',
    checklist: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  data.tasks.push(t);
  selectedId = t.id;
  commit();
  renderAll();
  const el = $('#editor input[data-f=title]');
  if (el) el.focus();
});

/* ---------- 편집 폼 ---------- */

function current() { return data.tasks.find((t) => t.id === selectedId) || null; }

function renderEditor() {
  const t = current();
  const box = $('#editor');
  if (!t) {
    box.innerHTML = '<div class="empty">왼쪽에서 업무를 고르거나 <b>새 업무</b>를 눌러 시작하세요.</div>';
    return;
  }
  const pct = T.effectiveProgress(t);

  box.innerHTML = `
    <div class="field">
      <input class="title-input" type="text" data-f="title" value="${esc(t.title)}" placeholder="업무 제목">
    </div>

    <div class="field-row">
      <div class="field">
        <label>프로젝트</label>
        <select data-f="projectId">
          <option value="">(없음)</option>
          ${data.projects.map((p) =>
            `<option value="${esc(p.id)}"${p.id === t.projectId ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>우선순위</label>
        <div class="seg" data-f="priority">
          ${T.PRIORITIES.map((p) =>
            `<button data-v="${p.id}" class="${p.id === t.priority ? 'is-on' : ''}">${p.label}</button>`).join('')}
        </div>
      </div>
    </div>

    <div class="field">
      <label>상태</label>
      <div class="seg" data-f="status">
        ${T.STATUSES.map((s) =>
          `<button data-v="${s.id}" class="${s.id === t.status ? 'is-on' : ''}">${s.label}</button>`).join('')}
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
        <label>시작일</label>
        <input type="date" data-f="startDate" value="${esc(t.startDate || '')}">
      </div>
      <div class="field">
        <label>마감일 (D-Day 기준)</label>
        <input type="date" data-f="dueDate" value="${esc(t.dueDate || '')}">
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

  bindEditor(t);
}

function bindEditor(t) {
  const box = $('#editor');
  const touch = () => { t.updatedAt = new Date().toISOString(); };

  // 텍스트/날짜/숫자 필드
  box.querySelectorAll('[data-f]').forEach((el) => {
    const f = el.dataset.f;
    if (el.classList.contains('seg')) return;

    if (el.type === 'range') {
      el.addEventListener('input', (e) => {
        t.progress = Number(e.target.value);
        $('#pct-val').textContent = `${t.progress}%`;
        touch(); commit();
      });
      el.addEventListener('change', renderTasks);
      return;
    }

    const ev = el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input';
    el.addEventListener(ev, (e) => {
      const v = e.target.value;
      if (f === 'estimateHours' || f === 'spentHours') {
        t[f] = v === '' ? null : Number(v);
      } else if (f === 'startDate' || f === 'dueDate' || f === 'projectId') {
        t[f] = v || null;
      } else {
        t[f] = v;
      }
      touch(); commit();
      if (f === 'title' || f === 'dueDate' || f === 'projectId') renderTasks();
    });
  });

  // 세그먼트 버튼 (우선순위 / 상태)
  box.querySelectorAll('.seg').forEach((seg) => {
    const f = seg.dataset.f;
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (!b) return;
      t[f] = b.dataset.v;
      // 완료로 바꾸면 진척률도 100%로 맞춰준다.
      if (f === 'status' && t.status === 'done') t.progress = 100;
      touch(); commit();
      renderEditor(); renderTasks();
    });
  });

  // 체크리스트
  box.querySelectorAll('.cl-item').forEach((row) => {
    const i = Number(row.dataset.i);
    row.querySelector('[data-act=done]').addEventListener('change', (e) => {
      t.checklist[i].done = e.target.checked; touch(); commit(); renderTasks();
    });
    row.querySelector('[data-act=text]').addEventListener('input', (e) => {
      t.checklist[i].text = e.target.value; touch(); commit();
    });
    row.querySelector('[data-act=del]').addEventListener('click', () => {
      t.checklist.splice(i, 1); touch(); commit(); renderEditor();
    });
  });
  $('#cl-add').addEventListener('click', () => {
    t.checklist.push({ id: T.uid(), text: '', done: false });
    touch(); commit(); renderEditor();
    const items = box.querySelectorAll('.cl-item [data-act=text]');
    if (items.length) items[items.length - 1].focus();
  });

  $('#btn-duplicate').addEventListener('click', () => {
    const copy = JSON.parse(JSON.stringify(t));
    copy.id = T.uid();
    copy.title = `${t.title} (복사본)`;
    copy.checklist = (copy.checklist || []).map((i) => ({ ...i, id: T.uid() }));
    copy.createdAt = copy.updatedAt = new Date().toISOString();
    data.tasks.push(copy);
    selectedId = copy.id;
    commit('복제했습니다.');
    renderAll();
  });

  $('#btn-delete').addEventListener('click', () => {
    if (!confirm(`"${t.title || '(제목 없음)'}" 업무를 삭제할까요?`)) return;
    data.tasks = data.tasks.filter((x) => x.id !== t.id);
    selectedId = null;
    commit('삭제했습니다.');
    renderAll();
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

$('#btn-publish').addEventListener('click', () => {
  data.publishedAt = new Date().toISOString();
  data.sample = false;   // 저장소에 들어있던 샘플 표시를 지운다
  commit();
  download('data.json', JSON.stringify(data, null, 2));
  showPublishNote();
});

function showPublishNote() {
  const old = document.querySelector('.publish-note');
  if (old) old.remove();
  const note = document.createElement('div');
  note.className = 'publish-note';
  note.innerHTML =
    '<b>data.json</b> 을 내려받았습니다. 저장소 최상단에 덮어쓰고 커밋·푸시하면 ' +
    '조회 앱에 반영됩니다.<br>' +
    '<code>cp ~/Downloads/data.json .</code> → ' +
    '<code>git add data.json &amp;&amp; git commit -m "업무 현황 갱신" &amp;&amp; git push</code>';
  $('#editor').prepend(note);
}

$('#btn-import').addEventListener('click', () => $('#file-input').click());
$('#file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const incoming = T.migrate(JSON.parse(await file.text()));
    if (!confirm(`현재 데이터를 이 파일의 내용으로 교체합니다.\n업무 ${incoming.tasks.length}건 · 프로젝트 ${incoming.projects.length}개\n계속할까요?`)) return;
    data = incoming;
    selectedId = null;
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

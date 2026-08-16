// pandas Refresher UI: routing, editor, lesson rendering, and the run/check flow.

import { loadLessons, SCHEMA_REF, PLAYGROUND_SNIPPETS } from './lessons.js';
import { initEngine, resetData, runCode, compareResults } from './engine.js';

const $ = (sel) => document.querySelector(sel);

let LESSONS = [];

// ---------------------------------------------------------------- storage ---

const store = {
  get(key) {
    try { return localStorage.getItem('pandasref.' + key); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem('pandasref.' + key, value); } catch { /* private mode */ }
  },
};

const progress = new Set(JSON.parse(store.get('progress') || '[]'));
const saveProgress = () => store.set('progress', JSON.stringify([...progress]));

// ------------------------------------------------------ syntax highlighting ---

const KEYWORDS = new Set(`and as assert async await break class continue def del elif
  else except finally for from global if import in is lambda nonlocal not or pass raise
  return try while with yield match case`.split(/\s+/).filter(Boolean));
const CONSTS = new Set(['True', 'False', 'None']);
const BUILTINS = new Set(`pd np print len range sum min max sorted list dict set tuple
  abs round map filter zip enumerate str int float bool type isinstance`.split(/\s+/).filter(Boolean));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function highlight(src) {
  // comment | string (triple/single/double) | number | word | whitespace | other
  const re = /(#[^\n]*)|('''[\s\S]*?(?:'''|$)|"""[\s\S]*?(?:"""|$)|'(?:\\.|[^'\\\n])*'?|"(?:\\.|[^"\\\n])*"?)|(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(\s+)|([\s\S])/y;
  let out = '';
  let m;
  while ((m = re.exec(src)) !== null) {
    const [tok, comment, str, num, word, ws] = m;
    if (comment) out += `<span class="t-c">${esc(tok)}</span>`;
    else if (str) out += `<span class="t-s">${esc(tok)}</span>`;
    else if (num) out += `<span class="t-n">${esc(tok)}</span>`;
    else if (word) {
      if (KEYWORDS.has(word)) out += `<span class="t-k">${esc(tok)}</span>`;
      else if (CONSTS.has(word)) out += `<span class="t-cn">${esc(tok)}</span>`;
      else if (BUILTINS.has(word)) out += `<span class="t-f">${esc(tok)}</span>`;
      else out += esc(tok);
    } else if (ws) out += tok;
    else out += esc(tok);
    if (tok.length === 0) break; // safety
  }
  return out;
}

// ---------------------------------------------------------------- editor ---

function makeEditor(root, { getKey, onRun }) {
  const textarea = root.querySelector('textarea');
  const code = root.querySelector('code');

  const paint = () => {
    code.innerHTML = highlight(textarea.value) + '\n';
  };
  root.classList.add('hl-on');

  textarea.addEventListener('input', () => {
    paint();
    store.set('code.' + getKey(), textarea.value);
  });
  textarea.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onRun();
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      textarea.setRangeText('    ', textarea.selectionStart, textarea.selectionEnd, 'end');
      paint();
    }
  });

  return {
    get value() { return textarea.value; },
    set value(v) { textarea.value = v; paint(); },
    load() { this.value = store.get('code.' + getKey()) ?? ''; },
    focus() { textarea.focus({ preventScroll: true }); },
  };
}

// ---------------------------------------------------------------- results ---

function renderResultTable(res) {
  if (res.kind === 'none') {
    return '<p class="tbl-note">Ran fine — but your code didn’t end in an expression, so there’s no value to show.</p>';
  }
  const numeric = res.columns.map((_, c) =>
    res.rows.length > 0 &&
    res.rows.every((r) => r[c] === null || /^-?[\d.]/.test(r[c])) &&
    res.rows.some((r) => r[c] !== null)
  );
  const head = res.columns
    .map((c, i) => `<th${numeric[i] ? ' class="num"' : ''}>${esc(c)}</th>`)
    .join('');
  const body = res.rows
    .map(
      (row) =>
        '<tr>' +
        row
          .map((cell, i) =>
            cell === null
              ? `<td class="null${numeric[i] ? ' num' : ''}">NaN</td>`
              : `<td${numeric[i] ? ' class="num"' : ''}>${esc(cell)}</td>`
          )
          .join('') +
        '</tr>'
    )
    .join('');
  const note = res.truncated
    ? `<p class="tbl-note">Showing the first ${res.rows.length.toLocaleString()} of ${res.numRows.toLocaleString()} rows.</p>`
    : '';
  const empty = res.numRows === 0 ? '<p class="tbl-note">Empty result — no rows.</p>' : '';
  return `<div class="tbl-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>${empty}${note}`;
}

function statusLine(res) {
  const kindWord = { dataframe: 'DataFrame', series: 'Series', scalar: 'scalar', array: 'array', none: '—' }[res.kind] || res.kind;
  const rows = res.kind === 'scalar' || res.kind === 'none'
    ? kindWord
    : `${kindWord} · ${res.numRows.toLocaleString()} ${res.numRows === 1 ? 'row' : 'rows'}`;
  return `${rows} · ${res.ms < 1 ? '<1' : Math.round(res.ms)} ms`;
}

// ---------------------------------------------------------------- state ---

const state = {
  view: 0,            // lesson index, or 'playground'
  ready: false,
  running: false,
  lastExpected: null,
  feedback: null,     // 'ok' | 'warn' | 'err' | null (for tests)
};

// ---------------------------------------------------------------- header ---

function updateProgressUI() {
  $('#progress-pill').textContent = `${progress.size} / ${LESSONS.length}`;
  $('#progress-fill').style.width = `${(progress.size / LESSONS.length) * 100}%`;
  document.querySelectorAll('#lesson-list li').forEach((li, i) => {
    li.classList.toggle('done', progress.has(LESSONS[i].id));
  });
}

function setEngineStatus(html, kind) {
  const el = $('#engine-status');
  el.innerHTML = html;
  el.className = kind ? 'engine-' + kind : '';
  el.hidden = !html;
}

// ---------------------------------------------------------------- sidebar ---

function buildSidebar() {
  const list = $('#lesson-list');
  list.innerHTML = LESSONS.map(
    (l, i) => `
    <li><button data-goto="${i}">
      <span class="lnum">${i + 1}</span>
      <span class="ltitle">${esc(l.title)}</span>
      <span class="tick" aria-hidden="true">✓</span>
    </button></li>`
  ).join('');

  $('#schema-ref').innerHTML = SCHEMA_REF.map(
    (t) => `
    <details>
      <summary><code>${t.frame}</code> <span class="dim">· ${t.rows} rows</span></summary>
      <ul class="cols">${t.columns
        .map(([n, ty]) => `<li><code>${n}</code> <span class="dim">${esc(ty)}</span></li>`)
        .join('')}</ul>
      <p class="dim note">${esc(t.note)}</p>
    </details>`
  ).join('');

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-goto]');
    if (btn) gotoView(Number(btn.dataset.goto));
  });
  $('#goto-playground').addEventListener('click', () => gotoView('playground'));
  $('#reset-data').addEventListener('click', onResetData);
}

async function onResetData() {
  if (!state.ready || state.running) return;
  const btn = $('#reset-data');
  btn.disabled = true;
  try {
    await resetData();
    btn.textContent = '✓ Sample data restored';
  } catch {
    btn.textContent = 'Reset failed — reload the page';
  }
  setTimeout(() => {
    btn.textContent = '↺ Reset sample data';
    btn.disabled = false;
  }, 1600);
}

function setNavOpen(open) {
  document.body.classList.toggle('nav-open', open);
}

// ---------------------------------------------------------------- routing ---

function gotoView(view) {
  const hash = view === 'playground' ? '#playground' : `#${view + 1}`;
  if (location.hash !== hash) {
    history.pushState(null, '', hash);
  }
  render();
  setNavOpen(false);
  window.scrollTo(0, 0);
}

function viewFromHash() {
  const h = location.hash.slice(1);
  if (h === 'playground') return 'playground';
  const n = parseInt(h, 10);
  if (Number.isInteger(n) && n >= 1 && n <= LESSONS.length) return n - 1;
  return null;
}

// ---------------------------------------------------------------- lesson view ---

let lessonEditor, playgroundEditor;

function render() {
  const view = viewFromHash() ?? state.view;
  state.view = view;
  state.feedback = null;
  state.lastExpected = null;
  store.set('last', typeof view === 'number' ? String(view) : view);

  const isLesson = typeof view === 'number';
  $('#lesson-view').hidden = !isLesson;
  $('#playground-view').hidden = isLesson;
  document.querySelectorAll('#lesson-list li').forEach((li, i) => {
    li.classList.toggle('active', isLesson && i === view);
  });
  $('#goto-playground').classList.toggle('active', !isLesson);

  if (!isLesson) {
    playgroundEditor.load();
    if (!playgroundEditor.value.trim()) {
      playgroundEditor.value = 'deals.head()';
    }
    return;
  }

  const lesson = LESSONS[view];
  $('#crumb').textContent = `Lesson ${view + 1} of ${LESSONS.length} · ${lesson.difficulty}`;
  $('#lesson-title').textContent = lesson.title;
  $('#prev-btn').disabled = view === 0;
  $('#next-btn').disabled = view === LESSONS.length - 1;

  $('#concept').innerHTML = lesson.concept_blocks
    .map((b, bi) =>
      b.kind === 'html'
        ? `<div class="prose">${b.html}</div>`
        : `<div class="example">
             <pre class="code"><code>${highlight(b.code)}</code></pre>
             <button class="try" data-ex="${bi}">▸ Run this example</button>
           </div>`
    )
    .join('');
  $('#task-body').innerHTML = lesson.task_html;
  $('#hint-box').hidden = true;
  $('#hint-box').textContent = '';
  $('#solution-box').hidden = true;
  $('#feedback').innerHTML = '';
  $('#results').innerHTML = '';
  $('#run-status').textContent = '';

  lessonEditor.load();
}

// Run pandas in the lesson view. check=false is used by "Run this example"
// buttons so exploratory runs don't get graded.
async function runLesson(src, { check } = { check: true }) {
  if (!state.ready || state.running) return;
  const lesson = LESSONS[state.view];
  const feedback = $('#feedback');
  const results = $('#results');
  const runStatus = $('#run-status');

  if (!src.trim()) {
    state.feedback = 'warn';
    feedback.innerHTML = `<div class="fb fb-warn">Write some pandas first — or hit a “Run this example” button above.</div>`;
    return;
  }

  state.running = true;
  $('#run-btn').classList.add('busy');
  try {
    const res = await runCode(src);
    runStatus.textContent = statusLine(res);
    results.innerHTML = renderResultTable(res);

    if (!check) {
      state.feedback = null;
      feedback.innerHTML = '';
      return;
    }

    if (res.kind === 'none') {
      state.feedback = 'warn';
      feedback.innerHTML = `<div class="fb fb-warn">Your code ran, but it didn’t produce a value to grade. End with a bare expression — no <code>print()</code>, no <code>result =</code>.</div>`;
      return;
    }

    let expected = null;
    try {
      expected = await runCode(lesson.solution);
    } catch {
      state.feedback = 'warn';
      feedback.innerHTML = `<div class="fb fb-warn">The sample frames look modified, so this exercise can’t be checked. Use <em>Reset sample data</em> in the menu, then try again.</div>`;
      return;
    }
    state.lastExpected = expected;

    const cmp = compareResults(res.canon, expected.canon, lesson.order_matters);
    if (cmp.pass) {
      const first = !progress.has(lesson.id);
      progress.add(lesson.id);
      saveProgress();
      updateProgressUI();
      const last = state.view === LESSONS.length - 1;
      const allDone = progress.size === LESSONS.length;
      state.feedback = 'ok';
      feedback.innerHTML = `
        <div class="fb fb-ok${first ? ' pop' : ''}">
          <div class="fb-line"><span class="big-tick">✓</span> <strong>Correct!</strong>
          ${last ? (allDone ? ` That’s all ${LESSONS.length} — you finished the refresher! 🎉 The playground is all yours.` : ' That’s the capstone done!') : ''}</div>
          ${last
            ? `<button class="btn primary" data-goto-play>⚡ Open the playground</button>`
            : `<button class="btn primary" data-next>Next lesson →</button>`}
        </div>`;
    } else {
      state.feedback = 'warn';
      feedback.innerHTML = `
        <div class="fb fb-warn">
          <div class="fb-line">Not the expected result yet — ${esc(cmp.reason)}</div>
          <div class="fb-actions">
            <button class="btn small" data-show-hint>💡 Hint</button>
            <button class="btn small" data-show-expected>Show expected result</button>
            <button class="btn small" data-show-solution>Reveal solution</button>
          </div>
          <div id="expected-box" hidden></div>
        </div>`;
    }
  } catch (err) {
    state.feedback = 'err';
    runStatus.textContent = '';
    results.innerHTML = '';
    feedback.innerHTML = `
      <div class="fb fb-err">
        <strong>Python error</strong>
        <pre>${esc(err && err.message ? err.message : err)}</pre>
      </div>`;
  } finally {
    state.running = false;
    $('#run-btn').classList.remove('busy');
  }
}

function showHint() {
  const box = $('#hint-box');
  // Hints are authored with inline HTML (<code>…</code>, &mdash;, &rsquo;), so
  // render as HTML — matching the concept/task prose — not as literal text.
  box.innerHTML = '💡 ' + LESSONS[state.view].hint;
  box.hidden = false;
  box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function showSolution() {
  const box = $('#solution-box');
  const code = LESSONS[state.view].solution;
  box.innerHTML = `
    <div class="example">
      <pre class="code"><code>${highlight(code)}</code></pre>
      <button class="try" data-insert-solution>Insert into editor</button>
    </div>`;
  box.hidden = false;
}

// ---------------------------------------------------------------- playground ---

async function runPlayground(src) {
  if (!state.ready || state.running) return;
  const results = $('#pg-results');
  const runStatus = $('#pg-run-status');
  const feedback = $('#pg-feedback');
  if (!src.trim()) return;

  state.running = true;
  $('#pg-run-btn').classList.add('busy');
  try {
    const res = await runCode(src);
    runStatus.textContent = statusLine(res);
    feedback.innerHTML = '';
    results.innerHTML = renderResultTable(res);
    state.feedback = 'ok';
  } catch (err) {
    state.feedback = 'err';
    runStatus.textContent = '';
    results.innerHTML = '';
    feedback.innerHTML = `<div class="fb fb-err"><strong>Python error</strong><pre>${esc(err && err.message ? err.message : err)}</pre></div>`;
  } finally {
    state.running = false;
    $('#pg-run-btn').classList.remove('busy');
  }
}

function buildPlayground() {
  $('#pg-snippets').innerHTML = PLAYGROUND_SNIPPETS.map(
    (s, i) => `<button class="chip" data-snippet="${i}">${esc(s.label)}</button>`
  ).join('');
  $('#pg-snippets').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-snippet]');
    if (!btn) return;
    playgroundEditor.value = PLAYGROUND_SNIPPETS[Number(btn.dataset.snippet)].code;
    store.set('code.playground', playgroundEditor.value);
    runPlayground(playgroundEditor.value);
  });
}

// ---------------------------------------------------------------- boot ---

async function boot() {
  try {
    LESSONS = await loadLessons();
  } catch (err) {
    setEngineStatus(`Couldn’t load the lessons — ${esc(err && err.message ? err.message : err)}.`, 'err');
    return;
  }

  buildSidebar();
  buildPlayground();

  lessonEditor = makeEditor($('#lesson-editor'), {
    getKey: () => LESSONS[typeof state.view === 'number' ? state.view : 0].id,
    onRun: () => runLesson(lessonEditor.value),
  });
  playgroundEditor = makeEditor($('#playground-editor'), {
    getKey: () => 'playground',
    onRun: () => runPlayground(playgroundEditor.value),
  });

  $('#run-btn').addEventListener('click', () => runLesson(lessonEditor.value));
  $('#hint-btn').addEventListener('click', showHint);
  $('#solution-btn').addEventListener('click', showSolution);
  $('#pg-run-btn').addEventListener('click', () => runPlayground(playgroundEditor.value));
  $('#prev-btn').addEventListener('click', () => gotoView(Math.max(0, state.view - 1)));
  $('#next-btn').addEventListener('click', () => gotoView(Math.min(LESSONS.length - 1, state.view + 1)));
  $('#menu-btn').addEventListener('click', () => setNavOpen(!document.body.classList.contains('nav-open')));
  $('#scrim').addEventListener('click', () => setNavOpen(false));

  // Delegated clicks inside dynamic regions.
  document.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.ex !== undefined && typeof state.view === 'number') {
      const code = LESSONS[state.view].concept_blocks[Number(t.dataset.ex)].code;
      lessonEditor.value = code;
      store.set('code.' + LESSONS[state.view].id, code);
      runLesson(code, { check: false });
    } else if (t.hasAttribute('data-next')) {
      gotoView(state.view + 1);
    } else if (t.hasAttribute('data-goto-play')) {
      gotoView('playground');
    } else if (t.hasAttribute('data-show-hint')) {
      showHint();
    } else if (t.hasAttribute('data-show-solution')) {
      showSolution();
    } else if (t.hasAttribute('data-insert-solution')) {
      lessonEditor.value = LESSONS[state.view].solution;
      store.set('code.' + LESSONS[state.view].id, lessonEditor.value);
      lessonEditor.focus();
    } else if (t.hasAttribute('data-show-expected') && state.lastExpected) {
      const box = $('#expected-box');
      box.innerHTML = '<p class="tbl-note">Expected result:</p>' + renderResultTable(state.lastExpected);
      box.hidden = !box.hidden;
    }
  });

  window.addEventListener('hashchange', render);

  // Initial route: hash wins, then last visited, then lesson 1.
  if (viewFromHash() === null) {
    const last = store.get('last');
    const view = last === 'playground' ? 'playground' : Math.min(parseInt(last || '0', 10) || 0, LESSONS.length - 1);
    history.replaceState(null, '', view === 'playground' ? '#playground' : `#${view + 1}`);
  }
  render();
  updateProgressUI();

  // Start the engine.
  setEngineStatus('<span class="spin"></span> Starting the pandas engine… <span class="dim">(first visit downloads ~30 MB of Python + pandas)</span>', 'busy');
  try {
    await initEngine();
    state.ready = true;
    document.body.classList.add('db-ready');
    setEngineStatus('');
  } catch (err) {
    setEngineStatus(
      `Couldn’t start pandas — ${esc(err && err.message ? err.message : err)}.<br>
       This site needs a modern browser (Chrome 95+, Safari 15.2+, Firefox 100+).
       <button class="btn small" onclick="location.reload()">Retry</button>`,
      'err'
    );
  }
}

boot();

// Hooks used by the automated end-to-end test; harmless in normal use.
window.__pandasref = {
  get ready() { return state.ready; },
  get feedback() { return state.feedback; },
  get progressCount() { return progress.size; },
  get lessons() { return LESSONS; },
  goto: gotoView,
  setEditor(v) { (state.view === 'playground' ? playgroundEditor : lessonEditor).value = v; },
  run() { return state.view === 'playground' ? runPlayground(playgroundEditor.value) : runLesson(lessonEditor.value); },
  runCode,
};

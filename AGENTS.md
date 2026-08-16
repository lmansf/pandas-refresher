# Project agent memory

pandas-refresher is a single-page static site that teaches pandas through auto-graded
lessons running **real pandas in the browser via Pyodide** — no server, no build step.
It is a faithful port of the [SQL-refresher](https://github.com/lmansf/SQL-refresher);
when in doubt about UX or tone, match that repo.

## Architecture: the curriculum is data

- **`curriculum.json`** is the source of truth for the 20 lessons (10 beginner, 6 intermediate,
  4 advanced), in order. It is the validated spec bundle — **loaded as data, never inline-rewritten.**
  Each lesson: `id`, `title`, `difficulty`, `concept_blocks` (`{kind:"html",html}` prose +
  `{kind:"code",code}` runnable examples), `task_html`, `hint`, `solution` (reference snippet whose
  **last expression is the answer**), `order_matters`, `result_kind`, `result_shape`,
  `result_preview`, `alt_solutions`, `validation_notes`.
- **`seed.py`** is the canonical dataset — three DataFrames `customers`(15), `deals`(30), `reps`(5),
  a tiny CRM with real `datetime64` dates and `NaT` for open deals. It is fetched and `exec`'d in
  Pyodide to define `build_frames()`; the three frames are pre-loaded in the learner's namespace and
  **Reset** re-runs `build_frames()`.
- **`lessons.js`** loads `curriculum.json` and supplies the static schema sidebar + playground snippets.
- **`engine.js`** (the SQL-refresher's `db.js` analog): boots Pyodide, `loadPackage(['pandas'])`, seeds,
  `runCode(src)` → `{columns, rows, kind, numRows, truncated, ms, canon}`, `resetData()`, and
  `compareResults(got, expected, orderMatters)`.
- **`app.js`** + **`index.html`** + **`styles.css`**: routing, the Python editor (Tab = 4 spaces,
  ⌘/Ctrl+Enter runs), Run/Hint/Solution, graded feedback with expected-result reveal, Playground,
  progress pill/track + `localStorage`. `styles.css` is the SQL-refresher's, verbatim, plus one
  `.t-cn` token color for Python constants.

## Grading model — `grade.py` is the oracle

The canonical, language-agnostic grading rules live in **`grade.py`** (and prose in `docs/curriculum.md`).
`engine.js` reproduces them; for any lesson, its PASS/FAIL **must** match `grade.py`. Split of labor:

- **Value normalization runs in Python** inside Pyodide (`PY_BOOTSTRAP` in `engine.js` = grade.py's
  `_cell`/`kind_of`/`eval_last` verbatim). Re-deriving pandas dtype semantics in JS would drift, so real
  pandas produces the JSON-safe canonical form: `Timestamp`→`YYYY-MM-DD` (or with time if non-midnight),
  `NaN`/`NaT`→null, numpy scalar→primitive, float `9.0`→`9`, others rounded to 6 places.
- **Comparison runs in JS** (`compareResults`, ported from grade.py's `grade()`): compare by **values**,
  never identity. scalar = tolerant equality; Series = multiset of `(index,value)` pairs; DataFrame =
  column labels as a **set** + rows as a **multiset** of cells (order enforced only when `order_matters`);
  array = multiset. `order_matters` is true only for sort / top-N / indexing / capstone lessons.

Execution is Jupyter-style: the value of the **last expression** is the answer (fallback to a `result`
variable). No `print`, no `result =`.

## Version pin (matched set — do not split)

**Pyodide 0.27.7** → **pandas 2.2.3**, **numpy 2.0.2** (abi `2024_0`, cp312). Vendored in `vendor/`:
the runtime core (`pyodide.mjs`, `pyodide.asm.js`, `pyodide.asm.wasm`, `python_stdlib.zip`) + the pandas
dependency closure wheels (`numpy`, `pandas`, `python-dateutil`, `pytz`, `six`) + a **trimmed**
`pyodide-lock.json` listing only those 5 packages. Loaded with a local `indexURL: './vendor/'` — **no CDN
at runtime.** To bump, re-vendor from `https://cdn.jsdelivr.net/pyodide/v<V>/full/` and re-trim the lock:

```python
# resolve the pandas closure and trim the lock (run against the release's pyodide-lock.json)
import json
d = json.load(open('pyodide-lock.json')); pk = d['packages']
keep = set()
def add(n):
    k = n.lower().replace('_', '-')
    if k in keep or k not in pk: return
    keep.add(k); [add(x) for x in pk[k].get('depends', [])]
add('pandas')
json.dump({'info': d['info'], 'packages': {k: pk[k] for k in sorted(keep)}},
          open('vendor/pyodide-lock.json', 'w'), indent=1)
```

If a pandas bump changes any lesson's result_shape/kind, **do not silently edit lessons** — the
curriculum is validated; flag the divergence instead.

## Build / test / deploy

- **Run locally:** `python3 -m http.server 8000` (serve over HTTP; the engine uses `fetch`). No build step.
- **e2e:** `cd test && npm install && npm test` — Playwright boots the real site headless and asserts the
  engine starts, every lesson's `solution` grades PASS, and grading/errors/playground/reset/persistence/
  mobile behave. `CHROMIUM_PATH` overrides the browser binary.
- **CI:** `.github/workflows/ci.yml` runs that same e2e suite on every PR and on pushes to `fm/**`/`main`
  (`test/e2e.js` starts its own static server, so no separate web server is wired in CI).
- **Conformance oracle (offline):** `docs/curriculum.md` + `grade.py` + `revalidate.py` re-validate the
  curriculum against a pandas-2.2.3 venv (`revalidate.py` expects a `pyodenv/` sibling). Use it to confirm
  a lesson change still grades before trusting the browser.
- **Deploy:** static, zero-config on Vercel. `vercel.json` marks `/vendor/` immutable (1-year cache).
  Web Analytics is wired via the same-origin `<script defer src="/_vercel/insights/script.js">` tag in
  `index.html` (no npm package, no bundler — keeps the no-CDN/no-build design); it also **must be enabled
  in the Vercel dashboard** (Project → Analytics) for data to flow, and 404s harmlessly off Vercel.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.

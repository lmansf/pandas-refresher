# 🐼 pandas Refresher

An interactive refresher on pandas basics — 20 hands-on lessons that run **real pandas in your browser**. Powered by [Pyodide](https://pyodide.org): no server, no account, nothing leaves your device. Works great on a phone.

It's a faithful pandas port of the [SQL-refresher](https://github.com/lmansf/SQL-refresher) — same tiny CRM, same warm voice, same grade-by-result philosophy, DuckDB swapped for Pyodide and SQL for pandas.

## What you practice

Each lesson explains one idea, gives runnable examples, then grades your answer against a reference result (with hints, the expected output, and the solution one tap away). Progress is saved locally, per device.

**Beginner** — your first DataFrame · selecting columns · `.loc` / `.iloc` indexing · boolean-mask filtering · `sort_values` · top-N with `nlargest` · combining conditions (`&` `|` `isin` `between`) · `.str` methods · missing data (`isna` / `NaT`) · `unique` / `value_counts`

**Intermediate** — aggregating a column · `groupby` · filtering groups · `assign` / derived columns · `.dt` datetime accessors · `merge`

**Advanced** — left merge & anti-joins · `pivot_table` · ranking & window ops · a chained capstone leaderboard

After the lessons there's a free-form **Playground** (mutate the frames all you like — a reset button restores the sample data).

The sample data is a tiny CRM — `customers` (15), `deals` (30), and `reps` (5) — so the questions feel real: *biggest open deals, industries with the most customers, won revenue by rep.* Every lesson works these three DataFrames, pre-loaded in your namespace as `customers`, `deals`, and `reps`.

## Run it locally

It's a fully static site — any file server works:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

(The engine is loaded with `fetch`, so open it through a server, not a `file://` URL.)

## Deploy to Vercel

Zero-config static hosting: at [vercel.com/new](https://vercel.com/new), import **`lmansf/pandas-refresher`**, leave every setting at its default (Framework: **Other**, no build command, no output directory), and hit **Deploy**. You'll get a `*.vercel.app` URL you can open anywhere.

The first visit downloads ~30 MB (the Pyodide runtime plus the pandas/numpy wheels); `vercel.json` marks `vendor/` immutable so revisits are instant. Progress lives in `localStorage`, so it's per device. Any other static host (GitHub Pages, Netlify, …) works just as well.

## How it works

- **Pyodide 0.27.7** (which ships **pandas 2.2.3** / **numpy 2.0.2**) is vendored in `vendor/` — the runtime plus the pandas dependency closure (`numpy`, `python-dateutil`, `pytz`, `six`) and a trimmed `pyodide-lock.json`. It loads with a local `indexURL`, so **no CDN is hit at runtime**. Requires a browser with WebAssembly support: Chrome 95+, Safari 15.2+, Firefox 100+.
- `curriculum.json` holds the 20 lessons as data (loaded, never inline-rewritten); `seed.py` is the canonical dataset, executed in Pyodide to define the three frames; `lessons.js` adds the schema sidebar + playground snippets; `engine.js` boots Pyodide, seeds, runs code, and grades; `app.js` is the UI — routing, a syntax-highlighted Python editor, and the checker.
- **Execution is Jupyter-style**: the value of the **last expression** is your answer (no `print`, no `result =`). **Grading compares by _values_**, so different variable names, column aliases, or index labels still pass; row/element order only matters in the sort / top-N / capstone lessons. The exact rules are ported from `grade.py` — see [`AGENTS.md`](AGENTS.md).

### Tests

A Playwright end-to-end suite boots the real site headless and verifies the engine starts, **every lesson's reference solution is accepted**, and grading / errors / playground / reset / persistence / mobile all behave:

```bash
cd test && npm install && npm test
```

Set `CHROMIUM_PATH` to point at a system Chromium if you'd rather not download the Playwright-managed one.

### Updating Pyodide / pandas

The pin is a matched set: a Pyodide release determines the pandas version. To move it, pick the [Pyodide release](https://github.com/pyodide/pyodide/releases) whose `pyodide-lock.json` ships the pandas you want, then re-vendor the runtime core plus the pandas dependency closure:

```bash
V=0.27.7   # ships pandas 2.2.3
BASE="https://cdn.jsdelivr.net/pyodide/v$V/full"
cd vendor
# core runtime
for f in pyodide.mjs pyodide.asm.js pyodide.asm.wasm python_stdlib.zip pyodide.mjs.map; do curl -sO "$BASE/$f"; done
# pandas + its transitive wheels (resolve the closure from the release's pyodide-lock.json)
for w in numpy-*.whl pandas-*.whl python_dateutil-*.whl pytz-*.whl six-*.whl; do :; done  # see AGENTS.md for the closure script
```

Then trim `pyodide-lock.json` to just the vendored packages (script in `AGENTS.md`) and re-run the tests. If the new pandas changes any lesson's result, **do not silently edit lessons** — the curriculum is the validated source of truth.

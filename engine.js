// Pyodide + pandas engine wrapper: boot the runtime, seed the three CRM frames,
// execute learner code Jupyter-style (the value of the last expression is the
// answer), and normalize results into display + comparison forms.
//
// This is the pandas-refresher analog of the SQL-refresher's db.js. Two design
// choices keep it faithful to the canonical grader (spec/grade.py):
//
//   1. Value NORMALIZATION happens in Python, reusing grade.py's exact rules
//      (_cell / kind_of / normalize). Re-deriving pandas dtype semantics —
//      Timestamp -> YYYY-MM-DD, NaT/NaN -> null, numpy scalar -> primitive,
//      9.0 == 9 — in JS would drift from the oracle, so we let real pandas do
//      it and hand JS a JSON-safe canonical form.
//   2. The COMPARISON (set / multiset / ordered, and the learner-facing reason
//      strings) is compareResults() below, ported to JS from grade.py's grade().
//
// grade.py is the conformance oracle: for every lesson, compareResults' PASS/FAIL
// must match grade.py's.

let pyodide = null;
let runResultFn = null; // Python _run_result(code) -> JSON string

// The Python side of the engine: last-expression execution + grade.py's value
// normalization, plus a display projection for the results table. Kept as close
// to spec/grade.py as possible so PASS/FAIL stays identical.
const PY_BOOTSTRAP = String.raw`
import ast, json, math
import numpy as np
import pandas as pd

# --- last-expression execution (spec/grade.py: eval_last) --------------------

def _eval_last(code, ns):
    """Exec all statements but eval the final expression, returning its value.
    Falls back to a 'result' variable when the last statement is not an
    expression. Raises _NoResult when there is neither."""
    tree = ast.parse(code, mode="exec")
    if not tree.body:
        raise _NoResult("empty snippet")
    last = tree.body[-1]
    if isinstance(last, ast.Expr):
        exec(compile(ast.Module(body=tree.body[:-1], type_ignores=[]), "<cell>", "exec"), ns)
        return eval(compile(ast.Expression(last.value), "<cell>", "eval"), ns)
    exec(compile(tree, "<cell>", "exec"), ns)
    if "result" in ns:
        return ns["result"]
    raise _NoResult("no trailing expression and no 'result' variable")

class _NoResult(Exception):
    pass

# --- value normalization (spec/grade.py: _cell / kind_of / normalize) --------

def _cell(v):
    """Normalize a single cell/scalar to a comparable primitive."""
    if v is None:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(v, (pd.Timestamp, np.datetime64)):
        ts = pd.Timestamp(v)
        if ts.time() == pd.Timestamp("2000-01-01").time():
            return ts.strftime("%Y-%m-%d")
        return ts.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating, float)):
        f = float(v)
        return int(f) if f.is_integer() else round(f, 6)
    if isinstance(v, (np.bool_, bool)):
        return bool(v)
    if isinstance(v, int):
        return v
    return str(v)

def _kind_of(val):
    if isinstance(val, pd.DataFrame):
        return "dataframe"
    if isinstance(val, pd.Series):
        return "series"
    if isinstance(val, np.ndarray) or isinstance(val, (list, pd.Index)):
        return "array"
    return "scalar"

def _disp(cell):
    """A comparable primitive -> a display string (or None for null)."""
    if cell is None:
        return None
    if isinstance(cell, bool):
        return "True" if cell else "False"
    return str(cell)

# --- result projection: display table + grading canonical --------------------

def _project(val):
    kind = _kind_of(val)

    if kind == "dataframe":
        cols = [str(c) for c in val.columns]
        disp_rows = [[_disp(_cell(row[c])) for c in val.columns]
                     for _, row in val.iterrows()]
        # canonical: columns sorted (labels compared as a set), each row a list
        # of cells aligned to the sorted column order.
        scols = sorted(str(c) for c in val.columns)
        canon_rows = [[_cell(row[c]) for c in scols] for _, row in val.iterrows()]
        return {
            "kind": kind,
            "display": {"columns": cols, "rows": disp_rows},
            "numRows": int(val.shape[0]),
            "canon": {"kind": kind, "cols": scols, "rows": canon_rows},
        }

    if kind == "series":
        idx = val.index.tolist()
        vals = val.tolist()
        name = "" if val.name is None else str(val.name)
        idxname = "" if val.index.name is None else str(val.index.name)
        disp_rows = [[_disp(_cell(i)), _disp(_cell(v))] for i, v in zip(idx, vals)]
        pairs = [[_cell(i), _cell(v)] for i, v in zip(idx, vals)]
        return {
            "kind": kind,
            "display": {"columns": [idxname, name or "value"], "rows": disp_rows},
            "numRows": int(len(val)),
            "canon": {"kind": kind, "pairs": pairs},
        }

    if kind == "array":
        items = list(val)
        disp_rows = [[_disp(_cell(x))] for x in items]
        return {
            "kind": kind,
            "display": {"columns": ["value"], "rows": disp_rows},
            "numRows": int(len(items)),
            "canon": {"kind": kind, "items": [_cell(x) for x in items]},
        }

    # scalar
    cell = _cell(val)
    return {
        "kind": kind,
        "display": {"columns": ["value"], "rows": [[_disp(cell)]]},
        "numRows": 1,
        "canon": {"kind": kind, "scalar": cell},
    }

# Cap materialized rows; the seed is tiny, this only guards a runaway result.
_MAX_ROWS = 2000

def _run_result(code):
    """Execute code against the live seed frames and return a JSON string with a
    display projection and a grading canonical, or {'error': ...} on failure."""
    ns = {"pd": pd, "np": np,
          "customers": customers, "deals": deals, "reps": reps}
    try:
        val = _eval_last(code, ns)
    except _NoResult:
        return json.dumps({"kind": "none"})
    except SyntaxError as e:
        return json.dumps({"error": "SyntaxError: " + (e.msg or str(e))})
    except Exception as e:  # noqa: BLE001
        return json.dumps({"error": type(e).__name__ + ": " + str(e)})
    out = _project(val)
    if out["numRows"] > _MAX_ROWS:
        out["truncated"] = True
        out["display"]["rows"] = out["display"]["rows"][:_MAX_ROWS]
    else:
        out["truncated"] = False
    return json.dumps(out)

def _reset_frames():
    global customers, deals, reps
    customers, deals, reps = build_frames()
`;

export async function initEngine() {
  const mod = await import('./vendor/pyodide.mjs');
  pyodide = await mod.loadPyodide({ indexURL: './vendor/' });
  await pyodide.loadPackage(['pandas']);

  // Seed: run the canonical seed.py to define build_frames() and the three
  // frames as globals, then bring in the grader/runner helpers.
  const seedCode = await (await fetch('./seed.py')).text();
  pyodide.runPython(seedCode);
  pyodide.runPython(PY_BOOTSTRAP);
  runResultFn = pyodide.globals.get('_run_result');
  await resetData();
}

export async function resetData() {
  pyodide.globals.get('_reset_frames')();
}

// Run learner/solution code and return { columns, rows, kind, numRows,
// truncated, ms, canon }. Throws on Python error (message is display-ready).
export async function runCode(src) {
  const t0 = performance.now();
  const raw = runResultFn(src);
  const ms = performance.now() - t0;
  const out = JSON.parse(raw);
  if (out.error) {
    const err = new Error(out.error);
    err.isPython = true;
    throw err;
  }
  if (out.kind === 'none') {
    return { kind: 'none', columns: [], rows: [], numRows: 0, truncated: false, ms, canon: { kind: 'none' } };
  }
  return {
    kind: out.kind,
    columns: out.display.columns,
    rows: out.display.rows,
    numRows: out.numRows,
    truncated: out.truncated,
    ms,
    canon: out.canon,
  };
}

// ---------------------------------------------------------------- grading ---
//
// compareResults ported from spec/grade.py's grade(). Compares two canonical
// forms by VALUES (never identity), so different variable names, index labels,
// or column aliases all pass. order_matters enforces row/element order.

export function compareResults(got, expected, orderMatters) {
  const g = got, e = expected;
  if (g.kind !== e.kind) {
    return { pass: false, reason: `Expected a ${e.kind}, but your code produced a ${g.kind}.` };
  }

  if (g.kind === 'scalar') {
    return cellEq(g.scalar, e.scalar)
      ? { pass: true }
      : { pass: false, reason: `Expected ${fmt(e.scalar)}, but got ${fmt(g.scalar)}.` };
  }

  if (g.kind === 'dataframe') {
    if (!sameStringSet(g.cols, e.cols)) {
      return {
        pass: false,
        reason: `Expected columns ${e.cols.join(', ')}, but got ${g.cols.join(', ') || '(none)'}.`,
      };
    }
    if (g.rows.length !== e.rows.length) {
      return { pass: false, reason: `Expected ${e.rows.length} ${plural(e.rows.length, 'row')}, but your result has ${g.rows.length}.` };
    }
    return compareSequences(g.rows, e.rows, orderMatters, 'rows');
  }

  if (g.kind === 'series') {
    if (g.pairs.length !== e.pairs.length) {
      return { pass: false, reason: `Expected ${e.pairs.length} ${plural(e.pairs.length, 'entry')}, but your result has ${g.pairs.length}.` };
    }
    return compareSequences(g.pairs, e.pairs, orderMatters, 'entries');
  }

  // array
  if (g.items.length !== e.items.length) {
    return { pass: false, reason: `Expected ${e.items.length} ${plural(e.items.length, 'value')}, but your result has ${g.items.length}.` };
  }
  return compareSequences(g.items, e.items, orderMatters, 'values');
}

// Compare two sequences of cells/rows as a multiset, or in order when
// orderMatters. Mirrors grade.py: right-values-wrong-order is called out.
function compareSequences(a, b, orderMatters, noun) {
  const sa = a.map(ser);
  const sb = b.map(ser);
  const multisetEqual = equalArrays([...sa].sort(), [...sb].sort());
  if (orderMatters) {
    if (equalArrays(sa, sb)) return { pass: true };
    if (multisetEqual) return { pass: false, reason: 'Right values — wrong order. Check your sort direction.' };
    return { pass: false, reason: `The ${noun} don’t match the expected result yet.` };
  }
  if (multisetEqual) return { pass: true };
  return { pass: false, reason: `The ${noun} don’t match the expected result yet.` };
}

// Canonical serialization used as a comparison + sort key. Numbers are made
// tolerant by rounding to the same 6 places grade.py's _cell uses.
function ser(v) {
  return JSON.stringify(v, (_k, val) =>
    typeof val === 'number' && !Number.isInteger(val) ? Number(val.toFixed(6)) : val
  );
}

function cellEq(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-6;
  return ser(a) === ser(b);
}

function sameStringSet(a, b) {
  return equalArrays([...a].sort(), [...b].sort());
}

function equalArrays(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function fmt(v) {
  return v === null ? 'null' : String(v);
}

function plural(n, word) {
  if (n === 1) return word;
  if (word === 'entry') return 'entries';
  return word + 's';
}

"""Reference runner + grader for pandas-refresher lessons.

Emulates the browser sandbox: executes a pandas snippet in a namespace holding the
seed frames (customers/deals/reps) Jupyter-style and takes the value of the LAST
expression as the answer. Then grades a learner answer against a reference answer
by VALUES, per the curriculum grading model.

This is the canonical, language-agnostic definition of grading; the Pyodide build
should reproduce these rules in JS.

Usage:
  python grade.py --run snippet.py
      -> prints kind, shape, and repr() of the last-expression value.

  python grade.py --solution sol.py --learner learner.py [--order]
      -> prints PASS/FAIL and a reason. --order enforces row/element order.

Snippet files: any pandas code whose final line is a bare expression (the answer).
"""

import argparse
import ast
import math
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, __import__("os").path.dirname(__file__))
import seed  # noqa: E402


def _namespace():
    c, d, r = seed.build_frames()
    return {"pd": pd, "np": np, "customers": c, "deals": d, "reps": r}


def eval_last(code):
    """Exec all statements but eval the final expression, returning its value."""
    tree = ast.parse(code, mode="exec")
    if not tree.body:
        raise ValueError("empty snippet")
    ns = _namespace()
    last = tree.body[-1]
    if isinstance(last, ast.Expr):
        exec(compile(ast.Module(body=tree.body[:-1], type_ignores=[]), "<snip>", "exec"), ns)
        return eval(compile(ast.Expression(last.value), "<snip>", "eval"), ns)
    # No trailing expression: fall back to a `result` variable if present.
    exec(compile(tree, "<snip>", "exec"), ns)
    if "result" in ns:
        return ns["result"]
    raise ValueError("snippet has no trailing expression and no `result` variable")


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
        # date-only if midnight, else full timestamp
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


def kind_of(val):
    if isinstance(val, pd.DataFrame):
        return "dataframe"
    if isinstance(val, pd.Series):
        return "series"
    if isinstance(val, np.ndarray) or isinstance(val, (list, pd.Index)):
        return "array"
    return "scalar"


def shape_of(val):
    k = kind_of(val)
    if k == "dataframe":
        return f"{val.shape[0]} rows x {val.shape[1]} cols"
    if k == "series":
        return f"series len {len(val)}"
    if k == "array":
        return f"array len {len(val)}"
    return "scalar"


def normalize(val, order_matters):
    """Canonical comparable form for a result value."""
    k = kind_of(val)
    if k == "scalar":
        return ("scalar", _cell(val))
    if k == "array":
        items = [_cell(x) for x in list(val)]
        return ("array", items if order_matters else sorted(items, key=_sortkey))
    if k == "series":
        pairs = [(_cell(i), _cell(v)) for i, v in zip(val.index.tolist(), val.tolist())]
        return ("series", pairs if order_matters else sorted(pairs, key=_sortkey))
    # dataframe
    cols = sorted([str(c) for c in val.columns])
    rows = []
    for _, row in val.iterrows():
        rows.append(tuple((c, _cell(row[c])) for c in cols))
    return ("dataframe", tuple(cols), rows if order_matters else sorted(rows, key=_sortkey))


def _sortkey(x):
    return repr(x)


def grade(learner_code, solution_code, order_matters=False):
    try:
        got = eval_last(learner_code)
    except Exception as e:  # noqa: BLE001
        return False, f"learner snippet raised: {type(e).__name__}: {e}"
    exp = eval_last(solution_code)
    gk, ek = kind_of(got), kind_of(exp)
    if gk != ek:
        return False, f"expected a {ek}, got a {gk}"
    if gk == "dataframe":
        gcols = sorted(str(c) for c in got.columns)
        ecols = sorted(str(c) for c in exp.columns)
        if gcols != ecols:
            return False, f"expected columns {ecols}, got {gcols}"
        if got.shape[0] != exp.shape[0]:
            return False, f"expected {exp.shape[0]} rows, got {got.shape[0]}"
    if normalize(got, order_matters) == normalize(exp, order_matters):
        return True, "match"
    if not order_matters and normalize(got, True) == normalize(exp, True):
        return True, "match"
    if order_matters and normalize(got, False) == normalize(exp, False):
        return False, "right values, wrong order"
    return False, "values do not match the expected result"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run")
    ap.add_argument("--solution")
    ap.add_argument("--learner")
    ap.add_argument("--order", action="store_true")
    args = ap.parse_args()

    if args.run:
        with open(args.run) as f:
            val = eval_last(f.read())
        print(f"kind: {kind_of(val)}")
        print(f"shape: {shape_of(val)}")
        print("repr:")
        print(repr(val)[:2000])
        return

    if args.solution and args.learner:
        with open(args.solution) as f:
            sol = f.read()
        with open(args.learner) as f:
            lrn = f.read()
        ok, reason = grade(lrn, sol, args.order)
        print(("PASS" if ok else "FAIL") + ": " + reason)
        sys.exit(0 if ok else 1)

    ap.error("use --run FILE, or --solution FILE --learner FILE")


if __name__ == "__main__":
    main()

# pandas-refresher — curriculum & authoring contract

This course mirrors the **SQL-refresher** (interactive lessons that run a real engine in the
browser) but teaches **pandas**, running **real pandas via Pyodide** in the visitor's browser.
Each lesson explains one idea, shows a runnable example, then hands the learner an exercise that
is auto-graded by comparing their result's *values* against a reference solution's result.

> **`curriculum.json` is the authoritative shipped catalog (20 lessons: 10 beginner / 6 intermediate
> / 4 advanced).** This document is the authoring contract; if it ever disagrees with `curriculum.json`
> on a lesson's id, title, difficulty, or order, `curriculum.json` wins — reconcile this doc to it.

## The data (single source of truth: `seed.py`)

Three DataFrames, available in the learner's namespace as `customers`, `deals`, `reps`
(reused verbatim from the SQL-refresher CRM):

- `customers` (15 rows): `customer_id`(int), `name`, `industry`, `city`, `country`, `signup_date`(datetime64)
- `deals` (30 rows): `deal_id`(int), `customer_id`(int→customers), `rep_id`(int→reps), `amount`(int),
  `stage`(one of Prospecting/Qualified/Proposal/Won/Lost), `opened_date`(datetime64), `closed_date`(datetime64, **NaT while open**)
- `reps` (5 rows): `rep_id`(int), `name`, `region`, `hired_date`(datetime64)

## Execution & grading model (how the sandbox works — design to it)

- The learner writes pandas code in an editor and hits Run. The sandbox executes it Jupyter-style:
  **the value of the last expression is the answer** (`result`). So a solution ends in a bare
  expression that evaluates to a DataFrame, Series, or scalar. No `print`, no explicit `result =`.
- Grading compares the learner's last-expression value to the **reference solution's** last-expression
  value, by **values**:
  - **scalar** → equal (floats compared with tolerance).
  - **Series** → compared as the set of `(index_label, value)` pairs (so `value_counts` / `groupby.size`
    grade by label, order-insensitive) unless `order_matters`.
  - **DataFrame** → column labels must match; rows compared as a multiset (index ignored, positional
    reset) unless `order_matters`, in which case row order must match too.
- Therefore: **prefer `order_matters=false`**. Set it `true` ONLY when the lesson is about ordering
  (sort / top-N / ranking / the capstone leaderboard). When you rely on order, `.reset_index(drop=True)`
  so the index doesn't fight grading.
- Design each task so the *natural* correct answer is **unambiguous and deterministic**. Avoid tasks
  with float-formatting ambiguity or ties that make "top N" nondeterministic (the seed data was chosen
  to avoid amount ties at the boundaries the SQL course used — keep to those).

## Lesson object schema (what each swarm agent returns, as JSON)

```
{
  "id":            "kebab-slug (use the one assigned below)",
  "title":         "shown in header + sidebar",
  "difficulty":    "beginner | intermediate | advanced",
  "concept_blocks":[ {"kind":"html","html":"<p>…prose…</p>"}
                   | {"kind":"code","code":"deals.head()"} ],   // 2–4 blocks: teach the idea, 1–2 runnable examples
  "task_html":     "<p>the exercise prompt, HTML, bolding the key ask</p>",
  "hint":          "one-sentence plain-text nudge (names the method, not the full answer)",
  "solution":      "reference pandas snippet whose LAST expression is the answer",
  "order_matters": true | false,
  "result_kind":   "dataframe | series | scalar",
  "result_shape":  "e.g. '15 rows x 6 cols' | 'series len 5' | 'scalar'",
  "result_preview":"repr() of the reference result (first ~12 lines) — proof it runs",
  "alt_solutions": ["≥1 alternative correct snippet that yields an EQUAL result (proves grading is fair)"],
  "validation_notes":"what you ran in the venv and confirmed"
}
```

### Concept prose style (match the SQL-refresher voice)
Warm, concrete, one idea per lesson. Use `<code>` for methods/values, `<em>`/`<strong>` for emphasis,
`&mdash;`/`&ldquo;&rdquo;` typographic punctuation. Runnable example blocks are short and illustrative.
Teach idiomatic modern pandas (label-based `df["col"]`, boolean masks, `.loc` where it clarifies,
method chaining where natural). Don't reference SQL. Keep each lesson self-contained.

## Validation you MUST perform before returning (in the pinned venv)
Run against `seed.py` using the **Pyodide-matched** interpreter (pandas 2.2.3):
1. Execute your `solution`; capture the last-expression value. Confirm it runs clean and matches the task.
2. Execute each `alt_solution`; confirm it produces a result that would grade EQUAL to the reference
   under the grading model above (same values; label/multiset per the rules).
3. Execute every `concept_blocks` code example; confirm each runs without error.
4. Put the reference result's `repr()` (truncated) into `result_preview`, and note in `validation_notes`
   exactly what you ran. If anything is ambiguous or the seed data makes the task nondeterministic, say so.

The harness for running snippets against seed.py is provided; see the agent prompt for the exact command.

---

## The 20 lessons (id · title · difficulty · what it teaches · the exercise intent)

**Beginner (1–10)**
1. `first-look` · Your first DataFrame · beginner · what a DataFrame is; `.head()`, `.shape`, `.columns`,
   `.dtypes`; that everything runs real pandas locally. Exercise: show the whole `customers` DataFrame.
2. `select-columns` · Selecting columns · beginner · `df["col"]` (Series) vs `df[["a","b"]]` (DataFrame);
   column order. Exercise: just `name` and `city` of every customer, in that order.
3. `indexing` · Label vs position: .loc and .iloc · beginner · label-based `.loc` vs position-based `.iloc`;
   row/column selection, slices. Exercise: via `.iloc`, the first 5 rows of `customers`, all 6 columns, original order. (order_matters)
4. `filter-rows` · Filtering with boolean masks · beginner · comparison → boolean Series → `df[mask]`;
   `==`, `!=`, `>`, `<`. Exercise: every column of deals with `amount` greater than 30000.
5. `sort` · Sorting with sort_values · beginner · `sort_values(by, ascending=)`; ties. Exercise: all of
   `reps` sorted by `hired_date`, most recent first. (order_matters)
6. `top-n` · Top-N with nlargest / sort+head · beginner · `nlargest`, `sort_values(...).head(n)`.
   Exercise: the 3 biggest deals — `deal_id` and `amount`, largest first. (order_matters)
7. `multi-condition` · Combining conditions (& | isin between) · beginner · parenthesized `&`/`|`,
   `.isin([...])`, `.between(lo,hi)`. Exercise: `name` and `country` of customers in UK or Canada, via `isin`.
8. `strings` · String methods (.str) · beginner · `.str.contains`, `.str.startswith`, case sensitivity.
   Exercise: `name` of customers whose name contains "Retail".
9. `missing` · Missing data (isna / notna / NaT) · beginner · NaT ≠ 0/empty; `.isna()`, `.notna()`,
   why `== NaN` fails; brief `fillna`. Exercise: `deal_id`, `stage`, `amount` of still-open deals (closed_date is NaT).
10. `unique` · Unique values & value_counts · beginner · `.unique()`, `.nunique()`, `.value_counts()`,
    `drop_duplicates()`. Exercise: the list of unique `industry` values among customers.

**Intermediate (11–16)**
11. `aggregate` · Aggregating a column · intermediate · `.sum()`, `.mean()`, `.count()`, `.min()`,
    `.max()` on a Series; NaN handling. Exercise: in one expression, the number of deals and the total
    `amount` (name them `num_deals`, `total_value` — a one-row frame or a Series with those labels).
12. `groupby` · Grouping with groupby · intermediate · split-apply-combine; `groupby(col).size()` /
    `.agg`; group key as index. Exercise: count of deals in each `stage`.
13. `groupby-filter` · Filtering groups (HAVING-style) · intermediate · aggregate then filter the groups
    (`groupby.filter`, or aggregate then boolean-mask). Exercise: industries with more than 2 customers
    (industry + count).
14. `assign` · Adding / transforming columns · intermediate · `assign`, vectorized derived columns,
    `np.where`/boolean. Exercise: add a computed column (e.g. a boolean
    `is_won` or `amount_k = amount/1000`) — author picks the cleanest, states the expected columns.
15. `datetime` · Working with dates (.dt) · intermediate · the `.dt` accessor for date-derived columns
    (`.dt.year`/`.dt.month`/`.dt.day`), filtering on extracted parts. Exercise: `name` and `signup_date` of
    customers who signed up in 2024, via `.dt.year`.
16. `merge` · Combining DataFrames with merge · intermediate · `merge(on=...)`, inner join semantics,
    suffixes, selecting columns after. Exercise: each deal's `amount` next to its **rep's** `name`
    (merge deals ↔ reps).

**Advanced (17–20)**
17. `left-merge` · Left merge & finding non-matches · advanced · `how="left"`, `indicator=True`, rows
    with no match → NaN; the anti-join pattern. Exercise: customers with **no deals at all** (their `name`).
18. `pivot` · Reshaping with pivot_table · advanced · `pivot_table(index, columns, values, aggfunc,
    fill_value)`; margins. Exercise: total deal `amount` by `industry` (rows) × `stage` (columns),
    zero-filled — author states exact shape/labels.
19. `window-rank` · Ranking & window ops · advanced · `groupby(...).rank()` / `transform` / `cumsum`;
    per-group ranking without collapsing rows. Exercise: within each `stage`, rank deals by `amount`
    (largest = rank 1) and return `deal_id`, `stage`, `amount`, `rank_in_stage` — author picks a clean,
    deterministic form (mind ties; use a method that avoids ambiguity, and reset_index if order_matters).
20. `capstone` · Putting it all together · advanced · a single chained pipeline: merge → filter → groupby
    → aggregate → sort → head. Exercise: the **sales leaderboard** — for Won deals only, each rep's `name`
    and total won `amount` as `total_won`, highest first, top 3. (order_matters)

Difficulty ramp and coverage are the responsibility of the whole set; each agent should make its single
lesson excellent and faithful to the intent above, and flag in `validation_notes` if its assigned intent
seems to overlap or clash with a neighbor so the integrator can reconcile.

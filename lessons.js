// Course content, schema reference, and playground snippets.
//
// The 20 lessons live in curriculum.json (the validated spec bundle) and are
// loaded as data — never inline-rewritten here. Each lesson object carries:
//   id             stable key for progress + saved editor text
//   title          shown in header and sidebar
//   difficulty     beginner | intermediate | advanced
//   concept_blocks [{kind:"html",html} | {kind:"code",code}] — prose + runnable examples
//   task_html      HTML for the exercise prompt
//   hint           plain-text nudge
//   solution       reference pandas snippet whose LAST expression is the answer
//   order_matters  when true, row/element order must match too
//   result_kind    dataframe | series | scalar | array
//   result_shape   human-readable shape, e.g. "15 rows x 6 cols"
//
// The seed dataset is spec/seed.py, fetched and executed by engine.js so the
// three frames (customers/deals/reps) exist in the learner's namespace.

// Load the 20 lessons from curriculum.json. Returned as-is (data stays data).
export async function loadLessons() {
  const res = await fetch('./curriculum.json');
  if (!res.ok) throw new Error(`Could not load curriculum.json (HTTP ${res.status})`);
  return res.json();
}

// The three CRM DataFrames, mirrored from seed.py for the sidebar reference.
export const SCHEMA_REF = [
  {
    frame: 'customers',
    rows: 15,
    note: 'Companies in the CRM.',
    columns: [
      ['customer_id', 'int64'],
      ['name', 'object'],
      ['industry', 'object'],
      ['city', 'object'],
      ['country', 'object'],
      ['signup_date', 'datetime64[ns]'],
    ],
  },
  {
    frame: 'deals',
    rows: 30,
    note: 'Sales opportunities. stage is one of Prospecting, Qualified, Proposal, Won, Lost. closed_date is NaT while a deal is still open.',
    columns: [
      ['deal_id', 'int64'],
      ['customer_id', 'int64 → customers'],
      ['rep_id', 'int64 → reps'],
      ['amount', 'int64'],
      ['stage', 'object'],
      ['opened_date', 'datetime64[ns]'],
      ['closed_date', 'datetime64[ns]'],
    ],
  },
  {
    frame: 'reps',
    rows: 5,
    note: 'The sales team.',
    columns: [
      ['rep_id', 'int64'],
      ['name', 'object'],
      ['region', 'object'],
      ['hired_date', 'datetime64[ns]'],
    ],
  },
];

// A few ready-to-run pandas snippets for the Playground. Each ends in a bare
// expression so the sandbox has a value to display.
export const PLAYGROUND_SNIPPETS = [
  { label: 'Peek at customers', code: `customers.head()` },
  {
    label: 'Biggest open deals',
    code: `open_deals = deals[deals["closed_date"].isna()]
open_deals.sort_values("amount", ascending=False)[["deal_id", "amount", "stage"]]`,
  },
  {
    label: 'Deals per rep',
    code: `merged = deals.merge(reps, on="rep_id")
merged.groupby("name").size().sort_values(ascending=False)`,
  },
  {
    label: 'Won revenue by industry',
    code: `won = deals[deals["stage"] == "Won"].merge(customers, on="customer_id")
won.groupby("industry")["amount"].sum().sort_values(ascending=False)`,
  },
  {
    label: 'Make your own frame',
    code: `todo = pd.DataFrame({"item": ["Finish pandas refresher", "Practice groupby"],
                     "done": [False, True]})
todo`,
  },
];

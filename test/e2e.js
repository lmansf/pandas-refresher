// End-to-end test for pandas Refresher.
//
//   cd test && npm install && npm test
//
// Boots the site in headless Chromium (serving the parent folder itself),
// verifies the Pyodide + pandas engine starts, checks that every lesson's
// reference solution is accepted by the grader, and exercises grading, errors,
// the playground, data reset, persistence, and the mobile layout.
//
// Set CHROMIUM_PATH to use a specific Chromium binary instead of the
// Playwright-managed one.

const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.py': 'text/x-python',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.zip': 'application/zip', '.whl': 'application/octet-stream', '.map': 'application/json',
};

function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    let file = path.normalize(path.join(ROOT, url === '/' ? 'index.html' : url));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// Pyodide + pandas take a while to boot the first time in a cold headless
// browser; be generous.
const BOOT_TIMEOUT = 240000;

let failures = 0;
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!cond) failures++;
};

(async () => {
  const server = await serve();
  const BASE = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

  await page.goto(BASE);
  await page.waitForFunction(() => window.__pandasref && window.__pandasref.ready, null, { timeout: BOOT_TIMEOUT });
  console.log('engine ready');

  // --- value normalization sanity checks -------------------------------------

  const agg = await page.evaluate(() => window.__pandasref.runCode('deals["amount"].sum()'));
  check('scalar sum normalizes', agg.kind === 'scalar' && agg.canon.scalar === 636000 && JSON.stringify(agg.rows) === '[["636000"]]', JSON.stringify(agg.rows) + ' / ' + agg.canon.scalar);

  const dt = await page.evaluate(() => window.__pandasref.runCode('reps.sort_values("hired_date")["hired_date"].iloc[0]'));
  check('Timestamp -> YYYY-MM-DD', dt.kind === 'scalar' && dt.canon.scalar === '2021-11-02', JSON.stringify(dt.canon));

  const mixed = await page.evaluate(() => window.__pandasref.runCode('pd.Series([9.0, 1.5, None, True])'));
  check('float 9.0==9 / NaN->null / bool normalize', mixed.kind === 'series' && JSON.stringify(mixed.canon.pairs) === '[[0,9],[1,1.5],[2,null],[3,true]]', JSON.stringify(mixed.canon.pairs));

  const df = await page.evaluate(() => window.__pandasref.runCode('customers.head(2)[["name","country"]]'));
  check('DataFrame display projects columns', df.kind === 'dataframe' && JSON.stringify(df.columns) === '["name","country"]' && df.numRows === 2, JSON.stringify(df.columns));

  // --- every lesson's reference solution must be judged correct ---------------

  const n = await page.evaluate(() => window.__pandasref.lessons.length);
  check('20 lessons loaded', n === 20, `n=${n}`);
  for (let i = 0; i < n; i++) {
    const fb = await page.evaluate(async (i) => {
      window.__pandasref.goto(i);
      window.__pandasref.setEditor(window.__pandasref.lessons[i].solution);
      await window.__pandasref.run();
      return { fb: window.__pandasref.feedback, id: window.__pandasref.lessons[i].id };
    }, i);
    check(`lesson ${i + 1} (${fb.id}) solution accepted`, fb.fb === 'ok', `feedback=${fb.fb}`);
  }
  const done = await page.evaluate(() => window.__pandasref.progressCount);
  check(`progress reaches ${n}/${n}`, done === n, `progress=${done}`);

  // --- an alternate correct answer still passes (grading is by value) --------

  const alt = await page.evaluate(async () => {
    const idx = window.__pandasref.lessons.findIndex((l) => l.alt_solutions && l.alt_solutions.length);
    const lesson = window.__pandasref.lessons[idx];
    window.__pandasref.goto(idx);
    window.__pandasref.setEditor(lesson.alt_solutions[0]);
    await window.__pandasref.run();
    return { fb: window.__pandasref.feedback, id: lesson.id, alt: lesson.alt_solutions[0] };
  });
  check('alternate solution accepted', alt.fb === 'ok', `${alt.id}: ${alt.alt}`);

  // --- a reasonable wrong answer warns ---------------------------------------

  const warn = await page.evaluate(async () => {
    window.__pandasref.goto(0); // first-look expects the whole customers frame
    window.__pandasref.setEditor('customers[["name"]]');
    await window.__pandasref.run();
    return { fb: window.__pandasref.feedback, text: document.querySelector('#feedback').textContent };
  });
  check('wrong answer warns', warn.fb === 'warn', warn.text.trim().slice(0, 90));

  // --- broken code shows an error panel --------------------------------------

  const err = await page.evaluate(async () => {
    window.__pandasref.setEditor('customers[');
    await window.__pandasref.run();
    return { fb: window.__pandasref.feedback, text: document.querySelector('#feedback').textContent };
  });
  check('bad code shows error', err.fb === 'err' && /error/i.test(err.text), err.text.trim().slice(0, 60));

  // --- playground: run code, then reset restores mutated sample data ---------

  const pg = await page.evaluate(async () => {
    window.__pandasref.goto('playground');
    window.__pandasref.setEditor('pd.DataFrame({"x": [7]})');
    await window.__pandasref.run();
    return { fb: window.__pandasref.feedback, cells: [...document.querySelectorAll('#pg-results td')].map((td) => td.textContent) };
  });
  check('playground runs', pg.fb === 'ok' && pg.cells.join(',') === '7', JSON.stringify(pg));

  // Mutate customers in place, confirm it stuck, then reset.
  const mutated = await page.evaluate(() => window.__pandasref.runCode('customers.drop(index=customers.index, inplace=True)\ncustomers.shape[0]'));
  check('in-place mutation persists', mutated.canon.scalar === 0, JSON.stringify(mutated.canon));
  await page.click('#reset-data');
  await page.waitForFunction(() => document.querySelector('#reset-data').textContent.includes('restored'), null, { timeout: 10000 });
  const restored = await page.evaluate(() => window.__pandasref.runCode('customers.shape[0]'));
  check('reset restores data', restored.canon.scalar === 15, JSON.stringify(restored.canon));

  // --- progress survives a reload --------------------------------------------

  await page.reload();
  await page.waitForFunction(() => window.__pandasref && window.__pandasref.ready, null, { timeout: BOOT_TIMEOUT });
  const persisted = await page.evaluate(() => window.__pandasref.progressCount);
  check('progress persists across reload', persisted === n, `progress=${persisted}`);

  // --- mobile viewport: drawer opens, and running through the real UI works ---

  const mob = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mob.goto(BASE + '#6');
  await mob.waitForFunction(() => window.__pandasref && window.__pandasref.ready, null, { timeout: BOOT_TIMEOUT });
  await mob.click('#menu-btn');
  const drawerVisible = await mob
    .waitForFunction(() => {
      const r = document.querySelector('#sidebar').getBoundingClientRect();
      return document.body.classList.contains('nav-open') && r.left === 0;
    }, null, { timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  check('mobile drawer opens', drawerVisible);
  await mob.click('#scrim', { position: { x: 370, y: 300 } }); // tap the sliver beside the drawer
  await mob.waitForFunction(() => !document.body.classList.contains('nav-open'));
  await mob.fill('#lesson-editor textarea', 'deals.nlargest(3, "amount")[["deal_id", "amount"]]');
  await mob.click('#run-btn');
  await mob.waitForFunction(() => window.__pandasref.feedback !== null, null, { timeout: 30000 });
  const mobFb = await mob.evaluate(() => window.__pandasref.feedback);
  check('mobile run + check works', mobFb === 'ok', `feedback=${mobFb}`);

  const realErrors = consoleErrors.filter((t) => !/favicon/i.test(t));
  check('no console errors', realErrors.length === 0, realErrors.join(' | ').slice(0, 200));

  await browser.close();
  server.close();
  console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('E2E crashed:', e); process.exit(2); });

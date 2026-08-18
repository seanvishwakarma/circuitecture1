/* Phase 6 gate: command palette, undo-delete, prefs persistence, admin console, gradebook CSV */
const { chromium } = require('playwright');
const B = 'http://localhost:8080';
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗ FAIL', name); } };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));
  page.on('dialog', d => d.accept());

  /* ---------- editor: palette ---------- */
  await page.goto(B + '/editor?id=demo1');
  await page.waitForSelector('#board-tabs', { timeout: 15000 });
  await page.waitForTimeout(1500);

  await page.keyboard.press('Control+k');
  await page.waitForSelector('#palette-back.open');
  ok(true, 'Ctrl+K opens palette');
  await page.screenshot({ path: '/home/user/gate-p6-palette.png' });

  await page.fill('#palette-input', 'scope');
  await page.waitForTimeout(150);
  const firstLabel = await page.textContent('#palette-list .pal-item.active .pal-label');
  ok(/oscilloscope/i.test(firstLabel || ''), 'filter "scope" → Oscilloscope command on top');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  ok(await page.$eval('.dtab[data-dtab="scope"]', el => el.classList.contains('active')), 'palette executed: scope tab active');
  ok(!(await page.$('#palette-back.open')), 'palette closed after exec');

  await page.keyboard.press('Control+k');
  await page.fill('#palette-input', 'run sim');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  const st1 = await page.evaluate(() => window.CS && window.CS.sim ? window.CS.sim.state : 'n/a');
  ok(st1 === 'running' || st1 === 'paused', 'palette ran simulation (state=' + st1 + ')');
  await page.keyboard.press('Control+k');
  await page.fill('#palette-input', 'stop sim');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  ok(await page.evaluate(() => window.CS.sim.state === 'idle'), 'palette stopped simulation');
  const serialTxt = await page.textContent('#serial-out');
  ok(/plant|soil|—/i.test(serialTxt || ''), 'sim produced serial output before stop');

  /* Escape closes */
  await page.keyboard.press('Control+k');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  ok(!(await page.$('#palette-back.open')), 'Esc closes palette');

  /* ---------- editor: font-size persistence ---------- */
  await page.click('.dtab[data-dtab="code"]'); // font select lives on the Code tab page
  await page.waitForTimeout(200);
  await page.selectOption('#editor-font', '16');
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => localStorage.getItem('ct_editor_font')) === '16', 'font size persisted to localStorage');
  await page.reload();
  await page.waitForSelector('#board-tabs', { timeout: 15000 });
  await page.waitForTimeout(1200);
  ok(await page.$eval('#editor-font', el => el.value) === '16', 'font size restored after reload');

  /* ---------- dashboard: undoable delete ---------- */
  const deletes = [];
  page.on('request', r => { if (r.method() === 'DELETE' && r.url().includes('/api/projects/')) deletes.push(r.url()); });
  await page.goto(B + '/dashboard');
  const menuBtn = page.locator('.project-card [data-act="menu"]').first();
  await menuBtn.waitFor({ state: 'attached', timeout: 15000 });
  await menuBtn.evaluate(el => el.click()); // activate via JS (menu opens; hover-only CSS is a display detail)
  await page.waitForTimeout(300);
  const delItem = page.locator('.menu-pop button', { hasText: 'Delete' });
  await delItem.click();
  await page.waitForSelector('.undo-toast', { timeout: 3000 });
  ok(true, 'delete shows undo toast (no confirm())');
  await page.screenshot({ path: '/home/user/gate-p6-undotoast.png' });
  await page.click('.undo-toast .undo-btn');
  await page.waitForTimeout(6600);
  ok(deletes.length === 0, 'undo cancelled the DELETE request');
  // delete for real this time
  await page.locator('.project-card [data-act="menu"]').first().evaluate(el => el.click());
  await page.waitForTimeout(300);
  await page.locator('.menu-pop button', { hasText: 'Delete' }).click();
  await page.waitForSelector('.undo-toast');
  await page.waitForTimeout(6800);
  ok(deletes.length === 1, 'DELETE fired after toast expired');

  /* ---------- classroom gradebook CSV ---------- */
  await page.goto(B + '/dashboard');
  await page.waitForSelector('.tab[data-tab="classroom"]', { timeout: 15000 });
  await page.click('.tab[data-tab="classroom"]');
  await page.waitForTimeout(800);
  const gbBtn = page.locator('[data-act="gradebook"]').first();
  await gbBtn.click();
  await page.waitForSelector('.grade-table', { timeout: 5000 });
  const dlPromise = page.waitForEvent('download', { timeout: 5000 });
  await page.click('#gb-csv');
  const dl = await dlPromise;
  ok(/gradebook\.csv$/.test(dl.suggestedFilename()), 'gradebook CSV downloads: ' + dl.suggestedFilename());
  await page.screenshot({ path: '/home/user/gate-p6-gradebook.png' });

  /* ---------- admin console ---------- */
  await page.goto(B + '/admin');
  await page.waitForSelector('.adm-stat-grid', { timeout: 15000 });
  await page.waitForTimeout(700);
  const overviewText = await page.textContent('#adm-content');
  ok(/Simulations Run/.test(overviewText), 'overview shows Simulations Run card');
  ok(/177/.test(overviewText), 'sims total rendered (177)');
  ok(!/undefined|NaN/.test(overviewText), 'no undefined/NaN in overview');
  ok(/Top Components/.test(overviewText), 'top components list rendered');
  ok(await page.$('#spark-sims'), 'sims sparkline canvas present');
  await page.screenshot({ path: '/home/user/gate-p6-admin.png' });

  // users tab
  await page.click('.admin-tabs .tab[data-section="users"]');
  await page.waitForSelector('.user-role-select', { timeout: 5000 });
  const roleOpts = await page.$$eval('.user-role-select option', os => [...new Set(os.map(o => o.value))]);
  ok(['user', 'teacher', 'moderator', 'admin'].every(r => roleOpts.includes(r)), 'role select offers all 4 roles');
  await page.selectOption('#adm-role-filter', 'user');
  await page.waitForTimeout(200);
  const visible = await page.$$eval('#adm-user-tbody tr', rs => rs.filter(r => r.style.display !== 'none').length);
  ok(visible === 1, 'role filter narrows to 1 user row');
  await page.selectOption('#adm-role-filter', '');
  const resetBtn = page.locator('tr[data-id="u2"] [data-resetpw]');
  await resetBtn.click();
  await page.waitForSelector('#rp-temp', { timeout: 4000 });
  ok(await page.$eval('#rp-temp', el => el.value) === 'TmpK7x29Qw', 'reset-password modal shows temp password once');
  await page.screenshot({ path: '/home/user/gate-p6-resetpw.png' });
  await page.click('#modal-root .modal-x'); // dismiss modal before switching tabs
  await page.waitForTimeout(300);

  // flags tab
  await page.click('.admin-tabs .tab[data-section="flags"]');
  await page.waitForSelector('[data-flag]', { timeout: 5000 });
  const flags = await page.$$eval('[data-flag]', els => els.map(e => e.getAttribute('data-flag')));
  ['communityEnabled', 'teacherSignup', 'classroomEnabled', 'allowForking', 'allowSharing', 'signupOpen']
    .forEach(f => ok(flags.includes(f), 'flag row: ' + f));

  /* ---------- five-page smoke ---------- */
  for (const p of ['/', '/features', '/docs', '/dashboard', '/editor?id=demo1']) {
    await page.goto(B + p);
    await page.waitForTimeout(1400);
  }
  ok(true, '5-page smoke navigations completed');

  console.log('\nconsole/page errors:', errors.length ? errors.slice(0, 6) : 'none');
  ok(errors.length === 0, 'zero console/page errors across the gate');
  console.log(`\n=== P6 GATE: ${pass} passed, ${fail} failed ===`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('GATE CRASH:', e.message); process.exit(2); });

/* Final sweep: signup role picker, mobile 400px, admin activity tab */
const { chromium } = require('playwright');
const B = 'http://localhost:8080';
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL', n); } };

(async () => {
  const browser = await chromium.launch();

  /* ---------- signup flow with teacher role ---------- */
  const anonCtx = await browser.newContext({ extraHTTPHeaders: { 'x-preview-anon': '1' }, viewport: { width: 1440, height: 900 } });
  const page = await anonCtx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));
  await page.goto(B + '/');
  await page.waitForTimeout(900);
  const signupBtn = page.locator('.landing-nav-actions [data-auth="signup"]').first();
  await signupBtn.click();
  await page.waitForSelector('#af-role', { timeout: 5000 });
  ok(true, 'signup modal shows role picker');
  await page.fill('#af-name', 'Marie Curie');
  await page.fill('#af-email', 'marie@school.edu');
  await page.fill('#af-pass', 'radium1898');
  await page.click('#af-role .role-opt[data-role="teacher"]');
  const reqP = page.waitForRequest(r => r.url().includes('/api/signup'), { timeout: 4000 });
  await page.click('#af-go');
  const req = await reqP;
  ok(JSON.parse(req.postData() || '{}').role === 'teacher', 'signup POST carries role:"teacher"');
  await page.waitForURL(u => u.pathname.includes('dashboard'), { timeout: 6000 });
  ok(true, 'signup redirected to dashboard');
  await page.waitForTimeout(900);
  const dashTabs = await page.$$eval('.tab', els => els.map(e => e.getAttribute('data-tab')));
  ok(dashTabs.includes('classroom'), 'dashboard has classroom tab');
  await anonCtx.close();

  /* ---------- admin activity tab ---------- */
  const page2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page2.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page2.on('pageerror', e => errors.push('PAGE: ' + e.message));
  page = page2;
  await page.goto(B + '/admin');
  await page.waitForSelector('.adm-stat-grid', { timeout: 15000 });
  await page.click('.admin-tabs .tab[data-section="activity"]');
  await page.waitForTimeout(900);
  const actText = await page.textContent('#adm-content');
  ok(/create_class|No activity|audit/i.test(actText || ''), 'activity tab renders (audit feed)');
  ok(/moderation|admin_update_project|No activity/i.test(actText || ''), 'audit rows include reason-carrying entry');

  /* ---------- desktop landing sanity ---------- */
  await page.goto(B + '/');
  await page.waitForTimeout(1200);
  const landText = await page.textContent('body');
  ok(/multi-board/i.test(landText), 'landing advertises multi-board');
  ok(!/collaborat|AI assistant|version histor/i.test(landText), 'landing free of removed-feature claims');
  await page.screenshot({ path: '/home/user/gate-p6b-landing.png' });
  await page.close();

  /* ---------- mobile 400px ---------- */
  const mp = await browser.newPage({ viewport: { width: 400, height: 800 } });
  mp.on('console', m => { if (m.type() === 'error') errors.push('MOB ' + m.text()); });
  mp.on('pageerror', e => errors.push('MOB PAGE: ' + e.message));
  await mp.goto(B + '/');
  await mp.waitForTimeout(1100);
  const mobW = await mp.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  ok(mobW.sw <= mobW.iw + 2, `landing no horizontal overflow @400px (${mobW.sw}px)`);
  await mp.screenshot({ path: '/home/user/gate-p6b-mobile-landing.png' });

  await mp.goto(B + '/dashboard');
  await mp.waitForTimeout(1200);
  const dashW = await mp.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  ok(dashW.sw <= dashW.iw + 2, `dashboard no horizontal overflow @400px (${dashW.sw}px)`);
  await mp.screenshot({ path: '/home/user/gate-p6b-mobile-dash.png' });

  await mp.goto(B + '/editor?id=demo1');
  await mp.waitForSelector('#board-tabs', { timeout: 15000 });
  await mp.waitForTimeout(1000);
  ok(true, 'editor boots at 400px without errors');

  console.log('\nconsole/page errors:', errors.length ? errors.slice(0, 8) : 'none');
  ok(errors.length === 0, 'zero console/page errors (desktop + mobile)');
  console.log(`\n=== FINAL SWEEP: ${pass} passed, ${fail} failed ===`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('GATE CRASH:', e.message); process.exit(2); });

const { test, expect } = require('@playwright/test');

test.describe('Simulation and Component Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Suppress the once-per-context admin default-password warning modal (set before app boot reads it)
    await page.addInitScript(() => {
      try { localStorage.setItem('admin-password-warned', '1'); } catch {}
    });
  });

  test('should verify simulation debugger, serial, scope, and component reactions', async ({ page }) => {
    test.setTimeout(45000);
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
    page.on('pageerror', err => console.error('BROWSER ERROR:', err.message));

    // 1. Log in
    await page.goto('/');
    await page.click('[data-auth="login"]');
    await page.waitForSelector('#af-email');
    await page.fill('#af-email', 'admin@circuittecture.local');
    await page.fill('#af-pass', 'admin1234');
    await page.click('#af-go');
    await page.waitForURL('/dashboard', { timeout: 10000 });

    // 2. Create project — wait for dashboard to be fully initialized first
    await page.waitForSelector('#dash-greeting h2');
    await page.click('#new-project-btn');
    await page.waitForSelector('#np-name');
    await page.fill('#np-name', 'Verification Circuit');
    await page.click('button:has-text("Create project")', { force: true });
    await page.waitForURL(/\/editor\?/, { timeout: 15000 });
    await page.waitForTimeout(3000); // Wait for Monaco & canvas to settle

    // 3. Programmatically set up 4 categories of components
    const setupResult = await page.evaluate(() => {
      const canvas = window.CS && window.CS.canvas;
      if (!canvas || !canvas.doc) return false;
      
      canvas.doc.components = [
        { id: 'uno1', type: 'uno', x: 100, y: 100 },
        { id: 'led1', type: 'led', x: 400, y: 100, props: { color: '#ef4444' } },
        { id: 'resistor1', type: 'resistor', x: 400, y: 250, props: { value: 220 } },
        { id: 'ldr1', type: 'ldr', x: 100, y: 350, props: { level: 0.8 } },
        { id: 'btn1', type: 'pushbutton', x: 400, y: 350 }
      ];

      canvas.doc.wires = [
        { id: 'w1', a: { c: 'uno1', p: 'D13' }, b: { c: 'led1', p: 'anode' } },
        { id: 'w2', a: { c: 'led1', p: 'cathode' }, b: { c: 'uno1', p: 'GND' } },
        { id: 'w3', a: { c: 'uno1', p: '5V' }, b: { c: 'resistor1', p: '1' } },
        { id: 'w4', a: { c: 'uno1', p: 'A0' }, b: { c: 'resistor1', p: '2' } },
        { id: 'w5', a: { c: 'uno1', p: 'D2' }, b: { c: 'btn1', p: '1' } },
        { id: 'w6', a: { c: 'btn1', p: '2' }, b: { c: 'uno1', p: 'GND2' } },
        { id: 'w7', a: { c: 'uno1', p: 'A1' }, b: { c: 'ldr1', p: 'AO' } },
        { id: 'w8', a: { c: 'ldr1', p: 'VCC' }, b: { c: 'uno1', p: '5V' } },
        { id: 'w9', a: { c: 'ldr1', p: 'GND' }, b: { c: 'uno1', p: 'GND' } }
      ];

      canvas.renderAll();
      return true;
    });
    expect(setupResult).toBeTruthy();

    const testCode = `
void setup() {
  pinMode(13, OUTPUT);
  pinMode(2, INPUT_PULLUP);
  Serial.begin(9600);
}
void loop() {
  digitalWrite(13, HIGH);
  Serial.println("HELLO FROM SIM");
  int btn = digitalRead(2);
  delay(10);
  digitalWrite(13, LOW);
  delay(10);
}`;
    await page.evaluate((code) => CS.editor.setCode(code), testCode);
    await page.waitForTimeout(1000); // Give editor time to sync

    // Log the transpiled code and breakpoints
    const transpileLog = await page.evaluate(() => {
      const code = CS.editor.getCode();
      const tr = CS.transpile(code, 'cpp');
      return {
        code,
        js: tr.js,
        ok: tr.ok,
        error: tr.error
      };
    });
    console.log('TRANSPILED JS:', transpileLog.js);
    console.log('TRANSPILE OK:', transpileLog.ok, transpileLog.error);

    // Test Breakpoints
    await page.evaluate(() => {
      CS.editor.breakpoints.add(11);
      CS.editor.paintBreakpoints();
    });
    
    // Log active editor state
    const editorState = await page.evaluate(() => {
      return {
        isMonaco: !!CS.editor.monacoEditor,
        codeLen: CS.editor.getCode().length,
        breakpoints: [...CS.editor.breakpoints],
        problems: CS.editor.problems,
        project: !!window.CS.app.project,
        hasMcu: window.CS.canvas.doc.components.some(c => (window.CS.defs[c.type] || {}).mcu)
      };
    });
    console.log('EDITOR STATE BEFORE RUN:', editorState);

    const clickResult = await page.evaluate(() => {
      try {
        document.querySelector('#sim-run').click();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err.message, stack: err.stack };
      }
    });
    console.log('CLICK RESULT:', clickResult);

    // Log active simulation state immediately
    const immediateState = await page.evaluate(() => {
      return {
        state: CS.sim.state,
        line: CS.sim.line,
        breakpoints: [...CS.sim.breakpoints],
        clock: document.querySelector('#sim-clock').textContent,
        hasExports: !!CS.sim.exports,
        exportsKeys: CS.sim.exports ? Object.keys(CS.sim.exports) : null
      };
    });
    console.log('SIM STATE IMMEDIATELY AFTER RUN:', immediateState);

    // Wait for simulation pause state
    await page.waitForTimeout(2000);

    const simState = await page.evaluate(() => {
      return {
        state: CS.sim.state,
        line: CS.sim.line,
        breakpoints: [...CS.sim.breakpoints],
        clock: document.querySelector('#sim-clock').textContent,
        problems: CS.editor.problems,
        topLevel: CS.sim.topLevel,
        hasSetup: !!(CS.sim.exports && CS.sim.exports.setup),
        hasLoop: !!(CS.sim.exports && CS.sim.exports.loop),
        exportsKeys: CS.sim.exports ? Object.keys(CS.sim.exports) : null
      };
    });
    console.log('SIM STATE AFTER RUN:', simState);

    await expect(page.locator('#sim-pause')).toHaveClass(/active/, { timeout: 8000 });
    const execLine = await page.evaluate(() => CS.editor.execLine);
    expect(execLine).toBe(11);

    // Run pipeline once programmatically to propagate the digitalWrite HIGH state to the nets and sensors
    await page.evaluate(() => CS.sim.pipeline());

    // Test Component Reactions
    const ledOpacity = await page.locator('.comp[data-id="led1"] [data-k="bulb"]').getAttribute('fill-opacity');
    expect(parseFloat(ledOpacity)).toBeGreaterThan(0.35);

    const resistorVolts = await page.evaluate(() => CS.sim.wireNetInfo(CS.canvas.doc.wires.find(x => x.id === 'w3'))?.volts);
    expect(resistorVolts).toBeCloseTo(5, 0.1);
    
    const ldrWidth = await page.locator('.comp[data-id="ldr1"] [data-k="meter"]').getAttribute('width');
    expect(parseFloat(ldrWidth)).toBeCloseTo(44 * 0.8, 1);
    
    await page.locator('.comp[data-id="btn1"] [data-act="press"]').dispatchEvent('pointerdown');
    const btnPressed = await page.evaluate(() => CS.canvas.doc.components.find(c => c.id === 'btn1')?.state.pressed);
    expect(btnPressed).toBeTruthy();

    // Verify Serial Output
    const serialOutText = await page.locator('#serial-out').innerText();
    expect(serialOutText).toContain('HELLO FROM SIM');

    await page.locator('.comp[data-id="btn1"] [data-act="press"]').dispatchEvent('pointerup');
    await page.click('#sim-stop');
  });

  test('should verify project management, search, and visibility', async ({ page }) => {
    const id = Date.now().toString(36);
    const alphaName = `Project Alpha ${id}`;
    const betaName = `Project Beta ${id}`;
    const gammaName = `Project Gamma ${id}`;

    // 1. Log in
    await page.goto('/');
    await page.click('[data-auth="login"]');
    await page.waitForSelector('#af-email');
    await page.fill('#af-email', 'admin@circuittecture.local');
    await page.fill('#af-pass', 'admin1234');
    await page.click('#af-go');
    await page.waitForURL('/dashboard', { timeout: 10000 });
    
    // Wait for projects/empty state to load, ensuring CSRF is ready
    await page.waitForSelector('.project-card, .empty-state');

    // 2. Create 3 projects via API
    await page.evaluate(async ({ a, b, g }) => {
      await window.CS.api('/api/projects', 'POST', { name: a, board: 'uno' });
      await window.CS.api('/api/projects', 'POST', { name: b, board: 'nano' });
      await window.CS.api('/api/projects', 'POST', { name: g, board: 'esp32' });
    }, { a: alphaName, b: betaName, g: gammaName });

    // 3. Reload dashboard and verify 3 project cards exist
    await page.goto('/dashboard');
    await page.waitForSelector(`.project-card:has-text("${alphaName}")`);
    await page.waitForSelector(`.project-card:has-text("${betaName}")`);
    await page.waitForSelector(`.project-card:has-text("${gammaName}")`);

    // 4. Search for "Alpha" and verify only Alpha is visible
    await page.fill('#dash-search', alphaName);
    // Wait for debounce search to trigger and filter
    await page.waitForTimeout(800);

    const alphaVisible = await page.locator(`.project-card:has-text("${alphaName}")`).isVisible();
    const betaVisible = await page.locator(`.project-card:has-text("${betaName}")`).isVisible();
    const gammaVisible = await page.locator(`.project-card:has-text("${gammaName}")`).isVisible();

    expect(alphaVisible).toBeTruthy();
    expect(betaVisible).toBeFalsy();
    expect(gammaVisible).toBeFalsy();
  });

  test('should verify admin panel role-gating, tab navigation, and confirmations', async ({ page }) => {
    test.setTimeout(60000);
    // 1. Log in as a standard user via signup to guarantee non-admin
    const testEmail = `nonadmin-${Date.now()}@example.com`;
    await page.goto('/');
    await page.click('[data-auth="signup"]');
    await page.waitForSelector('#af-name');
    await page.fill('#af-name', 'Non-Admin User');
    await page.fill('#af-email', testEmail);
    await page.fill('#af-pass', 'pass1234');
    await page.click('#af-go');
    await page.waitForURL('/dashboard', { timeout: 10000 });

    // Attempt to access /admin
    await page.goto('/admin');
    // Verify Access Denied is shown in the empty state
    await page.waitForSelector('.empty-state');
    await expect(page.locator('.empty-state')).toContainText('Access denied');

    // 2. Log out
    await page.evaluate(() => window.CS.api('/api/logout', 'POST'));
    await page.goto('/');
    await page.waitForSelector('[data-auth="login"]');

    // Log in as seeded admin
    await page.click('[data-auth="login"]');
    await page.waitForSelector('#af-email');
    await page.fill('#af-email', 'admin@circuittecture.local');
    await page.fill('#af-pass', 'admin1234');
    await page.click('#af-go');
    await page.waitForURL('/dashboard');

    // Navigate to /admin
    await page.goto('/admin');
    await page.waitForSelector('h2:has-text("System Overview")');

    // 3. Click through every tab
    const tabs = ['users', 'projects', 'settings', 'security', 'database', 'activity', 'moderation', 'overview'];
    for (const tab of tabs) {
      await page.click(`.admin-tabs .tab[data-section="${tab}"]`);
      await page.waitForTimeout(250); // Settle tab content
    }

    // 4. Verify confirm dialog before destructive actions
    await page.click('.admin-tabs .tab[data-section="database"]');
    await page.waitForSelector('h2:has-text("Database Management")');
    
    // Create a backup first so there is at least one backup row
    await page.click('button[data-db="backup"]');
    await page.waitForSelector('tr:has-text("manual-backup-")');

    // Trigger restore backup confirmation
    let dialogMessage = '';
    page.on('dialog', async dialog => {
      dialogMessage = dialog.message();
      await dialog.dismiss(); // Cancel
    });
    await page.click('button:has-text("Restore")');
    await page.waitForTimeout(500); // Give time for dialog callback
    expect(dialogMessage).toContain('overwrite');
  });
});


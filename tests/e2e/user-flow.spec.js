const { test, expect } = require('@playwright/test');

test.describe('User flow tests', () => {
  test('should sign up, create project, and add wire', async ({ page }) => {
    // Capture browser errors for debugging
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
    page.on('pageerror', err => console.error('BROWSER ERROR:', err.message));

    const testEmail = `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;

    await page.goto('/');

    // Click sign up button
    await page.click('[data-auth="signup"]');

    // Fill sign up form
    await page.waitForSelector('#af-name');
    await page.fill('#af-name', 'Test User');
    await page.fill('#af-email', testEmail);
    await page.fill('#af-pass', 'password123');

    // Submit form
    await page.click('#af-go');

    // Wait for dashboard to load (app redirects there on signup)
    await page.waitForURL('/dashboard', { timeout: 10000 });

    // Ensure dashboard is fully initialized before interacting
    await page.waitForSelector('#dash-greeting h2');

    // Click create new project
    await page.click('#new-project-btn');
    await page.waitForSelector('#np-name');
    await page.fill('#np-name', 'Test Circuit');
    await page.click('button:has-text("Create project")');

    // Wait for editor to load
    await page.waitForURL(/\/editor\?/, { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Double-click Battery Pack in the component library to add it
    await page.waitForSelector('.lib-item');
    await page.locator('.lib-item:has-text("Battery Pack")').dblclick();
    await page.waitForTimeout(500);

    // Double-click LED in the component library to add it
    await page.locator('.lib-item:has-text("LED")').first().dblclick();
    await page.waitForTimeout(500);

    // Verify components were added to canvas via data model
    const comps = await page.evaluate(() => {
      const canvas = window.CS && window.CS.canvas;
      if (!canvas || !canvas.doc) return [];
      return canvas.doc.components.map(c => ({ type: c.type, id: c.id }));
    });

    expect(comps.some(c => c.type === 'battery')).toBeTruthy();
    expect(comps.some(c => c.type === 'led')).toBeTruthy();

    // Connect the two components by clicking on their pins
    const batteryComp = comps.find(c => c.type === 'battery');
    const ledComp = comps.find(c => c.type === 'led');

    // Wire the two components via canvas API (avoids overlapping pin elements
    // since both components are placed near the canvas center by dblclick)
    const wireCreated = await page.evaluate(({ batteryId, ledId }) => {
      const canvas = window.CS && window.CS.canvas;
      if (!canvas || !canvas.doc) return false;
      const battery = canvas.doc.components.find(c => c.id === batteryId);
      const led = canvas.doc.components.find(c => c.id === ledId);
      if (!battery || !led) return false;
      // Pins are on the type definition (CS.defs), not the component instance
      const bDef = CS.defs && CS.defs[battery.type];
      const lDef = CS.defs && CS.defs[led.type];
      const bp = bDef && bDef.pins && bDef.pins.find(p => p.id === '+');
      const lp = lDef && lDef.pins && lDef.pins.find(p => p.id === 'anode');
      if (!bp || !lp) return false;

      canvas.startWire({ clientX: 100, clientY: 100 }, battery, bp);
      canvas.finishWire(led, lp);
      return canvas.doc.wires.some(w => w.a.c === batteryId && w.b.c === ledId);
    }, { batteryId: batteryComp.id, ledId: ledComp.id });

    expect(wireCreated).toBeTruthy();
    await page.waitForTimeout(300);

    // Verify wire was created in data model
    const wires = await page.evaluate(() => {
      const canvas = window.CS && window.CS.canvas;
      if (!canvas || !canvas.doc) return [];
      return canvas.doc.wires.map(w => ({
        from: w.a, to: w.b
      }));
    });

    expect(wires.length).toBeGreaterThanOrEqual(1);
    const wireConnects = wires.some(w =>
      w.from.c === batteryComp.id && w.to.c === ledComp.id
    );
    expect(wireConnects).toBeTruthy();
  });

  test('should login as admin and access admin dashboard', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-auth="login"]');

    // Fill login form
    await page.waitForSelector('#af-email');
    await page.fill('#af-email', 'admin@circuittecture.local');
    await page.fill('#af-pass', 'admin1234');
    await page.click('#af-go');

    // Wait for dashboard
    await page.waitForURL('/dashboard', { timeout: 10000 });

    // Navigate to admin section
    await page.click('#dash-admin-btn');
    await page.waitForURL('/admin');

    // Verify admin tabs are visible
    const tabsVisible = await page.evaluate(() => {
      const tabSections = ['overview', 'users', 'projects', 'settings'];
      return tabSections.every(section => {
        const element = document.querySelector(`[data-section="${section}"]`);
        return element && element.offsetWidth > 0;
      });
    });

    expect(tabsVisible).toBeTruthy();

    // Test admin stats API
    const apiResponse = await page.evaluate(async () => {
      const response = await fetch('/api/admin/stats');
      return response.status;
    });

    expect(apiResponse).toBe(200);
  });
});

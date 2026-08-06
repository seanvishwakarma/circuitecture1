const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const viewports = [
  { width: 1440, height: 900, name: 'desktop' },
  { width: 390, height: 844, name: 'mobile' }
];

const themes = ['light', 'dark'];

const publicPages = ['/', '/docs', '/components', '/features'];
const protectedPages = ['/dashboard', '/editor', '/admin'];

const screenshotDir = path.resolve(__dirname, '__screenshots__');

test.describe('Visual regression tests', () => {
  test.beforeAll(() => {
    fs.mkdirSync(screenshotDir, { recursive: true });
  });

  test.beforeEach(async ({ page }) => {
    // Suppress the once-per-context admin default-password warning modal so screenshots stay clean
    await page.addInitScript(() => {
      try { localStorage.setItem('admin-password-warned', '1'); } catch {}
    });
  });

  for (const pagePath of publicPages) {
    for (const theme of themes) {
      for (const viewport of viewports) {
        test(`should capture ${pagePath} at ${viewport.name} with ${theme} theme`, async ({ page }) => {
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          await page.goto(pagePath);
          await page.evaluate((th) => {
            localStorage.setItem('theme', th);
            document.documentElement.setAttribute('data-theme', th);
          }, theme);
          await page.waitForLoadState('load', { timeout: 15000 });
          try { await page.waitForLoadState('networkidle', { timeout: 5000 }); } catch {}
          await page.waitForTimeout(500);
          const nameSlug = pagePath.replace('/', '') || 'index';
          const screenshotPath = path.join(screenshotDir, `${nameSlug}-${viewport.name}-${theme}.png`);
          await page.screenshot({
            path: screenshotPath,
            fullPage: true,
            animations: 'disabled'
          });
          expect(fs.existsSync(screenshotPath)).toBeTruthy();
        });
      }
    }
  }

  for (const pagePath of protectedPages) {
    for (const theme of themes) {
      for (const viewport of viewports) {
        test(`should capture ${pagePath} at ${viewport.name} with ${theme} theme`, async ({ page }) => {
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          await page.goto('/#login');
          await page.evaluate((th) => {
            localStorage.setItem('theme', th);
            document.documentElement.setAttribute('data-theme', th);
          }, theme);
          const emailInput = page.locator('input[type="email"], #login-email').first();
          const passInput = page.locator('input[type="password"], #login-pass').first();
          if (await emailInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await emailInput.fill('admin@circuittecture.local');
            await passInput.fill('admin1234');
            await page.locator('button[type="submit"], #login-submit').first().click();
            await page.waitForTimeout(1000);
          }
          await page.goto(pagePath);
          await page.waitForLoadState('load', { timeout: 15000 });
          try { await page.waitForLoadState('networkidle', { timeout: 5000 }); } catch {}
          await page.waitForTimeout(1000);
          const nameSlug = pagePath.replace('/', '') || 'index';
          const screenshotPath = path.join(screenshotDir, `${nameSlug}-${viewport.name}-${theme}.png`);
          await page.screenshot({
            path: screenshotPath,
            fullPage: true,
            animations: 'disabled'
          });
          expect(fs.existsSync(screenshotPath)).toBeTruthy();
        });
      }
    }
  }
});

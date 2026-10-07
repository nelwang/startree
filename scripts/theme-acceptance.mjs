import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { startPerformanceBrowserFixture } from './performance-browser-fixture.mjs';

const themeControl = (page) => {
  const trigger = page.getByRole('button', { name: /^Theme:/ });
  return {
    waitFor: () => trigger.waitFor(),
    boundingBox: () => trigger.boundingBox(),
    inputValue: () =>
      page.evaluate(
        () =>
          `${document.documentElement.dataset.palette}:${document.documentElement.dataset.theme}`,
      ),
    selectOption: async (value) => {
      const [palette, appearance] = value.split(':');
      await trigger.click();
      if (appearance === 'system') {
        await page.locator(`[data-theme-option="${palette}:light"]`).click();
        await trigger.click();
        await page.locator('[data-theme-system]').click();
      } else {
        await page.locator(`[data-theme-option="${value}"]`).click();
      }
    },
  };
};

const fixture = await startPerformanceBrowserFixture();
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ colorScheme: 'light', serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.route('https://example.com/**', (route) => route.abort());
  await page.goto(fixture.url);
  const select = themeControl(page);
  const palettes = ['forest', 'ocean', 'dune', 'dusk'];
  await select.waitFor();
  const background = () =>
    page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
  assert.equal(await select.inputValue(), 'forest:system');
  assert.equal(await background(), 'rgb(245, 246, 240)');
  await page.emulateMedia({ colorScheme: 'dark' });
  assert.equal(await background(), 'rgb(20, 28, 25)');
  await select.selectOption('forest:light');
  assert.equal(await background(), 'rgb(245, 246, 240)');
  await page.reload();
  assert.equal(await select.inputValue(), 'forest:light');
  await select.selectOption('forest:dark');
  await page.reload();
  assert.equal(await select.inputValue(), 'forest:dark');
  assert.equal(await background(), 'rgb(20, 28, 25)');
  const second = await context.newPage();
  await second.goto(fixture.url);
  await themeControl(second).selectOption('forest:light');
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await themeControl(second).selectOption('dune:light');
  await page.waitForFunction(() => document.documentElement.dataset.palette === 'dune');
  await page.waitForFunction(
    () =>
      `${document.documentElement.dataset.palette}:${document.documentElement.dataset.theme}` ===
      'dune:light',
  );
  await page.reload();
  assert.equal(await select.inputValue(), 'dune:light');
  await select.selectOption('forest:light');
  await second.close();
  await page.locator('.folder-tile > button').first().click();
  for (const palette of palettes) {
    for (const theme of ['light', 'dark']) {
      await select.selectOption(`${palette}:${theme}`);
      await page.locator('.bookmark-card').first().waitFor();
      const audit = await new AxeBuilder({ page })
        .withRules(['color-contrast', 'button-name', 'aria-valid-attr-value'])
        .analyze();
      assert.deepEqual(audit.violations, [], `${palette} ${theme} contrast and select labels`);
      await page.screenshot({ path: `/tmp/startree-${palette}-${theme}.png` });
      await page.getByRole('button', { name: 'Add Bookmark', exact: true }).click();
      await page.locator('.bookmark-editor').waitFor();
      const editorAudit = await new AxeBuilder({ page })
        .include('.bookmark-editor')
        .withRules(['color-contrast'])
        .analyze();
      assert.deepEqual(editorAudit.violations, [], `${palette} ${theme} editor contrast`);
      await page.getByRole('button', { name: 'Close editor' }).click();
    }
  }
  await page.route('**/api/notes/vault', (route) => route.fulfill({ json: { vault: null } }));
  await page.getByRole('link', { name: 'Notes', exact: true }).click();
  await page.getByLabel('New notes password', { exact: true }).waitFor();
  for (const palette of palettes) {
    for (const theme of ['light', 'dark']) {
      await select.selectOption(`${palette}:${theme}`);
      const notesAudit = await new AxeBuilder({ page })
        .withRules(['color-contrast', 'button-name', 'aria-valid-attr-value'])
        .analyze();
      assert.deepEqual(notesAudit.violations, [], `${palette} ${theme} Notes setup contrast`);
    }
  }
  await select.selectOption('forest:dark');
  await page.locator('.notes-page').waitFor();
  assert.equal(await background(), 'rgb(20, 28, 25)');
  for (const width of [320, 390, 600, 640, 768]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    const bar = await page.locator('.app-bar').boundingBox();
    const control = await select.boundingBox();
    assert.ok(control.x >= 0 && control.x + control.width <= width && control.y >= bar.y);
    const navigation = await page.locator('.page-navigation').boundingBox();
    assert.ok(
      navigation.y >= control.y + control.height || navigation.x + navigation.width <= control.x,
    );
    await select.selectOption('dusk:light');
    await select.selectOption('dusk:dark');
  }
  // Mouse selection leaves a clean trigger; keyboard navigation retains a visible focus indicator.
  const trigger = page.getByRole('button', { name: /^Theme:/ });
  await trigger.click();
  await page.locator('[data-theme-option="ocean:light"]').click();
  assert.equal(await trigger.evaluate((element) => getComputedStyle(element).outlineStyle), 'none');
  await trigger.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Choose a theme' });
  await dialog.waitFor();
  assert.equal(
    await page
      .locator('[data-theme-option="ocean:light"]')
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.keyboard.press('End');
  assert.equal(
    await page.locator('[data-theme-system]').evaluate((el) => el === document.activeElement),
    true,
  );
  await page.keyboard.press('Escape');
  assert.equal(await trigger.evaluate((el) => el === document.activeElement), true);
  assert.equal(await dialog.count(), 0);
  await trigger.click();
  await page.getByRole('heading', { name: 'Notes', exact: false }).click();
  assert.equal(await dialog.count(), 0);
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await trigger.click();
    const bounds = await dialog.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, `Theme panel fits ${width}px`);
    const audit = await new AxeBuilder({ page }).include('#theme-picker-panel').analyze();
    assert.deepEqual(audit.violations, [], `Theme picker accessibility at ${width}px`);
    await page.screenshot({ path: `/tmp/startree-theme-picker-${width}.png` });
    await page.keyboard.press('Escape');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/startree-mobile-dark.png', fullPage: true });
  await context.close();

  const blocked = await browser.newContext({ serviceWorkers: 'block', colorScheme: 'dark' });
  await blocked.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Blocked', 'SecurityError');
      },
    });
  });
  const fallback = await blocked.newPage();
  await fallback.goto(fixture.url);
  await themeControl(fallback).selectOption('ocean:light');
  assert.equal(await fallback.evaluate(() => document.documentElement.dataset.palette), 'ocean');
  assert.equal(await fallback.evaluate(() => document.documentElement.dataset.theme), 'light');
  await blocked.close();
  console.log(
    'Theme acceptance passed: system changes, overrides, reload, cross-tab sync, contrast, Notes, mobile, and blocked storage.',
  );
} finally {
  await browser.close();
  await fixture.close();
}

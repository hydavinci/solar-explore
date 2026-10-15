import { expect, test, type Page } from '@playwright/test';
import type { SolarDiagnostics } from '../../src/rendering/SolarCanvas';

const altitude = async (page: Page) => Number((await page.locator('.distance-caption strong').innerText()).replace(/[^\d.]/g, ''));
const pause = async (page: Page) => {
  await page.goto('./');
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await expect.poll(() => page.locator('canvas').evaluate(canvas =>
    (canvas as HTMLCanvasElement & { __solarDiagnostics?: { sampleCount: number } }).__solarDiagnostics?.sampleCount ?? 0)).toBeGreaterThan(2);
};
const fly = async (page: Page) => {
  await page.getByRole('button', { name: '飞向天体', exact: true }).click();
  await expect(page.getByTestId('navigation-mode')).toHaveText('正在飞向');
};

test('paused orbit wheel changes altitude in both directions', async ({ page }) => {
  await pause(page);
  const before = await altitude(page);
  await page.mouse.move(720, 440);
  await page.mouse.wheel(0, -100);
  await expect.poll(() => altitude(page)).toBeLessThan(before);
  const inward = await altitude(page);
  await page.mouse.wheel(0, 100);
  await expect.poll(() => altitude(page)).toBeGreaterThan(inward);
});

for (const scale of ['真实尺度', '示意模式']) test(`maximum zoom remains reversible while Mercury moves in ${scale}`, async ({ page }) => {
  await pause(page);
  await page.getByRole('button', { name: '设置日期', exact: true }).click();
  await page.getByLabel('模拟日期（UTC）', { exact: true }).fill('2026-10-15T01:10:00Z');
  await page.getByRole('button', { name: '应用日期', exact: true }).click();
  await page.getByRole('button', { name: '选择水星', exact: true }).click();
  await page.getByRole('button', { name: scale, exact: true }).click();
  await fly(page);
  await expect(page.getByTestId('navigation-mode')).toHaveText('环绕观察', { timeout: 15_000 });
  const sample = () => page.locator('canvas').evaluate(canvas => {
    const diagnostics = (canvas as HTMLCanvasElement & { __solarDiagnostics?: SolarDiagnostics }).__solarDiagnostics;
    if (!diagnostics) throw new Error('Scene not ready');
    const { positionKm, previousTargetPositionKm: center } = diagnostics.navigation;
    if (!center) throw new Error('Missing navigation target');
    return { frame: diagnostics.updateCount, date: diagnostics.clock.julianDay, issue: diagnostics.issue,
      distanceKm: Math.hypot(...positionKm.map((value, index) => value - center[index]!)) };
  });
  await page.mouse.move(720, 400);
  for (let i = 0; i < 14; i++) {
    const before = await sample();
    await page.mouse.wheel(0, -100);
    await expect.poll(async () => (await sample()).frame).toBeGreaterThan(before.frame + 2);
  }
  expect((await sample()).distanceKm).toBeCloseTo(2464.097, 3);
  const paused = await sample();
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await expect.poll(async () => (await sample()).frame).toBeGreaterThan(paused.frame + 30);
  expect((await sample()).date).toBeGreaterThan(paused.date);
  await expect(page.getByTestId('navigation-mode')).toHaveText('环绕观察');
  expect((await sample()).issue).toBeNull();
  await page.mouse.move(720, 400);
  await page.mouse.wheel(0, 100);
  await expect.poll(() => altitude(page)).toBeGreaterThan(100);
  await expect(page.getByTestId('navigation-mode')).toHaveText('环绕观察');
  expect((await sample()).issue).toBeNull();
});

test('Escape and movement cancel button/G flights without canvas focus', async ({ page }) => {
  await pause(page);
  await page.getByRole('button', { name: '选择海王星', exact: true }).click();
  await fly(page);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('navigation-mode')).toHaveText('自由飞行');
  await expect(page.getByRole('button', { name: '飞向天体', exact: true })).toBeFocused();
  await page.keyboard.press('g');
  await expect(page.getByTestId('navigation-mode')).toHaveText('正在飞向');
  await page.keyboard.down('w');
  await expect(page.getByTestId('navigation-mode')).toHaveText('自由飞行');
  await page.keyboard.up('w');
});

test('flight shortcuts preserve editable and modal focus', async ({ page }) => {
  await pause(page);
  await page.getByRole('button', { name: '选择海王星', exact: true }).click();
  await fly(page);
  await page.getByRole('searchbox').focus();
  await page.keyboard.press('Escape');
  await page.keyboard.press('w');
  await expect(page.getByTestId('navigation-mode')).toHaveText('正在飞向');
  await expect(page.getByRole('searchbox')).toBeFocused();
  await page.getByRole('button', { name: '操作指南', exact: true }).click();
  await page.keyboard.press('w');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByTestId('navigation-mode')).toHaveText('正在飞向');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByTestId('navigation-mode')).toHaveText('正在飞向');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('navigation-mode')).toHaveText('自由飞行');
});

test('first Escape only closes settings during flight and the second cancels', async ({ page }) => {
  await pause(page);
  await page.getByRole('button', { name: '选择海王星', exact: true }).click();
  await fly(page);
  await page.getByRole('button', { name: '画面设置', exact: true }).click();
  await expect(page.getByRole('region', { name: '画面设置', exact: true })).toBeVisible();
  const updates = () => page.locator('canvas').evaluate(canvas =>
    (canvas as HTMLCanvasElement & { __solarDiagnostics?: { updateCount: number } }).__solarDiagnostics?.updateCount ?? 0);
  const beforeEscape = await updates();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: '画面设置', exact: true })).toBeHidden();
  await expect.poll(updates).toBeGreaterThan(beforeEscape + 10);
  await expect(page.getByTestId('navigation-mode')).toHaveText('正在飞向');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('navigation-mode')).toHaveText('自由飞行');
});

for (const hide of ['key', 'button']) test(`hiding HUD via ${hide} closes settings and enables movement`, async ({ page }) => {
  await pause(page);
  const before = await altitude(page);
  await page.getByRole('button', { name: '画面设置', exact: true }).click();
  if (hide === 'key') await page.keyboard.press('h');
  else await page.getByRole('button', { name: '隐藏界面', exact: true }).click();
  await expect(page.getByText('按 H 显示界面')).toBeVisible();
  await page.locator('canvas').click({ position: { x: 720, y: 440 } });
  await page.keyboard.down('w');
  await page.waitForTimeout(250);
  await page.keyboard.up('w');
  await page.keyboard.press('h');
  await expect(page.getByRole('region', { name: '画面设置', exact: true })).toBeHidden();
  await expect.poll(() => altitude(page)).toBeLessThan(before);
});

test('ordinary HUD shows physical speed while navigation is enabled', async ({ page }) => {
  await pause(page);
  await expect(page.getByTestId('navigation-speed')).toBeVisible();
  await expect(page.getByTestId('navigation-speed')).toContainText(/(?:km|AU)\/s/);
  await page.getByRole('button', { name: '自由飞行', exact: true }).click();
  const before = await page.getByTestId('navigation-speed').innerText();
  await page.mouse.move(720, 440);
  await page.mouse.wheel(0, -100);
  await expect(page.getByTestId('navigation-speed')).not.toHaveText(before);
  await expect(page.getByRole('region', { name: '画面设置', exact: true })).toBeHidden();
});

test('Saturn fly-to frames the full ring without changing physical scale', async ({ page }, testInfo) => {
  await pause(page);
  await page.getByRole('button', { name: '选择土星', exact: true }).click();
  await fly(page);
  await expect(page.getByTestId('navigation-mode')).toHaveText('环绕观察', { timeout: 15_000 });
  expect(await altitude(page)).toBeGreaterThan(250000);
  expect(await altitude(page)).toBeLessThan(300000);
  await page.getByRole('button', { name: '隐藏界面', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('saturn-full-rings.png') });
});

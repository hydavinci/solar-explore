import { expect, test, type Page } from '@playwright/test';
import type { SolarDiagnostics } from '../../src/rendering/SolarCanvas';

const pose = (page: Page) => page.locator('canvas').evaluate(canvas => {
  const diagnostics = (canvas as HTMLCanvasElement & { __solarDiagnostics?: SolarDiagnostics }).__solarDiagnostics;
  if (!diagnostics) throw new Error('Scene not ready');
  return { position: diagnostics.navigation.positionKm, forward: diagnostics.navigation.forward, frame: diagnostics.updateCount };
});
const settle = async (page: Page) => {
  const frame = (await pose(page)).frame;
  await expect.poll(async () => (await pose(page)).frame).toBeGreaterThan(frame + 3);
};
test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await expect.poll(async () => page.locator('canvas').evaluate(canvas =>
    (canvas as HTMLCanvasElement & { __solarDiagnostics?: SolarDiagnostics }).__solarDiagnostics?.sampleCount ?? 0)).toBeGreaterThan(2);
});

test('orbit uses left drag and a drag returning to its start does not select a body', async ({ page }) => {
  await page.getByRole('button', { name: '设置日期', exact: true }).click();
  await page.getByLabel('模拟日期（UTC）', { exact: true }).fill('2026-10-15T01:10:00Z');
  await page.getByRole('button', { name: '应用日期', exact: true }).click();
  await page.getByRole('button', { name: '定位土星', exact: true }).click();
  const before = await pose(page);
  await page.mouse.move(720, 450);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(780, 470, { steps: 5 });
  await page.mouse.up({ button: 'right' });
  await settle(page);
  expect((await pose(page)).forward).toEqual(before.forward);

  await page.mouse.move(720, 450);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(800, 450, { steps: 8 });
  await expect.poll(async () => (await pose(page)).forward).not.toEqual(before.forward);
  await page.mouse.move(720, 450, { steps: 8 });
  await page.mouse.up({ button: 'left' });
  await settle(page);
  await expect(page.getByTestId('selected-body')).toHaveText('土星');
  await page.mouse.click(720, 450);
  await expect(page.getByTestId('selected-body')).toHaveText('地球');
});

test('free mode keeps left click selection and uses right drag to look', async ({ page }) => {
  await page.getByRole('button', { name: '自由飞行', exact: true }).click();
  const before = await pose(page);
  await page.mouse.move(720, 450);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(800, 460, { steps: 8 });
  await page.mouse.up({ button: 'left' });
  await settle(page);
  expect((await pose(page)).forward).toEqual(before.forward);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(880, 490, { steps: 8 });
  await page.mouse.up({ button: 'right' });
  await expect.poll(async () => (await pose(page)).forward).not.toEqual(before.forward);
  await expect(page.getByTestId('navigation-mode')).toHaveText('自由飞行');
});

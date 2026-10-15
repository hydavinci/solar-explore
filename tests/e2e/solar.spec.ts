import { expect, test } from '@playwright/test';
import type { SolarDiagnostics } from '../../src/rendering/SolarCanvas';
import { catalog } from '../../src/simulation/catalog';

test('starts at Earth and navigates all core controls', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await expect(page.getByTestId('selected-body')).toHaveText('地球');
  await expect(page.locator('canvas')).toBeVisible();
  await page.getByRole('searchbox', { name: '搜索天体' }).fill('Neptune');
  await page.getByRole('button', { name: '选择海王星', exact: true }).click();
  await expect(page.getByTestId('selected-body')).toHaveText('海王星');
  await expect(page.getByTestId('navigation-mode')).toHaveText('正在飞向');
  await expect(page.getByTestId('navigation-mode')).toContainText('环绕', { timeout: 15_000 });
  await page.getByRole('button', { name: '示意模式', exact: true }).click();
  await expect(page.getByTestId('scale-label')).toContainText('示意');
  await expect(page.getByTestId('selected-body')).toHaveText('海王星');
  expect(errors).toEqual([]);
});

for (const scale of ['真实尺度', '示意模式']) test(`list selection flies to and centers Jupiter in ${scale}`, async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.getByRole('button', { name: scale, exact: true }).click();
  await page.getByRole('button', { name: '太阳系全景', exact: true }).click();
  await page.getByRole('button', { name: '选择木星', exact: true }).click();
  await expect(page.getByTestId('selected-body')).toHaveText('木星');
  await expect(page.getByTestId('navigation-mode')).toHaveText('正在飞向');
  await expect(page.getByTestId('navigation-mode')).toHaveText('环绕观察', { timeout: 15_000 });
  const navigation = () => page.locator('canvas').evaluate(canvas => {
    const diagnostics = (canvas as HTMLCanvasElement & { __solarDiagnostics?: SolarDiagnostics }).__solarDiagnostics;
    if (!diagnostics) throw new Error('Scene not ready');
    return diagnostics.navigation;
  });
  const arrived = await navigation();
  expect(arrived.target).toBe('jupiter');
  const center = arrived.previousTargetPositionKm!;
  const direction = arrived.positionKm.map((value, index) => center[index]! - value);
  const distance = Math.hypot(...direction);
  expect(distance / catalog.jupiter.radiusKm).toBeCloseTo(2.4, 2);
  expect(direction.reduce((sum, value, index) => sum + value / distance * arrived.forward[index]!, 0)).toBeGreaterThan(0.99999);
  expect(arrived.issue).toBeNull();

  await page.getByRole('button', { name: '选择地球', exact: true }).click();
  await expect(page.getByTestId('navigation-mode')).toHaveText('正在飞向');
  await page.getByRole('button', { name: '选择土星', exact: true }).click();
  await expect.poll(async () => (await navigation()).target).toBe('saturn');
  await expect(page.getByTestId('selected-body')).toHaveText('土星');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('navigation-mode')).toHaveText('自由飞行');
});

test('invalid date does not change paused simulation time', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const original = await page.getByTestId('simulation-time').innerText();
  await page.getByRole('button', { name: '设置日期', exact: true }).click();
  await page.getByLabel('模拟日期（UTC）').fill('2050-01-01T00:00:00Z');
  await page.getByRole('button', { name: '应用日期', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('1800-01-01');
  await expect(page.getByRole('alert')).toContainText('2050-01-01');
  await expect(page.getByTestId('simulation-time')).toHaveText(original);
});

test('hidden interface can be restored using keyboard', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '隐藏界面', exact: true }).click();
  await expect(page.getByText('按 H 显示界面')).toBeVisible();
  await page.keyboard.press('h');
  await expect(page.getByRole('searchbox', { name: '搜索天体' })).toBeVisible();
});

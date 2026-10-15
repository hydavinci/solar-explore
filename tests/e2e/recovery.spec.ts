import { expect, test } from '@playwright/test';

test('reports a failed Earth texture and permits retry', async ({ page }) => {
  await page.route('**/assets/**/2k_earth_daymap.jpg', route => route.abort());
  await page.goto('./');
  await expect(page.getByRole('button', { name: '重试纹理', exact: true })).toBeVisible({ timeout: 15_000 });
  await page.unroute('**/assets/**/2k_earth_daymap.jpg');
  await page.getByRole('button', { name: '重试纹理', exact: true }).click();
  await expect(page.getByRole('button', { name: '重试纹理', exact: true })).toBeHidden({ timeout: 15_000 });
});

test('all ten targets remain navigable', async ({ page }) => {
  await page.goto('./');
  for (const name of ['太阳', '水星', '金星', '地球', '月球', '火星', '木星', '土星', '天王星', '海王星']) {
    await page.getByRole('button', { name: `选择${name}`, exact: true }).click();
    await expect(page.getByTestId('selected-body')).toHaveText(name);
    await expect(page.getByTestId('navigation-mode')).toHaveText('正在飞向');
    await expect(page.getByTestId('navigation-mode')).toContainText('环绕', { timeout: 15_000 });
  }
});

test('WebGL context loss is visible and can recover', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('canvas')).toBeVisible();
  await expect.poll(async () => page.locator('canvas').evaluate(canvas => {
    const observed = canvas as HTMLCanvasElement & { __solarDiagnostics?: { sampleCount: number } };
    return observed.__solarDiagnostics?.sampleCount ?? 0;
  })).toBeGreaterThan(2);
  const available = await page.locator('canvas').evaluate(canvas => {
    const gl = (canvas as HTMLCanvasElement).getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_lose_context');
    if (!ext) return false;
    ext.loseContext();
    setTimeout(() => ext.restoreContext(), 1800);
    return true;
  });
  test.skip(!available, 'Chrome does not expose WEBGL_lose_context');
  await expect(page.getByText(/图形上下文.*(丢失|恢复)/)).toBeVisible();
  await expect.poll(async () => page.locator('canvas').evaluate(canvas => {
    const observed = canvas as HTMLCanvasElement & { __solarDiagnostics?: { context: string } };
    return observed.__solarDiagnostics?.context;
  }), { timeout: 15_000 }).toBe('ready');
  await expect(page.getByTestId('selected-body')).toHaveText('地球');
});

test('context loss keeps its original timeout through resize and quality changes, then restores', async ({ page }) => {
  await page.goto('./');
  const read = () => page.locator('canvas').evaluate(canvas => {
    const element = canvas as HTMLCanvasElement & { __solarDiagnostics?: { sampleCount: number; context: string } };
    return { samples: element.__solarDiagnostics?.sampleCount ?? 0, context: element.__solarDiagnostics?.context,
      lost: element.getContext('webgl2')?.isContextLost() };
  });
  await expect.poll(async () => (await read()).samples).toBeGreaterThan(2);
  const extension = await page.locator('canvas').evaluateHandle(canvas =>
    (canvas as HTMLCanvasElement).getContext('webgl2')?.getExtension('WEBGL_lose_context'));
  test.skip(!await extension.evaluate(ext => Boolean(ext)), 'Chrome does not expose WEBGL_lose_context');
  await extension.evaluate(ext => ext!.loseContext());
  await expect.poll(async () => (await read()).context).toBe('lost');
  const stopped = await read();
  const stoppedTime = await page.getByTestId('simulation-time').innerText();
  await page.waitForTimeout(5000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('button', { name: '画面设置', exact: true }).click();
  await page.getByLabel('画质', { exact: true }).selectOption('low');
  await page.getByRole('button', { name: '画面设置', exact: true }).click();
  await expect(page.getByRole('button', { name: '重新加载', exact: true })).toBeVisible({ timeout: 6500 });
  expect(await read()).toEqual({ ...stopped, context: 'failed', lost: true });
  await expect(page.getByTestId('simulation-time')).toHaveText(stoppedTime);
  await extension.evaluate(ext => ext!.restoreContext());
  await expect.poll(async () => (await read()).context).toBe('ready');
  await expect.poll(async () => (await read()).samples).toBeGreaterThan(stopped.samples);
  await expect(page.getByRole('button', { name: '重新加载', exact: true })).toBeHidden();
  await extension.dispose();
});

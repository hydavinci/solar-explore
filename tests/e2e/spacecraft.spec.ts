import { expect, test, type Page } from '@playwright/test';
import type { SolarDiagnostics } from '../../src/rendering/SolarCanvas';

const missions = [
  { id: 'voyager-1', name: '旅行者1号', query: 'Voyager 1', date: '1977-09-05' },
  { id: 'voyager-2', name: '旅行者2号', query: 'Voyager 2', date: '1977-08-20' },
  { id: 'cassini', name: '卡西尼号', query: 'Cassini', date: '1997-10-15' },
  { id: 'juno', name: '朱诺号', query: 'Juno', date: '2011-08-05' },
  { id: 'new-horizons', name: '新视野号', query: 'New Horizons', date: '2006-01-19' },
  { id: 'tianwen-1', name: '天问一号', query: 'Tianwen-1', date: '2020-07-23' },
];
const scene = (page: Page) => page.getByTestId('scene-container').locator('canvas');
const readScene = (page: Page) => scene(page).evaluate(canvas => {
  const d = (canvas as HTMLCanvasElement & { __solarDiagnostics?: SolarDiagnostics }).__solarDiagnostics;
  if (!d) throw new Error('Scene not ready');
  return { navigation: d.navigation, clock: d.clock, selected: d.selected, context: d.context, frame: d.updateCount };
});
function expectUnchanged(before: Awaited<ReturnType<typeof readScene>>, after: Awaited<ReturnType<typeof readScene>>) {
  expect(after.clock.julianDay).toBe(before.clock.julianDay);
  expect(after.clock.paused).toBe(before.clock.paused);
  expect(after.navigation.target).toBe(before.navigation.target);
  expect(after.navigation.mode).toBe(before.navigation.mode);
  expect(Math.hypot(...after.navigation.positionKm.map((v, i) => v - before.navigation.positionKm[i]!))).toBeLessThanOrEqual(1e-6);
  expect(Math.hypot(...after.navigation.forward.map((v, i) => v - before.navigation.forward[i]!))).toBeLessThanOrEqual(1e-10);
}
async function pixels(page: Page, images: Buffer[]) {
  return page.evaluate(async sources => {
    const frames = await Promise.all(sources.map(async source => {
      const image = new Image();
      image.src = `data:image/png;base64,${source}`; await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Cannot read preview pixels');
      ctx.drawImage(image, 0, 0);
      return ctx.getImageData(0, 0, canvas.width, canvas.height);
    }));
    const first = frames[0]!, second = frames[1];
    let visible = 0, changed = 0;
    if (second && (first.width !== second.width || first.height !== second.height)) throw new Error('Preview size changed');
    for (let i = 0; i < first.data.length; i += 4) {
      if (Math.max(first.data[i]!, first.data[i + 1]!, first.data[i + 2]!) > 80) visible++;
      if (second && Math.abs(first.data[i]! - second.data[i]!) + Math.abs(first.data[i + 1]! - second.data[i + 1]!)
        + Math.abs(first.data[i + 2]! - second.data[i + 2]!) > 60) changed++;
    }
    return { visible, changed };
  }, images.map(image => image.toString('base64')));
}
async function openPreview(page: Page, name = '朱诺号') {
  await page.getByRole('tab', { name: '航天器', exact: true }).click();
  await page.getByRole('button', { name: `选择${name}`, exact: true }).click();
  await page.getByRole('button', { name: '查看三维模型', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: `${name}模型预览`, exact: true });
  await expect(dialog.locator('canvas')).toBeVisible();
  return dialog;
}
test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await expect.poll(async () => (await readScene(page)).frame).toBeGreaterThan(3);
  await expect.poll(async () => (await readScene(page)).clock.paused).toBe(true);
});

test('shows spacecraft information without inventing a position or moving the camera', async ({ page }) => {
  const before = await readScene(page);
  await page.getByRole('tab', { name: '航天器', exact: true }).click();
  expectUnchanged(before, await readScene(page));
  await expect(page.getByTestId('selected-body')).toHaveText('地球');
  await page.getByRole('searchbox').fill('Voyager 1');
  await page.getByRole('button', { name: '选择旅行者1号', exact: true }).click();
  await expect(page.getByTestId('selected-spacecraft')).toHaveText('旅行者1号');
  await expect(page.getByText('当前日期无轨迹', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '飞向航天器', exact: true })).toBeDisabled();
  await expect(page.locator('.distance-caption')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '环绕', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '跟随', exact: true })).toBeDisabled();
  await page.keyboard.press('g');
  await expect(page.getByRole('alert')).toContainText('超出历史轨迹范围');
  await page.getByRole('button', { name: '关闭错误', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expectUnchanged(before, await readScene(page));
  expect((await readScene(page)).selected).toBeNull();
  await expect(page.locator('.celestial-label')).toHaveCount(10);
  await page.getByRole('searchbox').fill('no such mission');
  await expect(page.getByText('没有匹配的航天器')).toBeVisible();
  await page.getByRole('searchbox').fill('旅行者2号');
  await page.getByRole('button', { name: '选择旅行者2号', exact: true }).click();
  await expect(page.getByTestId('selected-spacecraft')).toHaveText('旅行者2号');
});

for (const mission of missions) test(`shows sourced ${mission.id} details and a visible interactive model`, async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const before = await readScene(page);
  await page.getByRole('tab', { name: '航天器', exact: true }).click();
  await page.getByRole('searchbox').fill(mission.query);
  await page.getByRole('button', { name: `选择${mission.name}`, exact: true }).click();
  const info = page.getByRole('region', { name: '航天器资料', exact: true });
  await expect(info).toContainText(mission.date);
  await expect(info).toContainText('资料核验');
  const links = info.getByRole('link');
  expect(await links.count()).toBeGreaterThan(0);
  for (const link of await links.all()) {
    await expect(link).toHaveAttribute('href', /^https:\/\//);
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  }
  if (mission.id === 'tianwen-1') await expect(info).toContainText('环绕器');
  await page.getByRole('button', { name: '查看三维模型', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: `${mission.name}模型预览`, exact: true });
  await expect(dialog).toContainText('非工程模型');
  await expect(dialog).toContainText('非实时姿态');
  const canvas = dialog.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect.poll(async () => (await pixels(page, [await canvas.screenshot()])).visible).toBeGreaterThan(1000);
  const initial = await canvas.screenshot({ path: `.artifacts/spacecraft/${mission.id}.png` });
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.7, bounds.y + bounds.height * 0.6, { steps: 10 });
  await page.mouse.up();
  const rotated = await canvas.screenshot();
  expect((await pixels(page, [initial, rotated])).changed).toBeGreaterThan(500);
  await page.mouse.wheel(0, -500);
  await expect.poll(async () => (await pixels(page, [rotated, await canvas.screenshot()])).changed).toBeGreaterThan(300);
  await page.keyboard.press('w');
  await page.keyboard.press('g');
  await page.keyboard.press('h');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '查看三维模型', exact: true })).toBeFocused();
  expectUnchanged(before, await readScene(page));
  expect(errors).toEqual([]);
});

test('closing preview during a flight does not consume the flight cancellation', async ({ page }) => {
  await page.getByRole('button', { name: '选择海王星', exact: true }).click();
  await expect.poll(async () => (await readScene(page)).navigation.mode).toBe('flight');
  const before = await readScene(page);
  expect(before.navigation.mode).toBe('flight');
  const dialog = await openPreview(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  const after = await readScene(page);
  expect(after.navigation.target).toBe('neptune');
  expect(after.navigation.mode).not.toBe('free');
  expect(after.clock.julianDay).toBe(before.clock.julianDay);
  await expect(page.getByTestId('navigation-mode')).toHaveText('环绕观察', { timeout: 15_000 });
  await expect(page.getByTestId('selected-spacecraft')).toHaveText('朱诺号');
  await page.getByRole('tab', { name: '天体', exact: true }).click();
  await page.getByRole('button', { name: '选择地球', exact: true }).click();
  await expect.poll(async () => (await readScene(page)).navigation.mode).toBe('flight');
  await page.getByRole('tab', { name: '航天器', exact: true }).click();
  await page.getByRole('button', { name: '选择朱诺号', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('navigation-mode')).toHaveText('自由飞行');
});

test('a scene label returns from spacecraft to body details without flying', async ({ page }) => {
  await page.getByRole('button', { name: '设置日期', exact: true }).click();
  await page.getByLabel('模拟日期（UTC）', { exact: true }).fill('2026-10-15T01:10:00Z');
  await page.getByRole('button', { name: '应用日期', exact: true }).click();
  await expect.poll(async () => (await readScene(page)).clock.julianDay).toBeCloseTo(2461328.548611111, 8);
  const before = await readScene(page);
  await page.getByRole('tab', { name: '航天器', exact: true }).click();
  await page.getByRole('button', { name: '选择卡西尼号', exact: true }).click();
  await page.getByRole('button', { name: '定位土星', exact: true }).click();
  await expect(page.getByTestId('selected-body')).toHaveText('土星');
  await expect(page.getByTestId('selected-spacecraft')).toHaveCount(0);
  expectUnchanged(before, await readScene(page));
});

test('repeated preview lifecycles release canvases and restore single input handling', async ({ page }) => {
  test.setTimeout(60_000);
  const before = await readScene(page);
  await page.getByRole('tab', { name: '航天器', exact: true }).click();
  for (let i = 0; i < 12; i++) {
    const mission = missions[i % missions.length]!;
    await page.getByRole('button', { name: `选择${mission.name}`, exact: true }).click();
    await page.getByRole('button', { name: '查看三维模型', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect.poll(async () => (await pixels(page, [await dialog.locator('canvas').screenshot()])).visible).toBeGreaterThan(1000);
    await dialog.getByRole('button', { name: '关闭模型预览', exact: true }).click();
    await expect(page.locator('canvas')).toHaveCount(1);
  }
  expectUnchanged(before, await readScene(page));
  await page.getByRole('button', { name: '自由飞行', exact: true }).click();
  const speed = (await readScene(page)).navigation.speedMultiplier;
  await scene(page).hover({ position: { x: 720, y: 450 } });
  await page.mouse.wheel(0, 120);
  await expect.poll(async () => (await readScene(page)).navigation.speedMultiplier).toBe(speed / 2);
  await page.keyboard.press('h');
  await expect(page.getByText('按 H 显示界面')).toBeVisible();
  await page.keyboard.press('h');
  await expect(page.getByRole('searchbox')).toBeVisible();
});

test('preview-only context loss is reported locally and reopening draws again', async ({ page }) => {
  const dialog = await openPreview(page);
  await expect.poll(async () => (await pixels(page, [await dialog.locator('canvas').screenshot()])).visible).toBeGreaterThan(1000);
  const before = await readScene(page);
  const supported = await dialog.locator('canvas').evaluate(canvas => {
    const extension = (canvas as HTMLCanvasElement).getContext('webgl2')?.getExtension('WEBGL_lose_context');
    if (!extension) return false;
    extension.loseContext();
    return true;
  });
  test.skip(!supported, 'Chrome does not expose WEBGL_lose_context');
  await expect(dialog.getByRole('alert')).toContainText('上下文已丢失');
  await expect.poll(async () => (await readScene(page)).frame).toBeGreaterThan(before.frame + 5);
  expect((await readScene(page)).context).toBe('ready');
  expectUnchanged(before, await readScene(page));
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '查看三维模型', exact: true }).click();
  await expect.poll(async () => (await pixels(page, [await page.getByRole('dialog').locator('canvas').screenshot()])).visible).toBeGreaterThan(1000);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('failed preview WebGL initialization stays local and leaves the main scene usable', async ({ page }) => {
  const before = await readScene(page);
  await scene(page).evaluate(main => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: function(this: HTMLCanvasElement, contextId: string, ...options: unknown[]) {
        if (this !== main && contextId === 'webgl2') return null;
        return Reflect.apply(original, this, [contextId, ...options]);
      },
    });
  });
  await page.getByRole('tab', { name: '航天器', exact: true }).click();
  await page.getByRole('button', { name: '选择朱诺号', exact: true }).click();
  await page.getByRole('button', { name: '查看三维模型', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toContainText('初始化失败');
  expect((await readScene(page)).context).toBe('ready');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '查看三维模型', exact: true })).toBeFocused();
  await expect.poll(async () => (await readScene(page)).frame).toBeGreaterThan(before.frame + 5);
  expectUnchanged(before, await readScene(page));
});

for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
  test(`keeps details and preview controls usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const dialog = await openPreview(page, '旅行者1号');
    await expect(dialog.getByRole('button', { name: '关闭模型预览', exact: true })).toBeInViewport();
    await expect(dialog.getByRole('button', { name: '关闭模型预览', exact: true })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    const info = page.getByRole('region', { name: '航天器资料', exact: true });
    const time = page.locator('.time-panel');
    const infoBounds = (await info.boundingBox())!, timeBounds = (await time.boundingBox())!;
    expect(infoBounds.y + infoBounds.height).toBeLessThan(timeBounds.y);
    await info.getByRole('link').first().scrollIntoViewIfNeeded();
    await expect(info.getByRole('link').first()).toBeInViewport();
    await page.screenshot({ path: `.artifacts/spacecraft/layout-${viewport.width}.png` });
  });
}

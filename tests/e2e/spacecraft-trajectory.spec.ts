import { expect, test, type Page } from '@playwright/test';
import type { SolarDiagnostics } from '../../src/rendering/SolarCanvas';
import reference from '../../src/spacecraft/voyager1-reference.json' with { type: 'json' };

const canvas = (page: Page) => page.getByTestId('scene-container').locator('canvas');
const read = (page: Page) => canvas(page).evaluate(element => {
  const d = (element as HTMLCanvasElement & { __solarDiagnostics?: SolarDiagnostics }).__solarDiagnostics;
  if (!d) throw new Error('Main scene not ready');
  return {
    frame: d.updateCount, clock: d.clock, navigation: d.navigation, context: d.context,
    replay: d.replayActive, state: d.spacecraftState, jupiter: d.jupiterPositionKm,
    resource: d.trajectoryStatus, vertices: d.trajectoryVertices, screen: d.spacecraftScreen,
  };
});
async function boot(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await expect.poll(async () => (await read(page)).clock.paused).toBe(true);
}
async function selectVoyager(page: Page) {
  await page.getByRole('tab', { name: '航天器', exact: true }).click();
  await page.getByRole('button', { name: '选择旅行者1号', exact: true }).click();
}
async function enter(page: Page) {
  await selectVoyager(page);
  await page.getByRole('button', { name: '回放木星飞掠', exact: true }).click();
  await expect.poll(async () => (await read(page)).replay).toBe(true);
  await expect.poll(async () => (await read(page)).navigation.mode, { timeout: 15000 }).toBe('orbit');
}
async function date(page: Page, iso: string) {
  await page.getByRole('button', { name: '设置日期', exact: true }).click();
  await page.getByLabel('模拟日期（UTC）', { exact: true }).fill(iso);
  await page.getByRole('button', { name: '应用日期', exact: true }).click();
  await expect.poll(async () => (await read(page)).clock.julianDay).toBeCloseTo(Date.parse(iso)/86400000 + 2440587.5, 7);
}

for (const mode of ['真实尺度', '示意模式']) test(`draws actual, time-registered trajectory pixels in ${mode}`, async ({ page }) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await boot(page);
  await page.getByRole('button', { name: mode, exact: true }).click();
  await enter(page);
  const d = await read(page);
  expect(d.navigation.target).toBe('voyager-1');
  expect(d.clock.paused).toBe(true);
  expect(d.clock.rate).toBe(3600);
  expect(d.vertices).toBeGreaterThan(396);
  expect(d.screen?.visible).toBe(true);
  expect(d.jupiter).toEqual(d.state!.jupiter.positionKm);
  await expect(page.getByText('木星采用同源星历', { exact: true })).toBeVisible();
  await page.keyboard.press('h');
  const on = await canvas(page).screenshot({ path: `.artifacts/spacecraft/trajectory-${mode === '真实尺度' ? 'real' : 'schematic'}.png` });
  await page.keyboard.press('h');
  await page.getByRole('button', { name: '画面设置', exact: true }).click();
  await page.getByLabel('轨道线', { exact: true }).uncheck();
  await page.getByRole('button', { name: '隐藏界面', exact: true }).click();
  await expect.poll(async () => (await read(page)).vertices).toBe(0);
  const off = await canvas(page).screenshot();
  const warmPixels = await page.evaluate(async sources => {
    const images = await Promise.all(sources.map(async source => {
      const image = new Image(); image.src = `data:image/png;base64,${source}`; await image.decode();
      const c = document.createElement('canvas'); c.width = image.width; c.height = image.height;
      const ctx = c.getContext('2d')!; ctx.drawImage(image, 0, 0);
      return ctx.getImageData(0, 0, c.width, c.height);
    }));
    const a = images[0]!, b = images[1]!;
    let count = 0;
    for (let i = 0; i < a.data.length; i += 4) {
      if (a.data[i]! > a.data[i+2]! + 35 && a.data[i]! - b.data[i]! > 20) count++;
    }
    return count;
  }, [on.toString('base64'), off.toString('base64')]);
  expect(warmPixels).toBeGreaterThan(100);
  expect(errors).toEqual([]);
});

test('uses held-out source coordinates, follows and rewinds without accumulated drift', async ({ page }) => {
  await boot(page); await enter(page);
  const row = reference.samples.find(r => r[0]! > Date.parse('1979-03-05T00:00:00Z') && r[0]! < Date.parse('1979-03-06T00:00:00Z'))!;
  await date(page, new Date(row[0]!).toISOString());
  const sample = (await read(page)).state!;
  expect(Math.hypot(...sample.spacecraft.positionKm.map((v, i) => v-row[i+1]!))).toBeLessThanOrEqual(1);
  expect(Math.hypot(...sample.jupiter.positionKm.map((v, i) => v-row[i+7]!))).toBeLessThanOrEqual(1);
  await page.getByRole('button', { name: '跟随', exact: true }).click();
  await expect.poll(async () => (await read(page)).navigation.mode).toBe('follow');
  const before = await read(page);
  const offset = before.navigation.positionKm.map((v, i) => v - before.state!.spacecraft.positionKm[i]!);
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await expect.poll(async () => (await read(page)).clock.julianDay).toBeGreaterThan(before.clock.julianDay + 0.001);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await expect.poll(async () => (await read(page)).clock.paused).toBe(true);
  const after = await read(page);
  expect(Math.hypot(...after.navigation.positionKm.map((v, i) => v - after.state!.spacecraft.positionKm[i]! - offset[i]!))).toBeLessThan(0.001);
  await page.getByRole('button', { name: '倒放', exact: true }).click();
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await expect.poll(async () => (await read(page)).clock.julianDay).toBeLessThan(after.clock.julianDay - 0.001);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await expect.poll(async () => (await read(page)).clock.paused).toBe(true);
  await date(page, '2000-01-01T12:00:00Z');
  await expect.poll(async () => (await read(page)).replay).toBe(false);
  expect((await read(page)).state).toBeNull();
  expect((await read(page)).navigation.target).toBeNull();
  await expect(page.getByRole('button', { name: '定位旅行者1号', exact: true })).toHaveCount(0);
});

test('pauses and exits when a playback step crosses a guarded source boundary', async ({ page }) => {
  await boot(page); await enter(page);
  await date(page, '1979-03-06T06:06:58Z');
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await expect.poll(async () => (await read(page)).replay).toBe(false);
  const d = await read(page);
  expect(d.clock.paused).toBe(true);
  expect(d.state).toBeNull();
  expect(d.vertices).toBe(0);
  expect(d.navigation.target).toBeNull();
  await expect(page.getByRole('alert')).toContainText('数据段');
});

test('local asset errors stay local and retry does not auto-start historical replay', async ({ page }) => {
  const path = '**/trajectories/voyager-1-jupiter-1979.json';
  await page.route(path, route => route.fulfill({ status: 503, body: 'temporarily unavailable' }));
  await boot(page); await selectVoyager(page);
  await expect(page.getByRole('region', { name: '航天器资料' }).getByRole('alert')).toContainText('503');
  expect((await read(page)).context).toBe('ready');
  const before = await read(page);
  await page.unroute(path);
  await page.getByRole('button', { name: '重试轨迹加载', exact: true }).click();
  await expect.poll(async () => (await read(page)).resource).toBe('ready');
  const after = await read(page);
  expect(after.replay).toBe(false);
  expect(after.state).toBeNull();
  expect(after.clock.julianDay).toBe(before.clock.julianDay);
  expect(after.navigation.positionKm).toEqual(before.navigation.positionKm);
  await expect(page.getByRole('button', { name: '回放木星飞掠', exact: true })).toBeEnabled();
});

test('a preview remains isolated while a historical replay is active', async ({ page }) => {
  await boot(page); await enter(page);
  const before = await read(page);
  await page.getByRole('button', { name: '查看三维模型', exact: true }).click();
  await expect(page.getByRole('dialog').locator('canvas')).toBeVisible();
  await page.keyboard.press('g'); await page.keyboard.press('h'); await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const after = await read(page);
  expect(after.replay).toBe(true);
  // Real-frame speed easing continues while simulation time is paused; camera/input state must not change.
  expect({ ...after.navigation, speedKmPerSecond: before.navigation.speedKmPerSecond }).toEqual(before.navigation);
  expect(after.clock).toEqual(before.clock);
});

test('late loading at a covered historical date does not override a newer target', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/trajectories/voyager-1-jupiter-1979.json', async route => {
    await gate; await route.continue();
  });
  await boot(page); await selectVoyager(page);
  await expect(page.getByTestId('trajectory-status')).toHaveText('正在加载历史轨迹');
  await page.getByRole('tab', { name: '天体', exact: true }).click();
  await page.getByRole('button', { name: '选择火星', exact: true }).click();
  await date(page, '1979-03-05T12:00:00Z');
  const before = await read(page);
  release();
  await expect.poll(async () => (await read(page)).resource).toBe('ready');
  const after = await read(page);
  expect(after.replay).toBe(false);
  expect(after.state).toBeNull();
  expect(after.jupiter).toEqual(before.jupiter);
  expect(after.navigation.target).toBe('mars');
  expect(after.navigation.positionKm).toEqual(before.navigation.positionKm);
  expect(after.clock).toEqual(before.clock);
});

test('extreme spacecraft zoom keeps the marker visible and can zoom back out', async ({ page }) => {
  await boot(page); await enter(page);
  const distance = async () => {
    const d = await read(page);
    return Math.hypot(...d.navigation.positionKm.map((v, i) => v - d.state!.spacecraft.positionKm[i]!));
  };
  await canvas(page).hover({ position: { x: 720, y: 450 } });
  // The input controller deliberately normalizes each wheel event to one step.
  for (let i = 0; i < 75; i++) await page.mouse.wheel(0, -120);
  await expect.poll(distance).toBeLessThan(2);
  expect((await read(page)).screen?.visible).toBe(true);
  const image = await canvas(page).screenshot({ path: '.artifacts/spacecraft/trajectory-close.png' });
  const visiblePixels = await page.evaluate(async source => {
    const img = new Image(); img.src = `data:image/png;base64,${source}`; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const context = c.getContext('2d')!; context.drawImage(img, 0, 0);
    const pixels = context.getImageData(Math.floor(c.width/2)-8, Math.floor(c.height/2)-8, 16, 16).data;
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i]! > 200 && pixels[i+1]! > 205 && pixels[i+2]! > 100) count++;
    return count;
  }, image.toString('base64'));
  expect(visiblePixels).toBeGreaterThan(10);
  const before = await distance();
  await page.mouse.wheel(0, 120);
  await expect.poll(distance).toBeGreaterThan(before * 1.2);
});

test('a spacecraft point click selects only, and an out-and-back drag does not select it', async ({ page }) => {
  await boot(page); await enter(page);
  await page.getByRole('button', { name: '定位木星', exact: true }).click();
  await expect(page.getByTestId('selected-body')).toHaveText('木星');
  const point = (await read(page)).screen!, bounds = (await canvas(page).boundingBox())!;
  const x = bounds.x + point.x, y = bounds.y + point.y;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + 40, y, { steps: 4 });
  await page.mouse.move(x, y, { steps: 4 }); await page.mouse.up();
  await expect(page.getByTestId('selected-body')).toHaveText('木星');
  const frame = (await read(page)).frame;
  await expect.poll(async () => (await read(page)).frame).toBeGreaterThan(frame + 2);
  const before = await read(page);
  await page.mouse.click(x, y);
  await expect(page.getByTestId('selected-spacecraft')).toHaveText('旅行者1号');
  const after = await read(page);
  expect(after.navigation.mode).toBe('orbit');
  expect(after.navigation.positionKm).toEqual(before.navigation.positionKm);
  expect(after.clock).toEqual(before.clock);
});

test('an active replay survives quality change and WebGL restoration', async ({ page }) => {
  await boot(page); await enter(page);
  const before = await read(page);
  await page.getByRole('button', { name: '画面设置', exact: true }).click();
  await page.getByLabel('画质', { exact: true }).selectOption('low');
  await page.getByRole('button', { name: '画面设置', exact: true }).click();
  const supported = await canvas(page).evaluate(element => {
    const c = element as HTMLCanvasElement & { __replayRestore?: () => void };
    const extension = c.getContext('webgl2')?.getExtension('WEBGL_lose_context');
    if (!extension) return false;
    c.__replayRestore = () => { extension.restoreContext(); delete c.__replayRestore; };
    extension.loseContext(); return true;
  });
  test.skip(!supported, 'Chrome does not expose WEBGL_lose_context');
  await expect.poll(async () => (await read(page)).context).toBe('lost');
  await canvas(page).evaluate(element => (element as HTMLCanvasElement & { __replayRestore?: () => void }).__replayRestore?.());
  await expect.poll(async () => (await read(page)).context).toBe('ready');
  await expect.poll(async () => (await read(page)).vertices).toBeGreaterThan(396);
  const after = await read(page);
  expect(after.replay).toBe(true);
  expect(after.state).toEqual(before.state);
  expect(after.navigation.positionKm).toEqual(before.navigation.positionKm);
  expect(after.clock).toEqual(before.clock);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
  test(`keeps active replay controls and source information usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await boot(page); await enter(page);
    await expect(page.getByRole('button', { name: '退出历史回放', exact: true })).toBeInViewport();
    await page.getByText('覆盖分段与数据来源', { exact: true }).click();
    const link = page.getByRole('link', { name: 'NASA PDS：星历档案', exact: false });
    await link.scrollIntoViewIfNeeded();
    const region = (await page.locator('.spacecraft-details').boundingBox())!, bounds = (await link.boundingBox())!;
    expect(bounds.y).toBeGreaterThanOrEqual(region.y - 1);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(region.y + region.height + 1);
    const panel = (await page.getByRole('region', { name: '航天器资料' }).boundingBox())!;
    const time = (await page.locator('.time-panel').boundingBox())!;
    expect(panel.y + panel.height).toBeLessThan(time.y);
    await page.screenshot({ path: `.artifacts/spacecraft/replay-layout-${viewport.width}.png` });
  });
}

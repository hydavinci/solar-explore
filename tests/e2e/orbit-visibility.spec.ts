import { expect, test } from '@playwright/test';
import type { SolarDiagnostics } from '../../src/rendering/SolarCanvas';

for (const scale of ['真实尺度', '示意模式']) test(`overview orbit lines stand out from the background in ${scale}`, async ({ page }, testInfo) => {
  await page.goto('./');
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.getByRole('button', { name: scale, exact: true }).click();
  await page.getByRole('button', { name: '太阳系全景', exact: true }).click();
  await page.getByRole('button', { name: '画面设置', exact: true }).click();
  await page.getByLabel('天体标签', { exact: true }).uncheck();
  await page.getByLabel('轨道线', { exact: true }).uncheck();
  await expect(page.locator('.resource-status')).toHaveCount(0);
  await page.getByRole('button', { name: '隐藏界面', exact: true }).click();
  const read = () => page.locator('canvas').evaluate(canvas => {
    const diagnostics = (canvas as HTMLCanvasElement & { __solarDiagnostics?: SolarDiagnostics }).__solarDiagnostics;
    if (!diagnostics) throw new Error('Scene not ready');
    return { frame: diagnostics.updateCount, calls: diagnostics.renderCalls };
  });
  await expect.poll(async () => (await read()).frame).toBeGreaterThan(30);
  const hidden = await read();
  const off = await page.screenshot({ path: testInfo.outputPath('orbits-off.png') });
  await page.keyboard.press('h');
  await page.getByRole('button', { name: '画面设置', exact: true }).click();
  await page.getByLabel('轨道线', { exact: true }).check();
  await page.getByRole('button', { name: '隐藏界面', exact: true }).click();
  await expect.poll(async () => (await read()).calls).toBeGreaterThanOrEqual(hidden.calls + 9);
  const on = await page.screenshot({ path: testInfo.outputPath('orbits-on.png') });
  const contrast = await page.evaluate(async sources => {
    const pixels = await Promise.all(sources.map(async source => {
      const image = new Image();
      image.src = `data:image/png;base64,${source}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Cannot measure screenshot pixels');
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, canvas.width, canvas.height);
    }));
    const [before, after] = pixels;
    if (!before || !after || before.width !== after.width || before.height !== after.height) throw new Error('Mismatched screenshots');
    const differences: number[] = [];
    for (let y = Math.floor(before.height * 0.15); y < before.height * 0.8; y++) {
      for (let x = Math.floor(before.width * 0.05); x < before.width * 0.95; x++) {
        const index = (y * before.width + x) * 4;
        const brightness = (data: Uint8ClampedArray) => 0.2126 * data[index]! + 0.7152 * data[index + 1]! + 0.0722 * data[index + 2]!;
        const background = brightness(before.data), difference = brightness(after.data) - background;
        if (background < 30 && difference > 5) differences.push(difference);
      }
    }
    differences.sort((a, b) => a - b);
    return { pixels: differences.length, medianBrightnessGain: differences[Math.floor(differences.length / 2)] ?? 0 };
  }, [off.toString('base64'), on.toString('base64')]);
  await testInfo.attach('orbit-contrast', { body: JSON.stringify(contrast), contentType: 'application/json' });
  expect(contrast.pixels).toBeGreaterThan(1000);
  expect(contrast.medianBrightnessGain).toBeGreaterThanOrEqual(25);
});

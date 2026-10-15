import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const baseURL = process.env.SOLAR_URL ?? 'http://127.0.0.1:4173';
const output = process.env.SOLAR_REPORT_DIR ?? '.artifacts/performance';
const warmup = Number(process.env.SOLAR_WARMUP_MS ?? 10000);
const duration = Number(process.env.SOLAR_SAMPLE_MS ?? 60000);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: process.env.SOLAR_HEADED !== '1' });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseURL);
  await page.getByTestId('selected-body').waitFor();
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.getByRole('button', { name: '设置日期', exact: true }).click();
  await page.getByLabel('模拟日期（UTC）').fill('2026-10-13T12:00:00Z');
  await page.getByRole('button', { name: '应用日期', exact: true }).click();
  const scenarios = [
    { name: 'earth', target: '地球' },
    { name: 'saturn', target: '土星' },
    { name: 'sun', target: '太阳' },
    { name: 'overview', target: null },
  ];
  const results = [];
  for (const scenario of scenarios) {
    if (scenario.target) {
      await page.getByRole('button', { name: `选择${scenario.target}`, exact: true }).click();
      await page.getByRole('button', { name: '飞向天体', exact: true }).click();
      await expect(page.getByTestId('navigation-mode')).toContainText('环绕', { timeout: 15000 });
    } else await page.getByRole('button', { name: '太阳系全景', exact: true }).click();
    await page.waitForTimeout(warmup);
    const samples = await page.evaluate(ms => new Promise(resolveSamples => {
      const samples = [];
      let previous = performance.now();
      const start = previous;
      const collect = now => {
        samples.push(now - previous);
        previous = now;
        if (now - start >= ms) resolveSamples(samples);
        else requestAnimationFrame(collect);
      };
      requestAnimationFrame(collect);
    }), duration);
    const sorted = samples.filter(n => n > 0).sort((a, b) => a - b);
    if (!sorted.length) throw new Error('No frame timing evidence collected');
    const info = await page.locator('canvas').evaluate(canvas => {
      const gl = canvas.getContext('webgl2');
      const debug = gl?.getExtension('WEBGL_debug_renderer_info');
      return {
        width: canvas.width, height: canvas.height,
        renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unavailable',
        userAgent: navigator.userAgent,
      };
    });
    results.push({
      scene: scenario.name, ...info, samples: sorted.length,
      medianMs: sorted[Math.floor(sorted.length / 2)],
      p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    });
    await page.screenshot({ path: resolve(output, `${scenario.name}.png`) });
  }
  await writeFile(resolve(output, 'results.json'), JSON.stringify({
    measuredAt: new Date().toISOString(),
    mode: process.env.SOLAR_HEADED === '1' ? 'headed' : 'headless',
    warmupMs: warmup, durationMs: duration, results, errors,
    note: 'This browser measurement is not proof of acceptance on a different target machine.',
  }, null, 2));
  console.log(JSON.stringify({ results, errors }, null, 2));
} finally {
  await browser.close();
}

import { expect, test } from '@playwright/test';
import type { SolarDiagnostics } from '../../src/rendering/SolarCanvas';

test('repeated real-mode production flights advance and finish at the reported stall date', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors: string[] = [], flights: object[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.getByRole('button', { name: '设置日期', exact: true }).click();
  await page.getByLabel('模拟日期（UTC）').fill('2026-10-13T19:46:28.156Z');
  await page.getByRole('button', { name: '应用日期', exact: true }).click();
  const read = () => page.locator('canvas').evaluate(canvas => {
    const d = (canvas as HTMLCanvasElement & { __solarDiagnostics?: SolarDiagnostics }).__solarDiagnostics!;
    return { updates: d.updateCount, callbacks: d.frameCallbacks, delta: d.appliedDeltaSeconds,
      context: d.context, clock: d.clock, navigation: d.navigation, issue: d.issue };
  });
  await expect.poll(async () => (await read()).updates).toBeGreaterThan(2);
  try {
    for (let iteration = 1; iteration <= 5; iteration++) {
      for (const target of ['地球', '土星', '海王星', '地球']) {
        const samples: Awaited<ReturnType<typeof read>>[] = [];
        flights.push({ iteration, target, samples });
        await page.getByRole('button', { name: `选择${target}`, exact: true }).click();
        await page.getByRole('button', { name: '飞向天体', exact: true }).click();
        await expect(page.getByTestId('navigation-mode')).toHaveText('正在飞向');
        let observedFlight = false;
        await expect.poll(async () => {
          const frame = await read();
          samples.push(frame);
          observedFlight ||= frame.navigation.mode === 'flight';
          return observedFlight && frame.navigation.mode === 'orbit';
        }, { timeout: 15_000, intervals: [100] }).toBe(true);
        const first = samples[0]!, last = samples.at(-1)!;
        expect(last.updates).toBeGreaterThan(first.updates);
        expect(last.clock.hidden).toBe(false);
        expect(last.context).toBe('ready');
        expect(last.issue).toBeNull();
        await expect(page.getByTestId('navigation-mode')).toHaveText('环绕观察');
      }
    }
    expect(errors).toEqual([]);
  } finally {
    await testInfo.attach('flight-runtime-samples', { body: JSON.stringify({ errors, flights }, null, 2), contentType: 'application/json' });
  }
});

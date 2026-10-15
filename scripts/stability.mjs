import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const url = process.env.SOLAR_URL ?? 'http://127.0.0.1:4173';
const output = process.env.SOLAR_REPORT_DIR ?? '.artifacts/stability';
const date = process.env.SOLAR_DATE ?? '2026-10-13T19:46:28.156Z';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.getByTestId('selected-body').waitFor();
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.getByRole('button', { name: '设置日期', exact: true }).click();
  await page.getByLabel('模拟日期（UTC）').fill(date);
  await page.getByRole('button', { name: '应用日期', exact: true }).click();
  const checkpoints = [];
  const flightSamples = [];
  const flights = [];
  const capture = (includeFrames = false) => page.locator('canvas').evaluate((canvas, includeFrames) => {
    const diagnostics = canvas.__solarDiagnostics;
    if (!diagnostics) throw new Error('Renderer diagnostics not ready');
    return {
      cacheBytes: diagnostics.cacheBytes,
      sampleCount: diagnostics.sampleCount,
      selected: diagnostics.selected,
      context: diagnostics.context,
      frameCallbacks: diagnostics.frameCallbacks, updateCount: diagnostics.updateCount,
      rawDeltaSeconds: diagnostics.rawDeltaSeconds, appliedDeltaSeconds: diagnostics.appliedDeltaSeconds,
      navigation: diagnostics.navigation, clock: diagnostics.clock, issue: diagnostics.issue,
      documentHidden: document.hidden,
      browserWallTimeMs: Date.now(), browserMonotonicTimeMs: performance.now(),
      frameWindowNextIndex: diagnostics.nextIndex,
      frames: includeFrames ? Array.from(diagnostics.frameTimesMs).filter(n => n > 0) : undefined,
    };
  }, includeFrames);
  await expect.poll(async () => (await capture()).sampleCount).toBeGreaterThan(2);
  for (let iteration = 1; iteration <= 10; iteration++) {
    for (const target of ['地球', '土星', '海王星', '地球']) {
      console.log(`Flight ${iteration}: ${target}`);
      await page.getByRole('button', { name: `选择${target}`, exact: true }).click();
      await page.getByRole('button', { name: '飞向天体', exact: true }).click();
      const started = { wallTimeMs: Date.now(), monotonicTimeMs: performance.now() }, samples = [];
      const elapsed = () => ({ wallElapsedMs: Date.now() - started.wallTimeMs,
        monotonicElapsedMs: performance.now() - started.monotonicTimeMs });
      let observedFlight = false;
      let phase = 'awaiting-flight-start';
      const flight = { iteration, target, started, samples, pollAttempts: [], observerHeartbeats: [] };
      const heartbeat = setInterval(() => flight.observerHeartbeats.push(elapsed()), 100);
      flights.push(flight);
      try {
        await expect(page.getByTestId('navigation-mode')).toContainText('正在飞向');
        phase = 'observing-flight';
        await expect.poll(async () => {
          const attempt = { requested: elapsed(), received: null };
          flight.pollAttempts.push(attempt);
          const diagnostics = await capture();
          attempt.received = elapsed();
          const sample = { ...attempt.requested, ...diagnostics, received: attempt.received };
          samples.push(sample);
          observedFlight ||= sample.navigation.mode === 'flight';
          return observedFlight && sample.navigation.mode === 'orbit';
        }, { timeout: 15000, intervals: [100] }).toBe(true);
        flight.wallDurationMs = Date.now() - started.wallTimeMs;
        flight.monotonicDurationMs = performance.now() - started.monotonicTimeMs;
        phase = 'checking-completion';
        await expect(page.getByTestId('navigation-mode')).toContainText('环绕');
        expect(samples.at(-1).issue).toBeNull();
      } catch (error) {
        const caught = elapsed();
        // Capture before screenshot work can advance the scene and obscure the failing observation.
        const { frames, ...diagnostics } = await capture(true);
        const captured = elapsed();
        const observation = { phase, caught, captured, observedFlight,
          outcome: phase === 'observing-flight' && observedFlight && diagnostics.navigation.mode === 'orbit'
            ? 'observation-timeout-flight-complete-at-capture' : 'regression-failure',
          error: { name: error.name, message: error.message } };
        const result = { measuredAt: new Date().toISOString(), date, iteration, target, errors, diagnostics, observation,
          retainedFrames: frames.length, frames, body: await page.locator('body').innerText(), flights };
        await writeFile(resolve(output, 'failure.json'), JSON.stringify(result, null, 2));
        await page.screenshot({ path: resolve(output, 'failure.png') });
        console.error(JSON.stringify({ iteration, target, errors, diagnostics, observation, evidence: resolve(output, 'failure.json') }));
        throw error;
      } finally {
        clearInterval(heartbeat);
      }
      await writeFile(resolve(output, 'flights.json'), JSON.stringify({ date, flights }, null, 2));
      await page.waitForTimeout(500);
    }
    if ([1, 5, 10].includes(iteration)) {
      await page.getByRole('button', { name: '画面设置', exact: true }).click();
      await page.getByLabel('诊断信息', { exact: true }).check();
      const resourceText = await page.locator('.diagnostics').innerText();
      await page.getByRole('button', { name: '画面设置', exact: true }).click();
      const { frames, ...metrics } = await capture(true);
      checkpoints.push({ iteration, ...metrics, resourceText });
      if (iteration === 10) flightSamples.push(...frames);
    }
  }
  flightSamples.sort((a, b) => a - b);
  const result = {
    measuredAt: new Date().toISOString(), mode: 'headless', date,
    checkpoints, errors,
    flightMedianMs: flightSamples[Math.floor(flightSamples.length / 2)],
    flightP95Ms: flightSamples[Math.ceil(flightSamples.length * 0.95) - 1],
    note: 'Repeated flights with intervening settle frames. Tail buffer includes loading, UI and settled time; not pure-flight acceptance.',
  };
  expect(errors).toEqual([]);
  await writeFile(resolve(output, 'results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}

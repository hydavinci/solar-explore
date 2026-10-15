# Voyager 1 Historical Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user selected inline execution; do not launch subagents.

**Goal:** Deliver the first actual spacecraft trajectory: Voyager 1's archived 1979 Jupiter encounter, with matching Jupiter positions, explicit historical replay, navigation and honest coverage.

**Architecture:** Convert the acquired NASA PDS kernel into validated local state samples. A separately loaded trajectory resource feeds an explicit runtime replay context; only active, valid replay replaces Jupiter's position. Navigation resolves spacecraft targets independently of the planetary catalog, and rendering uses the same physical or Jupiter-local mapping for positions and lines.

**Tech Stack:** Existing React, TypeScript, Three.js/R3F, Vitest and Playwright; offline importer using SpiceyPy 8.3.0 / CSPICE N0067 in an isolated Python environment.

**Spec:** `docs/superpowers/specs/2026-10-15-spacecraft-explorer-design.md`, especially section 10, reviewed and approved by the user.

**Status:** Delivered on 2026-10-15. All six tasks below are complete for this one archived encounter; the other five spacecraft still have no published trajectory. Execution and review stayed inline without subagents or Git operations.

## Global Constraints

- No Git repository exists. Do not initialize Git, create worktrees, commit, push or touch port 5173.
- Reuse the authorized dev server at `http://127.0.0.1:5174`; do not start another server.
- `BODY_IDS` and planetary `Catalog` remain unchanged. Only Voyager 1 gains a trajectory.
- Physical output is heliocentric `ECLIPJ2000`, km and km/s. Import UTC correctly using the acquired LSK.
- Source-reproduction position errors for both spacecraft and Jupiter must be measured at no more than 1 km; this is not an absolute orbit accuracy claim.
- No interpolation/extrapolation across gaps or source boundaries; no stale position, synthetic orbit or automatic date jump.
- Explicit replay entry uses `1979-03-05T12:00:00Z`, paused, rate 3600. The timestamp is an observation preset, not a claimed exact closest approach.
- Out-of-range replay exits, removes the craft/trajectory, and stops craft navigation. Natural boundary crossing pauses; a manual date change preserves the requested date and pause state.
- Unknown reconstruction/prediction classification and unspecified upstream license remain explicit. Do not redistribute original kernels in `public/`.
- Preserve StrictMode ownership, single runtime tick per frame, collision protection, 5 px drag threshold and preview input isolation.

## File responsibilities and shared interfaces

| File | Responsibility |
|---|---|
| `scripts/import_voyager1.py`, `scripts/test_import_voyager1.py`, `scripts/requirements-trajectories.txt` | Reproducible SPICE conversion, adaptive sampling and independent dense validation |
| `public/trajectories/voyager-1-jupiter-1979.json` | Generated numerical samples only |
| `src/spacecraft/voyager1-manifest.json` | Generated bundled asset identity, digest, published coverage and source metadata |
| `src/spacecraft/voyager1-reference.json` | Generated held-out vectors used by JS unit tests, not by interpolation |
| `src/spacecraft/trajectory.ts`, `.test.ts` | Types, strict decoding, digest-checked local loading and absolute-time interpolation |
| `src/navigation/target.ts`, `.test.ts` | Resolve a body or an available spacecraft without modifying physical catalogs |
| `src/rendering/runtime.ts`, `.test.ts` | Resource/replay lifecycle, source-consistent frame evaluation, time and navigation commands |
| `src/navigation/types.ts`, `controller.ts`, `.test.ts` | Target union and existing navigation algorithms consuming resolved target parameters |
| `src/rendering/display-mapping.ts`, `.test.ts` | Shared Jupiter-local point/camera mapping and unchanged planetary collision geometry |
| `src/rendering/spacecraft-scene.ts`, `.test.ts` | Reusable trajectory buffers and position marker |
| `src/rendering/SolarCanvas.tsx`, `orbit-guides.ts` | Scene lifecycle, labels/selection, diagnostics, archive-time Jupiter guide suppression |
| `src/spacecraft/catalog.ts`, `.test.ts`, `src/App.tsx`, `src/ui/SpacecraftPanel.tsx`, `src/app.css` | Published descriptor, actions, coverage/replay/source/error UI |
| `tests/e2e/spacecraft-trajectory.spec.ts`, `spacecraft.spec.ts` | Real-data replay browser coverage and narrow updates to Voyager 1's former missing-data expectations |
| `README.md`, `docs/data-sources.md`, `docs/asset-credits.md`, `src/ui/HelpPanel.tsx` | Actual delivery boundary, provenance, importer instructions and replay operation |

Shared data signatures:

```ts
type StateSample = readonly [
  utcMs: number,
  x: number, y: number, z: number,
  vx: number, vy: number, vz: number,
  jx: number, jy: number, jz: number,
  jvx: number, jvy: number, jvz: number,
];
interface TrajectorySegment {
  readonly source: string;
  readonly startUtcMs: number;
  readonly endUtcMs: number;
  readonly samples: readonly StateSample[];
}
interface TrajectoryData {
  readonly schemaVersion: 1;
  readonly id: 'voyager-1-jupiter-1979';
  readonly spacecraftId: 'voyager-1';
  readonly center: 'SUN';
  readonly frame: 'ECLIPJ2000';
  readonly timeScale: 'UTC';
  readonly positionUnit: 'km';
  readonly velocityUnit: 'km/s';
  readonly segments: readonly TrajectorySegment[];
}
interface StateVector {
  readonly positionKm: Vec3;
  readonly velocityKmPerSecond: Vec3;
}
interface TrajectorySample {
  readonly utcMs: number;
  readonly segmentIndex: number;
  readonly spacecraft: StateVector;
  readonly jupiter: StateVector;
}
type TrajectoryResource =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly data: TrajectoryData }
  | { readonly kind: 'error'; readonly message: string };
```

`decodeTrajectory(input: unknown): TrajectoryData` throws for invalid input. `loadTrajectory(signal: AbortSignal): Promise<TrajectoryData>` loads the manifest's local file and validates its SHA-256. `sampleTrajectory(data: TrajectoryData, utcMs: number): TrajectorySample | null` returns null only for valid finite dates outside published segments. `utcMilliseconds(julianDay: number): number` uses `(julianDay - 2440587.5) * 86400000`.

### Task 1: Produce verified numerical assets

**Files:** importer/test/requirements, generated trajectory/manifest/reference files, `.artifacts/spacecraft-sources/voyager1-jupiter/validation.json`.

**Consumes:** downloaded `vg1_jup.spk`, `leapsecs.ker`, labels and catalog.

**Produces:** shared `TrajectoryData`, manifest with URL/digest/intervals/source caveats, held-out state rows and a dense validation report.

- [x] Write Python tests before the importer: exact cubic reproduction for a Hermite function, strict source-segment boundary trimming, rejection of reversed/non-finite intervals and checksum rejection.

```python
def test_hermite_reproduces_cubic(self):
    from import_voyager1 import hermite
    self.assertAlmostEqual(hermite(0, 8, 0, 12, 2, 0.25), 0.125)

def test_bad_source_digest_is_rejected(self):
    from import_voyager1 import verify_digest
    with self.assertRaisesRegex(ValueError, "SHA-256"):
        verify_digest(Path(__file__), "0" * 64)
```

- [x] Run the missing-import RED check using the session venv's Python: `python -m unittest discover -s scripts -p 'test_import_voyager1.py'`.
- [x] Implement digest verification and use `spiceypy.furnsh` for both whole kernels; never use `lmpool` on a full kernel containing descriptive headers. Enumerate DAF descriptors for `-31`, `5`, `10`, `599`; collect boundaries intersecting craft coverage. Trim each interval inward to whole UTC milliseconds with a documented guard. Use `spkezr(target, et, 'ECLIPJ2000', 'NONE', 'SUN')`.
- [x] Evaluate cubic Hermite with UTC seconds as the independent interval:

```python
def hermite(p0, p1, v0, v1, seconds, t):
    return (2*t**3 - 3*t**2 + 1)*p0 + (t**3 - 2*t**2 + t)*seconds*v0 \
        + (-2*t**3 + 3*t**2)*p1 + (t**3 - t**2)*seconds*v1
```

Convert SPICE velocity derivatives to the UTC sampling axis using a symmetric finite difference of UTC-to-ET conversion over 20 seconds. Split candidate intervals until independent quarter/mid/three-quarter checks for both objects are below 0.25 km. Limit candidate intervals to at most six hours; throw if the minimum step or point limit is reached rather than weakening tolerance.
- [x] Validate the generated/reloaded asset at a separate one-minute grid, additional non-dyadic fractions, source boundaries and flyby neighborhoods. Any maximum above 1 km fails generation. Save measured maxima, counts, worst dates, tool versions, hashes, source-frame metadata, trimming and release caveats.
- [x] Run the importer against the acquired files, then rerun Python units. Persist only generated numeric JSON and the small manifest/reference fixtures for the frontend; original archives stay in `.artifacts/`.

### Task 2: Load, validate and sample the local trajectory

**Files:** `src/spacecraft/trajectory.ts`, `.test.ts`, `catalog.ts`, `catalog.test.ts`.

**Consumes:** Task 1 data and manifest.

**Produces:** the shared decode/load/query functions and a catalog descriptor for only Voyager 1.

- [x] Add RED tests for malformed vectors, frame/unit mismatch, out-of-order/overlapping samples, checksums and held-out real positions. Test every segment's inclusive endpoints, between-segment gaps, pause/repeat queries and reverse query order.

```ts
it('matches withheld source positions, not merely its own knots', () => {
  for (const row of reference.samples) {
    const state = sampleTrajectory(data, row[0]);
    expect(state).not.toBeNull();
    expect(Math.hypot(...state!.spacecraft.positionKm.map((v, i) => v - row[i + 1]!)))
      .toBeLessThanOrEqual(1);
    expect(Math.hypot(...state!.jupiter.positionKm.map((v, i) => v - row[i + 7]!)))
      .toBeLessThanOrEqual(1);
  }
});
```

- [x] Run `npm test -- src/spacecraft/trajectory.test.ts` and confirm RED.
- [x] Implement strict structural decoding without unsafe casts. Require the exact 13 finite fields per row, at least two knots per segment, endpoints matching coverage, strictly increasing knot times and disjoint segments. Binary-search segments and knots; return source endpoints exactly. Use the same Hermite polynomial and its derivative for velocities.
- [x] Implement fetch plus `crypto.subtle.digest('SHA-256', bytes)`, then UTF-8/JSON decoding. Throw descriptive errors for non-OK HTTP, corrupt bytes/schema and absent secure digest capability. Preserve AbortError for runtime cancellation.
- [x] Extend `SpacecraftDefinition.trajectory` with `{ kind: 'published'; ...manifest descriptor }`; keep the other five `missing`.
- [x] Run trajectory/catalog units and `npm run typecheck`; fix only directly affected assumptions such as unconditional `.reason` access.

### Task 3: Explicit replay state and source-consistent frames

**Files:** `runtime.ts`, `runtime.test.ts`; App effect for resource connection added with UI in Task 5.

**Consumes:** Task 2 loader/query.

**Produces:** `FrameSnapshot.trajectory: TrajectoryResource`, `replayActive: boolean`, `spacecraftState: TrajectorySample | null`, commands `load-trajectory`, `enter-replay`, `exit-replay`, `activate-spacecraft`, `fly-to-spacecraft`.

`createRuntime` gains a third optional injected loader `(signal: AbortSignal) => Promise<TrajectoryData>` for isolated tests. Add `cancelTrajectoryLoad(): void`; App will pair its load effect with this cleanup. Constructor remains side-effect-free.

- [x] Add RED tests with a controlled deferred loader: completion cannot change clock, camera, selection or Jupiter; abort/retry ignores old completion; failure preserves the main simulation; explicit entry changes date/pause/rate/source; exit and gap handling are deterministic.

```ts
const before = runtime.getSnapshot();
runtime.dispatch({ type: 'load-trajectory' });
resolveLoad(data);
await Promise.resolve();
expect(runtime.getSnapshot().clock).toEqual(before.clock);
expect(runtime.getSnapshot().navigation).toEqual(before.navigation);
expect(runtime.getSnapshot().world.bodies.jupiter).toEqual(before.world.bodies.jupiter);
```

- [x] Run runtime units to confirm RED.
- [x] Own request generation and AbortController inside runtime. Publish loading/error/ready changes without starting navigation. Do not clear a still-valid dataset during a redundant load. Cleanup aborts the active request and invalidates its generation; obsolete callbacks and disposal cannot publish.
- [x] Centralize frame evaluation: evaluate normal world, sample only for active replay, replace Jupiter's position immutably, then advance navigation once. `enter-replay` requires ready valid data, selects Voyager 1, sets the preset time paused/rate 3600, and starts a safe flight through Task 4's resolver. No unready command stores a deferred jump intent.
- [x] `activate-spacecraft` is the list intent: outside coverage it is selection-only; inside ready coverage it enables the context and flies. `select-spacecraft` remains selection-only for scene labels. `fly-to-spacecraft`/G require active valid state; otherwise issue an explicit reason.
- [x] On any invalid-date transition, exit and clear craft targets before navigation can index them. Natural clock steps also inspect crossed segment boundaries, not just the final endpoint, so a large forward/backward step cannot skip a gap unnoticed. Restore baseline world for the requested date and preserve collision safety. A manual date command never snaps back into coverage.
- [x] Run runtime tests including baseline single-tick/selection behavior.

### Task 4: Resolve real spacecraft navigation without fake planets

**Files:** `navigation/target.ts`, `.test.ts`, `types.ts`, `controller.ts`, `controller.test.ts`, `display-mapping.ts`, `.test.ts`, runtime integration.

**Consumes:** active `TrajectorySample`.

**Produces:**

```ts
type NavigationTargetId = BodyId | SpacecraftId;
interface ResolvedTarget {
  readonly id: NavigationTargetId;
  readonly positionKm: Vec3;
  readonly framingRadiusKm: number;
  readonly minimumDistanceKm: number;
  readonly obstacleId: BodyId | null;
}
type SpacecraftTargets = Readonly<Partial<Record<SpacecraftId, ResolvedTarget>>>;
```

`resolveTarget(id, world, catalog, spacecraftTargets = {})` returns a valid `ResolvedTarget` or throws. Bodies use `visualRadius` for framing and physical safe surface for minimum distance; spacecraft minimum observation distance is a clearly nonphysical 1 km. Its initial framing radius is distance to Jupiter plus Jupiter's physical radius.

- [x] Add RED tests for missing craft rejection, valid spacecraft flight arrival/follow/zoom reversal, body collision preservation and unchanged planet framing.
- [x] Run targeted target/controller tests to confirm RED.
- [x] Extend controller APIs with a trailing optional `SpacecraftTargets` argument, preserving all existing call signatures. Replace direct target indexing with `resolveTarget`; use `obstacleId` only for the existing mathematically safe shared-motion/arc exclusions. Arrival tolerance uses the resolved observing parameters, not a fake catalog entry.
- [x] In rendering/runtime, resolve a camera anchor: body target maps to itself; active Voyager 1 target maps to Jupiter. Keep `mapCamera`, `unmapCamera`, `navigationGeometry` body-anchor contracts. For a spacecraft point:

```ts
const local = scale(sub(positionKm, world.bodies.jupiter.positionKm),
  displayRadius('jupiter', catalog, 'schematic') / catalog.jupiter.radiusKm);
const mapped = add(mapPosition('jupiter', world.bodies.jupiter.positionKm, world, catalog, 'schematic'),
  toSceneDirection(local));
```

Real mapping still subtracts camera km first. Reanchoring uses the same Jupiter inverse. Schematic time updates compute the displayed target displacement, convert by the anchor's km/display-unit scale, and feed the normal navigation step exactly once.
- [x] Test mapping/inverse and marker/line/camera agreement using real sampled points, changing time, source enable/disable and both scales. Preserve existing zoom-at-surface and ring-framing tests.
- [x] Run `npm test -- src/navigation/target.test.ts src/navigation/controller.test.ts src/rendering/display-mapping.test.ts src/rendering/runtime.test.ts`.

### Task 5: Main scene and replay controls

**Files:** spacecraft scene module/tests, SolarCanvas, orbit guides, App, SpacecraftPanel, CSS, existing spacecraft browser tests.

**Consumes:** active replay/sample, resource state, data segments and valid navigation target.

**Produces:** actual visible lines/marker, explicit date entry/exit, coverage and error/retry UI; unchanged missing-data behavior for five craft.

- [x] Add RED scene tests for per-segment line buffers, no cross-gap connector, real camera-relative precision, marker placement, layer toggles and idempotent resource disposal.
- [x] Run scene units to confirm RED.
- [x] Create a group with one warm-colored line per published segment and a small fixed-screen-size location point. Allocate once per dataset, rewrite existing positions on frame changes, and dispose on replacement/unmount. Only active valid state is visible. Lines obey `orbitsVisible`; the point remains when HUD is hidden.
- [x] Attach/detach the spacecraft group with the existing quality-switch lifecycle. Add a spacecraft label with the same occlusion and label/HUD gating. Marker/label selection dispatches `select-spacecraft`, honoring the existing sticky 5 px drag threshold and preview input lock.
- [x] Hide only Jupiter's approximate orbit guide during active replay. Extend diagnostics with replay flag, availability, spacecraft/Jupiter positions and rendered trajectory vertex count for browser assertions; these are observations, not substitute acceptance criteria.
- [x] App loads the local resource in an effect and cancels on cleanup; StrictMode replay must restart an aborted attempt safely. Route list selection through `activate-spacecraft`, G through `fly-to-spacecraft`, and gate orbit/follow using resolved availability instead of body selection alone. Preserve the existing schematic free/follow UI restrictions.
- [x] SpacecraftPanel shows actual resource/coverage/source state, missing status for other craft, a retry on error, explicit preset replay entry, current valid distance to craft/Jupiter, fly-near and exit controls. Disable unavailable actions with explanation. Keep the original preview button and its independent lifecycle.
- [x] Add compact replay/source status and local-scale wording without covering existing time controls. Update only Voyager 1's former missing-data expectations in existing browser scenarios; current out-of-range selection must still leave date/camera unchanged.
- [x] Run scene units, typecheck and the spacecraft browser suite against the existing service.

### Task 6: End-to-end acceptance and delivered documentation

**Files:** `tests/e2e/spacecraft-trajectory.spec.ts`, docs/help and final plan/spec status.

**Consumes:** Tasks 1-5.

**Produces:** persistent, usable first replay with actual-source validation and no implied coverage for missing spacecraft.

- [x] Write browser scenarios for delayed and failed local loading, retry, explicit entry, warm trajectory pixels, source-derived changing position, pause/rewind, flight arrival, follow, both-scale registration, crossed gaps/outer coverage, layer toggles, source restoration and preview isolation.

```ts
await page.getByRole('button', { name: '回放木星飞掠', exact: true }).click();
await expect.poll(() => diagnostics(page).then(d => d.replayActive)).toBe(true);
await expect.poll(() => diagnostics(page).then(d => d.clock.paused)).toBe(true);
await expect.poll(() => diagnostics(page).then(d => d.navigation.target)).toBe('voyager-1');
```

`diagnostics(page)` reads the existing main canvas's `__solarDiagnostics`, never the preview canvas. Poll after dispatch because diagnostics are frame-driven. Verify pixel differences with the trajectory layer on/off and verify marker projection against the actual sampled coordinate; merely checking a canvas exists is insufficient.
- [x] Run `npm run build` and targeted unit suites. Run:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5174 npm run test:e2e -- \
  tests/e2e/spacecraft-trajectory.spec.ts tests/e2e/spacecraft.spec.ts \
  tests/e2e/solar.spec.ts tests/e2e/mouse-controls.spec.ts \
  tests/e2e/final-corrections.spec.ts tests/e2e/orbit-visibility.spec.ts \
  tests/e2e/recovery.spec.ts
```

- [x] Inspect real/schematic replay screenshots and narrow/desktop layouts. Fix coupled defects rather than weakening expected behavior or tolerance.
- [x] Update README/source/credits/help with actual published segments, measured error report, source caveats, original-kernel exclusion, optional importer requirements and replay controls. Mark only completed plan items; keep the five missing trajectories and unrelated hardware/stability blockers explicit.
- [x] Perform inline change review, rerun any affected focused checks, preserve generated assets and report the implemented boundary concisely. No integration menu or Git operation is applicable in this non-Git folder.

## Plan self-review

The source constraints are covered by Task 1/2, runtime and time-source consistency by Task 3, target/camera safety by Task 4, scene/UI and StrictMode ownership by Task 5, and actual browser/source verification by Task 6. Constructor side effects are explicitly forbidden; aborted loads cannot later cause navigation. Source-boundary checks apply to whole clock steps, not only sampled endpoints. This plan does not reinterpret unspecified upstream metadata as a license or a reconstruction label.

Execution choice is already recorded: inline in the current session, without subagents.

## Execution record

The generated asset contains 396 knots across six guarded segments in 79,744 bytes. Independent source checks at 90,847 times measured maximum position reproduction errors of 0.2368739891545833 km for Voyager 1 and 0.019637874022753545 km for Jupiter. These measurements do not establish absolute orbit accuracy or a mathematical bound between checked times. Original kernels, labels, metadata and the numerical report remain in `.artifacts/spacecraft-sources/voyager1-jupiter/`; only derived state values are shipped.

Implementation adjustments stayed within the approved behavior:

- Replay lifecycle assertions live in `runtime-trajectory.test.ts` rather than enlarging the baseline runtime test file. Existing display-mapping helpers were reused with Jupiter as the camera anchor.
- Trajectory geometry adaptively tessellates the interpolation curve and inserts the current state point; sparse sample-to-sample straight chords alone did not meet near-view registration needs.
- Local loading follows Vite `BASE_URL`, with a `/solar/` regression case. Runtime navigation errors now have a matching `clear-issue` action so the close button actually dismisses them.
- Published-trajectory actions use two columns. A failing 1280x720 browser assertion showed the four stacked actions collapsed the scrollable source region; the same unmodified assertion now passes, as does the 1920x1080 case.
- Browser fixtures use the native ESM JSON import attribute. Extreme zoom sends real separate wheel events, matching event normalization; preview isolation excludes only derived real-frame speed easing, not camera, target or clock state.

Final validation on 2026-10-15: `npm test` passed all 151 cases in 23 files; the isolated Python unittest command passed all eight importer cases; `npm run build` passed type-check and production bundling. The seven-file Chrome command above passed all 49 scenarios in one run (12 trajectory, 14 spacecraft information/preview, 23 existing affected scenarios). Real/schematic, close-view and active 1280x720/1920x1080 screenshots are preserved in `.artifacts/spacecraft/`.

The build retains its main-chunk size warning above 900 kB; no warning threshold was raised. No independent review agent or target-M5 performance validation was performed. The other five trajectories, the separate long-run observation timeout investigation and the independent full-period planetary precision benchmark remain outside this delivery.

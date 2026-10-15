# Solar Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建以真实尺度漫游为主、兼具示意模式的浏览器太阳系探索器。

**Architecture:** 纯 TypeScript 模拟层计算物理状态，导航层管理相机，React Three Fiber 消费相机相对坐标进行渲染，React 负责低频界面状态。模拟、显示映射和导航互不隐藏地修改对方的数据。先交付可操作的大尺度原型，再接入天文数据、授权素材和视觉效果。

**Tech Stack:** TypeScript、React、React DOM、Three.js、React Three Fiber、Vite；Vitest 与 Playwright 用于验证。第一版不引入状态管理框架、后端或通用物理引擎。

**Spec:** `docs/superpowers/specs/2026-10-13-solar-explorer-design.md`

**执行状态：** 第一版实现已落地，106 项单元测试和 16 项生产 Chrome 流程通过。下方复选框保留原始计划步骤，不作为实时完成清单；实际结果、实现调整与未覆盖条件见 README 和 `docs/performance.md`。主要调整是采用 Astronomy Engine 替代手工 JPL 表格、分离选中目标与导航目标、以完整土星环范围计算取景。用户指定 M5 实机和独立 JPL 高精度基准尚未验收；独立长时采样的一次观测中断原因仍未确定，不能宣称原始原因已修复。

## Global Constraints

- 运行方式：本地开发服务器与静态网站部署，纯前端。
- 用户指定的主要设备：Mac mini，M5，16 GB 内存，Chrome。
- 第一版以桌面键鼠操作为准；手机、触屏和其他浏览器暂不作为验收平台。
- 界面语言：中文，支持中英文天体名称搜索。
- 不引入账号、数据库、业务后端、在线星历服务或游戏引擎。
- 第一版日期范围为 UTC 1800-01-01 至 2050-01-01，不包含结束时刻。
- 模拟层：距离统一为千米，角度为弧度，时间以儒略日表示。
- 参考系：日心 J2000 黄道坐标；月球相对位置转换到同一参考系。
- 标准档验收内部渲染分辨率为 1920 × 1080；高 DPI 或 4K 显示器不自动强制同等渲染分辨率。
- 默认真实尺度。示意模式只改变显示，切换保留时间和目标，并回到有效环绕视角或全景。
- 十个核心天体：太阳、八大行星、月球。地表降落、全银河、碰撞和多体引力均不在本计划内。
- 未确认使用与再分发许可的素材不纳入发布。
- 本计划本身不授权启动实现、安装依赖或下载素材；执行需要用户后续明确选择。
- 当前不是 Git 仓库；不自动初始化、提交或创建 worktree。用户批准使用 Git 后，再按任务提交，只暂存该任务文件并包含本会话要求的提交 trailers。

---

## 执行规则与依赖

执行时先阅读 Spec 和本计划。方框表示尚未执行，文档中的命令是未来步骤，不是已完成记录。

每个任务按“写针对性失败用例 → 确认失败原因 → 最小实现 → 同一用例通过 → 检查差异”的顺序进行。脚手架任务允许先建立测试运行器，但不得先实现被测试的功能。测试失败必须是预期行为缺失，而不是导入拼写、语法或环境错误。

发现设计不可行时暂停当前阶段并记录具体证据，不能自行扩大功能范围或放宽真实尺度约束。

| 阶段 | 任务 | 前置条件 | 交付关口 |
| --- | --- | --- | --- |
| A | 1–5 | 空目录中的已批准文档 | 可操作、可测量的尺度与导航原型 |
| B | 6–7 | A 通过 | 有来源的数据与完整基础操作 |
| C | 8–9 | B 通过，具体视觉布局获确认 | 授权材质与重点天体近景 |
| D | 10–12 | C 通过 | 恢复能力、性能记录、可发布构建 |

任务实际依赖：2→1，3→2，4→2，5→3+4，6→5，7→6，8→7，9→8，10→9，11→10，12→11。阶段验收失败时留在该阶段；不以占位场景代替最终交付。

## 文件责任图

下面是预期文件，不提前批量创建空文件。只有执行到对应任务时才创建。

| 路径 | 责任 |
| --- | --- |
| `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts` | 依赖、命令、严格类型与构建 |
| `index.html`, `src/main.tsx`, `src/App.tsx`, `src/app.css` | 入口、顶层界面与样式 |
| `src/simulation/types.ts` | 跨模块的天体、向量、世界快照类型 |
| `src/simulation/{vector,coordinates,clock}.ts` | 数学、坐标与模拟时钟 |
| `src/simulation/{catalog,orbits,rotation,world}.ts` | 有来源的目录、轨道、自转和世界计算 |
| `src/simulation/data/{planets,moon,physical}.json` | 数据与字段级来源 |
| `src/navigation/{types,controller,flight-path,input}.ts` | 状态机、路径、键鼠输入 |
| `src/rendering/{display-mapping,runtime,quality}.ts` | 显示转换、帧循环和画质规则 |
| `src/rendering/{SolarCanvas,WorldScene,BodyMesh,BackgroundStars}.tsx` | 场景与可见天体 |
| `src/rendering/{BodyMaterial,EarthAtmosphere,SaturnRings,SunGlow}.tsx` | 独立视觉效果 |
| `src/assets/{manifest,texture-cache}.ts` | 素材清单、加载和释放 |
| `src/ui/{Hud,SearchPanel,TimeControls,SettingsPanel,HelpPanel,StatusPanel}.tsx` | 可折叠界面、操作帮助与错误 |
| `src/platform/{capabilities,graphics-lifecycle}.ts` | WebGL 能力与上下文恢复 |
| `src/test/fixtures.ts`, `src/**/*.test.ts` | 明确标记的合成数据与单元验证 |
| `tests/e2e/*.spec.ts`, `playwright.config.ts` | 浏览器验收流程 |
| `public/assets/`, `public/asset-credits.json` | 可发布资产与署名 |
| `docs/{data-sources,performance,asset-credits}.md`, `README.md` | 精度、测量、许可与运行说明 |

## 共用接口约定

任务 2 创建以下类型；其他任务不能自行重新定义同名但不同形状的接口。

```ts
export type Vec3 = readonly [number, number, number];
export type BodyId =
  | "sun" | "mercury" | "venus" | "earth" | "moon"
  | "mars" | "jupiter" | "saturn" | "uranus" | "neptune";
export type ScaleMode = "real" | "schematic";
export interface BodyDefinition {
  id: BodyId;
  parentId: BodyId | null;
  nameZh: string;
  nameEn: string;
  radiusKm: number;
  massKg: number;
  rotationPeriodDays: number;
  axialTiltRad: number;
  rotationEpochJd: number;
  rotationPhaseRad: number;
}
export interface BodyState {
  id: BodyId;
  positionKm: Vec3;
  spinRad: number;
}
export interface WorldSnapshot {
  julianDay: number;
  bodies: Readonly<Record<BodyId, BodyState>>;
}
export type Catalog = Readonly<Record<BodyId, BodyDefinition>>;
export type WorldEvaluator = (julianDay: number) => WorldSnapshot;
```

`positionKm` 永远是物理日心坐标。合成数据使用测试专用目录与明显的原型提示，绝不冒充真实观测数据。

### Task 1：建立能打开的浏览器应用与测试入口

**Files:** 创建 `package.json`、`package-lock.json`、`tsconfig.json`、`vite.config.ts`、`vitest.config.ts`、`index.html`、`src/main.tsx`、`src/App.tsx`、`src/app.css`、`.gitignore`、`src/platform/capabilities.ts`、`src/platform/capabilities.test.ts`、`playwright.config.ts`、`tests/e2e/boot.spec.ts`。

**Interfaces:** 产出 `hasWebGL2(canvas: Pick<HTMLCanvasElement, "getContext">): boolean`。App 显示标题、场景容器和明确的 WebGL 不支持信息。

- [ ] 检查 Node/npm 可用性和 Vite、React Three Fiber 的官方兼容要求；通过包元数据确认 engines 与 peerDependencies，而不是使用记忆中的版本。

```bash
node --version && npm --version
npm view vite engines --json
npm view @react-three/fiber peerDependencies --json
```

- [ ] 使用 npm 建立清单，按已核对的兼容范围声明依赖后安装并保存 lockfile；开发依赖包含 TypeScript、Vite、`@vitejs/plugin-react`、Vitest、Playwright 及 React/Three 类型包。TypeScript 开启 `strict` 与 `noUncheckedIndexedAccess`。建立这些脚本：

```json
{
  "dev": "vite --host 127.0.0.1",
  "build": "tsc --noEmit && vite build",
  "preview": "vite preview --host 127.0.0.1",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:e2e": "playwright test"
}
```

- [ ] 写能力探测失败用例和启动用例：

```ts
// capabilities.test.ts
import { expect, it, vi } from "vitest";
import { hasWebGL2 } from "./capabilities";
it("reports an unavailable context explicitly", () => {
  const canvas = { getContext: vi.fn(() => null) };
  expect(hasWebGL2(canvas)).toBe(false);
});
// boot.spec.ts
import { expect, test } from "@playwright/test";
test("opens the application shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Solar" })).toBeVisible();
  await expect(page.getByTestId("scene-container")).toBeVisible();
});
```

Vitest 与 Playwright 分开收集用例，避免 Vitest 执行浏览器测试：

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["src/**/*.test.ts"] },
});
```

- [ ] 运行 `npm test -- src/platform/capabilities.test.ts`，确认缺失能力处理时失败。实现 `return canvas.getContext("webgl2") !== null`，将不支持提示接到 App；创建真实 canvas 时释放探测用 context，不反复探测分配 GPU 资源。
- [ ] 配置 Playwright `webServer` 使用 `npm run dev -- --port 4173` 和 baseURL `http://127.0.0.1:4173`。运行同一单元测试、`npm run typecheck` 和 `npm run test:e2e -- tests/e2e/boot.spec.ts`。若浏览器二进制缺失，才安装所需 Chromium。
- [ ] 检查只新增必要文件；忽略 `node_modules/`、`dist/`、`test-results/`、`playwright-report/`。记录实际 Node 与包版本到 README 的后续输入，不声称原型已完成。

### Task 2：统一坐标、单位与双模式显示映射

**Files:** 创建 `src/simulation/types.ts`、`vector.ts`、`coordinates.ts`、`src/rendering/display-mapping.ts`、对应 `*.test.ts`、`src/test/fixtures.ts`。

**Interfaces:**
- `toRelativeScene(positionKm: Vec3, originKm: Vec3): Vec3`，真实模式每渲染单位为 1,000 km。
- `mapWorld(world: WorldSnapshot, catalog: Catalog, mode: ScaleMode): DisplayWorld`。
- `DisplayBody = { id: BodyId; position: Vec3; radius: number }`，`DisplayWorld = Readonly<Record<BodyId, DisplayBody>>`。
- `makeTestCatalog(): Catalog` 与 `makeTestWorld(julianDay?: number): WorldSnapshot` 只供测试使用。
- vector.ts 导出 `add(a: Vec3, b: Vec3): Vec3`、`sub(a: Vec3, b: Vec3): Vec3`、`scale(v: Vec3, factor: number): Vec3`、`length(v: Vec3): number`、`dot(a: Vec3, b: Vec3): number`、`cross(a: Vec3, b: Vec3): Vec3`、`normalize(v: Vec3): Vec3`。

- [ ] 写测试覆盖先相减再缩放、轴映射、真实半径比例和示意映射单调性：

```ts
import { expect, it } from "vitest";
import { toRelativeScene } from "./coordinates";
it("preserves a small relative displacement far from the origin", () => {
  expect(toRelativeScene([4e9 + 2, 3, 4], [4e9, 0, 0]))
    .toEqual([0.002, 0.004, -0.003]);
});
```

- [ ] 运行 `npm test -- src/simulation/coordinates.test.ts src/rendering/display-mapping.test.ts`，确认预期失败。
- [ ] 实现向量加减、长度、点积、叉积和归一化；零向量归一化抛出带上下文的错误，不返回伪有效方向。集中实现右手系映射：

```ts
export function toRelativeScene(p: Vec3, origin: Vec3): Vec3 {
  return [
    (p[0] - origin[0]) / 1000,
    (p[2] - origin[2]) / 1000,
    -(p[1] - origin[1]) / 1000,
  ];
}
```

- [ ] 示意模式定义距离 `f(d) = 30 * log1p(d / AU_KM)`，显示半径 `r = 0.25 + 0.2 * log1p(radiusKm / 1000)`；太阳使用独立显示半径 2，月球相对地球距离使用 `3 + 2 * log1p(d / 384400)`。常数集中在一个配置对象，明确只是显示设计。轨道每个采样点使用相同父级与映射。
- [ ] 对十个合成天体测试真实模式半径/间距比保持不变、示意位置方向保持、月球随地球移动、输入数据不被修改。地球半径与月球基准距离等真实数据此时不作为合成 fixture 的科学依据。
- [ ] 重跑定向测试与类型检查，检查所有坐标轴变换只存在于集中转换函数中。

### Task 3：实现独立模拟时钟

**Files:** 创建 `src/simulation/clock.ts`、`clock.test.ts`。

**Interfaces:** `ClockState = { julianDay: number; rate: number; paused: boolean; hidden: boolean }`；`advanceClock(state: ClockState, realDeltaSeconds: number): { state: ClockState; boundaryReached: boolean }`；`parseUtcDate(value: string): { ok: true; julianDay: number } | { ok: false; message: string }`；`toUtcIso(julianDay: number): string`。

- [ ] 写暂停、后台、正反倍率和日期边界测试：

```ts
it("does not advance while hidden", () => {
  const state = { julianDay: 2451545, rate: 86400, paused: false, hidden: true };
  expect(advanceClock(state, 10).state.julianDay).toBe(2451545);
});
it("moves one simulated day per real second at 86400x", () => {
  const state = { julianDay: 2451545, rate: 86400, paused: false, hidden: false };
  expect(advanceClock(state, 1).state.julianDay).toBe(2451546);
});
```

- [ ] 运行 `npm test -- src/simulation/clock.test.ts`，确认失败原因是时钟未实现。
- [ ] 使用 `JD = unixMilliseconds / 86400000 + 2440587.5` 转换 UTC。活动帧增量为 `realDeltaSeconds * rate / 86400`，暂停/后台为零。越界时停在最近有效毫秒、设置暂停并返回 `boundaryReached: true`。
- [ ] 日期输入严格验证真实日历日期，拒绝 2026-02-30 等被 Date 自动归一化的输入；拒绝非有限倍率与负的真实帧间隔，并交给界面显示原因。倍率可以为负，帧间隔不能为负。
- [ ] 重跑测试；补充 1800 起点、2050 终点排除、闰日与 UTC 往返测试，保证错误不会修改原状态。

### Task 4：导航状态机、速度与飞向路径

**Files:** 创建 `src/navigation/types.ts`、`controller.ts`、`flight-path.ts`、`input.ts` 及四个对应测试文件。

**Interfaces:**
- `NavigationState = { mode: "free" | "orbit" | "follow" | "flight"; positionKm: Vec3; forward: Vec3; up: Vec3; target: BodyId | null; previousTargetPositionKm: Vec3 | null; speedKmPerSecond: number; speedMultiplier: number; flight: FlightState | null }`。
- `FlightState = { elapsedSeconds: number; durationSeconds: number; waypointsKm: readonly Vec3[] }`。
- `NavigationInput = { localMove: Vec3; lookDelta: readonly [number, number]; speedSteps: number; cancel: boolean }`。
- `stepNavigation(state, input, world, catalog, realDeltaSeconds): NavigationState`，参数按上述类型，world/catalog 使用共用接口。
- `planFlight(start: Vec3, end: Vec3, world: WorldSnapshot, catalog: Catalog): { ok: true; points: readonly Vec3[] } | { ok: false; message: string }`。
- `createInputController(canvas: HTMLCanvasElement)` 返回 `readInput(): NavigationInput`、`clearInput(): void`、`dispose(): void`，不使用全局事件单例。

- [ ] 写输入失焦、按键焦点、跟随偏移和路径安全测试；路径几何先测试不涉及 UI 的算法：

```ts
it("rejects a segment through a safety sphere", () => {
  expect(segmentClearsSphere([-2, 0, 0], [2, 0, 0], [0, 0, 0], 1))
    .toBe(false);
});
it("accepts a segment clear of the sphere", () => {
  expect(segmentClearsSphere([-2, 2, 0], [2, 2, 0], [0, 0, 0], 1))
    .toBe(true);
});
```

`segmentClearsSphere(a: Vec3, b: Vec3, center: Vec3, radius: number): boolean` 由 `flight-path.ts` 导出，使用投影到线段的最近点判定。

- [ ] 运行 `npm test -- src/navigation` 确认失败。
- [ ] 实现距离相关速度建议：基于最近天体表面距离计算建议值，用户可滚轮按 `2 ** steps` 调节；用真实时间的指数平滑过渡。速度上下界集中定义为 `0.1` 与 `1e9` km/s，明确这是导航速度，不是物理飞船速度。
- [ ] 将手动档位保存在 speedMultiplier；跟随与环绕使用 previousTargetPositionKm 计算中心位移，更新完成后记录本帧中心。切换目标时重设该字段，不能把两个不同天体的位置差当作运动量。
- [ ] 终点距离为 `max(1.01 * radius, 1.2 * radius / sin(fov / 2))`。先检测直线路径；被阻挡时沿阻挡球外的两侧生成候选绕行折线，逐段验证全部安全球。每次扩大侧向偏移，最多八轮；都失败时返回明确路径错误、保持当前相机且不启动动画。
- [ ] 动画沿安全折线按平滑时间参数前进，不使用可能穿入球体的未验证曲线。每帧按当前天体位置重新验证下一段；被移动天体阻挡时重规划，失败则停止并提示。速度很高时用 swept segment 检查而不只检查帧末位置。
- [ ] 自由移动接近实体时限制到安全表面外，并消除指向表面的速度分量；对时间跳转造成的重叠投影到最近安全点并显示位置调整提示。跟随只应用目标中心位移，忽略目标自转。
- [ ] 输入绑定只作用于画布；焦点为 input/textarea/contenteditable 时禁用快捷键；blur/visibilitychange 清空输入。检查销毁时移除监听器。
- [ ] 重跑导航测试和类型检查，确认取消飞向不会重置目标或模拟时间。

### Task 5：接入真实帧循环，完成阶段 A

**Files:** 创建 `src/simulation/prototype-world.ts`、`src/rendering/runtime.ts`、`runtime.test.ts`、`SolarCanvas.tsx`、`WorldScene.tsx`、`BodyMesh.tsx`、`BackgroundStars.tsx`、`tests/e2e/navigation.spec.ts`；修改 `src/App.tsx`。

**Interfaces:** `createRuntime(catalog: Catalog, evaluate: WorldEvaluator): Runtime`；Runtime 暴露 `tick(realDeltaSeconds: number): FrameSnapshot`、`dispatch(command: RuntimeCommand): void`、`getSnapshot(): FrameSnapshot` 和 `subscribe(listener: () => void): () => void`，subscribe 返回取消订阅函数。

```ts
export interface FrameSnapshot {
  world: WorldSnapshot;
  displayWorld: DisplayWorld;
  navigation: NavigationState;
  clock: ClockState;
  scaleMode: ScaleMode;
  guides: { labelsVisible: boolean; orbitsVisible: boolean; hudVisible: boolean };
  issue: { code: string; message: string } | null;
}
export type RuntimeCommand =
  | { type: "select"; id: BodyId }
  | { type: "fly-to"; id: BodyId }
  | { type: "set-mode"; mode: ScaleMode }
  | { type: "overview" }
  | { type: "set-rate"; rate: number }
  | { type: "set-paused"; paused: boolean }
  | { type: "set-date"; julianDay: number }
  | { type: "set-hidden"; hidden: boolean }
  | { type: "set-guide"; key: keyof FrameSnapshot["guides"]; visible: boolean }
  | { type: "set-navigation"; mode: "free" | "orbit" | "follow" };
```

- [ ] 在 `runtime.test.ts` 写失败用例，验证模式切换保留时间与目标、取消飞向且进入安全环绕：

```ts
it("preserves time and selection across display modes", () => {
  const runtime = createRuntime(makeTestCatalog(), makeTestWorld);
  runtime.dispatch({ type: "select", id: "earth" });
  const jd = runtime.getSnapshot().clock.julianDay;
  runtime.dispatch({ type: "set-mode", mode: "schematic" });
  const next = runtime.getSnapshot();
  expect(next.world.julianDay).toBe(jd);
  expect(next.navigation.target).toBe("earth");
  expect(next.navigation.mode).toBe("orbit");
});
```

- [ ] 运行 `npm test -- src/rendering/runtime.test.ts` 确认失败。实现 Runtime 按 Spec 第 5 节顺序更新；UI 以不高于 10 Hz 订阅快照，逐帧位置直接写 Three 对象。
- [ ] 初始时间为当前 UTC、1 倍速、真实尺度，选中地球并处于环绕模式；初始相机距地心约四个地球半径，朝向可见日面的斜上方。首次打开即可观察天体，不从空无一物的原点开始。
- [ ] `prototype-world.ts` 创建固定的太阳系量级合成位置和半径，只用于原型；界面持续显示“原型数据，非星历”。时间变化可使用确定性的简化圆轨道，不能产生外部精度承诺。
- [ ] 场景先使用简单颜色和低面数球体。真实模式先在 JavaScript 中做物理坐标差，再换轴和缩放；示意模式先映射天体与环绕相机，再相减。背景单独渲染，固定随机种子。
- [ ] 真实模式的相机保持在渲染原点；相机朝向由导航 forward/up 决定。按最近可见实体和远景动态设置裁切范围；轨道/标签与实体使用同一帧原点。不能在 Three 中先保存数十亿千米绝对 Float32 坐标。
- [ ] 用临时但可访问的目标列表和模式按钮完成浏览器流程：

```ts
test("switches scale without losing Earth", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "选择地球", exact: true }).click();
  await page.getByRole("button", { name: "示意模式", exact: true }).click();
  await expect(page.getByTestId("selected-body")).toHaveText("地球");
  await expect(page.getByTestId("scale-label")).toContainText("尺寸与间距已调整");
});
```

- [ ] 运行 Runtime、导航测试和 `npm run test:e2e -- tests/e2e/navigation.spec.ts`。在实际 Chrome 完成地球→月球→土星→海王星→地球，验证近景抖动、裁切、穿模和恢复全景。
- [ ] 若深度问题未解决，记录具体视角与数值，在本任务内评估分层渲染；阶段 A 不通过前不开始贴图工作。原型验收不等于最终性能验收。

### Task 6：接入有来源的天体模型，移除原型数据

**Files:** 创建 `src/simulation/catalog.ts`、`orbits.ts`、`rotation.ts`、`world.ts`、`data/planets.json`、`data/moon.json`、`data/physical.json`、对应测试、`docs/data-sources.md`；修改 App 的 Runtime 初始化；删除 `src/simulation/prototype-world.ts`。

**Interfaces:**
- `solveKepler(meanAnomalyRad: number, eccentricity: number): number`。
- `evaluatePlanet(id: Exclude<BodyId, "sun" | "moon">, julianDay: number): Vec3`；其中 earth 返回地月质心，函数文档显式标注。
- `evaluateMoonRelative(julianDay: number): Vec3`，返回地心黄道向量。
- `splitEarthMoon(barycenter: Vec3, moonRelative: Vec3, earthMassKg: number, moonMassKg: number): { earth: Vec3; moon: Vec3 }`。
- `evaluateSpin(body: BodyDefinition, julianDay: number): number`。
- `evaluateWorld(julianDay: number): WorldSnapshot` 与 `catalog: Catalog` 用于替换原型。

- [ ] 获取 JPL 官方 1800–2050 近似轨道参数表、官方行星/月球物理参数和有说明的月球轨道元素。优先 JPL Solar System Dynamics 与 NASA NSSDC；确认历元、单位、参考面和 UTC 近似。访问失败时不能杜撰表格或从模型记忆录入，记录阻塞项。
- [ ] 每组数据保存 `{ sourceUrl, accessedAt, epochJd, frame, units, validFromJd, validToJd, values }`。在文档中解释月球简化轨道的用途和误差限制，记录城市夜景等后续素材与天文数值不是同一许可来源。
- [ ] 写求解残差、地月质心和逆行自转测试：

```ts
it("solves Kepler's equation rather than a circular proxy", () => {
  const mean = 1.2;
  const eccentricity = 0.2;
  const anomaly = solveKepler(mean, eccentricity);
  expect(Math.abs(anomaly - eccentricity * Math.sin(anomaly) - mean))
    .toBeLessThan(1e-10);
});
it("preserves the barycenter", () => {
  const result = splitEarthMoon([100, 0, 0], [10, 0, 0], 9, 1);
  expect(result.earth[0]).toBeCloseTo(99);
  expect(result.moon[0]).toBeCloseTo(109);
  expect((9 * result.earth[0] + result.moon[0]) / 10).toBeCloseTo(100);
});
```

- [ ] 运行 `npm test -- src/simulation`，确认轨道缺失用例失败。实现 `T=(JD-2451545)/36525`、元素基值加变化率、均近点角归一化、Newton 求解、轨道平面坐标到黄道坐标旋转。将 AU 转 km 集中在一处。
- [ ] Newton 迭代设最大次数 32、残差阈值 `1e-12`，拒绝非法偏心率；不收敛抛出包含天体和日期上下文的显式错误，由应用暂停并显示。地月分离使用：

```ts
const moonFraction = moonMassKg / (earthMassKg + moonMassKg);
const earth = sub(barycenter, scale(moonRelative, moonFraction));
const moon = add(earth, moonRelative);
```

`add`、`sub`、`scale` 由任务 2 的 vector.ts 提供。月球相对轨道的参考系转换必须在接入时显式完成。

- [ ] 增加独立基准 fixture：至少地球、火星、海王星在 J2000、当前附近和有效范围两端附近四组日期。保存官方样例或独立 JPL 星历的来源、时间尺度与容差依据；不能调用待测函数生成预期值。
- [ ] 运行模拟层测试、类型检查和阶段 A 导航流程。替换原型导入、删除生产原型文件与原型提示；保留明确标记的测试 fixture。HUD 后续继续显示“近似轨道，非精密星历”。

### Task 7：完成搜索、时间面板与完整导航界面

**Files:** 创建 `src/ui/Hud.tsx`、`SearchPanel.tsx`、`TimeControls.tsx`、`SettingsPanel.tsx`、`HelpPanel.tsx`、`StatusPanel.tsx`、`tests/e2e/controls.spec.ts`；修改 `src/App.tsx`、`src/app.css`、`runtime.ts`。

**Interfaces:** 各面板接收 `snapshot: FrameSnapshot`、`catalog: Catalog`、`dispatch: (command: RuntimeCommand) => void` 的必要子集；UI 错误通过 `StatusPanel` 显示，不使用 alert 或吞错。

- [ ] 写搜索别名、无结果、UTC 日期错误和目标跟随的浏览器用例：

```ts
test("search accepts English and invalid dates do not change time", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("searchbox", { name: "搜索天体" }).fill("Neptune");
  await page.getByRole("button", { name: "选择海王星", exact: true }).click();
  await expect(page.getByTestId("selected-body")).toHaveText("海王星");
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  const originalTime = await page.getByTestId("simulation-time").textContent();
  await page.getByLabel("模拟日期（UTC）").fill("2050-01-01T00:00:00Z");
  await page.getByRole("button", { name: "应用日期", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("日期超出支持范围");
  await expect(page.getByTestId("simulation-time")).toHaveText(originalTime!);
});
```

- [ ] 运行 `npm run test:e2e -- tests/e2e/controls.spec.ts` 确认新控件缺失导致失败。
- [ ] 精确映射中英文名称、忽略大小写与首尾空白；空输入展示全部核心天体，无结果显示明确文字。选中与飞向分成两个操作。
- [ ] 时间倍率预设 `-86400, -3600, -60, -1, 1, 60, 3600, 86400`，暂停单独控制。跳转日期后先重算世界，再更新跟随，取消未完成的飞向。
- [ ] 真实模式提供自由/环绕/跟随；示意模式只提供环绕与全景，并显示模式限制。显示距离定义为相机到目标表面的距离，资料半径仍是实际半径，速度使用 km/s。
- [ ] 通过 set-guide 控制标签与轨道；标签有独立屏幕点击区域，不扩大天体实体拾取球。天体资料显示半径、轨道周期、简述与来源，轨道周期从轨道数据计算或有来源地记录，不使用示意模式尺寸推导。
- [ ] H 隐藏/显示界面，隐藏时保留“按 H 显示界面”；搜索、日期和设置拥有焦点时不响应飞行快捷键。帮助面板列出所有快捷键与精度限制。
- [ ] 完成“太阳/八大行星/月球全部可选择与飞向”的参数化浏览器流程，重跑时间、Runtime 测试和 controls 用例。阶段 B 通过后才进入视觉资产。

### Task 8：授权素材清单与有界纹理缓存

**Files:** 创建 `src/assets/manifest.ts`、`texture-cache.ts`、`texture-cache.test.ts`、`public/assets/` 中的许可允许文件、`public/asset-credits.json`、`docs/asset-credits.md`。

**Interfaces:**

```ts
export interface AssetEntry {
  id: string;
  bodyId: BodyId;
  role: "color" | "cloud" | "night" | "ring";
  quality: "base" | "detail";
  path: string;
  width: number;
  height: number;
  sourceUrl: string;
  author: string;
  license: string;
  modifications: string;
}
export type AssetStatus =
  | { state: "loading" }
  | { state: "ready"; texture: import("three").Texture }
  | { state: "error"; message: string };
```

`createTextureCache(budgetBytes: number, load: (url: string) => Promise<Texture>)` 返回 `acquire(entry): Promise<Texture>`、`release(id): void`、`retry(entry): Promise<Texture>`、`dispose(): void`、`getStats(): { estimatedBytes: number; entries: number; pending: number }`。Texture 从 Three 导入。

- [ ] 逐项确认行星颜色图、地球云图/夜图、土星环的原始资源和许可；初始来源候选是 NASA、Solar System Scope，必须落实到具体文件，不能用网站品牌替代许可。
- [ ] 无合法纹理的特定效果先报告素材缺口，由用户决定是否缩减该效果；不任意抓取 SpaceEngine 文件，也不绕过授权限制。
- [ ] 写注入式加载器测试，覆盖请求去重、失败重试、引用计数和释放：

```ts
it("deduplicates concurrent texture requests", async () => {
  const load = vi.fn(async () => new Texture());
  const cache = createTextureCache(256 * 1024 ** 2, load);
  const [first, second] = await Promise.all([
    cache.acquire(testAsset), cache.acquire(testAsset),
  ]);
  expect(load).toHaveBeenCalledTimes(1);
  expect(first).toBe(second);
});
```

在同一测试文件定义 `testAsset: AssetEntry`，使用仅测试用的 `/test-texture.png` 和注明 test fixture 的来源字段，不混入发布清单。

- [ ] 运行 `npm test -- src/assets/texture-cache.test.ts` 确认失败。实现最多两个并发加载，按 LRU 清理引用数为零的细节纹理；加载前后均检查预算。估算 RGBA8 含 mip 纹理为 `ceil(width * height * 4 * 4 / 3)`。
- [ ] 活跃基础纹理超过预算时显式报告资源预算不足，不驱逐正在显示的纹理；detail 超预算则保留已成功加载的 base 并显示画质受限状态。失败不是 detail→base 的静默成功。
- [ ] 资源路径通过 `import.meta.env.BASE_URL` 解析。组件卸载 release，应用销毁 dispose；替换纹理时及时释放旧资源。
- [ ] 重跑缓存测试和类型检查。核对发布清单不包含测试 URL、缺失许可或未登记文件。

### Task 9：重点天体视觉与轻量界面样式

**Files:** 创建 `src/rendering/BodyMaterial.tsx`、`EarthAtmosphere.tsx`、`SaturnRings.tsx`、`SunGlow.tsx`、`lighting.ts`、`lighting.test.ts`、`quality.ts`、`tests/e2e/visual.spec.ts`；修改 BodyMesh、WorldScene、BackgroundStars 和 app.css。

**Interfaces:** `sunDirection(bodyPositionKm: Vec3, sunPositionKm: Vec3): Vec3`；视觉组件只接收 DisplayBody、物理光照方向、AssetStatus 和画质档，不读取系统时间。

本任务在 quality.ts 定义 `Quality = "low" | "standard"` 与默认值 standard；任务 11 在同一文件补充尺寸预算，不创建另一个质量类型。

- [ ] 在写具体样式前向用户展示或描述一个聚焦布局：左上搜索、侧边收起资料、底部时间栏、右上设置；取得该布局与三个重点视角的确认，不新增第二套复杂设计系统。
- [ ] 写昼夜方向与相机原点移动不改变太阳方向的用例：

```ts
it("lights Earth toward the Sun", () => {
  expect(sunDirection([100, 0, 0], [0, 0, 0])).toEqual([-1, 0, 0]);
});
```

- [ ] 运行 `npm test -- src/rendering/lighting.test.ts` 确认失败。用物理相对位置求光照方向，不由显示压缩后的场景位置反推科学位置。
- [ ] 颜色纹理按 sRGB 解码，掩码按线性数据处理；自转与轴倾角分层为父级轴倾角、子级自转，避免两个变换顺序混乱。
- [ ] 地球夜景乘以平滑的背光权重，云层使用略大球壳并有独立缓慢相位，大气边缘采用有限的视角散射近似。低档允许禁用云层与大气，但不能更改轨道或实体尺寸。
- [ ] 土星环使用带透明度的环面贴图和一致轴倾角，检查前后遮挡；太阳用自发光表面和单独的遮挡正确的光晕。优先不用全屏后处理，确有视觉需要且预算允许再加入。
- [ ] 真实星空亮度作为艺术化设置，不宣称裸眼真实曝光。固定随机种子并关闭截图过程中的时间推进。
- [ ] 浏览器视觉用例固定日期、分辨率、目标与质量；保存地球昼夜分界、土星环、太阳三张人工审核过的基线。不自动批准首次截图为正确结果。执行 `npm run test:e2e -- tests/e2e/visual.spec.ts` 并人工看近景与动态旋转。

### Task 10：资源异常、上下文恢复与生命周期

**Files:** 创建 `src/platform/graphics-lifecycle.ts`、`graphics-lifecycle.test.ts`、`tests/e2e/recovery.spec.ts`；修改 SolarCanvas、StatusPanel、texture-cache、runtime。

**Interfaces:** `GraphicsState = "ready" | "lost" | "restoring" | "failed"`；`attachGraphicsLifecycle(canvas, callbacks): () => void`，callbacks 包含 `onLost`、`onRestoring`、`onRestored`、`onFailed`，每个回调有明确状态职责。保留现有 FrameSnapshot 的用户状态，不序列化 Three 对象。

- [ ] 写资源失败与重试用例：

```ts
test("shows a failed texture and permits retry", async ({ page }) => {
  await page.route("**/assets/**/earth*.*", route => route.abort());
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("地球");
  await expect(page.getByRole("button", { name: "重试地球纹理" })).toBeVisible();
});
```

- [ ] 为 lost/restored 事件写单元测试，断言只绑定一次、lost 阻止默认永久丢失行为、卸载移除监听器。运行 `npm test -- src/platform` 与 recovery 用例确认失败。
- [ ] lost 时暂停帧更新、保留模拟时间/目标/模式并显示状态；restored 时重建 GPU 资源再恢复。超过 10 秒仍未恢复或重建失败，显示失败原因与重新加载入口。
- [ ] 资源重试前清理失败 promise；恢复时不要把已 dispose 的 Texture 标记 ready。WebGL 不支持、纹理失败、模型计算错误显示不同信息。
- [ ] 使用浏览器支持的 context-loss 测试扩展模拟恢复；若扩展不可用则记录该项未覆盖并在实际 Chrome 完成手工检查，不能把未执行记为通过。
- [ ] 检查反复挂载、窗口缩放、页面失焦和恢复后无重复 RAF、监听器或按键残留；重跑定向测试。

### Task 11：性能档位、测量与缓存稳定性

**Files:** 创建 `src/rendering/quality.test.ts`、`src/rendering/performance.ts`、`performance.test.ts`、`docs/performance.md`；修改 `src/rendering/quality.ts`、SettingsPanel、SolarCanvas、纹理细节选择。

**Interfaces:** `Quality = "low" | "standard"`；`renderSize(cssWidth: number, cssHeight: number, dpr: number, quality: Quality): { width: number; height: number }`；`summarizeFrameTimes(samplesMs: readonly number[]): { medianMs: number; p95Ms: number }`。

- [ ] 写 DPR 像素预算和统计测试：

```ts
it("caps standard rendering on a high-DPI 4K display", () => {
  const size = renderSize(3840, 2160, 2, "standard");
  expect(size.width * size.height).toBeLessThanOrEqual(1920 * 1080);
});
it("reports tail latency rather than only an average", () => {
  const stats = summarizeFrameTimes([10, 10, 10, 10, 50]);
  expect(stats.medianMs).toBe(10);
  expect(stats.p95Ms).toBe(50);
});
```

- [ ] 运行 `npm test -- src/rendering/quality.test.ts src/rendering/performance.test.ts` 确认失败。按窗口纵横比缩放到标准档最多 2,073,600 像素、低档最多 921,600 像素；取整数尺寸且不超预算。统计使用明确的 nearest-rank P95。
- [ ] 标准档开启已批准的云层/大气与 detail 纹理；低档减少球面分段、禁用云层/大气、只用 base 纹理。两档都保留光照、土星环、时间与导航。
- [ ] 性能采样只在主动诊断时启用。每场景预热 10 秒后采样 60 秒；记录浏览器版本、设备、CSS 尺寸、渲染尺寸、档位、冷/热缓存状态和帧时间。
- [ ] 在目标设备实际 Chrome 测量地球云层近景、土星环、全景和地球到海王星飞向；中位目标 ≤16.7 ms，P95 目标 ≤22 ms。首次加载停顿单独记录，不能从冷加载中任意挑快帧。
- [ ] 连续执行至少十次地球→土星→海王星→地球循环，记录第 1/5/10 次缓存条目、估算字节、Three 纹理/几何计数；说明哪些基础资源常驻，确认计数不是每轮增长。
- [ ] 若目标机器当前不可用，文档明确“目标设备性能尚未验收”，不以无头 Chromium 或其他机器替代。优化按测量结果限制资源、draw call 或效果，不修改真实尺度。

### Task 12：发布说明、许可完整性与生产验收

**Files:** 创建/完善 `README.md`、`docs/data-sources.md`、`docs/asset-credits.md`、`tests/e2e/release.spec.ts`、`src/assets/manifest.test.ts`；修改 `vite.config.ts`、package scripts 和实际有缺陷的资源引用。

**Interfaces:** Vite `base` 可通过构建参数设置；生产构建不依赖开发 API。鸣谢页面或面板使用与发布资产相同的 manifest，不另外维护漂移的清单。

- [ ] 写 manifest 完整性测试，逐个检查 sourceUrl、author、license、path、非空 modifications（无修改写明 none）；检查同 id 不重复、每个本地文件存在。sourceUrl 仅记录来源，不在启动时请求第三方站点。
- [ ] 写部署启动验收：

```ts
test("production entry has all core controls", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("searchbox", { name: "搜索天体" })).toBeVisible();
  await expect(page.getByTestId("scale-label")).toContainText("真实尺度");
  await expect(page.getByRole("button", { name: "暂停", exact: true })).toBeVisible();
});
```

- [ ] 先运行新增 manifest 测试；修复缺失来源、非法路径、遗漏署名。README 写明已验证的 Node 版本、`npm ci`、`npm run dev`、`npm run build`、`npm run preview`、键鼠操作、日期范围与精度限制。
- [ ] 运行 `npm run build -- --base=/solar/`，用 `npm run preview -- --base=/solar/` 在 `/solar/` 验证刷新与静态资源；预览与构建的 base 参数必须一致。生产浏览器配置用 preview 而不是 dev server。首次检查失败时定位 BASE_URL 与资源清单，不改成域名根路径。
- [ ] 运行 `npm test`、`npm run typecheck`、`npm run build`，再执行默认路径和子路径的生产浏览器流程。全套只在阶段末执行，平时使用各任务的定向命令。
- [ ] 检查构建产物包含所需授权文件与鸣谢、没有测试 fixture/调试桥/临时数据入口。确认故障状态、帮助、隐藏界面恢复、时间边界和十个天体导航均可用。
- [ ] 最终交付列出已实现内容与真实未完成项；目标设备性能未实测或官方数据未取得时必须明确，不用“全部完成”掩盖阻塞。

## 设计覆盖与计划自查

| 设计要求 | 实现任务 |
| --- | --- |
| 运行平台、纯前端、严格类型 | 1、12 |
| 十个天体、统一坐标、物理/显示分离 | 2、5、6 |
| 自由飞行、跟随、可取消飞向、安全距离 | 4、5、7 |
| UTC、日期范围、倒放、后台暂停 | 3、5、7 |
| 双模式、标签与选择保持 | 2、5、7 |
| JPL 轨道、地月质心、自转、精度说明 | 6 |
| 相机相对原点、深度原型 | 2、5 |
| 纹理许可、缓存预算、错误重试 | 8、10、12 |
| 大气、云层、夜景、环、太阳与星空 | 9 |
| 输入焦点、资源与 WebGL 恢复 | 4、7、10 |
| 性能目标、实机测量、稳定资源计数 | 11 |
| 本地启动、生产与子路径、鸣谢 | 12 |

执行前仍需获取但不得编造的外部证据：依赖兼容元数据、具体天文数据表与独立基准、逐文件素材许可、目标设备测量。相应任务均有明确获取步骤与失败处理。

## 执行交接

本计划保存后停止，不自动开始 Task 1。

后续由用户选择：

1. 在当前会话按 `executing-plans` 分批执行，每完成一个阶段检查验收结果。
2. 使用 `subagent-driven-development` 按任务委派与审查；只有用户明确选择时才使用该方式。
3. 暂时只保留规划，不执行。

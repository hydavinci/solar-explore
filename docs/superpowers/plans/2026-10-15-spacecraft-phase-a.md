# Spacecraft Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付六艘航天器的可搜索资料和可交互的独立三维模型预览，缺少真实轨迹时明确说明、不伪造主场景位置。

**Architecture:** 航天器目录和模型独立于行星物理目录；选中状态使用天体/航天器判别联合，相机目标继续独立。预览使用只在窗口打开时创建的按需渲染场景，不改变主场景时间、相机或星历。本计划只实现设计中的阶段 A；真实轨迹接入另以取得的数据段为单位规划和交付。

**Tech Stack:** 现有 TypeScript、React、React Three Fiber、Three.js、Vitest、Playwright。使用已安装的 Three.js OrbitControls，不新增运行时依赖。

**Spec:** `docs/superpowers/specs/2026-10-15-spacecraft-explorer-design.md`

**Execution status (2026-10-15):** 阶段 A 已按用户选择在当前会话直接实施。74 项相关单元用例、类型检查及构建通过；14 项航天器 Chrome 用例与 23 项原有受影响流程分别通过。真实轨迹仍未接入。实际预览使用内部 group 挂载模型，并持久保存打开按钮引用以兼容 StrictMode 焦点恢复；下列片段保留为设计蓝图，以 `src/` 的实现为准。

## Global Constraints

- 首批名单：旅行者 1 号、旅行者 2 号、卡西尼号、朱诺号、新视野号、天问一号。
- “第一阶段航天器只影响资料与预览，不扩展相机为追踪不存在的位置。”
- “只有 `available` 可以产生场景坐标。”
- “缺失数据不能由自拟开普勒轨道、公开示意图描点或匀速外推替代。”
- “模型预览明确标注‘外观示意，非工程模型；姿态非实时姿态’。”
- “资料标注核验日期，不随模拟时钟伪装成当时已知的实时情报。”
- 不改变 `BODY_IDS`、行星 `Catalog`、物理半径、星历、相机碰撞或真实/示意模式映射。
- 无轨迹的航天器不能显示距表面数值、位置标记、历史轨迹线或可执行的主场景导航。
- 不初始化 Git，不创建 worktree，不提交；当前目录不是 Git 仓库。已有改动全部保留。
- 不自动另启服务。已授权开发服务为 `http://127.0.0.1:5174/`，先确认响应，再供 Playwright 复用。
- 不添加计划之外的包；不做新轨迹 API、下载器、插值器或未使用的未来导航接口。
- 文案沿用中文界面。原有星球单击自动飞近、场景单击仅选中、左键环绕和防误选行为必须保留。

---

## 文件与依赖

| 文件 | 职责 |
| --- | --- |
| `src/spacecraft/catalog.ts` | 六艘的 ID、资料类型、来源、模型类别和明确的缺失轨迹状态 |
| `src/spacecraft/catalog.test.ts` | 名单、日期、可用性、非法 ID 和资料完整性 |
| `src/spacecraft/models.ts` | 原创简化模型构造、统一取景边界、幂等资源释放 |
| `src/spacecraft/models.test.ts` | 非空有限几何、取景边界、预算和资源释放 |
| `src/rendering/runtime.ts` | 统一选中状态及只选中航天器的命令 |
| `src/rendering/runtime.test.ts` | 航天器选中不影响飞行/时间，以及非法命令错误 |
| `src/rendering/SolarCanvas.tsx` | 从统一选中状态推导星球高亮、纹理焦点和已有诊断值 |
| `src/ui/SearchPanel.tsx` | 天体/航天器分类及中英文搜索 |
| `src/ui/SpacecraftPanel.tsx` | 航天器资料、来源、预览入口和暂无轨迹说明 |
| `src/ui/SpacecraftPreview.tsx` | 隔离的可交互模型预览与局部错误处理 |
| `src/App.tsx` | 面板选择、预览开关、输入隔离和快捷键 |
| `src/app.css` | 分类、长名称、滚动资料区及预览窗口布局 |
| `src/ui/HelpPanel.tsx`、`README.md` | 操作说明和阶段 A 的交付边界 |
| `docs/data-sources.md`、`docs/asset-credits.md` | 资料来源、日期口径和原创简化模型说明 |
| `tests/e2e/spacecraft.spec.ts` | 六艘资料/模型、无轨迹状态、输入及窗口生命周期 |

任务 1 是任务 2 和 3 的前置条件；任务 4 依赖任务 1、2、3。只有任务 4 完成并通过验收，阶段 A 才算交付。

## Task 1: 可核验的六艘资料目录

**Files:** 创建 `src/spacecraft/catalog.ts`、`src/spacecraft/catalog.test.ts`；更新 `docs/data-sources.md`。

**Interfaces:**

```ts
import type { BodyId } from '../simulation/types';
export const SPACECRAFT_IDS = [
  'voyager-1', 'voyager-2', 'cassini', 'juno', 'new-horizons', 'tianwen-1',
] as const;
export type SpacecraftId = typeof SPACECRAFT_IDS[number];
export type SpacecraftModelKind = 'voyager' | 'cassini' | 'juno' | 'new-horizons' | 'tianwen-orbiter';
export interface SpacecraftDefinition {
  readonly id: SpacecraftId;
  readonly nameZh: string;
  readonly nameEn: string;
  readonly agency: string;
  readonly launchDate: string;
  readonly summary: string;
  readonly relatedBodyIds: readonly BodyId[];
  readonly events: readonly { readonly dateLabel: string; readonly text: string }[];
  readonly sources: readonly { readonly label: string; readonly url: string }[];
  readonly verifiedAt: string;
  readonly model: SpacecraftModelKind;
  readonly trajectory: { readonly kind: 'missing'; readonly reason: string };
}
export function isSpacecraftId(value: unknown): value is SpacecraftId;
export const spacecraftCatalog: Readonly<Record<SpacecraftId, SpacecraftDefinition>>;
```

阶段 A 的 `trajectory` 只有 `missing`，不提前扩展未实现的数据加载状态。时间回放不从 `events.dateLabel` 推导；这些日期只是历史文字。

- [x] **Step 1: 建立失败用例**

```ts
import { expect, it } from 'vitest';
import { spacecraftCatalog, isSpacecraftId } from './catalog';

it('contains the six requested missions and their verified launch dates', () => {
  expect(Object.values(spacecraftCatalog).map(c => [c.id, c.launchDate])).toEqual([
    ['voyager-1', '1977-09-05'], ['voyager-2', '1977-08-20'],
    ['cassini', '1997-10-15'], ['juno', '2011-08-05'],
    ['new-horizons', '2006-01-19'], ['tianwen-1', '2020-07-23'],
  ]);
});
it('never substitutes a position or coverage window for unavailable trajectories', () => {
  for (const craft of Object.values(spacecraftCatalog)) {
    expect(craft.trajectory.kind).toBe('missing');
    expect(craft.trajectory.reason.length).toBeGreaterThan(0);
    expect(craft.trajectory).not.toHaveProperty('positionKm');
    expect(craft.trajectory).not.toHaveProperty('startJulianDay');
  }
});
it('rejects unknown spacecraft identifiers', () => {
  expect(isSpacecraftId('voyager-1')).toBe(true);
  expect(isSpacecraftId('earth')).toBe(false);
  expect(isSpacecraftId('__proto__')).toBe(false);
  expect(isSpacecraftId(null)).toBe(false);
});
```

- [x] **Step 2: 运行 RED**

Run: `npm test -- src/spacecraft/catalog.test.ts`

最初允许因模块尚不存在而失败；目录初步实现后必须确认数据断言确实执行，不能把导入错误当成最终回归证据。

- [x] **Step 3: 核验并录入资料**

实现类型和目录。标识验证沿用现有 `isBodyId` 的严格成员校验思路，不接受任意字符串：

```ts
export function isSpacecraftId(value: unknown): value is SpacecraftId {
  return typeof value === 'string' && SPACECRAFT_IDS.some(id => id === value);
}
const missingTrajectory = {
  kind: 'missing',
  reason: '尚未接入经过核验的真实轨迹数据；当前仅提供资料和模型预览。',
} as const;
```

以下事实与来源已在规划时查阅；实现时打开官方页面确认上下文，按当前实际核验日填写 `verifiedAt`，不可顺手扩写未经核验的当前状态：

| ID / 中文名 / 英文名 | 机构、模型、关联天体 | 介绍和事件内容 | 来源 |
| --- | --- | --- | --- |
| `voyager-1` / 旅行者1号 / Voyager 1 | NASA / JPL；`voyager`；`jupiter`, `saturn` | 探访木星和土星，之后继续向日球层外探测。1979-03-05 飞掠木星；1980-11-12 飞掠土星；2012年8月进入星际空间。 | `https://science.nasa.gov/mission/voyager/voyager-1/` |
| `voyager-2` / 旅行者2号 / Voyager 2 | NASA / JPL；`voyager`；`jupiter`, `saturn`, `uranus`, `neptune` | 近距离探测四颗巨行星。1986-01-24 飞掠天王星；1989-08-25 飞掠海王星。 | `https://science.nasa.gov/mission/voyager/voyager-2/` |
| `cassini` / 卡西尼号 / Cassini | 任务合作 NASA / ESA / ASI；`cassini`；`saturn` | 研究土星、光环和卫星系统。2004年开始环绕土星；2017-09-15 进入土星大气，任务结束。 | `https://science.nasa.gov/mission/cassini/`；`https://science.nasa.gov/mission/cassini/about-the-mission/` |
| `juno` / 朱诺号 / Juno | NASA / JPL；`juno`；`jupiter` | 研究木星的大气、内部结构和磁场。2011-08-05 发射；2016年进入木星轨道。 | `https://science.nasa.gov/mission/juno/`；`https://www.nasa.gov/image-article/this-week-nasa-history-juno-launches-aug-5-2011/` |
| `new-horizons` / 新视野号 / New Horizons | NASA；`new-horizons`；`jupiter` | 探索冥王星及柯伊伯带天体。2006-01-19 发射；2015-07-14 飞掠冥王星。冥王星只出现在资料文字中，不新增到星球导航目录。 | `https://science.nasa.gov/mission/new-horizons/`；`https://science.jpl.nasa.gov/projects/newhorizons/` |
| `tianwen-1` / 天问一号 / Tianwen-1 | 国家航天局（CNSA）；`tianwen-orbiter`；`mars` | 火星探测任务；本模型表示环绕器，不是祝融号火星车。2020-07-23 发射；2021-02-10 实施火星捕获。 | `https://www.cnsa.gov.cn/n6758824/n6759009/n6760412/c6840460/content.html`；`https://www.cnsa.gov.cn/n6759533/c6809878/content.html` |

使用原创简短中文概述，不复制整段官网文案。资料日期不是轨迹覆盖日期。注意 NASA 页面部分历史日期使用当地时间，不把未经换算的事件日历日期写成精确 UTC 时刻。

- [x] **Step 4: GREEN 与来源记录**

补充断言：每条资料都有名称、介绍、事件、HTTPS 官方来源、有效核验日期；关联天体必须通过 `isBodyId`。

Run: `npm test -- src/spacecraft/catalog.test.ts && npm run typecheck`

在 `docs/data-sources.md` 追加独立的航天器资料段：记录来源、核验日、事件只作文字、六艘目前均无已发布轨迹。不要修改旧的行星星历取证日期。

## Task 2: 有资源边界的轻量模型

**Files:** 创建 `src/spacecraft/models.ts`、`src/spacecraft/models.test.ts`；更新 `docs/asset-credits.md`。

**Consumes:** `SpacecraftModelKind`。

**Produces:**

```ts
import type { Group } from 'three';
import type { SpacecraftModelKind } from './catalog';
export interface SpacecraftModel {
  readonly root: Group;
  dispose(): void;
}
export function createSpacecraftModel(kind: SpacecraftModelKind): SpacecraftModel;
```

模型是归一化的预览几何，不含日心位置、速度或未经来源支持的真实尺寸。

- [x] **Step 1: 建立几何及释放回归**

```ts
import { expect, it } from 'vitest';
import { Box3, Mesh, Sphere } from 'three';
import { createSpacecraftModel } from './models';

it.each(['voyager', 'cassini', 'juno', 'new-horizons', 'tianwen-orbiter'] as const)(
  '%s has finite, framed geometry and releases each resource once', kind => {
    const model = createSpacecraftModel(kind);
    model.root.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(model.root).getBoundingSphere(new Sphere());
    expect(bounds.center.length()).toBeLessThan(1e-6);
    expect(bounds.radius).toBeCloseTo(1, 5);
    let triangles = 0;
    const resources = new Set<{ addEventListener(type: 'dispose', listener: () => void): void }>();
    model.root.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const positions = object.geometry.getAttribute('position');
      expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
      triangles += (object.geometry.index?.count ?? positions.count) / 3;
      resources.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) resources.add(material);
    });
    expect(triangles).toBeGreaterThan(100);
    expect(triangles).toBeLessThanOrEqual(20000);
    const disposals = new Map<object, number>();
    for (const resource of resources) resource.addEventListener('dispose', () =>
      disposals.set(resource, (disposals.get(resource) ?? 0) + 1));
    model.dispose(); model.dispose();
    expect([...disposals.values()]).toEqual([...resources].map(() => 1));
    expect(model.root.children).toHaveLength(0);
  },
);
```

- [x] **Step 2: 运行 RED**

Run: `npm test -- src/spacecraft/models.test.ts`

- [x] **Step 3: 按组成结构制作模型**

使用 `BoxGeometry`、低分段 `CylinderGeometry`、`LatheGeometry` 和 `MeshStandardMaterial`。不下载未经许可的 CAD、贴图或品牌标识。

| 模型 | 必须可辨识的简化组成 |
| --- | --- |
| Voyager | 碟形天线、紧凑机身、伸展的仪器杆、杆端三个 RTG 圆柱模块 |
| Cassini | 较高的金色主舱、顶部大天线、侧面仪器和下部支架；不表现实时构型 |
| Juno | 中央机身、顶部小天线、相隔约 120 度的三翼蓝色太阳能板 |
| New Horizons | 扁平紧凑的金色机身、大天线、侧向 RTG；与高舱体的 Cassini 区别明显 |
| Tianwen orbiter | 中央舱体、两侧太阳能板和通信天线；不可误做成火星车 |

各部件位置是原创示意比例。实现前参照任务官方外观资料；视觉验收核对上述识别特征，不将该表当成工程尺寸。

采用局部部件描述，以下构造方式可覆盖机身、太阳翼、支杆和天线：

```ts
import {
  Box3, BoxGeometry, CylinderGeometry, DoubleSide, Group, LatheGeometry,
  Mesh, MeshStandardMaterial, Sphere, Vector2,
} from 'three';
import type { Vec3 } from '../simulation/types';

interface Part {
  shape: 'box' | 'cylinder' | 'dish';
  position: Vec3;
  scale: Vec3;
  rotation?: Vec3;
  color: number;
}
function meshFor(part: Part): Mesh {
  const geometry = part.shape === 'box' ? new BoxGeometry(1, 1, 1)
    : part.shape === 'cylinder' ? new CylinderGeometry(1, 1, 1, 16)
    : new LatheGeometry(Array.from({ length: 9 }, (_, i) => {
      const r = i / 8;
      return new Vector2(r, 0.25 * r * r);
    }), 24);
  const mesh = new Mesh(geometry, new MeshStandardMaterial({
    color: part.color, roughness: 0.65, metalness: 0.3, side: DoubleSide,
  }));
  mesh.position.set(...part.position);
  mesh.scale.set(...part.scale);
  if (part.rotation) mesh.rotation.set(...part.rotation);
  return mesh;
}
function assemble(parts: readonly Part[]): SpacecraftModel {
  const content = new Group(), root = new Group();
  parts.forEach(part => content.add(meshFor(part)));
  content.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(content).getBoundingSphere(new Sphere());
  if (!Number.isFinite(bounds.radius) || bounds.radius <= 0) throw new Error('模型几何边界无效');
  content.position.sub(bounds.center);
  root.add(content);
  root.scale.setScalar(1 / bounds.radius);
  let disposed = false;
  return {
    root,
    dispose() {
      if (disposed) return;
      disposed = true;
      root.traverse(object => {
        if (!(object instanceof Mesh)) return;
        object.geometry.dispose();
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
      });
      root.clear();
    },
  };
}
```

`createSpacecraftModel` 内按表为五种模型定义 `Part[]` 后调用 `assemble`。每个部件各持有自己的几何和材质，故上述释放逻辑成立；若之后复用资源，必须改用集合去重并保留幂等测试。

例：Juno 三翼使用实际的三向结构而不是三个重合长方体：

```ts
const wings: Part[] = Array.from({ length: 3 }, (_, index) => {
  const angle = index * Math.PI * 2 / 3;
  return { shape: 'box', position: [Math.cos(angle) * 2, 0, Math.sin(angle) * 2],
    scale: [3, 0.04, 0.8], rotation: [0, -angle, 0], color: 0x244e80 };
});
```

- [x] **Step 4: GREEN 并记录原创模型边界**

Run: `npm test -- src/spacecraft/models.test.ts && npm run typecheck`

在 `docs/asset-credits.md` 追加：模型为项目内原创简化几何；官方资料只用作形态参考；不使用官方 CAD/贴图、不声称官方认可、不代表真实姿态或工程尺寸。

## Task 3: 航天器选中状态不干扰导航

**Files:** 更新 `src/rendering/runtime.ts`、`src/rendering/runtime.test.ts`、`src/rendering/SolarCanvas.tsx`、`src/App.tsx`、`src/ui/SearchPanel.tsx`。

**Consumes:** `SpacecraftId`、`isSpacecraftId`。

**Produces:**

```ts
export type Selection =
  | { readonly kind: 'body'; readonly id: BodyId }
  | { readonly kind: 'spacecraft'; readonly id: SpacecraftId };
export function getSelectedBodyId(selection: Selection | null): BodyId | null {
  return selection?.kind === 'body' ? selection.id : null;
}
// FrameSnapshot: replace selectedBodyId with readonly selection: Selection | null.
// RuntimeCommand: add { type: 'select-spacecraft'; id: SpacecraftId }.
```

此阶段 `NavigationState.target` 仍然只接受 `BodyId`。不要提前将一个没有轨迹的航天器变成导航目标。

- [x] **Step 1: 写出选中不影响相机和错误状态的测试**

```ts
it('selects spacecraft during a flight without changing its route or clock', () => {
  const runtime = createRuntime();
  runtime.dispatch({ type: 'set-paused', paused: true });
  runtime.dispatch({ type: 'fly-to', id: 'saturn' });
  const before = runtime.getSnapshot();
  runtime.dispatch({ type: 'select-spacecraft', id: 'voyager-1' });
  const after = runtime.getSnapshot();
  expect(after.selection).toEqual({ kind: 'spacecraft', id: 'voyager-1' });
  expect(after.navigation).toBe(before.navigation);
  expect(after.clock).toBe(before.clock);
  expect(after.world).toBe(before.world);
  runtime.dispose();
});
it('scene selection returns to a body without cancelling flight', () => {
  const runtime = createRuntime();
  runtime.dispatch({ type: 'fly-to', id: 'saturn' });
  runtime.dispatch({ type: 'select-spacecraft', id: 'cassini' });
  const before = runtime.getSnapshot();
  runtime.dispatch({ type: 'select', id: 'earth' });
  expect(runtime.getSnapshot().selection).toEqual({ kind: 'body', id: 'earth' });
  expect(runtime.getSnapshot().navigation).toBe(before.navigation);
  runtime.dispose();
});
```

还需新增：未知航天器 ID 显式报错并保留上次有效选中；已有错误不因选择航天器消失；当前选中无轨迹航天器时要求环绕或跟随应拒绝，并且导航状态不变。

- [x] **Step 2: 运行 RED**

Run: `npm test -- src/rendering/runtime.test.ts`

- [x] **Step 3: 迁移单一选中源**

```ts
// In dispatch:
const selectionOnly = command.type === 'select' || command.type === 'select-spacecraft';
let next: FrameSnapshot = selectionOnly ? frame : { ...frame, issue: null };

// New switch case:
case 'select-spacecraft':
  if (!isSpacecraftId(command.id)) throw new Error('未知航天器');
  next = { ...next, selection: { kind: 'spacecraft', id: command.id } };
  break;

// Final assignment:
frame = selectionOnly ? next : withNavigationIssue(next);
```

同步修改这些直接依赖，不保留可独立写入的旧 `selectedBodyId`：

- 初始选中：`{ kind: 'body', id: 'earth' }`。
- `select` 与 `fly-to`：写入对应的 body 选中对象。
- `set-navigation`：非 free 模式要求有效 body 选中，否则明确报错；不重锚至旧星球来假装跟随航天器。
- `set-mode`：选择航天器时使用当前导航的 body 锚点转换显示模式；无锚点则使用全景。不得把 spacecraft ID 用来索引行星目录。
- `SolarCanvas`：用 `getSelectedBodyId(frame.selection)` 推导标签高亮、既有 `diagnostics.selected` 和纹理焦点；无选中星球时沿用现有最近天体纹理策略。
- 旧 runtime 测试：迁移字段断言，保留“选中不改变相机/飞行/issue”的实际语义，不删除这些回归。
- `App` 和 `SearchPanel`：先使现有星球列表消费新状态，保证独立编译；新航天器界面在任务 4 接入。

- [x] **Step 4: GREEN**

Run: `npm test -- src/rendering/runtime.test.ts src/navigation/controller.test.ts src/rendering/frame-driver.test.ts && npm run typecheck`

## Task 4: 资料界面、交互预览和完整验收

**Files:** 更新 `src/App.tsx`、`src/ui/SearchPanel.tsx`、`src/app.css`、`src/ui/HelpPanel.tsx`、`README.md`；创建 `src/ui/SpacecraftPanel.tsx`、`src/ui/SpacecraftPreview.tsx`、`tests/e2e/spacecraft.spec.ts`。

**Consumes:** 前三项任务的目录、`Selection` 和 `createSpacecraftModel`。

**Produces:**

```ts
interface SpacecraftPanelProps {
  spacecraft: SpacecraftDefinition;
  onPreview: () => void;
}
interface SpacecraftPreviewProps {
  spacecraft: SpacecraftDefinition;
  close: () => void;
}
// SearchPanel additionally consumes Selection | null and:
// onSelectSpacecraft: (id: SpacecraftId) => void.
// Existing body callback remains (id: BodyId) => void and still triggers fly-to.
```

- [x] **Step 1: 先写可见行为回归**

```ts
import { expect, test } from '@playwright/test';

test('shows spacecraft information without inventing a scene position', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.getByRole('tab', { name: '航天器', exact: true }).click();
  await page.getByRole('searchbox').fill('Voyager 1');
  await page.getByRole('button', { name: '选择旅行者1号', exact: true }).click();
  await expect(page.getByTestId('selected-spacecraft')).toHaveText('旅行者1号');
  await expect(page.getByText('暂无可用轨迹', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '飞向航天器', exact: true })).toBeDisabled();
  await expect(page.locator('.distance-caption')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '环绕', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '跟随', exact: true })).toBeDisabled();
  await page.keyboard.press('g');
  await expect(page.getByRole('alert')).toContainText('暂无可用轨迹');
});

test('opens and closes a clearly labelled independent model preview', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.getByRole('tab', { name: '航天器', exact: true }).click();
  await page.getByRole('button', { name: '选择朱诺号', exact: true }).click();
  await page.getByRole('button', { name: '查看三维模型', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '朱诺号模型预览', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('非实时姿态');
  await expect(dialog.locator('canvas')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveCount(1);
});
```

在第一个测试发送 `G` 前确保焦点已离开搜索输入，不能靠“输入框禁用快捷键”让测试假通过。主相机断言从 `getByTestId('scene-container').locator('canvas')` 的已有诊断读取，不使用不加范围的两个 canvas 选择器。

- [x] **Step 2: 运行 RED**

确认已有服务响应后运行：

```bash
curl --fail --silent --show-error http://127.0.0.1:5174/ >/dev/null &&
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5174 npm run test:e2e -- tests/e2e/spacecraft.spec.ts
```

预期因为航天器分类/资料界面尚不存在而失败。

- [x] **Step 3: 接入列表、资料和动作隔离**

使用 `tablist`/`tab`/`aria-selected` 表示两个分类，默认显示天体；分类切换本身不选择对象、不移动镜头。航天器列表按中英文名称过滤，空结果显示明确提示。

资料面板内容使用目录中的值，来源链接附 `target="_blank" rel="noopener noreferrer"`。无轨迹面板不复用星球的 `distance-caption`。长名称及正文使用受限高度滚动布局，不覆盖底部控制条。

App 选中和窗口入口：

```tsx
const selection = snapshot.selection;
const selectedBodyId = getSelectedBodyId(selection);
const spacecraft = selection?.kind === 'spacecraft' ? spacecraftCatalog[selection.id] : null;
const [previewId, setPreviewId] = useState<SpacecraftId | null>(null);

// SearchPanel spacecraft callback:
const selectSpacecraft = (id: SpacecraftId) => dispatch({ type: 'select-spacecraft', id });

// In the details position:
{spacecraft && <SpacecraftPanel spacecraft={spacecraft} onPreview={() => setPreviewId(spacecraft.id)} />}
{previewId && <SpacecraftPreview spacecraft={spacecraftCatalog[previewId]} close={() => setPreviewId(null)} />}
```

`G` 在 spacecraft 选中时显示“该航天器暂无可用轨迹，无法飞近”，不调用上一个 body 的 `fly-to`；编辑框及模态窗口内继续忽略导航快捷键。环绕/跟随禁用条件加入没有有效 body 选中的情况，保留原示意模式限制。

主 `SolarCanvas.inputEnabled` 加入预览是否打开的条件。Escape 关闭预览时先 `preventDefault()`，随后只关闭窗口，保留原有面板 Escape 规则。

- [x] **Step 4: 实现预览场景和局部错误处理**

预览窗口使用独立的按需 `Canvas`，不调用主 runtime 的 `tick`、`dispatch` 或 `handleInput`。主入口启用了 React StrictMode，因此在 effect 每次建立时创建模型并挂到容器，清理时移除并释放；不能把已被第一次清理清空的 memo 模型重新挂载。

```tsx
function PreviewModel({ kind }: { kind: SpacecraftModelKind }) {
  const { camera, gl, invalidate } = useThree();
  const container = useRef<Group>(null);
  useEffect(() => {
    const parent = container.current;
    if (!parent) throw new Error('模型预览容器未初始化');
    const model = createSpacecraftModel(kind);
    parent.add(model.root);
    invalidate();
    return () => { parent.remove(model.root); model.dispose(); };
  }, [kind, invalidate]);
  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.enablePan = false;
    controls.enableDamping = false;
    controls.minDistance = 2;
    controls.maxDistance = 12;
    const changed = () => invalidate();
    controls.addEventListener('change', changed);
    controls.update();
    return () => { controls.removeEventListener('change', changed); controls.dispose(); };
  }, [camera, gl, invalidate]);
  return <group ref={container} />;
}
```

所需导入来自已有包：React 的 `useRef/useEffect`，R3F 的 `Canvas/useThree`，Three 的 `Group` 类型，`three/addons/controls/OrbitControls.js`，任务 2 的工厂和任务 1 的模型类型。查看已安装 OrbitControls 源码确认构造与释放 API。

Canvas 使用 `frameloop="demand"`，初始相机 `[3, 2, 4]`、FOV 40、near 0.01、far 100；增加环境光及两盏方向光，避免太阳系场景的极暗照明妨碍观察模型。模型预览照明不改变主场景曝光。

用窗口内的错误边界处理模型构建/渲染异常；`webglcontextlost` 在预览 Canvas 上阻止默认行为并显示“模型预览图形上下文已丢失，请关闭后重新打开”。解绑该监听器。使用 Canvas 的失败提示处理 WebGL 初始化不可用。错误不调用主场景的 fatal/recovery 状态，也不吞掉异常后展示成功界面。

- [x] **Step 5: 扩展浏览器回归至完整阶段 A**

在同一个 `spacecraft.spec.ts` 中完成这些有实际结果断言的用例：

- 六艘逐个打开，名称、发射日期、来源及模型窗口对应；旅行者 1/2 允许共用形状，但资料不能串号。
- 暂停主时间后记录主导航 pose，选择航天器、转动/缩放预览并关闭；日期不变，主相机位置变化不超过 `1e-6 km`，前向向量变化不超过 `1e-10`。
- 预览截图在旋转/缩放操作前后确实不同，并有明显非背景模型像素；不是只断言 canvas 元素存在。
- 飞行中选择航天器不会改写原航线；第一次 Escape 只关闭预览，不取消背后的飞行。
- 选择航天器后单击场景中的天体标签，会返回该天体资料，不自动飞近。可复用已固定日期的鼠标回归场景。
- 连续打开/关闭预览 12 次后只有一个主 canvas，无新增持久监听器行为；模型单元测试的资源释放检查同时通过。
- 用 `WEBGL_lose_context` 仅触发预览 Canvas 的上下文丢失；窗口显示错误，主场景继续运行，关闭后重新打开可以绘制。若浏览器确实不提供该扩展，按现有恢复测试方式说明跳过。
- 1280×720 与 1920×1080 下资料可滚动、关闭按钮可见、不覆盖底部时间操作。

主导航比较使用真实诊断，截图像素检查使用现有 `orbit-visibility.spec.ts` 的图像读取方法。不要为通过测试修改生产目录成假星历，也不暴露新的全局测试命令 API。

- [x] **Step 6: GREEN、说明与审阅**

```bash
npm test -- src/spacecraft/catalog.test.ts src/spacecraft/models.test.ts src/rendering/runtime.test.ts src/navigation/input.test.ts src/navigation/controller.test.ts src/rendering/frame-driver.test.ts &&
npm run typecheck &&
npm run build
```

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5174 npm run test:e2e -- \
  tests/e2e/spacecraft.spec.ts tests/e2e/solar.spec.ts tests/e2e/mouse-controls.spec.ts \
  tests/e2e/final-corrections.spec.ts tests/e2e/orbit-visibility.spec.ts tests/e2e/recovery.spec.ts
```

直接审阅生产改动及六艘截图，特别核对：主场景仍没有假航天器坐标；旧飞近/缩放/选择规则不受影响；没有增加未用的架构层、API、包或常驻渲染循环。

更新 README 和帮助页：增加航天器分类、预览控制及暂无轨迹的含义。明确“六艘资料与模型已交付；主场景真实轨迹尚未接入”，不得写成完整航天器轨迹功能已完成。

## 阶段 B 的启动条件，不属于本计划的实现项

某艘的官方原始样本、可再分发依据、坐标/时间说明和连续覆盖区间实际取得后，先复核设计中的数据与精度约束，再为该数据段编写独立实施计划。未取得数据时保留明确阻塞记录，不靠“未来接口”或空样本取消这个门槛。

## 执行前的文档自检

- 本计划覆盖设计的阶段 A 全部交付；阶段 B 明确保留真实数据门槛。
- 目录、模型、选中联合和 UI 之间的类型/命名一致。
- 没有让 `SpacecraftId` 进入行星 `Catalog` 或无真实数据的 `NavigationState.target`。
- 计划中的片段是实现蓝图，不是已经修改的产品代码；执行者需要遵守每项 RED → GREEN 顺序。

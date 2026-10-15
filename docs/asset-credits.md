# 视觉资产来源

下载日期：2026-10-13。

本项目中的行星、太阳、月球、地球云层和夜景、土星环与银河背景来自 Solar System Scope / INOVE。

- 来源：https://www.solarsystemscope.com/textures/
- 作者：Solar System Scope / INOVE
- 许可：Creative Commons Attribution 4.0 International (CC BY 4.0)
- 许可全文：https://creativecommons.org/licenses/by/4.0/
- 2K 原图位于 `public/assets/textures/`，保持下载内容不变。
- `public/assets/base/` 是使用 macOS sips 重采样为 512 像素宽的衍生版本。
- 发布文件中的逐项清单位于 `public/asset-credits.json`。

供应方说明：部分未测绘区域使用推断地形，颜色经过艺术化调整；地球图像并非动态季节影像。项目的背景星空不可选中，不当作可导航的真实星表。

以上作者未为本项目背书。未使用 SpaceEngine 或所参考视频中的专有资产。

星体位置算法使用 Astronomy Engine (Don Cross, MIT)，详细数值来源见 `data-sources.md`。依赖许可随 `public/third-party/` 发布。

## 航天器模型

2026-10-15 新增的六艘航天器预览使用项目内原创简化几何（`src/spacecraft/models.ts`），旅行者 1/2 共用一种基础构造。机身、天线、太阳翼和支杆由基础几何组成，不使用官方 CAD、贴图、徽标或第三方模型。

形态参考：NASA 的 Voyager 仪器说明 `https://science.nasa.gov/mission/voyager/instruments/`、Juno 任务中的 Spacecraft Design `https://science.nasa.gov/mission/juno/`、Cassini 时间线中的示意图 `https://science.nasa.gov/mission/cassini/the-journey/timeline/`、New Horizons 任务说明及 NSSDCA 外形描述 `https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2006-001A`，以及国家航天局的环绕器图像说明 `https://www.cnsa.gov.cn/n6758823/n6758838/c6813038/content.html`。

模型为外观示意，非工程模型；比例为取景归一化比例，不代表实际尺寸。姿态非实时姿态，天问一号仅表示环绕器。上述机构未为本项目背书。

## 历史航迹的数值来源

旅行者1号的主场景航迹与木星回放位置来自 `VG1-J-SPICE-6-SPK-V2.0` 的 SPICE 查询输出，不是从任务示意图描出的线。仅发布派生数值，原 SPK/LSK 和档案长文不包含在网页构建中。

NASA Open Data 对应记录显示 `License not specified`，这里不将其标为 CC0、MIT 或声称获得原始文件的任意再分发许可。原档明确提供用于轨迹生成和坐标转换；来源、原文件摘要、工具版本、数据限制和数值验证见 `data-sources.md` 及 `src/spacecraft/voyager1-manifest.json`。定位点及轨迹线的图形实现为本项目自制，不表示实际航天器尺寸，也不构成机构背书。

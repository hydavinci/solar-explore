export function CreditsPanel({ close }: { close: () => void }) {
  return <div className="modal-backdrop"><section className="modal panel" role="dialog" aria-modal="true" aria-label="关于与鸣谢">
    <div className="panel-heading"><span>关于 SOLAR</span><button className="icon-button" aria-label="关闭鸣谢" onClick={close}>×</button></div>
    <h2>一个太阳系，无数次出发。</h2>
    <p>这是一个以真实尺度探索为主的浏览器天文项目。借鉴 SpaceEngine 的漫游理念，不使用其代码或专有素材。</p>
    <h3>天体图像</h3>
    <p>Solar System Scope / INOVE · CC BY 4.0。原图保留，另生成 512 像素宽的低分辨率版本。部分原始图像包含艺术化色彩或推断地形。</p>
    <a href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noreferrer">图像来源 ↗</a>
    <h3>天文计算</h3>
    <p>Astronomy Engine / Don Cross · MIT。使用数值天文模型，不进行多体引力积分；本应用的自转、光照和大气是近似可视化，不用于航天导航或精密交食预测。</p>
    <a href="https://github.com/cosinekitty/astronomy" target="_blank" rel="noreferrer">算法来源 ↗</a>
    <p><a href={`${import.meta.env.BASE_URL}asset-credits.json`} target="_blank" rel="noreferrer">逐文件素材与许可清单 ↗</a></p>
  </section></div>;
}

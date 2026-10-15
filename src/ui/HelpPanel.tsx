export function HelpPanel({ close }: { close: () => void }) {
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <section className="modal panel" role="dialog" aria-modal="true" aria-label="飞行指南">
      <div className="panel-heading"><span>飞行指南</span><button className="icon-button" onClick={close} aria-label="关闭指南">×</button></div>
      <h2>从这里，出发。</h2><p className="muted">从列表或搜索结果选择一个世界，镜头会自动飞近并进入环绕。</p>
      <dl className="key-guide">
        <dt><kbd>列表 / 搜索</kbd></dt><dd>单击天体，自动飞近并居中</dd>
        <dt><kbd>W A S D</kbd></dt><dd>自由飞行：前后左右移动</dd>
        <dt><kbd>Q</kbd> <kbd>E</kbd></dt><dd>自由飞行：下降 / 上升</dd>
        <dt><kbd>左键拖动</kbd></dt><dd>环绕模式：围绕天体旋转</dd>
        <dt><kbd>右键拖动</kbd></dt><dd>自由飞行 / 跟随模式：转动视角</dd>
        <dt><kbd>左键单击</kbd></dt><dd>场景内仅选择天体或航天器定位点；拖动不会触发选择</dd>
        <dt><kbd>滚轮</kbd></dt><dd>环绕缩放 / 调整飞行速度</dd>
        <dt><kbd>G</kbd></dt><dd>飞向选中天体或有效回放中的航天器</dd>
        <dt><kbd>Esc</kbd></dt><dd>取消飞向 / 关闭面板</dd>
        <dt><kbd>H</kbd></dt><dd>隐藏或恢复界面</dd>
        <dt><kbd>/</kbd></dt><dd>搜索当前分类的天体或航天器</dd>
      </dl>
      <h3>航天器资料与模型</h3>
      <p>左侧切换“航天器”，可查看旅行者1号、旅行者2号、卡西尼号、朱诺号、新视野号和天问一号的任务资料与官方来源。点击“查看三维模型”，左键旋转、滚轮缩放，Esc 关闭。预览不改变主相机或模拟时间。</p>
      <p>旅行者1号已有 1979 年木星飞掠的历史导航星历。选择“回放木星飞掠”后主动跳转日期，初始暂停，可播放、倒放、飞近与跟随。木星使用同源参考位置；跨越有效数据段边界会暂停并退出，不外推位置。其余五艘暂未接入轨迹。</p>
      <p>主场景定位点非实际尺寸。预览模型为原创简化外观，非工程模型、非实时姿态；天问一号仅表示环绕器。档案未逐段标明重建/预测属性，不代表实时位置或精密定轨。</p>
      <p className="notice">真实尺度下，遥远的行星通常小于一个像素。从列表或搜索结果选择即可飞近；场景内选中后可按 G 或点击“飞向天体”。也可切换示意模式查看全景。地表降落不在本版本范围内。</p>
    </section>
  </div>;
}

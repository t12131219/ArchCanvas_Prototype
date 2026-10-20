# 阶段间隙审核

生产规则和命令见 `docs/rank-clearance.md`。所有当前 SVG 重新生成；旧报告及
基线脚本按哈希引用，完整 per-view layout JSON 可用 producer 重建，不入库。

- `comparison.html`：手工几何输入的实际前后对照及被拒绝候选。
- `panel-comparison.html`：Transformer 局部面板前后对照。
- `transformer-comparison.html`：两个整图展开状态、失败候选和专用展开参考。
- `text-qa.html`：全部当前实际 SVG。
- `rank-report.json` / `svg-report.json`：独立几何、端口、角色与事实检查。
- `ui-report.json`：实际编辑器导出与 CLI、一致的规范 IR 及 6 → 1 → 6。
- `source-expandability.json`：全部 3371 节点 / 3663 边可进入原始源码投影。

几何测试图不是抽取或语义认证证据。Transformer 整图仍有预算和路由限制；
局部改善与所有事实检查通过都不能证明已达到专用参考。

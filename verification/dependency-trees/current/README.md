# 本轮审核产物

查看 `comparison.html` 的通用摘要／再展开对照，以及 `transformer-comparison.html`
的局部收益、整图成本和专用参考。`docs/dependency-trees.md` 说明生产规则及限制。

`render-report.json` 记录 34 个真实 SVG 状态、输入／实现／输出哈希和几何指标。
`svg-report.json`、`tree-report.json`、`receipt-report.json` 独立审核绑定、物理路径、
切边、角色、参数读取、表达目标和几何。`native-text-report.json` 来自浏览器实际测量。
`ui-report.json`、`ui-opened.json` 和 UI 导出／截图记录真实操作与重开结果。
`source-expandability.json` 检查全部 3371 节点／3663 边可达，不证明大图渲染性能。

基线固定于 `verification/local-relations/iteration-26-before-dependency-trees` 的
518eddb 实现。已有案例仅在生产文件全部哈希相符时复用上一轮的真实 SVG 输出。
新案例在冻结实现上渲染；历史输入及报告不重签、不改写。

当前 Transformer 的局部摘要保留了认证角色和原始展开能力，但总高度增加，
整体仍明显未达到专用参考。验证一致不等于目标完成。

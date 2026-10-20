# 通用依赖 DAG 摘要审核

实际 SVG 对照见 [comparison.html](comparison.html)，Transformer 与专用参考见 [transformer-comparison.html](transformer-comparison.html)。专用参考仅用于评价；生产行为来自局部依赖事实。

`render-report.json` 记录输入、实现、冻结基线及输出哈希。`svg-report.json` 独立核对 DAG 引用、每个原始操作数及结果槽、边界与 accounting；`dag-report.json` 检查几何、结果身份、实际输出路径和详细表达取舍；`receipt-report.json` 检查展开与认证角色回执。

`native-text-report.json` 为 45 张 SVG 的真实浏览器原始尺寸文字测量（1190 段文字、零溢出）。`ui-report.json` 记录 5 → 9 → 5 → 9 的实际双击及保存重开，三份 UI 导出 SVG 与命令行对应状态逐字节一致。布局 JSON 可通过生成工具重建，默认不纳入版本库。

`source-expandability.json` 证明 Transformer 源码细节投影保留 3371 节点、3663 边；不证明数千节点同屏 SVG 路由或交互性能。Transformer 默认图本轮没有变化，尚未达到专用参考。

范围、规则、限制和复核命令见 [dependency-dags.md](../../../docs/dependency-dags.md)。总体目标未完成。

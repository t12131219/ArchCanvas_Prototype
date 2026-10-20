# 本轮证据范围

冻结基线为 `c5f5ce6`，位于 `verification/local-relations/iteration-29-before-summary-coverage`。历史报告保持原样。

`render-report.json` 绑定当前实现、输入、SVG 和图文档；`coverage-report.json` 独立核对 XML 文字、canonical 依赖和实际边界路径。`svg-report.json`、`receipt-report.json` 分别核对几何和原始绑定。

`native-text-report.json` 包含实际原始尺寸测量以及逐字节相同 SVG 的历史测量来源。`ui-report.json` 记录真实编辑器的 6 → 11 → 6 → 11 操作、有限范围的检查器说明、实际导出和保存文档哈希。CLI 图文档被忽略，可由渲染命令再生成；实际 UI 保存文件 `ui-saved.layout.json` 随本轮证据保留。

442 项测试、44 个 SVG 状态、105 项局部结构目标和 923 段文字检查不等于完整目标达成。Transformer 的几何本轮未变；联合摘要/细节选择、专用参考对应、全图规划与数千节点同屏性能仍未完成。

`comparison.html` 展示摘要与展开，`transformer-comparison.html` 展示冻结基线、当前结果和专用详细参考。截图与目视结论见 `visual-review.json`。

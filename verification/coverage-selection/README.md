# 局部表达选择：进行中

本目录保存结构优先的局部选择实现、静态输入和审核产物。完整本地测试记录为 450 项通过；22 份正式 SVG 的独立几何、绑定、角色回执和选择检查通过。原生文字检查覆盖 1215 项；真实编辑器切换及保存重开结果为 29 → 25 → 29 → 25 → 25。整体验收仍未完成，不能据此声称 Transformer 已接近专用参考。

新增策略通过实际候选布局比较关键关系、结构收益和细节收益，保留旧有内部操作优先策略及手动展开。它是有预算限制的局部选择，不是全局摘要与细节规划。

复现入口为 `tools/extract_coverage_selection.py`、`tools/audit_coverage_selection.cjs` 和 `tools/audit_coverage_selection.py`。独立 SVG 检查使用 `python3 tools/audit_local_svg.py --coverage-selection --dags`。未选中候选的几何目前仅由生产端回执记录，独立审核不重新渲染这些候选。

当前阶段由 `verification/publication/active-stage.json` 指向本目录，历史 summary-coverage 证据保持原样。`comparison.html` 对照两种策略及手动展开；`transformer-comparison.html` 对照默认图、结构策略与专用参考。Transformer 本轮三份图逐字节一致，94 图元 / 102 边，57 交叉。MixedWeave 虽更紧凑，但交叉增加且细节覆盖不同，页面明确展示这一取舍。

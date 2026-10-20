# 局部表达选择：进行中

本目录保存结构优先的局部选择实现所用静态输入及阶段产物。本次检查点的完整本地测试记录为 450 项通过；正式渲染对照和独立审核尚未汇总完成。当前目录中的 SVG、界面导出及截图属于待完成审核的阶段产物，不能据此声称全部视觉检查通过或 Transformer 已接近专用参考。

新增策略通过实际候选布局比较关键关系、结构收益和细节收益，保留旧有内部操作优先策略及手动展开。它是有预算限制的局部选择，不是全局摘要与细节规划。

复现入口为 `tools/extract_coverage_selection.py`、`tools/audit_coverage_selection.cjs` 和 `tools/audit_coverage_selection.py`。正式渲染完成后才能运行依赖 render-report.json 的独立审核。未选中候选的几何目前仅由生产端回执记录，独立审核不重新渲染这些候选。

当前正式验收阶段仍由 `verification/publication/active-stage.json` 指向 summary-coverage；本目录不替换该阶段的既有证据。

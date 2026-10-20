# 条件比较的可逆展示

本阶段围绕直接、独占消费的源码比较和已有条件区域组织画面。原始事实保留，摘要打印实际条件，展开可恢复比较、控制及分支。整体目标仍在进行中。

当前状态：实现及 458 项测试完成；17 份正式 SVG 已生成并完成事实、几何及角色回执审核，1264 处原生文字测量无失败，真实 UI 的展开、折回和保存重开已验证。正式对照页及视觉审核已保存。Transformer 默认图未变，显式角色图仍过高且超出面积预算，整体目标未完成。`comparison-preview.html` 是早期局部预览，正式证据以 `current/render-report.json` 和正式对照页为准。

冻结基线是 `verification/local-relations/iteration-31-before-condition-predicates`，来自提交 `ca0d039`。既有历史审核不被重新封装成当前实现的证据。

复现命令（在 `prototype/Summary_Merge`）：

```sh
python3 tools/extract_condition_predicates.py
python3 tools/run_local_tests.py
node tools/audit_condition_predicates.cjs
python3 tools/audit_local_svg.py --condition-predicates --dags
python3 tools/audit_role_detail_receipts.py --condition-predicates
python3 tools/audit_condition_predicates.py
python3 tools/build_condition_predicates_review.py
node tools/audit_source_expandability.cjs verification/symbolic-values/current/transformer-current.json verification/condition-predicates/current/source-expandability.json
python3 tools/summarize_publication_checks.py
```

完整测试为 458 项，正式生成结果为 17 份 SVG。布局文档体积较大，不纳入版本控制；SVG、回执、审核报告及真实 UI 保存文档保留。重跑生成器会重建布局文档。真实编辑器与原生文字测量通过浏览器执行，相关产物不能由上述 CLI 命令代替生成。

汇总器仅在当前实现哈希与所有产物一致时写入 `evidence_consistent: true`。它保持 `goal_complete: false` 并返回 2，表示阶段证据一致、完整目标未完成。不能把这个退出码改写成整体验收通过。

`current/comparison.html` 展示原摘要、条件摘要、继续展开和保护边界案例；`current/transformer-comparison.html` 展示默认状态、显式角色细化及专用参考。默认 Transformer 未变，角色细化的成本单独报告。局部摘要变小或交叉减少，不等于整体模型更接近专用参考。

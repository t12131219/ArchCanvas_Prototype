# 独占分支末端的语义阶段审核

本阶段将有证据的单输入分支末端与已有局部加法、后归一化摘要组合。基线为 `iteration-32-before-branch-tail-stages`，冻结于 f251215。原始 IR 不变，默认图和继续展开分别检查。完整目标仍在进行。

在 prototype/Summary_Merge 执行：

```sh
python3 tools/extract_branch_tail_stages.py
python3 tools/run_local_tests.py
node tools/audit_branch_tail_stages.cjs
python3 tools/audit_local_svg.py --branch-tail-stages --dags
python3 tools/audit_role_detail_receipts.py --branch-tail-stages
python3 tools/build_branch_tail_review.py
node tools/audit_source_expandability.cjs verification/symbolic-values/current/transformer-current.json verification/branch-tail-stages/current/source-expandability.json
python3 tools/summarize_publication_checks.py
```

当前审计包含 20 份实际 SVG、465 项测试以及真实浏览器文字与编辑器操作证据。布局文档较大，由生产脚本在本地生成；真实 UI 保存文档单独保留。浏览器证据必须来自实际页面，以上 CLI 命令不能代替它们。

`current/comparison.html` 展示陌生输入、保护边界和继续展开；`current/transformer-comparison.html` 展示默认状态前后与专用参考。节点减少和高度下降不表示角色对应、整体阅读质量或完整目标已验收。

早期生产报告曾缺少三个布局回执字段。`--complete-receipts` 只从完全相同的已散列 SVG 和布局文档补取元数据，保留先前报告及散列；它要求渲染实现保持一致，只允许独立生产和审计工具更新。正式重新生成会直接写出这些字段，不需要该模式。所有历史报告均保持原样。

汇总器输出 `evidence_consistent: true`、`goal_complete: false` 并返回 2，含义是阶段证据一致而完整目标未完成。

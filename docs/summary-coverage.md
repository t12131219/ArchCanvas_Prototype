# 摘要结构与原子细节分别验证

目标保持不变：根据局部计算事实选择可逆的语义展示，使通用图的一个中间状态接近专用架构图；该状态下面仍保留原始细节。规则不能依赖模型名称、案例 ID 或专用版式。陌生、残缺和混合结构必须继续保留真实接口及未知边界。

本轮补上选择器所需的一种表达证据：同一段操作依赖结构，可以由有内容的摘要表达，也可以由展开后的操作与路径表达。`summary-goals.js` 从 canonical IR 重建操作名称、内部依赖、结果槽和源码切边，分别验证两种形式。仅有一个模块名称、隐藏的说明或附带的切边记录不能满足检查。展开后的操作必须真正显示相应名称；结构打包的显示名称为 `Pack values`。

每个 `dependency-structure` 目标记录 `summary`、`operation-paths` 或 `deferred`。它只覆盖操作及内部依赖结构和有效的边界路径，明确不覆盖全部操作数、参数值、配置值、执行顺序或运行行为。现有 `expression_goals` 和详细覆盖分数继续独立计算，不能由摘要补满。隐藏的嵌套候选仍然未完成。

局部自适应细化现在要求保留之前已表达的依赖结构，并在回执中记录丢失和保留项。摘要检查不产生原子细节收益。联合选择摘要、角色关系和细节的整体规划尚未完成，本轮没有改变候选选择算法。

规则消费已有的局部路径、树和 DAG 候选，继续保留 2–6 个操作、单一结果、源码 helper/module 的范围限制。未知、条件、控制、效果、身份、运行证据、认证与重复边界不能被该摘要跨越。这不意味着这些边界内的计算已被解释。

验证覆盖两个独立来源、内部结果复用、未知邻接、晚到上下文、树、共享值、结果槽、参数读取及预算细化。完整套件 442 项通过；44 个 SVG 状态通过几何、原始绑定和独立结构审核，共检查 105 项结构目标。原始尺寸文字审核覆盖 923 段文字，无节点内溢出。25 个状态复用逐字节相同 SVG 的历史测量并记录来源，其余按当前 SVG 原始尺寸测量。

真实编辑器以 SourceMosaic 验证摘要 → 展开 → 收起 → 保存重开，图元数为 6 → 11 → 6 → 11，三个实际导出 SVG 与命令行及保存前一致，canonical IR 未变。检查器明确显示摘要/操作路径及其有限范围。

Transformer 本轮默认 SVG 与冻结基线逐字节相同：94 图元、102 边、2588 × 4364 px、57 交叉、0 无关接触。14 个摘要满足局部结构检查，60 个隐藏候选仍未完成。当前通用图与专用参考的模块组织和版式差距仍明显，本轮没有提高视觉接近程度。

源码投影可恢复全部 3371 个节点、3663 条边；这不证明数千节点同屏 SVG 路由或浏览器交互性能，也不证明任意 Python 行为均可抽取。源码、运行实例和合并证据的节点数不能直接比较。

下一步应以这些独立目标驱动摘要与细节的联合选择，再改善主路径、分叉汇合和跨区域连接的组织。必须在陌生混合和破坏测试上验证，不能仅优化 Transformer 的评分或几何。

审核入口：`verification/summary-coverage/current/comparison.html` 和 `transformer-comparison.html`。

复验命令：

```sh
python3 tools/run_local_tests.py
node tools/audit_summary_coverage.cjs
python3 tools/audit_local_svg.py --summary-coverage
python3 tools/audit_role_detail_receipts.py --summary-coverage
python3 tools/audit_summary_coverage.py
node tools/audit_source_expandability.cjs verification/symbolic-values/current/transformer-current.json verification/summary-coverage/current/source-expandability.json
python3 tools/build_summary_coverage_review.py
python3 tools/summarize_publication_checks.py
```

最后一条在证据一致而完整目标尚未完成时返回 2。浏览器测量和真实 UI 证据需通过实际操作取得，不能由上述命令替代。

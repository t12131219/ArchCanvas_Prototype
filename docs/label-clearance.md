# 按绘图容器分配标签留白

本轮只优化通用几何规则。重复的带标签连线曾把整图的 `gapY` 提高到同一个值，
使不相干的 helper、未知计算和未展开的认证模块也一起变高。新候选按最终绘图
层级中两个端点的最近共同父容器分配留白；源码外框被转换为来源注释后，使用
实际绘图父子关系。每条条件边、操作数、绑定和结果槽继续独立存在。

`architecture-layout.js` 提供 `labelClearances` 和逐父容器间距。
`publication.js` 投影局部候选，保留显式 `paperLabelGapY` 作为全局下限。
`publication-renderer.js` 在完成原有布局选择后，用同一可见前沿测量一个候选：
面积至少减少 2%，宽度增幅不超过 5%，高度和线长不增加，字号、路由、标签、
交叉、无关接触、非同值路径重叠和约束冲突均不退化，才采用。

自动比较还要求规范 IR 的展示去向、节点与边身份、操作数、条件、切边、展开
集合和角色证明收据相同。用户位置、打印模式与显式间距模式不自动替换。
`paperLabelSpacing: 'local'/'global'` 可用于重现实验；保存原状态后重新打开，
仍会确定性地选择相同布局。规则不消费模型类名、案例 ID、源码 SHA 或专用模板。

当前按父容器分配，还没有细化到某个具体 rank 或某段路由；横向合绘标签的
`foldGapX` 仍沿用既有策略。布局候选不会通过减少请求的细节来满足面积预算。
自动选择记录 `diagnostics.routing.clearance_refinement`，包括采用或拒绝、原始
与候选指标以及实际涉及的端点对。

## 审核结果

基线为 `0caf4bc`，64 份当时原始文件保存在
`verification/local-relations/iteration-23-before-label-clearance`。本轮全量重新生成
22 张实际 SVG，独立审核操作数、切边、来源归属、角色所有权、路径和 accounting；
13 个既有状态的 SVG 与上轮逐字节相同，其中包括 8 个默认状态。历史报告及冻结
输入保持原字节。ForeignSignals/CrossedSignals 是人工构造的几何测试图，不能当成
模型抽取或未知模型语义识别的成功证据。

| 几何测试 / 评价状态 | 原尺寸 | 候选尺寸 | 原 / 候选交叉 | 自动选择 |
|---|---|---|---|---|
| ForeignSignals | 540 × 752 | 540 × 580 | 0 / 0 | 采用，面积下降 22.9% |
| CrossedSignals | 300 × 1276 | 300 × 1036 | 1 / 0 | 拒绝，新增 2 处无关接触 |
| Transformer 追加一个角色区域 | 2332 × 9532 | 2332 × 7672 | 98 / 112 | 拒绝，交叉增多 |
| Transformer 追加三个角色区域 | 2332 × 11224 | 2332 × 9724 | 219 / 227 | 拒绝，交叉增多 |

两种 Transformer 整图细化仍超过面积预算；三区域状态仍有路径重叠及 19 处无关
接触。默认 Transformer 仍为 2588 × 4530、100 图元 / 106 边、57 交叉。
本轮没有改善 Transformer 实际选中图，也没有证明它接近专用展开参考。

386 项测试通过。浏览器在独立 SVG 原始比例检查 1754 处文字，其中 1719 处矩形
内文字均通过；圆形符号不套用矩形包含。真实编辑器的 SVG 与 CLI 相同，局部收起
和重开为 10 → 6 → 10，规范 IR 不变；SameSource 的默认、角色细化与更深源码
展开状态也保持原图。

本轮另核对完整源码 IR：3371 个节点、3663 条边。切到源码视图并展开所有
容器后，3371 / 3663 全部进入实际可见投影，规范 IR 保持不变，记录在
`source-expandability.json`。该检查验证细节仍可到达，不代表已验证上千节点
整图的 SVG 路由质量或浏览器性能。“接近专用展开图”的状态是中间语义前沿，
不是通用层的最细状态；各区域可以采用不同的粒度。

审核页同时展示采用与拒绝结果：`verification/label-clearance/current/comparison.html`
和 `transformer-comparison.html`。体积缩小、原生字号合格、通过事实审核分别说明
不同性质，不能单独作为整体架构图收敛的结论。

```sh
python3 tools/run_local_tests.py
node tools/audit_label_clearance.cjs
python3 tools/audit_local_svg.py --clearance
python3 tools/audit_label_clearance.py
python3 tools/build_label_clearance_review.py
node tools/audit_label_clearance_ui.cjs
python3 tools/summarize_publication_checks.py
```

最后一个命令返回 2 表示证据一致、整体目标未完成。浏览器文字和 UI 产物来自真实
浏览器检查。下一步应进一步定位跨区域依赖的实际路由空间，把局部间距的选择粒度
细化到受影响的 rank/通道，并同时检查已实现的角色列、旁路和上下文关系；不能放宽
事实约束，也不能把减少面积但增加交叉的失败实验当成进步。

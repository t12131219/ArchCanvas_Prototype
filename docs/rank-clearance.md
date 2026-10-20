# 依赖阶段间隙与逐区测量

目标仍是通用、证据驱动的局部语义与绘图适配，使一个可逆的中间语义状态逐步
接近人工认证和设计的架构图，同时保留源码细节。此轮推进的是几何部分，没有
增加模块家族识别器，没有补出任何缺失计算，也没有降低当前请求的展开程度。

## 规则

上一轮已经把平行标签连线的留白从全图缩小到实际绘图父容器，但一个容器仍会
把每个依赖阶段都撑高。本轮根据实际可见端点、父子关系和 SCC 缩点后的依赖
层次，把额外垂直留白放在较后端点所在阶段之前。中间计算、条件、结果槽与
每条真实连接均保留；跨阶段不意味着执行并行或时间顺序。

同一 rank 或 SCC 内的端点没有唯一垂直间隙，保留父容器留白。一个 rank 内
换行的节点也保留原间距。折行列和复合端口对齐沿用原策略，收据明确标为没有
应用阶段间隙，不能用该收据声称这些排列获得了阶段级优化。

渲染器先测量完整候选。失败后，按可节省间距选取最多三个绘图父容器，逐区
测量；每次仅将通过的区域加入当前选择，其他区域保留此前选中的全局或局部
留白。选择依赖几何与图结构，不读取模型名、类名、案例 ID、源码 SHA 或专用
模板。计算阶段、实际绘图父容器和源码容器是不同概念。

每次采用仍需满足相同可见节点、展开集合、操作数、结果槽、条件、切边、
逐对象 accounting 与角色收据；面积下降超过 2%，宽度增幅不超过 5%，高度与
线长不增加，字号、路由、标签、交叉、无关接触、异值路径重叠及约束冲突均
不退化。完整候选更小但交叉变多时，不能作为采用结果。

`paperLabelSpacing:'rank'` 可以显式重现实验，`paperLabelRankParents` 限定
绘图区域，`paperLabelRankFallback:'global'/'local'` 指定其他区域的基线。
显式选项、打印和手动位置不被自动替换。默认自动选择不改写用户保存的展开
状态；重开时以相同规则确定性重新测量。

`publication.label_clearance.rank_layout` 记录实际阶段及间隙，
`diagnostics.routing.rank_clearance_refinement` 分开记录完整候选、每次逐区
测量和最终选择。独立 Python 审核会从导出的真实矩形坐标检查间距，不能只
检查渲染器自己声明的收据。

## 已核实的收益与限制

局部 Transformer 面板保持 22 图元 / 28 边，由 658 × 1958 缩至
658 × 1478，交叉仍为 3，没有新增接触或路径重叠。

展开一个嵌套角色区域的整图保持 114 图元 / 127 边，由 2332 × 9532
缩至 2332 × 9232，交叉从 98 降至 92，无关接触仍为 0。完整候选的
2332 × 7012 增加了交叉，因此拒绝；实际收益来自单独通过审核的局部区域。
该整图仍超过面积预算，不能称为整图几何通过或已接近专用参考。

三区域状态保持 142 图元 / 169 边、2332 × 11224、219 交叉和 19 处无关
接触；全部候选均增加交叉，保留原图。它仍有 7 组异值路径重叠及面积预算
问题。默认 Transformer 仍为 2588 × 4530、100 / 106、57 交叉。混合与
残缺模型以及更深的 SameSource 状态均参加新一轮实际 SVG 审核。

本轮重新生成 21 张实际 SVG，其中 12 个既有状态与上轮逐字节相同。独立
事实和几何审核通过。浏览器在各独立 SVG 的原始比例检查 1713 处文字，
其中 1678 处矩形内文字均通过包含检查；圆形运算符不套用矩形包含。

ChannelChain、ForeignSignals、CrossedSignals 是手工几何输入，不能当成模型
抽取、语义认证或未见模型泛化的证据。395 项测试通过。实际编辑器还核对了
6 → 1 → 6 收起／重开，规范 IR 保留未知调用及真实输入输出。

原始源码投影重新核对为 3371 图元 / 3663 边，全数可达，规范 IR 不变。
这不等于已经验证上千节点 SVG 的路由或浏览器性能。

下一步仍需推进全图局部语义表达的自适应选择、密集跨区通道及参考逻辑对应。
此轮的有限贪心几何候选不能替代这些工作，整体目标保持未完成。

## 重现

基线 `d15d811` 的原始渲染器保存在
`verification/local-relations/iteration-24-before-rank-clearance`，历史 SVG、
输入与报告按原字节引用，不重新认证或重写历史数据。

```sh
python3 tools/run_local_tests.py
node tools/audit_rank_clearance.cjs
python3 tools/audit_local_svg.py --rank-clearance
python3 tools/audit_rank_clearance.py
python3 tools/build_rank_clearance_review.py
node tools/audit_source_expandability.cjs verification/symbolic-values/current/transformer-current.json verification/rank-clearance/current/source-expandability.json
node tools/audit_rank_clearance_ui.cjs
python3 tools/summarize_publication_checks.py
```

UI 导入、导出和浏览器文字／截图检查需要实际浏览器操作。最后一条命令的
退出码 2 表示证据一致但整体目标尚未完成。

# 最终外框归属与空白带压缩

展开模块标题默认允许连线穿过，包括 Multi-head attention、attention 等。实际计算节点、无关模块正文、端口标签仍是障碍。本轮进一步整理冗余来源外框；规则作用于通用 canvas/roles 图，不读取模型名称、案例 ID、源码哈希或专用图坐标。

## 通用规则

早期代表外框合并会重新布局和路由整图，可能增加交叉。因此在既有布局与路由优化完成后，再检查一次已有的重复结构证据：一个已展开、结构已证明的具体代表，配合完整且保持关闭的有序后续调用，可以与它的序列共用外框。来源身份、源码位置、结构代表范围、参数共享证据和后续调用都保留为可检查记录。只改变绘图归属，不证明数值等价、纯函数、参数稳定或并发执行。

使用现有 `frame-ownership` 资格：未知内容、共享身份、原地修改、已观测调用、代表本身的条件/语义边界、runtime-only、不完整或异构的后续范围均不能被折去。序列外面的条件或未知内容不阻止独立成立的局部整理。候选外框不得作为可见连线端点；需要迁移上下文通道归属或候选目标也将被移除时，保守保留外框。

外框去除后，剩余节点保持横坐标和宽度。只在被去除标题提供的候选范围内，寻找全图空白的水平带：所有实际节点正文、剩余展开标题文字区、端口标签、端点和水平路径均保留 8px 余量，最小删除带为 16px。所有节点和所有路径使用同一个单调纵坐标映射；不重新路由，不改变连接拓扑。标题区在这里保留空间，是为了不压扁文字，与允许连线穿过标题的路由策略独立。

旁路设计通道需要随外框迁移到序列框；否则可能丢失残差约束。实现同时转移设计通道宽度和 `design_route.owner`。当前 `consumer_arguments` / `operand_rows` 位置记录应用相同映射，先前路由阶段的测量保留其当时含义。

仅在画布变矮、面积减少，且宽度、线长、交叉、无关接触、歧义重叠、字号、路由失败、标签、质量问题、已应用约束、已实现关系及全部既有直接表达目标均不退化时采用。`diagnostics.routing.final_sample_frame_refinement` 记录候选、空白带、前后指标与目标保留结果。显式外框策略、标题避让、手动位移、打印模式及超过 128 条边的图跳过这一步；`paperFinalSampleFrames:false` 可关闭。

## 结果与审核

基线 `cc09e71`。5 个新案例由真实源码静态抽取并重新验证，未运行未知函数；另有 7 个既有陌生/受保护案例。正式检查包括 Transformer 主图、两张所选详图和两个实际图组候选，共 32 张 SVG。独立审核重读 XML 路径和节点，检查 canonical IR、逐节点/边 accounting、原始绑定、重复范围、来源记录、通道、物理端点、空白带、精确坐标映射、几何和直接目标覆盖。浏览器原生文字测量覆盖这 32 张图及 90 个端口标签，均未越界。完整测试 64 组、753 项通过。

| 图 | 节点 / 边 | 尺寸变化 | 交叉变化 | 线长变化 |
|---|---:|---|---:|---:|
| ConditionalNeighborRuns | 32 → 30 / 31 | 1360 × 1886 → 1360 × 1852 | 7 → 7 | 14475.3 → 14305.3 |
| Transformer 主图 | 73 → 71 / 82 | 1968 × 3594 → 1968 × 3553 | 18 → 18 | 44037 → 43381 |
| 所选详图 1 | 43 / 47 | 不变 | 3 → 3 | 16987.3，不变 |
| 所选详图 2 | 66 / 65 | 不变 | 8 → 8 | 24751.6，不变 |

主图删除 41px 全局空白带，条件组合删除 34px；图组 74 项直接表达目标保留。其他案例保持先前 SVG，未知、共享与可变边界未被这一步合并。完整重路由的试算虽缩小外框，却增加交叉，因此没有采用。

实际编辑器导入条件组合：30 节点 / 31 条路径 → 展开后续调用为 34 / 33 → 收回为 30 / 31。已展开状态保存重开一致，收回及恢复自动粒度均与初始 SVG 逐字一致。源码视图“展开全部”实际导出 103 个节点、95 条边，所有 canonical ID 保留。数千节点输入另经源码投影检查，3371 节点 / 3663 边完整恢复，IR 不变；这不代表数千节点完整 SVG 路由或浏览器性能已验证。

[主图前后对照](../verification/final-sample-frames/current/main-review.html)、[条件组合对照](../verification/final-sample-frames/current/mixed-review.html)、[专用参考对照](../verification/final-sample-frames/current/transformer-review.html)。当前语义状态下面仍有进一步展开能力；阅读方向、模块分组、helper/返回细节密度及长上下文路径仍与专用参考存在差距，整体通用语义与视觉收敛目标未完成。

## 复现

```sh
python3 tools/extract_final_sample_frames.py
python3 tools/freeze_final_sample_frames.py
node tools/audit_final_sample_frames.cjs
node tools/audit_final_sample_frames.cjs --large
python3 tools/check_final_sample_frames.py
python3 tools/build_final_sample_frames_review.py
node tools/audit_source_expandability.cjs verification/helper-contracts/current/Transformer-current.json verification/final-sample-frames/current/source-expandability.json
python3 tools/run_local_tests.py
```

实际浏览器导入、导出与文字测量完成后运行 `python3 tools/check_final_sample_frames_ui.py`。大型中间 `.layout.json` 已忽略，可用上述工具重建。

# 通用架构图的文字与比例

本轮针对已有架构编排统一调整文字测量、卡片宽度和间距。生产判据使用节点的类型、角色证据和文字测量，不使用模型名、案例 ID、源码 SHA 或专用图坐标。Transformer 的概览和详图继续分别审核；SensorFusion 的卷积与全连接混合结构使用同一规则。

## 做了什么

普通卡片使用 240–320 px 的目标宽度，并按标题的文字宽度估计适度增宽，避免只差几个像素就多折一行。已认证角色路径使用 192 px 列宽。接口和数学符号保持各自的形状策略。兄弟间距从 72 缩到 48 px，串行间距从 32 缩到 24 px。字体没有缩小，布局不通过删除节点或边压缩图幅。

修复了空说明仍被计算成一行的问题。现在无说明的接口不会平白增加 16 px 的文字行，保存文档里的标题行、说明行与实际绘制一致。

展开的源码外框中，只有单独的 `Function / Module / Source module` 类型说明可以收起，类型仍保留在节点标题和证据检查器中，并记录逐节点凭据。算法说明、操作数、逐行输入引用、调用身份、参数配置、未知和控制/状态说明保持可见。包含未知操作，或自身带有条件、可变状态、角色、执行观测或调用身份的外框不使用该说明收起规则。原有摘要的依赖公式属于主图契约，没有将其转移到悬浮提示中来制造压缩收益。

陌生混合案例暴露了新的组合边界：不同算法说明需要不同高度的标题带。新增共享测量标题带，使同组输入区域在保留说明的同时继续对齐入口与出口侧核心，兼容向上和向下流程。对齐仍不表示并行执行。

## 同一展示集合的实际结果

修改前来自提交 `3d56335` 已保存的 SVG。没有用新实现重新绘制“修改前”。节点身份集合、完整边绑定、节点与边归属分区，以及已满足的表达/摘要目标逐项保持一致。

| 状态 | 修改前尺寸 | 修改后尺寸 | 面积减少 | 交叉前 → 后 | 线长前 → 后 |
| --- | --- | --- | --- | --- | --- |
| Transformer 概览 | 1250 × 1574 | 1082 × 1466 | 19.4% | 8 → 6 | 9619.5 → 9927 |
| Transformer 语义详图 | 2506 × 3850 | 2098 × 3654 | 20.5% | 14 → 14 | 45409 → 41422.3 |
| Transformer 进一步展开 | 2622 × 3850 | 2221 × 3654 | 19.6% | 12 → 12 | 46069 → 42558 |
| SensorFusion 向上 | 984 × 1086 | 800 × 1002 | 25.0% | 0 → 0 | 1501 → 1293 |

详图线长减少约 8.8%；概览线长增加约 3.2%，这是仍需优化的代价。概览和详图都减少了面积，但不能以此认定它们的模块逻辑和专用参照已经一致。详图整体长宽比例更接近参照，概览的比例和层级仍有明显差距。

## 跨模型与失败试验

正式套件重放原有全部 44 个状态，覆盖局部读取、分支、状态更新、未知、嵌套、卷积、全连接、循环及混合输入流。采用的 SVG 均没有报告路由、端口标签或画布限制问题。StateWorkshop、BranchMLP 和 ReusedRecurrent 的两档候选存在质量问题，使用已有通用准入规则回退到同一展示集合的依赖布局；不将这些案例声称为新架构编排已通过。

曾尝试更紧的间距。20 px 串行间距的一个候选在概览出现两条路由失败，详图出现十条路由失败，因此没有采用。另一个更窄候选在概览也出现两条失败，随后中断其详图试验。探索报告保留实际测量，探索 SVG 不属于最终证据表达验收。最终版本采用较宽的通道，并逐张审核真实 SVG。

捕获期间还发现，质量回退会改变同一批节点的绘制枚举顺序。捕获器最初把绘制顺序当成了节点身份约束，现改为比较完整身份集合；完整边记录、归属分区和已满足目标仍严格比对。没有因该检查调整生产图中的节点或绑定。

## 验证与未完成部分

全量 95 组、1051 项测试通过，其中架构编排 20 项。最终实现记录源文件哈希，捕获期间检查生产脚本没有改变。独立审核覆盖 44 张实际 SVG 的角色成员、源码摘要、正常返回、原始端口与绑定、正交路径、交叉、接触、重叠、节点障碍和标题穿越；浏览器测量所有非空卡片文字，未发现越界。来源类型收起规则也按原始类型及实际 SVG 标题逐节点核对。

实际界面再次验证 `28/37 → 80/80 → 82/81 → 保存 → 28/37 → 重开 82/81 → 28/37`。各档、重开和返回的 SVG 与正式捕获字节一致；SensorFusion 的实际导出也一致。检查器中可查看收起的 Function 类型，原始 IR 仍保留 3371 节点和 3663 边。

双状态视觉收敛尚未完成。后续仍需处理概览的展示层级、源码包裹、后续重复调用的组织、残差与跨区上下文线路，以及详图的条件作用域。不能为了接近参照而消除条件或独立调用事实。巨型全部展开 SVG 的性能仍未验收。

## 审核与复现

- [双状态与全部通用案例](../verification/architecture-proportions/current/review.html)
- [概览前后截图](../verification/architecture-proportions/current/overview.png)、[详图前后截图](../verification/architecture-proportions/current/detail.png)、[陌生混合结构截图](../verification/architecture-proportions/current/generic.png)
- [正式捕获](../verification/architecture-proportions/current/suite-report.json)、[独立审核](../verification/architecture-proportions/current/independent-report.json)、[浏览器文字测量](../verification/architecture-proportions/current/native-text-report.json)
- [完整测试](../verification/architecture-proportions/current/full-tests.txt)、[失败试验](../verification/architecture-proportions/exploration/probe-report.json)

`node tools/capture_architecture_proportions.cjs` 重放相同展示集合，依赖上轮保留的大型布局文档；`python3 tools/build_stream_alignment_review.py verification/architecture-proportions/current` 组合已有 SVG；`python3 tools/check_architecture_proportions.py` 审核布局、SVG 和实际 UI 导出。大型布局文档和完整 UI JSON 留在本地，SVG、报告和审核器纳入 Git。

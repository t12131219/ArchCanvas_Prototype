# 按源码输入声明逐组试排

同一类局部计算进入同一个消费者时，删除一条辅助旁支可能改变重心排序，导致原本对应的分支列序发生变化。此前将所有操作数一起重排的候选，又可能因为某一组增加布线代价而整体被拒绝。

本次新增的是消费端源码参数声明驱动的局部列序偏好。它只移动当前闭合、独立且通过边界检查的可见分支，不增加语义认证、不改变折叠前沿。不存在模型名、模块名、案例 ID、源码哈希或参考图坐标选择器，也不检查 Q/K/V 的拼写。

## 证据和适用范围

每条候选连接必须是源码 `interface-binding`，能按原始边 ID 回到同一 canonical source、canonical target 及消费槽。目标必须是同一个闭合消费者的静态输入接口，具有唯一且有效的源码文件、函数、行列位置。按参数声明位置排序；端口名称和数组插入顺序均不提供声明次序证据。信息缺失、位置冲突、运行时接口和绑定不一致时，不提出该偏好。

沿用现有操作数行的保护：真实条件、可变操作、未知节点、观察实例、身份关系、循环、反馈、共享或逃逸用途、隐藏副作用以及几何冲突均限制移动。仍允许周围独立成立的局部分支提出候选，不把残缺部分补成完整模型。

默认用于 canvas 的角色关系视图，在最终代表框整理之后执行。每张图最多逐组测量三个消费者，每组比较完整布线和保留远处路径两种候选，总计最多六次。后一组基于已经接受的结果，刷新移动节点、相邻终端及被新节点挡住的旧路径。已有端口与对应关系保持独立。

接受条件包括：列序或同行关系有收益，或者交叉/线长有收益；交叉、线长、尺寸、字号、接触、重叠、标签、已有约束及直接表达均不退化，事实与终端检查通过。声明顺序是视觉偏好，不表示执行先后、并行性、运算等价或操作数可交换。若代价增加则保留原布局。

`paperDeclaredOperandOrder:false` 关闭新偏好；`paperOperandRows:false` 同时关闭原有操作数行调整和新偏好。手工偏移、打印及超过 128 条可见边的图沿用原策略。选中结果在 `layout.declared_operand_rows` 保存，完整接受/拒绝记录在 `diagnostics.routing.declared_operand_refinement` 保存，含每条接口的来源位置和真实消费槽。

## 实际结果

基线为提交 `87732cb` 的冻结实现，使用相同源码和展示状态重新渲染。

| 图 | 图元 / 边 | 交叉 | 线长 | 尺寸 | 本轮列序 |
|---|---|---|---|---|---|
| Transformer 主图 | 65 / 76，不变 | 16，不变 | 39767.7，不变 | 1968 × 3412，不变 | 两组按声明顺序重排 |
| 第一张详图 | 44 / 48，不变 | 3，不变 | 17126.3，不变 | 1404 × 2784，不变 | 无变化 |
| 第二张详图 | 64 / 63，不变 | 9，不变 | 26180.2，不变 | 1710 × 3180，不变 | 无变化 |

主图两组由不同列序调整为一致的源码参数顺序。完整重布线会增加一次交叉，因此实际采用保留远处路径的候选。第三组涉及不同来源的长连接，两种试排均将交叉从 16 增至 18，因而拒绝；本轮没有实现三组全部统一。

陌生 helper、改变参数声明、未知片段、条件、逃逸、多处使用、原地操作和与框架 RNN 的混合案例共七个新增源码样例，另检查三个已有组合案例。几何不需改变时保持原图；`ForeignDeclaration` 虽能改善声明列序，但线长从 786 增至 1776，因此拒绝。不能把这些未变化案例描述为新的视觉收益，它们用于确认通用适用性与退让行为。

## 验证和局限

完整本地测试为 67 组、780 项通过，包括新增 13 项。检查源码声明位置、同一行的参数列位置、改名与数组重排、缺失/歧义证据、边界保护、保存重渲染及展开恢复。`verification/local-relations/current/test-report.json` 保存受检文件哈希和实际命令。

独立 Python 审核共 36 张实际 SVG，直接读取 Python AST 参数位置，核对原始绑定、当前几何、逐节点/逐边去向、条件、模块引用和直接表达。三张 Transformer 图合计保留 74 项直接表达目标，无丢失。五种人为损坏（消费槽、声明位置、列序、原始绑定、记录坐标）均被拒绝；重复的审核记录同步修改，避免仅靠记录间不一致发现损坏。

浏览器测量 36 张 SVG 的 1508 段节点文字和 36 个端口标签，未发现越界。实际编辑器执行陌生 helper 的 10 → 12 → 12 → 10 图元展开、保存、重新打开和折叠往返；五张实际导出 SVG 与正式产物逐字节一致，包含应用新列序的主图。截图见 `verification/operand-order/current/columns-browser.png`。

原始源码展开检查恢复 3371 个节点、3663 条边及全部 canonical ID，IR 未变。该检查只验证完整源码投影，未执行数千节点的完整 SVG 路由或测量浏览器性能。本次没有增加图组预算或进行新的联合图组规划，只审查既有三张图组是否保留表达目标。

当前规则尚不解决跨不同 helper 的角色对应、第三组的长来源路径、模块阅读方向或整体主图的表达选择。通用中间状态与专用展开参考之间仍有差距；后续需要通用来源分组、跨区域端口与局部布局协同，不能把某个模型的坐标固化为规则。

```bash
python3 tools/freeze_declared_operands.py
python3 tools/extract_declared_operands.py
node tools/audit_declared_operands.cjs
node tools/audit_declared_operands.cjs --large
python3 tools/check_declared_operands.py
python3 tools/build_declared_operands_review.py
python3 tools/run_local_tests.py
node tools/audit_source_expandability.cjs verification/helper-contracts/current/Transformer-current.json verification/operand-order/current/source-expandability.json
python3 tools/check_declared_operands_ui.py
```

最后一项需要保留实际浏览器导出和原生测量产物，不能由 CLI 生成冒充。完整审核页为 `/verification/operand-order/current/review.html`，局部列序对照为 `columns-review.html`，专用参考对照为 `transformer-review.html`。

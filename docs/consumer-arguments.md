# 固定调用输入的消费者邻近布局

当前通用绘图层可以把已经证明为固定值的调用输入，放到其单一可见消费者旁边。它解决固定参数原来停留在 helper 顶部、却连到很晚才出现的返回选择或未知调用时产生的长线。规则使用真实调用输入证据和当前可见图，不读取模型名、参数名称、案例 ID、源码哈希或专用参考坐标。

这是同一语义折叠状态内的几何改进。现有节点和依赖保留，只有符合条件的输入节点改变 x/y；端口和路径随实际路由重新测量。固定 False 不表示裁剪 true 路径，固定 None 不表示未知调用透明或无副作用。

## 资格与测量

`SemanticInvocationInputs.compile(ir)` 提供已有 `source_constant_input` 证明。生产候选要求输入无入边、只有一个不同的可见消费者，两者属于同一个展开的画面父框，消费者为闭合且非循环的节点或区域。已有顶部固定输入布局和输入停靠保持各自策略。受条件保护、runtime-only、动态转发、状态、反馈及指定语义通道不进入这一改摆规则。控制依赖可以保留为真实用途，但边本身及合绘成员不能带条件范围。

候选尝试消费者左侧和右侧，间距 20 px，垂直居中；父框正文、通道和其他节点/外框均保留间距。每次完整重路由后才决定采用。整个阶段最多测量两组方案，相同方案去重；只在 canvas 的 roles 视图、128 条边以内且没有手动偏移时启用。`paperConsumerArguments:false` 可关闭；`paperSelectedRoutes:false` 仍遵守原有路径优化关闭设置。

采用条件为交叉严格减少，或线长减少超过 2%，同时交叉和线长均不得增加；画布尺寸、字号、接触、歧义重合、路由失败和标签检查不得退化。已应用的约束、已实现的关系、直接表达目标以及 canonical 操作数/条件/归属/覆盖记录必须保留。这些要求相对最新接受方案逐步检查，不能丢掉中途获得的收益。

输出包括 `layout.consumer_arguments` 与 `diagnostics.routing.consumer_argument_refinement`，分别记录实际移位和最多两次候选的测量/接受结果。前一阶段 `cross_scope_refinement` 的测量仍描述前一阶段，不冒充本阶段最终结果。展开模块标题继续允许通行，实际节点仍避障。

## 正式结果

基线为 `a9260ef`，原始输入、基线文件和生产代码哈希均写入审核报告。Transformer 只用于验收同源通用规则。

| 图 | 节点 / 边 | 交叉：前 → 后 | 线长：前 → 后 |
|---|---:|---:|---:|
| Transformer 主图 | 73 / 82 | 29 → 18 | 46917 → 44037 |
| 第一张所选详图 | 43 / 47 | 3 → 3 | 16987.3 → 16987.3 |
| 第二张所选详图 | 66 / 65 | 16 → 8 | 28038.5 → 24751.6 |
| MixedChoices | 23 / 25 | 2 → 2 | 5904.9 → 4245.5 |

主图画布保持 1968 × 3594，五个已有固定输入移位，线长约减少 6.1%；交叉已低于此前 27 个交叉的历史主图。图组直接表达目标维持 74 → 74；两个额外联合候选仍因 crossing-cost 被规划器拒绝，未假装成为已选图。

MixedChoices 从真实 Python 源码静态抽取，包含晚出现的条件返回和未知调用；两个固定输入分别靠近其真实消费者，线长约减少 28.1%。未知函数未执行。LateChoice 因几何空间不足维持原图；DynamicChoice、GuardedChoice 不具备可移动固定输入证据。另七个现有源码案例保持原结果。不能据此宣称任意未知图都会变紧凑。

## 审核与继续展开

完整测试通过 62 组、732 项，含 12 项新增测试。独立审核从源码重新抽取四个新样例，比较原始 IR、canonical 操作数、条件、去向记录、实际 SVG 路径、节点位置和约束，并检查 30 张实际 SVG。浏览器原生尺寸测量同样检查 30 张图的节点文字及端口标签，未发现越界；实际节点与边数量和正式报告一致。

实际编辑器通过文件选择器导入 MixedChoices，导出 SVG 与正式产物逐字一致；双击返回区域后 23 → 30 个图元，分别保存重开均恢复完全相同的 SVG，收回后恢复原 23 节点 SVG。展开后的两条条件分支仍绑定原操作数和 true/false 端口。切换源码视图并展开全部，实际导出 41 节点 / 42 边，全部 canonical ID 保留。实际 UI 产物与检查器见 `verification/consumer-arguments/current/ui-report.json` 和 `tools/check_consumer_arguments_ui.py`。

大输入源码投影另行验证 3371 节点 / 3663 边全部可恢复，原 IR 不变。该检查不执行数千节点的完整 SVG 路由，因此不代表大图同时展开后的交互性能已经通过。

[主图前后对照](../verification/consumer-arguments/current/main-review.html)、[陌生组合对照](../verification/consumer-arguments/current/mixed-review.html)、[专用参考对照](../verification/consumer-arguments/current/transformer-review.html)保留审核入口。截图显示固定参数长线减少，但图中 helper/返回细节仍多，外部 mask/context 仍有长路径，阅读方向、模块分组和密度与专用图仍有差异。整体目标继续保持未完成。

## 复现

```sh
python3 tools/extract_consumer_arguments.py
python3 tools/freeze_consumer_arguments.py
node tools/audit_consumer_arguments.cjs --small
node tools/audit_consumer_arguments.cjs --large
python3 tools/check_consumer_arguments.py
python3 tools/build_consumer_arguments_review.py
node tools/audit_source_expandability.cjs verification/helper-contracts/current/Transformer-current.json verification/consumer-arguments/current/source-expandability.json
python3 tools/run_local_tests.py
```

浏览器中的导入、展开、保存、重开、收回、源码展开和文字测量应通过真实 UI 重新捕获；不能用 CLI 输出替代 UI 操作。捕获后运行 `python3 tools/check_consumer_arguments_ui.py`。大型中间 `.layout.json` 文件已忽略，可用上述生产命令重建。

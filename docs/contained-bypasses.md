# 闭合条件区域中的局部旁路

本轮继续把架构图的局部版式经验推广到通用绘图层。原局部旁路会拒绝分支路径中的所有 `phi` 和条件节点，即使它们已经完整保留在一个闭合模块内。这会使旁路沿较大的源码容器绕行。新规则依据条件边界的实际包含关系决定是否可以绕过当前闭合模块，不依据模型名、类名、案例 ID、源码哈希或专用参考坐标。

## 事实与几何边界

首先仍须有原契约认证的精确 skip 生产者、结果槽、加法接收端及分支路径，且原旁路必须已实际实现。没有旁路证据、旧收据冲突、外部条件、状态边、迭代边或 bundle 时，不会由新规则补出旁路。

对分支路径中被折叠的条件节点，验证其代表是一个真实、闭合的 composite 边界，并从 canonical 节点的实际展示去向重算完整成员、所有条件、phi 输入、控制边与切边：

- 所有条件引用及控制边必须留在闭合边界内；控制或带条件的切边阻止本轮优化。
- 用作分支连通见证的 phi 必须保留同一真实 if 的 true/false 两条输入，以及两条实际控制分支。
- 区域内其他只在单分支定义的局部值可原样保留，但不能成为完整分支路径见证。
- 未知、可变、状态写入、buffer、运行独有、观测／共享身份及循环／重复边界阻止优化。普通已记录资源读取保持原事实；不因此声明函数纯净。
- 每个边界最多 256 个 canonical 成员；保留现有每图 128 条可见边、六条旁路及每旁路四个轨道的预算。

随后复用既有局部旁路几何候选：只改变一个四点正交路径，保留实际物理端点、操作数、原始来源拥有者和语义展开前沿。交叉、接触、重叠、路由失败、标签、画布和字号不得退化，并保留已有直接表达及已实现关系。没有线长收益时保持原路径。标题仍允许穿行，真实节点及无关模块内部仍避让。

条件证据保存在 `layout.local_bypasses[].contained_boundaries`；最终路由审核重新计算它。删除整份边界证明也必须被拒绝，不能因为省略证据就退回无条件审核。`paperContainedBypasses:false` 关闭新增资格，`paperLocalBypasses:false` 关闭整个局部旁路阶段。

这是包含与绘图证明，不是条件执行选择、值等价、别名透明或模型家族证明。它没有折叠更多节点，也没有把条件计算改成顺序计算。继续展开该边界后，已有通用布局负责真实条件节点，本轮资格自动失效。

## 实际对照

基线为冻结的真实实现 `daaa217`，同一输入与同一固定状态分别完整绘图。

| 状态 | 图元 / 连接 | 线长：前 → 后 | 交叉：前 → 后 |
|---|---|---|---|
| Transformer 主图 | 65 / 70 | 35507.7 → 35043.7 | 12 → 12 |
| 第一张详图 | 44 / 48 | 15340.3 → 15340.3 | 3 → 3 |
| 第二张详图 | 64 / 63 | 24976.2 → 24904.2 | 9 → 9 |
| 普通条件函数，闭合 | 7 / 6 | 813 → 665 | 0 → 0 |
| 未知／状态混合组合，已知条件闭合 | 22 / 27 | 7255.8 → 6959.8 | 4 → 4 |

主图三条含条件的旁路变得局部，线长减少约 1.31%；第二张详图减少约 0.29%。普通条件函数减少约 18.20%，混合组合减少约 4.08%。画布尺寸与可见节点均保持；主图仍为 1968 × 3278。混合组合只调整已证明区域，未知调用、状态写入和其他条件仍保留。两个源码案例的继续展开状态没有几何变化。

这仍是局部走线改进。主图的源码容器、长上下文依赖、返回摘要、重复调用证据和阅读方向仍与专用参考不同，不能据此宣称整体语义及视觉收敛完成。专用充分展开图对应的目标仍是通用图的某个中间语义状态，其下应保留更细展开。

## 验证与复现

完整本地回归 73 组、837 项通过，受检输入与实现哈希记录在 `verification/local-relations/current/test-report.json`。新增测试包含一个通用条件几何夹具，另有两个真实 Python 源码案例，静态抽取后再次重算确认一致，没有执行未知或状态模型。

独立 Python 审核直接读取 42 张正式 SVG、canonical IR 和实际布局，核对路径、正交性、节点侵入、端点、原始绑定、逐对象 accounting、条件证据、直接表达和几何退化。它同时要求错误槽、条件、成员、切边、展示见证及删除完整证明六类破坏被拒绝。浏览器检查 8 个内联对照视图的 412 处节点文字，未发现越界；主图局部与普通条件函数的前后截图另行保留。

保存文档重绘、继续展开后收回均恢复相同 SVG；禁用新增规则与冻结旧实现一致。两个小案例分别保留全部 21 / 19、55 / 55 个源码节点／边；Transformer 原始源码投影仍恢复 3371 / 3663，canonical IR 未变。CLI 往返不代表本轮实际进行了编辑器导入与保存操作；本轮也没有重新测量数千节点整图 SVG 或浏览器性能。

```bash
python3 tools/extract_contained_bypasses.py
python3 tools/check_contained_extraction.py
python3 tools/freeze_contained_bypasses.py
node tools/audit_contained_bypasses.cjs
node tools/audit_contained_bypasses.cjs --large
python3 tools/check_contained_bypasses.py
node tools/audit_contained_bypass_roundtrip.cjs
node tools/audit_source_expandability.cjs verification/helper-contracts/current/Transformer-current.json verification/contained-bypasses/current/source-expandability.json
python3 tools/build_contained_bypass_review.py
python3 tools/run_local_tests.py
```

正式对照页为 `/verification/contained-bypasses/current/review.html`，包含主图局部放大、普通条件函数、未知与状态组合、继续展开状态、完整主图和专用参考。浏览器截图及原生文字测量另保存在同一目录，不由 CLI 产物替代。

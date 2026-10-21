# 独立操作数分支对齐

通用绘图层可将同一闭合消费者前、路径长度不同的独立闭合分支安排在同一行，并按实际输入边顺序排列。规则不读取模型名称、案例 ID、源码哈希、槽名称含义或专用参考坐标。现有语义折叠状态及进一步展开能力保留；同行只表达输入对应关系，不证明并发执行、等价操作或纯函数。

## 资格与测量

候选来自同一展开父框中的 2–6 个 compute/composite 节点，各自只有一条可见出边，指向同一个闭合且非循环的消费者，消费槽非空且互不相同。合绘用途、反馈、逃逸结果、条件、可变操作、未知内容、runtime-only、共享身份及循环/重复边界不移动。隐藏内容也检查 canonical 边：已知资源/状态读取允许，状态写入和控制边拒绝。代表层内部可局部调整，代表层本身不成为可移动分支。

纵坐标取原来最晚一行，横向使用已有中心位置，分别尝试原横向顺序及实际输入边顺序。父框正文、通道、消费者及实际节点保持间距。展开模块标题继续允许连线穿过。

只在 canvas/roles、128 条边以内且没有手动偏移时启用；`paperOperandRows:false` 可关闭。最多两组排列，每组测量完整重路由和保留远端路径两种候选，共最多四次。后者刷新移动节点的所有端点邻居，以及被新节点正文挡住的旧路径，保留其余路径；最终路径仍全部验收。既有 selected-routes 优化遵守原开关，测量次数不等于内部路径搜索次数。

采用必须改善同行对应、输入顺序、交叉或线长之一，同时交叉和线长均不得增加。尺寸、字号、接触、歧义重合、路由失败和标签不得退化；端点独立，canonical 绑定、已应用约束、已实现关系、直接表达目标保留。后续候选也不能丢失前一接受候选的同行和顺序收益。`layout.operand_rows` 与 `diagnostics.routing.operand_row_refinement` 记录移动及逐次测量。前阶段记录仍描述其自身阶段。

## 正式结果

基线 `c261854`。6 个新样例从真实 Python 源码静态抽取，未运行未知调用；另审核 7 个既有陌生组合，以及 Transformer 主图、两张详图和两个实际联合候选，共 34 张 SVG。独立源码/IR/端口/实际路径/几何/覆盖检查通过；浏览器原生文字检查包含 46 个端口标签。完整测试 63 组、746 项通过。

| 图 | 节点 / 边 | 本轮效果 | 交叉 / 线长 |
|---|---:|---|---:|
| StaggeredOperands | 11 / 9 | sin、tanh、relu 同行，cos 保留前一行 | 0 / 830，均不变 |
| Transformer 主图 | 73 / 82 | 三条闭合角色路径同行，并按实际消费槽排列 | 18 / 44037，均不变 |
| 所选详图 1 | 43 / 47 | 保留原结果 | 3 / 16987.3 |
| 所选详图 2 | 66 / 65 | 保留原结果 | 8 / 24751.6 |

主图保持 1968 × 3594，图组直接表达目标 74 → 74。完整重路由会把主图交叉增至 20，已拒绝；保留远端路径的候选通过。两个额外联合候选仍被规划器拒绝，未成为已选详图。本轮不宣称线长减少。

改名样例获得同类对齐；条件样例 SVG 逐字不变。未知、逃逸和原地修改分支保持各自边界，只调整周围符合条件的其他分支。七个既有小样例维持原结果。

## 实际编辑器及进一步展开

通过文件选择器导入 StaggeredOperands，实际导出 SVG 与正式产物逐字一致。SameSource 闭合 helper 经双击从 17 节点 / 17 边展开为 22 / 25；保存重开后 SVG 逐字一致，内部 7 条计算用途保留原始来源及解析后的结果槽。用展开外框减号收回为 17 / 17；手动模式的操作名/路由与自动语义粒度略有区别，canonical 用途相同；恢复自动粒度后 SVG 与初始产物逐字一致。实际源码视图展开全部导出 82 节点 / 87 边，全部 canonical ID 保留。

大输入另行检查源码投影，3371 节点 / 3663 边完整保留，IR 不变。此项未执行大图完整 SVG 路由，不代表数千节点浏览器性能通过。

[分支对照](../verification/operand-rows/current/mixed-review.html)、[主图对照](../verification/operand-rows/current/main-review.html)、[专用参考对照](../verification/operand-rows/current/transformer-review.html)保留审核入口。目视对照仍显示阅读方向、分组、helper/返回细节密度和长上下文路径存在差距，整体语义与视觉收敛继续保持未完成。

## 复现

```sh
python3 tools/extract_operand_rows.py
python3 tools/freeze_operand_rows.py
node tools/audit_operand_rows.cjs
node tools/audit_operand_rows.cjs --large
python3 tools/check_operand_rows.py
python3 tools/build_operand_rows_review.py
node tools/audit_source_expandability.cjs verification/helper-contracts/current/Transformer-current.json verification/operand-rows/current/source-expandability.json
python3 tools/run_local_tests.py
```

真实 UI 操作和文字测量捕获后运行 `python3 tools/check_operand_rows_ui.py`。大型中间 `.layout.json` 文件已忽略，可用以上命令重建。

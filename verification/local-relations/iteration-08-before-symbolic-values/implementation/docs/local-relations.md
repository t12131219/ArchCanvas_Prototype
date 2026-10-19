# 局部关系驱动的通用架构表达

目标依据为本线程的扩展目标（13 项）。本阶段基线为 `verification/local-relations/baseline/manifest.json`，冻结提交 f1f2276 的抽取和显示实现。历史 semantic-design 验证仍只证明旧阶段；本阶段通过记录不得复用旧实现摘要。

## 要求与证据清单

| 要求 | 需要的直接证据 | 状态 |
| --- | --- | --- |
| 1 分层解释完整、残缺、陌生、opaque、动态程序 | 源码混合案例及破坏反例、实际图面 | 待验收 |
| 2 完整展示编译链路 | 关系、区域、表达目标、约束执行、SVG 审核记录 | 待完成 |
| 3 通用局部事实 | 准确端口和证据的独立关系及正反例 | 进行中 |
| 4 独立部分认证与未知影响范围 | 未知插入前后各独立事实的保留与撤销 | 待验收 |
| 5 状态、条件、路由 | 框架接口、循环模板、条件和选择反例 | 待完成 |
| 6 重叠关系与候选区域 | 跨容器、逃逸输出和不兼容重叠 | 待完成 |
| 7 开放约束投影协议 | 每项的端口映射、执行/暂缓/冲突及原因 | 待完成 |
| 8 可组合布局原语 | 实际几何和准确端点，含 DAG/SCC 回退 | 待完成 |
| 9 局部自适应表达 | 关键连接、未知、状态及条件优先的实际前沿 | 待完成 |
| 10 表达目标与图组兑现 | 每个目标由实际图面呈现的证据，预算不足须失败 | 待完成 |
| 11 各类重复与代表 | 异构、动态、共享及调用身份反例 | 待完成 |
| 12 实际混合模型 | 完整算术片段、残缺门控、RNN、条件及自定义调用的组合 | 进行中 |
| 13 组合、破坏、重构、未见组合、资源 | 独立测试、同配置前后 SVG、浏览器和目视结论 | 待完成 |

本表不会因单项测试通过自动改为整阶段完成。事实成立与显示收益分开判断；关系图允许重叠，容器树只是主要几何归属。

## 当前实现与直接证据

`local-relations.js` 独立记录线性变换、轴变换、归一化、门控乘积及汇合、同值使用、框架状态接口、条件区域/汇合、选择、源码迭代绑定与未知边界。每条绑定保留原始边、操作数、结果槽、透明绑定追溯和条件范围；完整结构认证被未知调用阻断时，独立关系仍可成立。没有新增按模型家族、源码类名、案例或 SHA 触发的规则。

`presentation-regions.js` 根据局部边界和依赖连接提出候选容器，记录内部边、切边、逃逸结果、内聚度及选择/拒绝原因。条件集合只从真实条件及受其支配的分支/汇合建立；普通计算区域必须连通、无环，不能把一条离开后重新进入区域的依赖路径吸收成假闭环。状态、选择、未知调用、副作用和跨边界重新汇合受到保护。需要角色保护的范围先规划边界，再做依赖分组；普通交织计算保留已有依赖层回退。内聚度目前是审核指标，尚不是完整的多候选优化器。

绘图按实际依赖把外部接口放在首个消费者附近，紧凑候选按文字实测宽度收紧节点。布局选择能在问题类型相同时继续提高字号；端点、状态槽和条件身份优先。短折线标签可在自身线段上使用白底，但不能覆盖节点或别的连线。仅在同一序列输出槽进入同一折叠容器时合并重复用途，初始/最终状态仍保持独立；每个原始消费端口保留在 bundle 成员记录里。

`relation-constraints.js` 区分端点保留、实际几何消费及暂缓。状态与旁路不仅预留通道，还核查最终路径实际经过该区域；障碍间隙提供额外通道候选。没有处理器的约束仍明确暂缓；旧的并列投影与串行序列声明尚未接入完整统一几何处理器。

`expression-goals.js` 与关系详图要求核心计算、原始绑定和外部输出实际出现。折叠外框不会被当作内部角色已表达。图册把目标映射到实际可读图面，预算不足时明确未完成。源码容器上的弱模式注释不再直接充当整个混合模块的认证标题。检查器与保存文档保留关系、约束、证据和切边记录。

## 本轮验证与视觉自省

当前证据在 `verification/local-relations/current/`；`iteration-01/` 保留前一轮基础实现结果，`iteration-02/` 保留首次后续组合测试及失败产物、相应渲染实现。

| 案例/阶段 | 最小字号 | 交叉 | 结果 |
| --- | ---: | ---: | --- |
| MixedCircuit 冻结基线 | 4.74 pt | 17 | 未通过 |
| MixedCircuit 前一轮 | 5.92 pt | 13 | 未通过 |
| MixedCircuit 当前 | 8.77 pt | 6 | 当前打印、路径和标签检查通过 |
| SharedMismatch 首次未见测试 | 6.79 pt | 11 | 字号与路径重叠失败，6 处无关接触 |
| SharedMismatch 当前回归 | 8.23 pt | 8 | 当前检查通过，0 无关接触，状态通道实际成立 |

首次未见测试发现：依赖层先分组会掩盖状态、选择与未知接口。修复处理顺序后仍未满足字号，继而加入实测紧凑宽度与同类问题下的候选改进；失败没有被删除或改成通过。**这三个输入现在是开发/回归集，不是优化后实现的新未见验收集。**

混合图册从前一轮 19 张收敛为 8 张，31 个当前表达目标均有可读图面；当前总览和全部图面都通过现有质量检查。其他三个回归组合图册分别为 5、6、4 张，SharedMismatch 新增身份详图。目标词汇仍不完整，不能据此宣称完整目标已实现。

- `extraction.json`：45 个源码案例，包括循环、身份和 10 个结构代表相关输入；此清单为静态分析，实际 CPU 记录另列。
- `test-report.json`：245 项测试通过（Python 96、架构 34、论文视图 67、投影 4、既往语义设计 6、局部关系 20、身份 5、结构代表 5、图册代表 8），绑定实现与测试文件摘要。
- `render-report.json` / `comparison.html`：4 组冻结基线与当前同源同配置比较，以及 4 张局部关系详图，共 12 张。
- `holdout-report.json`：3 个后续组合的当前回归与首次失败记录；绑定 `iteration-02` 原始图面及来源。
- `svg-report.json` / `holdout-svg-report.json`：实际解析 15 张 SVG 的路径坐标、物理端点、准确操作数、bundle 成员、候选区域切边及声明通道。
- 浏览器文字报告：主比较、回归、迭代、身份共 45 张图面，分别绑定对应最终报告；混合图册 8 张另有测量。没有文字越界，不代表任意图均可读。
- `self-review.json`：最终截图、发现与全部 13 项的剩余范围。
- `validation.json`：核查实现、原始失败、输入与产物摘要，以及图册目标对应的实际 SVG 节点/路径。
- `iteration-report.json`：6 张迭代绑定关系图和 1 张条件更新补充详图；保留首次实现的实际失败图，并明确这项比较的规范 IR 发生过修正。
- `iteration-svg-report.json` / `iteration-browser-text-report.json`：上述 7 张图的独立 XML/实际路径和真实浏览器文字测量。
- `identity-report.json` / `identity-svg-report.json` / `identity-browser-text-report.json`：11 张身份对照及详图、实际路径、打印内容和浏览器文字测量；包括两个实际 CPU 输入的运行开始时参数别名。

[混合总览比较](../verification/local-relations/current/overview-review.html)、[共享调用回归比较](../verification/local-relations/current/regression-review.html)、[混合图册](../verification/local-relations/current/mixed-atlas/index.html) 可直接复核。所有未完成要求仍公开保留，汇总入口返回退出码 2，并输出 `stage_status: in-progress`、`goal_complete: false`。

```bash
python3 tools/build_local_acceptance.py
python3 tools/run_local_tests.py
node tools/audit_local_relations.cjs --reuse-baseline
node tools/audit_local_holdout.cjs
node tools/audit_iteration_bindings.cjs
python3 tools/build_identity_baseline.py
node tools/audit_identity_bindings.cjs
python3 tools/audit_local_svg.py
python3 tools/audit_local_svg.py --holdout
python3 tools/audit_local_svg.py --iterations
python3 tools/audit_local_svg.py --identities
python3 tools/build_local_review.py
node tools/export_publication.cjs verification/local-relations/current/MixedCircuit.json verification/local-relations/current/mixed-atlas --text-qa
python3 tools/summarize_publication_checks.py
```

`--reuse-baseline` 只复用摘要、IR 和配置均一致的冻结基线产物；当前实现始终重画。重新绘图后必须重新从实际浏览器采集文字报告和截图；汇总拒绝绑定旧绘图摘要的证据。完整目标仍缺更广的自定义状态及退出控制、完整分派/回收、更多几何处理器、共享及异构代表的基础目标、新未见组合和运行/资源压力验收。

## 通用迭代绑定：已实现范围与视觉复核

新增 `semantic_adapter/iteration.py` 与抽取器的事务式降级。对于可表示正常完成控制流的循环，入口绑定、体内当前值读取、回送值、出口及完成控制分别保留在规范 IR 中。入口位于迭代区域，执行体另有模板边界；while 条件读取当前迭代绑定，而不是固定读取循环前的值。出口保留零次迭代的初始路径，并由循环完成控制约束。双变量交换保留原始结果槽；仅在体内创建的变量仍保留可能未绑定的出口边界。

这证明的是源码名字绑定与正常完成路径，不证明时间轴、固定次数、终止性、张量形状、纯函数行为或存储身份。早停、continue、loop-else、复杂退出、未知调用及可变写入继续保留未解决模板。内层独立成立的关系不会因为外层未认证而消失。认证尝试失败时，节点、边、ID、控制记录和读取缓存一起恢复，避免残留悬空引用。既有可枚举模块序列的独立身份与具体调用规则保持有效。

显示层把准确回送边投影到专用通道，并独立检查最终 SVG 路径。执行体到循环结果的顺序是可审核的阅读偏好，不是新增数据依赖；零次迭代仍合法。表达目标可以声明必须可见的节点；紧凑关系图保留这些节点，其他分支计算由补充详图承接，隐藏的运算目标仍为未完成。

| 图面 | 当前最小字号 | 当前交叉 |
| --- | ---: | ---: |
| 累积绑定 | 9.85 pt | 4 |
| 条件更新绑定 | 8.27 pt | 8 |
| 双变量交换 | 8.55 pt | 5 |
| while 条件与更新 | 8.11 pt | 12 |
| 迭代项输入 | 9.53 pt | 2 |
| 体内临时值 | 9.66 pt | 5 |
| 条件更新补充详图 | 9.31 pt | 1 |

7 张图均通过当前字号、路径、标签与独立浏览器文字检查，且没有无关接触。条件更新首次实现为 6.78 pt、5 交叉；当前为 8.27 pt、8 交叉。新增完成控制和修正入口/执行体边界后，不能宣称交叉数也改善了。路由修复优先消除可能被误读成汇合的接触，允许在严格预算内改成明确跨越。

首次失败和当时实现保留在 `iteration-04-first-bindings/`；修改前的完整阶段证据保留在 `iteration-03-before-bindings/`。当前审核器重新加载冻结绘图实现，验证首次 SVG 可逐字复现，并对当前实现始终重新绘图。由于循环抽取层次及出口控制发生修正，这项对比只宣称同源码、同关系意图，不宣称同一规范 IR。主比较矩阵仍使用同一输入 IR 分别交给冻结与当前绘图器。

[循环前后比较](../verification/local-relations/current/iteration-overview-review.html)、[全部循环关系图](../verification/local-relations/current/iteration-review.html)、[条件更新详图](../verification/local-relations/current/iteration-bindings/conditional-update.svg)。这些输入都已参与开发与回归，不能充当修改后实现的新未见验收集。新增能力仍只满足完整目标的一部分。

## 源码对象选择与观测参数别名

`identity.py` 的 `source-module-binding/1` 认证区分构造绑定、源码调用点和运行调用身份。引用包含所有者构造代次、绑定路径及分配位置，同一属性被重新构造后，不再把旧对象及其嵌套对象与新对象混同。构造期间所有者逃逸、自定义属性钩子、未知继承与未知方法影响会抑制选择证明；直接 `torch.nn.Module` 所有者的正式资源查询依据框架接口处理，源码重写仍需检查。

当前证明限于已建模且无先前未知影响的源码前缀。未知调用、可变节点、状态写入与未解决循环阻止后续身份升级，之前独立事实仍保留。源码同对象调用点并不证明参数稳定、输出相同、实际次数固定或无条件执行；这也不是完整的副作用局部性分析。后端与显示层分别核查证据，不能仅靠相同路径、类名或 shape 触发。

显示层打印共同对象及 `source call 1/2`、`2/2`，保留不同调用节点。跨条件详图沿用原控制及条件容器，不把互斥调用提升成无条件串联。表达目标核查实际字幕行和必须可见的调用节点；折叠外框或未打印元数据不能充当目标兑现。

`TiedParameters-runtime.json` 包含两个实际 CPU eval/no_grad forward 输入，zeros 与 normal 均通过隔离执行及同种子重放。每次运行开始时的真实参数枚举分别记录 `first.weight` 与 `second.weight` 的对象别名，图面显示全部别名及 `Run 1/2 start` 范围。它不证明修改后、不同运行之间的身份稳定，也不推断不同 Parameter 对象的存储共享。最初隔离不可用记录另行保留，没有降级到无隔离执行。后续合并沿用真实 receipt，未伪造或重计运行次数。

11 张身份图通过当前 SVG 与浏览器检查，最小字号为 10.17–20.86 pt。同规范 IR 的旧/新绘图总览均为 11.93 pt、1 个交叉；改善是显式身份信息，不能声称几何指标改善。另存冻结抽取与冻结绘图的同源码比较；身份元数据变化后的旧回归明确标注不属于同 IR 比较。历史失败及实现保留在 `iteration-05-before-identities/` 及更早快照。

[身份前后对照](../verification/local-relations/current/identity-overview-review.html)、[条件与参数别名](../verification/local-relations/current/identity-boundaries-review.html)、[全部身份图](../verification/local-relations/current/identity-review.html)。身份阶段的旧构造签名推断已在本次结构认证中替换；本轮重新采集并检查 10 张最终页面截图，45 个静态输入均为开发/回归数据。完整路由、动态/时间集合代表与更广运行/资源验收尚未完成。


## 按局部计算比较重复结构

新增 `semantic_adapter/structure.py`，`local-structure/1` 比较已建模局部图，保留操作身份、框架配置、操作数槽、字面量/运算语法、条件、对象选择分区、输入输出边界与逐节点对应。透明 helper 或包装不作为结构区别，其他脱离主数据路径的操作仍按源码顺序记录；这不是任意图同构算法。无法证明的元素继续独立存在，未知或可变行为不会被当作透明操作。结构相同不意味着参数、结果、运行次数或时间轴相同。

旧的类名/构造签名 `homogeneous` 不再授权代表压缩。相同计算可以跨类分组，`x+1`、`x+2`、`1+x` 及不同对象选择分区则分别保留。异构序列可以明确选择一个已证明的结构组，图上打印具体实例、精确源码位置及 `structure only`；未解决元素显示未分类，不能据此声称它们已经证明互异。规范IR保持完整，每个代表保留到原实例的对应。

| 图面 | 最小字号 | 交叉 |
| --- | ---: | ---: |
| 同IR冻结绘图代表 | 8.81 pt | 0 |
| 同IR当前绘图代表 | 8.54 pt | 0 |
| 异构组：位置1、2、4 | 8.54 pt | 0 |
| 异构组：位置3 | 12.74 pt | 0 |

来源字幕增加了空间消耗；这轮代表图的改善在语义与可追踪性，没有改善字号。补全实际字面量后，while图由8.23pt/7交叉变为8.11pt/12交叉，虽然通过当前检查，几何仍退步。实际运算不能为了更紧凑而隐藏。

`repeat-report.json`、`repeat-svg-report.json`、`repeat-browser-text-report.json` 对应12张新图面；加上主比较12张、回归3张、迭代7张、身份11张，共45张独立SVG审核。`repeat-ui-report.json` 另记录真实界面的分组选取、保存、SVG导出与重开；保存保留组1，重开仍显示位置3及`+2`，导出与保存文档重新渲染逐字一致。本次245项测试通过，静态输入45个；两个CPU输入沿用既有receipt，本轮没有重新执行。

结构阶段之前的105个实现文件及完整证据冻结在 `iteration-06-before-repeat-structure/`。新增重复输入由冻结抽取器重新抽取并保留；它们是开发数据，不是未见验收集。完整目标的13项仍为部分完成；要求11在受支持有序源码图中已补上自动图册代表覆盖，仍缺动态集合及时间/条件代表规划。

[结构代表对照](../verification/local-relations/current/repeat-overview-review.html)、[同IR绘图比较](../verification/local-relations/current/repeat-comparison-review.html)、[未知及可变边界](../verification/local-relations/current/repeat-unknown-review.html)、[实际界面](../verification/local-relations/current/repeat-ui.png)。

```bash
python3 tools/build_repeat_baseline.py
node tools/audit_structural_repeats.cjs
python3 tools/audit_local_svg.py --repeats
```


## 自动图册代表与当前实际对照

`tools/representative_atlas.cjs`独立重建局部图并检查Python结构认证，覆盖目标通过逐节点及逐边对应转移到真实代表图。只有代表图实际打印结构组来源位置、`structure only`字幕，并以真实节点和路径完成相应目标，才计为覆盖。身份与外部接口目标不能转移；每个实例的边界仍为直接目标。操作数、字面量、配置、条件、对象选择、成员或逃逸切边变化会使旧认证失效。

| 输入 | 冻结图册 | 当前图册 | 共享内部目标 | 直接边界目标 |
| --- | ---: | ---: | ---: | ---: |
| EquivalentSteps | 11 | 3 | 6 | 6 |
| MixedSteps | 13 | 4 | 6 | 8 |
| ConditionalSteps | 10 | 9 | 4 | 4 |
| UnknownSteps | 8 | 7 | 0 | 6 |
| AliasPartitionSteps | 6 | 4 | 0 | 4 |
| MutableSteps | 6 | 6 | 0 | 4 |

六个正常图册均完整并通过当前质量门槛。1张预算上限反例明确未完成，保留缺失目标和省略图面。88张实际SVG（54张冻结、33张当前正常、1张受限）通过独立XML/路径及Python认证重算，13页/88张图面完成浏览器文字测量；不能将受限图册标为完整通过。

图面减少不等于字号全面改善：Equivalent最小字号8.81→8.54pt，Conditional为11.4→8.81pt，AliasPartition为11.93→10.76pt。具体来源字幕和上下文有空间代价。8项新增图册测试使当前全量为245项；原45项静态案例与两个既有CPU输入的范围不变。

[自动代表比较](../verification/local-relations/current/representative-atlas-review.html)、`representative-atlas-report.json`、`representative-atlas-svg-report.json`与`representative-atlas-browser-text-report.json`绑定冻结111文件、当前实现、实际产物及浏览器测量。冻结资料保存在`iteration-07-before-representative-atlas/`。

同源码Transformer对照单独保存在[语义前沿对照页](../verification/generic-convergence/current/comparison.html)。专用全展开83节点/85边应对应通用图的某个中间折叠前沿，通用层仍能继续展开更细节点；不比较两边“展开全部”。目前通用detailed退回overview，均18节点/13边；两组6层结构认证均未解决配置，尚无对应前沿。原始全部源码容器展开任务已停止，因为它不属于参考收敛目标。更深层展开能力仍需保留和单独核查。

```bash
node tools/audit_representative_atlas.cjs
python3 tools/audit_local_svg.py --atlases
python3 tools/build_generic_convergence_review.py --full-status interrupted
```

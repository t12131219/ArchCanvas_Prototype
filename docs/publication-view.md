# 通用论文视图与验收记录

当前阶段为 [通用外部输入就近布局](input-docks.md)，证据在 `verification/input-docks/current/`。基础的独立展示粒度、代表实例、观测分组和语义旁路见 [通用语义认证与架构版式](semantic-design.md)。本文后续各历史轮次的指标、截图和逐字节承诺只描述对应归档实现。

论文视图是在原始语义 IR 上生成的可逆表达。它按照局部计算关系、源码模块接口和实际拓扑组织结构，不依赖 Transformer、LSTM、CNN 或其他模型名称选择固定模板。当前实现仍是实验功能；通过下列检查不等于任意 PyTorch 模型已达到论文插图质量。

## 使用与导出

打开 `semantic_studio/index.html`，选择“论文视图”。新文档默认使用此视图，原有保存的视图选择继续生效。

- “模块详图”选择实际源码模块或派生的局部结构，界面保留该模块与外部的准确边界。
- “展示粒度”提供总览、模块、细节，与证据模式独立；若实际字号不合格，会记录更紧凑版式或将部分内容留给局部详图。请求细节不表示所有原始节点在一张图里同时展开。
- “自动选择粒度”保留主要命名阶段，限制内部信息密度；双击展开后进入手动粒度。
- “最大图宽”是印刷宽度上限，默认 180 mm。过高的小图会缩小到 240 mm 的页面高度以内；界面按最终物理尺寸检查最小字号，不通过缩放掩盖小字。
- 实线蓝灰表示源码依赖，绿色表示实际观测的张量流，黄色虚线表示控制。没有节点的线条交叉表示跨越；未知操作使用虚框，折叠模块标明未知操作数量。
- SVG 与画布共用布局、路由和矢量渲染器。保存文档保留原始 IR 和表达状态，重新打开时按当前规则重新计算。
- CLI 导出的图文档可以直接打开；只包含 `paperFocus` 等表达状态时，也会恢复详图，缺省展开集和位移分别补为根节点与空对象。

```bash
# 单张论文概览，同时输出可重新打开的 layout 文档
node tools/export_architecture.cjs input.json figure.svg --view publication

# 递归图册：总览、每个源码/结构模块的详图、证据文档与索引
node tools/export_publication.cjs input.json /tmp/model-atlas --strict --text-qa

# 接受原始 IR、semantic-canvas/1 或 archcanvas-architecture-document/1
node tools/export_publication.cjs saved.layout.json /tmp/model-atlas --width-mm 160
```

`--strict` 在任一图面需要调整或图册被 `--max-panels N` 截断时返回非零状态，仍写出可检查的结果。`--exact-width` 禁止根据页面高度缩小；`--mode source|runtime|merged` 选择证据范围。没有 CPU 证据的模型不能输出为 runtime 图。

每个图册包含 `index.html`、`manifest.json`、各面板 SVG 和 `.layout.json`。`--text-qa` 额外生成带摘要的内联 SVG 页面，可用于浏览器文字测量。文档记录全部原始节点和边的 visible/collapsed/contracted/attached/excluded 等去向、代表节点、切边、原始张量槽、附注和实现哈希。省略部分图面会明确记录 `omitted_panels`。

## 组合与布局规则

1. 先复用局部语义归纳，再按依赖顺序为较大图建立分区。`Stage NN` 只表示展示区域，没有模型家族或串行算法断言。大 SCC 的展示分区保留真实反馈边。
2. 大残差范围内的命名模块在总览中保持可见；残差结论成为注释，旁路仍使用实际加法操作数连接。
3. 确定的别名和本地接口可以收缩，嵌套元组槽按路径组合。关闭的模块保留自己的接口，避免内部消费者被误画成额外的跨模块输入。
4. 参数、shape 和经过证实的配置位置可成为可追溯注释；未知操作及其源码证据保留。不会因为出现一个 Sigmoid 门控就命名为完整 LSTM。
5. 模块详图只使用真实切边。折叠子模块内部的接口提升为面板端口；同一输入值的多次使用可共享入口，边仍分别保留。超过六个外部入口/出口时可以形成可展开的接口组，每个值保留独立端口和切边记录。
6. 在有限个拓扑布局候选中比较实际印刷比例。宽输入/输出层可独立成带，避免其宽度传递到流程中每一列；主流程可以折行，必须沿箭头阅读。移动后的布局保留用户位置。
7. 同侧的输入、输出统一分配物理端口，防止折行时出边沿入边原路折返。比较原始顺序、邻接位置顺序、长短边优先和交叉代价等有限路由候选；物理顺序调整保留原始操作数槽位。扩展祖先模块的控制边可从标题下方接出，数据和状态边仍使用正常边界。候选不得引入新的质量问题、增加失败路由或缺失标签，也必须保住最小字号门槛；最终方案及各候选指标写入 `diagnostics.routing`。交叉使用白色间隙表达跨越，不表示汇合。
8. 标签完整换行，提供实际毫米尺寸和印刷字号。LSTM/RNN 状态端口来自框架契约；Q/K/V 还要求矩阵乘法操作数顺序、最后两轴的 key transpose 和 `softmax(dim=-1)` 证据。该局部证据不等于完整 Encoder 或多头注意力识别。
9. 初次路由选择后，依次进行交叉修复和接触修复，每个阶段最多两轮，每轮查看相关问题最多的八条线。交叉阶段尝试两档代价；接触阶段还尝试将默认 16 单位的端口引线缩短为 12 或 8 单位，这两个阶段每个图面最多 96 次尝试。其余当前线路作为已占用通道，只有当前阶段的问题严格减少、交叉和接触均不增加、不新增相互接触的线路对，且字号、标签和路径检查不退步才接受。零交叉图面也参与接触修复。节点位置、原始端口和依赖不变；最终缓存保留实际选中的路径。超过 64 条可见边的图面保留初次路由结果，防止交互计算量失控。每次接受记录的 `phase`、`stub_length` 与前后指标位于 `diagnostics.routing.refinement`。

10. 若接触仍然存在，再进行一次有限分离：只查看接触最多的四条线，最多追加 16 次尝试，三个阶段合计上限 112 次。每图最多比进入此阶段时增加一个交叉，且最终交叉不得超过原始端口顺序基线；必须减少更多接触，使“交叉数 + 接触数”严格下降。禁止新增接触线路对，保留上述所有字号、路径、标签与原始端口检查。增加交叉的接受项明确标为 `phase: separation`、`tradeoff: contacts-to-crossings`；这是可读性取舍，不是所有指标都下降。

## 交织结构与边界规则

共享中间结果的 DAG 不能按独立路径归组。新增 `dependency-band`：按最长依赖深度建立展示带，再递归为每个面板至多三个摘要。只有至少九个有效单元、至少两个含三个以上单元的深度层才启用；循环模板不参与此规则，含真实反馈的作用域继续使用 SCC 表达。分析使用全部实际边保持顺序；条件与状态边仍保留，横向相邻不声明执行并发。

- 分层依据是已有局部语义/源码单元之间的拓扑。`Dependency band`、`Units` 都是展示名称，不能解释为新算法或模型家族。
- 切边、别名、原始槽位和未知操作保留。七路等不能整除三的情况也包装单项余组，避免其在布局中承担不同的接口行为。
- 合绘连线覆盖关闭的依赖带与依赖面板；不同证据、条件和状态仍分开。普通边与合绘边共同参与标签间距分配。
- 同一个已提取结果的多个外部使用可以共享出口：要求解析后的 producer、结果槽、边类型及证据一致，且没有条件。状态边保持独立。保留 `boundary_value` 和逐条 `boundary_uses`；这里的身份仅限已提取图，不推断运行时张量相等。接口本身的真实边界继续保留。
- 出口与对应合绘线都可查看完整消费者清单：目标、操作数、原始边 ID 及证据。原生 SVG 的节点提示也保留这些内容；未知生产者仍使用虚框。出口已显示使用次数时，省去线上重复的数量标签。
- 外部输出组区分“值数”和“使用次数”。例如八个结果各被读取两次，显示 `8 values · 16 uses`，保留八个结果端口、十六条独立切边。
- 重名的外部目标按面板内身份编号，例如 `add [1]`，注释保留实际目标操作数。编号相同表示同一外部节点，不能据此推断两个输入值相等。
- 配置元数据切边进入附注，不生成孤立的数据端口；文档和检查器仍保存原始边。常量参数也附在实际消费者上，修改过的参数保留真实数据入口。
- 聚焦图面时，外部生产者对应的本地别名绑定到面板入口；直接透传也保留连线。显式绑定表作为完整策略使用，出口切边不会被默认别名收缩再次消去。严格审计同时检查边界端口是否实际接线，不能只检查端口存在。

## 当前配置归纳阶段

从外部 ConvNet 的真实源码发现：`out.view(-1, 7 * 7 * 16)` 中的两个整数乘法被画成了大型张量计算节点。本阶段在展示层增加配置证明：先确认只含整数字面量的运算及其完整上游依赖，再反向确认所有用途都落在已知配置参数上。确认的节点和原始边进入附注，不删除原始 IR，不改变已有语义发现。

- 语法识别器不使用 `eval`，也不计算表达式值；长度最多 160 字符、递归深度最多 16。只支持整数字面量、算术符号与括号；变量、调用、浮点数和任意 Python 表达式不被当成字面量运算。
- 完整值别名可继承证明，但返回的标量、特征系数、未知函数参数、非完整输出槽、条件、变更或运行时证据会阻止配置折叠。证明根据完整提取图建立，聚焦局部图时仍保留原始槽位与源边。
- 已有调用参数中的静态 view/reshape 维度可显示为 `shape -1 × 784`。这是请求的形状，不是实际输出形状或运行验证。方法调用与 `torch.reshape(input, shape)` 分别读取正确参数位置，未知维度保持保守表达。
- 检查器的“附属资源与配置”保存 `configuration_proof`：原表达式、原依赖、消费者/操作数、源码位置及 `value_evaluation: not-performed`。配置绑定可以追溯到真正的算术源头。
- 新增原创 ShapeDrivenFusion：静态形状运算、TransformerEncoderLayer、GRU、局部门控和未知融合函数共存。仅解析源码；Encoder、状态和未知边界保留，局部 Sigmoid gate 不升级为 LSTM。

本阶段证据位于 `verification/publication/configuration/`，不可变旧版位于 `configuration-baseline/`。现有旧报告保留其原摘要，不重新标记成当前结果。

| 检查 | 当前结果 |
| --- | --- |
| 回归测试 | 145 项：Python 40、架构 34、原投影 4、论文视图 67 |
| 编辑器目录 | 33 模型、426 源码/架构状态，未发现节点重叠或失败路由 |
| 外部语料 | 186 模型、1291 图面通过现有字号、几何、路径、边界与标签检查 |
| 配置归纳正例 | 19 个外部模型中的 44 个整数字面量运算 |
| 对应图面比较 | 1270 个公共作用域，39 张 SVG 变化；9 张交叉减少，3 张交叉增加；对应交叉总数 127 → 124 |
| 展示分区变化 | 76 个旧展示图面消失、21 个新展示图面出现；原源码作用域及原始节点/边、公共作用域切边保持完整 |
| 浏览器文字 | 全部 1291 图面：13365 个标题/注释、158 个端口标签，1 CSS px 容差下未越框 |
| 原创及 CNN 图册 | ShapeDrivenFusion 2 图面、ConvNet 5 图面，完整导出并实测文字；两者实际 UI SVG 均可由保存文档逐字节重建 |
| 压力扫描 | 独立分支 1834 图面、交织 1669 图面自动检查通过；未逐图进行浏览器目视验收 |
| 外部只读保证 | 重新核对 254 文件 SHA-256 未变；未导入、执行或训练外部模型 |

**效果自省：** ConvNet 总览由 11 → 9 个图元、1 → 0 个交叉，线长 1890 → 690，字号 10.08 → 11.76 pt；图高反而由 159.2 → 185.7 mm，不能说所有指标均改善。ShapeDrivenFusion 保留未知融合和不完整门控，仍有一处交叉和较长的状态旁路。

三处视觉退化尚未解决：两个 ConditionalVariationalAutoencoder 的 encoder 详图由 0 → 3 个交叉，字号 9.42 → 8.93 pt；ConvVariationalAutoencoder 的 encoder 由 0 → 1 个交叉，字号 10.84 → 9.43 pt。清理配置节点后触发不同的展示分区：前两张前半段仍密集；后一张更清楚地呈现三个 CNN 块及均值/方差支路，但几何指标有退步。对比截图保存在 `configuration/review/`。尝试增大层间距能减少交叉，却将 ConvVAE 字号降至 6.53 pt，因此没有采用。不能恢复虚假的张量乘法来获得较好的旧指标。

旧版全部图面交叉 137、新版 140 来自不同分区，不能当作一一对应比较。汇总器明确保存三处已知退化；自动检查通过不代表任意模型论文质量已达标。下一步需要改善配置清理后分区的稳定性、并行分支与旁路布局。

复现本阶段（在仓库根目录）：

```bash
python3 -m unittest discover -s tests -p 'test_*adapter.py' -q
node tests/architecture.test.cjs
node tests/semantic-projection.test.cjs
node tests/publication.test.cjs
node tools/audit_architecture.cjs
node tools/audit_publication.cjs --strict --text-qa --output verification/publication/configuration
node tools/audit_publication_stress.cjs --output verification/publication/configuration
node tools/audit_publication_weave.cjs --output verification/publication/configuration
node tools/compare_configuration.cjs
node tools/export_publication.cjs data/semantic/93bf97c492e70b40.json verification/publication/configuration/ConvNet-atlas --strict --text-qa
node tools/export_publication.cjs data/semantic/architecture/ShapeDrivenFusion.json verification/publication/configuration/ShapeDrivenFusion-atlas --strict --text-qa
# 保存四组测试日志、浏览器测量、真实 UI 导出及自省后，校验现有证据
python3 tools/summarize_publication_checks.py
```

## 历史拓扑布局阶段

新增消费者就近分层：在 SCC 压缩后的依赖 DAG 上，逆拓扑遍历有余量的计算节点，使其靠近最早的消费者。源码入口、接口、无前驱节点及循环 SCC 保持原层；每条真实依赖的先后约束保留。它只影响展示位置，不推断调度、融合或模型家族。

只有自动布局且仍有交叉、可见边不超过 64 条时，才尝试一个候选。候选经过同样的印刷适配、布线及标签重试；交叉必须严格减少，接触、失败路由和缺失标签不得增加，不能新增质量问题，最小字号不能降低。面积和线长各最多增加 10%。手动粒度、局部位移及显式分层配置不被覆盖；结果记录在 `diagnostics.routing.topology_refinement`。

本阶段独立证据位于 `verification/publication/topology-layout/`。旧实现和原始外部报告保存于 `topology-layout-baseline/`；下面历史阶段的“位置完全相同”等结论仍只适用于当时版本，不把新的布局改动归因于早期路由/摘要规则。

- 原创 GatedMixture 总览：交叉 4 → 0、线长 3724.3 → 3190.3、图高 240 → 137.9 mm，最小字号保持 8.25 pt；未知 kernel 和额外输出仍保留。实际编辑器 SVG 与保存文档逐字节重建一致。
- 原创 ForeignComposition 的 Post-Norm 残差详图：交叉 2 → 1，字号保持 8.72 pt；线长增加约 5.3%，作为明确的绕行代价记录。
- 外部 186 个候选、1346 个图面的交叉仍为 137；91 个候选均被拒绝，所选 SVG 与改动前逐字节相同。该库只验证了保留和拒绝能力，本阶段没有外部正例。
- 自省：ConvNet 候选少一个交叉但多约 19% 线长，截图可见更多折返，保留原图；TextCNN 循环详图候选反而由 4 增至 7 个交叉，也被拒绝。GatedMixture 虽明显变矮，仍有折返和长旁路，不能据此宣称任意模型达到论文质量。
- 回归共 136 项（Python 38、架构 34、原投影 4、论文视图 60）；独立分支 1834 图面及交织 1669 图面通过。浏览器重新测量全部外部图面的 13998 个标题/注释和 182 个端口标签，另测量 GatedMixture 四张图面及两处接受布局，均无文字越界。完整压力扫描没有逐图浏览器测量。

复现本阶段（在仓库根目录）：

```bash
python3 -m unittest discover -s tests -p 'test_*adapter.py' -q
node tests/architecture.test.cjs
node tests/semantic-projection.test.cjs
node tests/publication.test.cjs
node tools/audit_architecture.cjs
node tools/audit_publication.cjs --strict --text-qa --output verification/publication/topology-layout
node tools/audit_publication_stress.cjs --output verification/publication/topology-layout
node tools/audit_publication_weave.cjs --output verification/publication/topology-layout
node tools/compare_topology_layout.cjs
node tools/export_publication.cjs data/semantic/architecture/GatedMixture.json verification/publication/topology-layout/GatedMixture-atlas --strict --text-qa
# 浏览器测量上述文字 QA 页面并保存实际 UI 导出后，再汇总已有证据
python3 tools/summarize_publication_checks.py
```

外部模型源码仍只读；本阶段重新核对 254 个文件 SHA-256，并复用已有静态提取 JSON，未 import、执行或训练外部模型。该历史阶段当时由 `active-stage.json` 指向；当前指针已转向配置归纳阶段。汇总器核对当前代码、独立旧版快照、报告摘要和文件哈希，拒绝过期证据。旧版比较命令只用于复现对应历史阶段，不能在当前布局器上继续要求位置恒等。

## 历史阶段测试与只读范围

以下表格和后续过程记录保留门控归纳阶段的结果；其中“本轮”“当前”均指该历史阶段。当前结果以上面的配置归纳阶段及其 `summary.json` 为准。

```bash
python3 -m unittest discover -s tests -p 'test_*adapter.py' -q
node tests/architecture.test.cjs
node tests/semantic-projection.test.cjs
node tests/publication.test.cjs
python3 tools/audit_model_corpus.py
node tools/audit_architecture.cjs
node tools/audit_publication.cjs --strict --text-qa
node tools/audit_publication_stress.cjs
node tools/audit_publication_weave.cjs
node tools/inspect_publication_snapshot.cjs verification/publication/routing-baseline verification/publication/routing-baseline/inspection.json
node tools/compare_routing.cjs
node tools/compare_shared_outputs.cjs
node tools/compare_refinement.cjs
node tools/compare_content_inventory.cjs
node tools/compare_gated_sum.cjs
node tools/verify_publication_ui_exports.cjs
python3 tools/summarize_publication_checks.py
```

外部语料只通过 AST/Notebook JSON 读取，没有 import、训练、初始化或下载模型。254 个文件的 SHA-256 保持一致。186 个 PyTorch 类候选全部静态提取，仍有 238 个 opaque 节点，86 个候选没有 opaque；这些数量不能当成完整支持数。已有原创混合模型 CPU 收据复用，本轮未重新执行。

| 检查范围 | 当前结果 |
| --- | --- |
| Python / 论文视图 / 架构 / 原投影回归 | 38 / 57 / 34 / 4，共 133 项通过 |
| 186 个外部候选的总览与全部模块详图 | 1,346 图面全部通过当前检查 |
| 节点重叠、失败路由、丢失边界、孤立边界端口、线段重合 | 均为 0 |
| 最小印刷字号至少 8 pt，完整原始节点/边去向、IR 不变 | 全部通过 |
| 本轮共享结果出口 | 27 个端口承载 54 次使用，切边逐条核对 |
| 路由与边界修复累计线段交叉 | 636 → 137；223 个图面减少，3 个增加，增加项均记录补回的原始依赖 |
| 累计重新布线前后线段交叉 | 261 → 137；60 个图面减少，4 个 DenseBlock 概览各增加 1 个交叉以消除接触；全部位置及依赖去向相同 |
| 接触修复及分离（额外诊断） | 66 → 0；33 个图面改善；其中最后 8 处接触通过 4 个新增明确跨越消除 |
| 本次有限分离 | 1,346 图面逐图复现；仅四个 DenseBlock 概览变化，交叉 133 → 137、接触 8 → 0 |
| 相对更早共享出口基线的累计交叉 | 663 → 137 |
| 归档渲染器重现的孤立边界端口 | 351 → 0 |
| 源码内容清单 | 69 个，35 个内容摘要；50 个图面变化，位置、线路、操作数和边界记录一致 |
| 本轮门控归纳与标签重试 | 外部语料无此规则正例；1,346 张 SVG 与本轮归档逐字节一致；原创四张图面通过 |
| 外部语料中的依赖带 | 10 个候选，共 45 个依赖带 |
| 外部语料中的独立 fork/join 区域 | 0；能力证据来自原创案例和压力测试 |
| 模型目录表达/证据/展开检查 | 32 模型、414 状态，无重叠或失败路由 |
| 原创独立分支压力测试 | 2–48 路，47 案例、1,834 图面通过 |
| 原创交织压力测试 | 宽 2–12、深 2–8，77 案例、1,669 图面通过 |

浏览器文字测量使用 `getBoundingClientRect` 比较标题、注释和标签与实际 SVG 边界，容差 1 CSS 像素。报告与当前提取器、渲染器摘要绑定；图册与全语料页面都在当前实现稳定后重新生成、测量。完整压力扫描只做几何和字号检查；另选七路、八路交织图册做浏览器文字测量，不把它当成整个压力扫描的逐图文字验收。

本轮文字测量共检查 13,998 个节点标题/注释及 182 个连线标签，均未越界。12 套代表图册也在当前实现下重新生成并测量。

报告位于 `verification/publication/`：`corpus-report.json`、`browser-text-report.json`、`stress-report.json`、`weave-report.json`、`routing-comparison.json`、`refinement-comparison.json`、`contact-repair-comparison.json`、`contact-separation-comparison.json`、`shared-output-comparison.json`、`content-inventory-comparison.json`、`inspector-responsive-report.json`、`gated-sum-comparison.json`、`GatedMixture-ui-report.json`、`GatedMixture-sum-ui-report.json`、`TextCNN-ui-report.json`、`WovenFusion-ui-report.json`、`GraphNet-ui-report.json`、`DenseLayer-ui-report.json`、`contact-diagnosis/contacts.json`、`test-summary.json`、`self-review.json`。递归 SVG/layout 图册和文字 QA 页面为可重建产物，按仓库忽略规则保留在本地。

`tools/summarize_publication_checks.py` 汇总已有测试日志和浏览器报告，核对实现哈希、图册摘要与外部文件 SHA-256；证据过期会拒绝汇总。测试日志存放于 `verification/publication/test-logs/`。`verify_publication_ui_exports.cjs` 仅重建已从实际界面保存的导出文本，并核对 SVG 字节、文档焦点和质量；该命令本身不执行浏览器交互。这些工具不执行外部模型，也不代替实际测试和浏览器复查。

## 效果自省与实际修正

本轮先用原创共享结果图发现：三路交织总览已有 30 个交叉，六路、八路进一步升至 103、196；这些是改动前的实测记录，未保存基线实现快照。不能将当前工具重跑结果当成旧版复现。依赖带与合绘后，六组代表交织图总览的交叉为 0，实际依赖仍能逐条展开。

随后检查真实外部语料，发现 7 张回归图：四个 DenseLayer 及两个条件 VAE 图面出现并行标签无法放置，TextCNN 循环详图降到 6.8 pt。前者通过所有并行连接共同参与间距分配修正；后者暴露局部 CNN 命名覆盖循环类型的问题。语义适配现保留 `loop-template` 和 `conditional-region`，局部 CNN 块继续存在；TextCNN 对应详图恢复至至少 8 pt。不是依靠跳过失败模型通过验收。

目视检查还发现两处几何检查没有发现的问题：六个出口都叫 `add` 难以辨认目标；条件 VAE 的 `size` 元数据被投影成孤立输入。分别补充目标引用与操作数注释、配置附注处理，并加入回归。

本轮继续目视检查发现，同一个结果被两个外部操作读取时，详图画出两个出口，增加了重复路径。现在按结果身份共享出口，同时保留每次使用：`WovenFusion` 第三个依赖带仍保留六条输出切边，但只画三个结果端口；交叉由 5 降为 0，高度由 126.6 mm 降为 99.9 mm，最小字号保持 8.33 pt。不同槽位、生产者、边类型、证据、条件及状态有反例回归；条件别名不会被收缩成同一个结果。界面消费者清单、鼠标点选实际连线段、Enter、展开、撤销及导出内容还原都已实测，当前 SVG 还原逐字节一致。系统下载文件动作未测试。

共享出口改动前的实现、报告和代表 SVG 已归档在 `verification/publication/shared-output-baseline/`；当时交叉从 663 降至 636。当前累计比较为 663 → 137，已经包含后续路由和边界修正，不能归因于共享出口一项。`compare_shared_outputs.cjs` 保留累计增加项和补回依赖证据。

继续目视 TextCNN 循环详图，发现变量入口和出口虽存在，却没有连线。进一步用归档渲染器重现全部 1,346 个旧图面，发现 351 个孤立边界端口。根因是聚焦作用域仍收缩外部别名、显式绑定策略又混入默认绑定，以及外部别名消费者的出口切边被消去。修复后孤立端口为 0，并保留透传回归。循环变量入口显示本地名称 `convolution`，可点击查看实际源码。

路由改动前的实现保存在 `verification/publication/routing-baseline/`，独立快照检查重现全部旧交叉数。第一轮合计从 636 降到 261，203 个图面改善；当时 10 个图面因为补回此前遗漏的可见依赖而增加交叉。重新布线后，当前累计为 636 → 137，223 个图面改善，仍有 2 个 AutoEncoder 图面和 1 个 GraphNet 图面的交叉高于旧版。比较报告逐项列出新增可见原始边 ID；这些图面的视觉代价仍需承认。对当前同一投影，审计另核对所选策略不比原始端口顺序产生更多交叉。

TextCNN 循环详图选用 `neighbors-header-long`，在同一投影下初次路由将交叉从 18 降至 5，本次重新布线后为 4，最小字号 8.11 pt；总高度仍为 240 mm。实际浏览器已验证 CLI 图文档恢复该焦点、本地变量源码证据，以及 SVG/图文档导出逐字节重建。WovenFusion 的共享结果与实际合绘线段也重新点选检查，消费者及操作数保持一致；历史截图只作历史证据。

本次继续针对剩余交叉加入有限次重新布线。初次选中的路线按顺序生成，较早的线没有机会避让后续线；重新布线会保留其他所有线路，仅重算参与交叉的单条线。改动前的代码、完整报告和代表 SVG 保存在 `verification/publication/reroute-baseline/`，`compare_refinement.cjs` 用独立 VM 全局中的渲染器重建全部 1,346 个图面，核对节点位置、节点/边去向及代表映射完全相同，并复现旧指标。独立全局避免 CommonJS 共享注册表将旧布局器与新渲染器混用。交叉与接触两个单调阶段先得到 261 → 133，60 个图面改善，无增加项。加入最后的有限分离后，累计 952 次尝试接受 122 次；当前交叉为 137，其中四个 DenseBlock 概览各增加一次明确跨越。

自省时额外检查了“交叉减少是否只是变成折点接触”。第一版原型曾得到 146 个交叉，但无关线路接触从 68 增到 112，24 个图面增加接触；它已经被否决，代码和诊断保存在 `contact-diagnosis/`。现在重新布线会为折点接触增加代价，并禁止接触数上升或新增接触的线路对，该轮先将接触控制在 66。进一步发现：零交叉图面不会进入修复，且只减少接触的路径会被交叉指标拒绝；另外，默认 16 单位引线会在 32 单位的行间空隙中相遇。现增加独立接触阶段与较短引线候选，在该阶段，接触从 66 降至 8，33 个图面改善，交叉保持 133。原始实现和全语料报告保存在 `contact-repair-baseline/`，当前累计 `contact-repair-comparison.json`（含后续分离取舍）重现全部旧指标并核对位置、原始依赖和代表映射。剩余接触仍作为额外诊断记录，当前字号/路径绿色门禁并未覆盖这些视觉歧义。

该算法仍有视觉代价：57 个图面的总线长增加，最大比例为 NiN 概览的 531 → 785，约 48%。已目视对比对应 DenseLayer：四个交叉消失，两条线改走容器侧面和上部空隙，图面尺寸和字号不变。此取舍在当前例子中更易追踪，但不能据此认定所有长绕行都更美观。DenseBlock 循环代表图从 3 个交叉降为 0 个，接触也从 1 处降为 0；GraphNet 的候选因新增接触被拒绝，保留 3 个交叉和零接触。DenseLayer 的接受结果、GraphNet 的拒绝结果，以及 TextCNN 和 WovenFusion 的实际界面导入、追溯和 SVG/图文档导出重建均已验证。当前新截图为 `DenseBlock-loop-preview.png`、`DenseLayer-detour-before-preview.png`、`DenseLayer-detour-preview.png` 和 `GraphNet-panel-preview.png`。TextCNN 的接触现从 4 降为 0，交叉仍为 4。已再次在实际编辑器点选本地 convolution 入口、WovenFusion 和 GraphNet 的实际合绘线段，并重新捕获五套 SVG/图文档导出（新增 DenseBlock 概览）；当前逐字节重建通过。

当前目视对比了 `TextCNN-loop-before-contact.svg` / `TextCNN-loop.svg`、`ConditionalVAE-contact-before-contact.svg` / `ConditionalVAE-contact.svg`、`DenseBlock-overview-before-contact.svg` / `DenseBlock-overview.svg`。条件 VAE 的引线分离改善局部可读性，但整体仍偏高；TextCNN 的部分长线改走右侧，仍需跨线追踪。此前剩余 8 处接触来自四个 DenseBlock 概览，每图 2 处：结构值与循环、循环控制与未解析循环变量的路径在紧凑空隙中相遇。归档试验显示，双线重算未找到全部指标不退步的解；同源共享端口原型得到 2 个交叉、零接触，但引入共享线段和额外绕行，未采用。试验代码、日志及 SVG 保存在 `contact-separation-baseline/experiments/`。现在仅对残余接触启用有限分离：每图将最后两处含混接触替换为一个额外的明确跨越，图面由 1 个交叉 / 2 处接触变为 2 个交叉 / 零接触。`contact-separation-comparison.json` 用归档渲染器复现全语料，确认仅这四个概览变化、原始端口及节点位置不变。已目视比较独立 SVG 和实际画布，并捕获 DenseBlock 导出逐字节重建；这是增加跨越以消除含混汇合的取舍，不能表述成所有指标单调改善。当前截图为 `TextCNN-loop-preview.png`、`ConditionalVAE-contact-preview.png`、`DenseBlock-overview-preview.png`、`DenseBlock-studio.png`。

原创 `WovenFusion` 为 35 节点、41 条关系、一个未知 kernel。六张图面全部通过。三路激活/未知操作输出各有两个消费者，不能当作独立分支。`BranchMosaic`、`WideBranches` 继续覆盖 Encoder 契约、部分门控、RNN、陌生路径与宽分支；未知 kernel 没有被补成经典模块。

目视仍能看到：总览紧凑，但 `Dependency band` 缺少算法解释；操作数详图保留较多跨线，需要与总览配合阅读。TextCNN 循环模板和条件 VAE 详图仍有较高的信息密度。此前的合绘点击、Enter、展开、撤销和导出记录作为历史交互证据保留；本轮新的交互记录另列，不把旧截图当作当前版本截图。

```bash
node tools/export_publication.cjs data/semantic/architecture/WovenFusion.json verification/publication/WovenFusion-atlas --strict --text-qa
node tools/export_publication.cjs data/semantic/architecture/BranchMosaic.json verification/publication/BranchMosaic-atlas --strict --text-qa
node tools/export_publication.cjs data/semantic/architecture/WideBranches.json verification/publication/WideBranches-atlas --strict --text-qa
```

## 源码内容摘要与本轮自省

依赖带原先仅显示单元数与依赖深度，总览难以看出实际计算。现在每个依赖带/面板保存 `publication-unit-inventory/1` 内容清单，按 `roles.units` 中直接操作、调用和已确认的局部组合计数，保留 ID、源码标签、操作符、可变性及证据状态；嵌套面板不重复计数。`execution_order`、`parameter_sharing`、`tensor_equality` 均为 `not-asserted`。`Linear × 3` 表示三个提取到的语义单元，不表示三层串行堆叠或三次执行。

词汇来自已知操作符和已有局部结构证据；已确认的 `torch.nn.*` 操作可细化类别，类名和模型名不参与算法命名。未知节点仍显示 `Unresolved`，不支持的计算显示 `Other operation`，原地操作标记 `(in-place)`。摘要在原有文字行数内列出内容，容纳不下的类别用 `+N kinds` 提示；完整清单保存在图文档、SVG 原生提示与界面“摘要内容”中。仅含结构分组而无已确认操作类别时保留原摘要。

`WovenFusion` 总览依次显示 `Linear × 3`、`Add × 3`、`Tanh · ReLU · 1 unresolved`、`Add × 3`、`Linear × 3`。这提高了对陌生交织结构的可读性，但仍不能解释未知 kernel 的算法含义。外部语料共 69 个唯一清单，其中 35 个产生内容摘要，覆盖 10 个候选；50 个图面发生变化，不能把这些数字当成模型家族识别率。

第一版虽然保留了折叠节点尺寸，却缩短了展开容器的标题区域，比较器发现 ConditionalVAE 内部节点因此位移。现通过 `paper.layout_caption_rows` 保留原始标题预算；归档 `content-inventory-baseline/` 后逐图重建全部 1,346 个图面，确认节点尺寸/位置、选中线路、操作数、原始节点/边去向和边界记录完全一致，交叉保持 137，接触保持 0。新增三项回归覆盖未知保留、误导性模型命名、嵌套计数、原地操作与标题预算。

实际浏览器复查又发现：1088px 窗口下检查面板进入第二行，左侧 sticky 列表继续遮住内容。已让此断点下的模型列表随文档滚动，并允许长模型名换行。1280px 与 1088px 实测均无面板遮挡及页面横向溢出，清单条目可见；视口覆盖范围只限这两个桌面宽度。已再次点选 WovenFusion 的 Linear 和未知操作摘要、共享结果/合绘线段、TextCNN 源码入口以及 GraphNet 合绘线段，并重新捕获五套实际 UI 导出，重建逐字节一致。

当前效果见 `WovenFusion-preview.png`、`WovenFusion-overview-studio.png` 和 `WovenFusion-inventory-studio.png`。摘要仍以拓扑分组为主，依赖带标题尚未提供算法级解释；更多术语和更美观的几何布局不能替代语义证据。

## 门控求和与标签空间的自省

新增原创 `GatedMixture`：EncoderLayer 契约调用 → RNN → 两个门控乘积 → 求和 → 未知 kernel，同时将一个乘积单独返回。提取结果为 25 节点、27 条关系、一个未知操作，没有导入或运行此源码。`gated-sum` 将两个已证实的局部门控及加法组合成嵌套摘要；既保留混合输出，也保留单个乘积通向返回值的额外出口。`roles.terms` 记录两项 gate/value/product 和每条乘法/加法边及槽位；`weight_normalization`、`state_update`、`model_family` 都为 `not-asserted`。这可以用于陌生门控结构，不能据此称为完整 LSTM 或 MoE。

原先的门控规则没有排除原地乘法、可变 Sigmoid 和错误的输出槽。现共用局部检查：拒绝这些纯表达式证据不足的情况，保留原始计算。求和还拒绝条件操作数、重复使用同一乘积、混合证据和非单位 alpha；ATen 槽 0 要求有单输出记录。反例与源码提取、嵌套组合、边界保留、手动位置及导出重建测试已加入。当前回归为 Python 38、架构 34、论文视图 57、原投影 4，共 133 项。

新案例第一次绘图虽然字号合格，仍有三个 RNN 接口标签被移到导出附注。其原因是字号优化选择 32 单位行距，仅按节点尺寸评分，没有评价真实标签空间。现界面与 CLI 共用 `prepareFigure`：实际标签放置失败后，最多尝试 60 / 84 / 112 单位行距；只接受遗漏标签严格减少、没有新增质量问题、不增加交叉或含混接触的结果，字号维持至少原有 8pt 门槛。`paperAuto=false` 或存在手动偏移时不改动位置。无可接受候选时继续保留显式诊断和附注。

此例在 60 单位行距就放下全部三个标签，概览可见图元从旧版 13 个变为 11 个，交叉保持 4，含混接触为 0，最小字号 8.25pt，物理尺寸 124.5 × 240mm。门控详图为 10.66pt、180 × 192.7mm，两个嵌套门控及额外输出可展开、点选和追溯。已在实际 UI 选择该摘要、切换详图、查看返回槽 2 的源码，并捕获概览/详图的 SVG 和图文档；连同原五套实际导出，七套均逐字节重建通过。

本轮改动前的七个实现文件与全语料报告保存在 `gated-sum-baseline/`；`compare_gated_sum.cjs` 在独立 VM 中重建全语料，确认 1,346 张 SVG 逐字节一致，原始节点/边去向和边界记录一致。必须区分覆盖：外部语料的门控求和正例为 0，行距重试触发为 0，因此这些特性的正向证据来自原创源码与反例，不能说外部案例验证了其普遍正确性。所有旧比较已刷新到当前实现，外部 254 个文件 SHA-256 再次核对未变。

效果仍有局限：新概览较高，RNN 的长距离输出需要跨线追踪；详图也保留一处交叉。门控归纳提高了局部表达层次，尚未解决整张混合模型的论文叙事。当前十二套图册均重新生成并在浏览器测量，未发现文字越框。当前截图为 `GatedMixture-studio.png` 与 `GatedMixture-sum-preview.png`，独立图册为 `GatedMixture-atlas/index.html`。

```bash
python3 tools/build_architecture_examples.py
node tools/export_publication.cjs data/semantic/architecture/GatedMixture.json verification/publication/GatedMixture-atlas --strict --text-qa
node tools/compare_gated_sum.cjs
```

## 尚未通过的目标

“任意陌生 PyTorch 模型均自动获得准确且适合发表的架构图”尚未被证明。动态 Python、跨文件实现、注册工厂和自定义 kernel 仍可能留下未知边界。完整 MoE 理论角色、新算法命名、作者希望强调的论文视角及全局最优布局，也不能从当前检查推出。

当前布局为有限候选的拓扑布局，依赖分层可能切开一个算法概念；完整模块的语义归纳仍需更强证据。几何和文字检查没有评价所有交叉、阅读顺序与审美。压力测试覆盖的是独立路径和循环邻接式交织 DAG 两类拓扑，并不覆盖任意稠密图或动态程序。

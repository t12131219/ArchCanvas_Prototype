# Summary_Merge · 通用语义架构

当前默认展示已接入最近正式审核的通用源码语义结果：项目首页和通用画布默认打开 **Transformer 的 F1 语义详图**，支持返回 F0 架构概览，并继续局部展开到调用和源码细节。此轮将已有优化发布为当前产品基线，没有增加新的模型特判或布局规则。

```bash
python3 -m http.server 8766 --bind 127.0.0.1 --directory .
```

- 当前默认入口：<http://127.0.0.1:8766/>
- 通用语义画布：<http://127.0.0.1:8766/semantic_studio/index.html>
- 明确打开当前 Transformer：<http://127.0.0.1:8766/semantic_studio/index.html?model=0216717d966327f4>
- 专用参照编辑器：<http://127.0.0.1:8766/yworks_edge_router_lab/index.html>

侧栏的“Transformer · 语义架构”与正式审核输入 `verification/helper-contracts/current/Transformer-current.json` 逐字节相同，完整保留 **3371 个节点、3663 条边**。默认 F1 为 80/80、2098 × 3028；F0 为 28/37、1610 × 1386。它们是同一份 IR 的展示状态，F1 下方继续保留更细展开。

`data/semantic/catalog.json` 指定默认模型及其展示配置；`data/semantic/presentations/transformer.json` 固定审核过的 F1 初始状态与概览返回快照。其他源码模型默认使用相同的通用认证详图机制。新展示采用独立浏览器存储版本，旧展示状态仍保留在原键中；明确导入的图文档继续优先恢复自己的状态。重新构建模型目录或运行历史发布脚本后，也会保留当前审核过的输入和展示配置。

重新发布当前审核输入和展示配置：

```bash
python3 tools/publish_reviewed_presentation.py
node tests/reviewed-presentation.test.cjs
```

详细的数据、状态和文件关系见 [当前展示发布说明](docs/reviewed-presentation.md)。[最近布局优化证据](docs/generic-input-placement.md)保留原有审核结论；本次接入没有声称进一步改善图面，也未新增数千节点同时可见的性能验证。

专用 Transformer 三个历史案例继续保留：`01093cc06a87b35a` 为三份专用基线图，`…35b` 为源码原子副本，`…35c` 为 CPU 轨迹细化副本。其专用生成器、数据和编辑器独立于当前通用展示，仍可用来比较和回归。带 `?case=…` 的旧首页链接继续进入专用编辑器。

以下为此前阶段的累计记录，其中测试计数、默认入口与阶段限制以各自记录时点为准；当前默认行为以本文开头和发布说明为准。

## 可组合架构表达

当前审核阶段新增通用“主图＋局部详图”规划、编辑器返回主图及逐实例的精确表达分配。六组输入、21 张 SVG、474 项测试与 587 处原生浏览器文字检查通过；主图均与冻结基线相同。Transformer 的直接细节目标由 36 增至 60 / 1855 项，仍有 1795 项待展开，主图对专用参考的接近度尚未改善。说明及限制见 [主图与局部详图](docs/diagram-set.md)，复现见 [图组审核](verification/diagram-set/README.md)。

通用语义画布新增局部语义规则、架构摘要与拓扑布局。陌生组合中的残差、门控、前馈和重复结构可独立归纳；未知边界、原始连接、参数身份和端口证据保留。支持紧凑显示、递归展开与 Node SVG 导出。 新增真实 Notebook 语料复查工具 `python3 tools/audit_model_corpus.py`，只读检查 186 个 PyTorch 候选，浏览器提供 8 个 corpus 代表案例。实现范围、使用命令及自主测试见 [架构表达说明](docs/architecture-rules.md)。

新增“论文视图”：自动粒度、模块详图、印刷字号检查、可追溯的递归 SVG 图册。命令 `node tools/export_publication.cjs input.json /tmp/model-atlas --strict`。当前增加配置用途证明：仅配置使用的静态整数运算归入附注，保留原节点、依赖和源码证据；特征系数、返回标量及未知调用保持数据表达。145 项回归通过，186 个只读外部候选的 1,291 个图面通过现有自动检查及浏览器文字测量；19 模型覆盖 44 个字面量运算正例。ConvNet 概览 11 → 9 个图元、1 → 0 个交叉；3 个 VAE 局部图的交叉增加，已保留对比截图和自省。新增 Encoder + GRU + 局部门控 + 未知融合原创案例。当前证据位于 `verification/publication/configuration/`，旧阶段独立归档；尚未达到任意模型的论文插图质量。详见 [论文视图与验收记录](docs/publication-view.md)。

## 保留的构建链

- `snapshots/transformer_programmatic_guide/sources/pytorch_transformer_original/transformer.py`：输入源码。
- `snapshots/transformer_programmatic_guide/draw_transformer.py`：专用 AST 取证、语义 IR、布局和 SVG 生成器。
- `snapshots/transformer_programmatic_guide/source_semantics.py`：核对 Encoder/Decoder 的 Q/K/V、mask、Post-LN 残差契约。
- `snapshots/transformer_programmatic_guide/semantic_routes.py`：将 IR 端点投影为实际 SVG 路径。
- `snapshots/transformer_programmatic_guide/generated/`：三种视图的 SVG、布局 JSON、语义 IR 和校验结果。
- `data/cases/01093cc06a87b35a-{overview,modules,detailed}.{json,js}`：编辑器使用的三份导入数据。
- `tools/build_source_atomic_case.py`：从已审计 detailed 数据和 `semantic_ir.json` 生成源码原子副本。
- `data/cases/01093cc06a87b35b-source-atomic.{json,js}`：源码原子副本的单一递归 authority 数据。

重新生成 Transformer 图：

```bash
cd snapshots/transformer_programmatic_guide
python3 draw_transformer.py --out generated
```

生成器只使用 Python 标准库，读取源码文本并使用 `ast.parse`，不会 import 或执行模型。

## 启动编辑器

```bash
python3 -m http.server 8766 --bind 127.0.0.1 --directory .
```

打开 <http://127.0.0.1:8766/yworks_edge_router_lab/index.html>。页面加载原案例和源码原子副本；副本不通过 overview/modules/detailed 切换，而是在同一份源码 authority 图上逐级展开。原三份图只作为不可见的已审计路由模板复用，不作为用户视图。画布平移直接按住鼠标滚轮拖动，滚轮滚动仍用于缩放。节点移动、递归展开、约束布线、撤销/重做和 SVG/JSON 导出仍由 `yworks_edge_router_lab/` 提供。

交互性能路径：展开/收起的递归投影构建、路由和完整约束校验在 `routing-worker.js` 中作为一个事务执行，主线程只保留状态提交和最终渲染。兼容模式拖动在 `requestAnimationFrame` 中只更新移动子树、受影响边、跟随标注/附件和句柄；释放鼠标后才执行完整移动校验、路由修复和历史提交。这样大模块展开后移动时，帧成本随局部交互前沿增长，而不会重复遍历整张 SVG 场景。

## 目录

```text
Summary_Merge/
├── data/catalog.{json,js}       Transformer 基线与源码原子副本索引
├── data/cases/                  基线视图及源码原子副本编辑数据
├── data/semantic/               通用 IR、源码清单、CPU 运行证据和索引
├── semantic_adapter/            静态抽取、运行探针、证据合并、模式与 CLI
├── semantic_studio/             通用语义递归画布
├── docs/semantic-adapter.md      通用层标准、范围、运行方式与限制
├── snapshots/transformer_programmatic_guide/
│   ├── sources/                 Transformer 源码
│   ├── generated/               SVG、IR、布局和检查结果
│   ├── draw_transformer.py      生成器
│   ├── source_semantics.py      源码契约
│   └── semantic_routes.py       语义路径投影
├── yworks_edge_router_lab/      浏览器编辑器和通用路由核心
├── tests/                       保留的 Transformer/编辑器回归测试
└── verification/                Transformer 的历史验证证据
```

旧的其它模型案例和通用源码导入服务已移除。新的通用层通过 CLI 显式指定入口和运行输入，页面只打开派生 IR/图文档；既有 Transformer 图与编辑状态独立保留。

陌生混合案例 `BranchMosaic` 现已加入目录：Encoder 层、部分门控、RNN、三条依赖路径与未知 kernel 可分别追溯和展开。分支区域按局部拓扑组合，参数切边作为附注保留；详见上述验收记录中的本轮自省。

宽分支规则已扩展：递归三路面板、保留原始依赖的合绘连线及可点击证据检查器；新增八路陌生模型 `WideBranches`。47 种原创分支拓扑的 1,834 个图面通过当前检查；具体自省、边界和复现命令见论文视图文档。

共享中间结果的陌生组合现可按依赖深度生成递归面板；新增 `WovenFusion`，以及 77 组交织 DAG 的 1,669 个图面检查。共享出口、物理端口顺序和有限路由候选保留每个消费者及操作数；聚焦图面补回遗漏的别名依赖，归档复现的 351 个孤立边界端口降为 0。本次有限重新布线将交叉从 261 降至 137，60 个图面交叉减少，4 个图面以增加交叉消除接触，全部节点位置及依赖去向不变；累计相对更早基线为 663 → 137。较长绕行与稠密图的视觉限制见论文视图文档及 `verification/publication/self-review.json`。

独立接触修复阶段处理零交叉图和紧凑引线，先将接触从 66 降到 8。新增的有限分离阶段再将最后 8 处接触改为明确跨越：四个 DenseBlock 概览各增加一个交叉，语料总交叉 133 → 137、接触 8 → 0，全部位置和依赖去向相同。这项取舍单独记录，其他图面未退步。当前 133 项回归、全语料及 12 套图册文字测量和五套实际 UI 导出重建通过。

依赖带摘要新增源码可追溯的内容清单：按操作、调用和已确认局部组合计数，例如 `Linear × 3`，未知操作仍明确显示。外部语料有 69 个清单、35 个内容摘要，50 个图面变化，节点位置、线路及边界记录全部保持；完整条目可在检查面板、SVG 提示与图文档中查看。

局部语义新增“门控求和”：两个已证实的 Sigmoid 门控乘积可组合成嵌套、可展开的摘要，保留额外外部使用；不推断 LSTM/MoE 或状态更新。新增 `GatedMixture` 陌生组合案例。共享绘图入口会在端口标签放不下时有限重试行距；该例三个遗漏标签全部放入图中，保持 4 个交叉、零含混接触。全部 1,346 张外部 SVG 与本轮归档逐字节一致，当前 133 项回归和七套实际界面导出重建通过。

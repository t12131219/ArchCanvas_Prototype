# Summary_Merge · Transformer 与通用源码语义适配

当前工作区保留教育版 **Transformer** 及其源码原子粒度副本：原案例 ID 为 `01093cc06a87b35a`，副本 ID 为 `01093cc06a87b35b`。原案例保留概览、模块操作和算子详细三份基线视图；副本只暴露 `source-atomic` 一份 authority 图，由递归展开控制源码颗粒度。

新增独立的实验性通用 PyTorch 语义链路：只读 AST 抽取 → 统一 IR → 隔离 CPU 证据 → 原子关系 → 数据流模式组合 → 递归图。入口为 <http://127.0.0.1:8766/semantic_studio/index.html>，完整范围、命令与限制见 [通用适配层说明](docs/semantic-adapter.md)。已读取两个参考集合并生成 7 个外部模型静态图，保留未知边界；外部 Notebook 未执行、未复制模型实现。CPU 端到端验证使用用户允许的 conda `ArchCanvas` 环境。

源码原子粒度标准（`source-atomic-v1`）把一个源码函数调用/表达式、参数或 buffer、控制量（mask/causal/循环）和明确的张量值别名作为最小可解释单位。端口绑定只表达关系，界面标签和说明框不计为算子。每个原子节点记录 `source_evidence`、源码行号/表达式、`semantic_kind` 和 `atomicity`，展开只改变可见投影，不改变源码、IR 或 canonical binding。

## 可组合架构表达

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

# 可组合架构表达与通用布局（实验版）

2026-10-18，在 Summary_Merge 的通用 PyTorch 链路上新增架构表达层。静态抽取、CPU 证据、局部语义归纳、展示分组和几何布局分别保留各自职责。实现位于 `semantic_studio/architecture.js`、`architecture-layout.js` 与 `semantic-engine.js`，浏览器和 Node 导出器共用同一份实现。

## 使用

启动 Summary_Merge 的静态 HTTP 服务后打开 `semantic_studio/index.html`。新增“架构表达 / 源码层级”选择，与原来的“源码结构 / CPU 执行轨迹 / 合并证据”选择相互独立。

- 架构表达默认折叠明确的单输入值别名，将参数读取附在可见消费者上。单击消费者可检查附属参数资源。
- “显示值别名与参数节点”可恢复这些节点；“展开全部”同时开启细节显示。
- 双击摘要逐级展开。摘要检查器包含规则、原始成员、证据范围，以及每个边界端口的完整原始连接记录。
- 拖动、撤销/重做、自动排布、文档保存和 SVG 导出继续可用。保存的 `semantic-canvas/1` 文档保留原始 IR 与展示状态。
- 原 Transformer 专用编辑器的 `35a/35b/35c` 不使用本轮新增的通用画布。此实现也没有同步到正式 Studio。

分析新模型并导出静态 SVG：

```bash
python3 -m semantic_adapter.cli analyze \
  --source /absolute/path/model.py --entry MyModel \
  --output /tmp/my-model.json
node tools/export_architecture.cjs /tmp/my-model.json /tmp/my-model.svg --depth 2
```

可用参数：`--mode source|runtime|merged`、`--view architecture|source`、`--depth N`、`--details`。源码分析沿用现有解析器的支持范围；指定输入的 CPU 探针仍需显式传入输入规格和解释器。

导出器同时生成 `my-model.layout.json`，格式为 `archcanvas-architecture-document/1`，包含原始 IR、展示状态、架构计划、布局、逐边路由和诊断。页面支持重新打开这种文档，并从原始 IR 重新计算表达；不会信任文档中的派生坐标或分组替换源码事实。若路由预算内找不到合法路径，导出器返回非零状态，画布以橙色提示，不将失败路径当作已通过。

## 局部语义规则

所有规则使用实际依赖和框架操作身份，不按模型标题、模块路径中的 Encoder/LSTM/MoE 等字样选择模板。

| 规则 | 证据要求 | 表达 |
| --- | --- | --- |
| Sigmoid gate | Sigmoid 输出实际参与乘法 | 门控局部结构；不宣称是完整 LSTM |
| Feed-forward | Linear → activation → Linear 的值依赖 | 前馈摘要 |
| Convolution block | convolution → activation，可接 pooling | 卷积子块 |
| Residual | 加法的一个操作数实际进入另一条计算支路 | 残差摘要与旁路 |
| Pre/Post-Norm | Norm 直接读取旁路值，或直接读取 Add 输出 | 区分归一化相对位置 |
| Scaled attention-like | matmul → scale → softmax → matmul 的依赖路径 | 注意力候选；不自动确认 Q/K/V、多头或 Encoder |
| Repeated source structure | 同一局部源码定义、相同构造配置的串行调用 | `× N` 摘要，内部保留每个实例；不假定共享或独立参数 |

匹配可以跨过明确的赋值和本地 helper 接口。条件合流、解包槽、未知操作和有副作用的支路会限制推导。语义发现允许重叠；能够形成合法嵌套树的发现用于展示分组，其余保留为注释，避免强行制造一个虚假的模块树。源码所有权保存在 `source_parent` 中，已有 CNN 模式提升也不会抹去新增 IR 的原始所有权。

`archcanvas-architecture/1` 包含规则版本、原始 IR digest、派生节点/边、findings 和限制。新增摘要标记 `presentation_only`，记录 `canonical_members` 和 `boundary_ports`。分组只重新组织派生树，原始节点和连接全部保留。布局不会改变语义。

## 未知与混合结构

`tests/semantic_fixtures/composed_models.py` 是本次新写的测试源码，包含：注意力子结构 + 残缺门控单元 + RNN + Top-K 条件路由、Pre-Norm、无关归一化、未知融合内核、共享模块别名、未知循环次数和串行重复单元。

`ForeignComposition` 的局部规则独立工作，模型不需要属于某个既定家族。`BrokenCell` 只获得门控表达。`UnknownFusion` 中的陌生内核仍为 opaque，并阻止跨越它证明残差。Top-K 和条件路径显示实际源码关系，本版不把它们认证为完整 MoE。框架 RNN 调用保留框架语义，不虚构 kernel 内部 gates。循环仍是源码 body 模板和未知 carried value，不变造成已观测的时间展开。

## 投影、布局和路由

- 将每条原始边明确计入 visible、internal、excluded、contracted 或 attached；视图没有使用“按模块对合并边”来丢弃不同操作数。
- 折叠别名只穿过明确、无条件且没有解包槽的绑定，展示边保留完整原始路径 ID。参数附注保留原始资源和读取边。
- CPU 合并保留 producer 输出 slot 和 consumer operand 序号，避免多输出算子不同结果混同。
- 每层容器使用实际依赖排序；强连通分量保留反馈，避免把循环错误地排成无依赖的一行。多轮重排减少分支交叉，独立节点可并列放置。
- 端口保持不同边界关系。普通几何相交不会生成连接点。路由尝试短正交路径，必要时使用障碍边界构成的压缩网格搜索；保护无关容器、叶节点以及端点自身内部。
- 加法和乘法使用数学图例；图例的位置和大小属于展示信息。

## 复查

```bash
python3 tools/build_architecture_examples.py
python3 -m unittest discover -s tests -p 'test_*adapter.py' -v
node tests/architecture.test.cjs
node tests/semantic-projection.test.cjs
node tools/audit_architecture.cjs
```

`build_architecture_examples.py` 只读分析源码并发布静态示例。若需要刷新混合模型的 CPU 证据，显式运行：

```bash
python3 -m semantic_adapter.cli analyze \
  --source tests/semantic_fixtures/composed_models.py --entry ForeignComposition \
  --probe-spec tests/semantic_fixtures/composed-inputs.json \
  --interpreter /home/fzg/anaconda3/envs/ArchCanvas/bin/python \
  --output data/semantic/architecture/ForeignComposition-runtime.json \
  --catalog data/semantic/catalog.json
```

本次 CPU receipt：两个输入 × eval/train，共 4 次，Bubblewrap 隔离、源码摘要与输出重放检查通过。没有声明穷举输入域，条件两个结果也没有全部观测，覆盖结论保持 partial。

新增 23 项 Node 测试包含 40 个固定种子的陌生图，覆盖反馈、端口、误归纳负例、摘要边界、保存恢复与不可变性。另有 4 项原投影回归和 15 项 Python 适配测试。全目录检查覆盖 20 个模型、270 个表达/证据/展开状态；结果和实现摘要保存在 `verification/architecture/report.json`。同目录保存代表 SVG 与可重新打开的 layout 文档。

## 当前边界

这是一版可组合规则与拓扑布局实现，尚不能证明任意 Python 程序的完整语义，也没有把一次 CPU 轨迹解释成所有动态路径。跨文件解析、复杂 ModuleList 工厂、动态 shape、完整 MoE 路由语义和自定义 kernel 内部结构仍受现有适配器限制。重复规则目前针对同一定义的串行调用，不做任意不同实现之间的等价识别。

当前布局没有全局最优紧凑性、无交叉或任意规模帧率保证。完全展开的实现轨迹仍可能很长；架构摘要和局部展开用于控制复杂度。测试集合中的零重叠和零路由失败只覆盖报告列出的状态。

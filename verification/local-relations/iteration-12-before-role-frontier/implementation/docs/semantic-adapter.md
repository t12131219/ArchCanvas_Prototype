# 通用 PyTorch 源码语义适配层（实验版）

局部事实、混合结构及可验证详图阶段正在实施，当前状态见 [局部关系阶段](local-relations.md)。既往阶段的通过记录保留历史含义。

2026-10-19 更新：当前通用语义契约、受限模块序列、观测索引、语义粒度与版式审核见 [通用语义认证与架构版式](semantic-design.md)。下文既往案例表与历史验证记录保留对应阶段含义，89/651 等旧计数不代表现行抽取结果。

目标契约：**在明确限定的模型、输入范围和运行模式内，完整覆盖并验证所有分支。** 若要求任何任意 PyTorch 模型都没有 `opaque`，无法保证：未知自定义算子、外部依赖或动态 Python 行为可能无法从现有证据中还原。

这是 `Summary_Merge` 原型新增的独立抽取和展示链路。既有 Transformer 专用适配器、原案例 `01093cc06a87b35a` 与原子副本 `01093cc06a87b35b` 继续保留。新层没有取代专用适配器的 Q/K/V、Post-LN 等严格契约，也没有接入正式 Studio 的模型编辑或源码写回。

## 启动与入口

在本目录执行：

```bash
cd /home/fzg/PycharmProjects/ArchCanvas/prototype/Summary_Merge
python3 -m http.server 8766 --bind 127.0.0.1 --directory .
```

- 新的通用语义图：<http://127.0.0.1:8766/semantic_studio/index.html>
- 既有 Transformer 编辑器：<http://127.0.0.1:8766/yworks_edge_router_lab/index.html>

新页面支持递归展开/收起、中键平移、滚轮缩放、子树拖动、撤销/重做、保存图文档、重新打开和 SVG 导出。保存按钮准备下载链接，并提供可复制的导出文本，便于不支持下载的嵌入浏览器使用。展开与布局保存在浏览器中，按 IR digest 隔离；文件图文档同时包含 IR 和展示状态。

“源码结构 / CPU 执行轨迹 / 合并证据”是证据筛选，**不是 overview / modules / detailed 三档颗粒度**。每种视图内均可按实际父子关系递归展开。源码图和每次执行的调用图保留各自身份，合并视图不会把不同输入、模式的执行拼成一条假想路径。

## 数据流与实现

```text
原始 .py / Notebook 单元 / Markdown 来源索引
  → sources.py：只读清单、sha256、源码位置
  → analyzer.py：AST、符号绑定、调用、赋值、条件、局部模块/函数
  → schema.py：统一语义 IR v2、图例和校验
  → probe.py + runtime_worker.py：显式输入集、隔离 CPU 运行
  → merge.py：追加运行层级与张量关系，关联源码位置，计算覆盖矩阵
  → motifs.py：数据流模式与模块组合
  → semantic_studio：在同一份 IR 上投影递归可见前沿
```

1. 静态读取不 import 模型，不执行顶层语句。Notebook 按原单元编号定位；魔法命令等不支持语法会记录诊断，训练、下载和数据集单元不执行。
2. 从指定类的 `forward` 开始展开本文件内的类、方法和 helper。`nn.Sequential` 依据框架契约连线；构造配置仅做安全的字面量解析，不使用 `eval`。不按调用的书写先后自动画数据边。
3. CPU 探针使用 `nn.Module` hooks 区分每一次调用；ATen dispatch 记录实际张量 producer/consumer、shape、dtype 和可变算子。`named_parameters(remove_duplicate=False)` 保留共享参数别名；buffer 单独记录。AST 插桩记录 if/条件表达式的真实布尔结果，行号和列号区分同一行的多个条件。
4. 每个输入与模式使用新模型；同种子重新构造模型并重放，检查输出内容摘要一致及浮点张量有限值。此检查不是与参考答案比较，也不证明训练正确性。`train` 指模块训练模式下的 **no_grad forward**，不包含 backward/optimizer。
5. 可选 `torch.export` 独立保存捕获图/约束或失败原因。导出失败不会抹掉已经观测到的 eager 轨迹。本版没有声称已实现 FX、Profiler 或符号执行。
6. 合并时核对源码摘要、构造配置和输入规范。源码事实与运行事实分开保存；按源码行关联到多个 ATen 事件只能标为 `source-runtime-associated`，不能视为算子等价证明。未知调用即使本次成功运行，静态 `opaque` 仍保留。
7. 模式规则引用原节点，不用教材模板替换子图。CNN 根据 convolution → activation（可选 pooling）依赖链生成组合容器；MLP 要求 Linear → activation → Linear 依赖路径；LSTM/GRU/RNN 依靠 PyTorch 框架类型，未猜测内部 gates。运行时的 matmul → scale → softmax → matmul 候选仍不单凭 rank-4 shape 升级语义；新增源码契约在轴、缩放、投影和分头/合头等前提全部成立时记录局部 Q/K/V 与多头角色，完整家族分类仍未实现。具体范围见新阶段说明。
8. 模块定义和调用形成父子树，局部模式可以形成中间容器，再递归展开至源码表达式或本次观测到的 ATen 原子。不会把 kernel 内部没有证据的实现再虚构为节点。

## 原子标准

| IR 类型 | 证据和展示含义 |
| --- | --- |
| `compute` | 源码调用/表达式或本次实测的框架算子 |
| `parameter` | 静态声明的模块参数范围；运行时可得到确切名称和共享别名 |
| `buffer` | 持久 buffer；静态常量全局资源保留其来源 |
| `state` | 对象属性、状态读取/写入或待解析外部值 |
| `value-alias` | 明确的赋值、解包和条件合流别名 |
| `control` | 条件或循环控制；循环 body 是模板，不等于实测次数 |
| `interface` | 函数/模块入口与返回端点；`interface-binding` 是关系边 |
| `composite` | 源码模块、函数、调用实例或数据流规则组合 |
| `opaque` | 无法还原的调用、循环绑定或其它边界，保留源码和原因 |

每个节点有稳定 ID、父节点、源码/运行证据、图例、证据状态。边区分 `source-dependency`、`framework-contract`、`runtime-tensor` 和 `runtime-state`。静态边表示源码值依赖，不保证是 Tensor；运行边表示本次观测到的张量依赖。ATen operand 序号和张量输出 slot 保留在事件元数据中，画布按可见父容器聚合连接。

类不是天然原子；能展开的类是容器。变量不是天然算子；常量、端口、别名和资源与计算节点区分。`granularity: atomic` 只表示当前证据层的叶节点；`opaque` 虽也是叶节点，仍表示无法证明内部，不能解释为已经理解的计算原子。

## 覆盖结论的严格范围

`bounded-branch-verified` 当前只用于以下条件同时成立的情形：

- 用户列出一个**具体有限输入集合**，case 与该集合一致；zeros/ones 和标量可描述具体值，随机 normal 张量不能当穷举值域。
- 声明模式与 cases 的笛卡尔积全部执行，无缺项、重复、截断或失败；隔离检查通过、源码未变、重放一致。
- 选定 `forward` 及已展开本文件 helper 中的 if/条件表达式两个结果均被观测。
- 没有静态 `opaque`、循环或未认证的短路/异常/推导式等覆盖障碍。

它**不表示**相同 shape 的所有 Tensor、任意输入长度/配置、所有参数值、框架内部条件或完整 Python 路径组合都被证明。条件两个结果都被观测也不等于穷举所有跨条件路径组合。未满足条件时只报告 `partial` / `not-verified` / `runtime-unavailable` / `runtime-failed`，保留未覆盖项。

本版尚不能自动生成让任意条件都触发的输入。需要用户给出合法输入、构造配置和运行模式。固定构造、直接串行递推的模块序列现可受限解析；任意循环、动态 shape 族验证、完整跨文件符号解析、复杂 ModuleList 工厂、Python 反射、完整异常控制流、RL 环境/rollout/损失/更新、传统非 PyTorch ML、自定义 C++/CUDA 与分布式尚未形成通用支持。`environment/objective/update` 领域语义尚未实现。

## 构建和验证

静态构建不依赖 PyTorch：

```bash
python3 tools/build_semantic_catalog.py
python3 -m semantic_adapter.cli analyze \
  --source /absolute/path/model.py --entry MyModel \
  --constructor '{"width":32}' --output data/semantic/my-model.json \
  --catalog data/semantic/catalog.json
```

Notebook 可额外使用 `--cell 8` 指定原始单元。参考集合脚本只读取两项目并写派生 IR/证据，未将模型实现复制进本项目。

CPU 验证（已使用用户允许的 ArchCanvas conda 环境）：

```bash
python3 -m semantic_adapter.cli analyze \
  --source tests/semantic_fixtures/models.py --entry BranchMLP \
  --probe-spec tests/semantic_fixtures/branch-inputs.json \
  --interpreter /home/fzg/anaconda3/envs/ArchCanvas/bin/python \
  --output data/semantic/branch-mlp.json --catalog data/semantic/catalog.json
```

`branch-inputs.json` 展示 `semantic-inputs/1`：构造参数、cases 的命名输入、seed、eval/train、可选 export 与有限域。Tensor 描述当前支持正整数 shape、zeros/ones/normal、float32/float64/int64/bool；标量使用 `{"value":true}`。复杂自定义输入和任意输入工厂尚未支持。探针超时默认 45 秒。

如果 IR 已经生成，登记目录无需再执行模型：

```bash
python3 -m semantic_adapter.cli publish data/semantic/my-model.json \
  --catalog data/semantic/catalog.json
python3 -m semantic_adapter.cli validate data/semantic/my-model.json
python3 -m unittest discover -s tests -p 'test_semantic_adapter.py' -v
node tests/semantic-projection.test.cjs
```

## 当前接入证据

只读扫描得到 200 个源码/Notebook/Markdown 文件、186 个含 forward 的类候选、679 个 GitHub 链接。**候选数量不是通过适配的模型数量。** Awesome 项目目前提供来源链接，本轮未下载模型或权重；已有本地集合足够验证首版链路。

已生成原 Transformer 和外部集合 7 个代表性模型的静态图：MLP、CNN、LeNet5、AE、VAE、双向 LSTM 文本模型、GNN。后三类中的未知调用会保留 `opaque`；即使静态图没有 opaque，也不等于实际运行验证通过。外部 Notebook 本轮没有执行。

独立编写的 BranchMLP、TinyCNN、ReusedRecurrent 用于 CPU 端到端验证，没有复制外部集合模型代码。原 Transformer 以 vocab=16、d_model=8、heads=2、编码/解码各一层的小配置，在有/无 mask 两组输入下 CPU 验证。

| CPU 案例 | 已执行组合 | IR 节点 | opaque | 结论 |
| --- | --- | --- | --- | --- |
| BranchMLP | 两个布尔分支 × eval/train，共 4 次 | 87 | 0 | 声明的有限域内分支验证 |
| TinyCNN | 图像输入 × eval，共 1 次 | 32 | 0 | partial，未声明穷举值域 |
| ReusedRecurrent | 序列输入 × eval，共 1 次 | 46 | 0 | partial；共享参数和重复调用已观测 |
| Transformer | 有/无 mask × eval，共 2 次 | 651 | 8 | partial，源码循环/绑定等边界未还原 |

具体结果以 `data/semantic/*.json` 和 `verification/semantic-collections.json` 为准；不以表格替代 receipt。

## CPU 隔离与实现边界

Linux x86-64 的 Bubblewrap 隔离 network/user/pid/mount，模型源目录和指定 conda/venv 只读挂载；不挂载完整 HOME，不暴露 GPU，seccomp 禁止网络 socket 和新任务，限制 CPU、虚拟内存、打开文件数、输出文件大小和 wall timeout。先用独立可信探针检查隔离，再导入模型。不可用时保留失败/不可用结果，不降级为普通宿主执行。

源目录运行前后按 Python 文件 sha256 核对。这不是不可变文件快照，也不是对恶意竞态的证明。资源限制是进程级而非 cgroup，tmpfs 无独立容量配额；依赖环境也不是完全封闭的供应链证明。模型和采集器同处隔离进程，receipt 不是针对恶意模型的防篡改认证。请将其用于授权、可信来源的模型研究。框架版本/环境、输入规范、源码摘要、限制和隔离检查均随 receipt 保存。

## 前端性能与显示边界

展开只重算展示投影，不解析/运行源码；折叠后的边仍引用 canonical edge IDs。子树拖动在 requestAnimationFrame 内只改受影响节点 transform 和预先收集的相邻边，释放后提交历史与持久化。通用页面已增加架构摘要、拓扑布局和障碍路由；其端口与容器边界契约仍不同于既有专用编辑器；全展开大型图仍可能密集，未作通用规模的帧率承诺。调整位置不会改动模型或语义关系。

## 可组合架构表达（2026-10-18）

新增独立架构表达、局部规则和障碍路由，替换通用画布此前的简单布局。证据筛选与表达方式分别选择；源码语义和 CPU 覆盖边界继续适用。实现、命令、测试与限制见 [架构表达说明](architecture-rules.md)。

本轮整图序列前沿、语义边界预设及端口对齐规则见 [inline-sequence-frontier.md](inline-sequence-frontier.md)；其中单独记录尚未收敛的参考图差异和跨语言摘要限制。

通用画布中的来源外框简化与恢复规则见 [frame-ownership.md](frame-ownership.md)。该规则只改变展示归属，语义角色与参考图的对应关系仍需单独验收。

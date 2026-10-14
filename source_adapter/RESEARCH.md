# 联网研究与适配选择

2026-10-13 阅读以下官方文档和项目 README；页面提取保存在 `verification/source-adapter/research-*.json`。本次未安装或运行第三方模型工具，未审查 Netron 内部 ModelFactory 实现，因此以下比较仅基于公开文档所描述的能力。

| 方案 | 入口及证据 | 对本项目的参考价值 | 限制 |
| --- | --- | --- | --- |
| [PyTorch FX](https://docs.pytorch.org/docs/2.14/fx.html) | Module 实例/函数，Proxy 符号执行，call_module/call_function/call_method IR | 统一操作 IR、模块与函数调用分离、可接入 FX 图转换 | 文档明确 tracing 会执行程序；输入值决定的动态控制流不支持 |
| [torch.export](https://docs.pytorch.org/docs/2.14/user_guide/torch_compiler/export.html) | Module 实例、样例输入、dynamic_shapes；ExportedProgram | 后续可信运行图后端，可保留 graph signature、源码 stacktrace、shape/dtype 与约束 | 导出需要运行/捕获；子模块内联成低层计算图，层级需另行恢复；不可追踪部分会失败 |
| [Netron](https://github.com/lutzroeder/netron) | ONNX、PyTorch、TorchScript、torch.export 等模型文件 | 参考多格式 viewer 和模型读取/展示分离；未来接入已有导出产物 | README 列表不等于任意 Python 源码恢复；本次只查看 README，未复制其代码 |
| [torchview](https://github.com/mert-kurttutan/torchview) | Module 实例及 input_data/input_size；forward 记录，Graphviz | `expand_nested`、深度控制和复用模块展示可参考；meta tensors 降低内存占用 | 仍会调用模型；需要输入与运行环境，meta 支持也有范围 |
| 本次 AST 适配 | Python 文本、入口、可选字面量 config；不执行模型 | 保留源码层级、共享身份和独立槽位，直接复用当前递归图与连线约束 | 有界静态子集；未知行为 explicit opaque，不提供真实 shape/dtype |

FX 官方原文：“The system is tracing in that it executes the program … to record operations.” 同页说明动态控制流是条件依赖输入值的 if/loop，当前 symbolic tracing 不支持。证据：`research-fx.json` 的 `limitations`。

torch.export 官方文档写明入口接收 `torch.nn.Module` 和 sample inputs；Normalized 条件说明子模块会内联形成 fully flattened computational graph，Metadata 包括 tracing 时捕获的用户 stacktrace。证据：`research-export.json`。这适合作为可选的执行图后端，不能替代本次不运行源码的入口。

torchview README 描述 forward propagation 记录、`input_size`/`input_data`、`expand_nested`/`roll` 及 `device='meta'`，可以借鉴层级与模块复用，但 meta device 不意味着不执行 Python。证据：`research-torchview.json`。Netron README 的格式支持和 MIT 许可条目保存在 `research-netron.json`。

当前采用“源码适配后端 → 统一 IR → 现有递归渲染/路由/验证”的接口。可随后增加 FX/export/ONNX 后端，但各后端必须分别保存静态、追踪或导出证据、运行假设及失败诊断，不能混用其正确性声明。本次完成的是 AST 后端与浏览器接入。

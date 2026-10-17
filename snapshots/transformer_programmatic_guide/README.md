# Transformer 源码到架构图

本目录是 Summary_Merge 唯一保留的模型生成链。输入为 `sources/pytorch_transformer_original/transformer.py`，输出为 `generated/` 下的 overview、modules、detailed 三个视图。

生成器 `draw_transformer.py` 使用 Python 标准库和 `ast.parse`：先提取源码行号、片段和 SHA256，再由 `source_semantics.py` 核对 Encoder/Decoder 的 Q/K/V、mask 和 Post-LayerNorm 残差顺序，随后由 `semantic_routes.py` 把语义端点投影到确定性 SVG 布局和路径。模型源码不会被 import 或执行。

```bash
python3 draw_transformer.py --out generated
```

主要产物：

- `generated/source_evidence.json`：源码符号、行范围和摘要；
- `generated/semantic_ir.json`：节点、层级、端口、参数身份和语义边；
- `generated/layout_{overview,modules,detailed}.json`：图元、端口和实际路径；
- `generated/figure_{1_overview,2_modules,3_detailed}.svg`：三张矢量图；
- `generated/layout_checks.json`：源码、包含关系、端口和路径检查结果。

这是一份针对随附教育版 Transformer 的专用适配器，不是任意 Python 模型的通用反编译器。

# 直接构造的结构化变换参数

通用源码参数说明现在可以表达 `reshape((batch, width, -1))`、
`reshape(shape=[x.shape[0], -1])`、`permute((1, 0, 2))` 等直接构造的 tuple/list。
单元素 tuple 保留逗号，空 tuple 保留 `()`；不将 tuple 和 list 混为同一种语法。
这扩展的是局部源码表达能力，不依据模型名、案例、源码哈希或布局坐标选择。

每个结构化值必须是静态源码 `structure` 操作，语法种类与 tuple/list 一致。
每个字面量为整数且没有对应数据入边；每个非字面量必须有唯一的元素槽入边，
其来源再用已有的名字、属性、整数下标或算术规则验证。额外、缺失、重复、受条件
保护或运行证据入边均拒绝受影响的调用说明。保留完整表达树和原始绑定，不执行源码。
每个序列最多 16 个元素，每条递归路径最多 24 个规范节点；每个参数共享 64 次读取
预算，序列的字面量元素也计入预算，避免重复子图造成无界展开。

命名的 `shape` 仍显示为 `shape`，即使其赋值来自 tuple/list。它可能在其他位置
被修改、返回或传给未知调用，不能用赋值时的内容代替调用处的值。未知元素或 starred
展开不被猜测；其他可独立解释的调用继续显示。框架 GRUCell、未知调用、条件区域、
实际操作和结构化值节点均保留，不把源码说明算成新的原子计算覆盖。

画布 roles 视图默认启用，可用 `paperTransformSequences:false` 关闭；
`paperTransformOperands:false` 和 `paperTransformConfigurations:false` 也保留原关闭范围。
打印和其他粒度沿用原策略。说明参与正常测量，不缩小字号；模块标题继续允许穿线。

## 审核范围

真实基线为 `c87c8fc`，旧版小图由冻结代码独立生成。11 份新源码覆盖 tuple、list、
算术、空/单元素 tuple、未知元素、条件、可变列表、starred、返回逃逸及 GRUCell
混合程序，另有 3 个进一步展开状态和 25 个旧状态。三个 Transformer 面板使用同一
输入与展示状态，共 84 张 SVG。大图基线沿用上轮已核对的实际文件字节，并检查输入、
状态、生产文件和产物哈希；当前图重新生成。

独立检查器重新读取物理源码的 Python AST，核对 tuple/list 类别、每个字面量、元素
槽和上游表达式；同时读取实际 SVG 的文字、位置、路径、端口与原始绑定。核对 IR、
逻辑前沿、逐对象去向、表达目标、直接覆盖和已应用约束。浏览器另检查实际 SVG
文字及标签边界，并将 DOM 路径、文字、分叉标记与文件逐项比对。

此次新增说明会增加部分图的高度与线长，不能称为紧凑度改进。当前 Transformer 的
162 条参数说明与上一版一致；不会为了让参考案例发生变化而修改其输入或展示状态。
整体架构收敛仍未完成。完整源码投影保留数千个规范节点，不等于验证了数千节点
完整 SVG 的路由及交互性能。本轮保存重渲染和进一步展开由测试覆盖，未新增编辑器
导入导出试验。

## 正式结果

83 组、923 项测试全部通过。84 张 SVG 独立检查通过；浏览器实际核对 1178 个节点、
1984 段节点文字、50 个端口标签，没有文字越界。DOM 路径、文字和分叉标记与
SVG 文件逐项一致。11 个新状态共显示 15 条结构化参数说明；该数量包含同一源码的
不同展开状态，不代表 15 个独立计算。所有状态的已应用约束、直接表达覆盖及绑定保留。

| 状态 | 尺寸：本轮前 → 当前 | 交叉 | 线长 |
|---|---|---|---|
| TuplePatch | 508 × 876 → 508 × 912 | 0 → 0 | 2299.7 → 2325.7 |
| ListPatch | 476 × 776 → 476 × 812 | 0 → 0 | 1337.7 → 1363.7 |
| ArithmeticTuple | 424 × 696 → 424 × 738 | 2 → 2 | 1621.6 → 1621.6 |
| UnknownTuple | 476 × 700 → 476 × 710 | 0 → 0 | 769.7 → 779.7 |
| MixedTuple | 606 × 1047 → 606 × 1057 | 0 → 0 | 3215.6 → 3235.6 |

增加的高度用于显示源码参数，未缩小字号。没有新增交叉和可选通道变更。
MutableList、StarredTuple、EscapingTuple 和 25 个既有小图状态的 SVG 保持字节一致。
Transformer 主图、详图 1、详图 2 也分别与基线逐字节一致，直接表达目标仍为
21、25、37，不能相加作为去重目标数。源码投影验证仍保留 3371 节点、3663 条边。

截图 review.png 显示 tuple 参数从无说明变为保留每个源码元素；transformer-review.png
记录详图回归。完整图、源码审查和成本记录可从 review.html、all-review.html 及
independent-checks.json 复核。

## 复现

```sh
mkdir -p /tmp/archcanvas-transform-sequences-before-c87c8fc
git archive c87c8fc semantic_studio | tar -x -C /tmp/archcanvas-transform-sequences-before-c87c8fc --strip-components=1
python3 tools/extract_transform_sequences.py
node tools/audit_transform_sequences.cjs
node tools/audit_transform_sequences.cjs --case=Transformer-panel-0
node tools/audit_transform_sequences.cjs --case=Transformer-panel-1
node tools/audit_transform_sequences.cjs --case=Transformer-panel-2
python3 tools/check_transform_sequences.py
python3 tools/build_transform_sequences_review.py
node tools/audit_source_expandability.cjs verification/helper-contracts/current/Transformer-current.json verification/transform-sequences/current/source-expandability.json
python3 tools/run_local_tests.py
python3 tools/finalize_transform_sequences.py
```

浏览器实际打开 all-review.html 后，保存 browser-report.json 和截图；CLI 数据不能
冒充实际浏览器测量。最终报告绑定代码、独立检查、测试日志及审核产物哈希。

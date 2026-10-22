# 轴变换保留源码参数表达式

此前路径摘要能说明 `Linear → reshape → transpose → copy`，但仅字面量配置会打印
具体参数。`x.view(b, t, self.num_heads, self.d_head)` 中四个参数都来自实际输入边，
不能因为构造环境曾记录数值，就将它们当成源码字面量。本轮增加的是通用的源码参数
表达能力：保留符号读取和原始绑定，不求值、不推断形状，不按模型名选择规则。

同样适用于陌生的 `reshape(x.shape[0], width, -1)`、`transpose(0, axis)`、
`reshape(batch, (length * factor), (width // factor))` 和关键字参数。
变量名只是显示内容，不用于识别模型或角色。属性的缓存值即使变化，也不能替换打印的
`self.groups` 等源码读取。完整 IR、未解析调用、状态接口、可变操作和返回的尺寸值保留。

`transform-configurations.js` 的原字面量接口默认不变；传入 `{operands:true}` 时，
支持有来源的局部名字、属性、整数下标及有界的加减乘、整除和取余表达式。
每个参数记录原始操作数槽、完整入边及表达树中各节点的依赖。语法占位符、操作类型、
参数位置、源结果槽或边证据不符，就拒绝整条调用说明。每条递归路径最多 24 个节点；不执行
表达式。未知节点不能变成符号表达式；带条件、运行、身份、可变或缺失祖先证据的读取
不用于新的说明。读取上游的未知边界也不会因说明被消除。

画布 roles 视图默认启用，`paperTransformOperands:false` 可恢复仅字面量的说明。
`paperTransformConfigurations:false` 关闭两类说明。打印和其他粒度沿用原策略。
摘要和展开后的原始操作共用相同来源记录，附注不增加原子计算覆盖。

## 正常返回表示的成本比较

第一次正式试算发现，附注改变尺寸后，原先的正常返回候选因宽度增加约 3.4% 被拒绝。
其线长和交叉实际更少，却重新显示了六条保留的源码替代路径。这不是丢失绑定，
而是逐维度严格比较错过了更清晰的长宽取舍。

保留正常返回的全部事实、绑定、直接目标、约束、路由、文字和接触检查；仅调整几何
偏好。宽、高和面积各最多增长 5%，线长和交叉仍不能增加。还要求以下成本倍率小于 1：

```text
面积倍率 × 线长倍率 × (候选交叉数 + 4) / (原交叉数 + 4)
```

这只比较已经证明的源码返回表示，不创造返回语义，也不奖励更多覆盖。
诊断记录实际成本、上限和接受原因。测试覆盖小幅有益取舍、超宽、超面积及无收益拒绝；
原有 FixedPair 的较差候选仍被拒绝。规则不读取案例名、源码哈希或特定坐标。
展开模块标题继续允许穿线，实际节点和无关模块主体仍是障碍。

## 审核范围

基线为真实提交 `68d4a32`。22 个小图状态包括 9 个本轮独立抽取的陌生程序及
ConfiguredShape 的进一步展开状态，并复查旧的未知、条件、共享、可变和状态组合。
三个 Transformer 面板沿用同一输入和展示状态。共 50 张正式 SVG。

独立 Python 检查器重新解析物理源码 AST，逐一核对源码名字、属性、下标、运算、
调用位置及关键字参数；再读取实际 SVG 的文字、路径、原始端点、bundle 成员和语义
绑定。原始 IR、语义前沿、原子目标、逐对象去向和原始消费端口与基线核对。
数组记录仅因容器遍历顺序变化时按身份比较，不改变对象的实际去向。
正常返回的成本倍率另由 Python 重算，不能仅信任渲染器的接受标记。

最终回归为 81 组、906 项测试全部通过。50 张 SVG 的浏览器 DOM 实测覆盖 828 个
节点、1444 段节点文字和 46 个端口标签，在 1 个原生 SVG 单位的容差内没有文字越界；
DOM 中的路径、节点文字和分叉标记再与实际 SVG 文件逐项比对。

| 面板 | 尺寸：本轮前 → 当前 | 交叉 | 线长：本轮前 → 当前 | 新增源码参数说明 | 直接表达目标 |
|---|---|---|---|---|---|
| 主图 | 1968×3134 → 1968×3255 | 10 → 10 | 34604.1 → 35106.2 | 12 | 21 → 21 |
| 详图 1 | 1404×2490 → 1461×2536 | 3 → 3 | 15378.3 → 14535.5 | 4 | 25 → 25 |
| 详图 2 | 1710×3064 → 1767×3160 | 9 → 10 | 24374.2 → 24440.7 | 8 | 37 → 37 |

这些目标是各面板的表达数量，不能相加作为独立目标总数。附注增强参数解释，没有增加
原子计算覆盖。正常返回成本比较针对同一轮的候选和普通返回表示，不意味着本轮图的
尺寸、线长优于上一提交；上表保留了真实的跨提交代价。

另有 10 项等宽软偏好转为暂缓：进一步展开的小图 1 项、详图 1 的 3 项和详图 2 的
6 项。独立检查逐项确认消费者仍在同一行、全部端口和映射完全相同，差异来自其中
带参数附注的节点变宽。这是实际的等宽退化，未计为约束保留。详图 1 的一条连接
改用普通顶部入口，取消原可选侧向通道；原始依赖、操作数、来源和 SVG 路径仍逐项
核对，通道变化单列为 `context_route_changes`，不宣称路由偏好全部不变。

尚未解决任意 Python 表达式、动态 tuple 配置、一般调用结果的符号展开和实际尺寸验证。
新增说明会增加部分图的高度与线长；一张详图仍有额外交叉，不能宣称视觉效果全面改善。
完整架构收敛仍未完成。原始源码投影另验 3371 节点、3663 边全部 ID 可见且 IR 不变，
不代表数千节点完整 SVG 路由或浏览器性能已验证。本轮没有新的编辑器导入导出试验；
摘要展开、保存状态重渲染和事实保留由测试覆盖。

## 复现

```sh
mkdir -p /tmp/archcanvas-transform-operands-before-68d4a32
git archive 68d4a32 semantic_studio | tar -x -C /tmp/archcanvas-transform-operands-before-68d4a32 --strip-components=1
python3 tools/extract_transform_operands.py
node tools/audit_transform_operands.cjs
node tools/audit_transform_operands.cjs --case=Transformer-panel-0
node tools/audit_transform_operands.cjs --case=Transformer-panel-1
node tools/audit_transform_operands.cjs --case=Transformer-panel-2
python3 tools/check_transform_operands.py
python3 tools/build_transform_operands_review.py
node tools/audit_source_expandability.cjs verification/helper-contracts/current/Transformer-current.json verification/transform-operands/current/source-expandability.json
python3 tools/run_local_tests.py
python3 tools/finalize_transform_operands.py
```

浏览器审核实际打开 `all-review.html`，读取文字边界与 DOM 路径、文字和分叉标记，
保存 `browser-report.json` 和实际截图；不能由 CLI 生成替代测量。
正式数字、生产哈希及审核产物哈希由 `completion-report.json` 绑定。

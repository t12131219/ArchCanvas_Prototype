# 源码字面量变换配置

本轮在通用角色画布的折叠摘要中补出已被源码明确写出的变换参数，例如
`#1 permute(0, 2, 1)`、`#3 flatten(1, 2)`。序号对应摘要中原始操作的顺序，
并非可见节点编号。摘要仍可展开，原始操作、操作数绑定、条件和未知边界继续保留。
这是局部信息表达的改进；整体架构与专用参考的收敛尚未完成。

规则实现为 `semantic_studio/transform-configurations.js`。选择依据是调用语法、
标准化算子、输入端口和证据范围，不读取模型名、案例 ID、源码 SHA 或专用坐标。
Transformer 仅作为一个对照案例。陌生轴变换、未知调用两侧的独立片段和状态接口旁的
普通变换同样可以使用该能力。

## 证据与边界

当前支持 `transpose/permute/view/reshape/flatten/squeeze/unsqueeze/expand` 的
整数位置参数或受支持的关键字参数。要求调用 AST 与抽取参数值一致；负整数直接解码
AST 字面量，不执行源码。方法调用使用真实 `receiver` 端口，函数调用使用真实
`arg:0` 端口，避免把以 `torch` 调用开头的链式表达式误当函数参数约定。

节点及其祖先必须是静态源码证据，不能跨越条件、控制、未知、可变、运行实例或身份
边界。必须只有一个正常源码输入，配置不能依赖其他输入边。动态轴、变量、算术表达式、
额外配置依赖及被篡改后与语法不一致的参数，均不产生配置说明。

说明只声称“源码以这些字面量调用了这个操作”，不证明张量秩、有效形状、轴语义、
值等价、分头含义或执行成功。内置元组/列表语法解码并不等于已支持抽取器生成的元组
操作数节点；这种输入目前会保留原图，不解析为配置说明。条件节点内的变换不标注，
条件外可以独立证明的变换仍可标注。

## 展示策略

仅在 `paperMedium: 'canvas'`、`paperGranularity: 'roles'` 时默认启用，
可用 `paperTransformConfigurations: false` 关闭。打印与其他粒度不受影响。
说明附着到实际操作、折叠的局部路径或角色路径阶段上，工具提示记录规范操作 ID、
原始语法槽和证据范围。文字参与尺寸测量，不压缩字号来容纳新增内容。

该步骤位于逻辑前沿和阶段选择之后，不改变规范 IR、前沿选择、边描述、操作数绑定、
逐节点去向或表达目标；不因添加一行说明而增加原子表达目标的覆盖信用。
展开模块的标题区域继续允许连线穿过；真实节点与无关模块主体仍为障碍。

## 正式对照与取舍

基线为提交 `79f905f` 的实际渲染器。大图沿用同份静态源码 IR：3371 节点、3663 条边，
输入 SHA256 为 `b1848176e4dc66c7cf4add5656684e5cc686a97532e39fe3e0d51eafff2315cb`。
主图和两张详图使用相同的前沿请求。新增参数说明需要额外空间：

| 状态 | 新增配置 | 尺寸：之前 → 当前 | 各边线长之和：之前 → 当前 | 交叉：之前 → 当前 |
|---|---:|---|---|---|
| Transformer 主图 | 12 | 1968×3076 → 1968×3134 | 34049.7 → 34604.1 | 10 → 11 |
| 详图 1 | 5 | 1404×2454 → 1404×2490 | 15292.3 → 15378.3 | 3 → 3 |
| 详图 2 | 8 | 1710×3012 → 1710×3064 | 24172.2 → 24374.2 | 9 → 9 |
| AxisPatch 折叠 | 2 | 300×422 → 300×454 | 48 → 48 | 0 → 0 |
| ExtentPatch 折叠 | 2 | 508×430 → 508×462 | 544.3 → 576.3 | 0 → 0 |
| KeywordPatch 折叠 | 2 | 300×362 → 300×410 | 32 → 32 | 0 → 0 |
| DynamicPatch | 0 | 不变 | 不变 | 0 → 0 |
| InterruptedPatch 折叠 | 3 | 300×504 → 300×540 | 64 → 64 | 0 → 0 |
| StatefulPatch 折叠 | 1 | 606×791 → 606×801 | 1706.3 → 1726.3 | 0 → 0 |

主图仍是 65 节点、70 条边。主图和两张详图的直接表达覆盖数分别保持 21、25、37，
这些数不能相加当作去重覆盖量。主图高度约增 1.9%、线长约增 1.6%、增加一处交叉，
因此本轮不能称为布局紧凑度改善。未产生配置说明的正式案例保持 SVG 字节不变。

## 验证产物

- 完整回归：79 组、890 项通过。六项新增测试覆盖字面量、参数污染、受限祖先、
  未知/状态边界、名称独立、保存渲染和展开。两项历史 SVG 对照显式关闭新增说明，
  保持历史内容策略；标题避让选项不隐式控制这项新内容。
- 正式 SVG：45 个状态的前后对照，共 90 张。包含既有混合场景、七份新源码程序的
  折叠/展开状态，以及 Transformer 主图和两张详图。
- 独立检查从真实 Python 源码的精确 AST 范围恢复字面量，校验源码哈希、说明文字、
  参数槽、规范边、前沿和表达目标；从实际 SVG 重算几何和路径。模块标题允许穿越。
- 浏览器测量 90 张内联 SVG：1336 节点、2244 个节点文字元素、46 个端口标签，
  零文字溢出。使用原生 `getBoundingClientRect()`，容差折算为一个 SVG 单位；
  浏览器 API 未提供 `getBBox()`，不声称使用了该方法。
- 实际编辑器通过文件选择器导入 AxisPatch，设置角色画布，导出摘要和展开状态，
  保存后重开摘要。两种 SVG 均与保存状态的正式渲染逐字节一致，重开摘要也逐字节一致。
  该交互仅验证小图。
- 全源码投影保留 3371 个规范节点和 3663 条边及原始 IR；未验证完整源码 SVG 的
  路由表现或浏览器性能。

产物位于 `verification/transform-configurations/current/`：`review.html` 提供新案例
和主图局部，`transformer-review.html` 提供完整主图、详图及专用参考，
`independent-checks.json`、`browser-report.json`、`ui-report.json` 和
`completion-report.json` 分别记录独立几何/语义检查、浏览器测量、编辑器验证和最终绑定。
截图为 `review.png`、`transformer-review.png`、`ui-review.png`。

复核命令（大图渲染较慢，应等每项终止后再改生产代码）：

```sh
mkdir -p /tmp/archcanvas-transform-config-before-79f905f
git archive 79f905f semantic_studio | tar -x -C /tmp/archcanvas-transform-config-before-79f905f --strip-components=1
python3 tools/extract_transform_configurations.py
node tools/audit_transform_configurations.cjs
node tools/audit_transform_configurations.cjs --case=Transformer-panel-0
node tools/audit_transform_configurations.cjs --case=Transformer-panel-1
node tools/audit_transform_configurations.cjs --case=Transformer-panel-2
python3 tools/check_transform_configurations.py
python3 tools/build_transform_configurations_review.py
python3 tools/run_local_tests.py
node tools/audit_transform_configurations_ui.cjs
python3 tools/finalize_transform_configurations.py
```

浏览器测量和编辑器导出需要通过实际浏览器重新采集；CLI 不伪造这些交互证据。
完成报告的 `goal_complete` 继续为 `false`。

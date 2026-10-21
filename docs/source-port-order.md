# 按实际转弯位置排列输出端口

同一图元的两条输出线可能在不同距离离开图元。若端口排列与转弯顺序不相容，
较早转弯的线会穿过另一条线的起始段；只重布远处路径不能消除这个局部冲突。
本轮从清晰架构图中提取的通用能力，是按实际几何调整这两个既有端口的位置。
不依赖 Transformer、模型/类名、源码 SHA、案例 ID 或专用坐标。

`architecture-layout.js` 的 `sourcePortSwaps` 只提议确实相交的输出起始段。
支持上下左右四种出线方向，要求同一闭合、非循环、非圆形图元的同一侧有两个不同
几何端点，各自先向外再转弯。交换两个端点的切向坐标，同时修改首次转弯处的坐标；
第一次横向/纵向转弯之后的所有弯点、消费端点、节点尺寸和位置均保持原样。
产生零长度首个转弯的候选直接排除。

这不合并值，也不要求两条边表达同一值。不同结果槽和不同消费端口保留各自的身份。
若一条展示边包含多个普通依赖，原有 bundle、每个成员、canonical 端点、操作数槽
及计数标签全部保留；任一成员有条件、状态、迭代、旁路或上下文通道属性时不提议。
未知消费端保持真实端点，不据此解释未知计算。反馈和既有语义通道继续使用原策略。

`publication-renderer.js` 的 `prepareSourcePortOrder` 在最终压缩之后、同源共享通道
之前测量，每图最多八对候选，不递归搜索端口排列。只在实际交叉严格减少且线长不增加
时接受；宽高、字号、路由失败、标签、不同值重合和无关接触不得退化。既有已应用约束、
已实现关系及直接表达目标必须保留。节点、IR、语义前沿、边属性和原始绑定不变。
拒绝的候选使用独立几何缓存和约束记录，不修改基线。

沿用真实路由器的障碍政策：展开模块标题允许穿过，实际节点和无关模块主体仍需避让。
原有标签位置固定，并检查被修改的起始段。打印、手动偏移、超过 128 条可见边、
已有路由/标签失败以及已完成共享通道的状态跳过此步骤。
`paperSourcePortOrder:false` 可以关闭。它不与标题避让开关绑定。

## 正式验证

基线是提交 `5827b36` 的真实渲染器。小案例分别使用隔离的旧渲染器和当前渲染器。
三张大图的旧图来自该提交的实际捕获，读取前验证生产脚本、输入、状态和文件哈希。
同一静态 Transformer IR 有 3371 个节点、3663 条边，正式主图保持中间语义折叠前沿。
四个旋转案例是受控几何测试，不冒充源程序。真实源码案例另外核对物理源文件 SHA。

| 状态 | 交叉：本轮前 → 当前 | 线长：本轮前 → 当前 | 尺寸变化 |
|---|---:|---:|---|
| Transformer 主图 | 11 → 10 | 34604.1 → 34604.1 | 不变，1968×3134 |
| Transformer 详图 1 | 3 → 3 | 15378.3 → 15378.3 | 不变，1404×2490 |
| Transformer 详图 2 | 9 → 9 | 24374.2 → 24374.2 | 不变，1710×3064 |
| 陌生长汇合图 | 2 → 1 | 6155.2 → 6137.2 | 不变 |
| 含未知节点的汇合图 | 3 → 2 | 4751.2 → 4751.2 | 不变 |
| 真实 SharedColumns 源程序 | 1 → 0 | 918 → 918 | 不变 |
| 上下左右四个受控几何图 | 各 1 → 0 | 各自不变 | 不变 |

主图仅交换同一输入图元的两个输出几何端点，保留原先的 bundle 成员。
仍为 65 节点、70 条边，新增的十二处源码配置说明不丢失。
主图与两张详图的直接表达覆盖仍为 21、25、37；不把三个数相加当成去重覆盖。
这修复了上一轮新增说明后出现的一处交叉，但不能证明整体模块组织已达到专用参考。

独立检查读取每张实际 SVG，验证正交路径、交叉/接触/重合、真实节点和无关模块主体
障碍、源码哈希、文字、几何端口所在边界、端口集合及所有成员绑定。每个被修改的源端点
必须恰好是另一条原边的源端点；远处路径和所有消费端点必须不变。IR、架构、前沿、
逐节点/逐边去向、约束和表达目标均与基线比较。上轮源码字面量配置也继续从实际 AST
独立核验。

审核首次发现旋转测试图的原始连线穿过另一个节点，已修正测试图的节点位置并重新生成
全部正式对照；没有放宽主体障碍检查。六组历史测试受新步骤影响：三组旧 SVG 字节快照、
三组较早路由阶段的固定坐标/交叉数检查。它们显式关闭新步骤以继续验证各自的历史合同；
新默认组合由本轮专项测试和正式 SVG 对照覆盖。

浏览器复查还发现左右旋转样例的未知节点说明文字越界，修改前后均存在。
已增加这两个受控测试框的宽度，并固定接收侧边界，保留所有消费端点；重新捕获和回归。
最终 80 组、897 项测试通过。浏览器实际读取 98 张 SVG，共 1368 个节点、2308 个
节点文字元素和 46 个端口标签，以 1 个原始 SVG 单位为容差，未发现文字越界。
四个受控几何案例只验证几何和绑定，不计为源码语义覆盖。

## 复现与证据范围

```sh
mkdir -p /tmp/archcanvas-source-port-before-5827b36
git archive 5827b36 semantic_studio | tar -x -C /tmp/archcanvas-source-port-before-5827b36 --strip-components=1
node tools/audit_source_port_order.cjs
node tools/audit_source_port_order.cjs --case=Transformer-panel-0
node tools/audit_source_port_order.cjs --case=Transformer-panel-1
node tools/audit_source_port_order.cjs --case=Transformer-panel-2
python3 tools/check_source_port_order.py
python3 tools/build_source_port_review.py
node tools/audit_source_expandability.cjs verification/helper-contracts/current/Transformer-current.json verification/source-port-order/current/source-expandability.json
python3 tools/run_local_tests.py
python3 tools/finalize_source_port_order.py
```

正式 SVG、独立报告、浏览器测量和截图保存在 `verification/source-port-order/current/`。
`review.html` 给出局部和陌生图对照；`transformer-review.html` 给出完整主图、两张详图及
单独标注的专用参考；`all-review.html` 包含全部 98 张正式 SVG。
浏览器检查须实际读取这些页面的渲染文字、路径和分叉标记，不由 CLI 伪造。

最终测试数和浏览器实测结果由 `completion-report.json` 绑定。
源码投影检查仍恢复全部 3371 节点、3663 边与规范 ID；没有执行完整源码 SVG 路由或
数千节点浏览器性能验证。本轮没有新增编辑器文件导入导出试验；保存状态重渲染和
折叠恢复由测试验证。整体目标保持进行中。

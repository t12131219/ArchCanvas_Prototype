# 已证明模块实参的消费者摘要

通用画布现在区分“传入一个模块对象”和“执行一个模块”。已由源码构造绑定证明的模块引用，在消费者折叠时可以写进消费者的可见说明，例如 `Module arg transform: GELU()`；消费者展开后，恢复原来的引用节点、命名输入接口和精确绑定边。即使 helper 根本没有调用这个实参，也只展示传入事实，不生成计算。

这是一种通用语义折叠方式，不使用模型名、类名、参数名、案例 ID、源码哈希或专用坐标。Transformer 只是同源比较输入。已存在的运算认证、原始 IR、源码归属、模块身份和构造配置保持独立。

## 证据与边界

`semantic_studio/module-arguments.js` 使用既有 `source-module-binding/1` 与 `source-symbolic-value/1` 证据。读取、身份引用、框架类型、构造来源和输入槽必须一致。只接受无入边、单一用途的静态模块读取，且该用途是同一源码范围内向真实 helper 输入接口的直接 `interface-binding`。构造实参须为可简洁展示的字面配置。

共享读取、消费者外对同一模块对象的调用或引用、条件、未知构造、运行观测、状态修改、身份显示、循环和跨源码边界均保留原有表达。消费者内部调用传入模块是合法的，但不能由“实参存在”推断它一定执行。固定重复祖先不妨碍其中一次具体调用的独立说明；本规则不跨实例合并对象，也不解释动态重复。

规则在逻辑展开前沿选定后执行，因此减少图元不会自动花掉预算去展开其他区域。默认用于 canvas/roles 的非关系详图；`paperModuleArguments:false` 可关闭。打印、其他粒度和独立关系面板保持各自策略。

闭合消费者持有可检查的 `module_arguments` 说明；canonical 引用和绑定边计入 `attached`，主要展示去向明确映射到该消费者。附注类型为 `module-reference-argument`，不会冒充标量配置。说明保存模块身份、完整构造配置、源码构造证据和原始边。继续展开时不再附注，原始实参接口也不会被别名压缩吞掉。更细的运算、来源与源码视图仍可继续访问。

## 正式 SVG 与自省

基线为 `2213a19`，冻结实现、输入和当前代码哈希均记录在 `verification/module-arguments/current`。比较保持相同输入、状态及逻辑展开前沿；本轮没有新增联合图组规划尝试。

| 图 | 图元 / 边：前 → 后 | 交叉：前 → 后 | 线长：前 → 后 | 尺寸：前 → 后 |
|---|---|---|---|---|
| SuppliedCurve | 5/3 → 4/2 | 0 → 0 | 255 → 56 | 482×372 → 300×378 |
| UnusedCurve | 5/3 → 4/2 | 0 → 0 | 255 → 56 | 482×372 → 300×378 |
| MixedSuppliers | 25/22 → 23/21 | 2 → 2 | 8421.2 → 8153.2 | 912×1542 不变 |
| Transformer 主图 | 68/79 → 65/76 | 20 → 16 | 41665 → 39767.7 | 1968×3361 → 1968×3412 |
| 第一张所选详图 | 43/47 → 44/48 | 3 → 3 | 16987.3 → 17126.3 | 1404×2784 不变 |
| 第二张所选详图 | 66/65 → 64/63 | 8 → 9 | 24751.6 → 26180.2 | 1710×3300 → 1710×3180 |

主图的三个模块引用成为真实消费者的实参说明，交叉减少 4 个，线长减少约 4.6%；可见文字的高度代价为 51px。第一张详图多出的接口和边，是此前被压缩的实参绑定恢复。第二张详图虽然缩短 120px，但增加一个交叉且线长约增加 5.8%。不能把结果描述为所有图的几何都改善。

目视检查还发现：删除实参旁支后，布局的行序选择改变了部分并列角色的左右排列。每条线仍绑定真实消费槽，三路角色同行关系保留，但不同实例之间的视觉顺序一致性尚未达到参考图。下一步应改进通用的消费槽顺序与对应关系约束，不能在生产代码中写死 Q/K/V 或 Transformer 的位置。

三个负例 SharedCurve、GuardedCurve、UnprovedCurve 的 SVG 与冻结基线逐字一致。MixedSuppliers 保留共享引用、条件未知调用和 GRU；减少的额外外框由既有 source-owner 规则转为来源附注，不是删除来源身份。图组三张图的直接表达目标保持 **74 → 74**，原有目标没有丢失。原始 IR 中的构造、条件及状态事实也完整保留。

## 验证与复现

完整本地检查为 **66 组、767 项通过**，包括 8 项新测试。测试覆盖未调用实参、构造证据篡改、输入槽、共享直接调用、固定重复与动态循环边界、陌生混合组合、展开/保存/收回及其他媒体。

独立审核检查 21 张正式 SVG 的源码重抽取、模块引用身份、原始绑定、主要展示去向、可见说明文字、全量 accounting、已有角色阶段、正交路径、终端、节点侵入和表达目标。4 类故意破坏的实参说明或投影被拒绝。原生浏览器测量 889 个文字元素和 42 个端口标签，没有越界。

实际编辑器完成 4 → 7 → 4 图元的双击展开、保存重开和单击 minus 收回；初始/收回、展开/重开的 SVG 分别逐字一致。混合模型实际导出为 23/21；切换原始源码并展开全部，导出 57 节点/51 边及全部 canonical ID。实际 Transformer 主图导出为 65/76，与正式 SVG 逐字一致。总计 6 张语义 UI SVG 经独立检查。

大输入的原始源码投影另行恢复 3371 节点/3663 边，所有 canonical ID 保留。该检查没有执行数千节点整张 SVG 路由或浏览器性能测试。整体专用参考的语义/视觉收敛仍未完成，阅读方向、角色顺序、分组和长上下文路径仍需继续优化。

```sh
python3 tools/extract_module_arguments.py
node tools/audit_module_arguments.cjs
node tools/audit_module_arguments.cjs --large
python3 tools/check_module_arguments.py
python3 tools/build_module_arguments_review.py
python3 tools/run_local_tests.py
node tools/audit_source_expandability.cjs verification/helper-contracts/current/Transformer-current.json verification/module-arguments/current/source-expandability.json
```

实际浏览器中的导入、导出、保存、重开、展开、收回和原生文字测量须重新捕获，再运行 `node tools/audit_module_arguments_ui.cjs` 和 `python3 tools/check_module_arguments_ui.py`。完整 `.layout.json` 和重复的主图 UI 保存负载仅保留在本地，可按上述流程重建；紧凑报告、SVG、源码样例和截图入库。

[主图比较](../verification/module-arguments/current/main-review.html)、[陌生 helper 的摘要与展开](../verification/module-arguments/current/SuppliedCurve-review.html)、[专用参考对照](../verification/module-arguments/current/transformer-review.html)提供审核入口。

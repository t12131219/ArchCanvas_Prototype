# 通用原生画布：纵向数据流与悬浮证据恢复

日期：2026-10-25。本轮接续未提交的原生迁移、配色及规则布局改动；不重置早前工作，不执行 push。按用户本轮截图，优先恢复模块内纵向数据流阅读，不继续使用上一轮的局部横排与蛇形折行。

## 几何规则

`yworks_edge_router_lab/generic-semantic.js` 为所有目录模型、导入 IR、自定义组合及源码原子编辑调用同一布局器，关闭原生适配器的 `localPathRows` 和 `foldSerial`。普通依赖继续按 DAG 层次排列，串行主干居中，真正并行的操作数路径仍并列。`paperDirection` 决定向上或向下；标题保持在框顶。

保留已认证模块等宽、调用固定参数带、独立输入区域、输出侧对齐、真实源码归属和实际标题文字障碍。共享布局器的横排选项仍可供旧画布使用，本轮没有改变其默认行为。没有模型名、案例 ID、标签模式或专用坐标参与生产选择。

Transformer 的 FFN 恢复 input projection → activation → dropout → output projection 的纵向关系；Add & Norm 恢复 dropout → add → normalization。源代码实际存在的 dropout 没有为接近专用图而删除。Attention 的 Q/K/V 等并行依赖仍并列，下游操作沿数据方向排列；F1 中已保留的语义摘要仍可继续展开。

## 悬浮信息

旧 `publication-renderer.js` 的完整 `nodeTitle` 格式提取至纯模块 `semantic_studio/semantic-evidence.js`，两个入口共用，原格式保持。新 `nodeDetails` 补充源码文件及行号、源码表达式、证据状态、未知原因和条件、身份、迭代信息。原有的局部 path/tree/DAG、精确操作数绑定、配置、参数读取、调用边界、正常返回范围、认证角色、源码归属和“未断言”范围仍保留。

原生 `app.js` 采用单组委托事件：停留 260ms 后按需生成，用不可变语义对象的 WeakMap 缓存；不在建图时为数千节点预生成提示。拖动、缩放、后台事务和切面变化关闭提示。透明命中层不再截断证据信息。单击后重现提示使用实际选中节点，不通过坐标重新猜测所属节点；无外框的逻辑根标题不作为悬浮命中目标。提示通过 `textContent` 渲染；原始源码中的 HTML 字符不会执行。提示为摘要窗口，完整文字可在节点检查器的“完整证据与路径过程”查看。

浏览器 HTML、两个 worker 和隔离 renderer 加载器都补齐共享模块依赖，旧编辑入口也纳入兼容检查。首次回归暴露旧隔离加载器缺失依赖，失败日志保存在 `verification/native-vertical-evidence/loader-check-regression*`；修复后重新运行正式回归。

## 文档与回退

原生 renderer 更新至 `native-semantic/8`，保存格式仍为 `archcanvas-native-semantic/1`。renderer 1–7 的旧坐标及布局缓存进入迁移来源记录，完整 IR、语义状态和 authoring 继续保留，使用当前布局重建。当前版本的布局保存、重开、撤销和返回切面保持兼容。

改动前的 tracked 工作树由 HEAD 与本轮前的完整 dirty diff 重建，连同未跟踪适配器、控件、测试和审核器保存在 `/tmp/archcanvas-vertical-evidence-20261025/snapshot`。恢复时还需移除本轮新增 `semantic_studio/semantic-evidence.js`，详见该目录 README；不用 Git reset。

## 审核结果

正式证据目录：`verification/native-vertical-evidence/current/`。测试和捕获期间冻结生产源码、测试及捕获器；报告保存对应哈希。

相对 `native-regular-layout/current/route-audit.json` 的同一切面：

| 状态 | 可见节点/边 | 图幅：前 → 后 | 路径总长：前 → 后 | 交叉：前 → 后 |
| --- | --- | --- | --- | --- |
| Transformer F0 | 30/37 | 1076×1292 → 900×1648 | 12424 → 13045 | 12 → 9 |
| Transformer F1 | 82/80 | 1602×3014 → 1602×3718 | 36147 → 40955 | 15 → 12 |

本轮增强了方向一致性并减少该案例交叉，同时增加高度和线长；不能表述为整体紧凑度全面改善。没有将专用图的省略步骤、造型或坐标硬编码进通用事实层。

定向测试覆盖真实串行上下顺序、模块居中、并行分支、条件／控制／环反例、完整源码恢复、证据与路径内容、特殊字符、版本 7 迁移。正式审核覆盖 43 模型×F0/F1，共 86 状态，逐节点读取证据并检查源码、布局、实际路线约束。最终完整回归 107 组、1179 项全部通过；完整回归和跨模型审核的冻结哈希均与当前源码一致，详见 acceptance-report.json。

浏览器使用 CUA，核对 Transformer 普通节点与摘要依赖树提示、另一个模型的原子编辑态提示、153 个可见文字的节点内边界、旧编辑入口。`detail-dom.svg` 为实际 DOM 捕获；`detail.svg` 仅移除编辑器命中与控制图层并补充导出背景和线条样式，`vertical-modules.svg/png` 是同一实际 SVG 的局部裁切。图面捕获不是另造的语义输入。

完整 IR 仍为 3371 节点/3663 依赖；定向测试继续验证完全展开和返回。全量原子画布本轮未重新作数千节点的交互性能基准。

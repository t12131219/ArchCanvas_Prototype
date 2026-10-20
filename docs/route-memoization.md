# 通用路由重复计算优化

本轮将路由器内部的重复计算缓存纳入正式实现。它服务所有可见图，不使用模型名、案例 ID、证书角色名、源码哈希或参考图坐标选择路径。目标是降低语义展开和候选比较的计算成本；它本身不增加语义认证，也不改变主图应选择哪些细节。

同一条路由调用内，障碍、已有线段和拥挤策略固定。因此可以复用候选路径分数，以及方向状态重复访问的相邻网格线段的障碍与拥挤结果。已有线段的范围也只需规范化一次。缓存随当前调用和网格结束而释放，不跨边、不同布局试验或用户操作复用。原有线段遍历顺序、浮点代价累加顺序、端口、堆顺序、转弯代价和搜索次数上限保持一致。

## 实际证据

4 项新回归覆盖 932 次路线对照，包括小数坐标、多操作数、不同路由顺序、变化的已有线段、拥挤/接触策略、循环反馈、圆形端点、嵌套外框和上下文通道。完整测试共 543 项通过。

另外对 10 个真实抽取案例固定可见状态，执行完整路由策略和修复搜索，导出前后各一张实际 SVG。20 张 SVG 通过独立 XML、路线、终端、操作数、图元尺寸及交叉计数审核；每组 SVG、图文档、路线和质量指标完全相同。该实验最初遗漏表达覆盖记录，独立审核发现后已补充真实计算并重新生成，未通过的中间导出不作为最终证据。

浏览器分别为两种实现创建独立 Worker，交替先后顺序，每种先预热一次，再测量三次。当前实际中位数为：

| 固定可见状态 | 原路由 | 当前路由 | 加速 |
|---|---:|---:|---:|
| BoundedWeave | 57.2 ms | 36.5 ms | 1.57× |
| MixedBoundary | 68.5 ms | 37.2 ms | 1.84× |
| ConditionalWeave | 184.6 ms | 78.6 ms | 2.35× |
| SameSource | 37.0 ms | 20.1 ms | 1.84× |
| UnknownFusion | 17.6 ms | 10.1 ms | 1.74× |
| BoundedWeave 整组试验 | 57.0 ms | 35.3 ms | 1.61× |
| Transformer 角色前沿 | 5173.3 ms | 1058.1 ms | 4.89× |
| ConditionalCarry | 342.9 ms | 117.5 ms | 2.92× |
| SharedMismatch | 229.5 ms | 94.1 ms | 2.44× |
| BrokenCell | 1.7 ms | 1.5 ms | 1.13× |

所有预热与测量输出均核对实际 SVG 和路线摘要，浏览器结果也与 CLI 实际 SVG 一致。计时包含路由策略与修复搜索，不含静态分析、可见前沿投影、外层布局候选、自适应规划或 DOM 绘制。机器负载与 JIT 会影响数值；CLI 的隔离 VM 成本和浏览器不同，不能拿 CLI 的倍率代替浏览器收益。CPU 采样与原始压缩 profile 一并保存，采样对象是独立 BoundedWeave 进程，不是仍在运行的完整 Transformer 对照。

正式自适应语义状态重新导出并审核了 20 张 SVG；另有两张语义 UI SVG、全部 144 节点/145 边的源码 UI 状态和原生文字检查。实际编辑器重新加载当前代码后，走通 `28 → 保存重开28 → 保留一条25 → 收回13 → 最细源码144 → 重开28`，返回 SVG 与原状态和当前 CLI 逐字节一致。26 个原生面板的 1269 处节点文字和 11 处边标签没有越界。

## 尚未完成

原完整 Transformer 自动对照仍使用会话 51885。安装新路由器时四个预期输出均尚不存在；冻结的 before 渲染不变，命令在写完 before 后才加载当前渲染器。安装时点与源码摘要记录在 `verification/route-memoization/experiment/install-record.json`。结果产生后仍须核对实际加载来源、语义选择、几何与专用参考；固定前沿的加速不能替代这项验收。

本轮没有证明整个自动规划具有同样加速，也没有证明数千节点完全展开后的路由或交互性能。原有细节过多导致的长图、数组角色标题“0”、长上下文路线、整体语义粒度规划，以及更广的未见状态/路由/影响组合仍需继续改善。

## 复现

```sh
python tools/run_local_tests.py
node tools/benchmark_route_memoization.cjs --large
node tools/audit_adaptive_role_paths.cjs --small
python tools/audit_role_path_receipts.py verification/adaptive-role-paths/current
python tools/check_adaptive_role_path_svgs.py
node tools/audit_adaptive_role_path_ui.cjs
python tools/check_helper_contract_ui_svgs.py verification/adaptive-role-paths/current
python tools/build_adaptive_role_path_review.py
python tools/check_route_memoization.py
python tools/summarize_route_memoization.py
python tools/summarize_publication_checks.py
```

浏览器对照由 `verification/route-memoization/experiment/browser-benchmark.html` 的实际按钮执行，并保存真实页面记录；CLI 不伪造浏览器测量、UI 导出或原生文字检查。重新生成 kernel 报告后必须重新测量浏览器，使记录引用同一份报告。最后的整体汇总退出码 2 表示证据一致但完整目标尚未完成。

# 展开区域出口与后续节点对齐

当一个区域展开为内部计算后，外部的后续节点仍可能贴在父框左侧，导致输出连线横穿整图。本轮让已有后续节点尝试跟随真实来源出口，形成更连续的阅读路径。

这是通用的几何候选：不读取模型名、案例 ID、源码哈希或专用坐标。未知操作仍可显式处在对齐路径上，规则不解释其内部行为。多个来源区域、条件、状态或控制连接、循环、手动偏移和障碍会限制候选。纵向层级、包含关系、节点身份、操作数、语义前沿和原始 IR 均不变。

候选会重新测量和路由。只有交叉或线长改善，且面积、字号、路由失败、无关接触、不同值重叠、标签和已实现关系没有退化时，才替换原图。`paperRegionFollowers:false` 关闭此步骤；`true` 仍需通过测量，不是强制接受。当前只应用于可缩放画布的角色状态，至多 128 条可见边。这个限制是候选计算预算，不代表数千节点原始事实被删除。

## 实际结果

| 案例 | 交叉前后 | 线长前后 | 选择 |
|---|---|---|---|
| Transformer 固定角色状态 | 48 → 47 | 50203.5 → 49186.5 | 接受；80 节点、91 边、2166 × 3656 不变 |
| ExitChain 陌生串联后续节点 | 0 → 0 | 1877 → 1544 | 接受 |
| UnknownFollower 未解析后续节点 | 0 → 0 | 1836 → 1516 | 接受；未知边界保留 |
| TwoSources 多来源输出 | 1 → 1 | 2092 → 2092 | 无候选；保留 DAG 布局 |
| GuardedInputs 实际候选 | 4 → 4 | 6244 → 6282 | 拒绝；生产 SVG 保留原图 |

审核基线为提交 `b80d556`。Transformer 基线复用该提交生产脚本的已审核输出，并检查脚本哈希、输入和状态，其他基线在隔离环境生成。

49 个测试命令共 614 项通过，其中新增 9 项回归。31 张正式 SVG 和一张实际拒绝候选经过独立路径、线长、交叉、边界、原始槽位和几何变更检查。浏览器原生文字审核覆盖上述 32 张 SVG 加 3 张真实 UI 导出，共 35 张，无文字越界。

真实编辑器执行导入、保存、重开、折叠、切到源码全部展开和恢复，节点数为 15 / 15 / 10 / 15 / 15。重开与恢复的 SVG 与初始导出字节一致；源码导出的 15 节点、12 条边及实际路由逐一核对。

原始 Transformer 源码投影的 3371 节点、3663 条边全部可见，IR 未改变。这只验证事实保留与投影完整性，不验证大图 SVG 路由或浏览器性能。论文视图的局部展开和源码证据视图是不同表达；当前目标是找到接近专用图的中间语义状态，并继续允许查看更细事实。

## 复核

```sh
python3 tools/run_local_tests.py
python3 tools/freeze_region_followers.py
node tools/audit_region_followers.cjs
node tools/audit_region_followers_rejection.cjs
python3 tools/build_region_followers_review.py
node tools/audit_region_followers_ui.cjs
python3 tools/check_region_followers.py
python3 tools/summarize_publication_checks.py
```

测试报告和命名日志保存在 `verification/region-followers/current`。大体积 `*.layout.json` 本地生成并忽略，跨机器复核需先生成。UI 和原生文字审核需在真实浏览器执行，脚本不会伪造浏览器记录；`audit_region_followers_ui.cjs` 只核对实际导出文件。

对照页为 `verification/region-followers/current/review.html`。整体验收仍未完成，汇总门禁有意以状态 2 返回，并记录 `goal_complete:false`。剩余范围包括专用参考的语义与视觉接近、摘要与细节及图组的联合规划、数千节点 SVG/UI 性能，以及更广的未见状态、条件、路由与副作用组合。本轮没有重新运行当前版本的完整自适应 Transformer 选择。

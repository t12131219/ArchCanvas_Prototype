# 通用主图的局部粒度一致性

本阶段修复自动展开中的一个主图组织问题：同一预算范围内，相近的局部展示区域可能仅因源码遍历顺序而一处展开、另一处折叠。现在这些区域共同决定默认展开；手工或明确关系请求仍可独立展开其中一处。

这是一项展示选择规则。它不证明两个计算相同，不合并调用、张量、参数或对象身份，也不替代局部语义认证。生产规则不读取模型名、案例 ID、源码哈希或专用坐标。

## 选择方式与边界

仅在可缩放画布的自动 `roles` 状态下，对已有 presentation-only 局部区域比较直接可见子项的 kind、semantic type、operator、framework type 和子项数。这些字段形成相近的展示开销轮廓；相同轮廓不构成结构或行为等价证明。

属于同一预算范围、当前已进入待展开队列的相近区域，共用一次节点预算决策。预算足够则各自展开；不足则各自保持折叠。不要求整图采用同一深度，也不会扩展到尚未暴露的区域。临时拓扑分块不参与这一比较。

区域内部包含未知、条件、可变操作、观测记录、对象身份、重复或迭代边界时，不参与共同决策；带条件、迭代、状态写入等受保护边的范围同样排除。复合语义契约、角色路径和局部关系的明确展开请求保持独立。

`publication.coherent_frontier` 记录逻辑前沿选择的范围、各区域、展示轮廓、预算、增量及接受/暂缓结果。选择发生在路径摘要和认证阶段的展示降级之前。后续准确的源码切边、端口映射和逐对象 accounting 仍单独验证。

可以通过 `paperCoherentFrontier:false` 对照之前的预算策略；`paperAuto:false`、打印以及其他预设不受本规则影响。

## 实际主图结果

证据目录：`verification/coherent-frontiers/current/`。基线固定为 Git `65e75389392428a548775dcb78b3e01cb388f2f9`，其生产脚本逐字节保存并与 Git 比较，旧渲染器在独立 VM 中加载。

| 相同输入与预算 | 之前 → 当前图元数 | 结果 |
|---|---:|---|
| CoherentMosaic，预算 6 | 10 → 7 | 两处局部结构共同折叠 |
| CoherentMosaic，预算 8 | 13 → 13 | 两处各自展开，SVG 相同 |
| BrokenMosaic | 15 → 12 | 相近区域同级表达，未知邻接保持可见 |
| ConditionalMosaic | 16 → 13 | 条件范围和结果选择保持原有可见性 |
| UnequalMosaic | 10 → 10 | 不同轮廓独立选择，SVG 相同 |
| ForeignComposition / BranchMosaic / LoopWithBoundary / SharedBranches | 不变 | 四张主图均与基线 SVG 相同 |
| Transformer 概览 | 16 → 16 | SVG 相同 |
| Transformer 固定 roles 主图 | 86 → 80 | 两处顶部区域采用同级细节 |

Transformer 固定主图尺寸从 **2230×3776** 降到 **2166×3656 px**。之前两处 position 外框分别高 638、368 px，现在均高 368 px；两个重复区域的起点由 y=1036 / 766 变为 y=766 / 766。32 个已暴露角色的证书、角色路径和具体节点保持一致。

这不是所有指标同时改善：Transformer 交叉数从 **47 增到 48**；ConditionalMosaic 从 3 增到 5。独立检查未发现路由失败、未放置标签、无关接触或异值共线路径。折叠同时暂缓了部分直接 join、source-use 和 computation 细节目标；报告将其如实记为未满足，没有把摘要计成已经展开的计算。后续需要把语义目标、主图与详图、实际路由成本联合选择。

## 展开与完整性

实际编辑器验证了 **7 主图 → 单处展开 10 → 保存重开 10 → 自动收回 7**。两处调用身份仍独立，四次实际 SVG 导出与 CLI 渲染一致；重开及返回的 SVG 逐字节恢复。

重新检查最细源码投影：3371 个节点、3663 条边、全部 canonical ID 可恢复，原始 IR 不变。该检查不执行完整 SVG 路由，不能证明数千节点同时展开后的浏览器性能。

本阶段有 **579 项测试通过**，包括 10 项新回归；25 张正式 SVG 的 XML、路径交叉、边界及 accounting 已审计。浏览器测量了 873 段节点文字、68 段边标签，边界失败为 0。实际目视图见 `browser-review.png`、`transformer-top-review.png` 和 `ui-open.png`。

## 复现

```sh
python3 tools/extract_coherent_frontiers.py
python3 tools/run_local_tests.py
node tools/audit_coherent_frontiers.cjs
python3 tools/check_coherent_frontiers.py
python3 tools/build_coherent_frontiers_review.py
node tools/audit_coherent_frontiers_ui.cjs
python3 tools/summarize_publication_checks.py
```

界面导出和原生文字测量使用真实浏览器操作；UI 审计脚本仅核对已导出的可见内容，不驱动隐藏应用状态。复现时需重新执行对应界面操作和文字测量，并将实际测试报告与日志复制到阶段目录。布局 JSON 为可重新生成的本地大文件。

## 未完成项

这是通用中间语义状态的一项主图组织改善，尚未完成专用参考的全面语义和视觉收敛、主图与详图联合选择、更广的未见状态/控制/路由/副作用组合以及数千节点 SVG 性能验证。

完整默认自适应对照现已完成，见[独立审核记录](adaptive-comparison.md)。原 session 51885 在保存冻结基线后以 143 终止，续跑当前版本的 session 5446 已成功退出；启动、输入、生产脚本及输出哈希均已核对。完整计算得到的最终 SVG 与固定策略主图逐字节一致，额外候选均未采用，当前计算耗时 421.722 秒。该比较审核已经完成，但不能据此宣称默认规划性能或专用参考收敛已经达标。汇总器仍以退出码 2 表示完整目标开放。

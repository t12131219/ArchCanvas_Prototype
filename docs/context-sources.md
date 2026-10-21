# 跨区依赖：按实际几何选择源端口

本阶段让已经存在的跨区侧入口依赖，尝试从朝向接收区域的源端口出线。规则只读取可见包含关系、区域位置和原有数据边，不读取模型名、案例 ID、源码哈希或专用坐标。节点位置、语义前沿、输入输出及每次使用的操作数槽保持一致；条件依赖、祖先边界、状态回送和旁路继续使用已有策略。未知来源保留未知边界，改线不推断其内部行为。

在现有布局上只比较一次完整路由候选。只有总线长或交叉改善，并且不增加面积、线长、交叉、无关接触、不同值的路径重合、标签缺失、路由失败、约束冲突，也不丢失已实现关系时才采用。用户位置偏移和显式选项优先。`paperContextSourceFacing:false` 禁用自动选择，`true` 用于诊断强制候选。

| 对照 | 之前 | 当前 | 结论 |
|---|---|---|---|
| 陌生双区域、两次独立使用 | 1 交叉，线长 1909 | 0 交叉，线长 1849 | 两个操作数及物理端口均保留 |
| 来源为未知调用 | 1 交叉，线长 1857 | 0 交叉，线长 1797 | 未知调用仍显式可见 |
| Transformer 角色状态 | 48 交叉，线长 50262.5 | 48 交叉，线长 50203.5 | 小幅改线；尺寸仍为 2166×3656 |

平衡区域、条件输入，以及已有 ForeignComposition、BranchMosaic、LoopWithBoundary、SharedBranches、GuardedInputs、StatefulInputs、UnknownInputs 对照保持原 SVG。Transformer 仍为 80 个图元、91 条边，不能把这次 59 个 SVG 单位的线长变化称为整体视觉收敛。

另用 LateInputs 实测了一个线长从 8561.3 降到 8555 的候选：它丢失了一条此前已实现的上下文通道，因此拒绝采用，最终 SVG 与基线逐字节相同。对应两张保留结果另行通过实际路径审核；候选通道损失来自路由器记录，不把该记录冒充已独立审核的候选 SVG。

基线来自提交 `2426ab3` 的实际脚本，比较时隔离加载，冻结文件哈希写入报告。Transformer 基线复用上一阶段同输入、同请求、同生产实现的已完成 SVG，并保留原文件身份。本阶段没有重跑完整默认自适应计算；此前完成的自适应结果保持历史证据，不能证明当前版本的完整默认延迟或输出。

605 项测试通过，新增 8 项。25 张正式 SVG 的实际路径独立核对了线长、交叉、物理端口、原始绑定、切边及摘要；比较前后节点位置、原始 IR、角色、参数值和 accounting 相同。真实编辑器完成 `14 → 保存重开14 → 折叠11 → 最细源码14 → 恢复14`；重开、恢复及 CLI SVG 逐字节一致，最细源码的全部节点和实际路由另行核对。28 个原生浏览器面板包含 999 处节点文字，无边界越界。浏览器缩放后的整图字号不在此结论范围内。

Transformer 的最细源码投影重新确认 3371 节点、3663 边及全部身份完整恢复。这不执行该数千节点全图的 SVG 路由或交互性能测试。

复现顺序：

```sh
python3 tools/freeze_context_sources.py
node tools/audit_context_sources.cjs
python3 tools/run_local_tests.py
node tools/audit_source_expandability.cjs verification/helper-contracts/current/Transformer-current.json verification/context-sources/current/source-expandability.json
```

将本轮实际测试报告和日志复制到阶段目录，在真实编辑器中导入 `ui-import.json`，保存重开、折叠、源码展开和恢复并导出对应状态。之后执行：

```sh
node tools/audit_context_sources_rejection.cjs
node tools/audit_context_sources_ui.cjs
python3 tools/check_context_sources.py
python3 tools/build_context_sources_review.py
python3 tools/summarize_publication_checks.py
```

还需用浏览器检查 `review.html`，在 `text-qa.html` 上执行保存的只读原生文字探针，保存实际截图与页面身份。汇总退出码 2 表示阶段证据一致且完整目标尚未完成。大型布局文档留在本地并被 Git 忽略，可用工具重建。

下一步应继续改进容器与跨区通道的联合组织、局部摘要及细节选择，并扩大状态、动态路由和影响边界的未见组合验收。当前结果只是可组合的通用几何能力，未完成专用参考对齐。

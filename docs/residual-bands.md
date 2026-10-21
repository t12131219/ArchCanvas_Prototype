# 最终布局压缩安全的窄空白带

本轮学习的通用版式经验是：已有计算关系不需要重新排列，也可以通过清理布局留下的空白，提高架构图的纵向密度。规则不检查模型名、类名、案例 ID、源码哈希或专用坐标；展开模块标题继续允许连线穿过。

此前公共空白带压缩只移除至少 16px 的空白。常见 28px 节点间距，在两端各保留 8px 保护距离后，只剩 12px 可删除，因而一直保留。本轮在走线、端口整理和完整标题重排之后增加最终压缩，允许移除至少 1px 的安全空白。1px 指可删除空白的最小长度，并非剩余节点间距：例如 28px 间距压缩后仍为 16px。

`prepareResidualBands` 复用同一个有保护的全局单调映射。每个节点、路径点、标签和容器边界使用相同的纵坐标映射，不重新布线，不重新选择可见前沿。实际计算节点、标题、水平线段、端口、标签、外框底边仍各保留 8px 保护；显式 rank/entry 间距仍保留。只有实际面积、图高和线长改善，同时事实、直接目标、已执行约束、字号、交叉和接触检查均满足既有要求时，才接受候选。`diagnostics.routing.residual_band_compaction` 保存完整记录。

手动位置、显式标签间距、旧标题避让、打印及资源限制继续跳过。`paperResidualBands:false` 单独关闭本轮步骤；`paperEmptyBandCompaction:false` 关闭两轮公共空白带压缩。

## 让自适应选择使用真实的最终几何

初次完整回归发现，最终压缩会让旧的自适应选择记录落后于序列化 SVG 的尺寸。因此抽出 `prepareFinalGeometry`，让画布基线及每个自适应候选在比较前都执行既有的最终端口整理、外框处理、路由、标题重排和本轮压缩；选中后不重复执行。打印仍保持原有选择顺序。

候选及质量阈值没有放宽。MixedBoundary 的已知局部完整角色展开现在通过实际面积门槛，因此从此前的部分路径改为完整角色细节。独立 SVG 检查得到直接目标 14 → 23，原有目标与未知边界全部保留。这是自动前沿选择的真实变化，不能称为相同可见图的纯几何改善。BoundedWeave 的完整展开仍被拒绝，仍能选择部分角色路径；UncertifiedWeave 没有凭空获得认证细节。

既有 `measured-frontiers` 七项测试保持默认行为并全部通过，逐个重放候选及逐轮基线。若干专门检查较早步骤固定坐标的测试显式关闭最终空白带步骤，以隔离各自的映射；新的专项测试与独立 SVG 审核检查默认组合结果。MixedPaths 的折叠现在略微减少面积，但线长增加，仍因原有路由成本门槛被拒绝。

## 实际结果

基线冻结到 `0dcab92`。以下三张图使用同一份原始 IR、同一请求、相同可见节点和精确绑定：

| 视图 | 尺寸：本轮前 → 当前 | 交叉 | 线长：本轮前 → 当前 | 直接目标 |
| --- | --- | --- | --- | --- |
| Transformer 主图 | 1968×3224 → **1968×3076** | 10 → 10 | 34837.7 → **33745.7** | 21 → 21 |
| 详图 1 | 1404×2466 → **1404×2454** | 3 → 3 | 15340.3 → **15292.3** | 25 → 25 |
| 详图 2 | 1710×3180 → **1710×3012** | 9 → 9 | 24904.2 → **24172.2** | 37 → 37 |

主图高度减少约 4.6%，线长减少约 3.1%。以下是通用性证据，前四项为显式拓扑夹具，后三项来自本轮新增 Python 源码的静态抽取：

| 案例 | 尺寸：本轮前 → 当前 | 交叉 |
| --- | --- | --- |
| Reconvergence | 956×1226 → 956×1178 | 5 → 5 |
| UnknownReconvergence | 956×1794 → 956×1662 | 3 → 3 |
| ConditionalReconvergence | 716×1922 → 716×1802 | 1 → 1 |
| LongReconvergence | 956×1226 → 956×1152 | 2 → 2 |
| UnseenWorkshop | 716×868 → 716×820 | 0 → 0 |
| InterruptedWorkshop | 716×904 → 716×850 | 0 → 0 |
| ConditionalWorkshop | 606×1102 → 606×1066 | 1 → 1 |

共享、可变、残缺和混合源码也经过正式对照。GuardedColumns 没有可安全压缩的空白，结果保持不变。

## 验证与审核

完整回归为 **77 组、873 项通过**，新增 8 项专项测试。正式对照的 52 张 SVG 独立核对了真实形状、完整文字、路径、端口槽、条件、单调映射、实际主体障碍、保护距离、accounting 和直接表达目标。另外导出 17 张自动选择及重放 SVG，核对尺寸、线长、交叉、边界及目标保留。

浏览器审核覆盖同样的 69 张通用 SVG，共 1297 个形状、2260 个节点文字对象，在 1 CSS px 容差下没有发现节点文字越界。主图、详图和通用案例各有截图；专用图只作为参考，不混入通用审核计数。

最细源码投影仍为 **3371 节点、3663 边**，所有 canonical ID 可见，IR 未改。本轮没有验证数千节点完整 SVG 的路由/浏览器性能，也没有重新执行编辑器导入导出流程。小图保存恢复、折叠再展开和确定性重渲染由专项测试覆盖。

重复包含完整 canonical IR 的 `.layout.json` 按仓库惯例保留在本地、加入忽略规则，可用审核工具重建。`restore_residual_baselines.cjs` 会在基线文档缺失时用冻结实现重建，并核对已提交捕获的精确哈希。

审核页：`verification/residual-bands/current/review.html`，另有 `details-review.html`、`generic-review.html` 和包含所有候选的 `all-review.html`。实际指标、原始文件及生成代码哈希分别保存在报告中。

```sh
python3 tools/freeze_residual_bands.py
python3 tools/extract_residual_bands.py
node tools/restore_residual_baselines.cjs
node tools/audit_residual_bands.cjs
node tools/audit_residual_bands.cjs --large --case=Transformer-panel-0
node tools/audit_residual_bands.cjs --large --case=Transformer-panel-1
node tools/audit_residual_bands.cjs --large --case=Transformer-panel-2
node tools/audit_residual_frontiers.cjs
python3 tools/check_residual_bands.py
python3 tools/check_residual_frontiers.py
python3 tools/build_residual_bands_review.py
node tools/audit_source_expandability.cjs verification/helper-contracts/current/Transformer-current.json verification/residual-bands/current/source-expandability.json
python3 tools/run_local_tests.py
# 浏览器目视与 DOM 文字测量单独进行；不由以上 CLI 命令代替。
python3 tools/finalize_residual_bands.py
```

## 未采用的试验与剩余差距

此前的短计算链折行试验确实降低主图高度，但两行排列将交叉从 10 增至 11；单行排列变为 2270×2988、交叉 13。因而没有采用。只在短链布局时减小间距的另一次完整试算为 1968×3200、交叉 10，收益小于最终安全空白带压缩。这些是隔离试验，不计为正式通过的默认方案。

本轮改善纵向密度，并让自动选择依据最终几何兑现更多局部证据；尚未完成与专用图的全面收敛。当前仍存在通用主流程、跨模块上下文线路和局部容器组织与参考图的差距。后续仍需从真实依赖、来源、状态及端口角色中提取可组合的组织规则，在陌生和残缺模型上验证，继续保留更细的源码展开能力。

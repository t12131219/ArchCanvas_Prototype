# 用最终布局评估语义粒度候选

自适应展开之前按输入端口整理后的几何测量候选，随后才执行上下文来源路由和区域出口对齐。因此，选择记录和最终序列化 SVG 可能不是同一张几何图：通用分叉案例记录 1 处交叉而 SVG 实际为 0，完整 Transformer 自动运行记录 48 而实际为 47。

现在 `publication-renderer.js` 用同一个 `preparePresented` 路径处理基线与每个候选，完成已有端口整理、上下文路由、出口对齐后，再评估表达收益和画面成本。选择后不再重复执行这些几何调整。记录中的 `geometry_scope` 说明测量范围。选择算法、候选上限和语义契约没有在本阶段扩展。

这是所有符合条件的通用画布自动选择共同使用的路径，没有模型名称、案例 ID、源码哈希或参考坐标判断。

## 实际结果

| 案例 | 旧记录 / 旧实际交叉 | 新记录 / 新实际交叉 | 最终 SVG |
| --- | --- | --- | --- |
| CrossedBranches | 1 / 0 | 0 / 0 | 字节相同 |
| UnknownOutput | 1 / 0 | 0 / 0 | 字节相同 |
| Transformer 完整自动选择 | 48 / 47 | 47 / 47 | 字节相同 |

其余已审核组合的最终 SVG 也没有变化。本阶段没有产生视觉改进；它修复后续选择细化范围时依赖的测量一致性。

Transformer 新旧完整自动选择分别独立执行，旧实现冻结到 Git `83bdb82`。旧运行耗时 481.3 秒，新运行耗时 473.2 秒；机器负载未控制，不据此宣称加速。最终均为 80 图元 / 91 边、2166 × 3656、47 处交叉。三个更细候选因画面质量、资源预算或交叉成本被拒绝，其指标为生产过程记录；没有独立导出这三个大候选 SVG。

MixedWeave 的三个小候选另行生成实际 SVG，逐一重放最终几何，检查选中/未选中记录。最终保留两次展开，25 图元 / 25 边。一个符合安全条件的候选因相对收益未被选中，不能把“安全”误写成“必然选中”。

## 验证与产物

证据目录：`verification/measured-frontiers/current/`。621 项测试、50 条测试命令通过，其中新增 7 项测试覆盖最终测量、候选独立重放、逐轮基线、未知/条件边界、显式几何开关、手工/打印视图和保存恢复。

24 个正式 SVG 经过独立 XML、端口、原始事实、切边、逐对象 accounting、连线长度和交叉检查；3 个小候选包括在这些图中。浏览器原生字号审核另加入 4 张真实 UI SVG，共 28 张，1091 个节点文本、36 个端口文本，无文字越出图形边界。

真实编辑器执行导入、保存重开、折叠、源码全部展开和恢复，图元数为 15 / 15 / 10 / 15 / 15；另导入 MixedWeave 自动选择状态并实际导出，SVG 与 CLI 字节相同。最细 Transformer 源码投影保留 3371 节点 / 3663 边，IR 未变。此检查不验证数千节点 SVG 路由和浏览器性能。

```sh
python3 tools/freeze_measured_frontiers.py
node tools/run_measured_frontiers_baseline.cjs
python3 tools/run_local_tests.py
node tools/audit_measured_frontiers.cjs
node tools/audit_measured_frontiers.cjs --current-large
# --large 收集已完成的冻结基线与 current-large，不重跑完整图。
node tools/audit_measured_frontiers.cjs --large
node tools/audit_measured_frontiers_ui.cjs
python3 tools/check_measured_frontiers.py
python3 tools/build_measured_frontiers_review.py
python3 tools/summarize_publication_checks.py
```

基线复现脚本会验证并复用已完成的完整运行；没有结果时才启动渲染，遇到未结束记录要求先检查原进程。基线结果存入阶段的 `baseline-run.json`，文件哈希和冻结生产文件均核对。浏览器操作、原生文字测量和目视检查须另行完成，不能只运行 CLI 就声称完成 UI 审核。汇总命令在本阶段证据一致但整体目标尚未完成时退出 2。

## 自省与后续方向

目视对照仍能看到：通用图包含较多源码辅助框和显式调用绑定，长上下文连接集中到底部，左右阶段高度不一致产生大面积空白。专用图在模块层次、旁路和上下文组织上仍更清楚。仅修正选择记录不会缩小这些差距。

下一步应让摘要、角色细节及独立详图围绕共同表达目标进行选择，避免只有“继续打开某条路径”这一种候选。需要在通用陌生组合上证明真实收益，再检查 Transformer 参考对齐；不能通过放宽质量检查强行接受拥挤细节。全局联合规划、更广泛未见状态/条件/路由/影响混合结构，以及数千节点完整 SVG/UI 性能仍未完成。

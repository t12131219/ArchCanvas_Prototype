# 已认证局部角色的源码外框合并

在保留完整事实图的语义主图上，将已经展开的普通源码 helper 外框转为可检查的来源附注，使内部真实操作直接参与所属语义区域的布局。它服务于源码重构后的架构表达；不依据模型名称、案例 ID、哈希或专用坐标触发。

## 资格与测量

需要实际显示的本地已认证角色端点，且最近的认证拥有者可见并展开。源码 helper 本身不能承载边、独立契约、条件或运行身份。按 canonical IR 祖先重新计算成员与切边，另外检查展示后代；未知、可变、状态、条件、运行观测、重复与独立认证边界继续保留。

外框转为 `role-source` 附注，保留原始 ID、标签、源码表达、源码父节点、对象身份、角色证明、全部 canonical 成员和精确切边。此举不替代任何操作数、不合并对象，也不宣称 helper 纯净或等价。检查器可恢复源码外框，内部计算仍可继续展开。

渲染器在既有布局之后最多测量一个候选，仅用于 canvas 的 roles 状态、最多128条可见边。显式配置、源码外框视图及手动位置跳过自动试排。候选必须保留操作、完整边绑定、逻辑打开状态、边界、角色回执和已兑现关系，并使面积至少减少2%；宽、高、线长、交叉、无关接触、非同值重叠、字号及路由质量均不得退化。未满足时保留基线。`paperRoleSourceFrames` 是投影层选项；默认是否采用由渲染器实测决定。

## 本轮实际结果

所有对照从提交 `0a021f0` 的冻结实现生成，当前与基线分别路由。

| 陌生案例状态 | 图元/边：之前 → 当前 | 高度：之前 → 当前 | 交叉 |
|---|---|---|---|
| SeparateStages 主图 | 13/11 → 13/11 | 954 → 954 | 1 → 1 |
| 单条 scores 路径 | 20/18 → 19/18 | 1518 → 1430 | 1 → 1 |
| 整组角色 | 23/19 → 20/19 | 1772 → 1508 | 1 → 1 |
| SameSource 路径 | 17/17 → 17/17 | 1400 → 1400 | 2 → 2 |

单路径仅将 `pair_scores` 外框变为附注；整组角色移去三个 helper 外框，操作和连接保留。恢复源码外框模式显示21个图元、18条边；该模式也恢复既有其他来源外框，所以不等同于旧默认20图元。

实际界面导入并重开已保存文档，验证 `19 → 恢复源码外框21 → 合并19 → 展开全部39 → 撤销19 → 收回路径13 → 再次细化19`。导出与按保存 IR/状态重建的 CLI SVG 逐字节一致；恢复紧凑和收回主图分别恢复原 SVG。39图元是当前展示容器的进一步展开，不表示97个 canonical 节点全部显示。

静态抽取的 WrappedStages、UnknownStages、ConditionalStages 均保持原图。WrappedStages 暴露了真实语义缺口：当前 FFN 契约只统计直接计算子节点，不能认证跨普通激活 helper 的 Linear → activation → Linear。应补足证明后改善展示，不能靠外框规则绕过认证。未知及条件 helper 保留其真实边界。

Transformer 主图86/94、2230×3776、47交叉；固定配置单路径97/111、2230×5612、125交叉；三条核心路径99/114、2230×5896、128交叉，三者与基线 SVG 逐字节相同。它们没有符合本轮条件的新 helper 外框，本轮**没有改善 Transformer 的视觉效果**。完整语义对应、长跨域路径、源码包装、主图与细节联合规划和其他状态/控制/路由组合仍待优化。

520项测试通过。独立审核覆盖21张正式SVG和4种实际UI状态的SVG，核对实际路径、终端、原始操作数和来源切边。28张浏览器原生SVG测量1726段节点文字、63段边标签，未发现越界。目视对照确认陌生案例层级减少，但长来源连线、FFN helper认证和Transformer与专用图的差距仍存在。

另行原始投影检查恢复3371节点、3663边，全部 canonical ID 保留、IR不变。该检查未进行数千节点整图路由，不证明大图界面性能。当前同步渲染仍可能阻塞界面。总体目标保持进行中。

## 复现

```bash
python tools/extract_role_source_frames.py
python tools/run_local_tests.py
node tools/audit_role_source_frames.cjs
python tools/audit_role_source_frame_receipts.py
python tools/check_role_source_frame_svgs.py
node tools/audit_role_source_frame_ui.cjs
python tools/check_role_source_frame_ui_svgs.py
node tools/audit_source_expandability.cjs verification/symbolic-values/current/transformer-current.json verification/role-source-frames/current/source-expandability.json
python tools/build_role_source_frame_review.py
python tools/summarize_publication_checks.py
```

UI产物需通过真实按钮、导入、保存、重开与撤销生成；原生文字检查需浏览器实际测量。正式生成器中的主图可能耗时较长，观察超时不代表进程终止。汇总器校验实现与产物哈希，退出码2表示本轮证据一致、总体目标尚未完成。

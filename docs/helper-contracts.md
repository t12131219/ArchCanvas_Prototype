# 跨源码 helper 的局部计算链认证

## 折叠与展开的目标

原始事实图始终保留。语义图根据可证明的局部计算关系选择展示边界，而不是仅按源码父子层级减少节点。一个适合阅读的中间状态应尽量接近专用参考图的模块逻辑和视觉组织；在该状态下面仍能检查内部操作、源码包装、参数和调用证据，上面则可以继续收成概览。不同区域允许采用不同粒度。

专用图的充分展开状态是语义参照，不是通用图的细节上限。语义视图的“展开全部”仍受表达形式约束，不等于显示全部 canonical 节点。目前查看所有原始事实需要切换“源码层级”后展开。也不必先将数千节点全部渲染，再逐个收起；可以直接从完整 IR 生成目标展示投影。

当前 Transformer 的原始投影恢复3371个节点、3663条边，所有 canonical ID 保留。早期651节点的统计来自不同阶段的抽取结果，不能与当前展示图元数量直接对比。3371/3663是当前已抽取事实的规模，不代表已经恢复任意 Python 行为。该投影检查没有验证数千节点整图的 SVG 路由和浏览器性能；当前同步渲染仍可能阻塞界面。

## 本轮改进

之前 FFN 认证只统计直接子计算，将激活或投影提取为普通 helper 后会漏掉已经可以证明的计算链。本轮增加 `local_unary_chain`：从唯一源码输出沿实际操作数、精确结果槽和一对一接口绑定回溯，确认整个源码范围恰好构成同一条链。FFN 要求首尾是两个 Linear，中间具有激活，只允许已知 dropout/identity 包装。

操作的最近公共源码祖先决定认证拥有者，独立于语义或绘图父节点。整个链位于内部 core 时，外层包装继续保持源码身份。新增证据记录有序操作、输入结果槽、输出接口、每个 helper 的来源父节点、完整成员和精确切边；校验器重新推导这些证据，拒绝仅重新封印的伪造证明。

未知、条件、状态、可变操作、运行独有证据、重复、返回选择、额外输出和无关计算会阻止整段认证。同一 Linear 对象的两次调用保持独立调用身份，不宣称投影参数独立、helper 纯净或任意别名等价。规则不根据模型名称、案例 ID、源码哈希或专用坐标触发。

## 实际审核

基线为提交 `f61ed50` 的41个冻结实现文件。12份相同源码分别静态抽取，未执行模型；除了认证元数据和摘要，全部源码事实一致。

| 案例 | 认证：之前 → 当前 | 图元：之前 → 当前 | 高度：之前 → 当前 |
|---|---|---|---|
| WrappedChain | 0 → 1 | 7 → 6 | 624 → 552 |
| SplitChain | 0 → 1 | 9 → 6 | 800 → 552 |
| NestedChain | 0 → 1 | 4 → 7 | 366 → 640 |
| SharedChain | 0 → 1 | 7 → 6 | 644 → 572 |
| WrappedStages | 0 → 1 | 7 → 6 | 624 → 552 |

NestedChain 展示了更多真实阶段，因此增高；不能只按节点减少评价改善。五类受保护反例的 SVG 逐字节不变。共享对象标注保留两次不同调用。

实际 UI 验证 `语义6 → 保存重开6 → 恢复源码外框9 → 合并6 → 源码层级展开17 → 重开语义6`。原始状态显示全部17节点、12边；保存文档保留同一 IR，恢复语义状态的 SVG 逐字节一致。语义进一步展开的9图元不等于全部17个原始事实。

Transformer 的12个 FFN 认证保留。主图86/94、2230×3776、47交叉；固定单路径97/111、2230×5612、125交叉；固定三路径99/114、2230×5896、128交叉。三者节点、路径、标签和绑定几何不变，SVG 证据标题及 metadata 摘要改变。本轮没有改善 Transformer 视觉效果；与专用图仍存在明显组织差距。

533项测试通过。30张正式 SVG 核对实际路径、终端、原始绑定和来源；两个 UI 语义状态通过相同审核。原始 UI 另核对全部 canonical ID、节点坐标和正交路径，不将其冒充完整接触/终端审计。36个浏览器原生 SVG 测量1460段节点文字、60段边标签，无边界越界。已目视查看四张对照和真实 UI 截图：跨 helper 链更清晰，未知与条件边界仍在，Transformer 长跨域连线和与专用图的差距仍在。

总体目标尚未完成：还需改善通用主图与细节联合规划、语义对应和空间组织，扩大未见状态/控制/路由组合验收，并验证数千节点整图的可用性。

## 复现

```bash
python tools/extract_helper_contracts.py
python tools/run_local_tests.py
node tools/audit_helper_contracts.cjs
python tools/audit_helper_contract_receipts.py
python tools/check_helper_contract_svgs.py
node tools/audit_helper_contract_ui.cjs
python tools/check_helper_contract_ui_svgs.py
node tools/audit_source_expandability.cjs verification/helper-contracts/current/Transformer-current.json verification/helper-contracts/current/source-expandability.json
python tools/build_helper_contract_review.py
python tools/summarize_publication_checks.py
```

UI产物须由真实导入、按钮、保存和重开生成；原生文字检查须由浏览器实际测量。汇总器校验实现、基线、测试、来源和产物哈希；退出码2表示本轮证据一致、整体目标仍在进行中。

# 通用条件返回区域

本轮把既有条件区域、源码返回点及其共同本地输出接口组织为一个可折叠区域。它用于减少“条件框后再接一个条件返回输出框”的重复边界，不能根据模型名、案例 ID、源码哈希或专用坐标选择规则。

## 证据与边界

规则要求同一源码范围中的一个 if、2–8 个不同返回点、不同的聚合槽位和唯一共同输出接口。返回点必须具有唯一普通输入及唯一输出绑定，聚合接口需要有真实下游用途；模型对外的终端输出不收入这个局部区域。所有旧区域出口必须正好是这些返回绑定。

未知调用、状态与可变操作、重复或认证边界、共享或观测身份、runtime-only 证据、额外逃逸、外部条件及非普通依赖均阻止归组。折叠不改写 canonical IR、边或原始端口，也不释放展开预算去打开无关区域。

记录中的 `source_conditions` 只复制返回点源码祖先上的条件。`if gate: return a; return b` 中后一个返回点不会被自动标成 false；本轮没有证明路径可达性、实际执行选择或两个返回值相等。条件比较与返回区域同时归组时，条件比较记录使用最终边界，避免切边和成员过时。

## 展开行为与代价

关闭时显示 `Return alternatives / If <predicate> · N source returns`。打开区域先恢复条件、分支及本地汇合；继续打开分支恢复返回值和返回接口。归组后的返回点不再作为透明接口别名隐藏，因此默认已经展开的样例可能增加图元。这是保留具体返回点的代价，不能声称每种状态都减少节点。

`ReturnAlternatives` 在相同关闭状态下从15图元/14边变为14图元/13边，424×1332变为424×1206，交叉2→1；默认状态18→19图元，高度1518→1502。`PairedReturns` 和带直接比较的 `ComparedReturns` 关闭状态也各少一个边界。未知调用与状态写入样例、MixedWeave、ConditionalCarry 的实际 SVG 不变。

Transformer 主图87→86图元、97→94边，2002×3908→2066×3776，线长63569.6→62647.6，交叉56→55，无关接触保持0。三个当前可见条件返回边界被整理，其余候选仍折叠于别的范围。两个代表调用的共享外框在本轮几何候选审核中被拒绝，恢复源码外框，所以只净减少一个图元且宽度增加64px。最终图仍有大量长路径、来源外框和交叉，整体表达尚未接近专用参考的清晰程度。

## 复现与审核

```bash
python3 tools/extract_return_regions.py
node tests/return-regions.test.cjs
python3 tools/run_local_tests.py
node tools/audit_return_regions.cjs
python3 tools/audit_local_svg.py --return-regions
python3 tools/audit_role_detail_receipts.py --return-regions
python3 tools/build_return_region_review.py
python3 tools/render_return_region_review.py
node tools/verify_return_region_ui.cjs --render
node tools/verify_return_region_ui.cjs
python3 tools/summarize_return_regions.py
```

五个源码样例仅静态提取，不执行模型。25张实际SVG覆盖默认、关闭、继续展开、未知/状态反例和其他混合结构；另有1张真实UI导出的Transformer局部展开图。独立Python审核从canonical IR重算成员、返回槽、祖先条件及切边，核对真正SVG的摘要文字和可见性。完整回归496项通过。26张图的浏览器原生比例测量1198处节点文字及44处边标签，未发现边界越界。

实际UI验证通用样例14→19→21→保存重开21→14，Transformer为86→91→86。初始、展开和收回的实际SVG均与相应独立命令行结果一致，收回后的SVG与初始图逐字一致。`--render` 从实际UI保存的展开文档重建Transformer细节；没有该输入时需要先完成界面操作。汇总器返回2表示本轮证据一致、整体目标仍未完成。

`verification/return-regions/current/` 保存实际SVG、报告、浏览器导出和视觉对照。数千节点原始源码投影恢复检查与完整路由性能测试仍是不同检查，不能互相替代。

## 尚未完成的目标

本轮解决的是一类局部重复表达。主图与专用参考的完整语义对应、长路径和跨范围上下文组织、语义状态与局部详图的联合规划、更多未见状态/控制/路由组合，以及数千节点的响应式布局仍未完成。目标保持进行中。

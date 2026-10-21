# 固定源码调用的正常返回摘要

本轮优化的单位是「固定实参、局部条件返回、返回依赖切边」，不检查模型名、类名、案例 ID、源码哈希或参考图坐标。Transformer 是正式验收输入之一；普通张量计算、元组返回、默认参数与交换元组顺序的陌生案例使用同一套规则。

## 语义边界

抽取器原有的 `return_selection` 记录某次源码调用的正常返回点，`source_constant_input` 记录字面量或默认实参。本轮不修改展示输入的 canonical IR 或全局别名关系，也不把这些事实解释成运行覆盖证明。

复查时发现旧抽取器可能跳过未处理的 try/with/match/循环中的提前返回，再选择后续返回点。现在遇到这类返回会停止选择；生成器和异步函数也不获得普通张量调用的返回选择。扫描保持在当前函数内，嵌套生成器不会污染外层函数。展示层同时拒绝源码范围内的未解析语句/表达式，以防旧导入文件携带不完整的返回证明。新增 Python 回归覆盖这些情况；对 Transformer 和九份正式返回案例重新抽取后，输入 IR 与存量完全一致。

`presentation-regions.js::normalReturns` 在原有返回区域上检查：

- 一个直接布尔输入控制一个局部 if，输入、源码谓词、固定实参和 `return_selection.call_constants` 一致；输入没有其他定义。
- 两个具体返回点、共同输出接口、精确输出绑定及返回点槽位一致。返回点在聚合接口的槽位与元组内部操作数槽位分开保留。
- 真实分支绑定、源码祖先条件、返回选择和局部依赖可互相核对。选择 fallthrough 时还要求该次调用固定为 false、true 分支有返回且 false 源码体为空；不会给 canonical fallthrough 发明 false 条件。
- 从选定返回点反向追踪全部输入。选定元组返回时保留每个操作数的原始切边与槽位。
- 区域未被展开，也没有显式详情或聚焦请求；未知、可变状态、身份、循环及运行专属边界不被跨越。

合格的闭合候选显示 `Normal return / Other source path retained`。固定谓词仍是实际可见节点和控制线。其他返回路径的入边逐条附着到摘要，记录完整原始边、结果槽、条件与证明；生产者及其其他用途不会因此变成元数据。返回区域的所有 canonical 成员、返回点和外部输出依赖保留。

展开该区域会取消附着，恢复全部路径；保存后重渲染以及展开后重新折叠可恢复相同 SVG。普通源码细节和原始 source 投影不使用这种摘要来替代真实计算。

## 语义成立后仍审核几何

初版无条件应用时，`FixedPair` 的物理连线数未减少，交叉从 0 增至 1，线长从 2016 增至 2106。该候选已存档为 `rejected-pair.svg`，未作为正式结果采用。

现在渲染器至多增加一次完整的对照测量。只有以下项目同时通过才采用摘要：逻辑展开前沿一致；保留的 canonical 用途、操作数与条件一致；原有直接表达目标和已实现关系保留；宽高、线长、交叉、接触、重叠、字号与质量问题没有退化；至少一个实际几何指标改善。否则保留原来的源码返回表达，并在 `diagnostics.routing.normal_return_refinement` 记录拒绝。

这是当前可见视图的整体候选审核，尚未逐个返回区域组合搜索。额外的完整测量也增加渲染工作量；本轮未作交互延迟优化。`paperNormalReturns:false` 可显式关闭该候选。

## 正式结果

冻结基线为 `445a201`，使用真实旧实现和相同请求重新渲染。

| 图 | 节点：旧 → 新 | 连线：旧 → 新 | 交叉：旧 → 新 | 线长：旧 → 新 |
|---|---:|---:|---:|---:|
| Transformer 主图 | 65 → 65 | 76 → 70 | 12 → 12 | 37341.7 → 35507.7 |
| 第一张详图 | 44 → 44 | 48 → 48 | 3 → 3 | 15340.3 → 15340.3 |
| 第二张详图 | 64 → 64 | 63 → 63 | 9 → 9 | 24976.2 → 24976.2 |
| FixedReturn / DefaultReturn | 14 → 14 | 13 → 11 | 1 → 0 | 2113 → 1341 |
| FixedTuple | 14 → 14 | 13 → 12 | 1 → 0 | 2109 → 2027 |
| FixedPair（候选拒绝） | 14 → 14 | 12 → 12 | 0 → 0 | 2016 → 2016 |

主图三个可见摘要共收起六条其他源码返回路径的入边。线长减少 4.91%，高度从 3342.5 降至 3278；宽度仍为 1968。主图 21 项直接表达目标保留，两张聚焦详图的结果保持相同。动态参数、入口默认参数、重绑定、未知调用和状态写入案例均未获得这种正常返回摘要。

全量本地测试为 72 组、824 项通过，其中新增 8 项正常返回测试和 2 项 Python 控制流回归。`test-report.json` 记录实际命令、日志和受检文件哈希。独立 Python 审核重算了 26 个状态的 52 张正式 SVG，并额外检查拒绝候选；审核没有依赖 JS 的语义覆盖结论。切边、绑定、条件、实际正交路径、真实障碍、端口、accounting 与原有直接目标均通过；五种证明或附着记录篡改均被拒绝。正式结果没有新增交叉、接触或重叠，也没有真实节点/无关模块内部侵入。

原生浏览器检查了审核页的 8 张内嵌 SVG、214 个节点，文字未超出节点边界；`review-browser.png` 为实际画面。没有进行编辑器文件导入导出的新一轮 UI 检查，保存与展开恢复由渲染测试覆盖。

原始 source 投影仍恢复 **3371 个节点、3663 条边及全部 canonical ID**，输入 IR 未变。这项检查没有重新路由数千节点的完整 SVG，也没有测量其浏览器性能。

审核页：`/verification/normal-returns/current/review.html`。通用主图仍有较大的源码容器、上下文通道及调用实例证据，与专用参考的整体视觉组织仍有差距；本轮只完成局部语义与布线改善，完整目标保持进行中。

## 复现

```bash
python3 tools/extract_normal_returns.py
python3 tools/check_normal_return_extraction.py
python3 tools/freeze_normal_returns.py
node tools/audit_normal_returns.cjs
node tools/audit_normal_returns.cjs --large
python3 tools/check_normal_returns.py
python3 tools/build_normal_return_review.py
python3 tools/run_local_tests.py
node tools/audit_source_expandability.cjs verification/helper-contracts/current/Transformer-current.json verification/normal-returns/current/source-expandability.json
```

拒绝候选来自加入几何审核前的已保存试验，不会由正式渲染命令重新采用；其 SVG 与布局文档哈希单独记录在 `rejected-pair.json`。重新生成截图需打开审核页，截图本身不由 HTML 构建脚本伪造。

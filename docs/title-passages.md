# 展开模块的标题区域允许连线穿过

本轮按用户要求，将展开模块的标题区域从默认路由障碍中移除。规则由几何包含关系和展开状态决定，不检查模型名、类名、案例 ID、源码哈希或 Transformer 专用坐标。`Multi-head attention`、`attention` 只是本轮可见示例。

## 障碍范围

- 起终点所属的展开祖先：标题不再强制避让，允许直接进入内部。
- 无关的展开模块：顶部标题带允许穿过，内部区域仍是障碍。
- 实际计算节点、折叠模块、未知节点及放在标题区的固定参数节点：仍保留障碍。
- 边的操作数、端口槽、条件、状态及来源绑定不因标题政策改变。

可显式设置 `paperProtectFrameTitles:true` 恢复此前标题避让；布局层对应 `protectFrameTitles:true`。导出文档在 `layout.frame_title_routing` 记录 `pass-through` 或 `avoid`。历史字节快照测试显式使用旧政策；新增测试直接验证默认通行、真实障碍和保存重渲染。

允许穿过是取消强制障碍，不要求每条线都经过标题，也不把穿过模块标题解释成新的数据连接。取消障碍后，贪心布线及后续几何候选的接受结果可能改变，不能据此保证所有图的交叉数单调下降。

## 正式对照结果

基线为已提交的 `723ab94`。小案例使用冻结的真实旧实现重新渲染；Transformer 使用该提交中实际选择的三张 SVG 及相同展示状态，再调用实际图组规划器进行最多两次细化尝试。

| 图 | 节点数：旧 → 当前 | 交叉：旧 → 当前 | 线长：旧 → 当前 |
|---|---:|---:|---:|
| SameSource | 17 → 17 | 2 → 0 | 4933 → 2917 |
| MixedWeave | 29 → 29 | 0 → 0 | 7748.7 → 5968.7 |
| InterruptedMixer | 29 → 29 | 0 → 0 | 5279.3 → 4362 |
| BraidedInputs | 56 → 68 | 14 → 13 | 26087.6 → 24463.3 |
| GuardedInputs | 17 → 17 | 4 → 3 | 6244 → 5052.5 |
| UnknownInputs | 12 → 12 | 0 → 0 | 1751 → 1522 |
| StatefulInputs | 15 → 15 | 1 → 1 | 5192.9 → 4838.3 |
| Transformer 主图 | 73 → 73 | 27 → 35 | 52937.9 → 46513.6 |
| Transformer 第一张详图 | 43 → 43 | 4 → 19 | 17675 → 25808.8 |
| Transformer 第二张详图 | 66 → 66 | 18 → 16 | 33610.2 → 28038.5 |

SameSource 的线长减少约 41%，浏览器截图确认标题附近的绕行消失。BraidedInputs 的自适应前沿因新的实际几何代价而展开更多细节，直接表达目标从 44 增至 54；不能把它描述为相同可见图的纯布线改善。独立审核逐项比较展开前后共同的 canonical 用途、操作数、条件与绑定，并确认原有用途和直接目标保留。

Transformer 主图及第一张详图的交叉数出现退化，第一张详图的线长也增加。该详图的一个输入停靠候选虽有 4 个交叉，但未保留此前已实现的上下文通道，因而被拒绝；不能仅因交叉减少就接受它。后续需改进通用候选的路径选择与约束兼容，仍遵守标题可通行的默认规则。当前三张图组的 74 项直接表达目标全部保留，两个新细化尝试因交叉代价被拒绝，没有扩大图组预算。

## 验证与复现

完整本地检查为 59 组、703 项通过，其中新增 6 项标题通行测试。`verification/local-relations/current/test-report.json` 记录实际命令及受检文件哈希。

`tools/check_title_passages.py` 对 22 张实际 SVG 独立核对正交路径、文档坐标、真实节点与无关模块内部侵入、端口操作数、条件、覆盖和 accounting，并把复制的 Transformer 基线哈希与 Git 提交核对。全部通过；相同前沿的记录保持严格相等，改变前沿的 BraidedInputs 单独核对逐条原始绑定和既有目标。原生浏览器测量 22 张 SVG 的节点文字与端口标签，未发现越界。截图只作为视觉证据，不替代以上检查。

```bash
python3 tools/freeze_title_passages.py
node tools/audit_title_passages.cjs
node tools/audit_title_passages.cjs --large
python3 tools/check_title_passages.py
python3 tools/build_title_passages_review.py
node tools/audit_source_expandability.cjs verification/helper-contracts/current/Transformer-current.json verification/title-passages/current/source-expandability.json
```

最后一项检查恢复 3371 个源码节点、3663 条边及全部 canonical ID，原始 IR 未改变。它没有执行数千节点整张 SVG 路由或验证浏览器性能。本次也没有进行编辑器导入、导出和重新打开操作；保存状态的确定性重渲染由测试覆盖。

当前对照页为 `/verification/title-passages/current/review.html`，截图案例为 `same-source-review.html`，与专用参考的对照为 `transformer-review.html`。此前 `selected-routes`、`exact-expression` 页面保留其历史结果。本轮是通用路由政策调整，尚未完成架构语义状态与专用参考的全面收敛。

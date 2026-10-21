# 对齐来源的物理端口排序

当多个相邻节点的中心恰好落在同一横坐标或纵坐标时，原有邻居排序最终按边 ID 分配端口。这可能把近端的两次使用分隔在远端使用的两侧，产生与计算逻辑无关的交织。本轮只细化这个几何平局：保留原主坐标顺序，在相同坐标内依次比较垂直方向的距离、对端身份和边 ID。不合并值、用途、条件或端口，不改变 canonical 操作数顺序，也不推断执行顺序。

规则不读取模型名、类名、案例 ID、源码哈希或专用参考坐标。展开模块标题仍可直接穿行；具体计算节点、固定实参及无关模块主体继续避让。

## 资格、试排与回退

最终跨区入口处理之后、空白横带压缩之前，从实际路由中找出同一节点同一侧的端口组。只有其当前物理顺序确实等于既有邻居顺序，且新排序会改变平局时才考虑。展开节点、循环节点，以及状态、控制、设计旁路、上下文和迭代等受保护通道不参与；普通条件数据边可物理调整，但每条条件和使用仍独立。

每张图最多尝试三个已有交叉的候选组，节点位置和大小固定。重算候选节点的 incident edges，并可使用已有路径微调。接纳要求交叉严格下降，线长、尺寸、接触、异值重叠、失败、标签、字号、已有约束、局部关系和直接表达均不退化。端点所在侧固定，只有所选节点所选侧的终端可移动，其余终端必须完全一致，终端不能重合。未通过的候选保留原图。

`paperCoincidentPorts:false` 关闭该阶段。打印、手工偏移、超过 128 条可见边及无交叉的图跳过。选中顺序保存在 `layout.coincident_ports`；逐次代价和拒绝理由所需事实保存在 `diagnostics.routing.coincident_port_refinement`。本轮没有新增语义折叠，原有局部展开能力保留。

## 正式对照

冻结基线 `e9e6b8a`，使用相同 IR、状态和节点几何。

| 案例 | 交叉 | 线长 | 几何 |
|---|---|---|---|
| Transformer 主图 | 15 → 12 | 38495.7 → 38405.7 | 65 图元 / 76 边，1968 × 3342.5，不变 |
| 第一张详图 | 3，不变 | 15340.3，不变 | 44 / 48，1404 × 2466，不变 |
| 第二张详图 | 9，不变 | 26180.2，不变 | 64 / 63，1710 × 3180，不变 |
| 真实 Python 源码 MixedChoices | 2 → 1 | 4245.5 → 4204.9 | 23 / 25，尺寸不变 |
| 合成 ForeignChoice | 1 → 0 | 608.7 → 584 | 4 / 4，268 × 452，不变 |
| 合成 EscapingChain | 2，不变 | 1553.9，不变 | 三次试排均拒绝，SVG 和路径与基线一致 |

主图接纳的三个组均为条件返回集合，条件和可选输出仍在。四个合成条件输入用于验证几何和事实保留，不能代替 Python 抽取证据。新增 ForeignReturn、UnknownReturn、NestedReturn 三个真实源码样例和 11 个已有源码/拓扑样例保持原样，不能称为新增视觉收益。`ForeignOpaque-before/current` 各有四处继承的无关线段接触，报告明确记录。

还试验了第三组跨来源角色行与输入端口联合重排；交叉或线长仍增加，全部拒绝。第三组仍为 key、value、query，未声称所有角色列已经统一。整体阅读方向、长上下文路径和 helper/返回细节密度与专用参考仍有差距，整体收敛目标未完成。

## 审核与复现

70 组、806 项测试通过，包括新增十项端口、条件、保护通道、身份、改名、资源限制、保存/折叠恢复及真实源码检查。测试报告的 197 份实现哈希已复核。独立审核读取 47 张实际 SVG，重新检查几何、物理端口顺序、canonical 绑定、条件、源码归属及已有约束；三张 Transformer 图合计保持全部 74 项直接表达目标。五种损坏（操作数槽、条件、物理终端、伪造物理顺序、伪造距离）均被拒绝。

浏览器原生 DOM 检查 1846 段节点文字、72 个端口标签，未越界。实际编辑器完成陌生合成案例 4 → 4（保存重开）→ 1（折叠）→ 4（恢复）；四张 SVG，加上主图和第一张详图，共六份实际导出均与正式产物逐字节相同，保存文档重绘也一致。已目视检查端口局部、陌生条件案例、真实源码汇合和专用参考。截图及 UI 审核报告在本轮审核目录。

源码投影仍恢复 3371 个节点、3663 条边及全部 canonical ID，IR 未改变。这不证明数千节点完整 SVG 路由、浏览器性能或任意预设一次“展开全部”即可显示全部事实；这些验证仍未完成。

```bash
python3 tools/freeze_coincident_ports.py
python3 tools/extract_coincident_ports.py
node tools/audit_coincident_ports.cjs
node tools/audit_coincident_ports.cjs --large
node tools/audit_coincident_extra.cjs
python3 tools/check_coincident_ports.py
python3 tools/build_coincident_ports_review.py
python3 tools/run_local_tests.py
node tools/audit_source_expandability.cjs verification/helper-contracts/current/Transformer-current.json verification/coincident-ports/current/source-expandability.json
python3 tools/check_coincident_ports_ui.py
```

`verification/coincident-ports/current/requests.json` 保存了正式请求，合成额外反例 IR 同目录保留。UI 检查依赖实际浏览器导出、文字测量和截图，不能用 CLI 文件冒充。正式总览为 `review.html`，局部交织对照为 `ports-review.html`，真实源码对照为 `source-review.html`，专用参考对照为 `transformer-review.html`。

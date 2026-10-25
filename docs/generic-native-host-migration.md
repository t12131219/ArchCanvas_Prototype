# 通用语义迁入原生递归编辑器

日期：2026-10-25。迁移起点：a3c57d4cf9c8904e3f24ad56076a28efa3ef2aa9。

## 目标与回滚

以 yworks_edge_router_lab/index.html 为共同画布主程序。原专用案例继续使用固定 authority 和 SummaryRecursive；通用模型保留自己的事实 IR 与语义切面，不转换为 Transformer 的 authority，不借用专用坐标或模型名。两种模型共用 SVG retained DOM、箭头、移动预览、后台提交、撤销、相机和路由器。

完整迁移前备份：/tmp/archcanvas-before-host-migration-20261025-183551/snapshot；manifest.json 记录起点提交与干净状态。回滚时先停止测试和服务、另存迁移后的工作，再从 snapshot 恢复文件；新增文件按 git diff/status 清单删除，不能覆盖其他后续工作。旧通用入口保留，便于对照和回滚；不主动 push。

## 源码链路与责任

1. semantic_adapter/sources.py、analyzer.py、construction.py 从 Python/Notebook 提取事实；schema.py、identity.py、structure.py、contracts.py 约束身份、结构对应、操作数和契约；probe/runtime_worker/merge/observations 只承认明确运行证据。此层与画布无关，原样复用。
2. semantic_studio/architecture.js、publication.js 及 role/sequence/path/contract/module/return 等投影模块构造可逆的展示层，保留 canonical_members、精确 cuts、accounting 和 provenance。SemanticEngine 是投影入口。
3. composition-layout.frontier/certifiedDetails 提供 F0/F1 和安全的进一步细化。F1 不是源码底层；fullyExpanded/projectCanonical 必须恢复所有原始节点与边。
4. AuthoringModel 负责组装、复制、分组、接口、槽位接线、源码替换、模块库及来源保存；/api/authoring/compile 和 certify 继续静态解析/局部复核，不执行任意源码。
5. 专用 app.js 管理画布与编辑事务；graph-engine.js、physical-ports.js、router.js、semantic-constraints.js 管理几何和合法连接；recursive-graph.js 仅处理原专用 authority。原路由是独立的教学复刻，没有 yFiles 运行库，不把几何推导当作语义认证。

## 保留、迁入与排除

| 功能 | 新主程序的处理 |
|---|---|
| 原始 IR、证据范围 source/runtime/merged、条件/状态/未知边界 | 完整迁入，原事实不因可见投影而删除 |
| 局部认证、重复身份、可逆摘要、F0/F1/返回、角色和路径继续展开 | 复用原投影模块，新增无旧画布几何的投影模式 |
| 所有模型目录、正式展示配置、原始 IR 导入 | 共用目录，不只接入 Transformer |
| 原子组装、模块/源码编辑、参数、分组复制、模块库、精确接线 | 使用 AuthoringModel，在原生画布旁提供编辑面板；不嵌入另一张旧画布 |
| 节点 SVG、标题/小字、箭头、移动预览/释放、相机、端口 | 采用原生画布机制；标题取认证后的短标题，完整说明进入检查器；小字同节点底色、淡灰 |
| 初始层级布局 | 可复用纯依赖 DAG/SCC 排序和层级测量算法，以新字形尺寸测量；不使用旧 publication-renderer、composition compose、旧路由或专用模板坐标 |
| 固定 SVG 的边界 gates | 专用案例保持原规则；通用图使用真实父层级定义允许穿越的边界顺序，物理位置可由路由器选择 |
| 打印图幅、物理字体门槛、图组分页、旧自动布局候选竞争 | 排除新画布运行链；旧入口与导入原文保留，不能声称这些输出已迁移 |
| 旧 canvasPlacement、offsets、旧视图样式 | 导入时保留在 migration.original 文档；不视为原生坐标，重新测量路由 |

## 数据边界

新增 generic-semantic.js：通用 IR/state → 语义投影 → 原生 nodes/edges。graph.generic 独立于 graph.recursive，保存完整 IR、state、authoring、投影凭据与迁移来源。节点 semantic 保存完整投影记录；binding 保存每条原始依赖、槽位、条件、bundle 成员和来源。几何端口与 canonical 槽位分离；拖动物理端口不能更改源码操作数。

新增无几何投影选项仅对新调用生效。可见/展开标志、摘要凭据和 accountings 仍生成；旧默认入口行为不变。新字形与布局不参与认证选择。语义校验必须从 IR/state 重算，不能信任导入文件自带 baseline。

通用边界规则：源端独有祖先按由内到外离开，目标端独有祖先按由外到内进入，共有祖先不允许额外离开再进入。允许穿越展开框标题的空白区域，文字实际包围盒仍是障碍。每次移动仍由原生引擎从手势前快照提交，不放松不相关节点障碍、端点方向和精确槽位。

## 保存与兼容

- 新文档 archcanvas-native-semantic/1 保存完整 IR/state/authoring 与独立原生几何，含版本与 renderer 标识。
- 接受 archcanvas-source-semantic/2、semantic-canvas/1、archcanvas-architecture-document/1、semantic-authoring/1；保留导入原文与旧几何，不执行或猜测来源。
- summary-merge-recursive/1 保持原专用行为；通用存储使用独立键，不覆盖专用草稿或旧通用浏览器状态。
- 导入原生文件时先重新生成语义/字形，只恢复经验证的原生位置、端口、路径及明确视觉草稿。失败时保留文档并报错，不静默丢弃。
- 新语义编辑撤销原子事务；视觉连接草稿和真实精确槽位编辑必须明确区分。源码替换继续检查所有已连接接口是否能恢复。

## 实施与验收顺序

1. 完成备份与架构文档。
2. 分离无几何语义投影，验证与原切面的节点、边、凭据一致。
3. 原生 adapter、字形、层级布局、通用边界校验和 worker 接入；旧专用分支不变。
4. 共用目录、F0/F1/源码底层、focus/证据、检查器、导入导出、编辑面板接入。
5. 普通模型和改名/破坏样本验证；检查原子 accounting、canonical slot、F1 向下展开和文档恢复。
6. 目录模型回归、原专用案例、原单元测试；生产/测试/捕获文件在运行期间冻结。
7. CUA 核对页面加载、展开、拖动、接线与保存。记录实际失败与性能限制，不能把旧审核结果算作本轮迁移结果。

## 审查问题

每一步确认：是否把几何当语义事实？是否有事实或编辑入口丢失？是否以 Transformer 特例代替通用规则？是否重用旧画布冒充迁移？是否在失败时留下半提交的图？是否覆盖旧保存状态？是否从有限测试推导出全部模型都已理想？

实施记录与实际验收结果在下方续写。

## 已实施的迁移

根入口现在转向原生主程序。侧栏合并 43 个通用模型与 3 个专用模型，带 `?case=` 的专用入口保持兼容，`?model=` 打开通用模型。没有将通用 IR 伪装成专用 authority，也没有 iframe 嵌入旧画布。新增 `generic-semantic.js` 处理数据边界、字形测量、原生图构建、语义验证、可逆导航和文档；`generic-controls.js` 提供语义与原子编辑入口。

`SemanticEngine.project(..., {semanticOnly:true})` 保留原节点、依赖、凭据与自动切面选择，跳过旧坐标/印刷候选。`composition-layout` 仅复用 frontier/certifiedDetails；原生画布不调用旧 compose 或 publication-renderer。初始化采用共享的纯层级 DAG/SCC 布局，所有路径由原生路由器处理。颜色和字形依节点结构类别选择，没有按模型名称分支。

原生物理端口可改变连接侧与比例，不改变 canonical 操作数。通用边界顺序从实际祖先关系计算，展开框仅实际标题文字为障碍。原生路由新增可选有界搜索、A*、先前路径空间索引、被完整障碍覆盖的冗余障碍剔除；仍执行最终完整约束校验。专用模型默认搜索配置保留。

导航与展开在 worker 中运行，保留取消/超时/失败恢复。前沿缓存按真实可见切面匹配，最多 4 份且约 6 MB；非常大的完整图可能不留在缓存中，返回时仍需重新构建。撤销快照共享不可变语义记录，独立复制几何与状态；源码编辑替换完整事实文档，不原地修改共享证据。

原子编辑已接入原 AuthoringModel：输入输出、参数/名称、复制删除、组合/模板、自定义库、参考构件与精确依赖恢复、精确槽位接线/重接、静态源码编译和完整模块替换。组合变更尝试调用原局部 certify 服务；不可用时保留未认证草稿并明确提示。绘图接线工具继续是视觉草稿，不能冒充真实语义编辑。旧打印尺寸、排版策略、分页图册及旧几何质量目标未迁入；原输出工具和旧画布仍可单独使用。

## 实际验收

- 全回归 107 组、1170 项通过，详见 `verification/native-host/current/regression/test-report.json`。随后局部源码导航修正保留当前 canonical open 集合，新增“局部图必须包含该模块全部已展开源码后代”的断言；并修复导航后未适配新图幅和重复主线程校验。最终相关 4 组、29 项测试重新通过（followup-report.json）。全回归未因这些局部修正重复运行，报告哈希保留原运行时点。
- 43 模型 × F0/F1 的 86 个状态完成原生审核，检查完整事实、归属、边界、障碍、连接与路径重叠；当前结果见 `verification/native-host/current/route-audit.json`。每次审核记录冻结源码哈希，生产/测试/捕获文件在运行期间不修改。
- 迁移测试覆盖新旧语义切面一致、全部 3371/3663 原始事实恢复、绑定/操作数/凭据破坏拒绝、文档往返与原子失败恢复、旧格式来源保留、真实原子编辑、改名、边界方向、待布线保存与继续处理，以及 canonical 局部/全图往返。
- CUA 实际验证包括 46 个侧栏案例、MLP F0/F1/全部 19/18/返回、视图编辑切换、源码模块静态解析、父模块移动与撤销、原专用 Transformer 打开、通用 Transformer F0/F1/完整源码/分批继续布线。小模型父模块释放提交一次约 35.8 ms，不代表大图移动性能。

当前原生 Transformer F0 为 30/37，F1 为 82/80。旧通用最终渲染器的 28/37、80/80 还包含几何展示组合；新主程序保留语义核心切面，未复制这些几何处理，不能把计数变化当作事实丢失或额外语义发现。原始 IR 始终为 3371/3663。

## 未完成的质量与性能目标

此轮是兼容迁移，尚未完成新画布的布局质量收敛。F1 实际初始原生布局约 2132 × 6639、总线长 78235、26 处交叉，明显比旧优化通用图更高、更长。完整源码图约 7469 × 107068，当前 DAG/层级测量规则还不适合直接观看数千原子。

完整图构建约 3.7–3.8 秒；最初原生全量求解在一分钟内仅处理约 800 条路径，无法作为交互式默认行为。因此可见节点超过 1000 时采用约 8 秒的布线批次，保留所有事实，将未处理路径明确标为 pendingRouting。实际整次浏览器提交（含结构化传输、验证、渲染）约 16.4 秒；一次观测为 3501 条待布线、3 条已尝试但无效路径。点击“继续布线”后待处理降为 3323，仍不表示全图完成。预算按路径之间检查，单条复杂搜索可能超出批次目标，不是严格的最坏耗时保证。

待布线路径不通过逐边几何认证，红色显示并能保存；全图 layout.ok 仅表示节点及已处理路径的布局检查，不代表全部连接有效。路径长度/折点/交叉指标排除 pending 路径，不能解释为完整 3663 条边的最终指标。有无效连接的完整图移动可能被整体合法性检查拒绝；应进入局部模块检查和编辑。尚未验证全部路线最终都能求解，也未证明大图任意拖动流畅。

原生文档先重新验证语义/节点/尺寸/归属再恢复布局。显式视觉草稿或无效路径允许保留并显示失败，不宣称导入后所有路径都合法。旧浏览器文档保留在独立键/归档中。`semantic_adapter/` 的未解析外部调用、别名与静态/运行证据限制仍然存在；迁移没有扩大其认证范围。

## 复现与回滚

完整功能服务：`python3 tools/serve_semantic_studio.py --port 8766`；已运行服务不重复启动。主程序通用案例为 `/yworks_edge_router_lab/index.html?model=0216717d966327f4`，原专用链接保持不变。旧画布为 `/semantic_studio/index.html`。

检查命令：

```sh
node tests/native-semantic-host.test.cjs
node tools/audit_native_semantic_host.cjs verification/native-host/current
python3 tools/run_local_tests.py --jobs 2 --out verification/native-host/current/regression
```

需要回滚时，先将迁移后的改动另存目录或补丁，再根据 `verification/native-host/current/changes.json` 对照恢复备份中的同名文件；仅删除该清单列出的迁移新增文件。备份根为 `/tmp/archcanvas-before-host-migration-20261025-183551/snapshot`，起点与范围见同级 manifest.json。不要直接对现有目录执行递归清空，也不要用 Git reset 丢弃回滚前的其他工作。浏览器数据使用独立存储键，恢复代码不必删除用户旧草稿。

最终 CUA 补验：完整源码状态重开仍为 3371/3663 且存储状态 saved；局部 ffn 为 9/7（不是收起后的单节点），语义/布局/全部连接均通过。F1 导航提交采用 worker 校验，主线程验证记录 0.00 ms，并更新相机至新图幅。截图与实际记录见 `verification/native-host/current/native-f1.png`、`acceptance-report.json`。浏览器下载事件捕获超时，未将该次 UI 导出计为通过；文档往返与导入兼容性由自动测试覆盖。最终源码冻结布线审核仍为 86/86。

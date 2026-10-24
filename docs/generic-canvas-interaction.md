# 通用画布交互与后台计算

父模块展开、合法旧线路复用、首次计算加速和超时恢复的后续实现见 [父模块展开性能](generic-parent-expansion.md)。本页保留首次交互迁移阶段的证据与计数。

通用语义画布已采用专用编辑器的后台事务、移动会话、局部预览、约束提交和延迟保存机制。当前 F0/F1 及继续展开切面、节点和模块外观继续使用通用实现。此次迁移不新增模型识别规则，也不切换到专用 Transformer 数据。

## 路由来源核对

同级目录 `prototype/yworks_edge_router_lab/README.md` 明确说明该实验复刻 yWorks Layout Styles 的 Edge Router 行为，未使用 yFiles 运行库；`evidence/source-findings.md` 记录其对公开 demo 源码、端口、箭头、编辑模式和路由配置的调查。它是一套自行实现的避障与带方向最短路求解器，不是对商业 yFiles 求解器逐点一致的实现。

`Summary_Merge/yworks_edge_router_lab/router.js` 与同级实验的核心代码直接对应，但增加了容器门、墙边并行通道、窄通道候选和搜索预算等处理，两个文件并非字节相同。迁移时参考的是仓库内专用编辑器最终使用的 `app.js`、`graph-engine.js` 和 `routing-worker.js`。

通用画布继续通过 `architecture-layout.js` 解释通用端口、跨区输入、残差、条件和共享输出契约。迁移的是围绕路由器的交互机制：拖动期间不运行寻路，松手后在后台修复和验证路径；不会以专用节点 ID 或专用物理端口规则替代通用语义绑定。

## 文件关系

| 文件 | 职责 |
| --- | --- |
| `semantic_studio/canvas-interaction.js` | 不可变移动基线、可见子树、父框与画布限制、碰撞检查、正交预览、局部路由修复、质量准入、可保存的人工几何 |
| `semantic_studio/scene-runtime.js` | 驻留 IR 和派生计划；投影、认证细化、布局、路由、详图建议；缓存最近六个计算结果 |
| `semantic_studio/scene-worker.js` | 在 worker 内加载完整通用依赖链并执行任务 |
| `semantic_studio/scene-client.js` | 请求编号、模型版本、旧任务失效、worker 故障后的兼容执行 |
| `semantic_studio/state-storage.js` | IndexedDB 保存、事务完成确认、旧 localStorage 状态读取及兼容回退 |
| `semantic_studio/app.js` | 一次提交候选场景；RAF 合并拖动；只更新移动节点、相关路径、标签与共享线干标记；撤销、重做和取消 |
| `semantic_studio/publication-renderer.js` | 继续提供通用绘图；恢复并验证人工位置；直接导出已准备好的图，不重复布局 |

worker 只在打开模型时接收一次完整 IR，后续请求传递视图状态或移动量。`Map` 的自定义 `.context` 属性不会被 structured clone 保存，因此场景传输显式携带路由上下文，并在接收侧恢复。条件、调用、参数身份、操作数及全部规范归属仍来自同一完整 IR。

展开、收起、F0/F1 切换和详图规划在后台生成完整候选。旧图保留到候选可提交；失败时恢复状态、历史和控件。切换模型会终止旧 worker；过期回复不能提交到新模型。未命中缓存的复杂布局仍需计算，worker 的作用是释放界面线程。

拖动按一个手势基线计算整棵可见子树的位移。位置受父框正文与画布限制；新增碰撞会保留上一个合法预览。内部路径整体平移，跨边界路径只做便宜的正交预览；所属标签与分叉标记跟随或暂时隐藏。松手后修复端点与受新障碍影响的路径，重新检查避障、约束、标签及不同值的路径冲突。失败则恢复原图。取消、失去指针捕获、Escape 和窗口失焦会撤销当前手势。

人工位置记录在 `state.canvasPlacement`，包含当前切面身份、几何、路径和路由策略。重开时重新核对切面、尺寸、父框、碰撞、实际端点、障碍和质量；不能把失效的坐标应用到另一个切面。自动排布会清除此记录。完整 IR 仍随图文档保存。

浏览器优先在 IndexedDB 的 `archcanvas-semantic-state/states` 中按原有展示键保存，180ms 合并写入，页面离开时提交待保存状态。旧 localStorage 键继续作为迁移读取来源，未删除；IndexedDB 不可用时尝试兼容保存。首次初始化的默认模型和审核展示配置不变。

## 验证与实测

`tests/semantic-canvas-interaction.test.cjs` 新增 13 项，覆盖嵌套子树、父框/画布限制、碰撞反例、不可变正交预览、Map 上下文传输、真实 worker 入口、缓存上限、失效模型回复、回退执行、保存重开、原始绑定和完整归属，以及 IndexedDB 提交/失败回退。累计回归 **97 组、1105 项全部通过**。运行期间冻结生产代码、测试和捕获器，归档记录包含文件 SHA-256。

CUA 验证了普通模型源码视图、Transformer F0/F1、继续展开、父模块拖动、越界限制、碰撞限制、撤销、重做、模型切换、IndexedDB 恢复和实际文件重开。实际 F0、F1、局部展开 SVG 与先前审核版本逐字节相同。移动 Transformer 父模块携带 31 个可见图元；完整保存文档保留 3371 节点、3663 边、78 契约，重开 SVG 与移动后的 SVG 逐字节一致。

本机单次 CUA 观察：F1 冷计算约 19.4 秒，父模块拖动的预览 p95 约 1ms，松手后台整理约 293–325ms，包含传输与局部 DOM 更新的提交约 504–531ms；撤销缓存约 198ms。先前同轮观察中，返回 F0 缓存约 182ms，再进 F1 缓存约 842ms。后两项包含认证切面处理和 DOM 更新，不能将缓存命中解释为所有步骤均零耗时。这些是该机器和该切面的样本，不是所有输入的性能保证。

原始观测在 `verification/canvas-interaction/current/ui-metrics.json`。独立审核在 `acceptance.json`，检查正式 SVG、规范绑定、完整归属、实际路径的正交与障碍、31 个图元位移及真实文件重开。完整保存文档暂存在 `/tmp/semantic-transformer-moved.json`，Git 中只保留精简收据，避免再次提交完整 IR 副本。

```bash
node tests/semantic-canvas-interaction.test.cjs
python3 tools/run_local_tests.py
node tools/audit_canvas_interaction.cjs /tmp/semantic-transformer-moved.json
```

全量脚本仍将当次结果写到历史公共输出目录 `verification/local-relations/current/`；本轮将报告和相应日志单独归档到 `verification/canvas-interaction/current/`，保留原有阶段记录。

此轮没有验证数千图元同时可见时的 DOM 性能；worker 不可用的兼容模式仍会在主线程计算。首次复杂图的布局总耗时、更多手工位置的可接受范围及巨型场景还可以继续改进。

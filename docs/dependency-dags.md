# 可逆语义折叠与局部依赖 DAG

目标是让通用图的一个中间语义状态在模块逻辑和视觉组织上接近专用架构图。专用图的完全展开不是通用图的细节下限；中间状态下仍应保留源码、操作数、结果槽、边界及证据的进一步展开能力。

实现不要求先渲染全部细节再逐步折叠。系统保留 canonical IR，依据局部事实生成候选摘要，再选择当前可见前沿、投影真实边界并布局。不同区域可以同时采用不同粒度。仅减少节点数量不保证语义表达充分，也不保证画面更小；语义认证、表达选择和布局仍需共同优化。

当前 Transformer 源码细节投影检查可恢复全部 3371 个节点、3663 条边，canonical IR 不变。这仅验证投影完整性，不验证数千节点同屏 SVG 路由、浏览器交互性能，也不证明抽取器已经理解任意 Python 行为。源码、运行和合并证据的计数不能直接等同。

## 本轮的通用增量

既有路径、汇合树摘要不适合内部复用：把共享计算递归写成表达式会重复计算名称，可能让读者误以为存在多个独立操作。本轮以每个操作一个记录、每次使用一个引用的方式形成 bounded dependency DAG：

```text
#1 sin
#2 tanh ← arg:0=#1
#3 cos  ← arg:0=#1
#4 sub  ← 0=#2; 2=#3
```

引用编号只提供拓扑引用，不承诺运行顺序或并行执行。同一结果使用两次时保留两个不同的操作数槽；元组的不同结果槽显示为 `#3[0]`、`#3[1]`。所有原始绑定、源码边界、参数读取及切边留在回执和 SVG title 中。摘要下隐藏的详细表达目标仍记为未完成。

候选仍限制在 2–6 个操作、单一结果的源码 helper/module 内，不能跨过未知、条件、控制、效果、运行专属、身份、认证或重复边界。原始中间结果外泄继续拒绝摘要；最终 `structure` 打包保留显式展示，内部打包在后续消费槽明确时可以参与摘要。环、重复占用同一输入槽、资源写入和不连通计算均拒绝。

生产规则不按模型名称、Transformer ID、SHA 或专用图模板选择。专用图只进入审核页面。路径/树回执版本及表达保持原有契约，新增 DAG 使用 `local-pipelines/4`。

## 审核结果与限制

完整套件 432 项测试通过。45 个实际 SVG 状态通过独立的原始绑定、结果身份、切边、认证角色和几何审核；浏览器以原始尺寸检查 1190 段文字，无矩形内文字溢出。真实编辑器完成摘要、双击展开、收起、保存后重开，图元数 5 → 9 → 5 → 9，SVG 与命令行一致，原始 IR 不变。

ReusedCircuit 从 9/7 图元/边变为 5/3；SharedTree 从 12/10 变为 6/4，交叉 1 → 0。UnknownCircuit 保留未知邻居，但宽度 748 → 856；SquaredCircuit 节点减少，面积略增。固定宽度摘要不是处处紧凑的最优表达。

Transformer 默认 SVG 与冻结基线逐字节一致，仍为 94/102、2588 × 4364、57 交叉、0 无关接触。此次扩展通用候选能力，没有推进它的整体视觉接近度。摘要层表达目标、摘要与细节的联合选择、参考模块对应、组合布局与密集路由仍未完成；总体目标保持进行中。

## 复核

```sh
python3 tools/run_local_tests.py
node tools/audit_dependency_dags.cjs
python3 tools/audit_local_svg.py --dags
python3 tools/audit_dependency_dags.py
python3 tools/audit_role_detail_receipts.py --dags
python3 tools/build_dependency_dag_review.py
node tools/audit_source_expandability.cjs verification/symbolic-values/current/transformer-current.json verification/dependency-dags/current/source-expandability.json
python3 tools/summarize_publication_checks.py
```

浏览器文字、目视及真实页面操作证据需另外采集。汇总器证据一致而总体目标未完成时退出 2；历史审核不以当前哈希重新盖章。

# 通用完全展开与数千节点性能

本阶段将交互优化用于全部通用语义案例，并补齐真正的原始源码完全展开。F0/F1 仍是可逆的中间语义展示；“展开全部”现在显示当前证据范围内的全部原始节点，不再以语义摘要计划的底层作为终点。Transformer 的旧操作只得到约 342 个图元，新操作显示完整 **3371 节点、3663 条连接**。

## 展示与保存

`publication.fullyExpanded()` 生成显式 `paperCanonical:true` 状态，打开原始 IR 的全部父模块。`projectCanonical()` 保留每个值别名、参数、调用、条件、状态和未知边界，以及原始父归属和精确操作数绑定。source/runtime/merged 的证据范围仍各自生效，排除项进入完整 accounting；没有删除 IR。用户可以继续单独收起/展开父模块。

F0/F1 按钮清除 canonical 状态，恢复既有语义投影。保存文档包含完整 IR 和展示状态；真实浏览器保存重开后的完整 SVG 逐字节一致。没有模型名称、案例 ID、源码哈希或专用坐标分支。

## 共享性能机制

- `geometry-index.js` 提供精确包围盒 BVH 和追加式多尺度线段索引。只筛选候选，原障碍、交叉、接触和拥塞数学保持不变；候选仍按原顺序累加，避免浮点顺序改变路径。
- `architecture-layout.js` 在一次路由作用域内建立祖先、覆盖关系和 incident edges 索引，并增量索引已占线路。`try/finally` 回收作用域；移动、重排后重新建立，不跨几何版本复用。
- `publication-renderer.js` 的线几何审核使用空间候选对，保留原 route pair 顺序。全部通用模型的路由均使用共享索引。
- 超过 512 节点或边的**显式完整源码图**采用一次 canonical-short 路由，完整测量并报告问题，避免六策略反复全图计算。F0/F1 的候选质量准入和回退保持原样。
- `app.js` 在离屏 fragment 中每 128 个图元/连接让出主线程，准备完成后整体提交；旧图保留，过期任务放弃提交。后台 worker、事务、缓存、拖动边界和恢复机制继续共用。
- worker 及其依赖使用一致版本参数，避免浏览器把新 worker 与旧依赖混用。

## 审核与测量

`verification/full-source/current/catalog-report.json` 覆盖全部 **43 个目录案例、129 个状态**。其中 86 张 F0/F1 与冻结提交 `ebb39ec` 的 SVG 和事实摘要均精确相同，43 个完整源码状态通过完整归属和 IR 不变检查。测试另覆盖全部 ID 改名、条件/状态/未知边界、runtime/merged、局部收起恢复、精确保存、几何变更后索引与原二次线几何 oracle。

同一张完整 3371/3663 图的顺序单次路由对照：旧求解器 **16971.3ms**，新求解器 **7574.6ms**，减少 **55.4%**。两者路由和完整质量摘要的 SHA 相同。这只比较同图的单次 canonical-short 路由，不以旧 342 图元摘要冒充旧完整展开耗时，也不代表所有设备或所有模型同等加速。该次投影与编排另耗 6644.5ms。

CUA 真实点击“展开全部”：后台计算 **9869ms**，包含传输和 DOM 提交的整次操作 **10633ms**。重做命中缓存，提交约 **769ms**。实际文档重开为 3371/3663，重开 SVG 与原始导出相同；重开及缓存样本与审核任务并行，耗时仅作记录，不作为严格对照。原始大文档和 SVG 留在本机 `/tmp/full-source-ui-*`，Git 只保存摘要和收据。

最终冻结版本全量 **99 组、1118 项测试通过**。正式报告和对应日志归档在 `verification/full-source/current/`。浏览器还验证了 MLP 的完全展开/撤销/重做、条件模型的两条分支和原始参数/值节点，以及完整 Transformer 中 36 个 matmul 的查找与源码定位。

## 已知限制

完整源码图仍是检查界面，不满足论文图或 F1 的可读性质量。当前 Transformer 大图约 **7028 × 95059px**，有 **8 条路由失败、5585 个交叉、651 个不相关接触、309 个重合记录、55 个未放置端口标签**，并触发高度、面积和节点/边预算问题。成功返回完整图与事实完整，不等于全图布线清洁。这些问题保留在质量报告和 UI 提示中；没有通过删除节点或隐瞒失败换取速度。

F0/F1 审核 SVG 保持原样，仍可返回概览或详图阅读。陌生大程序的全局可读性与最坏耗时仍没有保证；拥塞父模块的增量候选也仍可能回退，见[父模块阶段限制](generic-parent-expansion.md)。

## 复现

```sh
mkdir -p /tmp/archcanvas-full-before
git archive ebb39ec semantic_studio | tar -x -C /tmp/archcanvas-full-before
FULL_SOURCE=/tmp/archcanvas-full-before/semantic_studio node tools/audit_full_source.cjs verification/full-source/before
node tools/audit_full_source.cjs verification/full-source/current verification/full-source/before
node tools/benchmark_full_source.cjs /tmp/archcanvas-full-before/semantic_studio
python3 tools/run_local_tests.py
# 将测试报告及对应日志归档到 current 后，使用真实 UI 导出：
node tools/check_full_source.cjs /tmp/full-source-ui-document.json /tmp/full-source-ui.svg /tmp/full-source-ui-reopened.svg
```

捕获、基准和测试期间冻结生产代码、测试和捕获器。计时基准顺序独立运行。完整审核以 `acceptance.json` 为准；历史阶段的计数与限制保留各自时点含义。

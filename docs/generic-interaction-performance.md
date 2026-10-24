# 通用画布交互性能：父展开、拖动与 SVG 实例保留

本阶段继续参考专用编辑器 `yworks_edge_router_lab/app.js` 的按身份保留 SVG 实例、不可变移动会话和提交阶段校验机制。布线来源核对见[通用画布交互](generic-canvas-interaction.md)：同级实验参考公开 yWorks demo 行为自行实现，未使用 yFiles 求解器。通用画布继续使用自己的语义端口、布局、图元和路由器。

规则适用于全部通用模型，没有模型名、案例 ID、源码摘要或专用坐标选择条件。完整事实 IR、规范操作数、调用身份、共享关系、条件、状态与未知边界均保留。F0/F1 仍为可逆中间切面，允许继续展开到全部源码。

## 本轮实现

- `canvas-interaction.js` 对超过 64 个障碍的移动会话建立共享包围盒索引。每个预览框只检索相交障碍，再执行原有严格重叠和既有重叠检查；父框、画布限制及上一次合法位移不变。索引建立在手势开始时，不在每帧重建。
- 保存恢复一次计算可见归属和同父兄弟组；宽兄弟组使用空间索引。父框、尺寸、碰撞、物理路径、规范端口和质量仍逐项检查。
- 父模块增量展开、移动后修复和保存路径验证复用 `withRoutingIndex()` 的临时祖先、入射边与覆盖关系索引。作用域结束即释放；质量准入和不合格候选的完整布局回退继续执行。
- `publication.js` 增加最多 4096 项的相同文字/宽度/字号换行缓存，返回数组副本，防止调用方污染其他图元。
- `app.js` 按节点身份和实际绘制内容保留 SVG 节点，边按完整路径、箭头及规范绑定内容比较。只有变化的实例才重建，平移只更新 transform。模型切换不复用旧实例，合绘依赖事件读取当前已提交的边。
- 异步准备期间保留旧场景；新实例离屏建立，任务身份校验后一次调整图层顺序并提交。移动提交会清除被修改边的绘制缓存标记，防止撤销/重做或缓存回访误用旧路径。新增 DOM 创建/复用与耗时指标，移动补丁也更新这些指标。

圆形端点平移与重新计算可能产生几个浮点单位的差异。保存恢复允许最多 `8 × Number.EPSILON × max(1, |a|, |b|)` 的算术误差，并原样保留保存路径；没有像素级宽容或端口重新绑定。独立普通圆形端点反例验证：合法整体平移后约 `3e-14` 的差异可恢复，仍物理合法但偏离端口 `1e-6` 的路径必须拒绝。此问题在旧版也存在。

浏览器证据中的保存状态通过原始 JSON **文本**读取；不将解析后的坐标对象经工具数值序列化后当作无损保存文本。第一次审核提取中曾因这种数值传输产生末位变化，已改为文本重新捕获并验证。

## 顺序性能对照

基线为提交 `57d79f3` 的冻结源码，前后顺序运行同一捕获器；正式基准期间没有其他测试或浏览器重计算。每行同时对照 SVG、事实摘要或全部预览结果，10 项结果完全一致。以下为本机单次测量，单位毫秒；不能解释为所有设备或所有父模块的稳定加速比。

| 操作 | 修改前 | 当前 | 说明 |
| --- | ---: | ---: | --- |
| F1 完整计算 | 18021.1 | 17020.7 | 减少 5.6% |
| 父模块增量收起 | 715.1 | 604.5 | 减少 15.5% |
| 父模块首次增量展开 | 871.5 | 738.5 | 减少 15.3% |
| 保存几何恢复 | 25.0 | 23.7 | 小样本差异 |
| encoder 候选计算 | 781.5 | 626.5 | 仍被拒绝，后续执行完整回退 |
| 普通模型移动提交 | 1.30 | 1.28 | 小样本差异 |
| 3371/3663 完整源码图计算 | 12428.5 | 12018.9 | 减少 3.3%，无画质改善 |
| 大父模块移动会话建立 | 2.09 | 5.70 | 建立索引增加约 3.6 ms |
| 2199 个移动节点 / 1171 个障碍，120 次预览检查 | 9527.9 | 162.0 | 减少 98.3%，结果逐项一致 |
| 普通模型 120 次预览检查 | 0.63 | 0.37 | 小样本差异 |

该预览基准只测量约束计算，不包括浏览器更新数千个 DOM 元素的成本。新增的会话索引不是零成本，收益主要来自后续重复检索。完整源码图仍有 8 条失败路径，encoder 增量候选仍可能回退，未据此声称整体布局质量或任意陌生程序的流畅性已经通过验收。

## 验证及浏览器证据

正式目录审核覆盖 43 个模型、129 个 F0/F1/完整源码状态；所有 SVG 与事实摘要与上一阶段一致。全量回归为 100 组、1122 项，生产代码、测试及捕获器在运行期间冻结，记录 SHA-256。测试包含原线性约束/换行算法的冻结 oracle、宽兄弟组、碰撞与逃逸反例、圆形端点恢复及真实端口偏移拒绝。

浏览器通过 CUA 操作真实控件，验证普通 MLP 移动、撤销、重做，Transformer 父模块首次打开、保存、重新导入及 SVG 导出。新版本一次首次父展开为后台 751 ms、整次 958 ms，80 个节点中保留 37 个旧实例，仅建立 43 个新实例；普通移动后台约 4 ms、整次约 15 ms，全部 19 节点/18 边保留。真实 DOM 的节点内容、transform、路径和规范端口属性另由 Python XML 检查器与独立渲染结果逐项对照，防止只比较模型数据而遗漏陈旧 DOM。

完全展开后再次访问同一场景，3371 个节点和 3663 条边均保留实例，无新建。早期首次完整图及缓存回访样本与目录/回归审核并行，仅用于规模和实例复用证明，不作为严格前后耗时对照。最终版本再次逐项核对全部 3371/3663 个实例身份；缓存回访整次约 468 ms，其中 DOM 阶段约 285 ms、零新建。该浏览器样本没有修改前的对应对照，不据此计算加速比。DOM 实例保留不等于免除遍历、字符串比较和后台传输成本。

`verification/interaction-performance/current/` 保存顺序基准、目录清单、全量测试与日志、实际 UI 状态/SVG/DOM、实例复用指标及独立验收结果。保存状态不重复附带 3371 节点 IR；复现图文档时与 `data/semantic/0216717d966327f4.json` 组合。节点、边的全部事实分区在独立检查中重新核对，保存重开 SVG 必须逐字一致。

用户提供的 `Transformer · architecture.svg` 另经只读核实：105 节点、111 边、2588 × 4730、57 个交叉，是历史中间语义图，不能登记成 3371/3663 完整源码展开案例。证据见 `supplied-svg.json`。

## 复现

```sh
mkdir -p /tmp/archcanvas-interaction-before
git archive 57d79f3 semantic_studio | tar -x -C /tmp/archcanvas-interaction-before
INTERACTION_SOURCE=/tmp/archcanvas-interaction-before/semantic_studio \
  node tools/audit_interaction_performance.cjs verification/interaction-performance/before
node tools/audit_interaction_performance.cjs verification/interaction-performance/current verification/interaction-performance/before
node tools/audit_full_source.cjs verification/interaction-performance/current/catalog verification/full-source/current
python3 tools/run_local_tests.py
# 将 test-report.json 和其全部日志归档到本阶段后：
node tools/check_interaction_performance.cjs
python3 tools/check_interaction_dom.py \
  verification/interaction-performance/current/ui-opened-dom.json \
  verification/interaction-performance/current/ui-opened.svg
```

性能捕获必须顺序执行，目录审核和测试的耗时不用于速度对照。浏览器操作结果不能由脚本虚构，重新取证须实际操作控件并保存文本、SVG 和 DOM；上述独立检查器可直接复核本阶段已归档的实际证据。

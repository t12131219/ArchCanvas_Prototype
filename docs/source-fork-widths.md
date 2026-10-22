# 外部同来源分叉的有界等宽排版

此前等宽规则依据容器内部的凝聚 DAG 前驱。一个外部值直接进入 helper 的多个
可见计算时，在 helper 的局部 DAG 中没有共同前驱；参数附注变宽后，同来源消费者
仍在一行，却不再等宽。增加的是通用的可组合排版能力，不依赖整体模型名、类名、
源码哈希、案例或固定位置。

本轮直接检查实际可见边的来源、已解析来源和输出槽；只有三者一致、消费目标没有
被折叠成另一对象时，才为同一依赖行的 2–3 个闭合计算补齐宽度。每组最多增宽
20%，不改变高度、源码所有权、计算、操作数、参数说明、原始绑定或逻辑展开前沿。
大幅不等宽、折行、SCC、手动位置以及未知、条件、可变、共享身份和运行证据边界
保留普通布局。共享输出只说明来源相同，不说明操作等价、并行执行、形状或纯度。

等宽只是一项候选。最初正式试算中，混合程序增加了一处交叉，某张详图线长增加约
8%；它们不能因为恢复等宽就自动采用。最终渲染会对有候选的图多做一次完整比较：

- 原始对象、操作数、绑定、逻辑前沿和已兑现表达目标必须保留。
- 已执行约束、已实现列对应和入口不能丢失。
- 自动选择的可选上下文通道可改用普通入口，但必须保留完全相同的原始依赖和消费
  槽，且全图交叉和线长同时严格减少；显式指定的通道不能被替换。
- 最终交叉、异值接触、歧义重叠、路由失败和标签失败不能增加。
- 全图宽、高、面积和线长各最多增加 5%；字体不能缩小。
- 所有采用的等宽组必须在最终 SVG 几何中实际成立。

任一检查失败，保留原布局，并记录拒绝的候选和实际成本。没有候选的图不做额外
比较。`paperSourceForkWidths:false` 恢复本轮前的布局；打印、其他粒度和手动位置
不启用新规则。模块标题仍允许穿线，实际节点及无关模块主体继续避让。

## 验证方法

基线为真实提交 `4477b62`。三个本轮独立抽取的陌生程序分别覆盖共同来源、不同
来源以及已知 helper 与未知调用和条件返回的组合。沿用 22 个之前的小图状态和
3 个 Transformer 面板，正式生成 56 张 SVG。旧基线来自冻结的实际代码；大图的
旧版本使用上轮已校验字节并重新核对生产文件、输入、状态和文件哈希。小图关闭
新选项时须与冻结旧代码生成完全相同的 SVG。

独立 Python 检查器读取实际 SVG，核对位置、节点主体障碍、正交路径、全部端口、
bundle 和语义绑定；重新解析源码 AST 检查已有参数表达式。每个等宽组沿原始 IR 的
透明接口绑定重建共同来源和输出槽，不接受“看上去连着同一个外框”作为证明。
同时核对原始 IR、完整架构、附注、逐对象去向、代表实例、源码归属和表达目标。
可选侧通道的几何变化单列记录；原有已执行约束不得暂缓。

浏览器另对全部 56 张实际 SVG 读取 `getBoundingClientRect()`，检查节点文字和端口
标签是否越界，并保存真实 DOM 路径、文字和分叉标记，与文件逐项比对。容差为
1 个原生 SVG 单位。截图用于目视检查，不代替源码和几何核对。

完整源码投影另检查 3371 个节点、3663 条边全部 ID 可见且 IR 不变；这不代表数千
节点完整 SVG 的路由或浏览器性能已验证。本轮没有新增编辑器导入导出试验；保存
状态重渲染、进一步展开和折叠由测试覆盖。与专用架构图的整体收敛仍未完成。

## 本轮正式结果

82 组、915 项测试全部通过。56 张 SVG 独立检查通过；浏览器核对 896 个节点、
1556 段节点文字和 46 个端口标签，没有文字越界，实际 DOM 路径、文字和分叉标记
与文件一致。共兑现 8 组外部同来源等宽：陌生程序 BorrowedGrid 一组、
ConfiguredShape-open 一组、Transformer 第二张详图六组。

| 状态 | 尺寸：本轮前 → 当前 | 交叉 | 线长 |
|---|---|---|---|
| BorrowedGrid | 523 × 640 → 538 × 640 | 0 → 0 | 530.8 → 545.8 |
| ConfiguredShape-open | 520 × 624 → 532 × 624 | 0 → 0 | 529.3 → 541.3 |
| Transformer 第二张详图 | 1767 × 3160 → 1800 × 3160 | 10 → 8 | 24440.7 → 23912.2 |

两个小图以少量宽度和线长换取对齐。第二张详图宽度及面积增加约 1.87%，线长减少
约 2.16%；37 项直接表达目标保留，全部已执行约束与两组列对应保留。可选入口
e01349（key_padding_mask）从左侧改为顶部，原始值和消费槽完全一致；该变化单列
审核，不声称通道几何不变。

主图及第一张详图分别保留 21、25 项直接表达目标，SVG 不变。第一张详图的候选
线长增加约 8%，被拒绝；MixedGrid 候选交叉从 2 增到 3，被拒绝，实际图仍为
2 处交叉。不同来源的 SeparateGrid 未触发等宽。

实际截图为 review.png、transformer-review.png；对照页提供完整原尺寸 SVG。
这是局部排版能力的增量，尚未完成与专用图的整体收敛。

## 复现命令

```sh
mkdir -p /tmp/archcanvas-source-fork-widths-before-4477b62
git archive 4477b62 semantic_studio | tar -x -C /tmp/archcanvas-source-fork-widths-before-4477b62 --strip-components=1
python3 tools/extract_source_fork_widths.py
node tools/audit_source_fork_widths.cjs
node tools/audit_source_fork_widths.cjs --case=Transformer-panel-0
node tools/audit_source_fork_widths.cjs --case=Transformer-panel-1
node tools/audit_source_fork_widths.cjs --case=Transformer-panel-2
python3 tools/check_source_fork_widths.py
python3 tools/build_source_fork_widths_review.py
node tools/audit_source_expandability.cjs verification/helper-contracts/current/Transformer-current.json verification/source-fork-widths/current/source-expandability.json
python3 tools/run_local_tests.py
python3 tools/finalize_source_fork_widths.py
```

浏览器审核不能由 CLI 数据替代：实际打开 `all-review.html` 后保存
`browser-report.json` 和截图。最终数字、代码、测试日志和审核文件哈希由
`completion-report.json` 绑定。

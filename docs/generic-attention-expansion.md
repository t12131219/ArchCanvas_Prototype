# 通用画布：Attention 展开时的回退计算

本阶段针对用户截图中 `attention / Scaled dot-product attention` 的首次展开做计算优化。规则只依赖当前可见事实、几何和路由输入，适用于所有通用模型；生产代码不使用模型名、案例 ID、源码摘要或专用坐标。

## 原因与改动

局部展开候选中，部分条件和合绘标签无法放置，原有质量门拒绝候选，再运行完整依赖布局回退。完整搜索又绘制了改变规范切面的普通源码返回候选，最后仍须通过“与请求切面完全相同”的身份检查。

- 将这项身份检查前移：依赖布局回退先投影普通源码返回候选。若其节点、带槽位/条件/合绘成员的边或完整事实分区不同于请求切面，就不运行该候选的完整布局。最终身份和质量准入仍保留；独立依赖布局继续比较正常返回摘要的图面收益。
- 一次同步搜索内，最多缓存 32 份完全相同路由输入的准备结果。键包含实际位置、尺寸、端口绑定、条件、标签、父级、来源标签、发布限制和路由上下文；不以模型或策略名称代替这些输入。调用方收到独立副本，搜索结束或异常立即释放。需要额外规范事实的局部旁路试验不进入此缓存。
- 局部修复对未变化的连线对保留交叉/接触测量；一对连线只测量一次，再向两个端点累加相同整数分数。替换线路即重新测量其相关对。小图不再建立不会使用的线段索引。
- 耦合线路试验先检查几何，只有几何可接受时才深拷贝全部约束证据并审核。两个实际布线调用共用临时路由索引。拒绝候选仍不能改写原证据。
- 可见性搜索沿用原先左、右、上、下的邻居顺序和所有费用、堆顺序、访问预算，减少搜索循环中的临时数组分配。

没有采纳诊断中的局部加间距方案：它能放下标签，但当前截图对应切面的交叉比原回退图多。没有删除标签、合并不同操作数、隐藏条件，或将缓存回访当作首次展开。

## 验证与计时边界

基线为 `7beda55` 的冻结源码；正式前后捕获顺序执行，期间不修改生产代码、测试或捕获器，也不并行运行浏览器重计算或其他测试。主场景先计算 F1、增量收起 decoder，再首次展开 encoder 内的 attention；这与用户截图的 39 → 49 图元场景一致。首次展开包括失败增量候选及后续完整回退，不含场景缓存命中。

`tools/audit_attention_expansion.cjs` 同时捕获默认 F1 的三个 Attention 及继续展开条件子模块。独立子场景设 60 秒进程上限，超时记录为未完成，不能当成通过或据此计算完整耗时。它与产品后台任务的超时设置不同。

| 操作 | 修改前 | 当前 | 结果 |
| --- | ---: | ---: | --- |
| 截图对应 Attention 首次展开，39 → 49 图元 | 31.89 s | 16.11 s | 减少 49.5%，SVG/事实相同 |
| 默认 F1：encoder 内 Attention，80 → 90 | 54.97 s | 31.24 s | 减少 43.2%，SVG/事实相同 |
| 默认 F1：decoder 第一个 Attention | 60 s 进程上限未完成 | 32.03 s | 没有完整旧耗时/SVG，不计算加速比或声称图面一致 |
| 默认 F1：decoder 第二个 Attention | 52.09 s | 31.25 s | 减少 40.0%，SVG/事实相同 |
| 继续展开条件子模块，49 → 54 | 34.17 s | 19.82 s | 减少 42.0%，SVG/事实相同 |
| F1 初始完整计算 | 16.52 s | 16.66 s | 本轮没有改善 |
| 收起 decoder | 583 ms | 597 ms | 本轮没有改善 |
| 保存几何恢复 | 28.9 ms | 34.8 ms | 增加约 6 ms，未声称加速 |

这些是本机单次顺序测量，不能解释为所有设备、所有父模块的稳定加速比例。截图对应的最终图仍为 49 节点/53 路径、19 交叉、972 × 4274.5，所有条件与合绘标签均放置，未增加接触或失败路径。局部候选仍被拒绝，最终仍走完整依赖布局回退；本轮主要省去重复和不合格候选的计算。

全量回归为 **101 组、1125 项**；新增检查覆盖缓存隔离、异常释放、几何/槽位/条件/来源标签/父级/画布限制/路由策略失效，以及普通固定返回模型的切面预检。43 个模型、129 个 F0/F1/完整源码状态的 SVG 与事实摘要均与上一阶段相同。独立 Python 检查器从实际 SVG 重新计算交叉，核对每条直接/合绘规范依赖及结构解包槽位；默认 F1 的第二个 Attention 因旧版超时而没有前后 SVG 等价证据。

浏览器通过 CUA 导入相同的折叠状态，再真实点击 Attention 展开。后台首次计算 **14.241 s**、整次 **14.418 s**，`cached=false`，49/53；保留 8 个旧节点实例，建立 41 个节点实例。撤销与重做分别约 158/163 ms，为缓存回访，不能算首次展开加速。保存后重新加载，后台约 15.0 s、整次约 15.25 s，仍非缓存。导出 SVG、保存状态及节点内容/transform/边路径/规范绑定的 DOM 摘要分别核对；重做和重开均一致。完整 DOM 摘要由实际 SVG 在 Python 中独立复算，SHA-256 计算使用 `abc` 已知结果核验。

浏览器下载事件在当前连接中未返回，因此验证读取了真实导出文本并核对摘要；重开验证使用实际 IndexedDB 持久化状态，没有声称完成了下载文件的重新导入。实际截图从本轮 CUA 图像输出归档为 `attention-opened.jpg`，保存状态与完整 IR 可组合重现。浏览器标签页已保留在 Attention 展开位置。

顺序计时、回归、目录及实际浏览器证据位于 `verification/attention-expansion/`。具体数据以完成的 `current/report.json`、目录报告、测试报告与独立验收为准。

## 复现

```sh
mkdir -p /tmp/archcanvas-attention-before
git archive 7beda55 semantic_studio | tar -x -C /tmp/archcanvas-attention-before
ATTENTION_SOURCE=/tmp/archcanvas-attention-before/semantic_studio \
  node tools/audit_attention_expansion.cjs verification/attention-expansion/before
node tools/audit_attention_expansion.cjs verification/attention-expansion/current verification/attention-expansion/before
python3 tools/run_local_tests.py
node tools/audit_full_source.cjs verification/attention-expansion/current/catalog verification/interaction-performance/current/catalog
# 将 test-report.json 和 test-logs 归档到本阶段后：
python3 tools/check_attention_expansion.py
```

F0/F1 继续是可逆的中间展示状态，完整 IR、条件/状态/未知边界、调用和共享身份仍保留。此优化减少搜索工作，不代表完整源码图的路由问题已解决，也不能推断所有父模块都已能即时展开。

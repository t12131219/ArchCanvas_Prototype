# Transformer CPU 轨迹细化副本

访问 `http://127.0.0.1:8766/yworks_edge_router_lab/index.html?case=01093cc06a87b35c`。
这是 `01093cc06a87b35b` 的独立 CPU 证据细化副本，重新按实际调用组织内部布局，原案例文件及其浏览器保存键保持独立。新副本仍使用同一编辑器，可逐个展开、收起、移动、撤销、保存及导出，无需切换三级视图。

## 证据和绘制范围

仅复用 `data/semantic/transformer-runtime.json` 中已经成功记录的 `with-masks / eval` 一次运行，没有重新执行模型。CPU 配置为 D=8、H=2、FFN=16，Encoder 和 Decoder 各 1 层；src=[1,3]、tgt=[1,2]。三个 mask 均为全 False。记录中未出现的其他输入路径、训练模式、遮挡位置或因果行为，不被宣称已验证。

图的完整 authority 包含 306 个节点和 250 条连接：186 个 ATen 计算事件、52 次实际模块调用（包括没有产生 ATen 事件的身份调用）、15 个有源码符号证据的分头/合头/SDPA 分组、45 个独立参数资源、1 个共享 buffer、5 个输入和 Memory/Logits 两个显式接口节点。

- Linear 可展开到实际 `view / t / addmm / view`；generator 根据记录显示 `t / view / mm / _unsafe_view`。
- Q、K、V 分头分别保留 `view / transpose / clone`，不把三条支路合成一条计算。
- 三处 SDPA 保留实际的 expand、view、bmm、div、mask、softmax、nan_to_num 和 AV 计算。Decoder 自注意力多执行了目标 attention mask 的处理。
- 残差加法和 LayerNorm 是独立事件。LayerNorm 的三个输出槽位保留在节点证据中，只有实际消费者才产生连接。
- `op64:0 → Memory M → op129 / op136` 保持 Encoder 输出到 Decoder 交叉注意力 K、V 的实际张量关系。
- 共享 `position.pe` 只有一个资源节点；其两次位置编码调用分别展开。
- Dropout 在本次配置中只有调用证据，没有 ATen 运算。它们明确标为 eval identity；采集器无法区分同一张量在 Python 中的别名支路，因此不猜测并插入虚假的计算链。
- 最终输出为 logits，不复制原案例说明性的概率 Softmax 到执行计算图中。

节点检查器保留源码文件/行号/符号、调用实例、参数身份和每个 ATen 事件的输入输出。连接保留原始 tensor ID、producer、输出 slot、消费者 operand 和实测 shape/dtype。采集器没有记录的 Python 标量实参不会被补成运行事实。

## 布局、保存和复建

默认视图采用与原案例相近的 Encoder / Decoder 双泳道：左侧 src → Embedding → Position → Encoder → Memory，右侧 tgt → Embedding → Position → Decoder → generator → Logits，均从下向上呈现。掩码和共享位置 buffer 位于辅助侧栏。主干阶段居中对齐，折叠总览的主干箭头竖直向上，Memory 保留到 Decoder 的实测跨泳道连接。

逐级展开和完整展开同样使用从下向上的调用层级，按实测事件次序排列，每个容器的右侧保留独立张量通道；折叠时释放内部空间，两条模型泳道随可见内容重新紧凑排布。默认画布为 1894×1328，完整展开为 3426×20116（306 个节点），可逐支路查看并缩放、按住滚轮平移。布局不是教材层数或 D=512 的假设图。

`runtime-layout.js` 在构建脚本、页面和后台 worker 中共享同一布局规则。展示版本 `dual-lane-bottom-up/1` 独立于语义 IR 哈希；加载旧版 c 案例保存状态时，先把整个旧文档写入 IndexedDB 的 `archived:` 键，再展示新布局，不以修改语义哈希的方式清除旧保存。a、b 案例不参与该迁移。

内部常用展开布局预先完成寻路和约束校验，作为隐藏模板加载；它们不是新的颗粒度切换。任意混合展开状态仍由递归引擎生成并通过原有数据绑定、边界、端口及避障校验。运行图优先尝试已分配的端口，并复用合法通道，失败时退回完整寻路。深层密集状态或任意拖动仍可能需要后台计算，并不保证即时完成。

在 Summary_Merge 目录依次运行（不导入/执行模型）：

```bash
python3 tools/build_runtime_atomic_case.py
node tools/finalize_runtime_atomic_case.cjs
node tools/build_runtime_frontiers.cjs
python3 tools/build_catalog.py
node tests/runtime-atomic-case.test.cjs
```

原始案例 SHA256 和 CPU receipt digest 记录在 `runtimeExpansion`。新 authority 生成独立不可变基线，浏览器状态使用新 case ID。预布线布局绑定完整 authority 文件哈希；重建 authority 后旧模板不再注册，须重新生成。

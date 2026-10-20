# 通用输入接口带与主图布局

本轮继续改善目标中间语义状态的几何组织。底层事实和展开层级不改变；规则不使用模型/类名、案例 ID、源码哈希或参考坐标。

两个已有独立入口、并有后续上下文依赖的展开区域，可能因为顶部输入接口换行而被整列向右推。候选布局先为真实输入保留顶部空间，再按实际消费位置排列接口。接口带按下方区域的可用宽度换行；共享输入仍只有一个节点，所有独立消费端口保持原样。外框的上下位置不表示执行时序或并发。

候选冻结原有前沿、角色列、排名、标签间距和上下文侧。只为基线实际实现的上下文通道继续预留沟槽；未实现的通道提议仍记录为 `selected:false / deferred`，不删除原始边。保留的通道在最终路径中必须仍实现。顶部输入进入内部沟槽时，增加绕过祖先标题的候选路径；网格搜索不能用一个离开已实现沟槽的短路径替换它。所有路径仍经过实际障碍与拥塞检查。

自动选择要求可见节点、精确边/操作数/条件、来源、折叠状态、角色、边界及逐对象去向相同；不增加约束冲突、交叉、无关接触、异值重合、失败路径或缺失标签，不降低字号或已实现的角色列/入口组/上下文通道。还必须减少至少 2% 面积，或在不增面积的条件下缩短至少 10% 线长；高度不增加、宽度最多增加 5%、线长不增加。有界地试画一个候选；并非全局最优布局，也没有墙钟时间保证。

`paperEntryBand:false` 保留现有策略，`true` 明确请求候选；自动模式由实际测量决定是否采用。节点偏移和打印输出不自动替换。条件集合、条件区域、循环区域、未知/控制端点及可变或带身份的边界不能授权入口对齐。测试发现条件集合未必带显式 `condition` 字段，现已补充按实际边界类型的限制。

## 本轮证据

- 冻结基线：`verification/local-relations/iteration-34-before-entry-band`，提交 `bba94e5`。
- 8 个输入、16 张前后 SVG；481 项测试通过，独立 XML/端口/路径/角色回执审核通过。
- 698 处浏览器原生比例节点文字，最小 13 px，无越框。
- ManyInputs 与 InterruptedInputs 在展开 helper 的状态下线长各缩短约 13%；未知调用仍可见。默认依赖摘要仍可用；已有五组控制输入图保持 SVG 逐字节不变。
- Transformer 保留 89 图元、97 边：2588 × 4118 → 2066 × 4028 px，面积减少约 21.9%；线长 73424.1 → 65191.6，减少约 11.2%；57 交叉、0 无关接触。3 组角色列、3 条已实现上下文通道及同一入口组保留，9 条未实现通道提议仍明确暂缓。

实际编辑器验证 ManyInputs 21 → 15 → 15 → 21、Transformer 89 → 92 → 92 → 89；保存重开后维持局部状态，回收细节后的 SVG 与主图逐字节相同，编辑器主图导出与正式 CLI SVG 一致。ManyInputs 还经过最终代码重载再导入验证。完整原始 IR 没有改写。

Transformer 的完整派生图文档为约 62MB，超过编辑器现有的 20MB 导入上限。`compact_canvas_document.py` 只序列化编辑器读取的 `schema / ir / state`，保留全部 3371 节点及原状态，得到约 9.8MB 导入文件；不扩大上传限制，也不删除源码事实。真实保存的 Transformer 完整文档及生成布局可重建，不重复纳入版本库；提交较小的展开状态、SVG、哈希与 UI 回执。

审阅页面分别列出陌生输入前后对照和专用参考。每列图独立适配显示宽度，不能从缩略图的高度推断原始像素尺寸。

主图的语义角色、直接细节表达数量和折叠状态均未增加。这是有测量依据的通用布局进展；主图与专用参考的逐关系对应、局部表达与图组的联合选择、更多未见状态/控制/路由组合，以及数千节点同时路由和交互仍未完成。现有细节导航和原始 IR 继续保留，不据此宣称大图性能已经验证。

## 复现

```sh
python3 tools/extract_entry_bands.py
node tools/audit_entry_bands.cjs
python3 tools/run_local_tests.py
python3 tools/audit_local_svg.py --entry-bands
python3 tools/audit_role_detail_receipts.py --entry-bands
python3 tools/build_entry_band_review.py
python3 tools/compact_canvas_document.py verification/entry-bands/current/transformer-current.layout.json verification/entry-bands/current/transformer-import.layout.json
node tools/audit_source_expandability.cjs verification/symbolic-values/current/transformer-current.json verification/entry-bands/current/source-expandability.json
node tools/verify_entry_band_ui.cjs
python3 tools/summarize_publication_checks.py
```

原生文字测量、真实 UI 操作和目视检查必须配套复核；最后一条命令在完整目标未完成时返回 2。

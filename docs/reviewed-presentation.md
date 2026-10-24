# 当前通用源码语义展示

本轮按用户确认，将最近持续测试的通用语义结果采用为当前展示基线。项目首页进入通用画布，默认打开 Transformer 的 F1 语义详图；专用编辑器仍可通过独立链接访问。带 `case` 查询参数的旧首页链接保留原入口。

## 输入和状态

- 发布 IR：`data/semantic/0216717d966327f4.json`，与 `verification/helper-contracts/current/Transformer-current.json` 逐字节相同。
- 规范事实：3371 节点、3663 条边、78 个语义契约，没有用手写架构图替换事实 IR。
- 初始状态：`verification/input-placement/current/suite-report.json` 中的 `Transformer-F1`，包括返回概览的完整快照。
- F0：28 图元、37 连接、1610 × 1386、4 个交叉。
- F1：80 图元、80 连接、2098 × 3028、12 个交叉，总线长 28249.2。
- 已审核的局部继续展开：82 图元、81 连接、2221 × 3028、12 个交叉。

F1 是语义中间态。概览、详图、局部展开和源码层级继续使用同一份 IR；来源、操作数、调用身份、重复实例、共享参数、条件、状态和未知边界均保留。源码、CPU 和合并证据仍是不同维度，侧栏的 CPU 条目明确标为“Transformer · CPU 运行证据”。

## 文件与发布

`tools/publish_reviewed_presentation.py` 核对正式报告中的输入 SHA，校验 IR，复制审核输入并更新产品目录。它生成的 `data/semantic/presentations/transformer.json` 包含 IR digest、审核出处、默认 F1 状态和发布版本。重新运行该工具应产生相同文件。

`semantic_studio/presentation-profile.js` 负责目录默认选择、配置与 IR 的一致性校验、默认状态和保存状态优先级。没有展示配置的其他模型使用 `frontier(..., 'detail')` 与 `certifiedDetails()` 形成通用初始详图。模型名和案例选择仅存在于发布配置中，语义识别及绘图规则不依赖它们。

`semantic_studio/app.js` 加载 IR 和展示配置后，沿用已有 `publication.js`、`composition-layout.js`、`publication-renderer.js`。因此此前通过审核的输入布局、线干、短路径、模块列和质量回退都在实际页面使用，而不是只存在于审核 HTML 中。历史阶段发布脚本也会调用当前发布入口，避免将 Transformer 源码条目退回旧审核输入。

`tools/build_semantic_catalog.py` 重新构建目录后也会重新发布已接受的输入、默认模型和展示配置，避免重新扫描源码时丢失当前展示。目录将默认语义架构条目放在首位，其余模型继续保留各自的输入与身份。

## 保存与旧状态

浏览器存储改用 `summary-semantic:architecture-v2:<IR digest>:<展示版本>`。旧键不会删除，也不会覆盖新版初始展示。新版页面上的调整会在该版本下继续保存。

明确导入的图文档优先使用文档中的状态，其次是当前版本的浏览器状态，最后才使用发布默认状态。概览返回快照、进一步展开和手工位置继续随文档保存。专用编辑器的数据和存储未迁移或删除。

## 验证

`node tests/reviewed-presentation.test.cjs` 检查产品 IR 与审核输入的文件一致性、初始 F1、F0 返回、局部继续展开、保存重开、手工位移和错误配置拒绝。测试从当前产品输入重新绘制三种状态，并与已接受的实际 SVG 逐字节比较，独立检查所有规范节点和边的完整归属。

`python3 -m unittest discover -s tests -p test_reviewed_publication.py` 在临时目录检查重复发布、目录重建后保留审核版本、其他案例保留，以及审核输入被改动时拒绝发布。

本次全量回归 96 组、1092 项全部通过，并核对测试期间冻结的生产代码与测试文件哈希未变。实际浏览器首次打开 F1，完成返回 F0、再次进入 F1、展开 query 路径至 82/81、保存完整文档、返回 F0、重新打开至 82/81；三个实际导出的 SVG 与已接受的 F0/F1/局部展开 SVG 逐字节相同。保存文档的 IR 与发布输入完整相同，展开状态与正式局部展开状态相同，返回快照保留。截图、实际 SVG 和精简收据位于 `verification/reviewed-presentation/current/`；完整保存文档仅留在本地临时目录。

本轮不改变语义认证、投影或几何算法。此前报告中的视觉差距与巨型图性能边界保留历史含义；用户确认的是将已有结果接入当前展示，而不是新增对任意程序的证明。

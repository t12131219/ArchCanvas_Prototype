# 通用画布的共享节点样式

2026-10-25：视图模式、编辑模式、源码层级和架构表达统一采用专用参照图的图形语言。规则由通用节点事实选择，适用于整个模型目录及用户源码组合。

## 样式与信息安排

参照 `/home/fzg/Downloads/Transformer-unified.svg` 及 `snapshots/transformer_programmatic_guide/draw_transformer.py` 中 `COLORS`、`Scene.rect` 的柔和彩区、深色轮廓、圆角与居中算子条。加法/乘法沿用原有符号认证，使用白色圆点；条件保持六角形，未知操作保持虚线轮廓。源模块为大圆角浅蓝框，重复摘要为浅粉框，Attention 橙、Feed-forward/卷积蓝、Embedding 粉、Linear 紫、Softmax 绿、归一化和残差阶段黄。普通操作、输入输出和资源使用统一浅灰轮廓。

颜色选择读取 `kind`、原始 `operator`、已有 `semantic_type` 和认证路径的操作列表，不读取模型名、节点标签、案例 ID、源码哈希或专用坐标。未知源码模块不会仅凭名称获得某种算法样式；只有实际算子或已有语义证据才选择相应色系。没有张量证据时不添加虚构的矩阵网格。

`semantic_studio/publication-renderer.js` 的 `nodeAppearance()` 和 `nodeBody()` 是共同入口；视图、CLI SVG 导出及编辑器使用相同的图形和文字 CSS。源码层级和架构表达也经过该入口，保留原有简短标签粒度。新增缓存版本同步覆盖主页面、编辑 iframe 与 scene worker。

模块标题加粗左对齐，简短叶节点标题居中。原有小字全部保留，使用 13 px 深灰字、16 px 行距；长说明、操作数槽位、调用边界和依赖 DAG 左对齐，展开模块/长说明添加半透明浅底说明区。悬停说明补充完整 caption。编辑器现在显式加载共同 CSS，消除此前说明字号继承的差异。选择描边仅作用于主轮廓，说明底板不被误描边。字体沿用已有 Arial 测量，不改变节点尺寸。

## 验证

- 全量 **103 组、1141 项**测试通过，记录在 `verification/node-style/current/test-report.json`。测试运行期间冻结生产代码、测试和捕获器。
- `tools/audit_node_style.cjs` 比较修改前的独立引擎快照与当前引擎：目录 **43 模型、129 状态**（F0、F1、源码全部展开），逐项相等检查节点事实、边、精确绑定、位置/尺寸、图幅与完整归属桶。输入未被修改。源码证据范围下的全部展开与包含 CPU 运行事实的全部展开是不同范围，不混报原始 IR 总量。
- 原生浏览器审核 **6850 个节点、12257 个标题/说明文本**，使用真实 `getBoundingClientRect()` 检查文字包含于主轮廓，0.25 CSS px 容差，未发现越界。审核页 `glyphs.html` 显示实际节点及展开框标题区；展开框在字形审核中裁为标题高度，不声称这是完整布局截图。
- 实际画布验证 Transformer F1（80/80）、编辑器逐级进入 `self.encode → src_embedding`、MLP、ConditionalResidual、源码层级及 UnknownFusion。条件形状、未知虚线和编辑器 13 px 说明均保留。详图另测 146 个文本、编辑初始层 20 个文本、源码条件图 24 个文本，未发现越界。
- F0/F1/继续展开分别导出为 `transformer-F0.svg`、`transformer-F1.svg`、`transformer-finer.svg`，仍为 28/37、80/80、82/81。`review.html` 是真实 F1 导出的局部视窗；`style-preview.jpg` 为 CUA 浏览器截图。

历史回归中 9 组测试原先把节点样式与布局一起逐字节冻结。本轮通过 `tests/diagram-structure.cjs` 仅排除节点内部外观与 CSS，继续逐字节检查所有节点组身份/坐标、可见标题/说明内容、边路径、端口标签、图幅和质量 metadata。新增反例证明改变路线、组位置、文本或图幅仍会导致比较失败。旧审核 SVG 和输入保持原样。

测试与目录捕获均使用最终实现版本，执行期间冻结相应生产代码、测试和捕获器。

## 复现与边界

```bash
python3 tools/run_local_tests.py --out verification/node-style/current
git archive 0ff2ca4 semantic_studio | tar -x -C /path/to/before
node tools/audit_node_style.cjs /path/to/before/semantic_studio verification/node-style/current
python3 tools/serve_semantic_studio.py --port 8766
```

浏览器审核使用 CUA 打开 `verification/node-style/current/glyphs.html`，读取节点主轮廓与 `.paper-title,.paper-caption` 的原生矩形边界；不能用估算文本宽度冒充浏览器实测。

本轮只替换图形和文字安排，未修改语义认证、可逆切面、布局搜索与路由算法。既有数千节点性能优化继续保留，本轮不声称获得新的展开速度收益。有限目录验证不能保证所有未来源码和字体环境均理想。未执行 Git push。

## 小字样式调整（2026-10-25）

按后续反馈，删除小字说明区的独立浅色底板，让说明文字直接绘制在当前节点底色上；小字颜色统一改为淡灰 `#969da6`。保留字号、行距、对齐和完整文本。该修改继续由共同渲染入口覆盖所有通用节点、视图模式、编辑模式和 SVG 导出。页面、编辑 iframe 和 worker 版本同步更新为 `source-diagram-style-2`。上文浅底说明区及截图是前一版历史记录。

本次样式测试 3 项通过，语法检查与 `git diff --check` 通过。CUA 实测视图模式 66 处说明、编辑模式 15 处说明均为 `rgb(150, 157, 166)`，两种模式独立底板数量均为 0。实际画布截图保存在 `verification/node-style/caption-muted/actual-view.jpg`；本次未重跑上文全量审核。

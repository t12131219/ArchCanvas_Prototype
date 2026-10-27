# 源码结构内的 CPU 衔接验证

规则、兼容性与范围见 [迁移说明](../../../docs/source-runtime-integration.md)。

- `source.json`、`inputs.json`：独立动态分派样例及显式两组输入 × eval/train。
- `assisted.json`、`capture-report.json`：最终冻结实现上的真实隔离 CPU 凭据及哈希；四次运行、四个可衔接调用记录，IR 校验通过。
- `browser-assisted.json`、`browser-receipt-validation.json`：从浏览器配置运行探针实际返回的补证 IR；四次运行、源码事实摘要一致、worker 哈希一致、IR 校验通过。
- `browser-merged.png`、`browser-view.json`：源码图内的局部 CPU 子图，样例选择与来源约束。最终 Apply 后布线就绪。
- `native-validation.json`、`native-*-document.json`：源码、完整 CPU 与合并视图的中间/全部展开共六个状态，均无无效边，保存/恢复规范 IR 及几何一致。
- `regression/test-report.json`：110 组、1244 项全量测试通过，期间生产代码、测试及捕获器没有变化。

合并中间状态为 13 节点/11 边，合并全部展开为17/15；规范 IR 始终为54/36。完整 CPU 轨迹全部展开41/24。源码未知与未执行路径保留，多组运行不会混成一条前向流程。

浏览器验证了源码导入 → 输入规格读取 → CPU运行 → 载入 → 样例切换、收起/展开、各证据视图、F1、全部展开、检查器、原生图文档重开。Blob 下载没有报告完成事件，因此未声称按钮已将文件下载到磁盘；重开使用原生保存/恢复接口生成并核对的图文档。

ACT 未修改、未包装、未运行。未提交、未推送。

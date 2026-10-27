# ACT 外部用户案例黑箱测试（2026-10-27）

结论：局部源码导入与画布流程可用，整项目 ACT 模型自动解析未通过。没有增加 ACT 特判，没有修改生产源码或 ACT 源码，没有安装或执行模型，没有提交或推送。

## 测试过程

1. 通过现有 `semantic_adapter.cli inventory` 扫描原始 `Source_Code_Project/act`，读取 20 个 Python 文件、2 个 Markdown 文件，识别 12 个带 forward 的候选，无扫描诊断。扫描不是整项目调用图解析。
2. 用现有 `analyze` 分别解析 `policy.py:ACTPolicy` 与 `detr/models/detr_vae.py:DETRVAE`，构造参数均为 `{}`，未编造依赖模块、配置或运行输入。未将源文件拼接，也未重写 __call__ 为 forward。
3. 经浏览器“打开 IR / 图文档”文件选择器导入 DETRVAE.json，实际操作 F0、F1、全部源码单位、Apply、节点证据检查。
4. 用当前原生 API 生成图文档，核对完整 IR、精确边绑定和几何往返；再次经浏览器文件选择器打开 DETRVAE-F1-document.json，确认 42/58，来源与布局检查通过。浏览器下载事件测试未取得下载完成事件，不将其计为下载成功。
5. 测试后核对清单源码摘要未变；native-report.json 的 frozen=true 表明捕获期间生产源码未变。期间未修改测试和捕获器。

## 实际结果

| 状态 | 节点/边 | 源码关系检查 | 布局/路线 |
|---|---|---|---|
| ACTPolicy | 1/0 | IR 格式有效 | 仅 opaque，无本地 forward，未提取 __call__ |
| DETRVAE F0 | 42/58 | 通过 | 通过现有自动检查 |
| DETRVAE F1 | 42/58 | 通过 | 通过现有自动检查 |
| DETRVAE 全部已提取源码单位 | 179/194 | 通过，原始精确绑定保留 | 布局未通过，4 条连接被标记无效 |

F0 与 F1 相同；这次输入没有认证到局部语义契约，不能把“F1”按钮成功执行当成已经生成 ACT 架构详图。当前图中大量 branch join / phi 及跨分支连接，视觉组织仍不理想。格式有效、源码关系检查通过，也不表示完整项目已被理解。

完整图 4 个无效边：e00105、e00108、e00182 无合法路径，e00064 涉及无关值线路重叠；布局还报告 e00105/e00182 重叠。浏览器再次 Apply 后仍未解决。详见 browser-source.json 和 native-report.json。

## 阻塞完整 ACT 打开的通用能力缺口

- 产品页面当前接收 IR / 图文档，尚无直接选择项目目录、分析入口的完整流程；本次通过现有 CLI 生成 IR 后导入。
- 候选扫描与类入口解析以 forward 为主，ACTPolicy.__call__ 未被展开。
- 源码分析的定义表来自入口文件；本次 DETRVAE IR 的 sources 只包含 detr_vae.py，没有跨入 transformer.py、backbone.py 等项目定义。
- DETRVAE 依赖 backbones、transformer、encoder 等注入对象。现有入口没有把跨文件 build 工厂与构造参数对象连接起来；这些调用保持未知边界，没有错误地宣称已经解析。
- 构造器里的条件模块绑定、摄像头循环、列表 append、未覆盖的外部函数仍留下未知边界。共 17 个 opaque（详见 extraction-report.json），没有运行证据。
- 全展开路径选择与条件汇合图排布仍存在上述路线失败及较多交叉。

## 证据文件

- inventory.json：完整只读清单、候选与源码摘要。
- ACTPolicy.json / DETRVAE.json / extraction-report.json：未经手工改造的提取结果。
- check-native.cjs / native-report.json：可复现原生捕获、生产文件冻结摘要、保存往返。
- DETRVAE-F0-document.json / DETRVAE-F1-document.json / DETRVAE-source-document.json：可用“打开 IR / 图文档”重开；source 文档保留失败线路，不应视为合格布局。
- browser-reopened.json / browser-source.json / browser-inspector.txt：真实浏览器结果与证据检查。
- browser-final.png：最终保留的 DETRVAE F1 页面；browser-source.png：完整展开失败时的图。

复现：在 Summary_Merge 根目录运行 `python3 -m semantic_adapter.cli inventory --root ../../Source_Code_Project/act --output verification/act-blackbox/current/inventory.json`；用 `python3 -m semantic_adapter.cli analyze --source ../../Source_Code_Project/act/detr/models/detr_vae.py --entry DETRVAE --output verification/act-blackbox/current/DETRVAE.json` 生成 IR；运行 `node verification/act-blackbox/current/check-native.cjs` 核对原生图。浏览器导入上述 IR 或 F1 图文档。

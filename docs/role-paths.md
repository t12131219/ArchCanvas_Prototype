# 通用语义主图的可选角色路径

目标是在同一份完整事实图上组织语义主图，并保留局部细化与源码检查能力。本轮增加单条已认证角色路径的选择；它不宣称已完成与专用 Transformer 图的全面对应。

## 规则与边界

`paperRolePaths` 保存 `{node, certificate, role: ['exact', 'key']}`。角色来自节点实际附属的语义证书，必须准确指向本地内部节点。数组键保持原样，含点号的键不会被解释成嵌套路径。生产规则不按模型名称、案例 ID、哈希或专用坐标触发。

选择路径会开放必要的源码祖先，保留其他来源子树及必要同级节点。未知、条件、可变操作、独立对象身份、运行观测、重复和未选择的嵌套认证边界继续保护。外部引用不能成为本地展开授权；无效请求不能缩窄默认角色层。整组 `paperRoleDetails` 优先于同一区域的部分选择。显式局部打开状态及预算仍可能使请求暂缓。

回执区分已选择与实际显示。`operand_check` 仅核对选定端点及其 canonical 输入流在实际 SVG 中的接线，不能据此声称整个计算、所有 helper 或任意输入的执行行为已验证。收回路径不删除 canonical IR、调用身份、条件、来源或操作数槽位。

## 当前证据

新案例 `SeparateStages` 把计算分到不同 helper，静态提取 97 个节点、98 条边，未执行模型。

| CLI 状态 | 图元 / 边 | 尺寸 | 交叉 |
|---|---|---|---|
| 主图 | 13 / 11 | 716 × 954 | 1 |
| scores 路径 | 20 / 18 | 716 × 1518 | 1 |
| 整组角色 | 23 / 19 | 716 × 1772 | 1 |
| 更细源码状态 | 38 / 29 | 1436 × 2302 | 1 |

未选中的归一化和结果 helper 保持折叠。`SameSource` 的角色共享直接源码祖先，单路径与整组均为 17 个图元，因此部分选择不保证一定减少节点。

真实界面验证序列为 `13 → 20 → 保存重开20 → 13 → 20 → 展开全部40 → 撤销20 → 13`。UI 的“展开全部”使用当前展示容器集合，和 CLI 显式打开所有源码容器的 38 图元状态不同；两者分别审核，不互相冒充。UI 导出与按保存状态重建的 CLI SVG 逐字节一致，收回后恢复原 SVG。

Transformer 默认主图保持 86 图元、94 边、2230 × 3776、47 交叉，与上一版输入布局 SVG 逐字节一致。使用主图实际配置固定的通用几何选项，单路径变为 97 / 111、2230 × 5612、125 交叉；三条核心路径为 99 / 114、2230 × 5896、128 交叉。**增加的高度和交叉是未解决的视觉问题。** 固定配置的审核不能证明默认自动细化的质量或性能。

本轮 512 项测试通过，21 张正式 SVG 与另外两张 UI SVG 通过路径、终端和绑定审核；27 张浏览器原生 SVG 中测量 1409 段节点文字、72 段边标签，未发现越界。目视检查仍显示 Transformer 源码外框、长跨域连线、局部细化后的高度与参考组织差距。全部最细事实的恢复另测得 3371 节点、3663 边；不包含数千节点完整路由及 UI 性能结论。

## 复现

```bash
python tools/extract_role_paths.py
python tools/run_local_tests.py
node tools/audit_role_paths.cjs
python tools/audit_role_path_receipts.py
python tools/check_role_path_svgs.py
node tools/audit_source_expandability.cjs verification/symbolic-values/current/transformer-current.json verification/role-paths/current/source-expandability.json
node tools/audit_role_path_ui.cjs
python tools/check_role_path_ui_svgs.py
python tools/build_role_path_review.py
python tools/summarize_publication_checks.py
```

UI 产物需要通过真实导入、按钮、保存、重开和撤销生成；原生文字检查需要实际浏览器测量。汇总器会校验当前实现和产物哈希。总体目标保持进行中，汇总命令以退出码 2 表示证据一致但未完成完整目标。

下一步应让新增角色细节与主图共同规划，减少无解释价值的源码包装和长跨域路径，并在其他陌生、残缺和状态/控制组合中验证；保留端点与条件边界应先于紧凑布局。

# 可追踪的维度配置路径

本轮改进面向局部计算关系，不依赖模型名称、案例 ID、源码 SHA 或整体架构模板。
目标是在保留事实图和继续展开能力的前提下，让中间语义折叠状态解释源码路径，
避免把只服务于形状配置的标量运算画成特征主链。

## 证据与适用范围

`semantic_studio/dimension-paths.js` 从原始 IR 重新推导 Tensor 属性事实，
不接受标签或存储的符号证明代替证据。支持 `.shape` 的确切结果槽、`.ndim`、
别名与接口绑定，以及整数加、减、乘、整除、取模。每一步核对操作语法、
操作数数量、端口和结果槽；不求值，不证明维度具体值、形状合法或执行成功。

只有全部使用都通向已知配置端口的路径才附在消费节点上。参与特征计算、
返回或外流的结果仍显示；共享的维度读取仍保留其可见身份和证明依赖。
运行时专有区域、观测、可变操作、身份、条件、未知及控制祖先和非值依赖
会阻止相应证明。此规则使用源码 Tensor 契约，未执行这些新样例。

画布的“角色关系”粒度默认启用；`paperDimensionPaths:false` 可禁用。
打印和其他粒度保持原策略。规范 IR 不变，展示文档的
`publication.configuration_arithmetic` 保存 `dimension-paths/1` 证明行，
包括原始依赖、所有使用、来源、结果槽和 `not-performed` 求值声明；Inspector
“附属资源与配置”可检查消费节点上的 `configuration_proof`。

## 折叠与组合

已证明的源码流水路径可以保留自动摘要，例如“transpose → copy → reshape”，
而用户仍可打开原始操作。角色关系或局部表达要求的细节优先。跨区域上下文
进入中途操作时，保留消费端细节，也保留提供上下文的来源路径；不能仅为了
缩小图而丢掉实际连接位置。聚焦子图使用同一配置策略，外部维度证明附在
内部消费节点，避免产生孤立配置端点。

## 复现与审核

冻结基线为 `verification/local-relations/iteration-20-before-dimension-paths`，
来自提交 `dbe8354219048347b3346bb0ab74275ea18f561c`，保留原始文件字节。
新证据位于 `verification/dimension-paths/current`，不重写历史审核结果。

```sh
python3 tools/check_dimension_fixture_extraction.py
python3 tools/run_local_tests.py
node tools/audit_local_expressions.cjs --dimensions
python3 tools/audit_local_svg.py --dimensions
python3 tools/build_inline_review.py --dimensions
node tools/audit_dimension_ui.cjs
python3 tools/summarize_publication_checks.py
```

浏览器文字边界检查、实际 UI 保存/重开/再折叠和目视对照另存独立记录。
Python 审核重新解析源码 AST 和规范绑定，不以生产器的节点数量或标签作为
语义成立的依据。汇总返回 2 表示本轮证据一致、总体目标仍未完成。

这一步没有建立与专用参考图的完整角色及边界对应，也不解决全部密集交叉、
长期上下文通道、整图预算和图组覆盖。维度附注可能增加摘要高度；减少可见
节点不等于布局改善，实际尺寸与交叉须以本轮审核记录为准。

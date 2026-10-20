# 局部标签留白审核

生产规则按实际绘图父容器分配候选间距，测量后保守选择；不依赖 Transformer
名称或案例身份。人工几何测试图展示正例和拒绝例，Transformer 仅供评价。

本轮 386 项测试通过，22 张 SVG 的事实与路径审核通过，原始比例文字检查无
矩形越界。13 个既有状态与上轮 SVG 完全相同。真实编辑器与 CLI 导出一致，
收起 / 重开仍保留未知边界和规范 IR。

ForeignSignals 从 540×752 缩到 540×580。CrossedSignals 候选新增无关接触，
Transformer 两个候选增加交叉，均被拒绝。四张 Transformer 细化 SVG（原图及
候选）仍有面积预算问题，其中三区域的两张还有路径重叠。事实审核通过不表示
这些失败实验的几何已通过。整体目标仍未完成。

查看 `comparison.html`、`transformer-comparison.html` 和
[规则与结果说明](../../../docs/label-clearance.md)。生成和复核命令见该说明。
`.layout.json` 为可重建完整图文档，未纳入 Git；SVG、紧凑报告和浏览器产物保留。

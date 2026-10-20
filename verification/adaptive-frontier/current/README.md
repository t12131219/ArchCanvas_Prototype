# 局部自适应细化审核

`comparison.html` 比较嵌套认证、未完整认证和混合结构；
`transformer-comparison.html` 保留实际原图、自动状态、三个未采用候选及专用参考。

30 张 SVG，406 项测试；事实、角色、端口、切边和独立几何审核通过。
自动细化采用 SameSource、InterruptedMixer、ForeignComposition 的局部候选。
Transformer 三个候选都未采用，最终 SVG 不变，整体目标仍未完成。

完整规则、指标、重现命令和性能限制见 `docs/adaptive-frontier.md`。
完整布局文档可由生成器重建，不提交重复的 canonical IR。
UI 导入／导出文档与截图保留实际操作证据。
`render-pass-report.json` 保留本轮首次渲染报告的原始字节；最终报告只补全了从
实际文档导出的两个冗余行字段，所有 SVG、布局、输入和渲染器字节均保持。

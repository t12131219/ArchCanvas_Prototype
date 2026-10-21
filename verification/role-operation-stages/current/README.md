# 角色与后续运算合组的实际审核

本阶段安装可选的局部语义表达。完整目标仍在进行，默认视图不变。详见[实现与限制](../../../docs/role-operation-stages.md)、[SVG 审核页](review.html)、[原生文字报告](browser-text-report.json)、[独立事实报告](independent-report.json)及[真实编辑器报告](ui-report.json)。

冻结基线为 `3e59b2f`。重建正式输出：

```sh
python tools/freeze_role_operation_stages.py
node tools/audit_role_operation_stages.cjs
node tools/audit_role_operation_stages.cjs --large
node tools/audit_role_operation_ui.cjs
python tools/check_role_operation_stages.py
python tools/build_role_operation_review.py
```

大型 `.layout.json` 是可重建中间产物，不入库。真实编辑器产物 `ui-*.json/svg/png` 来自实际操作；UI 审核器复现其保存状态和正式 SVG。Transformer 的完整路由文档超过编辑器 20MB 导入上限，实际导入使用相同文档的 `schema/ir/state`，随后验证导出的 SVG 与正式输出一致；未更改应用的大小限制。

`browser-text-report.json` 来自浏览器 2 对 `text-qa.html` 执行只读 `browser-text-probe.js` 的原生文字边界测量。`visual-review.json` 保存实际观察与产物摘要，不能由重新运行命令冒充新的目视审核。

运行 `python tools/summarize_publication_checks.py` 校验本阶段证据。全部阶段检查通过后仍返回 2，表示完整用户目标尚未完成。

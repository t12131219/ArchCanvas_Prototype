# 主图与局部详图的复现

在仓库根目录 `prototype/Summary_Merge` 运行：

```sh
python3 tools/extract_diagram_sets.py
python3 tools/run_local_tests.py
node tools/audit_diagram_sets.cjs
python3 tools/audit_local_svg.py --diagram-set --dags
python3 tools/audit_role_detail_receipts.py --diagram-set
python3 tools/audit_diagram_assignments.py
python3 tools/build_diagram_set_review.py
python3 tools/render_diagram_set_review.py
node tools/verify_diagram_set_ui.cjs
node tools/audit_source_expandability.cjs verification/symbolic-values/current/transformer-current.json verification/diagram-set/current/source-expandability.json
python3 tools/summarize_publication_checks.py
```

最后一个命令成功核对本阶段证据时仍返回 2，表示完整目标尚未完成；不能将退出码 2 改为总体成功。栅格检查工具需要系统 `rsvg-convert` 与 Python Pillow。浏览器文字、保存重开及目视记录必须针对重新生成的实际图面另行采集，不能沿用旧摘要或重写旧哈希。

`current/comparison.html` 展示六组结果，`current/transformer-comparison.html` 展示主图、三个详图和专用评价参考，`current/text-qa.html` 保持实际 SVG 原生比例。各模型的 `index.html` 提供主图和详图导航、原始 SVG 及图文档链接。体积较大的自动生成 `*.layout.json` 未入库，运行生产器后可在本地打开。浏览器保存的 `ui-saved.layout.json` 是交互复核输入，已单独保留。

冻结旧渲染实现位于 `verification/local-relations/iteration-33-before-diagram-set`。六张主图应与对应 `baseline.svg` 字节相同。未知、条件、状态和重复实例的缺口不因详图规划而消失，详见 `manifest.json` 的逐目标分配及待展开列表。

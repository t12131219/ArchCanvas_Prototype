# 跨 helper 的局部依赖路径

源码包装层不应单独决定架构图的解释粒度。本轮将已有的连续路径摘要扩展为
可穿过普通源码 helper 的组合说明：平铺写法和提取 helper 后的写法，可以保留
相同的操作路径。规范 IR、源码层级、调用身份及每层输入输出切边不变。

`semantic_studio/local-pipelines.js` 的 `local-pipelines/2` 仍从已提取的精确绑定
建立局部计算依赖。候选范围最多包含六个主计算，必须形成完整单链，不能有
循环、分叉、中间结果逃逸或非值依赖。嵌套容器必须是实际抽取到的源码函数
或模块；展示分组不能冒充源码边界，直接绑定在容器本身的接口也不能被忽略。
未知、条件、控制、可变、身份、观测、重复及已认证边界继续阻止穿越。

每个说明新增 `source_boundaries`：保留容器、原父节点、源码、模块身份与该
边界的全部原始切边。它表达一条建模依赖路径，不证明纯度、融合、执行顺序、
输出数值相等或模型家族。配置附注沿用维度路径的证明范围。

自动角色粒度优先显示成立的路径摘要。角色请求、局部关系和中途外部上下文
仍可要求细节；默认摘要下面保留“打开外层 helper → 内层路径摘要 → 原始操作”
的展开过程。打印、其他粒度和 `paperPipelineSummaries:false` 沿用原策略。

## 验证

冻结基线为 `verification/local-relations/iteration-21-before-composed-paths`，
来自 `e9555cbb21ea0efb670b219ac3d445b5ed416b92`。七个新输入包含平铺/嵌套
重构、晚到上下文、中间结果外流、未知调用、条件计算和共享对象。它们在开发
中使用过，属于回归证据，不能充当未来冻结后的未见验收集。

```sh
python3 tools/check_composed_fixture_extraction.py
python3 tools/run_local_tests.py
node tools/audit_local_expressions.cjs --composed
python3 tools/audit_local_svg.py --composed
python3 tools/build_inline_review.py --composed
node tools/audit_composed_ui.cjs
python3 tools/summarize_publication_checks.py
```

独立 Python 审核重新建立源码子树和每层切边，核对操作路径、结果槽、配置
证明、实际 SVG 与 accounting。另存实际浏览器文字边界和 UI 导入、保存、
逐层展开、重开与再折叠记录。真实页面审核发现旧资源缓存后已更新脚本 URL
版本，重新生成正式产物；未沿用旧页面显示作为新实现的证据。

初次抽取样例使用了继承 helper，但当前静态分析器没有展开继承定义。该次
输出保留在 `verification/composed-paths/extraction-attempt-1`，不计入通过的新
样例；当前输入显式声明其方法。继承分析能力本轮未补齐。新样例仅静态抽取，
没有执行它们的程序，也未宣称执行成功。

## 本轮结果与限制

ComposedWeave 默认状态从 9 节点 / 6 边、540 × 608 px，变为 7 / 5、
508 × 442 px；交叉均为 0。其路径说明与 FlatWeave 一致。打开两层 helper
后为 13 节点 / 8 边、540 × 968 px。较低节点数来自展示折叠，不是删除计算。
规范 IR 的具体调用与每一层来源切边始终保留。

本轮 Transformer 的默认语义状态保持 100 / 106、2588 × 4530 px、57 处交叉，
未出现可跨越的新普通 helper 链。不能把此步称为 Transformer 布局收敛成果。
它改善的是通用规则对源码重构的稳定性。专用图对应、整图自适应预算、跨区域
上下文组织和密集连线仍待完成；汇总返回 2，目标保持未完成。

# 保留已选路径的通用连线优化

本轮在语义状态确定之后继续改善密集图的连线。原始事实、可见节点、模块分组、操作数绑定和物理端口保持一致，不通过隐藏细节减少交叉。生产规则只读取几何冲突及已兑现的局部约束，不依据模型名称、案例身份、源码哈希或专用参考坐标触发。

## 方法与接受条件

普通候选布局已选择较好的路径后，重新开始一次贪心路由可能失去先前修复。新增步骤从当前已选路径出发，优先复查冲突最多的少数边；尝试避开已有路径，或移动现有平行通道。自动入口用于无手工偏移、65–128 条可见边的 canvas 图，每图最多 32 次路由候选。

候选必须降低交叉、无关接触与异值重叠的加权冲突；不得引入新的无关接触关系，且接触、异值重叠、质量问题、路由失败与未放置标签不能增加。相对入口基线最多增加一次交叉，线长不超过 102%，字体与画布尺寸不得退化。节点和物理端口固定，已应用约束及已实现的列、上下文和入口关系必须保留。接受记录位于 `diagnostics.routing.selected_route_refinement`。

## 正式 SVG 结果

冻结基线为 `21e346c`。下面比较同一语义状态的实际 SVG；后两张是规划器尝试过、仍未被图组选中的候选。

| 图 | 节点 | 交叉：之前 → 当前 | 无关接触 | 异值重叠 |
|---|---:|---:|---:|---:|
| 主图 | 73 | 42 → 27 | 0 → 0 | 0 → 0 |
| 已选详图 1 | 43 | 4 → 4 | 0 → 0 | 0 → 0 |
| 已选详图 2 | 66 | 21 → 18 | 0 → 0 | 0 → 0 |
| 未选候选 1 | 79 | 116 → 106 | 15 → 7 | 6 → 3 |
| 未选候选 2 | 79 | 61 → 55 | 2 → 0 | 1 → 0 |

实际图组仍为一张主图与两张详图，直接表达目标 **74 → 74**，全部保留。候选 2 已通过单张图的质量检查，但替换已有详图会超过交叉代价容限，因此仍被规划器拒绝；不能将候选潜在的额外覆盖写成已选覆盖。相对更早的 49 项历史图组，仍有 8 项未直接表达，新增 33 项，历史缺口尚未补齐。

四个实际通用来源案例 MixedWeave、InterruptedMixer、WovenInputs 和 InterruptedPaths 保持不变。匿名平行通道与窄通道夹具证明此方法能在不依赖模型身份的情况下减少含糊连接，并保留未知、条件和状态元数据。

## 复核与边界

完整测试通过 **58 组、697 项**。独立检查器从 18 张 SVG 复算连线几何，核对节点、语义前沿、canonical 操作数与物理端口，检查变化路径没有新增节点内部或祖先标题侵入，并独立计算图组覆盖。浏览器按原生尺寸测量这 18 张图的节点文字及端口文字，未发现越界；截图保留主图的前后对照及当前图与专用参考的对照。

原始源码投影检查恢复 **3371 个节点、3663 条边**，全部 canonical ID 可见且原始 IR 不变。该检查没有执行数千节点整图 SVG 路由或验证其浏览器交互性能。本轮也没有新增编辑器导入、保存及重新打开验证。

实际视觉对照仍显示明显差距：通用图外框和附注较多，缩放后文字较小，主流程方向及总体组织仍与专用参考不同。本轮解决选定语义状态中的局部连线问题，不表示已完成与专用图的语义或视觉收敛。

## 产物与复现

产物在 `verification/selected-routes/current/`：`route-review.html` 为前后 SVG 对照，`transformer-review.html` 为专用参考对照，`text-qa.html` 为原生文字审核，`independent-report.json` 与 `browser-text-report.json` 为对应复核记录。

```bash
python3 tools/freeze_selected_routes.py
node tools/audit_selected_routes.cjs
node tools/audit_selected_routes.cjs --large
python3 tools/check_selected_routes.py
python3 tools/build_selected_routes_review.py
node tools/audit_source_expandability.cjs verification/helper-contracts/current/Transformer-current.json verification/selected-routes/current/source-expandability.json
```

布局 JSON 为可重新生成的本地产物，不纳入 Git。浏览器文字测量与截图需在实际浏览器内重新执行，以上命令不代替浏览器审核。

"""Build review pages from the actual captured SVG files, without re-rendering."""
from pathlib import Path
import argparse
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'verification/composition-rounds/current'
p=argparse.ArgumentParser();p.add_argument('--round',type=int,required=True);a=p.parse_args()
titles={1:'架构卡片与区域编排',2:'按消费范围归位输入',3:'跨区域端口朝向',4:'向上主流程与来源对齐',5:'粗细两档与局部展开'}
notes={3:'既有跨区依赖面向真实消费端。不同调用、结果和操作数绑定独立保留；本轮没有新增采用共享分叉。',4:'方向适用于通用架构编排。只翻转容器内部的行位置，标题保持在容器上方；连接重新计算。输出沿真实来源区域对齐。'}
(OUT/f'round{a.round}.html').write_text(f'<!doctype html><meta charset="utf-8"><title>第{a.round}轮：{titles[a.round]}</title><style>body{{background:#eef2f7;font:16px Arial}}svg{{max-width:100%;height:1100px;background:white}}</style><h1>第{a.round}轮：{titles[a.round]}</h1><p>{notes.get(a.round,"")}</p>'+(OUT/f'round{a.round}.svg').read_text())

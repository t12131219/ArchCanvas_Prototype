#!/usr/bin/env python3
import json
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from semantic_adapter.authoring import compile_module, preset_definitions
if __name__ == '__main__':
    rows=[]
    for definition in preset_definitions():
        rows.append({**definition,**compile_module(definition['source'],definition['entry'],definition['constructor'])})
    path=ROOT/'data/semantic/authoring-presets.json'
    path.write_text(json.dumps({'schema':'semantic-module-library/1','modules':rows},ensure_ascii=False,indent=2)+'\n')
    print(len(rows),'static presets',sum(len(r['ir']['nodes']) for r in rows),'source units')

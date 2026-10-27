"""External black-box acceptance: existing APIs, no source rewriting/config guessing."""
import hashlib
import json
from pathlib import Path
import sys
import time
from collections import Counter
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT))
from semantic_adapter import analyze, validate_ir
from semantic_adapter.sources import inventory
OUT=Path(__file__).parent
PROJECT=ROOT.parents[1]/'Source_Code_Project/act'
def hashes(paths): return {str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
production=[p for d in ('semantic_adapter','semantic_studio','yworks_edge_router_lab','tests') for p in (ROOT/d).rglob('*') if p.suffix in ('.py','.js','.cjs','.html','.css')]
production+=[Path(__file__)]
before=hashes(production)
inv=inventory([PROJECT]);source_before=hashes([PROJECT/x['path'] for x in inv['files']])
(OUT/'inventory.json').write_text(json.dumps(inv,ensure_ascii=False,indent=2)+'\n')
cases=inv['models']
rows=[]
for case in cases:
    start=time.perf_counter()
    row={'entry':case['entry'],'file':case['file'],'constructor':{},'factory_entry':False}
    try:
        ir=analyze(case['file'],case['entry'],project_root=PROJECT)
        (OUT/(case['entry']+'.json')).write_text(json.dumps(ir,ensure_ascii=False,indent=2)+'\n')
        row.update(nodes=len(ir['nodes']),edges=len(ir['edges']),opaque=sum(n['kind']=='opaque' for n in ir['nodes']),kinds=dict(Counter(n['kind'] for n in ir['nodes'])),contracts=len(ir.get('semantic_contracts',[])),sources=[s['physical'] for s in ir['sources']],validation=validate_ir(ir),unknown=[{'label':n['label'],'reason':n.get('reason'),'boundary':n.get('unknown_boundary')} for n in ir['nodes'] if n['kind']=='opaque'],runtime=ir['runtime'])
    except Exception as error: row['error']=str(error)
    row['elapsed_ms']=round((time.perf_counter()-start)*1000)
    rows.append(row)
    print(json.dumps({k:v for k,v in row.items() if k in ('entry','nodes','edges','opaque','error','elapsed_ms')},ensure_ascii=False),flush=True)
report={'scope':'unchanged original ACT; no execution, wrapper, rewrite or inferred constructor configuration','frozen':before==hashes(production),'source_unchanged':source_before==hashes([Path(p) for p in source_before]),'production_hashes':before,'source_hashes':source_before,'rows':rows}
(OUT/'extraction-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')

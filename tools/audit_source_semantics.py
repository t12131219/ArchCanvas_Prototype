#!/usr/bin/env python3
"""Repeat each native source -> IR -> actual SVG audit, without running models."""
import json
from pathlib import Path
import subprocess
import sys
ROOT=Path(__file__).resolve().parents[1]
PROTO=ROOT.parent
OUTPUT=ROOT/'verification/source-semantic-audit'
OUTPUT.mkdir(parents=True,exist_ok=True)
jobs=[
 ('transformer', ['transformer_programmatic_guide/tests/audit_semantics.py']),
 ('module-exports',['module_programmatic_guide/verify.py','--png']),
 ('modelzoo-exports',['model_zoo_programmatic_guide/verify.py',str(PROTO/'model_zoo_programmatic_guide/generated'),'--png']),
 ('timeseries-exports',['timeseries_programmatic_guide/verify.py',str(PROTO/'timeseries_programmatic_guide/generated'),'--png']),
 ('module-negative',['module_programmatic_guide/checks/verify_semantics.py','--report',str(OUTPUT/'module-negative.json')]),
 ('modelzoo-negative',['model_zoo_programmatic_guide/checks/endpoint_projection.py']),
 ('timeseries-negative',['timeseries_programmatic_guide/check_arrow_semantics.py',str(PROTO/'timeseries_programmatic_guide/generated'),'--report',str(OUTPUT/'timeseries-negative.json')]),
]
records=[]
for name,args in jobs:
    result=subprocess.run([sys.executable,str(PROTO/args[0]),*args[1:]],cwd=PROTO,capture_output=True,text=True)
    (OUTPUT/(name+'.log')).write_text(result.stdout+result.stderr)
    records.append(dict(check=name,passed=result.returncode==0,exit_code=result.returncode,log=str((OUTPUT/(name+'.log')).relative_to(ROOT))))
    print(name, 'PASS' if result.returncode==0 else 'FAIL',flush=True)
    if result.returncode:print(result.stderr[-2000:],flush=True)
report=dict(passed=all(r['passed'] for r in records),model_executed=False,checks=records,
            scope='current source adapters and native exported SVGs; historical snapshots retain historical defects')
(OUTPUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
raise SystemExit(0 if report['passed'] else 1)

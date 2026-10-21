"""Static extraction of unfamiliar, broken and guarded joint-planning examples."""
import hashlib
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from semantic_adapter.analyzer import analyze
source=ROOT/'tests/semantic_fixtures/joint_expressions.py'
out=ROOT/'verification/joint-expressions/current';out.mkdir(parents=True,exist_ok=True)
rows=[]
for name in ['RelayWorkshop','BrokenRelayWorkshop','GuardedRelayWorkshop']:
    ir=analyze(source,name);file=out/(name+'.json');file.write_text(json.dumps(ir,ensure_ascii=False,indent=2)+'\n')
    rows.append({'name':name,'input':str(file.relative_to(ROOT)),'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
(out/'extraction.json').write_text(json.dumps({'source':str(source.relative_to(ROOT)),'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'runtime_executed':False,'rows':rows},indent=2)+'\n')
print(json.dumps({'fixtures':len(rows),'runtime_executed':False}))

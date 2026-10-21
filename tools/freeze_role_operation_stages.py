"""Reproduce the isolated renderer baseline without overwriting different bytes."""
import hashlib
import json
from pathlib import Path
import subprocess
ROOT=Path(__file__).resolve().parents[1]
OUT=Path('/tmp/archcanvas-role-operation-stages-before')
COMMIT='3e59b2f'
files=subprocess.check_output(['git','ls-tree','-r','--name-only',COMMIT,'--','semantic_studio'],cwd=ROOT,text=True).splitlines()
files=[f for f in files if Path(f).suffix in {'.js','.html','.css'}]
OUT.mkdir(parents=True,exist_ok=True)
hashes={}
for f in files:
    data=subprocess.check_output(['git','show',COMMIT+':'+f],cwd=ROOT);target=OUT/Path(f).name
    if target.exists():assert target.read_bytes()==data,('existing baseline differs',target)
    else:target.write_bytes(data)
    hashes[f]=hashlib.sha256(data).hexdigest()
snapshot={'commit':COMMIT,'files':hashes};target=OUT/'snapshot.json'
if target.exists():assert json.loads(target.read_text())==snapshot
else:target.write_text(json.dumps(snapshot,indent=2)+'\n')
print(json.dumps({'commit':COMMIT,'files':len(files),'verified':True}))

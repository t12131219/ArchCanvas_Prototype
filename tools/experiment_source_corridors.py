"""Reproduce a rejected layout experiment without modifying production files."""
import hashlib
import json
import os
from pathlib import Path
import subprocess

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'verification/source-corridors/current'
BASE='8476c9b'
CACHE=Path('/tmp/archcanvas-source-corridor-experiment-8476c9b')

if __name__=='__main__':
    files=json.loads((OUT/'snapshot.json').read_text())['files']
    for kind in ['before','candidate']:
        target=CACHE/kind/'semantic_studio';target.mkdir(parents=True,exist_ok=True)
        for file,digest in files.items():
            blob=subprocess.check_output(['git','show',BASE+':'+file],cwd=ROOT)
            assert hashlib.sha256(blob).hexdigest()==digest
            (target/Path(file).name).write_bytes(blob)
    subprocess.run(['patch','-p1','--batch','-i',str(OUT/'prototype.patch')],cwd=CACHE/'candidate',check=True)
    env={**os.environ,'ARCHCANVAS_EXPERIMENT_ROOT':str(CACHE/'candidate')}
    unit=subprocess.run(['node',str(ROOT/'tools/experiments/source-corridors.test.cjs')],cwd=ROOT,env=env,capture_output=True,text=True)
    (OUT/'prototype-tests.log').write_text(unit.stdout+unit.stderr);unit.check_returncode()
    subprocess.run(['node','tools/experiment_source_corridors.cjs',str(CACHE)],cwd=ROOT,check=True)

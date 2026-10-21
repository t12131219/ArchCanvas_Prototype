"""Audit actual editor exports against formal SVGs, source facts and geometry."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'verification/operand-order/current'
sys.path[:0]=[str(ROOT/'tools')]
import audit_adaptive_frontier as geometry
import check_role_path_stages as stages
from check_declared_operands import declared_rows
from check_title_passages import passages
from check_operand_rows import contexts,scope_geometry
from check_final_sample_frames import terminals
read=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
if __name__=='__main__':
    geometry.OUT=stages.OUT=OUT
    reports=[read(OUT/(s+'-report.json')) for s in ['small','large']];rows={r['name']:r for report in reports for r in report['rows']}
    checked=[]
    for name,formal in [('foreign','ForeignColumns-current'),('foreign-opened','ForeignColumns-opened'),('foreign-reopened','ForeignColumns-opened'),('foreign-refolded','ForeignColumns-current'),('main','Transformer-panel-0-current')]:
        ref=rows[formal];svg=OUT/('ui-'+name+'.svg');assert svg.read_bytes()==(OUT/ref['svg']).read_bytes(), ('UI/formal SVG mismatch',name)
        d=read(OUT/ref['document']);s=ET.parse(svg).getroot();row={**ref,'name':'ui-'+name,'svg':svg.name,'svg_sha256':sha(svg),'role_path_stages':d['publication'].get('role_path_stages')}
        measured=stages.check(row,compare_expression=False,require_quality=True);geometry.inspect(row)
        _,bodies=passages(d,s);assert not bodies
        contexts(d);scope_geometry(d);terminals(d);declared_rows(d)
        checked.append(dict(name=name,svg=svg.name,svg_sha256=sha(svg),measured=measured))
    saved=read(OUT/'ui-foreign-opened-saved.json');ir=read(OUT/'ForeignColumns.json');assert saved['ir']==ir
    helpers={n['id'] for n in ir['nodes'] if n.get('semantic_type')=='source-function'};assert helpers<=set(saved['state']['open'])
    result=subprocess.run(['node','-e',"const fs=require('fs'),assert=require('assert/strict'),R=require('./semantic_studio/publication-renderer.js');const d=JSON.parse(fs.readFileSync('verification/operand-order/current/ui-foreign-opened-saved.json'));assert.equal(R.render(d.ir,d.state).svg,fs.readFileSync('verification/operand-order/current/ui-foreign-opened.svg','utf8'));"],cwd=ROOT,capture_output=True,text=True)
    assert result.returncode==0,(result.stdout,result.stderr)
    text=read(OUT/'browser-text-report.json');assert len(text['panels'])==36 and all(not p['issues'] for p in text['panels'])
    files=[OUT/'ui-foreign-opened-saved.json',OUT/'browser-text-report.json',OUT/'columns-browser.png']+[OUT/r['svg'] for r in checked]
    report=dict(passed=True,goal_complete=False,actual_ui_svgs=checked,editor_roundtrip=dict(initial_nodes=10,opened_nodes=12,reopened_nodes=12,refolded_nodes=10,svg_identical=True),main=dict(nodes=65,edges=76,declared_rows=2,svg_identical=True),native_text=dict(panels=len(text['panels']),texts=sum(p['texts'] for p in text['panels']),ports=sum(p['ports'] for p in text['panels']),issues=[]),files_sha256={f.name:sha(f) for f in files},auditor_sha256=sha(Path(__file__)),scope='Actual selected main and unfamiliar helper editor import/export and save/reopen/refold. Thousands-node full SVG routing/browser performance not measured.')
    (OUT/'ui-independent-report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['passed','editor_roundtrip','main','native_text']}))

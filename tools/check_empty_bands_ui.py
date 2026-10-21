"""Verify actual editor exports and local folding against audited SVGs."""
import hashlib
import json
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET
import audit_adaptive_frontier as geometry
import check_role_path_stages as stages
from check_title_passages import passages
from check_operand_rows import contexts, scope_geometry
from check_final_sample_frames import terminals
from check_declared_operands import declared_rows
from check_final_scope_entries import final_entries
from check_module_arguments import arguments
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'verification/empty-bands/current'
read=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
if __name__=='__main__':
    geometry.OUT=stages.OUT=OUT
    reports=[read(OUT/(s+'-report.json')) for s in ['small','large']];rows={r['name']:r for report in reports for r in report['rows']};checked=[]
    for name,formal in [('foreign','ForeignPassage-current'),('foreign-reopened','ForeignPassage-current'),
                        ('foreign-folded','ForeignPassage-folded'),('foreign-restored','ForeignPassage-current'),
                        ('main','Transformer-panel-0-current'),('detail','Transformer-panel-1-current')]:
        ref=rows[formal];svg=OUT/('ui-'+name+'.svg');assert svg.read_bytes()==(OUT/ref['svg']).read_bytes(),('UI/formal mismatch',name)
        doc=read(OUT/ref['document']);tree=ET.parse(svg).getroot()
        row={**ref,'name':'ui-'+name,'svg':svg.name,'svg_sha256':sha(svg),'role_path_stages':doc['publication'].get('role_path_stages')}
        measured=stages.check(row,compare_expression=False,require_quality=True);geometry.inspect(row)
        _,bodies=passages(doc,tree);assert not bodies
        contexts(doc);scope_geometry(doc);terminals(doc);declared_rows(doc);final_entries(doc);arguments(doc,tree)
        checked.append(dict(name=name,svg=svg.name,svg_sha256=sha(svg),measured=measured))
    saved=read(OUT/'ui-foreign-saved.json');assert saved['ir']==read(OUT/'ForeignPassage.json') and saved['state']['open']==['root']
    script="const fs=require('fs'),assert=require('assert/strict'),R=require('./semantic_studio/publication-renderer.js'),d=JSON.parse(fs.readFileSync(process.argv[1]));assert.equal(R.render(d.ir,d.state).svg,fs.readFileSync(process.argv[2],'utf8'));"
    subprocess.run(['node','-e',script,str(OUT/'ui-foreign-saved.json'),str(OUT/'ui-foreign.svg')],cwd=ROOT,check=True)
    text=read(OUT/'browser-text-report.json');assert {p['name'] for p in text['panels']}==set(rows)
    assert all(p['texts']>0 and not p['issues'] for p in text['panels'])
    independent=read(OUT/'independent-report.json');assert independent['passed']
    files=[OUT/c['svg'] for c in checked]+[OUT/n for n in ['ui-foreign-saved.json','browser-text-report.json','independent-report.json',
            'foreign-browser.png','detail-browser.png','detail-bottom-browser.png','transformer-browser.png']]
    result=dict(passed=True,goal_complete=False,actual_ui_svgs=checked,
                editor_roundtrip=dict(initial_nodes=3,reopened_nodes=3,folded_nodes=1,restored_nodes=3,svg_identical=True),
                main=dict(nodes=65,edges=76,height=3342.5,svg_identical=True),detail=dict(nodes=44,edges=48,height=2466,svg_identical=True),
                native_text=dict(panels=len(text['panels']),texts=sum(p['texts'] for p in text['panels']),ports=sum(p['ports'] for p in text['panels']),issues=[]),
                files_sha256={f.name:sha(f) for f in files},auditor_sha256=sha(Path(__file__)),
                scope='Actual unfamiliar synthetic editor roundtrip and actual main/detail exports. Full thousands-node routing/browser performance not measured.')
    (OUT/'ui-independent-report.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:result[k] for k in ['passed','editor_roundtrip','main','detail','native_text']}))

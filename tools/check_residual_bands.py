"""Independently check actual SVG geometry and exact monotone path mapping."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/residual-bands/current'
sys.path.insert(0, str(ROOT / 'tools'))
import audit_adaptive_frontier as geometry
from audit_diagram_assignments import assignments
from check_title_passages import passages
from check_final_sample_frames import terminals
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def compare(a, b, sa, sb):
    for key in ['ir', 'state', 'architecture', 'publication', 'expression_goals', 'expression_coverage', 'summary_goals', 'summary_coverage']:
        assert a.get(key) == b.get(key), ('changed facts', key)
    rec = b['diagnostics']['routing'].get('residual_band_compaction', {})
    bands = rec.get('bands', []) if rec.get('accepted') else []
    T = lambda y: y - sum(max(0, min(y, r['bottom']) - r['top']) for r in bands)
    assert all(r['bottom'] - r['top'] >= 1 for r in bands)
    assert all(x['bottom'] < y['top'] for x,y in zip(bands,bands[1:]))
    protected = []
    for p in a['layout']['nodes']:
        protected.append((p['y']-8, p['y']+(p['header'] if p.get('expanded') else p['h'])+8))
        if p.get('expanded'):protected.append((p['y']+p['h']-8,p['y']+p['h']+8))
    for p in a['layout']['labels']:protected.append((p['y']-8,p['y']+p['h']+8))
    for e in a['layout']['edges']:
        points=e['route']['points']
        for p in [points[0],points[-1]]:protected.append((p['y']-8,p['y']+8))
        for p,q in zip(points,points[1:]):
            if p['y']==q['y']:protected.append((p['y']-8,p['y']+8))
    for p in rec.get('protected_gaps',[]):protected.append((p['y']-8,p['y']+p['h']+8))
    for band in bands:
        assert any(w['top']<=band['top'] and band['bottom']<=w['bottom'] for w in rec['windows'])
        assert all(band['bottom']<=lo or band['top']>=hi for lo,hi in protected), ('not empty',band)
    old={p['id']:p for p in a['layout']['nodes']};new={p['id']:p for p in b['layout']['nodes']}
    assert old.keys()==new.keys()
    for id,p in new.items():
        was=old[id];assert p=={**was,'y':T(was['y']),'h':T(was['y']+was['h'])-T(was['y'])}, ('changed node',id)
        if not p.get('expanded'):assert p['h']==was['h']
    old={e['id']:e for e in a['layout']['edges']};assert old.keys()=={e['id']for e in b['layout']['edges']}
    for e in b['layout']['edges']:
        was=old[e['id']];assert e=={**was,'route':{**was['route'],'points':[{**p,'y':T(p['y'])}for p in was['route']['points']]}}, ('changed path or operand',e['id'])
    assert b['layout']['labels']==[{**p,'y':T(p['y'])}for p in a['layout']['labels']]
    for key in ['node_accounting','edge_accounting','representatives','frame_ownership','frame_title_routing']:
        assert a['layout'].get(key)==b['layout'].get(key), key
    # Check the actual SVG shape coordinates, not only its document or report.
    for doc,svg in [(a,sa),(b,sb)]:
        actual={n.get('data-node-id'):n for n in svg.iter()if n.get('data-node-id')};assert actual.keys()==new.keys()
        for p in doc['layout']['nodes']:
            n=actual[p['id']];xy=list(map(float,re.findall(r'-?[\d.]+',n.get('transform'))));assert xy==[p['x'],p['y']]
            shape=next(c for c in n if c.tag.endswith(('rect','circle','path')))
            if shape.tag.endswith('rect'):assert float(shape.get('width'))==p['w'] and float(shape.get('height'))==p['h']
        assert list(map(float,svg.get('viewBox').split()))==[doc['layout']['bounds'][k]for k in ['x','y','w','h']]
    texts=lambda s:{n.get('data-node-id'):[ET.tostring(t,encoding='unicode')for t in n if t.tag.endswith('text')]for n in s.iter()if n.get('data-node-id')}
    assert texts(sa)==texts(sb),'visible text changed'
    applied={r['id']for r in a['layout']['constraint_receipts']if r['status']=='applied'}
    assert applied<={r['id']for r in b['layout']['constraint_receipts']if r['status']=='applied'}
    return bands


def main():
    reports=[read(OUT/'small-report.json')]+[read(OUT/f'Transformer-panel-{i}-report.json')for i in range(3)]
    hashes=reports[0]['implementation_sha256'];snapshot=reports[0]['snapshot']
    for report in reports:assert report['implementation_sha256']==hashes and report['snapshot']==snapshot
    for f,h in hashes.items():assert sha(ROOT/f)==h,('stale producer',f)
    for f,h in snapshot['files'].items():assert hashlib.sha256(subprocess.check_output(['git','show',snapshot['commit']+':'+f],cwd=ROOT)).hexdigest()==h
    blob=subprocess.check_output(['git','show',snapshot['commit']+':'+snapshot['large_report']['path']],cwd=ROOT)
    assert hashlib.sha256(blob).hexdigest()==snapshot['large_report']['sha256'];prior=json.loads(blob)
    extraction=read(OUT/'extraction.json');assert sha(ROOT/extraction['source'])==extraction['source_sha256']
    for row in extraction['rows']:assert sha(ROOT/row['input'])==row['sha256']
    geometry.OUT=OUT;rows=[];count=0
    for report in reports:
        for request in report['rows']:
            assert sha(ROOT/request['input'])==request['input_sha256'];docs=[];svgs=[];direct=[];crossings=[]
            for result in request['results']:
                for key in ['svg','document']:assert sha(OUT/result[key])==result[key+'_sha256']
                if result.get('reuse'):
                    was=next(r for r in prior['rows']if r['name']==request['name']);assert was['state']==request['state'] and was['input_sha256']==request['input_sha256']
                    capture=next(r for r in was['results']if r['suffix']=='current')
                    for key in ['svg','document']:assert capture[key+'_sha256']==result[key+'_sha256']
                d=read(OUT/result['document']);svg=ET.parse(OUT/result['svg']).getroot()
                assert d['ir']==read(ROOT/request['input']) and d['state']=={**request['state'],'view':'publication'}
                measured=geometry.inspect({**result,'name':request['name']+'-'+result['suffix']});title,bodies=passages(d,svg);assert not bodies,bodies;terminals(d)
                goals=d['expression_goals']['goals'];direct.append({g['id']for g,ok in zip(goals,assignments(d['ir'],goals,{**d,'quality':result['quality']},svg))if ok})
                for key,kind in [('node_accounting','nodes'),('edge_accounting','edges')]:
                    ids=[id for group in d['layout'][key].values()for id in group];assert len(ids)==len(set(ids)) and set(ids)=={n['id']for n in d['ir'][kind]}
                paths={p.get('data-edge-id'):p for p in svg.iter()if p.get('data-edge-id')}
                for e in d['layout']['edges']:
                    p=paths[e['id']];assert p.get('data-source-port')==e['source_port'] and p.get('data-target-port')==e['target_port']
                    if not e.get('bundle_members'):assert p.get('data-canonical-source')==e['canonical_source'] and p.get('data-canonical-target')==e['canonical_target']
                docs.append(d);svgs.append(svg);crossings.append(measured['crossings']);count+=1
            bands=compare(*docs,*svgs);assert direct[0]==direct[1]
            aq,bq=[r['quality']for r in request['results']]
            assert crossings[0]==crossings[1] and bq['wire_length']<=aq['wire_length']
            assert all(bq[k]<=aq[k]for k in ['native_width_px','native_height_px'])
            assert bq['min_canvas_font_px']>=aq['min_canvas_font_px'] and set(bq['issues'])<=set(aq['issues'])
            assert not bq['route_failures'] and not bq['line_geometry']['unrelated_contacts'] and all(p['same_value']for p in bq['line_geometry']['overlapping_paths'])
            rows.append(dict(name=request['name'],bands=bands,crossings=crossings,dimensions=[[q['native_width_px'],q['native_height_px']]for q in [aq,bq]],wire_length=[aq['wire_length'],bq['wire_length']],direct_goals=[len(d)for d in direct]))
    (OUT/'independent-report.json').write_text(json.dumps(dict(schema='residual-bands-independent/1',passed=True,svgs=count,rows=rows,
        scope='Actual SVG shapes, text and paths; exact canonical facts/operands/conditions and monotone physical terminal mapping, 8px obstacle guards, explicit clearances, accounting and direct goals. Full goal convergence remains unproven.'),indent=2)+'\n')
    print(json.dumps(dict(passed=True,svgs=count,changed=[r for r in rows if r['bands']]),ensure_ascii=False))
if __name__=='__main__':main()

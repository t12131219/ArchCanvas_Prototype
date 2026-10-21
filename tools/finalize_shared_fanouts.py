"""Bind live browser measurements, tests and independent SVG checks."""
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'verification/shared-fanouts/current'
read=lambda p:json.loads(p.read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()

if __name__=='__main__':
    checks=read(OUT/'independent-checks.json');assert checks['passed'] and checks['svg_count']==62
    testpath=ROOT/'verification/local-relations/current/test-report.json';tests=read(testpath)
    assert all(r['exit_code']==0 for r in tests['commands'])
    for report in [tests,checks]:
        for f,h in report['implementation_sha256'].items():assert sha(ROOT/f)==h,('stale producer',f)
    browser=read(OUT/'browser-report.json');assert browser['url'].endswith('/verification/shared-fanouts/current/all-review.html')
    assert len(browser['rows'])==checks['svg_count']
    reports=[read(OUT/'small-report.json')]+[read(OUT/f'Transformer-panel-{i}-report.json')for i in range(3)]
    captures={r['svg']:r for report in reports for row in report['rows']for r in row['results']}
    assert {r['file']for r in browser['rows']}==captures.keys()
    for row in browser['rows']:
        assert not row['overflows'],(row['file'],row['overflows'])
        svg=ET.parse(OUT/row['file']).getroot()
        paths=[dict(id=e.get('data-edge-id'),d=e.get('d'))for e in svg.iter()if e.get('data-edge-id')]
        assert row['paths']==paths,('browser path mismatch',row['file'])
        # Compare original attribute strings, avoiding numeric serialization rounding.
        dots=[dict(source=e.get('data-fanout-source'),port=e.get('data-source-port'),edges=json.loads(e.get('data-fanout-edges')),x=e.get('cx'),y=e.get('cy'))for e in svg.iter()if e.get('class')=='paper-fanout-junction']
        assert row['junctions']==dots,('browser junction mismatch',row['file'])
        assert sha(OUT/row['file'])==captures[row['file']]['svg_sha256']
    source=read(OUT/'source-expandability.json');assert source['all_canonical_ids_visible'] and source['canonical_ir_unchanged']
    assert sha(ROOT/source['input'])==source['input_sha256']
    producers=['tools/freeze_shared_fanouts.py','tools/extract_shared_fanouts.py','tools/audit_shared_fanouts.cjs','tools/check_shared_fanouts.py','tools/build_shared_fanouts_review.py','tools/finalize_shared_fanouts.py','docs/shared-fanouts.md']
    artifacts=['snapshot.json','extraction.json','small-report.json',*[f'Transformer-panel-{i}-report.json'for i in range(3)],'independent-checks.json','browser-report.json','source-expandability.json','review.html','transformer-review.html','generic-review.html','all-review.html','review.png','generic-review.png']
    result=dict(schema='shared-fanouts-completion/1',baseline='ea77524',passed=True,goal_complete=False,
        tests=dict(groups=len(tests['counts']),count=sum(tests['counts'].values()),report=str(testpath.relative_to(ROOT)),sha256=sha(testpath)),
        independent_svg_count=checks['svg_count'],browser=dict(svg_count=len(browser['rows']),nodes=sum(r['nodes']for r in browser['rows']),node_texts=sum(r['node_texts']for r in browser['rows']),port_labels=sum(r['port_labels']for r in browser['rows']),overflows=0,tolerance_native_svg_px=1,measurement=browser['measurement']),
        producer_sha256={f:sha(ROOT/f)for f in producers},artifact_sha256={f:sha(OUT/f)for f in artifacts},
        limitations=['Full architecture convergence is incomplete.','Raw source projection preserves IDs; full-source SVG routing and browser performance were not verified.','No new editor file import/export exercise.','Shared ink improves; summed per-edge wire length can increase by the recorded terminal convergence cost.'])
    (OUT/'completion-report.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items()if not k.endswith('sha256')},indent=2))

"""Bind frozen tests, actual SVG/DOM observations and editor exports."""
import json
import xml.etree.ElementTree as ET
from check_call_boundaries import ROOT, OUT, read, sha, reports


if __name__=='__main__':
    tests=read(OUT/'test-report.json'); independent=read(OUT/'independent-checks.json')
    assert independent['passed'] and not independent['goal_complete']
    assert len(tests['commands'])==len(tests['counts'])==94 and sum(tests['counts'].values())==1031
    assert all(c['exit_code']==0 for c in tests['commands'])
    for table in [tests['implementation_sha256'],independent['implementation_sha256']]:
        for file,h in table.items():assert sha(ROOT/file)==h, ('stale implementation',file)
    captures=[c for report in reports() for row in report['rows'] for c in row['results']]
    assert len(captures)==36
    for c in captures:
        for key in ['svg','document']:assert sha(OUT/c[key])==c[key+'_sha256']
    dom=read(OUT/'browser-dom-checks.json')
    assert len(dom)==36 and {a['file'] for a in dom}=={c['svg'] for c in captures}
    for item in dom:
        root=ET.parse(OUT/item['file']).getroot()
        nodes={n.get('data-node-id'):n for n in root.iter() if n.get('data-node-id')}
        assert set(nodes)=={n['id'] for n in item['nodes']}
        for n in item['nodes']:
            assert [t['text'] for t in n['texts']]==[''.join(c.itertext()) for c in nodes[n['id']] if c.tag.endswith('text')]
            assert all(t['inside'] for t in n['texts'])
        labels=[n for g in root.iter() if 'paper-label' in g.get('class','').split() for n in g.iter() if n.tag.endswith('text')]
        assert [t['text'] for t in item['labels']]==[''.join(n.itertext()) for n in labels]
        assert all(t['inside'] for t in item['labels'])
    pairs=[('ui-boundary.svg','ReadWorkshop-current.svg'),('ui-bindings.svg','ReadWorkshop-before.svg'),
           ('ui-open.svg','ReadWorkshop-open-current.svg'),('ui-reopened.svg','ui-open.svg'),
           ('ui-return-boundary.svg','ReadWorkshop-current.svg'),('ui-controls-restored.svg','ReadWorkshop-current.svg')]
    for a,b in pairs:assert sha(OUT/a)==sha(OUT/b), (a,b)
    ir=read(OUT/'ReadWorkshop.json');saved=read(OUT/'ui-open-document.json')
    assert saved['ir']==ir and saved['state']['paperReadSummary']=='boundary' and saved['state']['paperAuto'] is False
    root=ET.parse(OUT/'ui-source.svg').getroot()
    assert {n.get('data-id') for n in root.iter() if n.get('data-id')}=={n['id'] for n in ir['nodes']}
    assert {n.get('data-edge-id') for n in root.iter() if n.get('data-edge-id')}=={n['id'] for n in ir['edges']}
    assert all(n.get('data-route-valid')=='true' for n in root.iter() if n.get('data-edge-id'))
    source=read(OUT/'source-projection.json')
    assert source['nodes']==source['ir_nodes']==3371 and source['edges']==source['ir_edges']==3663
    assert sha(ROOT/source['input'])==source['input_sha256'] and source['full_svg_rendered'] is False
    for file in ['transformer-review.png','boundary-compact.png','editor-boundary.png','editor-final.png']:assert (OUT/file).stat().st_size>10000
    files=[p for p in OUT.iterdir() if p.is_file() and p.suffix in ['.svg','.png','.html','.json'] and not p.name.endswith('.layout.json') and p.name!='progress-report.json']
    auditors=['audit_call_boundaries.cjs','check_call_boundaries.py','build_call_boundaries_review.py','extract_call_boundaries.py','finalize_call_boundaries.py']
    result=dict(schema='call-boundaries-progress/1',goal_complete=False,baseline='015fd95',passed=True,
        tests=1031,test_groups=94,formal_svgs=36,
        browser=dict(figures=len(dom),nodes=sum(len(a['nodes']) for a in dom),
            texts=sum(len(n['texts']) for a in dom for n in a['nodes']),port_texts=sum(len(a['labels']) for a in dom),overflow=0),
        ui_svg_matches=[dict(actual=a,formal=b,sha256=sha(OUT/a)) for a,b in pairs],
        ui_expansion=[9,12,16,19,23],ui_source_nodes=len(ir['nodes']),ui_source_edges=len(ir['edges']),
        ui_return='Original compact document imported after source view; selector bindings/boundary also round-tripped independently',
        source_projection=source,default_transformer_f0_f1_unchanged=True,
        opt_in_transformer_f0=dict(nodes=28,edges=37,boundary_summaries=2,width=848,height_before=1676,height_after=1660,
            crossings_before=9,crossings_after=8,wire_before=15059.3,wire_after=15151.3),
        limitations=['Boundary coverage does not fulfill folded internal dependency goals',
            'EscapingRead and ConditionalRead each add one crossing in this opt-in view',
            'F0/F1 overall semantic and visual convergence remains incomplete',
            'Final Transformer F0/F1 control round trip and thousands-node full SVG performance remain unverified'],
        artifacts_sha256={str(p.relative_to(ROOT)):sha(p) for p in files},
        auditor_sha256={name:sha(ROOT/'tools'/name) for name in auditors},implementation_sha256=independent['implementation_sha256'])
    (OUT/'progress-report.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k not in ['artifacts_sha256','auditor_sha256','implementation_sha256']}))

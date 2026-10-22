"""Bind frozen tests/captures, independent checks, DOM text and actual UI exports."""
import json
import xml.etree.ElementTree as ET
from pathlib import Path
from check_source_summary_headings import ROOT, OUT, read, sha, reports

if __name__ == '__main__':
    independent=read(OUT/'independent-checks.json')
    tests=read(OUT/'test-report.json')
    assert all(c['exit_code']==0 for c in tests['commands'])
    for table in [tests['implementation_sha256'],independent['implementation_sha256']]:
        for file,digest in table.items():assert sha(ROOT/file)==digest, ('stale file',file)
    captures=[c for report in reports() for row in report['rows'] for c in row['results']]
    assert len(captures)==28
    for c in captures:
        for key in ['svg','document']:assert sha(OUT/c[key])==c[key+'_sha256']
    dom=read(OUT/'browser-dom-checks.json')
    assert {a['file'] for a in dom}=={c['svg'] for c in captures} and len(dom)==28
    for item in dom:
        root=ET.parse(OUT/item['file']).getroot()
        nodes={n.get('data-node-id'):n for n in root.iter() if n.get('data-node-id')}
        assert set(nodes)=={n['id'] for n in item['nodes']}
        for n in item['nodes']:
            assert [t['text'] for t in n['texts']]==[''.join(c.itertext()) for c in nodes[n['id']] if c.tag.endswith('text')]
            assert all(t['inside'] for t in n['texts'])
        labels=next(n for n in root.iter() if n.get('id')=='port-labels')
        assert len(list(labels))==item['labels']
    comparisons=[('ui-small-coarse.svg','UnnamedWork-current.svg'),('ui-small-open.svg','UnnamedWork-open-current.svg'),
        ('ui-small-return.svg','UnnamedWork-current.svg'),('ui-transformer-F0.svg','Transformer-F0-current.svg'),
        ('ui-transformer-F1.svg','Transformer-F1-0-current.svg'),('ui-transformer-return.svg','Transformer-F0-current.svg')]
    for actual,formal in comparisons:assert sha(OUT/actual)==sha(OUT/formal), (actual,formal)
    source=ET.parse(OUT/'ui-small-source.svg').getroot()
    ir=read(OUT/'UnnamedWork.json')
    assert {n.get('data-id') for n in source.iter() if n.get('data-id')}=={n['id'] for n in ir['nodes']}
    assert {n.get('data-edge-id') for n in source.iter() if n.get('data-edge-id')}=={n['id'] for n in ir['edges']}
    assert all(n.get('data-route-valid')=='true' for n in source.iter() if n.get('data-edge-id'))
    saved=read(OUT/'ui-small-open.json');assert saved['ir']==ir
    source_projection=read(OUT/'source-projection.json')
    assert source_projection['nodes']==source_projection['ir_nodes']==3371
    assert source_projection['edges']==source_projection['ir_edges']==3663
    assert source_projection['full_svg_rendered'] is False
    f1=[r for report in reports() for r in report['rows'] if r['name'].startswith('Transformer-F1-')]
    assert len(f1)==3 and all(r['results'][0]['svg_sha256']==r['results'][1]['svg_sha256'] for r in f1)
    for file in ['heading-review.png','overview-review.png']:assert (OUT/file).stat().st_size>10000
    files=[p for p in OUT.iterdir() if p.is_file() and p.suffix in ['.svg','.png','.html','.json'] and not p.name.endswith('.layout.json') and p.name!='completion-report.json']
    audit_files=[ROOT/'tools'/name for name in ['audit_local_svg.py','check_source_summary_headings.py','build_source_summary_headings_review.py',
        'extract_source_summary_headings.py','finalize_source_summary_headings.py']]
    result=dict(schema='source-summary-headings-completion/1',goal_complete=False,baseline='6884dc1',
        tests=sum(tests['counts'].values()),test_groups=len(tests['counts']),formal_svgs=28,
        browser=dict(figures=len(dom),nodes=sum(len(a['nodes']) for a in dom),texts=sum(len(n['texts']) for a in dom for n in a['nodes']),
            port_labels=sum(a['labels'] for a in dom),overflow=0),
        actual_ui_svg_matches=[dict(actual=a,formal=b,sha256=sha(OUT/a)) for a,b in comparisons],
        small_ui=dict(coarse=4,first_expand=7,operations=10,save_reopen=10,source_nodes=12,source_edges=11,return_coarse=4),
        transformer_ui=dict(fixed_document_roundtrip=[28,65,28],joint_dropdown_controls_verified=False),source_projection=source_projection,
        limitations=['F0 overall proportions, direction, input routes and annotation density still differ from dedicated collapsed reference',
            'F1 global convergence and final joint controls remain incomplete','Thousands-node full SVG routing/browser performance unverified'],
        artifacts_sha256={str(p.relative_to(ROOT)):sha(p) for p in files},audit_tools_sha256={str(p.relative_to(ROOT)):sha(p) for p in audit_files},
        implementation_sha256=independent['implementation_sha256'])
    (OUT/'completion-report.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k not in ['artifacts_sha256','audit_tools_sha256','implementation_sha256']}))

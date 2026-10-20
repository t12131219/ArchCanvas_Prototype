"""Consolidate current evidence without claiming full reference convergence."""
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET
from audit_return_region_receipts import verify
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'verification/return-regions/current'
def read(f):
    return json.loads((OUT/f).read_text())
def sha(f):
    return hashlib.sha256(f.read_bytes()).hexdigest()
def main():
    render=read('render-report.json');digest=sha(OUT/'render-report.json')
    for file,h in render['implementation_sha256'].items():
        assert sha(ROOT/file)==h,('stale producer',file)
    checkpoint=ROOT/render['checkpoint'];assert sha(checkpoint)==render['checkpoint_sha256']
    frozen=json.loads(checkpoint.read_text())
    for file,h in frozen['files'].items():
        assert sha(checkpoint.parent/'implementation'/file)==h
    extraction=ROOT/render['extraction'];assert sha(extraction)==render['extraction_sha256']
    x=json.loads(extraction.read_text());assert not x['runtime_executed'] and len(x['rows'])==5
    assert sha(ROOT/x['source'])==x['source_sha256']
    for row in x['rows']:
        assert sha(ROOT/row['input'])==row['sha256']
    assert sha(ROOT/render['reference']['file'])==render['reference']['sha256']
    assert len(render['rows'])==25
    for row in render['rows']:
        for field in ['svg','document']:
            assert sha(OUT/row[field])==row[field+'_sha256']
        assert sha(ROOT/row['input'])==row['input_sha256']
        assert not row['quality']['issues'] and not row['quality']['line_geometry']['unrelated_contacts']
    for file in ['svg-report.json','receipt-report.json','native-text-report.json','ui-report.json']:
        assert read(file)['render_report_sha256']==digest
    assert len(read('svg-report.json')['results'])==len(read('receipt-report.json')['results'])==25
    native=read('native-text-report.json');assert len(native['rows'])==26
    assert all(not r['failures'] for r in native['rows'])
    for row in native['rows']:
        assert sha(OUT/row['svg'])==row['svg_sha256']
    tests=read('test-report.json');assert all(c['exit_code']==0 for c in tests['commands'])
    for file,h in tests['implementation_sha256'].items():
        assert sha(ROOT/file)==h,('stale tests',file)
    assert sum(tests['counts'].values())==496 and tests['counts']['return-regions']==7
    ui=read('ui-report.json')
    assert ui['generic_sequence']==[14,19,21,21,14] and ui['transformer_sequence']==[86,91,86]
    assert ui['generic_saved_reopened'] and ui['canonical_ir_unchanged'] and ui['cli_svg_equal'] and ui['exact_refold_svg']
    for file,h in ui['artifacts_sha256'].items():
        assert sha(OUT/file)==h
    reconstruction=read('ui-reconstruction.json')
    assert sha(OUT/'cli-transformer-opened.layout.json')==reconstruction['document_sha256']
    assert sha(OUT/'ui-transformer-opened.svg')==sha(OUT/'cli-transformer-opened.svg')==reconstruction['svg_sha256']
    assert not reconstruction['quality']['issues']
    for file,h in reconstruction['implementation_sha256'].items():
        assert sha(ROOT/file)==h
    detail=read('cli-transformer-opened.layout.json');assert verify(detail,ET.parse(OUT/'ui-transformer-opened.svg'))==18
    recovery=read('source-expandability.json')
    assert recovery['all_canonical_ids_visible'] and recovery['canonical_ir_unchanged']
    assert (recovery['visible_nodes'],recovery['visible_edges'])==(3371,3663)
    assert sha(ROOT/recovery['input'])==recovery['input_sha256']
    unchanged=['UnknownReturns','StatefulReturns','MixedWeave','ConditionalCarry']
    for name in unchanged:
        assert next(c for c in render['comparisons'] if c['name']==name)['svg_unchanged']
    transformer=next(c for c in render['comparisons'] if c['name']=='transformer')
    assert transformer['current']['nodes']==86 and transformer['before']['nodes']==87
    assert transformer['current']['width']>transformer['before']['width']
    visual=read('visual-review.json');assert not visual['goal_complete'] and visual['agent_viewed']
    for file,h in visual['artifacts_sha256'].items():
        assert sha(OUT/file)==h
    result={'schema':'return-regions-validation/1','evidence_consistent':True,'goal_complete':False,
        'render_report_sha256':digest,'tests':sum(tests['counts'].values()),'svg_panels':25,'additional_ui_detail_svg':1,
        'native_texts':sum(r['texts'] for r in native['rows']),'native_edge_labels':sum(r['labels'] for r in native['rows']),
        'generic_sequence':ui['generic_sequence'],'transformer_sequence':ui['transformer_sequence'],'transformer_comparison':transformer,
        'raw_source_recovery':{'nodes':3371,'edges':3663,'full_routed_ui_performance_verified':False},
        'limitations':['Full semantic and visual correspondence to the dedicated reference remains incomplete.',
        'Generic source wrappers, long cross-scope paths and crossings remain.',
        'Joint main/detail expression planning and broader held-out state/control/routing compositions remain incomplete.',
        'Current synchronous rendering blocks browser operations; no responsive performance claim.',
        'Expanded return interfaces may increase visible nodes; Transformer width increases 64px while height, wire and crossings decrease.'],
        'artifacts_sha256':{f:sha(OUT/f) for f in ['render-report.json','svg-report.json','receipt-report.json','native-text-report.json','test-report.json','ui-report.json','visual-review.json','source-expandability.json','ui-reconstruction.json']}}
    (OUT/'validation-report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:result[k] for k in ['evidence_consistent','goal_complete','tests','svg_panels','additional_ui_detail_svg','native_texts','generic_sequence','transformer_sequence']}))
    raise SystemExit(2)
if __name__=='__main__':
    main()

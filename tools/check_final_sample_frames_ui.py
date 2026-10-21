"""Check saved output of real file-chooser/editor operations and native text QA."""
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

OUT = Path(__file__).resolve().parents[1]/'verification/final-sample-frames/current'
read=lambda n:json.loads((OUT/n).read_text())
sha=lambda n:hashlib.sha256((OUT/n).read_bytes()).hexdigest()
if __name__=='__main__':
    initial=read('ui-input.json');ir=initial['ir'];formal=read('ConditionalNeighborRuns-current.layout.json')
    opened,refolded,raw=[read(n) for n in ['ui-expanded-saved.json','ui-refolded-saved.json','ui-source-saved.json']]
    assert all(d['schema']=='semantic-canvas/1' and d['ir']==ir for d in [opened,refolded,raw])
    frame=formal['diagnostics']['routing']['final_sample_frame_refinement']['frames'][0]
    seq=next(s for s in formal['publication']['inline_sequences']['sequences'] if s['sequence']==frame['target']);suffix=seq['remainders'][0]['node']
    assert set(opened['state']['open'])==set(formal['publication']['open'])|{suffix}
    assert set(refolded['state']['open'])==set(formal['publication']['open'])
    assert sha('ConditionalNeighborRuns-current.svg')==sha('ui-initial.svg')==sha('ui-refolded.svg')==sha('ui-restored-auto.svg')
    assert sha('ui-expanded.svg')==sha('ui-expanded-reopened.svg')
    rows=[]
    for name,counts in [('ui-initial.svg',(30,31)),('ui-expanded.svg',(34,33)),('ui-expanded-reopened.svg',(34,33)),('ui-refolded.svg',(30,31)),('ui-restored-auto.svg',(30,31)),('ui-source.svg',(103,95))]:
        svg=ET.parse(OUT/name).getroot();nodes={e.get('data-id') for e in svg.iter() if e.get('data-id')};edges={e.get('data-edge-id') for e in svg.iter() if e.get('data-edge-id')}
        assert (len(nodes),len(edges))==counts,name
        if name.startswith('ui-expanded'):
            assert frame['node'] in nodes and suffix in nodes and all(m in nodes for m in seq['remainders'][0]['instances'])
        if name=='ui-source.svg':assert nodes=={n['id'] for n in ir['nodes']} and edges=={e['id'] for e in ir['edges']}
        rows.append(dict(file=name,nodes=len(nodes),edges=len(edges),sha256=sha(name)))
    expected={r['name']:r for report in ['small-report.json','large-report.json'] for r in read(report)['rows']}
    browser=read('browser-text-report.json');assert len(browser['rows'])==len(expected)==32
    for r in browser['rows']:
        f=expected[r['panel']];assert not r['issues'] and r['texts']>0 and (r['nodes'],r['edges'])==(f['nodes'],f['edges'])
    labels=sum(r['labels'] for r in browser['rows']);assert labels==90
    shots=['mixed-review.png','main-browser.png','editor-browser.png','editor-expanded.png','reference-browser.png']
    result=dict(passed=True,method='Actual file chooser import; Save/SVG dialogs read in complete chunks; suffix double-click expansion; Save/reimport; frame minus refold; automatic granularity restoration; raw source Expand all.',rows=rows,native_text_panels=32,port_labels=labels,screenshots={n:sha(n) for n in shots},canonical_ir_unchanged=True,limits='Small fixture editor operations; full large SVG routing/browser performance unverified.')
    (OUT/'ui-report.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(dict(passed=True,states=len(rows),native_text_panels=32,port_labels=labels)))

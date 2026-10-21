"""Bind completed tests, SVG checks and actual browser measurements together."""
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'verification/residual-bands/current'
read=lambda p:json.loads(p.read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
if __name__=='__main__':
    tests=read(ROOT/'verification/local-relations/current/test-report.json')
    assert all(c['exit_code']==0 for c in tests['commands'])
    for f,h in tests['implementation_sha256'].items():assert sha(ROOT/f)==h,('stale test file',f)
    independent=[read(OUT/f)for f in ['independent-report.json','adaptive-independent-report.json']]
    assert all(r['passed']for r in independent)
    reports=[read(OUT/'small-report.json')]+[read(OUT/f'Transformer-panel-{i}-report.json')for i in range(3)]+[read(OUT/'adaptive-report.json')]
    captures={}
    for report in reports:
        for f,h in report['implementation_sha256'].items():assert sha(ROOT/f)==h,('stale producer',f)
        for row in report['rows']:
            for r in row.get('results',[row]):
                for key in ['svg','document']:assert sha(OUT/r[key])==r[key+'_sha256']
                captures[r['svg']]=r
    browser=read(OUT/'browser-report.json');assert not browser['failures'];assert browser['svgs']==len(captures)==sum(r['svgs']for r in independent)
    assert {r['artifact']for r in browser['rows']}==captures.keys()
    for row in browser['rows']:
        d=read(OUT/captures[row['artifact']]['document']);assert row['shapes']==len(d['layout']['nodes'])
    # Bind browser-visible inline SVGs to exactly the vector files audited.
    import re
    page=(OUT/'all-review.html').read_text()
    for file in captures:
        match=re.search(r'<article data-artifact="'+re.escape(file)+r'">.*?(<svg\b.*?</svg>)',page,re.S);assert match,file
        actual=ET.fromstring(match[1]);original=ET.parse(OUT/file).getroot()
        for node in [actual,original]:node.attrib.pop('width',None);node.attrib.pop('height',None)
        assert ET.tostring(actual)==ET.tostring(original),('stale browser vector',file)
    artifacts=['snapshot.json','extraction.json','small-report.json',*[f'Transformer-panel-{i}-report.json'for i in range(3)],
        'adaptive-report.json','independent-report.json','adaptive-independent-report.json','browser-report.json','source-expandability.json',
        'review.html','details-review.html','generic-review.html','all-review.html','review.png','details-review.png','generic-review.png']
    report=dict(passed=True,test_groups=len(tests['commands']),tests=sum(tests['counts'].values()),svgs=len(captures),
        browser_shapes=browser['shapes'],browser_texts=browser['texts'],artifacts_sha256={f:sha(OUT/f)for f in artifacts},
        test_report_sha256=sha(ROOT/'verification/local-relations/current/test-report.json'),
        tooling_sha256={str(f.relative_to(ROOT)):sha(f)for f in [ROOT/'docs/residual-bands.md',*sorted((ROOT/'tools').glob('*residual*.py')),*sorted((ROOT/'tools').glob('*residual*.cjs'))]},
        goal_complete=False,remaining='Further generic semantic/layout convergence, broader unseen state/control compositions and full-source SVG/UI performance remain unproven.')
    (OUT/'completion-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items()if k not in ['artifacts_sha256','remaining']}))

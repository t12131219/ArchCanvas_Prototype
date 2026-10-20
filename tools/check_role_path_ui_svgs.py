"""Apply shared real-path/terminal/canonical-binding checks to actual UI SVGs."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import xml.etree.ElementTree as ET
import audit_local_svg as shared
from audit_input_dock_receipts import verify

OUT = Path(__file__).resolve().parents[1] / 'verification/role-paths/current'
report = json.loads((OUT / 'ui-report.json').read_text())
for row in report['rows']:
    verify(json.loads((OUT / row['document']).read_text()), ET.parse(OUT / row['svg']))
with tempfile.TemporaryDirectory(prefix='archcanvas-role-ui-') as temporary:
    folder = Path(temporary)
    rows = [{**r, 'svg': str(OUT / r['svg']), 'document': str(OUT / r['document'])} for r in report['rows']]
    (folder / 'render-report.json').write_text(json.dumps({'rows': rows}))
    shared.OUT = folder
    sys.argv = [__file__]
    shared.main()
    result = json.loads((folder / 'svg-report.json').read_text())
    result['render_report_sha256'] = hashlib.sha256((OUT / 'render-report.json').read_bytes()).hexdigest()
    result['ui_report_sha256'] = hashlib.sha256((OUT / 'ui-report.json').read_bytes()).hexdigest()
    (OUT / 'ui-svg-report.json').write_text(json.dumps(result, indent=2) + '\n')

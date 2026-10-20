"""Apply the shared actual SVG geometry and canonical-binding auditor."""
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
import audit_local_svg as shared
from audit_input_dock_receipts import verify

OUT = Path(__file__).resolve().parents[1] / 'verification/role-source-frames/current'
report = json.loads((OUT / 'render-report.json').read_text())
for row in report['rows']:
    verify(json.loads((OUT / row['document']).read_text()), ET.parse(OUT / row['svg']))
shared.OUT = OUT
sys.argv = [__file__]
shared.main()

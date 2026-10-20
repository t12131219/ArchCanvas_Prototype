"""Check actual SVG routes, operands, source ownership and input docks."""
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
import audit_local_svg as shared
from audit_input_dock_receipts import verify as verify_docks
from audit_role_source_frame_receipts import verify as verify_frames

OUT = Path(__file__).resolve().parents[1] / 'verification/adaptive-role-paths/current'
report = json.loads((OUT / 'render-report.json').read_text())
for row in report['rows']:
    document, tree = json.loads((OUT / row['document']).read_text()), ET.parse(OUT / row['svg'])
    verify_docks(document, tree)
    verify_frames(document, tree)
shared.OUT = OUT
sys.argv = [__file__]
shared.main()

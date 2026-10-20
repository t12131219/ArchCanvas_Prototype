"""Reuse the shared core XML/path auditor on this stage's actual artifacts."""
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
import audit_local_svg as shared
from audit_input_dock_receipts import verify as verify_docks
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/role-paths/current'
report = json.loads((OUT / 'render-report.json').read_text())
for row in report['rows']:
    verify_docks(json.loads((OUT / row['document']).read_text()), ET.parse(OUT / row['svg']))
# No stage-specific switch: run the shared core counts, real SVG polyline,
# terminal, canonical operand, bundle and actual stage-cut checks. Exact new
# role selection/operand receipts are independently checked in the companion.
shared.OUT = OUT
sys.argv = [__file__]
shared.main()

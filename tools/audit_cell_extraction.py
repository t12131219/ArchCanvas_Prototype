"""Compare the actual frozen and current extraction, not a synthesized old IR."""
import ast
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/cell-interfaces/current'
FROZEN = Path('/tmp/archcanvas-cell-interfaces-before-e098d10')
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()

if __name__ == '__main__':
    extraction = json.loads((OUT / 'extraction.json').read_text())
    source = ROOT / extraction['source']
    syntax = ast.parse(source.read_text())
    rows = []
    for item in extraction['rows']:
        code = 'import json; from semantic_adapter import analyze; print(json.dumps(analyze(' + repr(str(source)) + ', ' + repr(item['entry']) + ')))'
        prior = json.loads(subprocess.check_output([sys.executable, '-c', code], cwd=FROZEN, text=True))
        current = json.loads((ROOT / item['input']).read_text())
        oldfile = OUT / (item['entry'] + '-source-before.json')
        oldfile.write_text(json.dumps(prior, indent=2) + '\n')
        assert len(prior['nodes']) == len(current['nodes'])
        assert len(prior['edges']) == len(current['edges'])
        mapping = {}
        changed = []
        # Same-location chained calls can renumber compute IDs when an opaque
        # inner call becomes known. Match the unchanged lowering order and
        # exact source spans, then verify every endpoint through that mapping.
        for previous, n in zip(prior['nodes'], current['nodes']):
            candidate = previous['id']
            mapping[candidate] = n['id']
            assert n['source'] == previous['source']
            if previous['kind'] != n['kind']:
                assert previous['kind'] == 'opaque' and n['kind'] == 'compute'
                assert n['framework_type'] in {'torch.nn.RNNCell', 'torch.nn.GRUCell', 'torch.nn.LSTMCell'}
                loc = n['source'][0]
                call = next(v for v in ast.walk(syntax) if isinstance(v, ast.Call) and
                            (v.lineno, v.col_offset, v.end_lineno, v.end_col_offset) ==
                            (loc['line'], loc['column'], loc['end_line'], loc['end_column']))
                assert n['cell_call'] == dict(rule_version='source-cell-call/1', positional_count=len(call.args),
                    keyword_names=[k.arg for k in call.keywords], positional_expansion=any(isinstance(a, ast.Starred) for a in call.args),
                    keyword_expansion=any(k.arg is None for k in call.keywords))
                changed.append(dict(before=candidate, current=n['id'], framework=n['framework_type'], call=ast.unparse(call)))
        for before, after in zip(prior['edges'], current['edges']):
            assert {**before, 'source': mapping[before['source']], 'target': mapping[before['target']]} == after
        rows.append(dict(entry=item['entry'], before=str(oldfile.relative_to(ROOT)), before_sha256=sha(oldfile),
                         current=item['input'], current_sha256=sha(ROOT / item['input']), changes=changed,
                         all_source_locations_and_operand_edges_preserved=True))
    report = dict(schema='cell-extraction-audit/1', passed=True, baseline='e098d10', rows=rows,
                  frozen_analyzer_sha256=sha(FROZEN / 'semantic_adapter/analyzer.py'),
                  analyzer_sha256=sha(ROOT / 'semantic_adapter/analyzer.py'))
    (OUT / 'extraction-audit.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))

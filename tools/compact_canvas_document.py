"""Create an editor import document without duplicated derived layout data."""
import argparse
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    document = json.loads(args.input.read_text())
    if document.get('schema') not in ['semantic-canvas/1', 'archcanvas-architecture-document/1']:
        parser.error('Expected a supported canvas document containing canonical ir and state')
    compact = {k: document[k] for k in ['schema', 'ir', 'state']}
    serialized = json.dumps(compact, ensure_ascii=False, separators=(',', ':'))
    args.output.write_text(serialized)
    print(json.dumps({'bytes': len(serialized.encode()), 'canonical_nodes': len(compact['ir']['nodes']),
                      'canonical_edges': len(compact['ir']['edges']), 'state_preserved': True}))


if __name__ == '__main__':
    main()

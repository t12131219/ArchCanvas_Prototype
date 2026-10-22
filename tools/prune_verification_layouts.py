#!/usr/bin/env python3
"""Prune only explicitly ignored historical layout exports; dry-run by default."""
import argparse
from collections import Counter
import fnmatch
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
# These are the active result and the two previous baselines used by its audit.
KEEP = ('verification/stage-exit-paths/', 'verification/read-binding-rows/',
        'verification/stage-sample-frames/')


def git(*args, input=None):
    return subprocess.run(['git', *args], cwd=ROOT, input=input,
                          stdout=subprocess.PIPE, check=True).stdout


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def files():
    return sorted(p for p in (ROOT / 'verification').rglob('*')
                  if p.is_file() and not p.is_symlink())


def plan():
    tracked = set(git('ls-files', '-z', '--', 'verification').decode().split('\0'))
    patterns = [line.lstrip('/') for line in (ROOT / '.gitignore').read_text().splitlines()
                if line and not line.startswith(('#', '!')) and '.layout.json' in line]
    candidates = [p for p in files() if p.name.endswith('.layout.json')]
    # --no-index is deliberately absent: tracked documents cannot qualify.
    result = subprocess.run(['git', 'check-ignore', '--stdin', '-z'], cwd=ROOT,
        input=('\0'.join(str(p.relative_to(ROOT)) for p in candidates)+'\0').encode(),
        stdout=subprocess.PIPE, check=False)
    if result.returncode not in (0, 1):
        raise RuntimeError('git check-ignore failed')
    ignored = set(result.stdout.decode().split('\0'))
    rows = []
    for p in candidates:
        name = p.relative_to(ROOT).as_posix()
        if (name in tracked or name not in ignored or name.startswith(KEEP)
                or p.name.lower().startswith('ui-')
                or not any(fnmatch.fnmatchcase(name, pattern) for pattern in patterns)):
            continue
        if p.resolve() != p or not p.is_relative_to(ROOT / 'verification'):
            raise RuntimeError('refusing nonlocal or symlink path: '+name)
        st = p.stat()
        rows.append(dict(path=name, bytes=st.st_size, mtime_ns=st.st_mtime_ns))
    return rows


def summary(rows):
    by = Counter()
    for row in rows:
        by['/'.join(row['path'].split('/')[:2])] += row['bytes']
    return dict(files=len(rows), bytes=sum(r['bytes'] for r in rows),
                gib=round(sum(r['bytes'] for r in rows)/1024**3, 3),
                by_directory=dict(by.most_common()))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='delete the current eligible exports')
    parser.add_argument('--report', type=Path, required=True, help='save a new cleanup manifest')
    args = parser.parse_args()
    report_path = args.report.resolve()
    if report_path.exists():
        parser.error('report already exists; choose a new path')
    rows = plan()
    result = dict(schema='verification-layout-prune/1', applied=False,
        head=git('rev-parse', 'HEAD').decode().strip(),
        gitignore_sha256=digest(ROOT / '.gitignore'), protected_prefixes=list(KEEP),
        policy='Only untracked, explicitly ignored historical *.layout.json exports. '
               'Preserve active three rounds, UI documents and all other file types. '
               'Historical full-layout audits require regeneration; SVG reviews remain.',
        summary=summary(rows), removed=[], candidates=rows)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(result, indent=2)+'\n')
    if args.apply:
        before = files()
        result['verification_bytes_before'] = sum(p.stat().st_size for p in before)
        targets = {r['path'] for r in rows}
        # Fingerprint every retained file, including fixture IRs, frozen code,
        # SVGs, reports and the active layouts, to prove they were not changed.
        retained = {str(p.relative_to(ROOT)):dict(bytes=p.stat().st_size, sha256=digest(p))
                    for p in before if str(p.relative_to(ROOT)) not in targets and p != report_path}
        result['retained_files'] = retained
        report_path.write_text(json.dumps(result, indent=2)+'\n')
        # Revalidate the entire selection before the first deletion.
        if plan() != rows:
            raise RuntimeError('layout export inventory changed during preparation')
        for row in rows:
            p = ROOT / row['path']
            st = p.stat()
            if st.st_size != row['bytes'] or st.st_mtime_ns != row['mtime_ns']:
                raise RuntimeError('layout export changed: '+row['path'])
            p.unlink()
            result['removed'].append(row)
        result['applied'] = True
        result.pop('candidates')
        result['verification_bytes_after'] = sum(p.stat().st_size for p in files())
        report_path.write_text(json.dumps(result, indent=2)+'\n')
        for name, expected in retained.items():
            p = ROOT / name
            if not p.is_file() or p.stat().st_size != expected['bytes'] or digest(p) != expected['sha256']:
                raise RuntimeError('retained file changed: '+name)
        result['retained_files_verified'] = True
        report_path.write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items()
                      if k not in ('candidates','removed','retained_files')}, indent=2))


if __name__ == '__main__':
    main()

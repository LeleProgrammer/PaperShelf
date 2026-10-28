#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
"""Export PaperShelf, excluding hosting identity, caches and previous archives."""
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT.parent / 'PaperShelf.zip'


def main():
    paths = [ROOT / name for name in ['README.md', 'LICENSE', 'CONTENT_LICENSE.md', 'start.bat', 'start.sh', 'update-catalog.bat']]
    for folder in ['dist', 'scripts', 'templates']:
        paths.extend(p for p in (ROOT / folder).rglob('*') if p.is_file())
    staged = OUTPUT.with_suffix('.zip.tmp')
    with zipfile.ZipFile(staged, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for path in sorted(set(paths)):
            if '__pycache__' in path.parts or path.suffix.lower() in {'.pyc', '.zip', '.tmp'}:
                continue
            archive.write(path, Path('PaperShelf') / path.relative_to(ROOT))
    staged.replace(OUTPUT)
    print(OUTPUT)


if __name__ == '__main__':
    main()

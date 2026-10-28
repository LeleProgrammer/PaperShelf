#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
"""Validate works and atomically rebuild the static catalog. No backend needed."""
import json
import os
import sys
from pathlib import Path
from check_catalog import check, WEB


def main():
    paths = sorted((WEB / 'books').glob('*/pages/data.json'))
    try:
        for path in paths:
            check(path)
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f'未更新清单：{error}。原清单已保留。', file=sys.stderr)
        return 1
    index = WEB / 'books/index.json'
    staged = index.with_name('index.json.tmp')
    staged.write_text(json.dumps([p.relative_to(WEB).as_posix() for p in paths], ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    os.replace(staged, index)
    print(f'已登记 {len(paths)} 部作品。')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

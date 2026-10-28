#!/usr/bin/env sh
# SPDX-License-Identifier: GPL-3.0-only
set -eu
cd -- "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
printf '%s\n' 'PaperShelf - http://localhost:8000' 'Press Ctrl+C to stop.'
exec python3 -m http.server 8000 --bind 127.0.0.1 --directory dist

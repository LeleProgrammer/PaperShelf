#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
"""Preview PaperShelf with explicit resource types and an absolute web root."""
import argparse
import errno
import functools
import http.server
import sys
import threading
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'dist'


class Handler(http.server.SimpleHTTPRequestHandler):
    # Override OS/Windows registry guesses for every resource used by the app.
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.pdf': 'application/pdf',
        '.md': 'text/plain; charset=utf-8',
    }

    def end_headers(self):
        # A local preview should always show the current files after an update.
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()


def open_server(port):
    handler = functools.partial(Handler, directory=str(WEB))
    for candidate in range(port, min(port + 20, 65536)):
        try:
            return http.server.ThreadingHTTPServer(('127.0.0.1', candidate), handler)
        except OSError as error:
            if error.errno not in {errno.EADDRINUSE, 10048}:
                raise
    raise OSError(f'No available port in {port}..{min(port + 19, 65535)}.')


def check_resources(url):
    # Do not route loopback checks through a user-configured HTTP proxy.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for path, expected in [('', 'text/html'), ('styles.css', 'text/css'),
                           ('app.js', 'text/javascript'),
                           ('books/index.json', 'application/json')]:
        with opener.open(url + path, timeout=5) as response:
            if response.status != 200 or response.headers.get_content_type() != expected:
                raise RuntimeError(f'Resource check failed: {path or "index.html"}')
            if not response.read(1):
                raise RuntimeError(f'Empty resource: {path or "index.html"}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error('--port must be 1..65535')
    required = ['index.html', 'styles.css', 'app.js', 'books/index.json']
    missing = [name for name in required if not (WEB / name).is_file()]
    if missing:
        print('Missing files: ' + ', '.join(missing), file=sys.stderr)
        print('Extract the complete PaperShelf folder before starting.', file=sys.stderr)
        return 1
    try:
        server = open_server(args.port)
    except OSError as error:
        print(f'Unable to start PaperShelf: {error}', file=sys.stderr)
        return 1
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    url = f'http://127.0.0.1:{server.server_address[1]}/'
    try:
        check_resources(url)
        print('\nPaperShelf is ready: ' + url, flush=True)
        print('HTML / CSS / JavaScript / catalog: OK', flush=True)
        print('Keep this window open. Press Ctrl+C to stop.\n', flush=True)
        if not args.no_browser:
            try:
                if not webbrowser.open(url):
                    print('Open the URL above in your browser.', flush=True)
            except webbrowser.Error:
                print('Open the URL above in your browser.', flush=True)
        worker.join()
    except KeyboardInterrupt:
        print('\nStopping PaperShelf.')
    except Exception as error:
        print(f'PaperShelf startup check failed: {error}', file=sys.stderr)
        return 1
    finally:
        server.shutdown()
        server.server_close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

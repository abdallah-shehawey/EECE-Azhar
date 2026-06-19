#!/usr/bin/env python3
"""
Local dev server that mirrors how the site behaves on Vercel.

Why this exists:
  The site uses clean URLs (/yearbook, /profile, …). On Vercel, vercel.json
  rewrites any path that isn't a real file or an /api/* route back to
  /index.html, so a refresh on /profile still serves the app. The built-in
  `python -m http.server` does NOT do that — it 404s on /yearbook — which makes
  local testing behave differently from production (refreshes break, the SPA
  router never runs, and it feels like it "redirects to /").

  This server applies the same rule: real file → serve it; anything else
  (no file extension, not /api/) → serve index.html. So `http://localhost:8080`
  behaves exactly like the deployed site, including the service worker and
  offline mode.

Run it:
  python3 scripts/dev-server.py          # http://localhost:8080
  python3 scripts/dev-server.py 3000     # custom port

Then open http://localhost:8080 in the browser. Ctrl+C to stop.
"""

import os
import sys
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

# Serve from the project root (one level up from this scripts/ folder),
# regardless of the directory you launch the command from.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080

# Mirror vercel.json: rewrite everything EXCEPT /api/* and paths that end in a
# file extension (e.g. .js, .css, .png) back to index.html.
HAS_EXTENSION = re.compile(r"\.[a-zA-Z0-9]+$")


class SPAHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def translate_and_rewrite(self):
        # Strip the query string, then URL-decode so paths with spaces / Arabic /
        # emoji (e.g. the audio filenames) are checked against the real file name
        # on disk, not the percent-encoded form. (Vercel decodes too.)
        from urllib.parse import unquote
        path = unquote(self.path.split("?", 1)[0])

        # Leave API routes and real assets alone.
        if path.startswith("/api/") or HAS_EXTENSION.search(path):
            return False

        # If a real file/dir exists for this path, serve it as-is.
        fs_path = os.path.join(ROOT, path.lstrip("/"))
        if path != "/" and os.path.exists(fs_path):
            return False

        # Otherwise it's an app route (/yearbook, /profile, …) → serve the SPA.
        self.path = "/index.html"
        return True

    def do_GET(self):
        self.translate_and_rewrite()
        return super().do_GET()

    def do_HEAD(self):
        self.translate_and_rewrite()
        return super().do_HEAD()

    def end_headers(self):
        # Never let the browser cache the shell during local dev, so edits to
        # index.html / script.js / style.css show up on a plain refresh.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), SPAHandler)
    url = f"http://localhost:{PORT}"
    print(f"\n  EECE dev server running → {url}")
    print("  Clean URLs + service worker + offline all work here.")
    print("  Press Ctrl+C to stop.\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopped.")
        httpd.server_close()


if __name__ == "__main__":
    main()

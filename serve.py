"""Local development server for this site only.

Why this exists instead of `python -m http.server`:
Python's built-in server sends no Cache-Control header. Chrome then guesses how
long a file stays fresh and reuses its copy WITHOUT asking the server. Editing
styles.css or scene.js then changes nothing on screen, which looks like a broken
fix but is really a stale file. Sending no-store forces the browser to re-ask
every time.

This file never ships with the website. It is a local tool.

Run it through the preview tooling, not by hand.
"""

import http.server
import os

PORT = 8124
ROOT = os.path.dirname(os.path.abspath(__file__))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def send_head(self):
        # Drop the browser's freshness questions so it can never be sent a 304.
        # Setting them to an empty string instead of removing them makes the
        # base class fail to parse the date and kill the connection.
        for header in ("If-Modified-Since", "If-None-Match"):
            while header in self.headers:
                del self.headers[header]
        return super().send_head()

    def log_error(self, fmt, *args):
        # Keep real errors, drop the noisy broken-pipe lines a reloading
        # browser produces when it abandons a request mid-flight.
        msg = fmt % args
        if "Broken pipe" in msg or "forcibly closed" in msg:
            return
        super().log_error(fmt, *args)


if __name__ == "__main__":
    os.chdir(ROOT)
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), NoCacheHandler)
    print("Serving " + ROOT + " on http://127.0.0.1:" + str(PORT) + " with caching off")
    httpd.serve_forever()

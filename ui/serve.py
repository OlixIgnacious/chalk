"""serve.py — serve one output dir on 127.0.0.1, so lesson.html plays in the page with its segment videos.

An inline copy of the HTML would break its relative paths (segments/NN/segment.mp4, the player's assets),
so the page embeds this server's URL in an iframe instead. One server per output dir, for the life of the
Streamlit process; it only listens on the loopback address and only serves files under that dir.
"""

from __future__ import annotations

import functools
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

_servers: dict[str, ThreadingHTTPServer] = {}
_lock = threading.Lock()


class _Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):  # no request log in the Streamlit console
        pass


def url_for(out: str | Path, path: str = "lesson.html") -> str:
    """http://127.0.0.1:<port>/<path>, starting the server for out the first time."""
    out = str(Path(out).resolve())
    with _lock:
        srv = _servers.get(out)
        if srv is None:
            handler = functools.partial(_Quiet, directory=out)
            srv = ThreadingHTTPServer(("127.0.0.1", 0), handler)
            threading.Thread(target=srv.serve_forever, daemon=True).start()
            _servers[out] = srv
    return f"http://127.0.0.1:{srv.server_address[1]}/{path}"

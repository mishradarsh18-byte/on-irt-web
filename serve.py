"""
serve.py — local preview that mimics Vercel (static files + /api/step).

    python3 serve.py        # then open http://localhost:8000

Uses the SAME runtime as the deployed function (imports api/step.py), so what
you see locally is what Vercel serves. Pure stdlib; no dependencies.
"""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "api"))
import step  # the deployed runtime

ROOT = os.path.dirname(__file__)
STATIC = {".html": "text/html", ".css": "text/css", ".js": "application/javascript",
          ".json": "application/json", ".svg": "image/svg+xml", ".ico": "image/x-icon"}


class Dev(BaseHTTPRequestHandler):
    def log_message(self, *a):  # quiet
        pass

    def _send(self, code, body, ctype="application/json"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.wfile.write(body)

    def do_GET(self):
        if self.path.rstrip("/") == "/api/step":
            return self._send(200, json.dumps({
                "ok": True, "items": len(step.BANK),
                "clusters": sorted(set(i["cluster"] for i in step.BANK)),
            }))
        path = "/index.html" if self.path == "/" else self.path.split("?")[0]
        fp = os.path.join(ROOT, path.lstrip("/"))
        if os.path.isfile(fp):
            ext = os.path.splitext(fp)[1]
            with open(fp, "rb") as f:
                return self._send(200, f.read(), STATIC.get(ext, "application/octet-stream"))
        return self._send(404, "not found", "text/plain")

    def do_POST(self):
        if self.path.rstrip("/") != "/api/step":
            return self._send(404, "not found", "text/plain")
        length = int(self.headers.get("content-length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            result = step.run_step(json.loads(raw or b"{}"))
            self._send(200, json.dumps(result))
        except Exception as e:  # noqa
            self._send(400, json.dumps({"error": str(e)}))


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print(f"Orange Nelumbo diagnostic → http://localhost:{port}")
    ThreadingHTTPServer(("0.0.0.0", port), Dev).serve_forever()

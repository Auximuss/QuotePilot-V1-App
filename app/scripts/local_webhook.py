"""
Demand Pilot — Local Webhook Server
-------------------------------------
Lets the admin panel's "Run Now" button trigger the Instagram agent.
Run once and keep the window open:

    python local_webhook.py

Then the ▶ Run Now button in the admin panel will work.
"""

import os
import json
import threading
import subprocess
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler

SCRIPT_PATH = str(Path(__file__).parent / "instagram_agent.py")
PORT = 4000

ENV = {
    **os.environ,
    "SUPABASE_URL":              "https://mppnrqtfcbapkohsogap.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY": "sb_secret_elk5sXLpQJuZgHM7eA3cug_CSQH8rEA",
    "OPENAI_API_KEY":            "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",
}

_running = False
_lock = threading.Lock()


def start_agent():
    global _running
    with _lock:
        if _running:
            return False
        _running = True

    def run():
        global _running
        print("[WEBHOOK] ▶ Instagram agent starting…", flush=True)
        subprocess.run(["python", SCRIPT_PATH], env=ENV)
        print("[WEBHOOK] ✓ Agent finished.", flush=True)
        _running = False

    threading.Thread(target=run, daemon=True).start()
    return True


class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self._cors()
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        self._cors()
        if self.path == "/status":
            self._json({"running": _running})
        elif self.path == "/run":
            ok = start_agent()
            self._json({"status": "started" if ok else "already_running"})
        else:
            self._json({"error": "not found"}, 404)

    def do_POST(self):
        self._cors()
        if self.path == "/run":
            ok = start_agent()
            self._json({"status": "started" if ok else "already_running"})
        else:
            self._json({"error": "not found"}, 404)

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def _json(self, data, code=200):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        pass  # suppress request noise


if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", PORT), Handler)
    print(f"✓ Webhook server live → http://localhost:{PORT}")
    print("  Keep this window open. The admin panel Run button calls it.")
    print("  Press Ctrl+C to stop.\n")
    server.serve_forever()

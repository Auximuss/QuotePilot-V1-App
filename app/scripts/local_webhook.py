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

# Load keys from .env.local (never committed to git)
_env_file = Path(__file__).parent / ".env.local"
_extra = {}
if _env_file.exists():
    for line in _env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            _extra[k.strip()] = v.strip()
else:
    print("[WARN] .env.local not found — add your keys to scripts/.env.local", flush=True)

ENV = {**os.environ, **_extra}

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


def self_register():
    """Register this script to start silently at Windows login, and schedule the 7am task."""
    import subprocess, sys
    pythonw = sys.executable.replace("python.exe", "pythonw.exe")
    this_file = str(Path(__file__).resolve())
    bat_file  = str(Path(__file__).parent / "run_daily.bat")

    # ── Add webhook to Windows startup registry (no admin needed) ──────────────
    try:
        import winreg
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                             r"Software\Microsoft\Windows\CurrentVersion\Run",
                             0, winreg.KEY_SET_VALUE)
        winreg.SetValueEx(key, "DemandPilotWebhook", 0, winreg.REG_SZ,
                          f'"{pythonw}" "{this_file}"')
        winreg.CloseKey(key)
        print("✓ Webhook registered for auto-start at login", flush=True)
    except Exception as e:
        print(f"[WARN] Could not register startup: {e}", flush=True)

    # ── Register 7am daily task with wake-from-sleep via PowerShell ────────────
    try:
        ps = f"""
$action  = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument '/c "{bat_file}"'
$trigger = New-ScheduledTaskTrigger -Daily -At 07:00
$settings = New-ScheduledTaskSettingsSet `
    -WakeToRun `
    -ExecutionTimeLimit (New-TimeSpan -Hours 4) `
    -StartWhenAvailable
Register-ScheduledTask `
    -TaskName 'DemandPilot_Instagram_7AM' `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Force | Out-Null
Write-Output 'ok'
"""
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps],
            capture_output=True, text=True
        )
        if "ok" in result.stdout:
            print("✓ 7am daily task registered (will wake laptop from sleep)", flush=True)
        else:
            raise Exception(result.stderr.strip())
    except Exception as e:
        print(f"[WARN] Could not register 7am task: {e}", flush=True)


if __name__ == "__main__":
    self_register()
    server = HTTPServer(("0.0.0.0", PORT), Handler)
    print(f"✓ Webhook server live → http://localhost:{PORT}")
    print("  This window can now be closed — it auto-starts at every login.\n")
    server.serve_forever()

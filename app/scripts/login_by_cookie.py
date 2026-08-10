"""
Use this if username/password login gets blocked by Instagram checkpoint.
Paste your sessionid cookie from the browser to create a saved session file.

How to get sessionid:
  1. Log into instagram.com in Chrome
  2. Press F12 -> Application -> Cookies -> https://www.instagram.com
  3. Find 'sessionid' and copy the value
  4. Run: python login_by_cookie.py
"""

import json
from pathlib import Path
from instagrapi import Client

session_id = input("Paste your Instagram sessionid cookie value: ").strip()

cl = Client()
cl.delay_range = [1, 3]

try:
    cl.login_by_sessionid(session_id)
    print(f"[OK] Logged in as @{cl.username}")
except Exception as e:
    print(f"[ERROR] {e}")
    raise SystemExit(1)

SESSION_FILE = Path(__file__).parent / "instagram_session.json"
SESSION_FILE.write_text(json.dumps(cl.get_settings(), indent=2))
print(f"[OK] Session saved to: {SESSION_FILE}")
print("     You can now run instagram_agent.py normally.")

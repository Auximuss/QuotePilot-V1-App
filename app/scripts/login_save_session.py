"""
Run this ONCE to approve the Instagram login and save a session file.
After this, instagram_agent.py will reuse the session and won't trigger
the checkpoint again (as long as you use the same machine/IP).

Usage:
  python login_save_session.py
"""

import os
import json
from pathlib import Path
from instagrapi import Client

USERNAME = os.environ.get("INSTAGRAM_USERNAME") or input("Instagram username: ").strip()
PASSWORD = os.environ.get("INSTAGRAM_PASSWORD") or input("Instagram password: ").strip()

SESSION_FILE = Path(__file__).parent / "instagram_session.json"

cl = Client()
cl.delay_range = [1, 3]

print("\n[1] Attempting login...")
print("    If Instagram blocks this, open the Instagram app on your phone")
print("    and approve the login notification, then press Enter here.\n")

try:
    cl.login(USERNAME, PASSWORD)
    print("[OK] Logged in successfully!")
except Exception as e:
    print(f"[!] Login raised: {e}")
    input("\n    Open Instagram on your phone, approve any security prompt, then press Enter to retry... ")
    try:
        cl.login(USERNAME, PASSWORD)
        print("[OK] Logged in on retry!")
    except Exception as e2:
        print(f"[ERROR] Still failing: {e2}")
        print("\nTry logging into Instagram on your browser first at https://instagram.com")
        print("then run this script again.")
        raise SystemExit(1)

SESSION_FILE.write_text(json.dumps(cl.get_settings(), indent=2))
print(f"\n[OK] Session saved to: {SESSION_FILE}")
print("     You can now run instagram_agent.py normally.")

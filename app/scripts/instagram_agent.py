"""
Demand Pilot — Instagram DM Agent (Playwright browser version)
---------------------------------------------------------------
Uses a real Chrome browser to send DMs. Instagram cannot detect this
as automated. Logs into Instagram once, saves the session, and reuses
it on every subsequent run.

Run once to log in manually, then runs silently afterwards.
"""

import os
import sys
import time
import random
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timezone
from pathlib import Path

from openai import OpenAI
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
OPENAI_KEY   = os.environ["OPENAI_API_KEY"]

MAX_DMS      = 20
DELAY_MIN    = 480   # 8 min between DMs
DELAY_MAX    = 900   # 15 min between DMs
PROFILE_DIR  = str(Path(__file__).parent / "chrome_profile")

# Trade + location search combos for Phase 0
TRADE_SEARCHES = [
    ("plumber",      "Nottingham"), ("plumber",      "Derby"),
    ("plumber",      "Manchester"), ("plumber",      "Leeds"),
    ("plumber",      "Sheffield"),  ("plumber",      "Birmingham"),
    ("electrician",  "Nottingham"), ("electrician",  "Derby"),
    ("electrician",  "Manchester"), ("electrician",  "Leeds"),
    ("electrician",  "Sheffield"),  ("electrician",  "Birmingham"),
    ("roofer",       "Nottingham"), ("roofer",       "Derby"),
    ("roofer",       "Manchester"), ("roofer",       "Leeds"),
    ("tiler",        "Nottingham"), ("tiler",        "Derby"),
    ("tiler",        "Manchester"), ("tiler",        "Leeds"),
    ("joiner",       "Nottingham"), ("joiner",       "Derby"),
    ("builder",      "Nottingham"), ("builder",      "Derby"),
    ("plasterer",    "Nottingham"), ("plasterer",    "Derby"),
    ("carpenter",    "Nottingham"), ("carpenter",    "Manchester"),
    ("plumber",      "Leicester"),  ("electrician",  "Leicester"),
]


# ── Logging ────────────────────────────────────────────────────────────────────
def log(supabase, message: str, type: str = "info") -> None:
    print(f"[{type.upper()}] {message}", flush=True)
    try:
        supabase.table("agent_logs").insert({
            "agent": "Instagram", "message": message, "type": type,
        }).execute()
    except Exception as e:
        print(f"[WARN] Log write failed: {e}", flush=True)


# ── Email report ───────────────────────────────────────────────────────────────
def send_email_report(supabase, dms_sent: list, handles_found: int,
                      handles_total: int, failures: list) -> None:
    to_email   = os.environ.get("REPORT_EMAIL", "")
    from_email = os.environ.get("REPORT_EMAIL", "")
    password   = os.environ.get("EMAIL_APP_PASSWORD", "")
    if not to_email or not password:
        print("[WARN] REPORT_EMAIL / EMAIL_APP_PASSWORD not set — skipping email report", flush=True)
        return

    # Cumulative stats from Supabase
    try:
        total_sent = supabase.table("outreach_leads") \
            .select("id", count="exact") \
            .not_.is_("instagram_dm_sent_at", "null") \
            .execute().count or 0
        total_leads = supabase.table("outreach_leads") \
            .select("id", count="exact").execute().count or 0
    except Exception:
        total_sent = len(dms_sent)
        total_leads = 0

    today = datetime.now().strftime("%d %b %Y")
    sent_count = len(dms_sent)
    fail_count = len(failures)

    # Build DM rows
    dm_rows = "".join(
        f'<tr><td style="padding:6px 12px;border-bottom:1px solid #1e2a1e;">'
        f'<a href="https://instagram.com/{d["handle"]}" style="color:#4ade80;text-decoration:none;">@{d["handle"]}</a></td>'
        f'<td style="padding:6px 12px;border-bottom:1px solid #1e2a1e;color:#aaa;">{d["biz"]}</td></tr>'
        for d in dms_sent
    )
    fail_rows = "".join(
        f'<tr><td style="padding:6px 12px;border-bottom:1px solid #2a1e1e;color:#f87171;">@{f["handle"]}</td>'
        f'<td style="padding:6px 12px;border-bottom:1px solid #2a1e1e;color:#aaa;">{f["reason"]}</td></tr>'
        for f in failures
    ) if failures else ""

    fail_section = f"""
    <h3 style="color:#f87171;margin:24px 0 8px;">⚠ Failures ({fail_count})</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <tr><th style="text-align:left;padding:6px 12px;color:#888;">Handle</th>
          <th style="text-align:left;padding:6px 12px;color:#888;">Reason</th></tr>
      {fail_rows}
    </table>""" if failures else ""

    html = f"""
<!DOCTYPE html>
<html><body style="background:#0a0f0a;color:#e0e0e0;font-family:'Segoe UI',sans-serif;margin:0;padding:32px;">
<div style="max-width:600px;margin:0 auto;">

  <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
    <span style="font-size:24px;">📸</span>
    <div>
      <div style="font-size:20px;font-weight:700;color:#fff;">Demand Pilot</div>
      <div style="font-size:13px;color:#888;">Instagram Report — {today}</div>
    </div>
  </div>

  <!-- Stats row -->
  <div style="display:flex;gap:12px;margin-bottom:24px;">
    <div style="flex:1;background:#111;border:1px solid #1e2a1e;border-radius:12px;padding:16px;text-align:center;">
      <div style="font-size:32px;font-weight:700;color:#4ade80;">{sent_count}</div>
      <div style="font-size:12px;color:#888;margin-top:4px;">DMs sent today</div>
    </div>
    <div style="flex:1;background:#111;border:1px solid #1e2a1e;border-radius:12px;padding:16px;text-align:center;">
      <div style="font-size:32px;font-weight:700;color:#4ade80;">{handles_found}</div>
      <div style="font-size:12px;color:#888;margin-top:4px;">Handles found</div>
    </div>
    <div style="flex:1;background:#111;border:1px solid #1e2a1e;border-radius:12px;padding:16px;text-align:center;">
      <div style="font-size:32px;font-weight:700;color:#4ade80;">{total_sent}</div>
      <div style="font-size:12px;color:#888;margin-top:4px;">Total DMs all-time</div>
    </div>
    <div style="flex:1;background:#111;border:1px solid #1e2a1e;border-radius:12px;padding:16px;text-align:center;">
      <div style="font-size:32px;font-weight:700;color:#60a5fa;">{total_leads}</div>
      <div style="font-size:12px;color:#888;margin-top:4px;">Total leads</div>
    </div>
  </div>

  <!-- DMs sent -->
  <h3 style="color:#4ade80;margin:0 0 8px;">✓ DMs sent today ({sent_count}/{MAX_DMS})</h3>
  <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px;">
    <tr>
      <th style="text-align:left;padding:6px 12px;color:#888;border-bottom:1px solid #1e2a1e;">Handle</th>
      <th style="text-align:left;padding:6px 12px;color:#888;border-bottom:1px solid #1e2a1e;">Business</th>
    </tr>
    {dm_rows if dm_rows else '<tr><td colspan="2" style="padding:12px;color:#888;">No DMs sent this run</td></tr>'}
  </table>

  {fail_section}

  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #1e2a1e;font-size:12px;color:#555;">
    Demand Pilot · Instagram outreach bot · Handles searched: {handles_found}/{handles_total}
  </div>
</div>
</body></html>"""

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"📸 Instagram Report — {sent_count} DMs sent · {today}"
        msg["From"]    = from_email
        msg["To"]      = to_email
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.ehlo()
            server.starttls()
            server.login(from_email, password)
            server.sendmail(from_email, to_email, msg.as_string())
        print(f"[INFO] ✉ Daily report emailed to {to_email}", flush=True)
    except Exception as e:
        print(f"[WARN] Email report failed: {e}", flush=True)


# ── Hashtag scraper ────────────────────────────────────────────────────────────
def search_trade_handles(page, trade: str, location: str, limit: int = 10) -> list:
    """
    Use Instagram's proven search API to find tradespeople by trade + location.
    Returns list of {username, trade, location}.
    """
    query = f"{trade} {location}"
    if "instagram.com" not in page.url:
        page.goto("https://www.instagram.com/", wait_until="domcontentloaded")
        time.sleep(3)
    try:
        data = page.evaluate("""async (q) => {
            const r = await fetch(
                `/web/search/topsearch/?query=${encodeURIComponent(q)}&context=blended`,
                { headers: { 'X-IG-App-ID': '936619743392459',
                             'X-Requested-With': 'XMLHttpRequest' } }
            );
            return r.json();
        }""", query)
        if data.get("status") != "ok":
            return []
        results = []
        for u in data.get("users", [])[:limit]:
            uname = u["user"]["username"]
            results.append({"username": uname, "trade": trade, "location": location})
        return results
    except Exception as e:
        print(f"[WARN] Trade search error ({query}): {e}", flush=True)
        return []


# ── DM text generation ─────────────────────────────────────────────────────────
def generate_dm(openai_client: OpenAI, lead: dict) -> str:
    business = lead.get("business_name") or "there"
    trade    = lead.get("trade") or "tradesperson"
    location = lead.get("location") or "the UK"
    response = openai_client.chat.completions.create(
        model="gpt-4o-mini",
        max_tokens=120,
        messages=[{"role": "user", "content": (
            f"Write a casual 2-sentence Instagram DM to a UK {trade} "
            f"called {business} based in {location}.\n\n"
            "Promote Demand Pilot — a free app where tradespeople describe a job by voice, "
            "AI builds the quote in seconds, and they send it via WhatsApp.\n"
            "Link: https://demandpilot.co.uk\n\n"
            "Rules: very casual, no emojis, no 'I hope this finds you well', "
            "start with Hi, mention the link naturally, sign off: Alex. "
            "Return ONLY the message text."
        )}],
    )
    return response.choices[0].message.content.strip()


# ── Send a single DM via browser ───────────────────────────────────────────────
def send_dm(page, username: str, message: str) -> None:
    """Open a DM thread with username and send message."""

    # ── Step 1: Open the DM thread ────────────────────────────────────────────
    opened = False

    # Try profile page Message button first
    page.goto(f"https://www.instagram.com/{username}/", wait_until="domcontentloaded")
    time.sleep(random.uniform(3, 5))

    # Try accessibility-based locator first, then CSS fallbacks
    MSG_LOCATORS = [
        lambda: page.get_by_role("button", name="Message"),
        lambda: page.locator('div[role="button"]:has-text("Message")'),
        lambda: page.locator('button:has-text("Message")'),
        lambda: page.locator('a:has-text("Message")'),
    ]
    for get_btn in MSG_LOCATORS:
        try:
            btn = get_btn().first
            btn.wait_for(timeout=5000)
            if btn.is_visible():
                btn.click()
                time.sleep(random.uniform(2, 4))
                opened = True
                break
        except Exception:
            continue

    if not opened:
        # Debug: show what buttons are actually on the page
        try:
            btns = page.locator('button, div[role="button"], a[role="button"]').all_text_contents()
            print(f"[DEBUG] Buttons on @{username} profile: {[b.strip() for b in btns if b.strip()][:15]}", flush=True)
        except Exception:
            pass
        # Fallback: direct/new page
        page.goto("https://www.instagram.com/direct/new/", wait_until="domcontentloaded")
        time.sleep(random.uniform(4, 6))

        SEARCH_SELECTORS = [
            'input[placeholder="Search"]',
            'input[placeholder*="Search"]',
            'input[name="queryBox"]',
            'input[aria-label*="earch"]',
            'input[type="text"]',
        ]
        searched = False
        for sel in SEARCH_SELECTORS:
            try:
                search = page.locator(sel).first
                search.wait_for(timeout=5000)
                search.click()
                time.sleep(0.5)
                search.type(username, delay=random.randint(80, 150))
                time.sleep(random.uniform(2, 3))
                searched = True
                break
            except Exception:
                continue

        if not searched:
            raise Exception(f"Could not find search box on direct/new for @{username}")

        # Select first result via keyboard (more reliable than CSS selectors)
        time.sleep(random.uniform(2, 3))
        page.keyboard.press("ArrowDown")
        time.sleep(0.4)
        page.keyboard.press("Enter")
        time.sleep(random.uniform(1, 2))

        # Click Chat / Next
        for label in ["Chat", "Next"]:
            try:
                btn = page.locator(f'button:has-text("{label}")').first
                btn.wait_for(timeout=3000)
                if btn.is_visible():
                    btn.click()
                    break
            except Exception:
                continue
        time.sleep(random.uniform(2, 3))

    # ── Step 2: Type and send ─────────────────────────────────────────────────
    BOX_SELECTORS = [
        'div[aria-label="Message"]',
        'div[aria-label*="essage"]',
        'div[role="textbox"]',
        'p[data-lexical-text="true"]',
    ]
    sent = False
    for sel in BOX_SELECTORS:
        try:
            box = page.locator(sel).first
            box.wait_for(timeout=8000)
            box.click()
            for char in message:
                box.type(char, delay=random.randint(40, 120))
            time.sleep(random.uniform(0.5, 1.5))
            page.keyboard.press("Enter")
            time.sleep(random.uniform(1, 2))
            sent = True
            break
        except Exception:
            continue

    if not sent:
        raise Exception(f"Could not find message textbox for @{username}")


# ── Find Instagram handle via in-page fetch (avoids API rate-limiting) ─────────
def find_handle(page, business_name: str, location: str) -> str | None:
    import json
    query = f"{business_name} {location}".strip()
    try:
        # Make sure we're on instagram.com so cookies are sent correctly
        if "instagram.com" not in page.url:
            page.goto("https://www.instagram.com/", wait_until="domcontentloaded")
            time.sleep(3)

        data = page.evaluate("""async (q) => {
            const r = await fetch(
                `/web/search/topsearch/?query=${encodeURIComponent(q)}&context=blended`,
                { headers: { 'X-IG-App-ID': '936619743392459', 'X-Requested-With': 'XMLHttpRequest' } }
            );
            return r.json();
        }""", query)

        if data.get("status") != "ok":
            print(f"[WARN] Search API not OK for '{business_name}': {data}", flush=True)
            return None

        users = data.get("users", [])
        if not users:
            return None
        name_words = {w.lower() for w in business_name.split() if len(w) > 2}
        for u in users:
            uname = u["user"]["username"]
            full  = u["user"].get("full_name", "")
            full_words = {w.lower() for w in full.split()}
            if name_words & full_words:
                return uname
        return users[0]["user"]["username"]
    except Exception as e:
        err = str(e)
        if "closed" in err.lower():
            raise  # Let main loop recover the browser
        print(f"[WARN] find_handle error for '{business_name}': {e}", flush=True)
        return None


# ── Main ───────────────────────────────────────────────────────────────────────
def main() -> None:
    supabase     = create_client(SUPABASE_URL, SUPABASE_KEY)
    openai_client = OpenAI(api_key=OPENAI_KEY)
    log(supabase, "📸 Instagram agent starting (browser mode)…")

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("[ERROR] Playwright not installed. Run: pip install playwright && playwright install chromium", flush=True)
        sys.exit(1)

    with sync_playwright() as pw:
        context = pw.chromium.launch_persistent_context(
            user_data_dir=PROFILE_DIR,
            channel="msedge",  # use real installed Edge, not Playwright's Chromium
            headless=False,
            args=["--disable-blink-features=AutomationControlled"],
            ignore_default_args=["--enable-automation"],
            viewport={"width": 1280, "height": 800},
        )
        page = context.new_page()

        # Check login — navigate once, then check URL (no second navigation)
        page.goto("https://www.instagram.com/", wait_until="domcontentloaded")
        time.sleep(5)

        url = page.url
        logged_in = (
            "login" not in url
            and "recaptcha" not in url
            and "challenge" not in url
            and "auth_platform" not in url
        )

        if not logged_in:
            print("\n" + "="*60, flush=True)
            print("  Instagram needs you to log in manually.", flush=True)
            print("  Complete any challenge in the browser window.", flush=True)
            print("  Use account: demandpilotapp", flush=True)
            print("  Once you see your feed, press Enter here.", flush=True)
            print("="*60 + "\n", flush=True)
            input("Press Enter once you see your feed > ")
            # DO NOT navigate again — the browser is already on the feed
            time.sleep(2)

        log(supabase, "✓ Browser session active", "success")

        # ── Phase 0: scrape handles from hashtags ──────────────────────────────
        log(supabase, "🔎 Phase 0: finding UK tradespeople via hashtags…")
        # Load all existing handles to avoid duplicates
        existing_rows = (
            supabase.table("outreach_leads")
            .select("instagram_handle")
            .not_.is_("instagram_handle", "null")
            .execute()
            .data
        )
        existing_handles = {
            r["instagram_handle"] for r in existing_rows
            if r["instagram_handle"] not in (None, "not_found")
        }

        # How many un-DMed handles do we already have?
        ready_to_dm = (
            supabase.table("outreach_leads")
            .select("id", count="exact")
            .not_.is_("instagram_handle", "null")
            .neq("instagram_handle", "not_found")
            .is_("instagram_dm_sent_at", "null")
            .execute()
            .count or 0
        )

        TARGET_NEW = max(0, MAX_DMS * 2 - ready_to_dm)  # top up to 2× daily target
        log(supabase, f"  {ready_to_dm} handles ready to DM — scraping {TARGET_NEW} more")

        phase0_added = 0
        for (trade, location) in TRADE_SEARCHES:
            if phase0_added >= TARGET_NEW:
                break
            candidates = search_trade_handles(page, trade, location, limit=10)
            added_this_search = 0
            for c in candidates:
                if c["username"] in existing_handles:
                    continue
                try:
                    supabase.table("outreach_leads").insert({
                        "business_name": c["username"],
                        "location": c["location"],
                        "trade": c["trade"],
                        "instagram_handle": c["username"],
                    }).execute()
                    existing_handles.add(c["username"])
                    phase0_added += 1
                    added_this_search += 1
                except Exception:
                    pass
                if phase0_added >= TARGET_NEW:
                    break
            if added_this_search:
                log(supabase, f"  ✓ {trade} {location} → {added_this_search} new handles")
            time.sleep(random.uniform(1, 3))

        log(supabase, f"Phase 0 complete — {phase0_added} new handles added", "success")

        # ── Phase 1: find handles ──────────────────────────────────────────────
        no_handle = (
            supabase.table("outreach_leads")
            .select("id, business_name, location, trade")
            .or_("instagram_handle.is.null,instagram_handle.eq.not_found")
            .limit(40)
            .execute()
            .data
        )
        log(supabase, f"🔍 Phase 1: {len(no_handle)} leads need Instagram handles")
        found = 0
        for i, lead in enumerate(no_handle):
            biz = lead['business_name'] or 'Unknown'
            log(supabase, f"[{i+1}/{len(no_handle)}] Searching for @{biz} in {lead.get('location','?')}…")
            try:
                handle = find_handle(page, lead["business_name"] or "", lead.get("location") or "")
            except Exception as recover_err:
                # Browser closed mid-run — try to reopen it
                log(supabase, "⚠ Browser closed unexpectedly, reopening…", "warn")
                try:
                    page = context.new_page()
                    page.goto("https://www.instagram.com/", wait_until="domcontentloaded")
                    time.sleep(5)
                    handle = find_handle(page, lead["business_name"] or "", lead.get("location") or "")
                except Exception:
                    log(supabase, "✗ Could not recover browser — stopping Phase 1", "error")
                    break
            if handle:
                supabase.table("outreach_leads").update({"instagram_handle": handle}).eq("id", lead["id"]).execute()
                log(supabase, f"✓ Found @{handle} for {biz}", "success")
                found += 1
            else:
                supabase.table("outreach_leads").update({"instagram_handle": "not_found"}).eq("id", lead["id"]).execute()
                log(supabase, f"✗ No handle found for {biz}", "error")
            time.sleep(random.uniform(2, 5))
        log(supabase, f"Phase 1 complete — {found}/{len(no_handle)} handles found", "success")

        # ── Phase 2: send DMs ──────────────────────────────────────────────────
        log(supabase, "📨 Phase 2: sending DMs…")
        to_dm = (
            supabase.table("outreach_leads")
            .select("*")
            .filter("instagram_handle", "not.is", "null")
            .neq("instagram_handle", "not_found")
            .is_("instagram_dm_sent_at", "null")
            .limit(MAX_DMS)
            .execute()
            .data
        )
        sent = 0
        dms_sent_report  = []   # for email report
        failures_report  = []
        for i, lead in enumerate(to_dm):
            if sent >= MAX_DMS:
                break
            handle = lead["instagram_handle"]
            biz = lead.get('business_name', handle)
            try:
                log(supabase, f"[{sent+1}/{min(MAX_DMS, len(to_dm))}] Generating DM for @{handle} ({biz})…")
                dm_text = generate_dm(openai_client, lead)
                log(supabase, f"→ Opening @{handle}'s profile…")
                send_dm(page, handle, dm_text)
                supabase.table("outreach_leads").update({
                    "instagram_dm_sent_at": datetime.now(timezone.utc).isoformat(),
                }).eq("id", lead["id"]).execute()
                log(supabase, f"✓ DM sent to @{handle} ({biz})", "success")
                dms_sent_report.append({"handle": handle, "biz": biz})
                sent += 1
            except Exception as e:
                err = str(e)[:120]
                log(supabase, f"✗ Failed @{handle} — {err}", "error")
                failures_report.append({"handle": handle, "reason": err})
                continue
            if sent < MAX_DMS and i < len(to_dm) - 1:
                delay = random.uniform(DELAY_MIN, DELAY_MAX)
                log(supabase, f"⏳ Waiting {round(delay/60, 1)} min before next DM… ({sent}/{MAX_DMS} sent so far)")
                time.sleep(delay)

        log(supabase, f"✅ Done — {sent} DMs sent today", "success")
        context.close()

        # ── Send daily email report ────────────────────────────────────────────
        send_email_report(
            supabase,
            dms_sent=dms_sent_report,
            handles_found=found,
            handles_total=len(no_handle),
            failures=failures_report,
        )


if __name__ == "__main__":
    main()

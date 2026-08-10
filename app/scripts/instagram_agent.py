"""
Demand Pilot — Instagram DM Agent
----------------------------------
Phase 1: For leads with no instagram_handle, search Instagram by
         business name + city and save the best match.
Phase 2: For leads with a handle and no DM sent, generate a
         personalised message via GPT and send it via instagrapi.

Runs daily via GitHub Actions. Max 20 DMs per run.
Delays of 8–15 minutes between sends to stay human-like.
"""

import os
import sys
import time
import random
from datetime import datetime, timezone

from instagrapi import Client
from instagrapi.exceptions import (
    LoginRequired,
    TwoFactorRequired,
    ClientError,
    UserNotFound,
    DirectThreadNotFound,
)
from supabase import create_client, Client as SupabaseClient
from openai import OpenAI

# ── Config ─────────────────────────────────────────────────────────────────────
INSTAGRAM_USERNAME    = os.environ["INSTAGRAM_USERNAME"]
INSTAGRAM_PASSWORD    = os.environ["INSTAGRAM_PASSWORD"]
INSTAGRAM_TOTP_SECRET = os.environ.get("INSTAGRAM_TOTP_SECRET", "")  # optional 2FA

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
OPENAI_KEY   = os.environ["OPENAI_API_KEY"]

MAX_DMS_PER_RUN    = 20
MAX_HANDLE_LOOKUPS = 40   # search handles for up to 40 leads per run
DM_DELAY_MIN       = 480  # 8 minutes in seconds
DM_DELAY_MAX       = 900  # 15 minutes in seconds
SEARCH_DELAY_MIN   = 4
SEARCH_DELAY_MAX   = 10


# ── Logging ────────────────────────────────────────────────────────────────────
def log(supabase: SupabaseClient, message: str, type: str = "info") -> None:
    print(f"[{type.upper()}] {message}", flush=True)
    try:
        supabase.table("agent_logs").insert({
            "agent":   "Instagram",
            "message": message,
            "type":    type,
        }).execute()
    except Exception as e:
        print(f"[WARN] Failed to write log to Supabase: {e}", flush=True)


# ── Instagram login ────────────────────────────────────────────────────────────
def instagram_login() -> Client:
    cl = Client()
    cl.delay_range = [1, 3]  # random delay between API calls

    try:
        if INSTAGRAM_TOTP_SECRET:
            cl.login(
                INSTAGRAM_USERNAME,
                INSTAGRAM_PASSWORD,
                verification_code=cl.totp_generate_code(INSTAGRAM_TOTP_SECRET),
            )
        else:
            cl.login(INSTAGRAM_USERNAME, INSTAGRAM_PASSWORD)
    except TwoFactorRequired:
        print(
            "[ERROR] Instagram requires 2FA. Set INSTAGRAM_TOTP_SECRET in GitHub Secrets.",
            flush=True,
        )
        sys.exit(1)
    except Exception as e:
        print(f"[ERROR] Instagram login failed: {e}", flush=True)
        sys.exit(1)

    return cl


# ── Handle search ──────────────────────────────────────────────────────────────
def find_instagram_handle(cl: Client, business_name: str, location: str) -> str | None:
    """
    Search Instagram for the business and return the best-matching username.
    Returns None if no plausible match is found.
    """
    query = f"{business_name} {location or ''}".strip()
    try:
        results = cl.search_users(query, count=5)
    except ClientError:
        return None

    if not results:
        return None

    name_words = {w.lower() for w in business_name.split() if len(w) > 2}

    # Prefer accounts whose full name overlaps with the business name
    for user in results:
        full_name_words = {w.lower() for w in user.full_name.split()}
        if name_words & full_name_words:  # at least one word in common
            return user.username

    # Fall back to first result if it looks plausible (has posts, not a person)
    first = results[0]
    if first.media_count and first.media_count > 5:
        return first.username

    return None


# ── DM generation ──────────────────────────────────────────────────────────────
def generate_dm(openai: OpenAI, lead: dict) -> str:
    business = lead.get("business_name") or "there"
    trade    = lead.get("trade") or "tradesperson"
    location = lead.get("location") or "the UK"

    response = openai.chat.completions.create(
        model="gpt-4o-mini",
        max_tokens=120,
        messages=[{
            "role": "user",
            "content": (
                f"Write a casual 2-sentence Instagram DM to a UK {trade} "
                f"called {business} based in {location}.\n\n"
                "Promote Demand Pilot — a free app where you describe a job by voice, "
                "AI builds the quote, and you send it to the customer via WhatsApp.\n"
                "Link: https://demandpilot.co.uk\n\n"
                "Rules:\n"
                "- Very casual, like a real person\n"
                "- No emojis\n"
                "- No 'I hope this finds you well'\n"
                "- Start with Hi\n"
                "- Mention the link naturally\n"
                "- Sign off: Alex\n"
                "- Return ONLY the message text, nothing else."
            ),
        }],
    )
    return response.choices[0].message.content.strip()


# ── Main ───────────────────────────────────────────────────────────────────────
def main() -> None:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    openai   = OpenAI(api_key=OPENAI_KEY)

    log(supabase, "📸 Instagram agent starting…")

    cl = instagram_login()
    log(supabase, f"✓ Logged in as @{INSTAGRAM_USERNAME}")

    # ── Phase 1: find handles for leads that don't have one ──────────────────
    log(supabase, "🔍 Phase 1: searching for Instagram handles…")

    no_handle = (
        supabase.table("outreach_leads")
        .select("id, business_name, location, trade")
        .is_("instagram_handle", "null")
        .neq("status", "no_email")
        .limit(MAX_HANDLE_LOOKUPS)
        .execute()
        .data
    )

    found_count = 0
    for lead in no_handle:
        handle = find_instagram_handle(cl, lead["business_name"] or "", lead.get("location") or "")
        if handle:
            supabase.table("outreach_leads").update(
                {"instagram_handle": handle}
            ).eq("id", lead["id"]).execute()
            log(supabase, f"📍 @{handle} → {lead['business_name']}")
            found_count += 1
        else:
            # Mark as searched so we don't keep retrying
            supabase.table("outreach_leads").update(
                {"instagram_handle": "not_found"}
            ).eq("id", lead["id"]).execute()

        time.sleep(random.uniform(SEARCH_DELAY_MIN, SEARCH_DELAY_MAX))

    log(supabase, f"Phase 1 done — {found_count}/{len(no_handle)} handles found", "success")

    # ── Phase 2: send DMs ────────────────────────────────────────────────────
    log(supabase, "📨 Phase 2: sending DMs…")

    to_dm = (
        supabase.table("outreach_leads")
        .select("*")
        .not_("instagram_handle", "is", None)
        .neq("instagram_handle", "not_found")
        .is_("instagram_dm_sent_at", "null")
        .limit(MAX_DMS_PER_RUN)
        .execute()
        .data
    )

    sent_count = 0
    for i, lead in enumerate(to_dm):
        if sent_count >= MAX_DMS_PER_RUN:
            break

        handle = lead["instagram_handle"]

        try:
            dm_text = generate_dm(openai, lead)
            user_id = cl.user_id_from_username(handle)
            cl.direct_send(dm_text, [user_id])

            supabase.table("outreach_leads").update({
                "instagram_dm_sent_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", lead["id"]).execute()

            log(
                supabase,
                f"✓ DM sent to @{handle} ({lead.get('business_name', '')})",
                "success",
            )
            sent_count += 1

        except UserNotFound:
            log(supabase, f"✗ @{handle} not found — clearing handle", "error")
            supabase.table("outreach_leads").update(
                {"instagram_handle": "not_found"}
            ).eq("id", lead["id"]).execute()
            continue

        except (ClientError, DirectThreadNotFound) as e:
            log(supabase, f"✗ DM failed for @{handle}: {e}", "error")
            continue

        except Exception as e:
            log(supabase, f"✗ Unexpected error for @{handle}: {e}", "error")
            continue

        # Human-like delay between sends — skip delay after last DM
        if sent_count < MAX_DMS_PER_RUN and i < len(to_dm) - 1:
            delay = random.uniform(DM_DELAY_MIN, DM_DELAY_MAX)
            mins  = round(delay / 60, 1)
            log(supabase, f"⏳ Waiting {mins} min before next DM…")
            time.sleep(delay)

    log(
        supabase,
        f"✅ Instagram done — {sent_count} DMs sent, {found_count} handles found today",
        "success",
    )


if __name__ == "__main__":
    main()

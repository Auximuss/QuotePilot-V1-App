# QuoteSite (Demand Pilot v1.0)

Next.js 14 (App Router) + TypeScript + Tailwind. No seeded fake customers —
`quotes` starts empty and every number on the dashboard is computed from
whatever you actually create.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in your real keys
```

### 1. Supabase

1. Create a project at supabase.com.
2. In the SQL editor, run `supabase/schema.sql` — creates `businesses`,
   `customers`, `quotes`, `quote_line_items`, `price_book_items`, all with
   Row Level Security locked to `auth.uid()`.
3. Under **Authentication > URL Configuration**, add
   `http://localhost:3000/auth/callback` as a redirect URL.
4. Copy your Project URL, anon key, and service role key into `.env.local`.

### 2. OpenAI

Put your key in `.env.local` as `OPENAI_API_KEY`. `/api/quotes/generate`
calls `gpt-4o-mini` with a structured-JSON prompt and returns real scope,
line items, and a confidence score with "things to check" — this is what
powers the Review screen.

### 3. Run it

```bash
npm run dev
```

## What's real vs. still stubbed

**Real:**
- ✅ Supabase Auth — login, signup, forgot/reset password, protected routes
  via middleware.
- ✅ Database schema with RLS, ready to query.
- ✅ OpenAI structured extraction — no more fixed timers or fake text.
- ✅ No fake data anywhere in the UI. `quotes` starts as `[]`. Dashboard,
  history, and analytics all compute from whatever's actually in state —
  outstanding count, acceptance rate, revenue this month, deposits waiting,
  all real arithmetic over real (in-memory, for now) quotes.
- ✅ Full quote lifecycle: create → edit (including customer name, address,
  notes — not just prices) → send → customer views/accepts/declines/asks a
  question at their own link (`/q/[id]`) → builder sees a live banner on
  Home the moment they do.

**Still stubbed:**

| Feature | Current state | What's needed |
|---|---|---|
| Voice recording | Transcript is simulated on-screen text | `MediaRecorder` in the browser → new `/api/quotes/transcribe` route calling OpenAI Whisper → feed that real transcript into `/api/quotes/generate` |
| Persistence | `QuoteContext` is React state — refresh clears it | Swap the functions in `QuoteContext.tsx` for real Supabase reads/writes against the schema already in `supabase/schema.sql` |
| Price book learning | Not persisted yet | `updateLineItemPrice()` is the one place to add a `price_book_items` upsert |
| Branded PDF | Docket is on-screen only | `@react-pdf/renderer`, server-side, save the URL to `quotes.pdf_url` |
| Email / WhatsApp | Simulated | Still your call — Resend/Postmark for email is quick; WhatsApp needs Meta Business verification, budget more time |
| Stripe deposit | Simulated accept on `/q/[id]` | Also on hold per your call — when ready: Checkout Session + webhook flipping `quotes.status` server-side, never trust the client |
| Public quote route | `/q/[id]` reads from the same in-memory context, so it only works in the same browser session right now | Once Supabase is wired in, this route needs `createServiceClient()` (service-role key) to read one quote without RLS blocking an unauthenticated visitor |

## Structure

```
app/
  page.tsx                     Login / sign-up (real Supabase Auth)
  forgot-password/page.tsx     Real reset email
  reset-password/page.tsx      Real password update
  auth/callback/route.ts       Exchanges email-link codes for a session
  home/page.tsx                Dashboard — revenue, acceptance rate, outstanding, recent
  history/page.tsx             Every quote, searchable by customer/address/job/date
  analytics/page.tsx           Total quoted, acceptance %, revenue, average, deposits waiting
  quote/new/page.tsx           Recording + real OpenAI call → creates a real quote
  quote/review/page.tsx        Editable scope/prices/customer details, real confidence score
  quote/send/page.tsx          Docket + email (simulated), links to the real customer portal
  q/[id]/page.tsx              Customer portal — view, accept, decline, ask a question, pay deposit
  api/quotes/generate/route.ts Real OpenAI structured-extraction endpoint
lib/
  supabase/client.ts, server.ts
  QuoteContext.tsx              Real per-quote state — swap for Supabase queries next
  types.ts                      Quote type + quoteTotal/depositAmountFor helpers
supabase/schema.sql             Run this in the Supabase SQL editor
middleware.ts                   Protects routes, refreshes session, allows /q/[id] public
```

## Suggested build order from here

1. Confirm signup actually creates rows in Supabase's table editor.
2. Swap `QuoteContext`'s in-memory functions for real Supabase
   inserts/updates so a refresh doesn't lose quotes.
3. Add MediaRecorder + Whisper so recording is real audio.
4. Decide Stripe vs. manual, and email vs. WhatsApp — wire whichever you
   pick.
5. Move `/q/[id]` onto the service-role client so it works for anyone with
   the link, not just your own browser session.

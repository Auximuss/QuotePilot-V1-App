import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-ink px-5 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/home" className="text-[12px] text-textDim hover:text-paper">← Back</Link>
        <h1 className="font-barlow text-[22px] font-bold">Privacy Policy</h1>
      </div>

      <div className="space-y-6 text-[13px] leading-relaxed text-textDim">
        <p className="text-[11px] text-textDimmer">Last updated: {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>

        <section>
          <h2 className="mb-2 font-barlow text-[16px] font-bold text-paper">Who we are</h2>
          <p>Demand Pilot is a quoting tool for UK tradespeople. We take your privacy seriously. This policy explains what data we collect, why, and how it's protected.</p>
        </section>

        <section>
          <h2 className="mb-2 font-barlow text-[16px] font-bold text-paper">What data we collect</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li><strong className="text-paper">Account data</strong> — your email address and password (hashed) when you sign up</li>
            <li><strong className="text-paper">Business data</strong> — your business name, trade, phone number, and logo if you add them</li>
            <li><strong className="text-paper">Quote data</strong> — job descriptions, customer names, addresses, line items, and totals you create</li>
            <li><strong className="text-paper">Voice recordings</strong> — temporarily processed to generate quotes, then discarded. We do not store raw audio.</li>
            <li><strong className="text-paper">Payment data</strong> — billing is handled by Stripe. We do not store card numbers — only your Stripe customer ID and subscription status.</li>
            <li><strong className="text-paper">Usage data</strong> — how many quotes you've sent each month, for billing purposes</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 font-barlow text-[16px] font-bold text-paper">Customer data you enter</h2>
          <p>When you create quotes, you may enter your customers' names, addresses, and email addresses. You are the data controller for this information. We process it only to provide the quoting service on your behalf. Your customers can view their quotes via a secure link — we do not contact them except when you explicitly send them a quote.</p>
        </section>

        <section>
          <h2 className="mb-2 font-barlow text-[16px] font-bold text-paper">How we use your data</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>To provide and improve the Demand Pilot service</li>
            <li>To send transactional emails (quote delivery, accept/decline notifications)</li>
            <li>To process subscription payments via Stripe</li>
            <li>To provide customer support</li>
            <li>To calculate HMRC tax estimates shown in your analytics</li>
          </ul>
          <p className="mt-2">We do not sell your data to third parties. We do not use your data for advertising.</p>
        </section>

        <section>
          <h2 className="mb-2 font-barlow text-[16px] font-bold text-paper">Third-party services</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li><strong className="text-paper">Supabase</strong> — database and authentication (EU data residency)</li>
            <li><strong className="text-paper">OpenAI</strong> — voice transcription and AI quote generation. Audio is sent to OpenAI's API and not retained.</li>
            <li><strong className="text-paper">Stripe</strong> — payment processing</li>
            <li><strong className="text-paper">Resend</strong> — transactional email delivery</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 font-barlow text-[16px] font-bold text-paper">Data retention</h2>
          <p>We keep your data for as long as your account is active. If you delete your account, your data is removed within 30 days. Quote data visible to customers (via their link) is removed at the same time.</p>
        </section>

        <section>
          <h2 className="mb-2 font-barlow text-[16px] font-bold text-paper">Your rights (UK GDPR)</h2>
          <p>Under UK GDPR you have the right to access, correct, export, or delete your personal data at any time. Contact us via the in-app support chat or at support@demandpilot.app to exercise these rights.</p>
        </section>

        <section>
          <h2 className="mb-2 font-barlow text-[16px] font-bold text-paper">Cookies</h2>
          <p>We use a single session cookie to keep you logged in. We do not use advertising or tracking cookies.</p>
        </section>

        <section>
          <h2 className="mb-2 font-barlow text-[16px] font-bold text-paper">Contact</h2>
          <p>For privacy questions, contact us at <span className="text-hazard">support@demandpilot.app</span> or via the in-app support chat.</p>
        </section>
      </div>
    </div>
  );
}

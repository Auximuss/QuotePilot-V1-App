import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-ink px-5 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/home" className="text-[12px] text-textDim hover:text-paper">← Back</Link>
        <h1 className="font-barlow text-[22px] font-bold">Terms of Service</h1>
      </div>

      <div className="prose prose-sm max-w-none space-y-6 text-[13px] leading-relaxed text-textDim">
        <p className="text-[11px] text-textDimmer">Last updated: {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>

        <section>
          <h2 className="mb-2 font-barlow text-[16px] font-bold text-paper">1. About Demand Pilot</h2>
          <p>Demand Pilot is a software-as-a-service platform that helps UK tradespeople create and send professional quotes to their customers. By using our service, you agree to these terms.</p>
        </section>

        <section>
          <h2 className="mb-2 font-barlow text-[16px] font-bold text-paper">2. Your Account</h2>
          <p>You must provide accurate information when creating an account. You are responsible for keeping your login credentials secure and for all activity that occurs under your account. You must be at least 18 years old to use Demand Pilot.</p>
        </section>

        <section>
          <h2 className="mb-2 font-barlow text-[16px] font-bold text-paper">3. Subscriptions & Payments</h2>
          <p>Demand Pilot offers a free tier and paid subscription plans. Paid plans are billed monthly via Stripe. You can cancel at any time from Settings → Billing. Cancellation takes effect at the end of your current billing period — we do not offer refunds for partial months.</p>
          <p className="mt-2">We reserve the right to change pricing with 30 days' notice. Free tier limits may also change with reasonable notice.</p>
        </section>

        <section>
          <h2 className="mb-2 font-barlow text-[16px] font-bold text-paper">4. Acceptable Use</h2>
          <p>You may not use Demand Pilot to:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Send fraudulent or misleading quotes to customers</li>
            <li>Violate any UK laws or regulations</li>
            <li>Attempt to reverse-engineer or copy the software</li>
            <li>Use the service for any purpose other than legitimate trade quoting</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 font-barlow text-[16px] font-bold text-paper">5. Your Data & Quotes</h2>
          <p>You own the quotes and business data you create in Demand Pilot. We store it securely on your behalf. We do not sell your data to third parties. See our <Link href="/privacy" className="text-hazard underline">Privacy Policy</Link> for full details.</p>
        </section>

        <section>
          <h2 className="mb-2 font-barlow text-[16px] font-bold text-paper">6. AI-Generated Content</h2>
          <p>Demand Pilot uses AI to help generate quotes from your voice recordings. You are responsible for reviewing all AI-generated content before sending it to customers. We do not guarantee the accuracy of AI-generated quotes and accept no liability for errors in AI output.</p>
        </section>

        <section>
          <h2 className="mb-2 font-barlow text-[16px] font-bold text-paper">7. Limitation of Liability</h2>
          <p>Demand Pilot is a quoting tool — we are not party to any contracts between you and your customers. We accept no liability for disputes arising from quotes created using our platform. Our total liability is limited to the amount you paid us in the preceding 12 months.</p>
        </section>

        <section>
          <h2 className="mb-2 font-barlow text-[16px] font-bold text-paper">8. Service Availability</h2>
          <p>We aim for high availability but do not guarantee uninterrupted service. We may occasionally need to perform maintenance that temporarily affects access.</p>
        </section>

        <section>
          <h2 className="mb-2 font-barlow text-[16px] font-bold text-paper">9. Termination</h2>
          <p>We reserve the right to suspend or terminate accounts that violate these terms. You may delete your account at any time from Settings. Upon deletion, your data will be removed within 30 days.</p>
        </section>

        <section>
          <h2 className="mb-2 font-barlow text-[16px] font-bold text-paper">10. Governing Law</h2>
          <p>These terms are governed by the laws of England and Wales. Any disputes will be subject to the exclusive jurisdiction of the courts of England and Wales.</p>
        </section>

        <section>
          <h2 className="mb-2 font-barlow text-[16px] font-bold text-paper">11. Contact</h2>
          <p>Questions about these terms? Contact us via the in-app support chat or email us at support@demandpilot.app.</p>
        </section>
      </div>
    </div>
  );
}

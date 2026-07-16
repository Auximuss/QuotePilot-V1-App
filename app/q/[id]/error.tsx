"use client";

export default function CustomerPortalError({ reset }: { reset: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#141519] to-ink px-8 text-center">
      <div className="font-barlow text-lg font-semibold">Something went wrong</div>
      <p className="mt-2 text-xs text-textDim">
        We couldn&apos;t load this quote. Please try again or contact the sender.
      </p>
      <button
        onClick={reset}
        className="mt-5 rounded-xl bg-hazard px-5 py-2.5 font-barlow text-[13px] font-bold uppercase tracking-wide text-[#161006]"
      >
        Try again
      </button>
    </div>
  );
}

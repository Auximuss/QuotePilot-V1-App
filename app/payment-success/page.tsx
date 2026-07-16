export default function PaymentSuccessPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0e0e0e] px-6 text-center">
      <div className="text-6xl mb-6">✅</div>
      <h1 className="text-2xl font-bold text-white">Payment received!</h1>
      <p className="mt-3 text-white/50 text-sm max-w-xs">
        Thank you — your payment has been processed successfully. You'll receive a confirmation shortly.
      </p>
    </div>
  );
}

import { createServiceClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PortfolioPage({ params }: { params: { businessId: string } }) {
  const supabase = createServiceClient();

  const { data: biz } = await supabase
    .from("businesses")
    .select("id, name, trade")
    .eq("id", params.businessId)
    .single();

  if (!biz) notFound();

  // Fetch accepted/complete quotes with photos
  const { data: quotes } = await supabase
    .from("quotes")
    .select("id, job_title, address, status, sent_at")
    .eq("business_id", biz.id)
    .in("status", ["accepted", "complete"])
    .order("sent_at", { ascending: false })
    .limit(20);

  // Fetch photos for each quote
  const jobsWithPhotos: { id: string; title: string; photos: string[] }[] = [];
  for (const q of quotes ?? []) {
    const { data: files } = await supabase.storage
      .from("quote-photos")
      .list(q.id, { limit: 6 });

    if (files?.length) {
      const photos = files
        .filter((f) => !f.name.startsWith("."))
        .map((f) => {
          const { data } = supabase.storage
            .from("quote-photos")
            .getPublicUrl(`${q.id}/${f.name}`);
          return data.publicUrl;
        });
      if (photos.length) {
        jobsWithPhotos.push({ id: q.id, title: q.job_title ?? "Job", photos });
      }
    }
  }

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white">
      {/* Header */}
      <div className="border-b border-white/10 px-6 py-8">
        <div className="mx-auto max-w-2xl">
          <div className="font-mono text-xs uppercase tracking-widest text-[#ff6a1f]">
            Portfolio
          </div>
          <h1 className="mt-1 text-3xl font-bold">{biz.name}</h1>
          {biz.trade && (
            <div className="mt-1 text-sm text-white/50">{biz.trade}</div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-6 py-8">
        {jobsWithPhotos.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-12 text-center">
            <div className="text-4xl">📷</div>
            <div className="mt-3 text-base font-semibold">No photos yet</div>
            <div className="mt-1 text-sm text-white/40">
              Job photos will appear here once they're added to quotes.
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {jobsWithPhotos.map((job) => (
              <div key={job.id}>
                <div className="mb-3 font-semibold text-white/80">{job.title}</div>
                <div className="grid grid-cols-3 gap-2">
                  {job.photos.map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={url}
                      alt={job.title}
                      className="aspect-square w-full rounded-xl object-cover"
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-10 border-t border-white/10 pt-6 text-center text-xs text-white/30">
          Powered by <span className="text-[#ff6a1f]">Demand Pilot</span>
        </div>
      </div>
    </div>
  );
}

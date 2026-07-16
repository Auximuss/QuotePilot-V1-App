import type { Metadata } from "next";
import { createServiceClient } from "@/lib/supabase/server";

type Props = { params: { id: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createServiceClient();
  const { data: quote } = await supabase
    .from("quotes")
    .select("job_title, customer_name, total, businesses(name)")
    .eq("id", params.id)
    .single();

  if (!quote) return { title: "Quote | Demand Pilot" };

  const biz = quote.businesses as any;
  const title = `Quote from ${biz?.name ?? "Demand Pilot"}`;
  const description = `${quote.job_title ?? "Job quote"} — £${(quote.total ?? 0).toLocaleString("en-GB")}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "Demand Pilot",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export default function QuoteLayout({ children }: { children: React.ReactNode }) {
  return children;
}

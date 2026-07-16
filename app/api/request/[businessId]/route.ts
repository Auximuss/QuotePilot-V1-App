import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// GET — return business name/trade so the public page can display it
export async function GET(
  _req: NextRequest,
  { params }: { params: { businessId: string } }
) {
  const supabase = createServiceClient();
  const { data: biz } = await supabase
    .from("businesses")
    .select("id, name, trade")
    .eq("id", params.businessId)
    .single();

  if (!biz) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ businessName: (biz as any).name ?? "", trade: (biz as any).trade ?? "" });
}

// POST — save the quote request
export async function POST(
  req: NextRequest,
  { params }: { params: { businessId: string } }
) {
  const supabase = createServiceClient();

  const { customerName, customerPhone, customerEmail, description } = await req.json();

  if (!customerName?.trim() || !description?.trim()) {
    return NextResponse.json({ error: "Name and description are required" }, { status: 400 });
  }

  // Verify the business exists
  const { data: biz } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", params.businessId)
    .single();

  if (!biz) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const { error } = await supabase.from("quote_requests").insert({
    business_id: params.businessId,
    customer_name: customerName.trim(),
    customer_phone: customerPhone?.trim() || null,
    customer_email: customerEmail?.trim() || null,
    description: description.trim(),
    status: "new",
  });

  if (error) {
    console.error("Failed to save quote request:", error);
    return NextResponse.json({ error: "Failed to save request" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

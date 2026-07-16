import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const { email, password, businessName, trade } = await req.json();
    if (!email || !password) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    const admin = createServiceClient();
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { business_name: businessName, trade } });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await admin.from("businesses").insert({ owner_id: data.user.id, name: businessName || "My Business", trade: trade || "General Building" });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Unknown error" }, { status: 500 });
  }
}

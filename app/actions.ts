"use server";

import { createClient } from "@supabase/supabase-js";

export async function createUserAccount(
  email: string,
  password: string,
  businessName: string,
  trade: string
): Promise<{ success?: boolean; error?: string }> {
  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { business_name: businessName, trade },
    });

    if (error) return { error: error.message };

    await admin.from("businesses").insert({
      owner_id: data.user.id,
      name: businessName || "My Business",
      trade: trade || "General Building",
    });

    return { success: true };
  } catch (e: any) {
    return { error: e.message ?? "Unknown error" };
  }
}

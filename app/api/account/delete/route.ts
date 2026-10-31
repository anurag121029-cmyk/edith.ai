import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
export async function POST() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !service) return NextResponse.json({ error: "Account deletion requires SUPABASE_SERVICE_ROLE_KEY on the server, which is not configured. Your data was not deleted." }, { status: 503 });
    const sb = await createServerSupabase(); if (!sb) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
    const { data } = await sb.auth.getUser(); if (!data.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    const admin = createClient(url, service);
    // Deleting the auth user cascades to profiles and all user-owned rows (on delete cascade).
    const { error } = await admin.auth.admin.deleteUser(data.user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

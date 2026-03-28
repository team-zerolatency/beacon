import { NextResponse } from "next/server";
import { createSupabaseFromBearer } from "@/lib/supabase/server-from-request";
import type { MeResponse } from "@/lib/types/me";
import type { ProfileRow, UserType } from "@/lib/types/profile";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;

  const supabase = createSupabaseFromBearer(token ?? undefined);
  if (!supabase) {
    return NextResponse.json(
      { error: "Missing or invalid authorization" },
      { status: 401 },
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, user_type, created_at, updated_at")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json(
      { error: "Could not load profile", detail: profileError.message },
      { status: 500 },
    );
  }

  const userType: UserType =
    profile?.user_type === "ngo" || profile?.user_type === "helper"
      ? profile.user_type
      : "client";

  const body: MeResponse = {
    user: { id: user.id, email: user.email },
    userType,
    profile: profile as ProfileRow | null,
  };

  return NextResponse.json(body);
}

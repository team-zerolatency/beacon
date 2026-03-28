import type { MeResponse } from "@/lib/types/me";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Calls GET /api/me with the current Supabase session JWT.
 */
export async function fetchMe(
  supabase: SupabaseClient,
): Promise<MeResponse | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return null;
  }

  const response = await fetch("/api/me", {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as MeResponse;
}

import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type UserType = "client" | "ngo" | "helper";

export type MeProfile = {
  full_name: string | null;
  user_type: UserType | null;
};

export type MeData = {
  user: User;
  userType: UserType;
  profile: MeProfile | null;
};

function normalizeUserType(raw: string | null): UserType {
  if (raw === "ngo" || raw === "helper") {
    return raw;
  }

  return "client";
}

export async function fetchMe(): Promise<MeData | null> {
  if (!supabase) {
    return null;
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, user_type")
    .eq("id", user.id)
    .maybeSingle();

  return {
    user,
    userType: normalizeUserType(profile?.user_type ?? null),
    profile: profile
      ? {
          full_name: profile.full_name,
          user_type: normalizeUserType(profile.user_type),
        }
      : null,
  };
}

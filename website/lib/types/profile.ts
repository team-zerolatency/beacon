/** Set by DB default; only you (Supabase SQL / service role) may change to ngo or helper. */
export type UserType = "client" | "ngo" | "helper";

export type ProfileRow = {
  id: string;
  full_name: string | null;
  user_type: UserType;
  created_at: string;
  updated_at: string;
};

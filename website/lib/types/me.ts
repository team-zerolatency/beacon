import type { ProfileRow, UserType } from "./profile";

export type MeResponse = {
  user: { id: string; email?: string };
  userType: UserType;
  profile: ProfileRow | null;
};

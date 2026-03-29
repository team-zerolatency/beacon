import Constants from "expo-constants";
import { Platform } from "react-native";

import { supabase } from "@/lib/supabase";

type NotificationsModule = typeof import("expo-notifications");

export type PushAudienceRole = "ngo" | "client";

function getExpoProjectId() {
  const fromEasConfig = (Constants as { easConfig?: { projectId?: string } })
    .easConfig?.projectId;
  const fromExpoExtra = (
    Constants as {
      expoConfig?: { extra?: { eas?: { projectId?: string } } };
    }
  ).expoConfig?.extra?.eas?.projectId;

  return fromEasConfig ?? fromExpoExtra ?? null;
}

export async function registerDevicePushToken(input: {
  notifications: NotificationsModule;
  userId: string;
  role: PushAudienceRole;
}) {
  if (!supabase) {
    return { ok: false as const, reason: "supabase_not_configured" };
  }

  const permissions = await input.notifications.getPermissionsAsync();
  const finalStatus =
    permissions.status === "granted"
      ? "granted"
      : (await input.notifications.requestPermissionsAsync()).status;

  if (finalStatus !== "granted") {
    return { ok: false as const, reason: "permission_not_granted" };
  }

  const projectId = getExpoProjectId();
  if (!projectId) {
    return { ok: false as const, reason: "missing_project_id" };
  }

  const tokenResult = await input.notifications.getExpoPushTokenAsync({
    projectId,
  });

  const expoPushToken = tokenResult.data?.trim();
  if (!expoPushToken) {
    return { ok: false as const, reason: "token_not_available" };
  }

  const { error } = await supabase.from("device_push_tokens").upsert(
    {
      user_id: input.userId,
      role: input.role,
      expo_push_token: expoPushToken,
      platform: Platform.OS,
      is_active: true,
      last_seen_at: new Date().toISOString(),
    },
    {
      onConflict: "expo_push_token",
    },
  );

  if (error) {
    return { ok: false as const, reason: error.message };
  }

  return { ok: true as const };
}

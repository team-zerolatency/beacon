import {
  listPendingOutboxEvents,
  markOutboxEventSynced,
} from "@/lib/offline-queue";
import {
  ensureAuthenticatedWithRefresh,
  isTokenExpiredError,
} from "@/lib/session-management";
import { supabase } from "@/lib/supabase";

export type SyncEngineResult = {
  syncedCount: number;
  failedCount: number;
  errorMessage?: string;
};

export async function flushPackageOutbox(options?: {
  onEventSynced?: (eventId: string) => void;
  onEventFailed?: (eventId: string, error: unknown) => void;
}): Promise<SyncEngineResult> {
  if (!supabase) {
    return { syncedCount: 0, failedCount: 0 };
  }

  const pending = await listPendingOutboxEvents();
  let syncedCount = 0;
  let failedCount = 0;

  if (pending.length === 0) {
    return { syncedCount: 0, failedCount: 0 };
  }

  const authCheck = await ensureAuthenticatedWithRefresh();
  if (!authCheck.success) {
    for (const event of pending) {
      options?.onEventFailed?.(event.id, authCheck.error ?? "auth_failed");
    }

    return {
      syncedCount: 0,
      failedCount: pending.length,
      errorMessage:
        authCheck.error ?? "Session expired before sync. Please sign in again.",
    };
  }

  for (const event of pending) {
    const { error } = await supabase.from("package_events").insert({
      package_id: event.packageId,
      event_type: event.eventType,
      status: event.status,
      payload: event.payload,
      source_user_id: event.sourceUserId,
      idempotency_key: event.idempotencyKey,
      created_at: event.createdAt,
    });

    if (!error || error.code === "23505") {
      await markOutboxEventSynced(event.id);
      syncedCount += 1;
      options?.onEventSynced?.(event.id);
      continue;
    }

    if (isTokenExpiredError(error)) {
      failedCount += 1;
      options?.onEventFailed?.(event.id, error);

      // Stop early to avoid hammering backend with repeated token failures.
      return {
        syncedCount,
        failedCount: pending.length - syncedCount,
        errorMessage: "Session expired during sync. Please sign in again.",
      };
    }

    failedCount += 1;
    options?.onEventFailed?.(event.id, error);
  }

  return {
    syncedCount,
    failedCount,
  };
}

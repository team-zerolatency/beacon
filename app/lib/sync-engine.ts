import {
  listPendingOutboxEvents,
  markOutboxEventSynced,
} from "@/lib/offline-queue";
import { supabase } from "@/lib/supabase";

export type SyncEngineResult = {
  syncedCount: number;
  failedCount: number;
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

    failedCount += 1;
    options?.onEventFailed?.(event.id, error);
  }

  return {
    syncedCount,
    failedCount,
  };
}

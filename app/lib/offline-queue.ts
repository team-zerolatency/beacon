import AsyncStorage from "@react-native-async-storage/async-storage";

export type PackageLifecycleStatus =
  | "created"
  | "picked_up"
  | "in_transit"
  | "received_offline"
  | "synced_online"
  | "verified";

export type PackageEventType =
  | "package_created"
  | "package_picked_up"
  | "package_in_transit"
  | "package_received_offline"
  | "package_synced_online"
  | "package_verified";

export type PackageOutboxEvent = {
  id: string;
  packageId: string;
  eventType: PackageEventType;
  status: PackageLifecycleStatus;
  payload: Record<string, unknown>;
  sourceUserId: string | null;
  idempotencyKey: string;
  createdAt: string;
  syncedAt: string | null;
};

type QueueStorageState = {
  outbox: PackageOutboxEvent[];
};

const STORAGE_KEY = "beacon.package.queue.v1";

function makeId(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000_000)}`;
}

function parseState(raw: string | null): QueueStorageState {
  if (!raw) {
    return { outbox: [] };
  }

  try {
    const parsed = JSON.parse(raw) as QueueStorageState;
    return {
      outbox: Array.isArray(parsed.outbox) ? parsed.outbox : [],
    };
  } catch {
    return { outbox: [] };
  }
}

async function loadState(): Promise<QueueStorageState> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return parseState(raw);
}

async function saveState(state: QueueStorageState): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export async function enqueuePackageEvent(input: {
  packageId: string;
  eventType: PackageEventType;
  status: PackageLifecycleStatus;
  payload?: Record<string, unknown>;
  sourceUserId?: string | null;
  idempotencyKey?: string;
}): Promise<PackageOutboxEvent> {
  const state = await loadState();
  const nowIso = new Date().toISOString();

  const event: PackageOutboxEvent = {
    id: makeId(),
    packageId: input.packageId,
    eventType: input.eventType,
    status: input.status,
    payload: input.payload ?? {},
    sourceUserId: input.sourceUserId ?? null,
    idempotencyKey: input.idempotencyKey ?? makeId(),
    createdAt: nowIso,
    syncedAt: null,
  };

  state.outbox.push(event);
  await saveState(state);

  // Also persist to SQLite for crash-safety on low-RAM Android
  try {
    await persistOfflineEvent(input.packageId, {
      eventType: input.eventType,
      status: input.status,
      payload: input.payload ?? {},
      sourceUserId: input.sourceUserId ?? null,
      idempotencyKey: input.idempotencyKey ?? makeId(),
    });
  } catch (err) {
    console.warn(
      "[OfflineQueue] SQLite persistence failed, relying on AsyncStorage:",
      err,
    );
  }

  return event;
}

export async function listOutboxEvents(): Promise<PackageOutboxEvent[]> {
  const state = await loadState();

  return [...state.outbox].sort((a, b) => {
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export async function listPendingOutboxEvents(): Promise<PackageOutboxEvent[]> {
  const events = await listOutboxEvents();
  return events.filter((event) => event.syncedAt === null);
}

export async function markOutboxEventSynced(
  eventId: string,
  syncedAt = new Date().toISOString(),
): Promise<void> {
  const state = await loadState();

  state.outbox = state.outbox.map((event) => {
    if (event.id !== eventId) {
      return event;
    }

    return {
      ...event,
      syncedAt,
      status:
        event.status === "received_offline" ? "synced_online" : event.status,
    };
  });

  await saveState(state);
}

export async function clearSyncedOutboxEvents(): Promise<void> {
  const state = await loadState();
  state.outbox = state.outbox.filter((event) => event.syncedAt === null);
  await saveState(state);
}

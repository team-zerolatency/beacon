import { getInternetState } from "@/lib/connectivity";
import {
  enqueuePackageEvent,
  type PackageLifecycleStatus,
  type PackageOutboxEvent,
} from "@/lib/offline-queue";

export type PackageRoutingMode = "direct-sync" | "offline-relay";

export type PackageRoutingDecision = {
  mode: PackageRoutingMode;
  reason: string;
};

export async function getPackageRoutingDecision(): Promise<PackageRoutingDecision> {
  const state = await getInternetState();

  if (state.hasInternet) {
    return {
      mode: "direct-sync",
      reason: "internet_available",
    };
  }

  return {
    mode: "offline-relay",
    reason: "internet_unavailable",
  };
}

export async function queuePackageForOfflineRelay(input: {
  packageId: string;
  status: PackageLifecycleStatus;
  payload?: Record<string, unknown>;
  sourceUserId?: string | null;
}): Promise<PackageOutboxEvent> {
  const statusToEventType: Record<
    PackageLifecycleStatus,
    | "package_created"
    | "package_picked_up"
    | "package_in_transit"
    | "package_received_offline"
    | "package_synced_online"
    | "package_verified"
  > = {
    created: "package_created",
    picked_up: "package_picked_up",
    in_transit: "package_in_transit",
    received_offline: "package_received_offline",
    synced_online: "package_synced_online",
    verified: "package_verified",
  };

  return enqueuePackageEvent({
    packageId: input.packageId,
    eventType: statusToEventType[input.status],
    status: input.status,
    payload: input.payload,
    sourceUserId: input.sourceUserId,
  });
}

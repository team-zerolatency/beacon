import { getInternetState, subscribeInternetState } from "@/lib/connectivity";
import { listPendingOutboxEvents } from "@/lib/offline-queue";
import {
  getPackageRoutingDecision,
  queuePackageForOfflineRelay,
} from "@/lib/package-routing";
import { supabase } from "@/lib/supabase";
import { flushPackageOutbox } from "@/lib/sync-engine";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type HelperHomeTab = "requests" | "inbox" | "verify";
type DashboardView = "home" | "profile";

type RequestStatus = "open" | "in_progress" | "resolved" | "cancelled";
type RequestFilter = "all" | RequestStatus;
const REQUESTS_PAGE_SIZE = 50;

type PackageStatus =
  | "created"
  | "picked_up"
  | "in_transit"
  | "received_offline"
  | "synced_online"
  | "verified";

type PackageRow = {
  id: string;
  status: PackageStatus;
  recipient_name: string | null;
  destination_city: string | null;
  last_event_seq: number;
  created_at: string;
};

type PackageVerificationRow = {
  id: string;
  package_id: string;
  helper_decision: "pending" | "approved" | "rejected";
  helper_notes: string | null;
  ngo_decision: "pending" | "approved" | "rejected";
  ngo_notes: string | null;
  updated_at: string;
};

type HelpRequestRow = {
  id: string;
  client_name: string | null;
  requester_phone: string | null;
  target_ngo_name: string | null;
  target_state: string | null;
  target_district: string | null;
  target_city: string | null;
  message: string;
  status: RequestStatus;
  lat: number;
  lng: number;
  created_at: string;
};

type HelperDashboardScreenProps = {
  displayName: string;
  onSignOut: () => Promise<void> | void;
};

function getHelperTabLabel(tab: HelperHomeTab) {
  if (tab === "requests") {
    return "Requests";
  }

  if (tab === "inbox") {
    return "Inbox";
  }

  if (tab === "verify") {
    return "Verify";
  }

  return "Requests";
}

function formatWhen(iso: string) {
  const date = new Date(iso);
  return date.toLocaleString();
}

export function HelperDashboardScreen({
  displayName,
  onSignOut,
}: HelperDashboardScreenProps) {
  const [dashboardView, setDashboardView] = useState<DashboardView>("home");
  const [activeHomeTab, setActiveHomeTab] = useState<HelperHomeTab>("requests");
  const [requestFilter, setRequestFilter] = useState<RequestFilter>("all");
  const [helperUserId, setHelperUserId] = useState<string | null>(null);
  const [hasInternet, setHasInternet] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [helpRequests, setHelpRequests] = useState<HelpRequestRow[]>([]);
  const [requestsHasMore, setRequestsHasMore] = useState(true);
  const [loadingMoreRequests, setLoadingMoreRequests] = useState(false);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [verifications, setVerifications] = useState<PackageVerificationRow[]>(
    [],
  );
  const [verificationNotes, setVerificationNotes] = useState<
    Record<string, string>
  >({});
  const [submittingPackageId, setSubmittingPackageId] = useState<string | null>(
    null,
  );
  const [submittingVerificationId, setSubmittingVerificationId] = useState<
    string | null
  >(null);
  const [updatingRequestId, setUpdatingRequestId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState(
    "Waiting for first sync attempt.",
  );

  const unresolvedVerificationCount = useMemo(() => {
    return verifications.filter((item) => item.ngo_decision === "pending")
      .length;
  }, [verifications]);

  const openRequestCount = useMemo(() => {
    return helpRequests.filter((request) => request.status === "open").length;
  }, [helpRequests]);

  const requestCounts = useMemo(() => {
    return helpRequests.reduce(
      (acc, req) => {
        acc.all += 1;
        acc[req.status] += 1;
        return acc;
      },
      {
        all: 0,
        open: 0,
        in_progress: 0,
        resolved: 0,
        cancelled: 0,
      } as Record<"all" | RequestStatus, number>,
    );
  }, [helpRequests]);

  const filteredHelpRequests = useMemo(() => {
    if (requestFilter === "all") {
      return helpRequests;
    }

    return helpRequests.filter((request) => request.status === requestFilter);
  }, [helpRequests, requestFilter]);

  const packageMap = useMemo(() => {
    const map: Record<string, PackageRow> = {};

    for (const pkg of packages) {
      map[pkg.id] = pkg;
    }

    return map;
  }, [packages]);

  const refreshPendingCount = useCallback(async () => {
    const pending = await listPendingOutboxEvents();
    setPendingCount(pending.length);
  }, []);

  const fetchHelpRequests = useCallback(
    async (options?: { onlyOpen?: boolean; beforeCreatedAt?: string }) => {
      if (!supabase) {
        return null;
      }

      const onlyOpen = options?.onlyOpen ?? false;
      const beforeCreatedAt = options?.beforeCreatedAt;
      const baseSelect =
        "id, client_name, requester_phone, target_ngo_name, target_state, target_district, target_city, message, status, lat, lng, created_at";
      const fallbackSelect =
        "id, client_name, target_ngo_name, target_city, message, status, lat, lng, created_at";

      let richQuery = supabase
        .from("help_requests")
        .select(baseSelect)
        .order("created_at", { ascending: false })
        .limit(REQUESTS_PAGE_SIZE);

      let fallbackQuery = supabase
        .from("help_requests")
        .select(fallbackSelect)
        .order("created_at", { ascending: false })
        .limit(REQUESTS_PAGE_SIZE);

      if (beforeCreatedAt) {
        richQuery = richQuery.lt("created_at", beforeCreatedAt);
        fallbackQuery = fallbackQuery.lt("created_at", beforeCreatedAt);
      }

      if (onlyOpen) {
        richQuery = richQuery.eq("status", "open");
        fallbackQuery = fallbackQuery.eq("status", "open");
      }

      const richRequestsResult = await richQuery;

      if (richRequestsResult.error) {
        const minimalRequestsResult = await fallbackQuery;

        if (minimalRequestsResult.error) {
          setError(minimalRequestsResult.error.message);
          return null;
        }

        const fallbackRows = (minimalRequestsResult.data ?? []).map((row) => ({
          ...(row as HelpRequestRow),
          requester_phone: null,
          target_state: null,
          target_district: null,
        }));

        return {
          rows: fallbackRows,
          hasMore: fallbackRows.length === REQUESTS_PAGE_SIZE,
        };
      }

      const rows = (richRequestsResult.data as HelpRequestRow[]) ?? [];
      return {
        rows,
        hasMore: rows.length === REQUESTS_PAGE_SIZE,
      };
    },
    [],
  );

  const loadDashboardData = useCallback(async () => {
    if (!supabase || !helperUserId) {
      return;
    }

    const [packagesResult, verificationsResult] = await Promise.all([
      supabase
        .from("packages")
        .select(
          "id, status, recipient_name, destination_city, last_event_seq, created_at",
        )
        .eq("current_holder_user_id", helperUserId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("package_verifications")
        .select(
          "id, package_id, helper_decision, helper_notes, ngo_decision, ngo_notes, updated_at",
        )
        .eq("helper_user_id", helperUserId)
        .order("updated_at", { ascending: false })
        .limit(50),
    ]);

    const requestsResult = await fetchHelpRequests();

    if (!requestsResult) {
      return;
    }

    if (packagesResult.error) {
      setError(packagesResult.error.message);
      return;
    }

    if (verificationsResult.error) {
      setError(verificationsResult.error.message);
      return;
    }

    setError(null);
    setHelpRequests(requestsResult.rows);
    setRequestsHasMore(requestsResult.hasMore);
    setPackages((packagesResult.data as PackageRow[]) ?? []);
    setVerifications(
      (verificationsResult.data as PackageVerificationRow[]) ?? [],
    );
  }, [fetchHelpRequests, helperUserId]);

  const pollOpenHelpRequests = useCallback(async () => {
    const openRequestsResult = await fetchHelpRequests({ onlyOpen: true });

    if (!openRequestsResult) {
      return;
    }

    const openRequests = openRequestsResult.rows;

    setHelpRequests((previous) => {
      const openById = new Map(
        openRequests.map((request) => [request.id, request]),
      );
      const next = previous.map((request) => {
        if (request.status !== "open") {
          return request;
        }

        return openById.get(request.id) ?? request;
      });

      const existingIds = new Set(next.map((request) => request.id));

      for (const openRequest of openRequests) {
        if (!existingIds.has(openRequest.id)) {
          next.push(openRequest);
        }
      }

      next.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

      return next;
    });
  }, [fetchHelpRequests]);

  const loadMoreRequests = useCallback(async () => {
    if (!requestsHasMore || loadingMoreRequests) {
      return;
    }

    const lastCreatedAt = helpRequests[helpRequests.length - 1]?.created_at;
    if (!lastCreatedAt) {
      setRequestsHasMore(false);
      return;
    }

    setLoadingMoreRequests(true);
    const nextPage = await fetchHelpRequests({
      beforeCreatedAt: lastCreatedAt,
    });
    setLoadingMoreRequests(false);

    if (!nextPage) {
      return;
    }

    setHelpRequests((previous) => {
      const seen = new Set(previous.map((request) => request.id));
      const merged = [...previous];

      for (const request of nextPage.rows) {
        if (!seen.has(request.id)) {
          merged.push(request);
          seen.add(request.id);
        }
      }

      merged.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

      return merged;
    });
    setRequestsHasMore(nextPage.hasMore);
  }, [fetchHelpRequests, helpRequests, loadingMoreRequests, requestsHasMore]);

  const bootstrap = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    const state = await getInternetState();
    setHasInternet(state.hasInternet);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    setHelperUserId(user.id);
  }, []);

  useEffect(() => {
    void bootstrap();

    const unsubscribe = subscribeInternetState((state) => {
      setHasInternet(state.hasInternet);
    });

    return unsubscribe;
  }, [bootstrap]);

  useEffect(() => {
    async function hydrate() {
      if (!helperUserId) {
        return;
      }

      setLoading(true);
      await Promise.all([refreshPendingCount(), loadDashboardData()]);
      setLoading(false);
    }

    void hydrate();
  }, [helperUserId, loadDashboardData, refreshPendingCount]);

  useEffect(() => {
    if (!supabase || !helperUserId) {
      return;
    }

    const client = supabase;

    const channel = client
      .channel(`helper-dashboard-live-${helperUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "help_requests" },
        () => {
          void loadDashboardData();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "packages" },
        () => {
          void loadDashboardData();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "package_verifications" },
        () => {
          void loadDashboardData();
        },
      )
      .subscribe();

    const fullRefreshInterval = setInterval(() => {
      void loadDashboardData();
    }, 12000);

    const openRequestsInterval = setInterval(() => {
      void pollOpenHelpRequests();
    }, 4000);

    return () => {
      clearInterval(fullRefreshInterval);
      clearInterval(openRequestsInterval);
      void client.removeChannel(channel);
    };
  }, [helperUserId, loadDashboardData, pollOpenHelpRequests]);

  useEffect(() => {
    async function syncWhenOnline() {
      if (!helperUserId || !hasInternet) {
        return;
      }

      const result = await flushPackageOutbox();
      await Promise.all([refreshPendingCount(), loadDashboardData()]);

      if (result.errorMessage) {
        setSyncMessage(`Online sync paused: ${result.errorMessage}`);
        return;
      }

      if (result.syncedCount > 0 || result.failedCount > 0) {
        setSyncMessage(
          `Online sync: ${result.syncedCount} synced, ${result.failedCount} failed.`,
        );
      } else {
        setSyncMessage("Online mode: live data from database.");
      }
    }

    void syncWhenOnline();
  }, [hasInternet, helperUserId, loadDashboardData, refreshPendingCount]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshPendingCount(), loadDashboardData()]);
    setRefreshing(false);
  }, [loadDashboardData, refreshPendingCount]);

  const pushPackageStatus = useCallback(
    async (pkg: PackageRow, nextStatus: PackageStatus) => {
      if (!supabase || !helperUserId) {
        return;
      }

      setSubmittingPackageId(pkg.id);

      try {
        const decision = await getPackageRoutingDecision();

        if (decision.mode === "offline-relay") {
          await queuePackageForOfflineRelay({
            packageId: pkg.id,
            status: nextStatus,
            sourceUserId: helperUserId,
            payload: {
              queuedFrom: "helper_dashboard",
              reason: decision.reason,
            },
          });

          setSyncMessage(`Queued ${nextStatus} for offline relay.`);
          await refreshPendingCount();
          return;
        }

        const { data: latest, error: latestError } = await supabase
          .from("packages")
          .select("last_event_seq")
          .eq("id", pkg.id)
          .single();

        if (latestError) {
          setError(latestError.message);
          return;
        }

        const nextSeq = Number(latest?.last_event_seq ?? 0) + 1;

        const statusToEventType: Record<
          PackageStatus,
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

        const { error: insertError } = await supabase
          .from("package_events")
          .insert({
            package_id: pkg.id,
            event_seq: nextSeq,
            event_type: statusToEventType[nextStatus],
            status: nextStatus,
            source_user_id: helperUserId,
            payload: {
              source: "helper_dashboard",
            },
            idempotency_key: `${pkg.id}-${nextSeq}-${Date.now()}`,
          });

        if (insertError) {
          setError(insertError.message);
          return;
        }

        setError(null);
        setSyncMessage(
          `Updated package ${pkg.id.slice(0, 8)} to ${nextStatus}.`,
        );
      } finally {
        await Promise.all([refreshPendingCount(), loadDashboardData()]);
        setSubmittingPackageId(null);
      }
    },
    [helperUserId, loadDashboardData, refreshPendingCount],
  );

  const handleVerify = useCallback(
    async (
      item: PackageVerificationRow,
      decision: "approved" | "rejected",
    ): Promise<void> => {
      if (!supabase || !helperUserId) {
        return;
      }

      setSubmittingVerificationId(item.id);

      const note = verificationNotes[item.id]?.trim() ?? "";
      const { error: updateError } = await supabase
        .from("package_verifications")
        .update({
          helper_decision: decision,
          helper_notes: note || null,
          helper_decision_at: new Date().toISOString(),
          helper_user_id: helperUserId,
        })
        .eq("id", item.id)
        .eq("helper_user_id", helperUserId);

      if (updateError) {
        setError(updateError.message);
        setSubmittingVerificationId(null);
        return;
      }

      setError(null);
      setSyncMessage(
        `Helper verification ${decision} for package ${item.package_id.slice(0, 8)}.`,
      );
      setSubmittingVerificationId(null);
      await loadDashboardData();
    },
    [helperUserId, loadDashboardData, verificationNotes],
  );

  const handleUpdateRequestStatus = useCallback(
    async (
      request: HelpRequestRow,
      nextStatus: RequestStatus,
    ): Promise<void> => {
      if (!supabase) {
        return;
      }

      if (nextStatus === "resolved") {
        setSyncMessage(
          "Helper cannot set resolved directly. Use Request NGO Resolve.",
        );
        return;
      }

      if (request.status === nextStatus) {
        return;
      }

      setUpdatingRequestId(request.id);

      const { error: updateError } = await supabase
        .from("help_requests")
        .update({ status: nextStatus })
        .eq("id", request.id);

      if (updateError) {
        setError(updateError.message);
        setUpdatingRequestId(null);
        return;
      }

      setError(null);
      setSyncMessage(
        `Request ${request.id.slice(0, 8)} moved to ${nextStatus}.`,
      );
      setUpdatingRequestId(null);
      await loadDashboardData();
    },
    [loadDashboardData],
  );

  const handleRequestNgoResolve = useCallback(
    async (request: HelpRequestRow): Promise<void> => {
      if (!supabase) {
        return;
      }

      setUpdatingRequestId(request.id);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const helperTag = user?.email?.split("@")[0] ?? "Helper";

      const { error: insertError } = await supabase
        .from("notifications")
        .insert({
          ngo_name: request.target_ngo_name ?? "NGO",
          message: `${helperTag} requested NGO resolution for request ${request.id.slice(0, 8)}`,
          request_id: request.id,
          type: "helper_resolution_request",
          read: false,
        });

      if (insertError) {
        setError(insertError.message);
        setUpdatingRequestId(null);
        return;
      }

      setError(null);
      setSyncMessage(
        `Resolution request sent to NGO for ${request.id.slice(0, 8)}.`,
      );
      setUpdatingRequestId(null);
    },
    [],
  );

  const statusOptions: { label: string; value: RequestStatus }[] = [
    { label: "Open", value: "open" },
    { label: "In progress", value: "in_progress" },
    { label: "Cancelled", value: "cancelled" },
  ];

  const filterOptions: RequestFilter[] = [
    "all",
    "open",
    "in_progress",
    "resolved",
    "cancelled",
  ];

  function getStatusLabel(status: RequestStatus): string {
    return status.replace("_", " ");
  }

  function getFilterLabel(filter: RequestFilter): string {
    if (filter === "all") {
      return "All";
    }

    return getStatusLabel(filter);
  }

  function openStatusSelector(request: HelpRequestRow) {
    if (Platform.OS !== "ios") {
      return;
    }

    const labels = statusOptions.map((option) => option.label);
    const currentIndex = statusOptions.findIndex(
      (option) => option.value === request.status,
    );

    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: "Update status",
        options: [...labels, "Cancel"],
        cancelButtonIndex: labels.length,
      },
      (index) => {
        if (index < 0 || index >= labels.length) {
          return;
        }

        const next = statusOptions[index]?.value;
        if (!next || next === request.status || index === currentIndex) {
          return;
        }

        void handleUpdateRequestStatus(request, next);
      },
    );
  }

  const renderStatusAction = useCallback(
    (pkg: PackageRow) => {
      if (pkg.status === "created") {
        return (
          <Pressable
            style={styles.actionButton}
            onPress={() => {
              void pushPackageStatus(pkg, "picked_up");
            }}
            disabled={submittingPackageId === pkg.id}
          >
            <Text style={styles.actionButtonText}>Mark Picked Up</Text>
          </Pressable>
        );
      }

      if (pkg.status === "picked_up") {
        return (
          <Pressable
            style={styles.actionButton}
            onPress={() => {
              void pushPackageStatus(pkg, "in_transit");
            }}
            disabled={submittingPackageId === pkg.id}
          >
            <Text style={styles.actionButtonText}>Mark In Transit</Text>
          </Pressable>
        );
      }

      if (pkg.status === "in_transit") {
        return (
          <Pressable
            style={styles.actionButton}
            onPress={() => {
              void pushPackageStatus(pkg, "received_offline");
            }}
            disabled={submittingPackageId === pkg.id}
          >
            <Text style={styles.actionButtonText}>Mark Received Offline</Text>
          </Pressable>
        );
      }

      if (pkg.status === "received_offline") {
        return (
          <Pressable
            style={styles.actionButton}
            onPress={() => {
              void pushPackageStatus(pkg, "synced_online");
            }}
            disabled={submittingPackageId === pkg.id}
          >
            <Text style={styles.actionButtonText}>Mark Synced Online</Text>
          </Pressable>
        );
      }

      return <Text style={styles.meta}>No manual action required.</Text>;
    },
    [pushPackageStatus, submittingPackageId],
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#F97316" />
        <Text style={styles.loadingText}>Loading volunteer dashboard...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.shell}>
        <View style={styles.heroCard}>
          <Text style={styles.title}>Hello, {displayName}</Text>
          <Text style={styles.subtitle}>Volunteer Dashboard</Text>
          <Text style={styles.summaryText}>
            Network: {hasInternet ? "Online" : "Offline"}
          </Text>
          <Text style={styles.summaryText}>
            Data source:{" "}
            {hasInternet ? "Database (live)" : "Offline queue + last sync"}
          </Text>
          <Text style={styles.summaryText}>Pending sync: {pendingCount}</Text>
          <Text style={styles.summaryText}>Last sync info: {syncMessage}</Text>
          <Text style={styles.summaryText}>
            Verification pending: {unresolvedVerificationCount}
          </Text>
          <Text style={styles.summaryText}>
            Open requests: {openRequestCount}
          </Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>

        {dashboardView === "home" ? (
          <View style={styles.homeTabRow}>
            {(["requests", "inbox", "verify"] as const).map((tab) => {
              const active = activeHomeTab === tab;

              return (
                <Pressable
                  key={tab}
                  style={[
                    styles.homeTabButton,
                    active ? styles.homeTabButtonActive : null,
                  ]}
                  onPress={() => {
                    setActiveHomeTab(tab);
                  }}
                >
                  <Text
                    style={[
                      styles.homeTabText,
                      active ? styles.homeTabTextActive : null,
                    ]}
                  >
                    {getHelperTabLabel(tab)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                void handleRefresh();
              }}
              tintColor="#F97316"
            />
          }
        >
          {dashboardView === "home" && activeHomeTab === "requests" ? (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Realtime Help From Clients</Text>
              <Text style={styles.panelHint}>
                Updates from database and realtime feed. Change status to
                coordinate response.
              </Text>

              <View style={styles.filterRow}>
                {filterOptions.map((filter) => (
                  <Pressable
                    key={filter}
                    onPress={() => setRequestFilter(filter)}
                    style={[
                      styles.filterPill,
                      requestFilter === filter ? styles.filterPillActive : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterPillText,
                        requestFilter === filter
                          ? styles.filterPillTextActive
                          : null,
                      ]}
                    >
                      {getFilterLabel(filter)} ({requestCounts[filter]})
                    </Text>
                  </Pressable>
                ))}
              </View>

              {filteredHelpRequests.length === 0 ? (
                <View style={styles.card}>
                  <Text style={styles.meta}>
                    No requests for selected filter.
                  </Text>
                  <Text style={styles.meta}>
                    If database has rows, check helper access policy on
                    help_requests.
                  </Text>
                </View>
              ) : (
                <>
                  {filteredHelpRequests.map((request) => (
                    <View key={request.id} style={styles.card}>
                      <View style={styles.requestTopRow}>
                        <View style={styles.requestTopTextWrap}>
                          <Text style={styles.meta}>
                            {formatWhen(request.created_at)}
                          </Text>
                          <Text style={styles.cardTitle}>
                            {request.client_name?.trim() || "Client"}
                          </Text>
                          <Text style={styles.meta}>{request.message}</Text>
                        </View>

                        <View style={styles.statusControlWrap}>
                          <Text style={styles.statusLabel}>Status</Text>
                          {request.status === "resolved" ? (
                            <View style={styles.statusReadonlyChip}>
                              <Text style={styles.statusReadonlyText}>
                                Resolved
                              </Text>
                            </View>
                          ) : Platform.OS === "ios" ? (
                            <Pressable
                              style={styles.statusPickerButton}
                              disabled={updatingRequestId === request.id}
                              onPress={() => openStatusSelector(request)}
                            >
                              <Text style={styles.statusPickerButtonText}>
                                {getStatusLabel(request.status)}
                              </Text>
                              <Ionicons
                                name="chevron-down"
                                size={14}
                                color="#FFFFFF"
                              />
                            </Pressable>
                          ) : (
                            <View style={styles.statusPickerContainer}>
                              <Picker
                                mode="dropdown"
                                selectedValue={request.status}
                                enabled={updatingRequestId !== request.id}
                                onValueChange={(value) => {
                                  const next = String(
                                    value ?? "",
                                  ) as RequestStatus;
                                  if (!next || next === request.status) {
                                    return;
                                  }

                                  void handleUpdateRequestStatus(request, next);
                                }}
                                style={styles.statusPicker}
                                dropdownIconColor="#FFFFFF"
                              >
                                {statusOptions.map((option) => (
                                  <Picker.Item
                                    key={option.value}
                                    label={option.label}
                                    value={option.value}
                                    color="#111827"
                                  />
                                ))}
                              </Picker>
                            </View>
                          )}
                        </View>
                      </View>

                      <Text style={styles.meta}>
                        Phone:{" "}
                        {request.requester_phone?.trim() || "Not provided"}
                      </Text>
                      <Text style={styles.meta}>
                        NGO: {request.target_ngo_name?.trim() || "Not assigned"}
                      </Text>
                      <Text style={styles.meta}>
                        Area: {request.target_state ?? "-"} /{" "}
                        {request.target_district ?? "-"} /{" "}
                        {request.target_city ?? "-"}
                      </Text>
                      <Text style={styles.meta}>
                        Coordinates:{" "}
                        {Number.isFinite(request.lat) &&
                        Number.isFinite(request.lng)
                          ? `${request.lat.toFixed(5)}, ${request.lng.toFixed(5)}`
                          : "Not available"}
                      </Text>

                      {request.status === "in_progress" ? (
                        <Pressable
                          style={styles.secondaryButton}
                          disabled={updatingRequestId === request.id}
                          onPress={() => {
                            void handleRequestNgoResolve(request);
                          }}
                        >
                          <Text style={styles.secondaryButtonText}>
                            {updatingRequestId === request.id
                              ? "Sending..."
                              : "Request NGO Resolve"}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ))}

                  {requestFilter === "all" && requestsHasMore ? (
                    <Pressable
                      style={styles.secondaryButton}
                      disabled={loadingMoreRequests}
                      onPress={() => {
                        void loadMoreRequests();
                      }}
                    >
                      <Text style={styles.secondaryButtonText}>
                        {loadingMoreRequests
                          ? "Loading more..."
                          : "Load older requests"}
                      </Text>
                    </Pressable>
                  ) : null}
                </>
              )}
            </View>
          ) : null}

          {dashboardView === "home" && activeHomeTab === "inbox" ? (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Package Inbox</Text>

              {packages.length === 0 ? (
                <Text style={styles.meta}>
                  No packages assigned to this helper.
                </Text>
              ) : (
                packages.map((pkg) => (
                  <View key={pkg.id} style={styles.card}>
                    <Text style={styles.cardTitle}>
                      Package #{pkg.id.slice(0, 8)}
                    </Text>
                    <Text style={styles.meta}>Status: {pkg.status}</Text>
                    <Text style={styles.meta}>
                      Destination:{" "}
                      {pkg.destination_city?.trim() || "Unknown city"}
                    </Text>
                    <Text style={styles.meta}>
                      Updated: {formatWhen(pkg.created_at)}
                    </Text>
                    {renderStatusAction(pkg)}
                  </View>
                ))
              )}
            </View>
          ) : null}

          {dashboardView === "home" && activeHomeTab === "verify" ? (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Genuinity Verification</Text>

              {verifications.length === 0 ? (
                <Text style={styles.meta}>No verification tasks assigned.</Text>
              ) : (
                verifications.map((item) => {
                  const relatedPackage = packageMap[item.package_id];
                  const note =
                    verificationNotes[item.id] ?? item.helper_notes ?? "";

                  return (
                    <View key={item.id} style={styles.card}>
                      <Text style={styles.cardTitle}>
                        Package #{item.package_id.slice(0, 8)}
                      </Text>
                      <Text style={styles.meta}>
                        Package status: {relatedPackage?.status ?? "Not loaded"}
                      </Text>
                      <Text style={styles.meta}>
                        Helper decision: {item.helper_decision}
                      </Text>
                      <Text style={styles.meta}>NGO: {item.ngo_decision}</Text>

                      <TextInput
                        style={styles.noteInput}
                        placeholder="Helper notes"
                        placeholderTextColor="#737373"
                        value={note}
                        onChangeText={(value) => {
                          setVerificationNotes((prev) => ({
                            ...prev,
                            [item.id]: value,
                          }));
                        }}
                        multiline
                      />

                      <View style={styles.inlineRow}>
                        <Pressable
                          style={[styles.secondaryButton, styles.flexButton]}
                          disabled={submittingVerificationId === item.id}
                          onPress={() => {
                            void handleVerify(item, "rejected");
                          }}
                        >
                          <Text style={styles.secondaryButtonText}>No</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.primaryButton, styles.flexButton]}
                          disabled={submittingVerificationId === item.id}
                          onPress={() => {
                            void handleVerify(item, "approved");
                          }}
                        >
                          <Text style={styles.primaryButtonText}>Yes</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          ) : null}

          {dashboardView === "profile" ? (
            <View style={styles.profileWrap}>
              <View style={styles.profileHeroCard}>
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarText}>
                    {(displayName.trim()[0] ?? "H").toUpperCase()}
                  </Text>
                </View>
                <View style={styles.profileHeroTextWrap}>
                  <Text style={styles.profileName}>{displayName}</Text>
                  <Text style={styles.profileRole}>Volunteer Helper</Text>
                  <View style={styles.badgeRow}>
                    <View
                      style={[
                        styles.statusBadge,
                        hasInternet
                          ? styles.statusBadgeOnline
                          : styles.statusBadgeOffline,
                      ]}
                    >
                      <Text style={styles.statusBadgeText}>
                        {hasInternet ? "Online" : "Offline"}
                      </Text>
                    </View>
                    <View style={styles.roleBadge}>
                      <Text style={styles.roleBadgeText}>Field Ops</Text>
                    </View>
                  </View>
                </View>
              </View>

              <View style={styles.profileStatsGrid}>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Open Requests</Text>
                  <Text style={styles.statValue}>{openRequestCount}</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Pending Verify</Text>
                  <Text style={styles.statValue}>
                    {unresolvedVerificationCount}
                  </Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Queue Pending</Text>
                  <Text style={styles.statValue}>{pendingCount}</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>My Packages</Text>
                  <Text style={styles.statValue}>{packages.length}</Text>
                </View>
              </View>

              <View style={styles.profileInfoCard}>
                <Text style={styles.profileInfoTitle}>
                  Operational Snapshot
                </Text>
                <Text style={styles.profileInfoText}>
                  Network:{" "}
                  {hasInternet
                    ? "Live database connected"
                    : "Offline mode with queued relay"}
                </Text>
                <Text style={styles.profileInfoText}>
                  Latest sync: {syncMessage}
                </Text>
              </View>

              <Pressable
                style={styles.signOutButton}
                onPress={() => {
                  void onSignOut();
                }}
              >
                <Ionicons name="log-out-outline" size={16} color="#FCA5A5" />
                <Text style={styles.signOutButtonText}>Sign out</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.bottomTabBar}>
          <Pressable
            onPress={() => setDashboardView("home")}
            style={[
              styles.bottomTabButton,
              dashboardView === "home" ? styles.bottomTabButtonActive : null,
            ]}
          >
            <Ionicons
              name={dashboardView === "home" ? "home" : "home-outline"}
              size={20}
              color={dashboardView === "home" ? "#F97316" : "#8D8D8D"}
            />
            <Text
              style={[
                styles.bottomTabLabel,
                dashboardView === "home" ? styles.bottomTabLabelActive : null,
              ]}
            >
              Home
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setDashboardView("profile")}
            style={[
              styles.bottomTabButton,
              dashboardView === "profile" ? styles.bottomTabButtonActive : null,
            ]}
          >
            <Ionicons
              name={dashboardView === "profile" ? "person" : "person-outline"}
              size={20}
              color={dashboardView === "profile" ? "#F97316" : "#8D8D8D"}
            />
            <Text
              style={[
                styles.bottomTabLabel,
                dashboardView === "profile"
                  ? styles.bottomTabLabelActive
                  : null,
              ]}
            >
              Profile
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#000000",
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  shell: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
    gap: 10,
  },
  heroCard: {
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "#111111",
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
  },
  subtitle: {
    color: "#FB923C",
    fontSize: 12,
    fontWeight: "700",
  },
  summaryText: {
    color: "#D4D4D8",
    fontSize: 12,
    fontWeight: "500",
  },
  errorText: {
    color: "#FCA5A5",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
  },
  homeTabRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  homeTabButton: {
    minWidth: 88,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#3F3F46",
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  homeTabButtonActive: {
    borderColor: "#F97316",
    backgroundColor: "rgba(249, 115, 22, 0.15)",
  },
  homeTabText: {
    color: "#A1A1AA",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  homeTabTextActive: {
    color: "#FDBA74",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 12,
    gap: 12,
  },
  bottomTabBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#1F2937",
    backgroundColor: "#0B1220",
    borderRadius: 14,
    minHeight: 66,
    paddingVertical: 7,
    paddingHorizontal: 7,
    marginBottom: Platform.OS === "ios" ? 1 : 2,
  },
  bottomTabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: 10,
    minHeight: 50,
  },
  bottomTabButtonActive: {
    backgroundColor: "rgba(249, 115, 22, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(249, 115, 22, 0.5)",
  },
  bottomTabLabel: {
    color: "#8D8D8D",
    fontSize: 12,
    fontWeight: "700",
  },
  bottomTabLabelActive: {
    color: "#F97316",
  },
  panel: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#27272A",
    backgroundColor: "#101012",
    padding: 10,
    gap: 8,
  },
  profileWrap: {
    gap: 10,
  },
  profileHeroCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#203247",
    backgroundColor: "#0B1726",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatarCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F97316",
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
  },
  profileHeroTextWrap: {
    flex: 1,
    gap: 2,
  },
  profileName: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
  },
  profileRole: {
    color: "#A5B4FC",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  badgeRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  statusBadgeOnline: {
    borderColor: "#22C55E",
    backgroundColor: "rgba(34, 197, 94, 0.16)",
  },
  statusBadgeOffline: {
    borderColor: "#EAB308",
    backgroundColor: "rgba(234, 179, 8, 0.16)",
  },
  statusBadgeText: {
    color: "#E5E7EB",
    fontSize: 11,
    fontWeight: "700",
  },
  roleBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#4F46E5",
    backgroundColor: "rgba(79, 70, 229, 0.2)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  roleBadgeText: {
    color: "#C7D2FE",
    fontSize: 11,
    fontWeight: "700",
  },
  profileStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statCard: {
    width: "48.5%",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2B2E39",
    backgroundColor: "#12151E",
    paddingVertical: 12,
    paddingHorizontal: 10,
    gap: 4,
  },
  statLabel: {
    color: "#9CA3AF",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  statValue: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
  },
  profileInfoCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2F2F46",
    backgroundColor: "#121226",
    padding: 12,
    gap: 4,
  },
  profileInfoTitle: {
    color: "#E5E7EB",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 2,
  },
  profileInfoText: {
    color: "#CBD5E1",
    fontSize: 12,
    fontWeight: "600",
  },
  panelTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  panelHint: {
    color: "#A1A1AA",
    fontSize: 12,
    marginBottom: 2,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 4,
  },
  filterPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#3F3F46",
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#0D1117",
  },
  filterPillActive: {
    borderColor: "#F97316",
    backgroundColor: "rgba(249, 115, 22, 0.2)",
  },
  filterPillText: {
    color: "#A1A1AA",
    fontSize: 12,
    fontWeight: "700",
  },
  filterPillTextActive: {
    color: "#FDBA74",
  },
  card: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#3F3F46",
    backgroundColor: "#17171A",
    padding: 10,
    gap: 4,
  },
  cardTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  meta: {
    color: "#D4D4D8",
    fontSize: 12,
    fontWeight: "600",
  },
  requestTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  requestTopTextWrap: {
    flex: 1,
    gap: 2,
  },
  statusControlWrap: {
    width: 118,
    alignItems: "stretch",
    gap: 4,
  },
  statusLabel: {
    color: "#93C5FD",
    fontSize: 11,
    fontWeight: "600",
    textAlign: "right",
  },
  statusPickerContainer: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1D4ED8",
    overflow: "hidden",
    backgroundColor: "#0A1022",
    minHeight: 40,
    justifyContent: "center",
  },
  statusPicker: {
    color: "#FFFFFF",
    height: 40,
  },
  statusPickerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1D4ED8",
    backgroundColor: "#0A1022",
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  statusPickerButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  statusReadonlyChip: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#16A34A",
    backgroundColor: "rgba(22, 163, 74, 0.16)",
    paddingHorizontal: 10,
    paddingVertical: 9,
    alignItems: "center",
  },
  statusReadonlyText: {
    color: "#86EFAC",
    fontSize: 12,
    fontWeight: "700",
  },
  noteInput: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#3F3F46",
    backgroundColor: "#09090B",
    color: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 72,
    textAlignVertical: "top",
  },
  inlineRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  flexButton: {
    flex: 1,
    alignItems: "center",
  },
  primaryButton: {
    backgroundColor: "#F97316",
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  secondaryButton: {
    borderColor: "#F97316",
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: "#FB923C",
    fontWeight: "700",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  actionButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#F97316",
    backgroundColor: "rgba(249, 115, 22, 0.16)",
    paddingVertical: 7,
    alignItems: "center",
    marginTop: 4,
  },
  actionButtonText: {
    color: "#FDBA74",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  signOutButton: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#7F1D1D",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: "rgba(127, 29, 29, 0.25)",
  },
  signOutButtonText: {
    color: "#FCA5A5",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
});

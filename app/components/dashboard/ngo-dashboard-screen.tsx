import { registerDevicePushToken } from "@/lib/push-notifications";
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as Location from "expo-location";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import ClusteredMapView from "react-native-map-clustering";
import { Marker, type Region } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";

type NotificationsModule = typeof import("expo-notifications");

function getNotificationsModule(): NotificationsModule | null {
  if (Constants.appOwnership === "expo") {
    return null;
  }

  try {
    return require("expo-notifications") as NotificationsModule;
  } catch {
    return null;
  }
}

type NgoTab = "overview" | "analytics" | "map" | "actions";
type DashboardView = "home" | "requests" | "profile";
type RequestStatus = "open" | "in_progress" | "resolved" | "cancelled";

const NGO_HOME_TABS: NgoTab[] = ["overview", "analytics", "map", "actions"];

function getNgoTabLabel(tab: NgoTab) {
  if (tab === "overview") {
    return "Overview";
  }

  if (tab === "analytics") {
    return "Analytics";
  }

  if (tab === "map") {
    return "Map";
  }

  return "Actions";
}

function getNgoTabIcon(
  tab: NgoTab,
  active: boolean,
): keyof typeof Ionicons.glyphMap {
  if (tab === "overview") {
    return active ? "analytics" : "analytics-outline";
  }

  if (tab === "analytics") {
    return active ? "stats-chart" : "stats-chart-outline";
  }

  if (tab === "map") {
    return active ? "map" : "map-outline";
  }

  return active ? "flash" : "flash-outline";
}

function getNextStatus(status: RequestStatus): RequestStatus {
  if (status === "open") {
    return "in_progress";
  }

  if (status === "in_progress") {
    return "resolved";
  }

  return status;
}

type NgoDirectoryRow = {
  id: string;
  name: string;
  state: string;
  district: string;
  city: string;
};

type NgoMapLocationRow = {
  id: string;
  name: string;
  state: string | null;
  district: string | null;
  city: string | null;
  lat: number;
  lng: number;
};

type HelpRequestRow = {
  id: string;
  client_name: string | null;
  requester_phone: string | null;
  target_ngo_name: string | null;
  target_district?: string | null;
  target_city: string | null;
  message: string;
  status: RequestStatus;
  assigned_helper_id?: string | null;
  resolved_at?: string | null;
  updated_at?: string | null;
  lat: number;
  lng: number;
  created_at: string;
};

type NgoDashboardProps = {
  displayName: string;
  onSignOut: () => Promise<void> | void;
};

export function NgoDashboardScreen({
  displayName,
  onSignOut,
}: NgoDashboardProps) {
  const [dashboardView, setDashboardView] = useState<DashboardView>("home");
  const [activeTab, setActiveTab] = useState<NgoTab>("overview");

  const [ngoDirectory, setNgoDirectory] = useState<NgoDirectoryRow[]>([]);
  const [mapLocations, setMapLocations] = useState<NgoMapLocationRow[]>([]);
  const [helpRequests, setHelpRequests] = useState<HelpRequestRow[]>([]);

  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [updatingRequestId, setUpdatingRequestId] = useState<string | null>(
    null,
  );
  const [mapReady, setMapReady] = useState(false);
  const [mapLocating, setMapLocating] = useState(false);
  const [lastMapRegion, setLastMapRegion] = useState<Region | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const [unreadOpenCount, setUnreadOpenCount] = useState(0);

  const mapRef = useRef<any>(null);
  const pendingMapTabZoomRef = useRef(false);
  const skipNextFitRef = useRef(false);
  const dashboardViewRef = useRef<DashboardView>("home");
  const notificationsRef = useRef<NotificationsModule | null>(null);
  const knownRequestIdsRef = useRef<Set<string>>(new Set());
  const hasLoadedRequestsRef = useRef(false);

  function getNativeMapRef() {
    const map = mapRef.current;

    if (!map) {
      return null;
    }

    if (typeof map.animateToRegion === "function") {
      return map;
    }

    if (typeof map.getMapRef === "function") {
      return map.getMapRef();
    }

    if (map.mapRef && typeof map.mapRef.animateToRegion === "function") {
      return map.mapRef;
    }

    return null;
  }

  useEffect(() => {
    dashboardViewRef.current = dashboardView;
  }, [dashboardView]);

  useEffect(() => {
    if (dashboardView !== "requests") {
      return;
    }

    setUnreadOpenCount(0);
  }, [dashboardView]);

  useEffect(() => {
    if (dashboardView === "home" && activeTab === "map") {
      return;
    }

    setMapReady(false);
  }, [dashboardView, activeTab]);

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

  const activeHelpRequests = useMemo(
    () =>
      helpRequests.filter(
        (req) => req.status === "open" || req.status === "in_progress",
      ),
    [helpRequests],
  );

  const averageResponseLabel = useMemo(() => {
    const completed = helpRequests.filter((request) =>
      Boolean(request.resolved_at),
    );

    const durationsInHours: number[] = [];

    for (const request of completed) {
      const startedAt = new Date(request.created_at).getTime();
      const resolvedAtRaw = request.resolved_at;

      if (!resolvedAtRaw) {
        continue;
      }

      const resolvedAt = new Date(resolvedAtRaw).getTime();

      if (!Number.isFinite(startedAt) || !Number.isFinite(resolvedAt)) {
        continue;
      }

      const durationMs = resolvedAt - startedAt;
      if (durationMs > 0) {
        durationsInHours.push(durationMs / (1000 * 60 * 60));
      }
    }

    if (durationsInHours.length === 0) {
      return "Not enough completed data";
    }

    const avgHours =
      durationsInHours.reduce((sum, value) => sum + value, 0) /
      durationsInHours.length;

    if (avgHours < 1) {
      return `${Math.max(1, Math.round(avgHours * 60))} min`;
    }

    return `${avgHours.toFixed(1)} hrs`;
  }, [helpRequests]);

  const unresolvedDistricts = useMemo(() => {
    const counts: Record<string, number> = {};

    for (const request of helpRequests) {
      if (request.status !== "open" && request.status !== "in_progress") {
        continue;
      }

      const district =
        request.target_district?.trim() ||
        request.target_city?.trim() ||
        "Unknown area";

      counts[district] = (counts[district] ?? 0) + 1;
    }

    return Object.entries(counts)
      .map(([district, count]) => ({ district, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [helpRequests]);

  const helperActivity = useMemo(() => {
    const byHelper: Record<
      string,
      { lastActivityMs: number; unresolvedCount: number }
    > = {};

    for (const request of helpRequests) {
      const helperId = request.assigned_helper_id?.trim();
      if (!helperId) {
        continue;
      }

      const candidateTime =
        request.updated_at ?? request.resolved_at ?? request.created_at;
      const timestamp = new Date(candidateTime).getTime();

      if (!byHelper[helperId]) {
        byHelper[helperId] = {
          lastActivityMs: Number.isFinite(timestamp) ? timestamp : 0,
          unresolvedCount:
            request.status === "open" || request.status === "in_progress"
              ? 1
              : 0,
        };
        continue;
      }

      byHelper[helperId].lastActivityMs = Math.max(
        byHelper[helperId].lastActivityMs,
        Number.isFinite(timestamp) ? timestamp : 0,
      );

      if (request.status === "open" || request.status === "in_progress") {
        byHelper[helperId].unresolvedCount += 1;
      }
    }

    const now = Date.now();
    const inactiveThresholdMs = 24 * 60 * 60 * 1000;

    const inactive = Object.entries(byHelper)
      .filter(
        ([, activity]) => now - activity.lastActivityMs > inactiveThresholdMs,
      )
      .map(([helperId, activity]) => ({
        helperId,
        unresolvedCount: activity.unresolvedCount,
      }))
      .sort((a, b) => b.unresolvedCount - a.unresolvedCount)
      .slice(0, 5);

    return {
      inactive,
      trackedHelpers: Object.keys(byHelper).length,
    };
  }, [helpRequests]);

  const mapMarkers = useMemo(() => {
    const ngoMarkers = mapLocations.map((loc) => ({
      key: `ngo-${loc.id}`,
      lat: loc.lat,
      lng: loc.lng,
      title: loc.name,
      description: `${loc.city ?? "-"}, ${loc.district ?? "-"}, ${loc.state ?? "-"}`,
      pinColor: "#0EA5E9",
    }));

    const requestMarkers = activeHelpRequests
      .filter((req) => Number.isFinite(req.lat) && Number.isFinite(req.lng))
      .map((req) => ({
        key: `help-${req.id}`,
        lat: req.lat,
        lng: req.lng,
        title: req.client_name?.trim() || "Help Request",
        description: req.message,
        pinColor: "#F97316",
      }));

    return [...ngoMarkers, ...requestMarkers];
  }, [mapLocations, activeHelpRequests]);

  const mapRegion = useMemo(() => {
    if (mapMarkers.length === 0) {
      return {
        latitude: 22.5,
        longitude: 79,
        latitudeDelta: 14,
        longitudeDelta: 14,
      };
    }

    let minLat = mapMarkers[0].lat;
    let maxLat = mapMarkers[0].lat;
    let minLng = mapMarkers[0].lng;
    let maxLng = mapMarkers[0].lng;

    for (const marker of mapMarkers) {
      minLat = Math.min(minLat, marker.lat);
      maxLat = Math.max(maxLat, marker.lat);
      minLng = Math.min(minLng, marker.lng);
      maxLng = Math.max(maxLng, marker.lng);
    }

    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max((maxLat - minLat) * 1.8, 0.2),
      longitudeDelta: Math.max((maxLng - minLng) * 1.8, 0.2),
    };
  }, [mapMarkers]);

  useEffect(() => {
    async function bootstrap() {
      if (!supabase) {
        setError("Supabase is not configured.");
        setLoadingData(false);
        return;
      }

      await Promise.all([loadNgos(), loadMapLocations(), loadRequests()]);
      setLoadingData(false);
    }

    void bootstrap();
  }, []);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    const notifications = getNotificationsModule();
    notificationsRef.current = notifications;

    if (notifications) {
      notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });

      void (async () => {
        if (Platform.OS === "android") {
          await notifications.setNotificationChannelAsync("requests", {
            name: "New Requests",
            importance: notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 150, 250],
            lightColor: "#F97316",
          });
        }

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          return;
        }

        await registerDevicePushToken({
          notifications,
          userId: user.id,
          role: "ngo",
        });
      })();
    }

    const client = supabase;

    const channel = client
      .channel("ngo-dashboard-live-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "help_requests" },
        () => {
          void loadRequests();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ngo_directory" },
        () => {
          void loadNgos();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ngo_locations_india" },
        () => {
          void loadMapLocations();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "map_locations" },
        () => {
          void loadMapLocations();
        },
      )
      .subscribe((status) => {
        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          void loadRequests();
        }
      });

    return () => {
      void client.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    const requestInterval = setInterval(() => {
      void loadRequests();
    }, 8000);

    return () => {
      clearInterval(requestInterval);
    };
  }, []);

  useEffect(() => {
    if (dashboardView !== "home" || activeTab !== "map" || !mapReady) {
      return;
    }

    if (skipNextFitRef.current) {
      skipNextFitRef.current = false;
      return;
    }

    const nativeMap = getNativeMapRef();

    if (mapMarkers.length === 0 || !nativeMap) {
      return;
    }

    nativeMap.fitToCoordinates(
      mapMarkers.map((marker) => ({
        latitude: marker.lat,
        longitude: marker.lng,
      })),
      {
        edgePadding: { top: 42, right: 42, bottom: 42, left: 42 },
        animated: true,
      },
    );
  }, [dashboardView, activeTab, mapMarkers, mapReady]);

  useEffect(() => {
    if (dashboardView !== "home" || activeTab !== "map" || !mapReady) {
      return;
    }

    if (!pendingMapTabZoomRef.current) {
      return;
    }

    pendingMapTabZoomRef.current = false;
    skipNextFitRef.current = true;

    void (async () => {
      const zoomed = await zoomToCurrentLocation({ silent: true });
      const nativeMap = getNativeMapRef();

      if (!zoomed && lastMapRegion && nativeMap) {
        nativeMap.animateToRegion(lastMapRegion, 500);
      }
    })();
  }, [dashboardView, activeTab, mapReady, lastMapRegion]);

  async function loadNgos() {
    if (!supabase) {
      return;
    }

    const { data, error: qErr } = await supabase
      .from("ngo_directory")
      .select("id,name,state,district,city")
      .eq("is_active", true)
      .order("state")
      .order("district")
      .order("city")
      .order("name");

    if (qErr) {
      setError(qErr.message);
      return;
    }

    setNgoDirectory((data ?? []) as NgoDirectoryRow[]);
  }

  async function loadMapLocations() {
    if (!supabase) {
      return;
    }

    const { data, error: qErr } = await supabase
      .from("ngo_locations_india")
      .select("osm_type,osm_id,name,state,district,city,lat,lng")
      .order("state")
      .order("district")
      .order("city")
      .order("name");

    if (!qErr && data) {
      const normalized = (
        data as Array<{
          osm_type: string;
          osm_id: number;
          name: string;
          state: string;
          district: string;
          city: string;
          lat: number;
          lng: number;
        }>
      ).map((row) => ({
        id: `${row.osm_type}-${row.osm_id}`,
        name: row.name,
        state: row.state,
        district: row.district,
        city: row.city,
        lat: row.lat,
        lng: row.lng,
      }));

      setMapLocations(normalized);
      return;
    }

    const { data: fallback, error: fallbackErr } = await supabase
      .from("map_locations")
      .select("id,name,state,district,city,lat,lng")
      .eq("kind", "ngo")
      .order("state")
      .order("district")
      .order("city")
      .order("name");

    if (fallbackErr) {
      setError(fallbackErr.message);
      return;
    }

    setMapLocations((fallback ?? []) as NgoMapLocationRow[]);
  }

  async function loadRequests() {
    if (!supabase) {
      return;
    }

    const richResult = await supabase
      .from("help_requests")
      .select(
        "id,client_name,requester_phone,target_ngo_name,target_district,target_city,message,status,assigned_helper_id,lat,lng,created_at,updated_at,resolved_at",
      )
      .order("created_at", { ascending: false });

    let nextRequests: HelpRequestRow[] = [];

    if (!richResult.error) {
      nextRequests = (richResult.data ?? []) as HelpRequestRow[];
    } else {
      const fallbackResult = await supabase
        .from("help_requests")
        .select(
          "id,client_name,requester_phone,target_ngo_name,target_city,message,status,lat,lng,created_at",
        )
        .order("created_at", { ascending: false });

      if (fallbackResult.error) {
        setError(fallbackResult.error.message);
        return;
      }

      nextRequests = ((fallbackResult.data ?? []) as HelpRequestRow[]).map(
        (row) => ({
          ...row,
          target_district: null,
          assigned_helper_id: null,
          updated_at: null,
          resolved_at: null,
        }),
      );
    }

    const knownIds = knownRequestIdsRef.current;
    const newOpenRequests = nextRequests.filter(
      (req) => req.status === "open" && !knownIds.has(req.id),
    );

    if (hasLoadedRequestsRef.current && newOpenRequests.length > 0) {
      if (dashboardViewRef.current !== "requests") {
        setUnreadOpenCount((prev) => prev + newOpenRequests.length);
      }

      const notifications = notificationsRef.current;
      if (notifications) {
        void notifications.scheduleNotificationAsync({
          content: {
            title:
              newOpenRequests.length === 1
                ? "New Help Request"
                : `${newOpenRequests.length} New Help Requests`,
            body:
              newOpenRequests[0]?.message?.trim() ||
              "A new open request has arrived.",
            sound: true,
          },
          trigger:
            Platform.OS === "android"
              ? {
                  channelId: "requests",
                  seconds: 1,
                  repeats: false,
                  type: notifications.SchedulableTriggerInputTypes
                    .TIME_INTERVAL,
                }
              : null,
        });
      } else if (dashboardViewRef.current !== "requests") {
        Alert.alert(
          "New Help Request",
          newOpenRequests[0]?.message?.trim() ||
            "A new open request has arrived.",
        );
      }
    }

    knownRequestIdsRef.current = new Set(nextRequests.map((req) => req.id));
    hasLoadedRequestsRef.current = true;
    setHelpRequests(nextRequests);
  }

  async function handleUpdateStatus(req: HelpRequestRow) {
    if (!supabase) {
      return;
    }

    const next = getNextStatus(req.status);
    if (next === req.status) {
      return;
    }

    setUpdatingRequestId(req.id);
    const { error: uErr } = await supabase
      .from("help_requests")
      .update({ status: next })
      .eq("id", req.id);

    setUpdatingRequestId(null);

    if (uErr) {
      setError(uErr.message);
      return;
    }

    await loadRequests();
  }

  async function handleCancelStatus(req: HelpRequestRow) {
    if (!supabase) {
      return;
    }

    if (req.status === "resolved" || req.status === "cancelled") {
      return;
    }

    setUpdatingRequestId(req.id);
    const { error: uErr } = await supabase
      .from("help_requests")
      .update({ status: "cancelled" as const })
      .eq("id", req.id);

    setUpdatingRequestId(null);

    if (uErr) {
      setError(uErr.message);
      return;
    }

    await loadRequests();
  }

  async function zoomToCurrentLocation(options?: { silent?: boolean }) {
    if (!options?.silent) {
      setMapLocating(true);
      setError(null);
    }

    try {
      let lat = userLat;
      let lng = userLng;

      if (lat == null || lng == null) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          if (!options?.silent) {
            setError("Location permission denied.");
          }
          return false;
        }

        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

        lat = current.coords.latitude;
        lng = current.coords.longitude;
        setUserLat(lat);
        setUserLng(lng);
      }

      if (lat == null || lng == null) {
        return false;
      }

      const nativeMap = getNativeMapRef();

      nativeMap?.animateToRegion(
        {
          latitude: lat,
          longitude: lng,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        },
        800,
      );
      return true;
    } catch {
      if (!options?.silent) {
        setError("Could not get current map location.");
      }
      return false;
    } finally {
      if (!options?.silent) {
        setMapLocating(false);
      }
    }
  }

  async function handlePullRefresh() {
    setError(null);
    setPullRefreshing(true);

    try {
      await Promise.all([loadNgos(), loadMapLocations(), loadRequests()]);

      if (dashboardView === "requests") {
        setUnreadOpenCount(0);
      }
    } finally {
      setPullRefreshing(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.screen}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.page}
          refreshControl={
            <RefreshControl
              refreshing={pullRefreshing}
              onRefresh={() => {
                void handlePullRefresh();
              }}
              tintColor="#F97316"
              colors={["#F97316"]}
              progressBackgroundColor="#121212"
            />
          }
        >
          <View style={styles.headerCard}>
            <View>
              <Text style={styles.kicker}>BEACON NGO Dashboard</Text>
              <Text style={styles.title}>Command Desk: {displayName}</Text>
              <Text style={styles.subtitle}>
                Live triage, dispatch, and mesh coverage control.
              </Text>
            </View>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {loadingData ? (
            <Text style={styles.panelText}>Loading dashboard data...</Text>
          ) : null}

          {dashboardView === "home" ? (
            <>
              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{requestCounts.open}</Text>
                  <Text style={styles.statLabel}>Open SOS</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>
                    {requestCounts.in_progress}
                  </Text>
                  <Text style={styles.statLabel}>In Progress</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{ngoDirectory.length}</Text>
                  <Text style={styles.statLabel}>Coverage Points</Text>
                </View>
              </View>

              <View style={styles.tabRow}>
                {NGO_HOME_TABS.map((tab) => {
                  const active = activeTab === tab;
                  return (
                    <Pressable
                      key={tab}
                      onPress={() => {
                        setActiveTab(tab);

                        if (tab !== "map") {
                          return;
                        }

                        pendingMapTabZoomRef.current = true;
                      }}
                      style={styles.tabButton}
                    >
                      <Ionicons
                        name={getNgoTabIcon(tab, active)}
                        size={20}
                        color={active ? "#F97316" : "#94A3B8"}
                      />
                      <Text
                        style={[
                          styles.tabText,
                          active ? styles.tabTextActive : null,
                        ]}
                      >
                        {getNgoTabLabel(tab)}
                      </Text>
                      <View
                        style={[
                          styles.tabIndicator,
                          active ? styles.tabIndicatorActive : null,
                        ]}
                      />
                    </Pressable>
                  );
                })}
              </View>

              {activeTab === "overview" ? (
                <View style={styles.panel}>
                  <Text style={styles.panelTitle}>Operational Overview</Text>
                  <Text style={styles.panelText}>
                    Active requests are being monitored with live field updates.
                  </Text>
                  <View style={styles.terminalCard}>
                    <Text style={styles.terminalLine}>
                      Open: {requestCounts.open}
                    </Text>
                    <Text style={styles.terminalLine}>
                      In Progress: {requestCounts.in_progress}
                    </Text>
                    <Text style={styles.terminalLine}>
                      Resolved: {requestCounts.resolved}
                    </Text>
                  </View>
                </View>
              ) : null}

              {activeTab === "analytics" ? (
                <View style={styles.panel}>
                  <Text style={styles.panelTitle}>Coordination Analytics</Text>
                  <Text style={styles.panelText}>
                    Aggregated insights from help request activity to support
                    dispatch decisions.
                  </Text>

                  <View style={styles.statsRow}>
                    <View style={styles.statBox}>
                      <Text style={styles.statValue}>
                        {averageResponseLabel}
                      </Text>
                      <Text style={styles.statLabel}>Avg Response Time</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={styles.statValue}>
                        {unresolvedDistricts[0]?.count ?? 0}
                      </Text>
                      <Text style={styles.statLabel}>Top District Backlog</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={styles.statValue}>
                        {helperActivity.inactive.length}
                      </Text>
                      <Text style={styles.statLabel}>
                        Inactive Helpers (24h)
                      </Text>
                    </View>
                  </View>

                  <View style={styles.analyticsSection}>
                    <Text style={styles.analyticsSectionTitle}>
                      Districts With Most Unresolved
                    </Text>
                    {unresolvedDistricts.length === 0 ? (
                      <Text style={styles.panelText}>
                        No unresolved requests.
                      </Text>
                    ) : (
                      unresolvedDistricts.map((item) => (
                        <View key={item.district} style={styles.analyticsRow}>
                          <Text style={styles.analyticsKey}>
                            {item.district}
                          </Text>
                          <Text style={styles.analyticsValue}>
                            {item.count}
                          </Text>
                        </View>
                      ))
                    )}
                  </View>

                  <View style={styles.analyticsSection}>
                    <Text style={styles.analyticsSectionTitle}>
                      Inactive Helpers (No Activity in 24h)
                    </Text>
                    <Text style={styles.analyticsHint}>
                      Tracked helpers with assignment data:{" "}
                      {helperActivity.trackedHelpers}
                    </Text>
                    {helperActivity.inactive.length === 0 ? (
                      <Text style={styles.panelText}>
                        No inactive helpers detected from current request
                        history.
                      </Text>
                    ) : (
                      helperActivity.inactive.map((item) => (
                        <View key={item.helperId} style={styles.analyticsRow}>
                          <Text style={styles.analyticsKey}>
                            Helper {item.helperId.slice(0, 8).toUpperCase()}
                          </Text>
                          <Text style={styles.analyticsValue}>
                            {item.unresolvedCount} unresolved
                          </Text>
                        </View>
                      ))
                    )}
                  </View>
                </View>
              ) : null}

              {activeTab === "map" ? (
                <View style={styles.panel}>
                  <Text style={styles.panelTitle}>NGO + Help Map</Text>
                  <Text style={styles.panelText}>
                    Blue markers are NGO locations. Orange markers are active
                    help requests.
                  </Text>

                  <Pressable
                    style={[
                      styles.locationButton,
                      mapLocating ? styles.buttonDisabled : null,
                    ]}
                    disabled={mapLocating}
                    onPress={() => {
                      void zoomToCurrentLocation();
                    }}
                  >
                    <Text style={styles.locationButtonText}>
                      {mapLocating ? "Locating..." : "Zoom To My Location"}
                    </Text>
                  </Pressable>

                  <View style={styles.mapCanvasWrap}>
                    <ClusteredMapView
                      ref={(ref) => {
                        mapRef.current = ref;
                      }}
                      style={styles.mapCanvas}
                      onMapReady={() => {
                        setMapReady(true);

                        if (!pendingMapTabZoomRef.current) {
                          return;
                        }

                        pendingMapTabZoomRef.current = false;
                        skipNextFitRef.current = true;

                        setTimeout(() => {
                          void zoomToCurrentLocation({ silent: true });
                        }, 120);
                      }}
                      initialRegion={lastMapRegion ?? mapRegion}
                      onRegionChangeComplete={(region) => {
                        setLastMapRegion(region);
                      }}
                      showsUserLocation
                      showsMyLocationButton
                      toolbarEnabled
                    >
                      {mapMarkers.map((marker) => (
                        <Marker
                          key={marker.key}
                          coordinate={{
                            latitude: marker.lat,
                            longitude: marker.lng,
                          }}
                          title={marker.title}
                          description={marker.description}
                          pinColor={marker.pinColor}
                        />
                      ))}
                      {userLat != null && userLng != null ? (
                        <Marker
                          coordinate={{ latitude: userLat, longitude: userLng }}
                          title="You are here"
                          pinColor="#8B5CF6"
                        />
                      ) : null}
                    </ClusteredMapView>
                  </View>
                </View>
              ) : null}

              {activeTab === "actions" ? (
                <View style={styles.panel}>
                  <Text style={styles.panelTitle}>Quick Actions</Text>
                  <Text style={styles.panelText}>
                    Pull down to refresh requests, map markers, and coverage
                    data from the database.
                  </Text>
                </View>
              ) : null}
            </>
          ) : dashboardView === "requests" ? (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Incoming Requests</Text>
              {helpRequests.map((req) => (
                <View key={req.id} style={styles.requestCard}>
                  <Text style={styles.requestId}>
                    {req.id.slice(0, 8).toUpperCase()}
                  </Text>
                  <Text style={styles.requestMessage}>{req.message}</Text>
                  <Text style={styles.requestMeta}>
                    {req.client_name?.trim() || "Client"} ·{" "}
                    {req.target_city ?? "Unknown city"}
                  </Text>
                  <Text style={styles.requestMeta}>
                    Coordinates:{" "}
                    {Number.isFinite(req.lat) && Number.isFinite(req.lng)
                      ? `${req.lat.toFixed(5)}, ${req.lng.toFixed(5)}`
                      : "Not available"}
                  </Text>
                  <Text style={styles.requestMeta}>
                    Status: {req.status.replace("_", " ")}
                  </Text>
                  <View style={styles.statusRow}>
                    <Text style={styles.statusText}>
                      {req.target_ngo_name ?? "Unassigned NGO"}
                    </Text>
                    <View style={styles.statusActionsRow}>
                      <Pressable
                        disabled={
                          req.status === "resolved" ||
                          req.status === "cancelled" ||
                          updatingRequestId === req.id
                        }
                        style={[
                          styles.cancelActionBtn,
                          req.status === "resolved" ||
                          req.status === "cancelled"
                            ? styles.buttonDisabled
                            : null,
                        ]}
                        onPress={() => {
                          Alert.alert(
                            "Cancel Request",
                            "Mark this request as cancelled?",
                            [
                              { text: "No", style: "cancel" },
                              {
                                text: "Yes, Cancel",
                                style: "destructive",
                                onPress: () => {
                                  void handleCancelStatus(req);
                                },
                              },
                            ],
                          );
                        }}
                      >
                        <Text style={styles.cancelActionText}>
                          {updatingRequestId === req.id
                            ? "Updating..."
                            : "Cancel"}
                        </Text>
                      </Pressable>
                      <Pressable
                        disabled={
                          req.status === "resolved" ||
                          req.status === "cancelled" ||
                          updatingRequestId === req.id
                        }
                        style={[
                          styles.statusActionBtn,
                          req.status === "resolved" ||
                          req.status === "cancelled"
                            ? styles.buttonDisabled
                            : null,
                        ]}
                        onPress={() => {
                          void handleUpdateStatus(req);
                        }}
                      >
                        <Text style={styles.statusActionText}>
                          {updatingRequestId === req.id
                            ? "Updating..."
                            : "Update"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))}

              {helpRequests.length === 0 ? (
                <Text style={styles.panelText}>No incoming requests yet.</Text>
              ) : null}
            </View>
          ) : (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Profile</Text>
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>Name</Text>
                <Text style={styles.profileValue}>{displayName}</Text>
              </View>
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>Role</Text>
                <Text style={styles.profileValue}>NGO Operator</Text>
              </View>
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>Open SOS</Text>
                <Text style={styles.profileValue}>{requestCounts.open}</Text>
              </View>
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>Coverage Points</Text>
                <Text style={styles.profileValue}>{ngoDirectory.length}</Text>
              </View>
              <Pressable
                style={styles.primaryButton}
                onPress={() => void onSignOut()}
              >
                <Text style={styles.primaryButtonText}>Sign out</Text>
              </Pressable>
            </View>
          )}
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
            onPress={() => {
              setDashboardView("requests");
              setUnreadOpenCount(0);
            }}
            style={[
              styles.bottomTabButton,
              dashboardView === "requests"
                ? styles.bottomTabButtonActive
                : null,
            ]}
          >
            <Ionicons
              name={
                dashboardView === "requests" ? "receipt" : "receipt-outline"
              }
              size={20}
              color={dashboardView === "requests" ? "#F97316" : "#8D8D8D"}
            />
            {dashboardView !== "requests" && unreadOpenCount > 0 ? (
              <View style={styles.requestsDot} />
            ) : null}
            <Text
              style={[
                styles.bottomTabLabel,
                dashboardView === "requests"
                  ? styles.bottomTabLabelActive
                  : null,
              ]}
            >
              Requests
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
  screen: {
    flex: 1,
    backgroundColor: "#000000",
  },
  scroll: {
    flex: 1,
  },
  page: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 24,
    backgroundColor: "#000000",
    gap: 12,
  },
  headerCard: {
    borderRadius: 16,
    backgroundColor: "#121212",
    borderWidth: 1,
    borderColor: "#232323",
    padding: 14,
    gap: 12,
  },
  kicker: {
    color: "#FDBA74",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
  },
  subtitle: {
    color: "#CFCFCF",
    fontSize: 14,
    fontWeight: "600",
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
    position: "relative",
    borderRadius: 10,
    minHeight: 50,
  },
  bottomTabButtonActive: {
    backgroundColor: "rgba(249, 115, 22, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(249, 115, 22, 0.5)",
  },
  requestsDot: {
    position: "absolute",
    top: 6,
    right: "34%",
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#EF4444",
  },
  bottomTabLabel: {
    color: "#8D8D8D",
    fontSize: 12,
    fontWeight: "700",
  },
  bottomTabLabelActive: {
    color: "#F97316",
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
  },
  statBox: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#242424",
    backgroundColor: "#121212",
    padding: 10,
    alignItems: "center",
  },
  statValue: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
  },
  statLabel: {
    color: "#D4D4D4",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  tabRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1f2f46",
    backgroundColor: "#061326",
    paddingHorizontal: 6,
    paddingTop: 8,
    paddingBottom: 6,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 2,
  },
  tabText: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "700",
  },
  tabTextActive: {
    color: "#E5EDFF",
  },
  tabIndicator: {
    marginTop: 2,
    height: 3,
    width: 28,
    borderRadius: 99,
    backgroundColor: "transparent",
  },
  tabIndicatorActive: {
    backgroundColor: "#8FB4FF",
  },
  panel: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#232323",
    backgroundColor: "#121212",
    padding: 14,
    gap: 10,
  },
  panelTitle: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "900",
  },
  panelText: {
    color: "#D4D4D4",
    fontSize: 14,
    fontWeight: "600",
  },
  terminalCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    backgroundColor: "#0D0D0D",
    padding: 12,
    gap: 6,
  },
  terminalLine: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },
  analyticsSection: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    backgroundColor: "#0D0D0D",
    padding: 10,
    gap: 8,
  },
  analyticsSectionTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  analyticsHint: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "600",
  },
  analyticsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#242424",
    backgroundColor: "#111111",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  analyticsKey: {
    color: "#E5E7EB",
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
  },
  analyticsValue: {
    color: "#FDBA74",
    fontSize: 12,
    fontWeight: "800",
  },
  requestCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#292929",
    backgroundColor: "#0D0D0D",
    padding: 10,
    gap: 4,
  },
  requestId: {
    color: "#FACC15",
    fontWeight: "800",
  },
  requestMessage: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  requestMeta: {
    color: "#B0B0B0",
    fontSize: 12,
  },
  statusRow: {
    marginTop: 2,
    flexDirection: "column",
    alignItems: "stretch",
    gap: 8,
  },
  statusActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: "100%",
  },
  statusText: {
    color: "#86EFAC",
    fontWeight: "700",
    textTransform: "uppercase",
    fontSize: 12,
  },
  statusActionBtn: {
    flex: 1,
    minHeight: 34,
    borderWidth: 1,
    borderColor: "#F97316",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "rgba(249, 115, 22, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  statusActionText: {
    color: "#F97316",
    fontWeight: "800",
    fontSize: 12,
  },
  cancelActionBtn: {
    flex: 1,
    minHeight: 34,
    borderWidth: 1,
    borderColor: "#F87171",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "rgba(248, 113, 113, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelActionText: {
    color: "#FCA5A5",
    fontWeight: "800",
    fontSize: 12,
  },
  mapCanvasWrap: {
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#2B2B2B",
    minHeight: 280,
  },
  mapCanvas: {
    width: "100%",
    height: 280,
  },
  mapRow: {
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#2B2B2B",
    backgroundColor: "#0D0D0D",
    padding: 10,
    gap: 2,
  },
  mapName: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 14,
  },
  mapMeta: {
    color: "#B6B6B6",
    fontSize: 12,
    fontWeight: "600",
  },
  errorText: {
    color: "#FCA5A5",
    borderWidth: 1,
    borderColor: "#7f1d1d",
    backgroundColor: "#450a0a",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontWeight: "600",
  },
  actionGrid: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#3A3A3A",
    backgroundColor: "#0D0D0D",
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: {
    color: "#FFFFFF",
    fontWeight: "700",
    textAlign: "center",
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 14,
  },
  locationButton: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#3A3A3A",
    backgroundColor: "#0D0D0D",
    alignItems: "center",
    justifyContent: "center",
  },
  locationButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  profileRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    backgroundColor: "#0D0D0D",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  profileLabel: {
    color: "#B0B0B0",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  profileValue: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
});

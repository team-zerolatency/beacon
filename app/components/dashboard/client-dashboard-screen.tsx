import {
  startLocationTracking,
  stopLocationTracking,
} from "@/lib/location-tracking";
import {
  ensureAuthenticatedWithRefresh,
  isTokenExpiredError,
} from "@/lib/session-management";
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import * as Location from "expo-location";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActionSheetIOS,
  Animated,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import ClusteredMapView from "react-native-map-clustering";
import { Marker, type Region } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";

type ClientTab = "sos" | "request" | "map" | "tracking" | "actions";
type DashboardView = "home" | "tracking" | "profile";
type RequestFilter = "all" | "open" | "in_progress" | "resolved" | "cancelled";
type SelectOption = { label: string; value: string };

const HOME_TABS: ClientTab[] = ["sos", "request", "map", "actions"];
const PICKER_ITEM_COLOR = Platform.OS === "android" ? "#111827" : "#FFFFFF";
const PICKER_PLACEHOLDER_COLOR =
  Platform.OS === "android" ? "#6B7280" : "#9CA3AF";

function getHomeTabLabel(tab: ClientTab) {
  if (tab === "sos") {
    return "SOS";
  }

  if (tab === "request") {
    return "Request";
  }

  if (tab === "map") {
    return "Map";
  }

  if (tab === "tracking") {
    return "Tracking";
  }

  return "Actions";
}

function getHomeTabIcon(
  tab: ClientTab,
  active: boolean,
): keyof typeof Ionicons.glyphMap {
  if (tab === "sos") {
    return active ? "warning" : "warning-outline";
  }

  if (tab === "request") {
    return active ? "document-text" : "document-text-outline";
  }

  if (tab === "map") {
    return active ? "map" : "map-outline";
  }

  if (tab === "tracking") {
    return active ? "pulse" : "pulse-outline";
  }

  return active ? "flash" : "flash-outline";
}

type NgoDirectoryRow = {
  id: string;
  name: string;
  state: string;
  district: string;
  city: string;
};

type MapLocationRow = {
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
  target_ngo_name: string | null;
  target_state: string | null;
  target_district: string | null;
  target_city: string | null;
  message: string;
  lat: number;
  lng: number;
  status: "open" | "in_progress" | "resolved" | "cancelled";
  verification_status?: "pending" | "verified" | "rejected" | null;
  created_at: string;
};

type ClientDashboardProps = {
  displayName: string;
  onSignOut: () => Promise<void> | void;
};

function formatWhen(iso: string) {
  const date = new Date(iso);
  return date.toLocaleString();
}

function normalizeValue(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function findBestMatch(
  options: string[],
  candidate: string | null | undefined,
) {
  const normalizedCandidate = normalizeValue(candidate);
  if (!normalizedCandidate) {
    return null;
  }

  const exact = options.find(
    (option) => normalizeValue(option) === normalizedCandidate,
  );
  if (exact) {
    return exact;
  }

  const includes = options.find((option) => {
    const normalizedOption = normalizeValue(option);
    return (
      normalizedOption.includes(normalizedCandidate) ||
      normalizedCandidate.includes(normalizedOption)
    );
  });

  return includes ?? null;
}

function distanceScore(aLat: number, aLng: number, bLat: number, bLng: number) {
  const dLat = aLat - bLat;
  const dLng = aLng - bLng;
  return dLat * dLat + dLng * dLng;
}

export function ClientDashboardScreen({
  displayName,
  onSignOut,
}: ClientDashboardProps) {
  const [dashboardView, setDashboardView] = useState<DashboardView>("home");
  const [activeTab, setActiveTab] = useState<ClientTab>("sos");
  const [requestFilter, setRequestFilter] = useState<RequestFilter>("all");

  const [clientName, setClientName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [locatingDots, setLocatingDots] = useState(1);

  const [selectedState, setSelectedState] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedNgoId, setSelectedNgoId] = useState("");
  const [locationText, setLocationText] = useState("");
  const [detectedState, setDetectedState] = useState("");
  const [detectedDistrict, setDetectedDistrict] = useState("");
  const [detectedCity, setDetectedCity] = useState("");

  const [ngoDirectory, setNgoDirectory] = useState<NgoDirectoryRow[]>([]);
  const [mapLocations, setMapLocations] = useState<MapLocationRow[]>([]);
  const [myRequests, setMyRequests] = useState<HelpRequestRow[]>([]);

  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cancelingRequestId, setCancelingRequestId] = useState<string | null>(
    null,
  );
  const [cancelDots, setCancelDots] = useState(1);
  const [verifyingRequestId, setVerifyingRequestId] = useState<string | null>(
    null,
  );
  const [verifyingRequestLoading, setVerifyingRequestLoading] = useState(false);
  const [locallyVerifiedRequestIds, setLocallyVerifiedRequestIds] = useState<
    Record<string, true>
  >({});
  const [mapLocating, setMapLocating] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [lastMapRegion, setLastMapRegion] = useState<Region | null>(null);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const mapRef = useRef<any>(null);
  const pendingMapTabZoomRef = useRef(false);
  const skipNextFitRef = useRef(false);
  const sosScale = useRef(new Animated.Value(1)).current;
  const sosGlowOpacity = useRef(new Animated.Value(0.24)).current;

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

  const selectedNgo =
    ngoDirectory.find((ngo) => ngo.id === selectedNgoId) ?? null;

  const detectedLocationLabel = useMemo(() => {
    const fromLocationText = locationText.trim();
    if (fromLocationText) {
      return fromLocationText;
    }

    const fromDetected = [detectedCity, detectedDistrict, detectedState]
      .map((part) => part.trim())
      .filter(Boolean)
      .join(", ");

    return fromDetected || "Not captured yet";
  }, [locationText, detectedCity, detectedDistrict, detectedState]);

  useEffect(() => {
    if (!clientName.trim() && displayName.trim()) {
      setClientName(displayName.trim());
    }
  }, [displayName]);

  useEffect(() => {
    if (dashboardView === "home" && activeTab === "tracking") {
      setActiveTab("request");
    }
  }, [dashboardView, activeTab]);

  useEffect(() => {
    if (dashboardView === "home" && activeTab === "map") {
      return;
    }

    setMapReady(false);
  }, [dashboardView, activeTab]);

  useEffect(() => {
    if (!locating) {
      setLocatingDots(1);
      return;
    }

    const interval = setInterval(() => {
      setLocatingDots((prev) => (prev >= 3 ? 1 : prev + 1));
    }, 280);

    return () => {
      clearInterval(interval);
    };
  }, [locating]);

  useEffect(() => {
    async function bootstrap() {
      if (!supabase) {
        setLoadingData(false);
        setError("Supabase is not configured.");
        return;
      }

      await Promise.all([loadMine(), loadNgoDirectory(), loadMapLocations()]);
      setLoadingData(false);
    }

    void bootstrap();
  }, []);

  // Monitor request status and stop tracking when resolved/cancelled
  useEffect(() => {
    async function cleanupFinishedRequests() {
      for (const request of myRequests) {
        if (request.status === "resolved" || request.status === "cancelled") {
          await stopLocationTracking(request.id);
        }
      }
    }

    void cleanupFinishedRequests();
  }, [myRequests]);

  async function loadMine() {
    if (!supabase) {
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return;
    }

    const richResult = await supabase
      .from("help_requests")
      .select(
        "id,target_ngo_name,target_state,target_district,target_city,message,lat,lng,status,verification_status,created_at",
      )
      .eq("client_id", user.id)
      .order("created_at", { ascending: false });

    if (!richResult.error) {
      setMyRequests((richResult.data ?? []) as HelpRequestRow[]);
      return;
    }

    const fallbackResult = await supabase
      .from("help_requests")
      .select(
        "id,target_ngo_name,target_state,target_district,target_city,message,lat,lng,status,created_at",
      )
      .eq("client_id", user.id)
      .order("created_at", { ascending: false });

    if (fallbackResult.error) {
      setError(fallbackResult.error.message);
      return;
    }

    setMyRequests((fallbackResult.data ?? []) as HelpRequestRow[]);
  }

  async function loadNgoDirectory() {
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

    // Backward-compatible fallback for environments without ngo_locations_india.
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

    setMapLocations((fallback ?? []) as MapLocationRow[]);
  }

  const states = useMemo(() => {
    return Array.from(new Set(ngoDirectory.map((n) => n.state))).sort();
  }, [ngoDirectory]);

  const districts = useMemo(() => {
    return Array.from(
      new Set(
        ngoDirectory
          .filter((n) => n.state === selectedState)
          .map((n) => n.district),
      ),
    ).sort();
  }, [ngoDirectory, selectedState]);

  const cities = useMemo(() => {
    return Array.from(
      new Set(
        ngoDirectory
          .filter(
            (n) => n.state === selectedState && n.district === selectedDistrict,
          )
          .map((n) => n.city),
      ),
    ).sort();
  }, [ngoDirectory, selectedState, selectedDistrict]);

  const ngoOptions = useMemo(() => {
    return ngoDirectory.filter(
      (n) =>
        n.state === selectedState &&
        n.district === selectedDistrict &&
        n.city === selectedCity,
    );
  }, [ngoDirectory, selectedState, selectedDistrict, selectedCity]);

  const filteredRequests = useMemo(() => {
    if (requestFilter === "all") {
      return myRequests;
    }

    return myRequests.filter((r) => r.status === requestFilter);
  }, [myRequests, requestFilter]);

  const activeHelpRequests = useMemo(
    () =>
      myRequests.filter(
        (req) => req.status === "open" || req.status === "in_progress",
      ),
    [myRequests],
  );

  const mapMarkers = useMemo(() => {
    const ngoMarkers = mapLocations.map((loc) => ({
      key: `ngo-${loc.id}`,
      lat: loc.lat,
      lng: loc.lng,
      title: loc.name,
      description: `${loc.city ?? "-"}, ${loc.district ?? "-"}, ${loc.state ?? "-"}`,
      pinColor: "#0EA5E9",
    }));

    const helpMarkers = activeHelpRequests
      .filter((req) => Number.isFinite(req.lat) && Number.isFinite(req.lng))
      .map((req) => ({
        key: `help-${req.id}`,
        lat: req.lat,
        lng: req.lng,
        title: "Help Needed",
        description: req.message,
        pinColor: "#F97316",
      }));

    return [...ngoMarkers, ...helpMarkers];
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

  async function zoomToCurrentLocation(options?: { silent?: boolean }) {
    if (!options?.silent) {
      setError(null);
      setMapLocating(true);
    }

    try {
      let lat = userLat;
      let lng = userLng;

      if (lat == null || lng == null) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          setError("Location permission denied.");
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

  useEffect(() => {
    if (!cancelingRequestId) {
      setCancelDots(1);
      return;
    }

    const interval = setInterval(() => {
      setCancelDots((prev) => (prev >= 3 ? 1 : prev + 1));
    }, 280);

    return () => {
      clearInterval(interval);
    };
  }, [cancelingRequestId]);

  useEffect(() => {
    const shouldAnimate = dashboardView === "home" && activeTab === "sos";

    if (!shouldAnimate) {
      sosScale.setValue(1);
      sosGlowOpacity.setValue(0.24);
      return;
    }

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(sosScale, {
            toValue: 1.06,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(sosGlowOpacity, {
            toValue: 0.42,
            duration: 900,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(sosScale, {
            toValue: 1,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(sosGlowOpacity, {
            toValue: 0.2,
            duration: 900,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );

    pulse.start();

    return () => {
      pulse.stop();
      sosScale.setValue(1);
      sosGlowOpacity.setValue(0.24);
    };
  }, [activeTab, dashboardView, sosGlowOpacity, sosScale]);

  function openIosSelector(
    title: string,
    options: SelectOption[],
    onSelect: (value: string) => void,
  ) {
    if (Platform.OS !== "ios") {
      return;
    }

    const labels = [...options.map((option) => option.label), "Cancel"];
    const cancelButtonIndex = labels.length - 1;

    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: labels,
        cancelButtonIndex,
      },
      (selectedIndex) => {
        if (
          selectedIndex == null ||
          selectedIndex < 0 ||
          selectedIndex >= options.length
        ) {
          return;
        }

        onSelect(options[selectedIndex].value);
      },
    );
  }

  function applyAreaSelection(state: string, district: string, city: string) {
    setSelectedState(state);
    setSelectedDistrict(district);
    setSelectedCity(city);

    const autoNgo = ngoDirectory.find(
      (row) =>
        row.state === state && row.district === district && row.city === city,
    );
    setSelectedNgoId(autoNgo?.id ?? "");
  }

  async function captureLocation() {
    setError(null);
    setSuccess(null);

    setLocating(true);
    const { status } = await Location.requestForegroundPermissionsAsync();

    if (status !== "granted") {
      setLocating(false);
      setError(
        "Location permission denied. You can still submit using NGO location.",
      );
      return;
    }

    try {
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });

      setUserLat(current.coords.latitude);
      setUserLng(current.coords.longitude);

      const reverse = await Location.reverseGeocodeAsync({
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      });

      const place = reverse[0];
      if (!place) {
        setSuccess("Location captured and attached to your request.");
        return;
      }

      const rawState = place.region?.trim() || "";
      const rawDistrict =
        place.district?.trim() || place.subregion?.trim() || "";
      const rawCity =
        place.city?.trim() ||
        place.subregion?.trim() ||
        place.district?.trim() ||
        "";

      const matchedState = findBestMatch(states, rawState || rawDistrict);

      const districtOptionsForState = Array.from(
        new Set(
          ngoDirectory
            .filter((row) => row.state === matchedState)
            .map((row) => row.district),
        ),
      );

      const matchedDistrict = findBestMatch(
        districtOptionsForState,
        rawDistrict,
      );

      const cityOptions = matchedDistrict
        ? Array.from(
            new Set(
              ngoDirectory
                .filter(
                  (row) =>
                    row.state === matchedState &&
                    row.district === matchedDistrict,
                )
                .map((row) => row.city),
            ),
          )
        : [];

      const matchedCity = findBestMatch(cityOptions, rawCity);

      const finalState = matchedState ?? rawState;
      const finalDistrict = matchedDistrict ?? rawDistrict;
      const finalCity = matchedCity ?? rawCity;

      // Only fall back to nearest NGO if geocoder gave no usable locality at all.
      if (!finalState && !finalDistrict && !finalCity) {
        const candidates = mapLocations.filter((loc) =>
          Boolean(loc.state && loc.district && loc.city),
        );

        if (candidates.length > 0) {
          const nearest = candidates.reduce((best, currentLoc) => {
            const bestScore = distanceScore(
              current.coords.latitude,
              current.coords.longitude,
              best.lat,
              best.lng,
            );
            const currentScore = distanceScore(
              current.coords.latitude,
              current.coords.longitude,
              currentLoc.lat,
              currentLoc.lng,
            );
            return currentScore < bestScore ? currentLoc : best;
          });

          const autoState = nearest.state ?? "";
          const autoDistrict = nearest.district ?? "";
          const autoCity = nearest.city ?? "";

          applyAreaSelection(autoState, autoDistrict, autoCity);
          setDetectedState(autoState);
          setDetectedDistrict(autoDistrict);
          setDetectedCity(autoCity);
          setLocationText(`${autoCity}, ${autoDistrict}, ${autoState}`);

          setSuccess(
            `Location captured. Auto-filled nearest area: ${autoState} / ${autoDistrict} / ${autoCity}`,
          );
          return;
        }
      }

      if (finalState || finalDistrict || finalCity) {
        applyAreaSelection(finalState, finalDistrict, finalCity);
        setDetectedState(finalState);
        setDetectedDistrict(finalDistrict);
        setDetectedCity(finalCity);
      }

      const formattedLocationText = [finalCity, finalDistrict, finalState]
        .filter(Boolean)
        .join(", ");
      if (formattedLocationText) {
        setLocationText(formattedLocationText);
      }

      setSuccess(
        `Location captured and auto-filled: ${finalState || "-"} / ${finalDistrict || "-"} / ${finalCity || "-"}`,
      );
    } catch {
      setError("Could not fetch current location. Please retry.");
    } finally {
      setLocating(false);
    }
  }

  async function submitHelp() {
    if (!supabase) {
      return;
    }

    setError(null);
    setSuccess(null);

    // Refresh session token before help submission
    const authCheck = await ensureAuthenticatedWithRefresh();
    if (!authCheck.success) {
      setError(
        authCheck.error ||
          "Session expired. Please sign in again and try again.",
      );
      return;
    }

    if (!clientName.trim()) {
      setError("Please enter your name.");
      return;
    }

    if (!phone.trim()) {
      setError("Please enter your phone number.");
      return;
    }

    if (!message.trim()) {
      setError("Please describe what you need.");
      return;
    }

    if (!selectedNgo) {
      setError("Please select state, district, city, and NGO.");
      return;
    }

    const normalizedSelectedState = normalizeValue(selectedNgo.state);
    const normalizedSelectedDistrict = normalizeValue(selectedNgo.district);
    const normalizedSelectedCity = normalizeValue(selectedNgo.city);
    const normalizedSelectedName = normalizeValue(selectedNgo.name);

    const exactCoordinate = mapLocations.find(
      (loc) =>
        normalizeValue(loc.name) === normalizedSelectedName &&
        normalizeValue(loc.state) === normalizedSelectedState &&
        normalizeValue(loc.district) === normalizedSelectedDistrict &&
        normalizeValue(loc.city) === normalizedSelectedCity,
    );

    const cityCoordinate = mapLocations.find(
      (loc) =>
        normalizeValue(loc.state) === normalizedSelectedState &&
        normalizeValue(loc.district) === normalizedSelectedDistrict &&
        normalizeValue(loc.city) === normalizedSelectedCity,
    );

    const districtCoordinate = mapLocations.find(
      (loc) =>
        normalizeValue(loc.state) === normalizedSelectedState &&
        normalizeValue(loc.district) === normalizedSelectedDistrict,
    );

    const stateCoordinate = mapLocations.find(
      (loc) => normalizeValue(loc.state) === normalizedSelectedState,
    );

    const fallbackCoordinate =
      exactCoordinate ??
      cityCoordinate ??
      districtCoordinate ??
      stateCoordinate ??
      mapLocations[0] ??
      null;

    const finalLat = userLat ?? fallbackCoordinate?.lat ?? null;
    const finalLng = userLng ?? fallbackCoordinate?.lng ?? null;

    if (finalLat == null || finalLng == null) {
      setError(
        "Could not determine coordinates for selected NGO area. Please tap Get My Location and try again.",
      );
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("You are not signed in.");
      return;
    }

    setSubmitting(true);

    try {
      const basePayload = {
        client_id: user.id,
        client_name: clientName.trim(),
        requester_phone: phone.trim(),
        target_ngo_name: selectedNgo.name,
        target_state: selectedNgo.state,
        target_district: selectedNgo.district,
        target_city: selectedNgo.city,
        message: message.trim(),
        lat: finalLat,
        lng: finalLng,
        status: "open" as const,
      };

      const withDetectedPayload = {
        ...basePayload,
        detected_state: detectedState.trim() || null,
        detected_district: detectedDistrict.trim() || null,
        detected_city: detectedCity.trim() || null,
        detected_location_text: locationText.trim() || null,
      };

      const { error: insErrWithDetected } = await supabase
        .from("help_requests")
        .insert(withDetectedPayload);

      if (insErrWithDetected) {
        const messageText = insErrWithDetected.message.toLowerCase();
        const missingDetectedColumns =
          messageText.includes("detected_state") ||
          messageText.includes("detected_district") ||
          messageText.includes("detected_city") ||
          messageText.includes("detected_location_text");

        if (missingDetectedColumns) {
          const { error: fallbackErr } = await supabase
            .from("help_requests")
            .insert(basePayload);

          if (fallbackErr) {
            setError(fallbackErr.message);
            return;
          }
        } else {
          setError(insErrWithDetected.message);
          return;
        }
      }
    } catch {
      setError("Could not send help request. Please try again.");
      return;
    } finally {
      setSubmitting(false);
    }

    setSuccess("Help request sent. NGO dashboard can see it in real time.");
    setClientName(displayName.trim());
    setPhone("");
    setMessage("");
    setUserLat(null);
    setUserLng(null);
    setLocationText("");
    setDetectedState("");
    setDetectedDistrict("");
    setDetectedCity("");
    setSelectedState("");
    setSelectedDistrict("");
    setSelectedCity("");
    setSelectedNgoId("");
    await loadMine();
  }

  async function submitSos() {
    if (!supabase) {
      return;
    }

    setError(null);
    setSuccess(null);

    // Refresh session token before SOS submission (handles long idle periods)
    const authCheck = await ensureAuthenticatedWithRefresh();
    if (!authCheck.success) {
      setError(
        authCheck.error ||
          "Session expired. Please sign in again and try SOS again.",
      );
      return;
    }

    const finalClientName = clientName.trim() || displayName.trim();
    if (!finalClientName) {
      setError("Could not determine your name for SOS.");
      return;
    }

    setSubmitting(true);

    try {
      let lat = userLat;
      let lng = userLng;
      let nextDetectedState = detectedState;
      let nextDetectedDistrict = detectedDistrict;
      let nextDetectedCity = detectedCity;
      let nextLocationText = locationText;

      if (lat == null || lng == null) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          setError("Location permission denied. SOS needs location access.");
          return;
        }

        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Highest,
        });

        lat = current.coords.latitude;
        lng = current.coords.longitude;
        setUserLat(lat);
        setUserLng(lng);

        try {
          const reverse = await Location.reverseGeocodeAsync({
            latitude: lat,
            longitude: lng,
          });
          const place = reverse[0];
          if (place) {
            nextDetectedState = place.region?.trim() || "";
            nextDetectedDistrict =
              place.district?.trim() || place.subregion?.trim() || "";
            nextDetectedCity =
              place.city?.trim() ||
              place.subregion?.trim() ||
              place.district?.trim() ||
              "";

            const detectedText = [
              nextDetectedCity,
              nextDetectedDistrict,
              nextDetectedState,
            ]
              .filter(Boolean)
              .join(", ");
            nextLocationText = detectedText;

            setDetectedState(nextDetectedState);
            setDetectedDistrict(nextDetectedDistrict);
            setDetectedCity(nextDetectedCity);
            setLocationText(nextLocationText);
          }
        } catch {
          // Reverse geocode is best effort in SOS flow.
        }
      }

      if (lat == null || lng == null) {
        setError("Could not fetch current location for SOS.");
        return;
      }

      const normalizedDetectedState = normalizeValue(nextDetectedState);
      const normalizedDetectedDistrict = normalizeValue(nextDetectedDistrict);
      const normalizedDetectedCity = normalizeValue(nextDetectedCity);

      const validMapLocations = mapLocations.filter(
        (loc) => Number.isFinite(loc.lat) && Number.isFinite(loc.lng),
      );

      const nearestMapLocation =
        validMapLocations.length > 0
          ? validMapLocations.reduce((best, loc) => {
              const bestScore = distanceScore(lat!, lng!, best.lat, best.lng);
              const currentScore = distanceScore(lat!, lng!, loc.lat, loc.lng);
              return currentScore < bestScore ? loc : best;
            })
          : null;

      const detectedStateMapLocations = normalizedDetectedState
        ? validMapLocations.filter(
            (loc) => normalizeValue(loc.state) === normalizedDetectedState,
          )
        : [];

      const nearestMapLocationInDetectedState =
        detectedStateMapLocations.length > 0
          ? detectedStateMapLocations.reduce((best, loc) => {
              const bestScore = distanceScore(lat!, lng!, best.lat, best.lng);
              const currentScore = distanceScore(lat!, lng!, loc.lat, loc.lng);
              return currentScore < bestScore ? loc : best;
            })
          : null;

      const preferredNearestMapLocation =
        nearestMapLocationInDetectedState ?? nearestMapLocation;

      const normalizedNearestName = normalizeValue(
        preferredNearestMapLocation?.name,
      );
      const normalizedNearestState = normalizeValue(
        preferredNearestMapLocation?.state,
      );
      const normalizedNearestDistrict = normalizeValue(
        preferredNearestMapLocation?.district,
      );
      const normalizedNearestCity = normalizeValue(
        preferredNearestMapLocation?.city,
      );

      const bestNgo =
        ngoDirectory.find(
          (ngo) =>
            normalizeValue(ngo.state) === normalizedDetectedState &&
            normalizeValue(ngo.district) === normalizedDetectedDistrict &&
            normalizeValue(ngo.city) === normalizedDetectedCity,
        ) ??
        ngoDirectory.find(
          (ngo) =>
            normalizeValue(ngo.state) === normalizedDetectedState &&
            normalizeValue(ngo.district) === normalizedDetectedDistrict,
        ) ??
        ngoDirectory.find(
          (ngo) => normalizeValue(ngo.state) === normalizedDetectedState,
        ) ??
        ngoDirectory.find(
          (ngo) =>
            normalizeValue(ngo.name) === normalizedNearestName &&
            normalizeValue(ngo.state) === normalizedNearestState &&
            normalizeValue(ngo.district) === normalizedNearestDistrict &&
            normalizeValue(ngo.city) === normalizedNearestCity,
        ) ??
        ngoDirectory.find(
          (ngo) =>
            normalizeValue(ngo.state) === normalizedNearestState &&
            normalizeValue(ngo.district) === normalizedNearestDistrict &&
            normalizeValue(ngo.city) === normalizedNearestCity,
        ) ??
        ngoDirectory.find(
          (ngo) =>
            normalizeValue(ngo.state) === normalizedNearestState &&
            normalizeValue(ngo.district) === normalizedNearestDistrict,
        ) ??
        ngoDirectory.find(
          (ngo) => normalizeValue(ngo.state) === normalizedNearestState,
        ) ??
        null;

      const targetNgoName =
        bestNgo?.name?.trim() ||
        preferredNearestMapLocation?.name?.trim() ||
        (nextDetectedCity.trim()
          ? `${nextDetectedCity.trim()} Emergency Support`
          : "Nearest Emergency Partner");
      const targetState =
        bestNgo?.state?.trim() ||
        preferredNearestMapLocation?.state?.trim() ||
        nextDetectedState.trim() ||
        null;
      const targetDistrict =
        bestNgo?.district?.trim() ||
        preferredNearestMapLocation?.district?.trim() ||
        nextDetectedDistrict.trim() ||
        null;
      const targetCity =
        bestNgo?.city?.trim() ||
        preferredNearestMapLocation?.city?.trim() ||
        nextDetectedCity.trim() ||
        null;

      if (bestNgo) {
        applyAreaSelection(bestNgo.state, bestNgo.district, bestNgo.city);
        setSelectedNgoId(bestNgo.id);
      } else {
        if (targetState && targetDistrict && targetCity) {
          applyAreaSelection(targetState, targetDistrict, targetCity);
        }
        setSelectedNgoId("");
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("You are not signed in.");
        return;
      }

      const basePayload = {
        client_id: user.id,
        client_name: finalClientName,
        requester_phone: null,
        target_ngo_name: targetNgoName,
        target_state: targetState,
        target_district: targetDistrict,
        target_city: targetCity,
        message: "Emergency",
        lat,
        lng,
        status: "open" as const,
      };

      const withDetectedPayload = {
        ...basePayload,
        detected_state: nextDetectedState.trim() || null,
        detected_district: nextDetectedDistrict.trim() || null,
        detected_city: nextDetectedCity.trim() || null,
        detected_location_text: nextLocationText.trim() || null,
      };

      const { data: insertedData, error: insErrWithDetected } = await supabase
        .from("help_requests")
        .insert(withDetectedPayload)
        .select("id");

      let createdRequestId: string | null = null;

      if (insErrWithDetected) {
        // Check for rate limit errors
        const messageText = insErrWithDetected.message.toLowerCase();
        const isRateLimitErr =
          messageText.includes("already have an open") ||
          messageText.includes("rate limited") ||
          messageText.includes("emergency requests are rate");

        if (isRateLimitErr) {
          setError(
            "SOS rate limited: You already have an open emergency request or sent one recently. Please wait before sending another.",
          );
          return;
        }

        const missingDetectedColumns =
          messageText.includes("detected_state") ||
          messageText.includes("detected_district") ||
          messageText.includes("detected_city") ||
          messageText.includes("detected_location_text");

        if (missingDetectedColumns) {
          const { data: fallbackData, error: fallbackErr } = await supabase
            .from("help_requests")
            .insert(basePayload)
            .select("id");

          if (fallbackErr) {
            const fallbackMessageText = fallbackErr.message.toLowerCase();

            // Check if error is token expiry
            if (isTokenExpiredError(fallbackErr)) {
              setError(
                "Session expired. Please sign in again and try SOS again.",
              );
              return;
            }

            if (
              fallbackMessageText.includes("already have an open") ||
              fallbackMessageText.includes("rate limited") ||
              fallbackMessageText.includes("emergency requests are rate")
            ) {
              setError(
                "SOS rate limited: You already have an open emergency request or sent one recently. Please wait before sending another.",
              );
            } else {
              setError(fallbackErr.message);
            }
            return;
          }

          createdRequestId = fallbackData?.[0]?.id ?? null;
        } else {
          // Check if error is token expiry
          if (isTokenExpiredError(insErrWithDetected)) {
            setError(
              "Session expired. Please sign in again and try SOS again.",
            );
            return;
          }

          setError(insErrWithDetected.message);
          return;
        }
      } else {
        createdRequestId = insertedData?.[0]?.id ?? null;
      }

      if (!createdRequestId) {
        setError("SOS created but could not start location tracking.");
        return;
      }

      // Start continuous location tracking for this request
      try {
        await startLocationTracking(createdRequestId, user.id);
      } catch (trackingErr) {
        console.warn("[SOS] Location tracking failed to start:", trackingErr);
        // Non-fatal: SOS is created, but location won't auto-update
      }
    } catch {
      setError("Could not send SOS request. Please try again.");
      return;
    } finally {
      setSubmitting(false);
    }

    setSuccess("SOS sent. Emergency request created and map opened.");
    setClientName(finalClientName);
    setPhone("");
    setMessage("");
    setDashboardView("home");
    setActiveTab("map");
    pendingMapTabZoomRef.current = true;
    await loadMine();
  }

  async function cancelRequest(id: string) {
    if (!supabase) {
      return;
    }

    setCancelingRequestId(id);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setCancelingRequestId(null);
      setError("You are not signed in.");
      return;
    }

    const { error: uErr } = await supabase
      .from("help_requests")
      .delete()
      .eq("id", id)
      .eq("client_id", user.id);

    if (uErr) {
      setCancelingRequestId(null);
      setError(uErr.message);
      return;
    }

    // Stop location tracking for the cancelled request
    await stopLocationTracking(id);

    setCancelingRequestId(null);
    await loadMine();
  }

  async function handleVerifyResolution(
    requestId: string,
    isResolved: boolean,
  ) {
    if (!supabase) {
      return;
    }

    setVerifyingRequestId(requestId);
    setVerifyingRequestLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setVerifyingRequestLoading(false);
      setVerifyingRequestId(null);
      setError("You are not signed in.");
      return;
    }

    function hasMissingVerificationColumn(message: string | undefined) {
      const text = (message ?? "").toLowerCase();
      return (
        text.includes("verification_status") ||
        text.includes("verified_by_client_at")
      );
    }

    if (isResolved) {
      // Client confirms resolution - mark as verified
      const { error: verifyErr } = await supabase
        .from("help_requests")
        .update({
          verification_status: "verified",
          verified_by_client_at: new Date().toISOString(),
        })
        .eq("id", requestId)
        .eq("client_id", user.id);

      if (verifyErr) {
        if (hasMissingVerificationColumn(verifyErr.message)) {
          setLocallyVerifiedRequestIds((prev) => ({
            ...prev,
            [requestId]: true,
          }));
          setMyRequests((prev) =>
            prev.map((request) =>
              request.id === requestId
                ? {
                    ...request,
                    verification_status: "verified",
                  }
                : request,
            ),
          );
          setVerifyingRequestLoading(false);
          setVerifyingRequestId(null);
          setSuccess(
            "Resolution confirmed. Verification columns are missing in DB, so audit fields were skipped.",
          );
          return;
        }

        setVerifyingRequestLoading(false);
        setVerifyingRequestId(null);
        setError(verifyErr.message);
        return;
      }

      setVerifyingRequestLoading(false);
      setVerifyingRequestId(null);
      setSuccess("Thank you for confirming the resolution!");
      setLocallyVerifiedRequestIds((prev) => ({
        ...prev,
        [requestId]: true,
      }));

      // Stop location tracking since request is now resolved
      await stopLocationTracking(requestId);

      setMyRequests((prev) =>
        prev.map((request) =>
          request.id === requestId
            ? {
                ...request,
                verification_status: "verified",
              }
            : request,
        ),
      );
      await loadMine();
      return;
    }

    // Client rejects resolution - revert to "in_progress" and notify NGO
    const { error: uErr } = await supabase
      .from("help_requests")
      .update({
        status: "in_progress",
        verification_status: "rejected",
        verified_by_client_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .eq("client_id", user.id);

    const usedMissingColumnFallback =
      Boolean(uErr) && hasMissingVerificationColumn(uErr?.message);

    if (uErr) {
      if (hasMissingVerificationColumn(uErr.message)) {
        const { error: fallbackErr } = await supabase
          .from("help_requests")
          .update({ status: "in_progress" })
          .eq("id", requestId)
          .eq("client_id", user.id);

        if (fallbackErr) {
          setVerifyingRequestLoading(false);
          setVerifyingRequestId(null);
          setError(fallbackErr.message);
          return;
        }
      } else {
        setVerifyingRequestLoading(false);
        setVerifyingRequestId(null);
        setError(uErr.message);
        return;
      }
    }

    // Log notification that client rejected resolution
    const req = myRequests.find((r) => r.id === requestId);
    if (req) {
      const ngoName = req.target_ngo_name ?? "NGO";
      const notificationMsg = `Client rejected resolution for request ${requestId.slice(0, 8)}`;

      await supabase.from("notifications").insert({
        ngo_name: ngoName,
        message: notificationMsg,
        request_id: requestId,
        type: "resolution_rejected",
        read: false,
      });
    }

    setVerifyingRequestLoading(false);
    setVerifyingRequestId(null);
    setLocallyVerifiedRequestIds((prev) => {
      if (!prev[requestId]) {
        return prev;
      }

      const next = { ...prev };
      delete next[requestId];
      return next;
    });
    if (usedMissingColumnFallback) {
      setSuccess(
        "Request reverted to in progress and NGO notified. Verification audit columns are missing in DB.",
      );
    } else {
      setSuccess(
        "Request status reverted to 'in progress'. NGO has been notified.",
      );
    }
    await loadMine();
  }

  async function handlePullRefresh() {
    setError(null);
    setSuccess(null);
    setPullRefreshing(true);

    try {
      if (dashboardView === "tracking") {
        await loadMine();
        setSuccess("Tracking reloaded from database.");
        return;
      }

      if (dashboardView === "home" && activeTab === "request") {
        await Promise.all([loadMine(), loadNgoDirectory(), loadMapLocations()]);
        setSuccess("Request data refreshed from database.");
        return;
      }

      await Promise.all([loadMine(), loadNgoDirectory(), loadMapLocations()]);
      setSuccess("Dashboard refreshed from database.");
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
              <Text style={styles.kicker}>BEACON Client Dashboard</Text>
              <Text style={styles.title}>Hello, {displayName}</Text>
              <Text style={styles.subtitle}>
                Request help, track status, and share exact location.
              </Text>
            </View>
          </View>

          {dashboardView !== "profile" ? (
            <>
              {dashboardView === "home" ? (
                <View style={styles.tabRow}>
                  {HOME_TABS.map((tab) => {
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
                          name={getHomeTabIcon(tab, active)}
                          size={20}
                          color={active ? "#F97316" : "#94A3B8"}
                        />
                        <Text
                          style={[
                            styles.tabText,
                            active ? styles.tabTextActive : null,
                          ]}
                        >
                          {getHomeTabLabel(tab)}
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
              ) : null}

              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              {success ? (
                <Text style={styles.successText}>{success}</Text>
              ) : null}
              {loadingData ? (
                <Text style={styles.loadingText}>
                  Loading dashboard data...
                </Text>
              ) : null}

              {dashboardView === "home" && activeTab === "sos" ? (
                <View style={styles.panel}>
                  <Text style={styles.panelTitle}>SOS or Request</Text>
                  <View style={styles.sosWrap}>
                    <Animated.View
                      style={[styles.sosGlow, { opacity: sosGlowOpacity }]}
                    />
                    <Animated.View style={{ transform: [{ scale: sosScale }] }}>
                      <Pressable
                        onPress={() => void submitSos()}
                        disabled={submitting}
                        style={[
                          styles.sosButton,
                          submitting ? styles.buttonDisabled : null,
                        ]}
                      >
                        <Text style={styles.sosButtonText}>SOS</Text>
                        <Text style={styles.sosSubText}>
                          {submitting ? "Sending..." : "Tap To Alert"}
                        </Text>
                      </Pressable>
                    </Animated.View>
                  </View>
                  <Text style={styles.locationMetaText}>
                    Use SOS for immediate emergency. Use Request for detailed
                    help.
                  </Text>
                  <Text style={styles.locationMetaText}>
                    Coordinates:{" "}
                    {userLat != null && userLng != null
                      ? `${userLat.toFixed(5)}, ${userLng.toFixed(5)}`
                      : "Not captured yet"}
                  </Text>
                  <Text style={styles.locationMetaText}>
                    Location: {detectedLocationLabel}
                  </Text>
                </View>
              ) : null}

              {dashboardView === "home" && activeTab === "request" ? (
                <View style={styles.panel}>
                  <Text style={styles.panelTitle}>Request Section</Text>
                  <Text style={styles.fieldLabel}>Name</Text>
                  <TextInput
                    value={clientName}
                    editable={false}
                    placeholder="Name"
                    placeholderTextColor="#7a7a7a"
                    style={[styles.input, styles.inputDisabled]}
                  />
                  <Text style={styles.fieldLabel}>Phone Number</Text>
                  <TextInput
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="Phone number"
                    keyboardType="phone-pad"
                    placeholderTextColor="#7a7a7a"
                    style={styles.input}
                  />

                  <Pressable
                    onPress={() => void captureLocation()}
                    disabled={locating}
                    style={[
                      styles.locationButton,
                      locating ? styles.buttonDisabled : null,
                    ]}
                  >
                    <Text style={styles.locationButtonText}>
                      {locating
                        ? `Fetching location${".".repeat(locatingDots)}`
                        : "Get My Location"}
                    </Text>
                  </Pressable>

                  {userLat != null && userLng != null ? (
                    <Text style={styles.locationMetaText}>
                      Current location: {userLat.toFixed(5)},{" "}
                      {userLng.toFixed(5)}
                    </Text>
                  ) : (
                    <Text style={styles.locationMetaText}>
                      If location is not shared, NGO area coordinates will be
                      used.
                    </Text>
                  )}

                  <TextInput
                    value={locationText}
                    onChangeText={setLocationText}
                    placeholder="Detected location (editable)"
                    placeholderTextColor="#7a7a7a"
                    style={styles.input}
                  />

                  <Text style={styles.fieldLabel}>State</Text>
                  {Platform.OS === "ios" ? (
                    <Pressable
                      style={styles.pickerButton}
                      onPress={() =>
                        openIosSelector(
                          "Select state",
                          states.map((state) => ({
                            label: state,
                            value: state,
                          })),
                          (value) => {
                            setSelectedState(value);
                            setSelectedDistrict("");
                            setSelectedCity("");
                            setSelectedNgoId("");
                          },
                        )
                      }
                    >
                      <Text
                        style={[
                          styles.pickerButtonText,
                          !selectedState ? styles.pickerPlaceholderText : null,
                        ]}
                      >
                        {selectedState || "Select state"}
                      </Text>
                      <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
                    </Pressable>
                  ) : (
                    <View style={styles.pickerContainer}>
                      <Picker
                        mode="dropdown"
                        selectedValue={selectedState}
                        onValueChange={(value) => {
                          const next = String(value ?? "");
                          setSelectedState(next);
                          setSelectedDistrict("");
                          setSelectedCity("");
                          setSelectedNgoId("");
                        }}
                        style={styles.picker}
                        dropdownIconColor="#FFFFFF"
                      >
                        <Picker.Item
                          label="Select state"
                          value=""
                          color={PICKER_PLACEHOLDER_COLOR}
                        />
                        {states.map((state) => (
                          <Picker.Item
                            key={state}
                            label={state}
                            value={state}
                            color={PICKER_ITEM_COLOR}
                          />
                        ))}
                      </Picker>
                    </View>
                  )}

                  <Text style={styles.fieldLabel}>District</Text>
                  {Platform.OS === "ios" ? (
                    <Pressable
                      disabled={!selectedState}
                      style={[
                        styles.pickerButton,
                        !selectedState ? styles.buttonDisabled : null,
                      ]}
                      onPress={() =>
                        openIosSelector(
                          "Select district",
                          districts.map((district) => ({
                            label: district,
                            value: district,
                          })),
                          (value) => {
                            setSelectedDistrict(value);
                            setSelectedCity("");
                            setSelectedNgoId("");
                          },
                        )
                      }
                    >
                      <Text
                        style={[
                          styles.pickerButtonText,
                          !selectedDistrict
                            ? styles.pickerPlaceholderText
                            : null,
                        ]}
                      >
                        {selectedDistrict || "Select district"}
                      </Text>
                      <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
                    </Pressable>
                  ) : (
                    <View style={styles.pickerContainer}>
                      <Picker
                        mode="dropdown"
                        enabled={Boolean(selectedState)}
                        selectedValue={selectedDistrict}
                        onValueChange={(value) => {
                          const next = String(value ?? "");
                          setSelectedDistrict(next);
                          setSelectedCity("");
                          setSelectedNgoId("");
                        }}
                        style={styles.picker}
                        dropdownIconColor="#FFFFFF"
                      >
                        <Picker.Item
                          label="Select district"
                          value=""
                          color={PICKER_PLACEHOLDER_COLOR}
                        />
                        {districts.map((district) => (
                          <Picker.Item
                            key={district}
                            label={district}
                            value={district}
                            color={PICKER_ITEM_COLOR}
                          />
                        ))}
                      </Picker>
                    </View>
                  )}

                  <Text style={styles.fieldLabel}>City</Text>
                  {Platform.OS === "ios" ? (
                    <Pressable
                      disabled={!selectedDistrict}
                      style={[
                        styles.pickerButton,
                        !selectedDistrict ? styles.buttonDisabled : null,
                      ]}
                      onPress={() =>
                        openIosSelector(
                          "Select city",
                          cities.map((city) => ({ label: city, value: city })),
                          (value) => {
                            setSelectedCity(value);
                            setSelectedNgoId("");
                          },
                        )
                      }
                    >
                      <Text
                        style={[
                          styles.pickerButtonText,
                          !selectedCity ? styles.pickerPlaceholderText : null,
                        ]}
                      >
                        {selectedCity || "Select city"}
                      </Text>
                      <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
                    </Pressable>
                  ) : (
                    <View style={styles.pickerContainer}>
                      <Picker
                        mode="dropdown"
                        enabled={Boolean(selectedDistrict)}
                        selectedValue={selectedCity}
                        onValueChange={(value) => {
                          const next = String(value ?? "");
                          setSelectedCity(next);
                          setSelectedNgoId("");
                        }}
                        style={styles.picker}
                        dropdownIconColor="#FFFFFF"
                      >
                        <Picker.Item
                          label="Select city"
                          value=""
                          color={PICKER_PLACEHOLDER_COLOR}
                        />
                        {cities.map((city) => (
                          <Picker.Item
                            key={city}
                            label={city}
                            value={city}
                            color={PICKER_ITEM_COLOR}
                          />
                        ))}
                      </Picker>
                    </View>
                  )}

                  <Text style={styles.fieldLabel}>NGO</Text>
                  {Platform.OS === "ios" ? (
                    <Pressable
                      disabled={!selectedCity}
                      style={[
                        styles.pickerButton,
                        !selectedCity ? styles.buttonDisabled : null,
                      ]}
                      onPress={() =>
                        openIosSelector(
                          "Select NGO",
                          ngoOptions.map((ngo) => ({
                            label: ngo.name,
                            value: ngo.id,
                          })),
                          (value) => {
                            setSelectedNgoId(String(value ?? ""));
                          },
                        )
                      }
                    >
                      <Text
                        style={[
                          styles.pickerButtonText,
                          !selectedNgoId ? styles.pickerPlaceholderText : null,
                        ]}
                      >
                        {selectedNgo?.name || "Select NGO"}
                      </Text>
                      <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
                    </Pressable>
                  ) : (
                    <View style={styles.pickerContainer}>
                      <Picker
                        mode="dropdown"
                        enabled={Boolean(selectedCity)}
                        selectedValue={selectedNgoId}
                        onValueChange={(value) => {
                          setSelectedNgoId(String(value ?? ""));
                        }}
                        style={styles.picker}
                        dropdownIconColor="#FFFFFF"
                      >
                        <Picker.Item
                          label="Select NGO"
                          value=""
                          color={PICKER_PLACEHOLDER_COLOR}
                        />
                        {ngoOptions.map((ngo) => (
                          <Picker.Item
                            key={ngo.id}
                            label={ngo.name}
                            value={ngo.id}
                            color={PICKER_ITEM_COLOR}
                          />
                        ))}
                      </Picker>
                    </View>
                  )}

                  <TextInput
                    value={message}
                    onChangeText={setMessage}
                    placeholder="What help do you need?"
                    placeholderTextColor="#7a7a7a"
                    multiline
                    numberOfLines={4}
                    style={[styles.input, styles.messageInput]}
                  />

                  <Pressable
                    onPress={() => void submitHelp()}
                    disabled={submitting}
                    style={[
                      styles.primaryButton,
                      submitting ? styles.buttonDisabled : null,
                    ]}
                  >
                    <Text style={styles.primaryButtonText}>
                      {submitting ? "Sending request..." : "Send Help Request"}
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {dashboardView === "home" && activeTab === "map" ? (
                <View style={styles.panel}>
                  <Text style={styles.panelTitle}>NGO + Help Map</Text>
                  <Text style={styles.panelText}>
                    View map pins and your current coordinates/location.
                  </Text>

                  <Pressable
                    style={[
                      styles.locationButton,
                      mapLocating ? styles.buttonDisabled : null,
                    ]}
                    onPress={() => {
                      void zoomToCurrentLocation();
                    }}
                    disabled={mapLocating}
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

                  <Text style={styles.mapLegendText}>
                    Current coordinates:{" "}
                    {userLat != null && userLng != null
                      ? `${userLat.toFixed(5)}, ${userLng.toFixed(5)}`
                      : "Not captured yet"}
                  </Text>
                  <Text style={styles.mapLegendText}>
                    Current location: {detectedLocationLabel}
                  </Text>
                </View>
              ) : null}

              {dashboardView === "tracking" ? (
                <View style={styles.panel}>
                  <Text style={styles.panelTitle}>My Requests</Text>
                  <Text style={styles.mapLegendText}>
                    Current coordinates:{" "}
                    {userLat != null && userLng != null
                      ? `${userLat.toFixed(5)}, ${userLng.toFixed(5)}`
                      : "Not captured yet"}
                  </Text>
                  <Text style={styles.mapLegendText}>
                    Current location: {detectedLocationLabel}
                  </Text>
                  <View style={styles.filterRow}>
                    {(
                      [
                        "all",
                        "open",
                        "in_progress",
                        "resolved",
                        "cancelled",
                      ] as RequestFilter[]
                    ).map((filter) => (
                      <Pressable
                        key={filter}
                        onPress={() => setRequestFilter(filter)}
                        style={[
                          styles.filterPill,
                          requestFilter === filter
                            ? styles.filterPillActive
                            : null,
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
                          {filter.replace("_", " ")}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {filteredRequests.map((req) => {
                    const normalizedVerificationStatus = normalizeValue(
                      req.verification_status,
                    );
                    const isClientVerified =
                      Boolean(locallyVerifiedRequestIds[req.id]) ||
                      normalizedVerificationStatus === "verified" ||
                      normalizedVerificationStatus === "verifed";

                    return (
                      <View key={req.id} style={styles.requestCard}>
                        <Text style={styles.requestMessage}>{req.message}</Text>
                        <Text style={styles.requestMeta}>
                          {req.target_ngo_name ?? "-"} ·{" "}
                          {req.target_city ?? "-"}
                        </Text>
                        <Text style={styles.requestMeta}>
                          Coordinates:{" "}
                          {Number.isFinite(req.lat) && Number.isFinite(req.lng)
                            ? `${req.lat.toFixed(5)}, ${req.lng.toFixed(5)}`
                            : "Not available"}
                        </Text>
                        <Text style={styles.requestMeta}>
                          {formatWhen(req.created_at)}
                        </Text>
                        <Text style={styles.requestStatus}>
                          Status: {req.status}
                        </Text>
                        {req.status === "open" ||
                        req.status === "in_progress" ? (
                          <Pressable
                            style={[
                              styles.cancelBtn,
                              cancelingRequestId === req.id
                                ? styles.buttonDisabled
                                : null,
                            ]}
                            disabled={cancelingRequestId === req.id}
                            onPress={() => {
                              void cancelRequest(req.id);
                            }}
                          >
                            <Text style={styles.cancelBtnText}>
                              {cancelingRequestId === req.id
                                ? `Cancelling${".".repeat(cancelDots)}`
                                : "Cancel request"}
                            </Text>
                          </Pressable>
                        ) : null}
                        {req.status === "resolved" && !isClientVerified ? (
                          <View style={styles.verifyResolutionBlock}>
                            <Text style={styles.verifyResolutionPrompt}>
                              Did the NGO fully resolve your request?
                            </Text>
                            <View style={styles.verifyResolutionActions}>
                              <Pressable
                                style={[
                                  styles.modalButton,
                                  styles.modalButtonNo,
                                  verifyingRequestLoading &&
                                  verifyingRequestId === req.id
                                    ? styles.buttonDisabled
                                    : null,
                                ]}
                                disabled={
                                  verifyingRequestLoading &&
                                  verifyingRequestId === req.id
                                }
                                onPress={() => {
                                  void handleVerifyResolution(req.id, false);
                                }}
                              >
                                <Text style={styles.modalButtonNoText}>
                                  {verifyingRequestLoading &&
                                  verifyingRequestId === req.id
                                    ? "Processing..."
                                    : "Still need help"}
                                </Text>
                              </Pressable>

                              <Pressable
                                style={[
                                  styles.modalButton,
                                  styles.modalButtonYes,
                                  verifyingRequestLoading &&
                                  verifyingRequestId === req.id
                                    ? styles.buttonDisabled
                                    : null,
                                ]}
                                disabled={
                                  verifyingRequestLoading &&
                                  verifyingRequestId === req.id
                                }
                                onPress={() => {
                                  void handleVerifyResolution(req.id, true);
                                }}
                              >
                                <Text style={styles.modalButtonYesText}>
                                  {verifyingRequestLoading &&
                                  verifyingRequestId === req.id
                                    ? "Processing..."
                                    : "Confirm resolved"}
                                </Text>
                              </Pressable>
                            </View>
                          </View>
                        ) : null}
                        {req.status === "resolved" && isClientVerified ? (
                          <Text style={styles.requestMeta}>
                            Resolution confirmed by you.
                          </Text>
                        ) : null}
                      </View>
                    );
                  })}

                  {filteredRequests.length === 0 ? (
                    <Text style={styles.panelText}>
                      No requests for selected filter.
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {dashboardView === "home" && activeTab === "actions" ? (
                <View style={styles.panel}>
                  <Text style={styles.panelTitle}>Action Section</Text>
                  <Text style={styles.panelText}>
                    Use quick actions for navigation and a manual data refresh.
                  </Text>
                  <View style={styles.actionGrid}>
                    <Pressable
                      style={styles.actionButton}
                      onPress={() => {
                        setDashboardView("tracking");
                        setActiveTab("tracking");
                      }}
                    >
                      <Text style={styles.actionText}>Open Tracking</Text>
                    </Pressable>
                    <Pressable
                      style={styles.actionButton}
                      onPress={() => {
                        void handlePullRefresh();
                      }}
                    >
                      <Text style={styles.actionText}>Refresh Data</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </>
          ) : (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Profile</Text>
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>Name</Text>
                <Text style={styles.profileValue}>{displayName}</Text>
              </View>
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>Role</Text>
                <Text style={styles.profileValue}>Client</Text>
              </View>
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>Requests Logged</Text>
                <Text style={styles.profileValue}>{myRequests.length}</Text>
              </View>
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>Current NGO</Text>
                <Text style={styles.profileValue}>
                  {selectedNgo?.name ?? "Not selected"}
                </Text>
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
              setDashboardView("tracking");
              setActiveTab("tracking");
            }}
            style={[
              styles.bottomTabButton,
              dashboardView === "tracking"
                ? styles.bottomTabButtonActive
                : null,
            ]}
          >
            <Ionicons
              name={dashboardView === "tracking" ? "pulse" : "pulse-outline"}
              size={20}
              color={dashboardView === "tracking" ? "#F97316" : "#8D8D8D"}
            />
            <Text
              style={[
                styles.bottomTabLabel,
                dashboardView === "tracking"
                  ? styles.bottomTabLabelActive
                  : null,
              ]}
            >
              Tracking
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
    padding: 14,
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
  panelSectionTitle: {
    color: "#FDBA74",
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 4,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#383838",
    backgroundColor: "#0C0C0C",
    color: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    fontWeight: "600",
  },
  inputDisabled: {
    opacity: 0.75,
  },
  messageInput: {
    minHeight: 90,
    textAlignVertical: "top",
  },
  fieldLabel: {
    color: "#D4D4D4",
    fontWeight: "700",
    fontSize: 12,
    marginTop: 2,
  },
  pickerContainer: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#383838",
    backgroundColor: "#0C0C0C",
    overflow: "hidden",
  },
  pickerButton: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#383838",
    backgroundColor: "#0C0C0C",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pickerButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
    marginRight: 8,
  },
  pickerPlaceholderText: {
    color: "#9CA3AF",
  },
  picker: {
    color: "#FFFFFF",
    minHeight: 48,
  },
  pillRow: {
    gap: 8,
  },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#3A3A3A",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  pillActive: {
    backgroundColor: "#F97316",
    borderColor: "#F97316",
  },
  pillText: {
    color: "#D0D0D0",
    fontWeight: "700",
    fontSize: 12,
  },
  pillTextActive: {
    color: "#FFFFFF",
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  sosWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    minHeight: 196,
    marginBottom: 2,
  },
  sosGlow: {
    position: "absolute",
    width: 184,
    height: 184,
    borderRadius: 92,
    backgroundColor: "#EF4444",
  },
  sosButton: {
    width: 152,
    height: 152,
    borderRadius: 76,
    borderWidth: 2,
    borderColor: "#7F1D1D",
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    shadowColor: "#EF4444",
    shadowOpacity: 0.34,
    shadowRadius: 14,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    elevation: 10,
  },
  sosButtonText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 42,
    letterSpacing: 0.5,
    lineHeight: 46,
  },
  sosSubText: {
    color: "#FEE2E2",
    fontWeight: "800",
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 1,
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
  locationMetaText: {
    color: "#9CA3AF",
    fontSize: 12,
    fontWeight: "600",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 14,
  },
  buttonDisabled: {
    opacity: 0.6,
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
  successText: {
    color: "#86EFAC",
    borderWidth: 1,
    borderColor: "#14532d",
    backgroundColor: "#052e16",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontWeight: "600",
  },
  loadingText: {
    color: "#FFFFFF",
    fontWeight: "700",
    textAlign: "center",
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
  mapLegendText: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600",
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#3A3A3A",
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  filterPillActive: {
    backgroundColor: "#F97316",
    borderColor: "#F97316",
  },
  filterPillText: {
    color: "#D0D0D0",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  filterPillTextActive: {
    color: "#FFFFFF",
  },
  requestCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#292929",
    backgroundColor: "#0D0D0D",
    padding: 10,
    gap: 4,
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
  requestStatus: {
    color: "#86EFAC",
    fontWeight: "700",
    textTransform: "uppercase",
    fontSize: 12,
  },
  cancelBtn: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#f87171",
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 4,
  },
  cancelBtnText: {
    color: "#FCA5A5",
    fontWeight: "700",
    fontSize: 12,
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
  verifyBtn: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#60a5fa",
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 4,
    backgroundColor: "rgba(96, 165, 250, 0.12)",
  },
  verifyBtnText: {
    color: "#93C5FD",
    fontWeight: "700",
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalContent: {
    backgroundColor: "#1A1A1A",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    paddingHorizontal: 20,
    paddingVertical: 24,
    marginHorizontal: 16,
    width: "85%",
    maxWidth: 320,
    gap: 12,
  },
  modalTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  modalMessage: {
    color: "#B0B0B0",
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 20,
  },
  modalButtonRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  verifyResolutionBlock: {
    marginTop: 10,
    gap: 8,
  },
  verifyResolutionPrompt: {
    color: "#D4D4D4",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  verifyResolutionActions: {
    flexDirection: "row",
    gap: 10,
  },
  modalButton: {
    flex: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  modalButtonNo: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderColor: "#F87171",
  },
  modalButtonYes: {
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    borderColor: "#86EFAC",
  },
  modalButtonNoText: {
    color: "#FCA5A5",
    fontWeight: "700",
    fontSize: 12,
    textAlign: "center",
  },
  modalButtonYesText: {
    color: "#86EFAC",
    fontWeight: "700",
    fontSize: 12,
    textAlign: "center",
  },
});

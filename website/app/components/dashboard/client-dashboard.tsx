"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  startTransition,
} from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock3,
  Loader2,
  MapPinned,
  Navigation,
  Send,
  Siren,
  Users,
  XCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import type {
  HelpStatus,
  HelpRequestRow,
  MapLocationRow,
  NgoDirectoryRow,
} from "@/lib/types/help";

const MeshMap = dynamic(() => import("./mesh-map").then((m) => m.MeshMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-75 items-center justify-center rounded-xl border border-white/10 bg-slate-900/50 text-sm text-slate-400 sm:h-95 lg:h-[min(420px,68vh)]">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
      Loading NGO map...
    </div>
  ),
});

type ClientTopTab = "request" | "map" | "tracking" | "actions";

const stats: Array<{
  id: ClientTopTab;
  label: string;
  icon: typeof Siren;
}> = [
  { id: "request", label: "Active SOS", icon: Siren },
  { id: "map", label: "Mesh Nodes", icon: Activity },
  { id: "tracking", label: "Responders", icon: Users },
  { id: "actions", label: "Mapped Zones", icon: MapPinned },
];

type RequestTab = "all" | "open" | "in_progress" | "resolved" | "cancelled";

const requestTabs: Array<{ id: RequestTab; label: string }> = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "in_progress", label: "In Progress" },
  { id: "resolved", label: "Resolved" },
  { id: "cancelled", label: "Cancelled" },
];

const requestMilestones = ["open", "in_progress", "resolved"] as const;

function statusMeta(status: HelpStatus) {
  if (status === "resolved") {
    return {
      label: "Resolved",
      progressText: "Completed by NGO team",
      badgeClass: "border-emerald-400/45 bg-emerald-500/15 text-emerald-200",
      cardClass:
        "border-emerald-400/20 bg-gradient-to-br from-emerald-500/8 via-slate-950/60 to-slate-950/90",
      progressPercent: 100,
      Icon: CheckCircle2,
    };
  }
  if (status === "in_progress") {
    return {
      label: "In Progress",
      progressText: "NGO is actively working on this query",
      badgeClass: "border-sky-400/45 bg-sky-500/15 text-sky-100",
      cardClass:
        "border-sky-400/20 bg-gradient-to-br from-sky-500/10 via-slate-950/60 to-slate-950/90",
      progressPercent: 66,
      Icon: Clock3,
    };
  }
  if (status === "cancelled") {
    return {
      label: "Cancelled",
      progressText: "Closed by requester",
      badgeClass: "border-rose-400/40 bg-rose-500/10 text-rose-200",
      cardClass:
        "border-rose-400/20 bg-gradient-to-br from-rose-500/8 via-slate-950/60 to-slate-950/90",
      progressPercent: 100,
      Icon: XCircle,
    };
  }
  return {
    label: "Open",
    progressText: "Waiting for NGO assignment",
    badgeClass: "border-amber-400/45 bg-amber-500/15 text-amber-100",
    cardClass:
      "border-amber-400/20 bg-gradient-to-br from-amber-500/10 via-slate-950/60 to-slate-950/90",
    progressPercent: 33,
    Icon: AlertCircle,
  };
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

type ClientDashboardProps = {
  displayName: string;
};

export function ClientDashboard({ displayName }: ClientDashboardProps) {
  const router = useRouter();
  const [name, setName] = useState(displayName.trim());
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
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
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [myRequests, setMyRequests] = useState<HelpRequestRow[]>([]);
  const [activeRequestTab, setActiveRequestTab] = useState<RequestTab>("all");
  const [activeTopTab, setActiveTopTab] = useState<ClientTopTab>("request");

  useEffect(() => {
    setName(displayName.trim());
  }, [displayName]);

  const loadMine = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return;
    }

    const { data, error: qErr } = await supabase
      .from("help_requests")
      .select("*")
      .eq("client_id", user.id)
      .order("created_at", { ascending: false });

    if (!qErr && data) {
      setMyRequests(data as HelpRequestRow[]);
    }
  }, []);

  const loadMapNgos = useCallback(async () => {
    const { data, error: qErr } = await supabase
      .from("ngo_locations_india")
      .select("*")
      .order("state")
      .order("district")
      .order("city")
      .order("name");

    if (!qErr && data) {
      setMapLocations(
        (
          data as Array<{
            osm_type: string;
            osm_id: number;
            name: string;
            state: string;
            district: string;
            city: string;
            lat: number;
            lng: number;
            website: string | null;
            phone: string | null;
            created_at: string;
          }>
        ).map((row) => ({
          id: `${row.osm_type}-${row.osm_id}`,
          name: row.name,
          kind: "ngo",
          state: row.state,
          district: row.district,
          city: row.city,
          lat: row.lat,
          lng: row.lng,
          notes: [row.website, row.phone].filter(Boolean).join(" | ") || null,
          created_at: row.created_at,
        })),
      );
      return;
    }

    if (qErr) {
      setError(qErr.message);
    }
  }, []);

  const loadNgoDirectory = useCallback(async () => {
    const { data, error: qErr } = await supabase
      .from("ngo_directory")
      .select("*")
      .eq("is_active", true)
      .order("state")
      .order("district")
      .order("city")
      .order("name");

    if (!qErr && data) {
      setNgoDirectory(data as NgoDirectoryRow[]);
      return;
    }

    if (qErr) {
      setError(qErr.message);
    }
  }, []);

  const selectedNgo =
    ngoDirectory.find((ngo) => ngo.id === selectedNgoId) ?? null;

  function isKnownLocationValue(value: string | null | undefined) {
    if (!value) {
      return false;
    }
    return !/^unknown\b/i.test(value.trim());
  }

  const states = Array.from(
    new Set(
      mapLocations
        .map((ngo) => ngo.state?.trim())
        .filter((value): value is string => isKnownLocationValue(value)),
    ),
  );

  const statesFromDirectory = Array.from(
    new Set(
      ngoDirectory
        .map((ngo) => ngo.state.trim())
        .filter((value) => isKnownLocationValue(value)),
    ),
  );

  const statesMerged = Array.from(
    new Set([...states, ...statesFromDirectory]),
  ).sort();

  const districts = Array.from(
    new Set(
      ngoDirectory
        .filter((ngo) => locationValuesMatch(ngo.state, selectedState))
        .map((ngo) => ngo.district.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const cities = Array.from(
    new Set(
      ngoDirectory
        .filter(
          (ngo) =>
            locationValuesMatch(ngo.state, selectedState) &&
            locationValuesMatch(ngo.district, selectedDistrict),
        )
        .map((ngo) => ngo.city.trim())
        .map((cityName) => cityName?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const ngoOptions = ngoDirectory.filter(
    (ngo) =>
      locationValuesMatch(ngo.state, selectedState) &&
      locationValuesMatch(ngo.district, selectedDistrict) &&
      locationValuesMatch(ngo.city, selectedCity),
  );

  const requestCounts = useMemo(() => {
    return myRequests.reduce(
      (counts, req) => {
        counts.all += 1;
        counts[req.status] += 1;
        return counts;
      },
      {
        all: 0,
        open: 0,
        in_progress: 0,
        resolved: 0,
        cancelled: 0,
      } as Record<RequestTab, number>,
    );
  }, [myRequests]);

  const filteredRequests = useMemo(() => {
    if (activeRequestTab === "all") {
      return myRequests;
    }
    return myRequests.filter((request) => request.status === activeRequestTab);
  }, [activeRequestTab, myRequests]);

  const completionPercent =
    requestCounts.all === 0
      ? 0
      : Math.round((requestCounts.resolved / requestCounts.all) * 100);

  const topStatValues: Record<ClientTopTab, string> = {
    request: String(requestCounts.open),
    map: String(mapLocations.length),
    tracking: String(requestCounts.in_progress),
    actions: `${statesMerged.length}`,
  };

  useEffect(() => {
    startTransition(() => {
      void loadMine();
      void loadMapNgos();
      void loadNgoDirectory();
    });
  }, [loadMine, loadMapNgos, loadNgoDirectory]);

  useEffect(() => {
    if (ngoOptions.length === 1) {
      setSelectedNgoId(ngoOptions[0].id);
    }
  }, [ngoOptions]);

  function onStateChange(nextState: string) {
    setSelectedState(nextState);
    setSelectedDistrict("");
    setSelectedCity("");
    setSelectedNgoId("");
  }

  function onDistrictChange(nextDistrict: string) {
    setSelectedDistrict(nextDistrict);
    setSelectedCity("");
    setSelectedNgoId("");
  }

  function onCityChange(nextCity: string) {
    setSelectedCity(nextCity);
    setSelectedNgoId("");
  }

  function normalizeLocationText(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function pickBestLocationMatch(candidates: string[], target: string) {
    if (!target || candidates.length === 0) {
      return null;
    }

    const normalizedTarget = normalizeLocationText(target);
    if (!normalizedTarget) {
      return null;
    }

    const exact = candidates.find(
      (candidate) => normalizeLocationText(candidate) === normalizedTarget,
    );
    if (exact) {
      return exact;
    }

    const contains = candidates.find((candidate) => {
      const normalizedCandidate = normalizeLocationText(candidate);
      return (
        normalizedCandidate.includes(normalizedTarget) ||
        normalizedTarget.includes(normalizedCandidate)
      );
    });

    return contains ?? null;
  }

  function locationValuesMatch(
    a: string | null | undefined,
    b: string | null | undefined,
  ) {
    if (!a || !b) {
      return false;
    }
    return normalizeLocationText(a) === normalizeLocationText(b);
  }

  function distanceInKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ) {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const earthRadiusKm = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusKm * c;
  }

  async function reverseGeocodeLocation(latitude: number, longitude: number) {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1`,
      {
        headers: {
          Accept: "application/json",
        },
      },
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      address?: {
        state?: string;
        state_district?: string;
        county?: string;
        city?: string;
        town?: string;
        village?: string;
      };
    };

    const stateName = payload.address?.state?.trim() ?? "";
    const districtName =
      payload.address?.state_district?.trim() ??
      payload.address?.county?.trim() ??
      "";
    const cityName =
      payload.address?.city?.trim() ??
      payload.address?.town?.trim() ??
      payload.address?.village?.trim() ??
      "";

    if (!stateName || !districtName || !cityName) {
      return null;
    }

    return {
      state: stateName,
      district: districtName,
      city: cityName,
    };
  }

  async function fillFromNearestNgo(latitude: number, longitude: number) {
    if (mapLocations.length === 0) {
      throw new Error("No NGO locations found in database.");
    }

    const nearestSorted = mapLocations
      .map((ngo) => ({
        ngo,
        distance: distanceInKm(latitude, longitude, ngo.lat, ngo.lng),
      }))
      .sort((a, b) => a.distance - b.distance);

    const nearestWithKnownLocation = nearestSorted.find(
      ({ ngo }) =>
        isKnownLocationValue(ngo.state) &&
        isKnownLocationValue(ngo.district) &&
        isKnownLocationValue(ngo.city),
    )?.ngo;

    const nearest = nearestWithKnownLocation ?? nearestSorted[0]?.ngo;

    if (!nearest || !nearest.state || !nearest.district || !nearest.city) {
      throw new Error(
        "Nearest NGO does not have state, district, or city in database.",
      );
    }

    let finalState = nearest.state;
    let finalDistrict = nearest.district;
    let finalCity = nearest.city;

    // If nearest NGO has placeholder location tags, try reverse-geocoding the user coordinates.
    if (
      !isKnownLocationValue(finalState) ||
      !isKnownLocationValue(finalDistrict) ||
      !isKnownLocationValue(finalCity)
    ) {
      const geocoded = await reverseGeocodeLocation(latitude, longitude);
      if (geocoded) {
        finalState = geocoded.state;
        finalDistrict = geocoded.district;
        finalCity = geocoded.city;
      }
    }

    const matchedState =
      pickBestLocationMatch(statesFromDirectory, finalState) ??
      pickBestLocationMatch(statesMerged, finalState) ??
      finalState;

    const stateDistricts = Array.from(
      new Set(
        ngoDirectory
          .filter((ngo) => locationValuesMatch(ngo.state, matchedState))
          .map((ngo) => ngo.district)
          .filter(Boolean),
      ),
    );

    const matchedDistrict =
      pickBestLocationMatch(stateDistricts, finalDistrict) ?? finalDistrict;

    const districtCities = Array.from(
      new Set(
        ngoDirectory
          .filter(
            (ngo) =>
              locationValuesMatch(ngo.state, matchedState) &&
              locationValuesMatch(ngo.district, matchedDistrict),
          )
          .map((ngo) => ngo.city)
          .filter(Boolean),
      ),
    );

    const matchedCity =
      pickBestLocationMatch(districtCities, finalCity) ?? finalCity;

    onStateChange(matchedState);
    setSelectedDistrict(matchedDistrict);
    setSelectedCity(matchedCity);
    setDetectedState(matchedState);
    setDetectedDistrict(matchedDistrict);
    setDetectedCity(matchedCity);
    setLocationText(`${matchedCity}, ${matchedDistrict}, ${matchedState}`);

    const bestMatch = ngoDirectory.find(
      (ngo) =>
        locationValuesMatch(ngo.state, matchedState) &&
        locationValuesMatch(ngo.district, matchedDistrict) &&
        locationValuesMatch(ngo.city, matchedCity),
    );
    if (bestMatch) {
      setSelectedNgoId(bestMatch.id);
    }
  }

  function captureLocation() {
    setLocating(true);
    setError(null);
    setSuccess(null);
    if (!navigator.geolocation) {
      setLocating(false);
      setError("Location is not available in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        try {
          await fillFromNearestNgo(pos.coords.latitude, pos.coords.longitude);
          setSuccess(
            "Location refreshed. State, district, and city were updated from nearby NGO data.",
          );
        } catch (geoErr) {
          const messageText =
            geoErr instanceof Error
              ? geoErr.message
              : "Could not auto-fill state, district, and city.";
          setError(messageText);
        }
        setLocating(false);
      },
      () => {
        setLocating(false);
        setError("Could not read your location. Allow access and try again.");
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  function goToLandingPage() {
    router.push("/");
    // Fallback in case client navigation is interrupted by transient runtime issues.
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        if (window.location.pathname !== "/") {
          window.location.assign("/");
        }
      }, 350);
    }
  }

  function pickFallbackCoordinates() {
    // Prefer exact city match; then district/state; then any known NGO point.
    const exactCity = mapLocations.find(
      (ngo) =>
        locationValuesMatch(ngo.state, selectedState) &&
        locationValuesMatch(ngo.district, selectedDistrict) &&
        locationValuesMatch(ngo.city, selectedCity),
    );
    if (exactCity) {
      return { lat: exactCity.lat, lng: exactCity.lng };
    }

    const sameDistrict = mapLocations.find(
      (ngo) =>
        locationValuesMatch(ngo.state, selectedState) &&
        locationValuesMatch(ngo.district, selectedDistrict),
    );
    if (sameDistrict) {
      return { lat: sameDistrict.lat, lng: sameDistrict.lng };
    }

    const sameState = mapLocations.find((ngo) =>
      locationValuesMatch(ngo.state, selectedState),
    );
    if (sameState) {
      return { lat: sameState.lat, lng: sameState.lng };
    }

    const anyNgo = mapLocations[0];
    if (anyNgo) {
      return { lat: anyNgo.lat, lng: anyNgo.lng };
    }

    return null;
  }

  async function submitHelp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!name.trim()) {
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
      setError("Please select an NGO (state, district, city, NGO name).");
      return;
    }

    const fallbackCoordinates = pickFallbackCoordinates();
    const finalLat = lat ?? fallbackCoordinates?.lat ?? null;
    const finalLng = lng ?? fallbackCoordinates?.lng ?? null;
    if (finalLat == null || finalLng == null) {
      setError(
        "Could not determine coordinates from selected NGO area. Please select another NGO or share location optionally.",
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
    const { error: insErr } = await supabase.from("help_requests").insert({
      client_id: user.id,
      client_name: name.trim(),
      requester_phone: phone.trim(),
      target_ngo_name: selectedNgo.name,
      target_state: selectedNgo.state,
      target_district: selectedNgo.district,
      target_city: selectedNgo.city,
      detected_state: detectedState.trim() || null,
      detected_district: detectedDistrict.trim() || null,
      detected_city: detectedCity.trim() || null,
      detected_location_text: locationText.trim() || null,
      message: message.trim(),
      lat: finalLat,
      lng: finalLng,
      status: "open",
    });
    setSubmitting(false);

    if (insErr) {
      setError(insErr.message);
      return;
    }

    setSuccess("Help request sent. NGOs can see it in real time.");
    setName(displayName.trim());
    setPhone("");
    setMessage("");
    setSelectedState("");
    setSelectedDistrict("");
    setSelectedCity("");
    setSelectedNgoId("");
    setLocationText("");
    setDetectedState("");
    setDetectedDistrict("");
    setDetectedCity("");
    void loadMine();
  }

  async function cancelRequest(id: string) {
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("You are not signed in.");
      return;
    }

    const { error: uErr } = await supabase
      .from("help_requests")
      .delete()
      .eq("id", id)
      .eq("client_id", user.id);

    if (uErr) {
      setError(uErr.message);
      return;
    }
    void loadMine();
  }

  return (
    <div className="w-full space-y-6 overflow-x-hidden sm:space-y-8">
      <section className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          const isActive = activeTopTab === stat.id;
          return (
            <button
              key={stat.label}
              type="button"
              onClick={() => setActiveTopTab(stat.id)}
              className={`rounded-xl border p-4 text-left transition sm:p-5 ${
                isActive
                  ? "border-orange-300/60 bg-linear-to-br from-orange-400/25 via-orange-500/20 to-slate-900/80 shadow-[0_12px_30px_rgba(249,115,22,0.22)]"
                  : "border-white/10 bg-slate-900/70 hover:border-sky-300/35 hover:bg-slate-900/85"
              }`}
            >
              <Icon className="h-5 w-5 text-orange-300" aria-hidden="true" />
              <p className="mt-3 text-xl font-bold text-white sm:text-2xl">
                {topStatValues[stat.id]}
              </p>
              <p className="text-sm text-slate-300">{stat.label}</p>
            </button>
          );
        })}
      </section>

      {activeTopTab === "map" ? (
        <section className="rounded-2xl border border-orange-400/25 bg-slate-900/70 p-6">
          <h2 className="mb-3 text-lg font-semibold text-white">NGO map</h2>
          <p className="mb-4 text-sm text-slate-400">
            Choose an NGO from your area, then send a help request. Your
            location can be shared optionally.
          </p>
          <MeshMap mapLocations={mapLocations} helpRequests={[]} />
        </section>
      ) : null}

      {activeTopTab === "request" ? (
        <section className="rounded-2xl border border-orange-400/25 bg-slate-900/70 p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-white">Request help</h2>
          <p className="mt-2 text-sm text-slate-400">
            Fill your details and choose the NGO by state, district, city and
            NGO name. Your request goes to the NGO dashboard.
          </p>

          <form className="mt-5 space-y-4" onSubmit={submitHelp}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm text-slate-300">Your name</span>
                <input
                  type="text"
                  value={name}
                  readOnly
                  required
                  placeholder="e.g. Ayaan Sharma"
                  className="mt-1 w-full rounded-xl border border-white/15 bg-slate-950/40 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none opacity-80"
                />
                <span className="mt-1 block text-xs text-slate-500">
                  Auto-filled from your profile.
                </span>
              </label>
              <label className="block">
                <span className="text-sm text-slate-300">Phone number</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  placeholder="e.g. +91 98765 43210"
                  className="mt-1 w-full rounded-xl border border-white/15 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-orange-400"
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="block">
                <span className="text-sm text-slate-300">State</span>
                <select
                  value={selectedState}
                  onChange={(e) => onStateChange(e.target.value)}
                  required
                  className="mt-1 w-full rounded-xl border border-white/15 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:border-orange-400"
                >
                  <option value="">Select state</option>
                  {statesMerged.map((stateName) => (
                    <option key={stateName} value={stateName}>
                      {stateName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm text-slate-300">District</span>
                <select
                  value={selectedDistrict}
                  onChange={(e) => onDistrictChange(e.target.value)}
                  required
                  disabled={!selectedState}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:border-orange-400 disabled:opacity-60"
                >
                  <option value="">Select district</option>
                  {districts.map((districtName) => (
                    <option key={districtName} value={districtName}>
                      {districtName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm text-slate-300">City</span>
                <select
                  value={selectedCity}
                  onChange={(e) => onCityChange(e.target.value)}
                  required
                  disabled={!selectedDistrict}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:border-orange-400 disabled:opacity-60"
                >
                  <option value="">Select city</option>
                  {cities.map((cityName) => (
                    <option key={cityName} value={cityName}>
                      {cityName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm text-slate-300">NGO name</span>
                <select
                  value={selectedNgoId}
                  onChange={(e) => setSelectedNgoId(e.target.value)}
                  required
                  disabled={!selectedCity}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:border-orange-400 disabled:opacity-60"
                >
                  <option value="">Select NGO</option>
                  {ngoOptions.map((ngo) => (
                    <option key={ngo.id} value={ngo.id}>
                      {ngo.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block">
              <span className="text-sm text-slate-300">What do you need?</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                rows={4}
                placeholder="e.g. Medical supplies, evacuation, water…"
                className="mt-1 w-full rounded-xl border border-white/15 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-orange-400"
              />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={captureLocation}
                disabled={locating}
                className="inline-flex items-center gap-2 rounded-full border border-white/25 px-4 py-2 text-sm font-semibold text-white transition hover:border-yellow-300 hover:text-yellow-200 disabled:opacity-60"
              >
                {locating ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Navigation className="h-4 w-4" aria-hidden />
                )}
                Use my location (optional)
              </button>
              {lat != null && lng != null ? (
                <span className="font-mono text-xs text-slate-400">
                  {lat.toFixed(5)}, {lng.toFixed(5)}
                </span>
              ) : (
                <span className="text-xs text-slate-500">
                  Location optional (auto-fallback from selected NGO area)
                </span>
              )}
            </div>

            <label className="block">
              <span className="text-sm text-slate-300">Detected location</span>
              <input
                type="text"
                value={locationText}
                onChange={(e) => setLocationText(e.target.value)}
                placeholder="Detected location (editable)"
                className="mt-1 w-full rounded-xl border border-white/15 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-orange-400"
              />
            </label>

            {selectedState && selectedDistrict && selectedCity ? (
              <p className="text-xs text-emerald-200/90">
                Auto-filled from database: {selectedState} / {selectedDistrict}{" "}
                / {selectedCity}
              </p>
            ) : null}

            {error ? (
              <p className="rounded-lg border border-red-400/35 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {error}
              </p>
            ) : null}
            {success ? (
              <p className="rounded-lg border border-emerald-400/35 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                {success}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              aria-busy={submitting}
              className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Send className="h-4 w-4" aria-hidden />
              )}
              {submitting ? "Sending help request..." : "Send help request"}
            </button>
          </form>
        </section>
      ) : null}

      {activeTopTab === "tracking" ? (
        <section className="overflow-hidden rounded-2xl border border-sky-400/20 bg-linear-to-br from-[#06122a] via-[#061630] to-[#050d22] p-4 shadow-[0_20px_40px_rgba(2,8,24,0.35)] sm:p-6">
          <h2 className="text-lg font-semibold text-white">Your requests</h2>
          <p className="mt-1 text-sm text-slate-300">
            Track your query progress by status and review updates quickly.
          </p>

          {myRequests.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">
              You have not submitted any requests yet.
            </p>
          ) : (
            <>
              <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
                <div className="min-w-0 rounded-xl border border-sky-300/20 bg-[#030d24]/70 p-2">
                  <div className="flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                    {requestTabs.map((tab) => {
                      const isActive = activeRequestTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setActiveRequestTab(tab.id)}
                          className={`group min-w-26 shrink-0 snap-start rounded-xl border px-3 py-3 text-left text-xs font-semibold transition ${
                            isActive
                              ? "border-orange-300/70 bg-linear-to-br from-orange-400 to-orange-500 text-white shadow-[0_8px_22px_rgba(249,115,22,0.35)]"
                              : "border-white/10 bg-slate-900/40 text-slate-300 hover:border-sky-300/50 hover:bg-sky-400/10 hover:text-white"
                          }`}
                        >
                          <p className="text-[11px] uppercase tracking-wide opacity-90">
                            {tab.label}
                          </p>
                          <span className="mt-1 inline-flex rounded-md bg-black/25 px-2 py-0.5 text-[11px]">
                            {requestCounts[tab.id]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-300/20 bg-[#071327]/75 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Query progress
                  </p>
                  <p className="mt-2 text-2xl font-bold text-white">
                    {completionPercent}%
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {requestCounts.resolved} of {requestCounts.all} resolved
                  </p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-linear-to-r from-cyan-300 via-sky-300 to-emerald-300 transition-all"
                      style={{ width: `${completionPercent}%` }}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-300">
                    <p>Open: {requestCounts.open}</p>
                    <p>In progress: {requestCounts.in_progress}</p>
                  </div>
                </div>
              </div>

              <ul className="mt-4 space-y-3">
                {filteredRequests.map((req) =>
                  (() => {
                    const meta = statusMeta(req.status);
                    const reachedMilestones = requestMilestones.filter(
                      (milestone) => {
                        if (req.status === "cancelled") {
                          return milestone === "open";
                        }
                        if (req.status === "resolved") {
                          return true;
                        }
                        if (req.status === "in_progress") {
                          return milestone !== "resolved";
                        }
                        return milestone === "open";
                      },
                    );
                    const StatusIcon = meta.Icon;

                    return (
                      <li
                        key={req.id}
                        className={`overflow-hidden rounded-xl border px-3 py-3 text-sm shadow-[0_8px_24px_rgba(2,8,24,0.28)] sm:px-4 sm:py-4 ${meta.cardClass}`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-xs text-slate-500">
                              {formatWhen(req.created_at)}
                            </p>
                            <p className="mt-2 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 ${meta.badgeClass}`}
                              >
                                <StatusIcon
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                                {meta.label}
                              </span>
                            </p>
                            <p className="mt-2 wrap-break-word text-base text-slate-100">
                              {req.message}
                            </p>
                            <p className="mt-2 text-xs text-slate-300/95">
                              {meta.progressText}
                            </p>
                            <p className="mt-2 text-xs text-slate-400">
                              {req.target_state ?? "-"} /{" "}
                              {req.target_district ?? "-"} /{" "}
                              {req.target_city ?? "-"}
                            </p>
                            {req.detected_location_text?.trim() ? (
                              <p className="mt-2 text-xs text-amber-200/90">
                                Detected: {req.detected_location_text}
                              </p>
                            ) : null}
                            {req.detected_state ||
                            req.detected_district ||
                            req.detected_city ? (
                              <p className="mt-1 text-xs text-slate-400">
                                Detected area: {req.detected_state ?? "-"} /{" "}
                                {req.detected_district ?? "-"} /{" "}
                                {req.detected_city ?? "-"}
                              </p>
                            ) : null}

                            <div className="mt-3">
                              <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                                <div
                                  className={`h-full rounded-full ${
                                    req.status === "cancelled"
                                      ? "bg-rose-400"
                                      : "bg-linear-to-r from-cyan-300 via-sky-300 to-emerald-300"
                                  }`}
                                  style={{ width: `${meta.progressPercent}%` }}
                                />
                              </div>
                              <div className="grid grid-cols-3 gap-2 text-[10px] uppercase tracking-wide text-slate-400">
                                {requestMilestones.map((milestone) => {
                                  const milestoneReached =
                                    reachedMilestones.includes(milestone);
                                  const milestoneLabel = milestone.replace(
                                    "_",
                                    " ",
                                  );
                                  return (
                                    <p
                                      key={milestone}
                                      className={
                                        milestoneReached
                                          ? "text-slate-200"
                                          : "text-slate-500"
                                      }
                                    >
                                      {milestoneLabel}
                                    </p>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })(),
                )}
              </ul>

              {filteredRequests.length === 0 ? (
                <p className="mt-3 text-sm text-slate-400">
                  No requests in this tab yet.
                </p>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {activeTopTab === "actions" ? (
        <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-white">Quick actions</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                void captureLocation();
              }}
              disabled={locating}
              className="w-full rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-400 disabled:opacity-60"
            >
              {locating ? "Refreshing location..." : "Refresh my location"}
            </button>
            <button
              type="button"
              onClick={goToLandingPage}
              className="w-full rounded-full border border-white/25 px-4 py-2 text-center text-sm font-semibold text-white transition hover:border-yellow-300 hover:text-yellow-200"
            >
              Back to landing page
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

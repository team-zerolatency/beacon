"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  startTransition,
} from "react";
import {
  Activity,
  Loader2,
  Map as MapIcon,
  Radio,
  ShieldCheck,
  Siren,
  Workflow,
} from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import type {
  HelpRequestRow,
  HelpStatus,
  MapLocationRow,
} from "@/lib/types/help";

const MeshMap = dynamic(() => import("./mesh-map").then((m) => m.MeshMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-75 items-center justify-center rounded-xl border border-white/10 bg-slate-900/50 text-sm text-slate-400 sm:h-105 lg:h-[min(480px,70vh)]">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
      Loading mesh map…
    </div>
  ),
});

const statusOptions: { value: HelpStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
  { value: "cancelled", label: "Cancelled" },
];

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

export function NgoDashboard() {
  const [tab, setTab] = useState<"map" | "help">("help");
  const [helpFilter, setHelpFilter] = useState<"all" | HelpStatus>("all");
  const [mapLocations, setMapLocations] = useState<MapLocationRow[]>([]);
  const [helpRequests, setHelpRequests] = useState<HelpRequestRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const requestCounts = useMemo(() => {
    return helpRequests.reduce(
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
      } as Record<"all" | HelpStatus, number>,
    );
  }, [helpRequests]);

  const visibleHelpRequests = useMemo(() => {
    if (helpFilter === "all") {
      return helpRequests;
    }
    return helpRequests.filter((request) => request.status === helpFilter);
  }, [helpFilter, helpRequests]);

  const loadData = useCallback(async () => {
    setLoadError(null);
    const [locRes, helpRes] = await Promise.all([
      supabase.from("ngo_locations_india").select("*").order("name"),
      supabase
        .from("help_requests")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);

    if (locRes.error) {
      setLoadError(locRes.error.message);
    } else {
      setMapLocations(
        (
          (locRes.data ?? []) as Array<{
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
    }

    if (helpRes.error) {
      setLoadError(helpRes.error.message);
    } else {
      setHelpRequests((helpRes.data ?? []) as HelpRequestRow[]);
    }
  }, []);

  useEffect(() => {
    startTransition(() => {
      void loadData();
    });
  }, [loadData]);

  useEffect(() => {
    let channel: RealtimeChannel | null = null;

    async function subscribe() {
      channel = supabase
        .channel("help_requests_mesh")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "help_requests",
          },
          () => {
            // Refetch to keep ordering and derived fields consistent.
            void loadData();
          },
        )
        .subscribe();
    }

    void subscribe();

    return () => {
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [loadData]);

  async function updateStatus(id: string, status: HelpStatus) {
    setUpdatingId(id);
    const { error } = await supabase
      .from("help_requests")
      .update({ status })
      .eq("id", id);

    setUpdatingId(null);
    if (error) {
      setLoadError(error.message);
      return;
    }
    setHelpRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status } : r)),
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 lg:grid-cols-4">
        <button
          type="button"
          onClick={() => {
            setTab("help");
            setHelpFilter("open");
          }}
          className={`rounded-xl border p-5 text-left transition ${
            tab === "help" && helpFilter === "open"
              ? "border-amber-300/60 bg-linear-to-br from-amber-400/20 via-amber-500/15 to-slate-900/80"
              : "border-white/10 bg-slate-900/70 hover:border-amber-300/40"
          }`}
        >
          <Siren className="h-5 w-5 text-amber-300" aria-hidden="true" />
          <p className="mt-3 text-xl font-bold text-white sm:text-2xl">
            {requestCounts.open}
          </p>
          <p className="text-sm text-slate-300">Open SOS</p>
        </button>

        <button
          type="button"
          onClick={() => {
            setTab("help");
            setHelpFilter("in_progress");
          }}
          className={`rounded-xl border p-5 text-left transition ${
            tab === "help" && helpFilter === "in_progress"
              ? "border-sky-300/60 bg-linear-to-br from-sky-400/20 via-sky-500/15 to-slate-900/80"
              : "border-white/10 bg-slate-900/70 hover:border-sky-300/40"
          }`}
        >
          <Workflow className="h-5 w-5 text-sky-300" aria-hidden="true" />
          <p className="mt-3 text-xl font-bold text-white sm:text-2xl">
            {requestCounts.in_progress}
          </p>
          <p className="text-sm text-slate-300">In Progress</p>
        </button>

        <button
          type="button"
          onClick={() => {
            setTab("help");
            setHelpFilter("resolved");
          }}
          className={`rounded-xl border p-5 text-left transition ${
            tab === "help" && helpFilter === "resolved"
              ? "border-emerald-300/60 bg-linear-to-br from-emerald-400/20 via-emerald-500/15 to-slate-900/80"
              : "border-white/10 bg-slate-900/70 hover:border-emerald-300/40"
          }`}
        >
          <ShieldCheck
            className="h-5 w-5 text-emerald-300"
            aria-hidden="true"
          />
          <p className="mt-3 text-xl font-bold text-white sm:text-2xl">
            {requestCounts.resolved}
          </p>
          <p className="text-sm text-slate-300">Resolved Cases</p>
        </button>

        <button
          type="button"
          onClick={() => {
            setTab("map");
            setHelpFilter("all");
          }}
          className={`rounded-xl border p-5 text-left transition ${
            tab === "map"
              ? "border-orange-300/60 bg-linear-to-br from-orange-400/20 via-orange-500/15 to-slate-900/80"
              : "border-white/10 bg-slate-900/70 hover:border-orange-300/40"
          }`}
        >
          <Activity className="h-5 w-5 text-orange-300" aria-hidden="true" />
          <p className="mt-3 text-xl font-bold text-white sm:text-2xl">
            {mapLocations.length}
          </p>
          <p className="text-sm text-slate-300">Coverage Points</p>
        </button>
      </section>

      <div className="flex gap-2 overflow-x-auto border-b border-white/10 pb-3">
        <button
          type="button"
          onClick={() => {
            setTab("map");
            setHelpFilter("all");
          }}
          className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
            tab === "map"
              ? "bg-orange-500 text-white"
              : "border border-white/20 text-slate-300 hover:border-yellow-300/60 hover:text-white"
          }`}
        >
          <MapIcon className="h-4 w-4" aria-hidden />
          Mesh network map
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("help");
            setHelpFilter("all");
          }}
          className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
            tab === "help"
              ? "bg-orange-500 text-white"
              : "border border-white/20 text-slate-300 hover:border-yellow-300/60 hover:text-white"
          }`}
        >
          <Radio className="h-4 w-4" aria-hidden />
          Live help requests
        </button>
      </div>

      {loadError ? (
        <p className="rounded-lg border border-red-400/35 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {loadError}
        </p>
      ) : null}

      {tab === "map" ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">
            NGOs &amp; helping points
          </h2>
          <p className="mb-4 max-w-3xl text-sm text-slate-400">
            OpenStreetMap view: partner NGOs and fixed helping points (blue /
            green). Orange markers show active client help requests with
            location.
          </p>
          <MeshMap mapLocations={mapLocations} helpRequests={helpRequests} />
        </section>
      ) : (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">
            Realtime help from clients
          </h2>
          <p className="mb-4 max-w-3xl text-sm text-slate-400">
            Updates when clients submit new requests (enable Realtime on{" "}
            <code className="text-yellow-200/90">help_requests</code> in
            Supabase if needed). Set status as you coordinate response.
          </p>

          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {[
              { id: "all", label: "All" },
              { id: "open", label: "Open" },
              { id: "in_progress", label: "In progress" },
              { id: "resolved", label: "Resolved" },
              { id: "cancelled", label: "Cancelled" },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setHelpFilter(item.id as "all" | HelpStatus)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  helpFilter === item.id
                    ? "border-orange-300/60 bg-orange-500 text-white"
                    : "border-white/20 text-slate-300 hover:border-yellow-300/60 hover:text-white"
                }`}
              >
                {item.label} ({requestCounts[item.id as "all" | HelpStatus]})
              </button>
            ))}
          </div>

          {visibleHelpRequests.length === 0 ? (
            <p className="rounded-xl border border-white/10 bg-slate-900/50 px-4 py-8 text-center text-sm text-slate-400">
              No help requests in this tab yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {visibleHelpRequests.map((req) => (
                <li
                  key={req.id}
                  className="rounded-xl border border-white/10 bg-slate-900/60 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs text-slate-500">
                        {formatWhen(req.created_at)}
                      </p>
                      <p className="mt-1 font-semibold text-white">
                        {req.client_name?.trim() || "Client"}
                      </p>
                      <p className="mt-2 wrap-break-word text-sm text-slate-200">
                        {req.message}
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
                          Area: {req.detected_state ?? "-"} /{" "}
                          {req.detected_district ?? "-"} /{" "}
                          {req.detected_city ?? "-"}
                        </p>
                      ) : null}
                      <p className="mt-2 break-all font-mono text-xs text-slate-500">
                        {req.lat.toFixed(5)}, {req.lng.toFixed(5)}
                      </p>
                    </div>
                    <label className="flex w-full flex-col gap-1 text-xs text-slate-400 sm:w-auto sm:items-end">
                      Status
                      <select
                        value={req.status}
                        disabled={updatingId === req.id}
                        onChange={(e) =>
                          void updateStatus(
                            req.id,
                            e.target.value as HelpStatus,
                          )
                        }
                        className="w-full rounded-lg border border-white/20 bg-slate-950 px-2 py-1.5 text-sm text-white outline-none focus:border-orange-400 sm:w-auto"
                      >
                        {statusOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

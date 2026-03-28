"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { HelpRequestRow, MapLocationRow } from "@/lib/types/help";

function FitBounds({
  points,
}: {
  points: { lat: number; lng: number }[];
}) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) {
      return;
    }
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 10);
      return;
    }
    const bounds = L.latLngBounds(
      points.map((p) => [p.lat, p.lng] as [number, number]),
    );
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 8 });
  }, [map, points]);

  return null;
}

const defaultCenter: [number, number] = [22.5, 79.0];
const defaultZoom = 5;

type MeshMapProps = {
  mapLocations: MapLocationRow[];
  helpRequests: HelpRequestRow[];
};

export function MeshMap({ mapLocations, helpRequests }: MeshMapProps) {
  useEffect(() => {
    L.Icon.Default.mergeOptions({
      iconRetinaUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
      iconUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
      shadowUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
    });
  }, []);

  const activeHelp = useMemo(
    () =>
      helpRequests.filter(
        (h) => h.status === "open" || h.status === "in_progress",
      ),
    [helpRequests],
  );

  const boundsPoints = useMemo(() => {
    const list: { lat: number; lng: number }[] = [
      ...mapLocations.map((m) => ({ lat: m.lat, lng: m.lng })),
      ...activeHelp.map((h) => ({ lat: h.lat, lng: h.lng })),
    ];
    return list;
  }, [mapLocations, activeHelp]);

  return (
    <div className="relative z-0 h-75 w-full overflow-hidden rounded-xl border border-white/10 bg-slate-900/50 sm:h-105 lg:h-[min(560px,72vh)]">
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        className="h-full w-full"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {boundsPoints.length > 0 ? <FitBounds points={boundsPoints} /> : null}

        {mapLocations.map((loc) => (
          <CircleMarker
            key={loc.id}
            center={[loc.lat, loc.lng]}
            radius={loc.kind === "ngo" ? 10 : 8}
            pathOptions={{
              color: loc.kind === "ngo" ? "#38bdf8" : "#4ade80",
              fillColor: loc.kind === "ngo" ? "#0ea5e9" : "#22c55e",
              fillOpacity: 0.85,
            }}
          >
            <Popup>
              <div className="text-slate-900">
                <p className="font-semibold">{loc.name}</p>
                <p className="text-xs uppercase text-slate-600">
                  {loc.kind === "ngo" ? "NGO" : "Helping point"}
                </p>
                {loc.notes ? (
                  <p className="mt-1 text-sm text-slate-700">{loc.notes}</p>
                ) : null}
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {activeHelp.map((req) => (
          <CircleMarker
            key={req.id}
            center={[req.lat, req.lng]}
            radius={12}
            pathOptions={{
              color: "#fb923c",
              fillColor: "#f97316",
              fillOpacity: 0.95,
            }}
          >
            <Popup>
              <div className="max-w-xs text-slate-900">
                <p className="text-xs font-semibold uppercase text-orange-700">
                  Help needed · {req.status.replace("_", " ")}
                </p>
                <p className="mt-1 font-medium">
                  {req.client_name?.trim() || "Client"}
                </p>
                <p className="mt-1 text-sm text-slate-800">{req.message}</p>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
      <p className="pointer-events-none absolute bottom-2 left-2 rounded bg-slate-950/80 px-2 py-1 text-[10px] text-slate-400">
        OpenStreetMap · NGOs &amp; helping points (blue/green) · Active help
        requests (orange)
      </p>
    </div>
  );
}

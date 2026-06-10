"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface Incident {
  id: string;
  time: string;
  first_seen: string;
  title: string;
  summary: string;
  severity: string;
  source: string;
  source_type: string;
  url: string | null;
  location: string;
  lat: number;
  lng: number;
  confidence: number;
  cluster_id: string | null;
}

const COLORS: Record<string, string> = {
  calm: "#2ea89c",
  watch: "#c9a83a",
  elevated: "#d07a2e",
  high: "#c85030",
  critical: "#c42840",
};

function severityIcon(severity: string, isNew: boolean): L.DivIcon {
  const color = COLORS[severity] || "#4a6070";
  const pulse = isNew
    ? `<span class="pulse-ring" style="color:${color}"></span>`
    : "";
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:18px;height:18px;">
      <span style="display:block;width:18px;height:18px;border-radius:50%;
        background:${color};border:2px solid rgba(0,0,0,0.7);
        box-shadow:0 0 0 3px ${color}44,0 0 18px 6px ${color}66;"></span>
      ${pulse}
    </div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -12],
  });
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IE", {
      timeZone: "Europe/Dublin",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function MapController({
  focusTarget,
  hidden,
}: {
  focusTarget: { lat: number; lng: number } | null;
  hidden: boolean;
}) {
  const map = useMap();
  useEffect(() => {
    if (focusTarget) {
      map.flyTo([focusTarget.lat, focusTarget.lng], 14, { duration: 1.2 });
    }
  }, [focusTarget, map]);
  // Invalidate size when the container becomes visible again (mobile tab switch)
  useEffect(() => {
    if (!hidden) {
      const t = setTimeout(() => map.invalidateSize(), 50);
      return () => clearTimeout(t);
    }
  }, [hidden, map]);
  return null;
}

interface Props {
  incidents: Incident[];
  newIds?: Set<string>;
  focusTarget?: { lat: number; lng: number } | null;
  hidden?: boolean;
}

export default function UnrestMap({ incidents, newIds, focusTarget, hidden = false }: Props) {
  return (
    <MapContainer
      center={[54.7, -6.6]}
      zoom={8}
      style={{ height: "100%", width: "100%" }}
      zoomControl={true}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        subdomains="abcd"
        maxZoom={19}
      />
      <MapController focusTarget={focusTarget ?? null} hidden={hidden} />
      <MarkerClusterGroup chunkedLoading showCoverageOnHover={false}>
        {incidents.map((inc) => (
          <Marker
            key={inc.id}
            position={[inc.lat, inc.lng]}
            icon={severityIcon(inc.severity, newIds?.has(inc.id) ?? false)}
          >
            <Popup minWidth={220} maxWidth={300}>
              <div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 13,
                    marginBottom: 4,
                    color: "#b8ccd8",
                    fontFamily: "'Share Tech Mono', 'Courier New', monospace",
                  }}
                >
                  {inc.title}
                </div>
                <div style={{ marginBottom: 4 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: COLORS[inc.severity],
                      background: `${COLORS[inc.severity]}22`,
                      padding: "1px 6px",
                      borderRadius: 2,
                      marginRight: 6,
                      fontFamily: "'Share Tech Mono', 'Courier New', monospace",
                      letterSpacing: 1,
                    }}
                  >
                    {inc.severity.toUpperCase()}
                  </span>
                  <span style={{ fontSize: 11, color: "#4a6070" }}>{inc.location}</span>
                </div>
                <div style={{ fontSize: 11, color: "#b8ccd8", lineHeight: 1.6, marginBottom: 6 }}>
                  {inc.summary}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "#4a6070",
                    marginBottom: 6,
                    fontFamily: "'Share Tech Mono', 'Courier New', monospace",
                  }}
                >
                  {inc.source} · {formatTime(inc.time)}
                </div>
                {inc.url && (
                  <a
                    href={inc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 11,
                      color: "#2e6ec0",
                      fontFamily: "'Share Tech Mono', 'Courier New', monospace",
                      letterSpacing: 0.5,
                    }}
                  >
                    ↗ SOURCE
                  </a>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  );
}

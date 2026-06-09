"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
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
  calm: "#3fb6a8",
  watch: "#d8b34a",
  elevated: "#e08a3c",
  high: "#d8633f",
  critical: "#cf3a4e",
};

function severityIcon(severity: string): L.DivIcon {
  const color = COLORS[severity] || "#6b7f94";
  return L.divIcon({
    className: "",
    html: `<span style="
      display:block;width:18px;height:18px;border-radius:50%;
      background:${color};border:2px solid rgba(0,0,0,0.6);
      box-shadow:0 0 0 2px ${color}44, 0 0 14px 4px ${color}66;
      "></span>`,
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

interface Props {
  incidents: Incident[];
}

export default function UnrestMap({ incidents }: Props) {
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
      <MarkerClusterGroup chunkedLoading showCoverageOnHover={false}>
        {incidents.map((inc) => (
          <Marker
            key={inc.id}
            position={[inc.lat, inc.lng]}
            icon={severityIcon(inc.severity)}
          >
            <Popup minWidth={220} maxWidth={300}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color: "#c9d6e3" }}>
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
                      borderRadius: 3,
                      marginRight: 6,
                    }}
                  >
                    {inc.severity.toUpperCase()}
                  </span>
                  <span style={{ fontSize: 11, color: "#6b7f94" }}>{inc.location}</span>
                </div>
                <div style={{ fontSize: 11, color: "#c9d6e3", lineHeight: 1.5, marginBottom: 6 }}>
                  {inc.summary}
                </div>
                <div style={{ fontSize: 10, color: "#6b7f94", marginBottom: 4 }}>
                  {inc.source} · {formatTime(inc.time)}
                </div>
                {inc.url && (
                  <a
                    href={inc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 11, color: "#3b7dd8" }}
                  >
                    Source ↗
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

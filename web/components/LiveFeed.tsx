"use client";

import { useEffect, useRef, useState } from "react";
import type { Incident } from "./UnrestMap";

const COLORS: Record<string, string> = {
  calm: "#3fb6a8",
  watch: "#d8b34a",
  elevated: "#e08a3c",
  high: "#d8633f",
  critical: "#cf3a4e",
};

const API_BASE = "/api";

interface Props {
  onNewIncident: (incident: Incident) => void;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-IE", {
      timeZone: "Europe/Dublin",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "??:??";
  }
}

export default function LiveFeed({ onNewIncident }: Props) {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [connected, setConnected] = useState(false);
  const seenIds = useRef<Set<string>>(new Set());

  const addIncident = (inc: Incident) => {
    if (seenIds.current.has(inc.id)) return;
    seenIds.current.add(inc.id);
    setIncidents((prev) => [inc, ...prev].slice(0, 100));
  };

  // Pre-populate from REST on mount
  useEffect(() => {
    fetch(`${API_BASE}/incidents?limit=50`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: Incident[]) => {
        // Add oldest-first so newest ends up at top after reverse
        [...data].reverse().forEach(addIncident);
      })
      .catch(() => {});
  }, []);

  // SSE for live updates
  useEffect(() => {
    const es = new EventSource(`${API_BASE}/stream`);

    es.addEventListener("ping", () => setConnected(true));

    es.addEventListener("incident", (e) => {
      try {
        const inc: Incident = JSON.parse(e.data);
        addIncident(inc);
        onNewIncident(inc);
      } catch {}
    });

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    return () => es.close();
  }, [onNewIncident]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          padding: "8px 10px",
          borderBottom: "1px solid #1e2a38",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: connected ? "#3fb6a8" : "#6b7f94",
            boxShadow: connected ? "0 0 6px #3fb6a8" : "none",
            transition: "all 0.3s",
          }}
        />
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "#6b7f94" }}>
          LIVE FEED
        </span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "#6b7f94" }}>
          {incidents.length} events
        </span>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {incidents.length === 0 ? (
          <div style={{ padding: 12, color: "#6b7f94", fontSize: 11 }}>
            Loading events…
          </div>
        ) : (
          incidents.map((inc) => (
            <div
              key={inc.id}
              style={{
                padding: "8px 10px",
                borderBottom: "1px solid #1e2a38",
                borderLeft: `3px solid ${COLORS[inc.severity] || "#6b7f94"}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: COLORS[inc.severity],
                    background: `${COLORS[inc.severity]}22`,
                    padding: "1px 5px",
                    borderRadius: 3,
                    letterSpacing: 0.5,
                  }}
                >
                  {inc.severity.toUpperCase()}
                </span>
                <span style={{ fontSize: 10, color: "#6b7f94", marginLeft: "auto" }}>
                  {formatTime(inc.time)}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "#c9d6e3", fontWeight: 600, lineHeight: 1.4 }}>
                {inc.title}
              </div>
              <div style={{ fontSize: 10, color: "#6b7f94", marginTop: 2 }}>
                {inc.location} · {inc.source}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

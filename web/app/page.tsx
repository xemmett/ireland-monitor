"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import BriefPanel from "@/components/BriefPanel";
import LiveFeed from "@/components/LiveFeed";
import SourceStatus from "@/components/SourceStatus";
import ThreatMeter, { type Severity } from "@/components/ThreatMeter";
import type { Incident } from "@/components/UnrestMap";

const UnrestMap = dynamic(() => import("@/components/UnrestMap"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0d1117",
        color: "#6b7f94",
        fontSize: 13,
      }}
    >
      Loading map…
    </div>
  ),
});

const API_BASE = "/api";
const SEVERITY_ORDER: Severity[] = ["calm", "watch", "elevated", "high", "critical"];

function getMaxSeverity(incidents: Incident[]): Severity {
  if (incidents.length === 0) return "calm";
  let maxIdx = 0;
  for (const inc of incidents) {
    const idx = SEVERITY_ORDER.indexOf(inc.severity as Severity);
    if (idx > maxIdx) maxIdx = idx;
  }
  return SEVERITY_ORDER[maxIdx];
}

function IrishClock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const tick = () => {
      setTime(
        new Date().toLocaleTimeString("en-IE", {
          timeZone: "Europe/Dublin",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{ fontSize: 11, color: "#6b7f94", fontVariantNumeric: "tabular-nums" }}>
      <span style={{ fontSize: 9, marginRight: 4, letterSpacing: 0.5 }}>IST</span>
      {time}
    </div>
  );
}

export default function Dashboard() {
  const [incidents, setIncidents] = useState<Incident[]>([]);

  // Initial load
  useEffect(() => {
    fetch(`${API_BASE}/incidents?limit=200`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: Incident[]) => setIncidents(data))
      .catch(() => {});
  }, []);

  const onNewIncident = useCallback((inc: Incident) => {
    setIncidents((prev) => {
      const exists = prev.some((p) => p.id === inc.id);
      if (exists) return prev;
      return [inc, ...prev];
    });
  }, []);

  const maxSeverity = getMaxSeverity(incidents);

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#0b0f14",
        overflow: "hidden",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          height: 44,
          background: "#141a22",
          borderBottom: "1px solid #1e2a38",
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          gap: 16,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 8 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#cf3a4e",
              boxShadow: "0 0 8px #cf3a4e",
            }}
          />
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: "#c9d6e3" }}>
            NI UNREST MONITOR
          </span>
        </div>

        <ThreatMeter maxSeverity={maxSeverity} />

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 10, color: "#6b7f94" }}>
            {incidents.length} incident{incidents.length !== 1 ? "s" : ""}
          </span>
          <IrishClock />
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left: Brief */}
        <div
          style={{
            width: 260,
            flexShrink: 0,
            background: "#141a22",
            borderRight: "1px solid #1e2a38",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <BriefPanel />
        </div>

        {/* Center: Map */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          <UnrestMap incidents={incidents} />
        </div>

        {/* Right: Feed + Sources */}
        <div
          style={{
            width: 260,
            flexShrink: 0,
            background: "#141a22",
            borderLeft: "1px solid #1e2a38",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <LiveFeed onNewIncident={onNewIncident} />
          </div>
          <div
            style={{
              flexShrink: 0,
              borderTop: "1px solid #1e2a38",
              padding: "8px 10px",
            }}
          >
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 1,
                color: "#6b7f94",
                marginBottom: 6,
              }}
            >
              SOURCES
            </div>
            <SourceStatus />
          </div>
        </div>
      </div>
    </div>
  );
}

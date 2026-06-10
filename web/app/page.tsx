"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import BriefPanel from "@/components/BriefPanel";
import LiveFeed from "@/components/LiveFeed";
import LiveStreams from "@/components/LiveStreams";
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
        background: "#080c10",
        color: "#4a6070",
        fontSize: 13,
        fontFamily: "'Share Tech Mono', 'Courier New', monospace",
        letterSpacing: 1,
      }}
    >
      LOADING MAP…
    </div>
  ),
});

const API_BASE = "/api";
const SEVERITY_ORDER: Severity[] = ["calm", "watch", "elevated", "high", "critical"];
const MONO = "'Share Tech Mono', 'Courier New', monospace";

const NI_KEYWORDS = [
  "belfast", "derry", "londonderry", "antrim", "armagh", "fermanagh", "tyrone",
  "newry", "lisburn", "omagh", "enniskillen", "ballymena", "coleraine", "bangor",
  "newtownards", "larne", "craigavon", "lurgan", "portadown", "strabane",
  "north ireland", "northern ireland", "ni ", ", ni", "county down", "county antrim",
  "county armagh", "county tyrone", "county fermanagh",
];

function isNI(inc: Incident): boolean {
  const loc = inc.location.toLowerCase();
  return NI_KEYWORDS.some((kw) => loc.includes(kw));
}

function getMaxSeverity(incidents: Incident[]): Severity {
  if (incidents.length === 0) return "calm";
  let maxIdx = 0;
  for (const inc of incidents) {
    const idx = SEVERITY_ORDER.indexOf(inc.severity as Severity);
    if (idx > maxIdx) maxIdx = idx;
  }
  return SEVERITY_ORDER[maxIdx];
}

function useMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return mobile;
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
    <div
      style={{
        fontSize: 12,
        color: "#4a6070",
        fontVariantNumeric: "tabular-nums",
        fontFamily: MONO,
        letterSpacing: 1,
      }}
    >
      <span style={{ fontSize: 9, marginRight: 4, color: "#2ea89c" }}>IST</span>
      {time}
    </div>
  );
}

type MobileTab = "map" | "brief" | "feed" | "live";

export default function Dashboard() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [focusTarget, setFocusTarget] = useState<{ lat: number; lng: number } | null>(null);
  const [activeTab, setActiveTab] = useState<MobileTab>("map");
  const [rightTab, setRightTab] = useState<"feed" | "live">("feed");
  const mobile = useMobile();

  useEffect(() => {
    fetch(`${API_BASE}/incidents?limit=200`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Incident[]) => setIncidents(data.filter(isNI)))
      .catch(() => {});
  }, []);

  const onNewIncident = useCallback((inc: Incident) => {
    if (!isNI(inc)) return;
    setIncidents((prev) => {
      if (prev.some((p) => p.id === inc.id)) return prev;
      return [inc, ...prev];
    });
    setNewIds((prev) => new Set(prev).add(inc.id));
    setTimeout(() => {
      setNewIds((prev) => { const n = new Set(prev); n.delete(inc.id); return n; });
    }, 30_000);
  }, []);

  const onFocusIncident = useCallback((inc: Incident) => {
    setFocusTarget({ lat: inc.lat, lng: inc.lng });
    if (mobile) setActiveTab("map");
  }, [mobile]);

  const maxSeverity = getMaxSeverity(incidents);

  const topBar = (
    <div
      style={{
        height: 44,
        background: "#0d1219",
        borderBottom: "1px solid #1a2535",
        display: "flex",
        alignItems: "center",
        padding: "0 12px",
        gap: 12,
        flexShrink: 0,
        boxShadow: "0 1px 0 #1e3a4a",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <div
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "#c42840",
            boxShadow: "0 0 10px #c42840, 0 0 20px #c4284066",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: mobile ? 11 : 12,
            fontWeight: 700,
            letterSpacing: mobile ? 1 : 2,
            color: "#b8ccd8",
            fontFamily: MONO,
            whiteSpace: "nowrap",
          }}
        >
          NI UNREST MONITOR
        </span>
      </div>

      <ThreatMeter maxSeverity={maxSeverity} />

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
        {!mobile && (
          <span style={{ fontSize: 10, color: "#4a6070", fontFamily: MONO, letterSpacing: 1 }}>
            {incidents.length} EVENTS
          </span>
        )}
        <IrishClock />
      </div>
    </div>
  );

  if (mobile) {
    return (
      <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "#080c10", overflow: "hidden" }}>
        {topBar}

        {/* Content area — keep map always mounted to avoid re-init */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          {/* Map — always mounted, hidden when inactive */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              visibility: activeTab === "map" ? "visible" : "hidden",
              pointerEvents: activeTab === "map" ? "auto" : "none",
            }}
          >
            <UnrestMap
              incidents={incidents}
              newIds={newIds}
              focusTarget={focusTarget}
              hidden={activeTab !== "map"}
            />
          </div>

          {/* Brief */}
          {activeTab === "brief" && (
            <div style={{ position: "absolute", inset: 0, background: "#0d1219", overflowY: "auto" }}>
              <BriefPanel />
            </div>
          )}

          {/* Feed */}
          {activeTab === "feed" && (
            <div style={{ position: "absolute", inset: 0, background: "#0d1219", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <LiveFeed onNewIncident={onNewIncident} filterFn={isNI} onFocusIncident={onFocusIncident} />
              </div>
              <div style={{ flexShrink: 0, borderTop: "1px solid #1a2535", padding: "8px 10px" }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: "#4a6070", marginBottom: 6, fontFamily: MONO }}>
                  // SOURCES
                </div>
                <SourceStatus />
              </div>
            </div>
          )}

          {/* Live */}
          {activeTab === "live" && (
            <div style={{ position: "absolute", inset: 0, background: "#0d1219", overflowY: "auto" }}>
              <LiveStreams />
            </div>
          )}
        </div>

        {/* Bottom tab bar */}
        <div
          style={{
            height: 52,
            background: "#0d1219",
            borderTop: "1px solid #1a2535",
            display: "flex",
            flexShrink: 0,
          }}
        >
          {(["map", "brief", "feed", "live"] as MobileTab[]).map((tab) => {
            const labels: Record<MobileTab, string> = { map: "MAP", brief: "SITREP", feed: "FEED", live: "LIVE" };
            const icons: Record<MobileTab, string> = { map: "⊕", brief: "//", feed: ">_", live: "▶" };
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  background: "transparent",
                  border: "none",
                  borderTop: active ? "2px solid #2ea89c" : "2px solid transparent",
                  borderRadius: 0,
                  padding: 0,
                  cursor: "pointer",
                  fontFamily: MONO,
                  transition: "border-color 0.15s",
                }}
              >
                <span style={{ fontSize: 14, color: active ? "#2ea89c" : "#4a6070", lineHeight: 1 }}>
                  {icons[tab]}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    letterSpacing: 1.5,
                    color: active ? "#b8ccd8" : "#4a6070",
                    fontFamily: MONO,
                  }}
                >
                  {labels[tab]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Desktop layout
  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#080c10",
        overflow: "hidden",
      }}
    >
      {topBar}

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left: Brief */}
        <div
          style={{
            width: 268,
            flexShrink: 0,
            background: "#0d1219",
            borderRight: "1px solid #1a2535",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            boxShadow: "1px 0 0 #1e3a4a",
          }}
        >
          <BriefPanel />
        </div>

        {/* Center: Map */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          <UnrestMap incidents={incidents} newIds={newIds} focusTarget={focusTarget} />
        </div>

        {/* Right: Feed + Sources */}
        <div
          style={{
            width: 268,
            flexShrink: 0,
            background: "#0d1219",
            borderLeft: "1px solid #1a2535",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            boxShadow: "-1px 0 0 #1e3a4a",
          }}
        >
          {/* Tab switcher: Feed / Live */}
          <div style={{ display: "flex", borderBottom: "1px solid #1a2535", flexShrink: 0, background: "#080e14" }}>
            {(["feed", "live"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setRightTab(tab)}
                style={{
                  flex: 1,
                  padding: "6px 0",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 2,
                  fontFamily: MONO,
                  border: "none",
                  borderBottom: rightTab === tab ? "2px solid #2ea89c" : "2px solid transparent",
                  background: "transparent",
                  color: rightTab === tab ? "#b8ccd8" : "#4a6070",
                  cursor: "pointer",
                }}
              >
                {tab === "feed" ? ">_ FEED" : "▶ LIVE"}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {rightTab === "feed" ? (
              <LiveFeed onNewIncident={onNewIncident} filterFn={isNI} onFocusIncident={onFocusIncident} />
            ) : (
              <LiveStreams />
            )}
          </div>
          <div
            style={{
              flexShrink: 0,
              borderTop: "1px solid #1a2535",
              padding: "8px 10px",
            }}
          >
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 2,
                color: "#4a6070",
                marginBottom: 6,
                fontFamily: MONO,
              }}
            >
              // SOURCES
            </div>
            <SourceStatus />
          </div>
        </div>
      </div>
    </div>
  );
}

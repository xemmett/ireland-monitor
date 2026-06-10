"use client";

import { useEffect, useRef, useState } from "react";
import type { Incident } from "./UnrestMap";

const COLORS: Record<string, string> = {
  calm: "#2ea89c",
  watch: "#c9a83a",
  elevated: "#d07a2e",
  high: "#c85030",
  critical: "#c42840",
};

const MONO = "'Share Tech Mono', 'Courier New', monospace";
const API_BASE = "/api";

interface Props {
  onNewIncident: (incident: Incident) => void;
  filterFn?: (incident: Incident) => boolean;
  onFocusIncident?: (inc: Incident) => void;
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

export default function LiveFeed({ onNewIncident, filterFn, onFocusIncident }: Props) {
  const [incidents, setIncidents] = useState<{ inc: Incident; isNew: boolean }[]>([]);
  const [connected, setConnected] = useState(false);
  const seenIds = useRef<Set<string>>(new Set());

  const addIncident = (inc: Incident, isNew: boolean) => {
    if (filterFn && !filterFn(inc)) return;
    if (seenIds.current.has(inc.id)) return;
    seenIds.current.add(inc.id);
    setIncidents((prev) => [{ inc, isNew }, ...prev].slice(0, 100));
    if (isNew) {
      setTimeout(() => {
        setIncidents((prev) =>
          prev.map((item) =>
            item.inc.id === inc.id ? { ...item, isNew: false } : item
          )
        );
      }, 1500);
    }
  };

  // Pre-populate from REST on mount
  useEffect(() => {
    fetch(`${API_BASE}/incidents?limit=50`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Incident[]) => {
        [...data].reverse().forEach((inc) => addIncident(inc, false));
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
        addIncident(inc, true);
        onNewIncident(inc);
      } catch {}
    });
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, [onNewIncident]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div
        style={{
          padding: "8px 10px",
          borderBottom: "1px solid #1a2535",
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "#080e14",
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: connected ? "#2ea89c" : "#4a6070",
            boxShadow: connected ? "0 0 8px #2ea89c" : "none",
            transition: "all 0.3s",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 2,
            color: "#4a6070",
            fontFamily: MONO,
          }}
        >
          &gt;_ LIVE FEED
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 10,
            color: "#4a6070",
            fontFamily: MONO,
          }}
        >
          {incidents.length}
        </span>
      </div>

      {/* Items */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {incidents.length === 0 ? (
          <div
            style={{
              padding: 12,
              color: "#4a6070",
              fontSize: 11,
              fontFamily: MONO,
            }}
          >
            LOADING EVENTS…
          </div>
        ) : (
          incidents.map(({ inc, isNew }) => (
            <div
              key={inc.id}
              className={isNew ? "feed-new" : undefined}
              style={{
                padding: "8px 10px",
                borderBottom: "1px solid #1a2535",
                borderLeft: `2px solid ${COLORS[inc.severity] || "#4a6070"}`,
              }}
            >
              {/* Severity + time row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  marginBottom: 3,
                }}
              >
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: COLORS[inc.severity],
                    background: `${COLORS[inc.severity]}18`,
                    padding: "1px 5px",
                    borderRadius: 2,
                    letterSpacing: 1,
                    fontFamily: MONO,
                  }}
                >
                  {inc.severity.toUpperCase()}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: "#4a6070",
                    marginLeft: "auto",
                    fontFamily: MONO,
                  }}
                >
                  [{formatTime(inc.time)}]
                </span>
              </div>

              {/* Title */}
              <div
                style={{
                  fontSize: 11,
                  color: "#b8ccd8",
                  fontWeight: 600,
                  lineHeight: 1.45,
                  marginBottom: 3,
                }}
              >
                {inc.title}
              </div>

              {/* Location · source name */}
              <div
                style={{
                  fontSize: 10,
                  color: "#4a6070",
                  fontFamily: MONO,
                  marginBottom: 5,
                }}
              >
                {inc.location} · {inc.source}
              </div>

              {/* Action row: MAP + SOURCE */}
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {onFocusIncident && (
                  <button
                    onClick={() => onFocusIncident(inc)}
                    style={{
                      fontSize: 9,
                      padding: "2px 6px",
                      letterSpacing: 1,
                      fontFamily: MONO,
                      border: "1px solid #1a2535",
                      borderRadius: 2,
                      background: "transparent",
                      color: "#4a6070",
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.color = "#2ea89c";
                      (e.currentTarget as HTMLButtonElement).style.borderColor = "#2ea89c44";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.color = "#4a6070";
                      (e.currentTarget as HTMLButtonElement).style.borderColor = "#1a2535";
                    }}
                  >
                    ⊕ MAP
                  </button>
                )}
                {inc.url && (
                  <a
                    href={inc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 9,
                      padding: "2px 6px",
                      letterSpacing: 1,
                      fontFamily: MONO,
                      border: "1px solid #1a2535",
                      borderRadius: 2,
                      color: "#4a6070",
                      textDecoration: "none",
                      lineHeight: "1.6",
                      display: "inline-block",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLAnchorElement).style.color = "#2e6ec0";
                      (e.currentTarget as HTMLAnchorElement).style.borderColor = "#2e6ec044";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLAnchorElement).style.color = "#4a6070";
                      (e.currentTarget as HTMLAnchorElement).style.borderColor = "#1a2535";
                    }}
                  >
                    ↗ SOURCE
                  </a>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

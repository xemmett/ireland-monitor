"use client";

import { useEffect, useRef, useState } from "react";

const API_BASE = "/api";

const COLORS: Record<string, string> = {
  calm: "#2ea89c",
  watch: "#c9a83a",
  elevated: "#d07a2e",
  high: "#c85030",
  critical: "#c42840",
};

const MONO = "'Share Tech Mono', 'Courier New', monospace";

export type BriefRegion = "all" | "ni" | "roi";

interface Brief {
  situation: string;
  hotspots: { location: string; summary: string; severity: string; region?: "NI" | "ROI" }[];
  escalation_outlook: string;
  monitoring_priorities: string[];
  generated_at: string | null;
  incident_count: number;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

export default function BriefPanel({ region = "all" }: { region?: BriefRegion }) {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchBrief = async () => {
    try {
      const res = await fetch(`${API_BASE}/brief?region=${region}`);
      if (res.ok) setBrief(await res.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    fetchBrief();
    intervalRef.current = setInterval(fetchBrief, 5 * 60 * 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [region]);

  // Live updates — worker pushes a fresh {all,ni,roi} brief whenever new incidents land
  useEffect(() => {
    const es = new EventSource(`${API_BASE}/stream`);
    es.addEventListener("brief", (e) => {
      try {
        const data = JSON.parse(e.data);
        setBrief(data[region] ?? data);
        setLoading(false);
      } catch {}
    });
    return () => es.close();
  }, [region]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div
        style={{
          padding: "8px 10px",
          borderBottom: "1px solid #1a2535",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
          background: "#080e14",
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 2,
            color: "#4a6070",
            fontFamily: MONO,
          }}
        >
          &gt;&gt; SITREP
        </span>
        {brief?.generated_at && (
          <span style={{ fontSize: 10, color: "#4a6070", fontFamily: MONO }}>
            [{timeAgo(brief.generated_at)}]
          </span>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 10px 10px 10px" }}>
        {loading && (
          <div style={{ color: "#4a6070", fontSize: 11, fontFamily: MONO }}>
            LOADING…
          </div>
        )}

        {!loading && !brief && (
          <div style={{ color: "#4a6070", fontSize: 11, fontFamily: MONO, lineHeight: 1.7 }}>
            Brief will appear after the first scrape cycle.
          </div>
        )}

        {brief && (
          <>
            {brief.incident_count > 0 && (
              <div
                style={{
                  fontSize: 10,
                  color: "#4a6070",
                  marginBottom: 12,
                  fontFamily: MONO,
                }}
              >
                [{brief.incident_count} EVENTS · 24H WINDOW]
              </div>
            )}

            <Section label="SITUATION">
              <p
                style={{
                  fontSize: 11,
                  lineHeight: 1.75,
                  color: "#9ab0be",
                  fontFamily: MONO,
                }}
              >
                {brief.situation}
              </p>
            </Section>

            {brief.hotspots?.length > 0 && (
              <Section label="HOTSPOTS">
                {brief.hotspots.map((h, i) => (
                  <div
                    key={i}
                    style={{
                      marginBottom: 10,
                      paddingLeft: 8,
                      borderLeft: `2px solid ${COLORS[h.severity] || "#1a2535"}`,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: COLORS[h.severity] || "#b8ccd8",
                        marginBottom: 3,
                        fontFamily: MONO,
                        letterSpacing: 0.5,
                      }}
                    >
                      ▶ {h.location.toUpperCase()}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "#9ab0be",
                        lineHeight: 1.65,
                        fontFamily: MONO,
                      }}
                    >
                      {h.summary}
                    </div>
                  </div>
                ))}
              </Section>
            )}

            <Section label="OUTLOOK">
              <p
                style={{
                  fontSize: 11,
                  lineHeight: 1.75,
                  color: "#9ab0be",
                  fontFamily: MONO,
                }}
              >
                {brief.escalation_outlook}
              </p>
            </Section>

            {brief.monitoring_priorities?.length > 0 && (
              <Section label="PRIORITIES">
                <ul style={{ paddingLeft: 0, listStyle: "none" }}>
                  {brief.monitoring_priorities.map((p, i) => (
                    <li
                      key={i}
                      style={{
                        fontSize: 11,
                        color: "#9ab0be",
                        marginBottom: 4,
                        fontFamily: MONO,
                        lineHeight: 1.6,
                        paddingLeft: 12,
                        position: "relative",
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          left: 0,
                          color: "#2ea89c",
                        }}
                      >
                        &gt;
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 2,
          color: "#4a6070",
          marginBottom: 6,
          fontFamily: "'Share Tech Mono', 'Courier New', monospace",
          borderBottom: "1px solid #1a2535",
          paddingBottom: 4,
        }}
      >
        // {label}
      </div>
      {children}
    </div>
  );
}

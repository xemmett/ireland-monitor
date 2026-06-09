"use client";

import { useEffect, useRef, useState } from "react";

const API_BASE = "/api";

const COLORS: Record<string, string> = {
  calm: "#3fb6a8",
  watch: "#d8b34a",
  elevated: "#e08a3c",
  high: "#d8633f",
  critical: "#cf3a4e",
};

interface Brief {
  situation: string;
  hotspots: { location: string; summary: string; severity: string }[];
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

export default function BriefPanel() {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchBrief = async () => {
    try {
      const res = await fetch(`${API_BASE}/brief`);
      if (res.ok) setBrief(await res.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    fetchBrief();
    // Re-fetch every 5 minutes (brief regenerates each 12-min worker cycle)
    intervalRef.current = setInterval(fetchBrief, 5 * 60 * 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div
        style={{
          padding: "8px 10px",
          borderBottom: "1px solid #1e2a38",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "#6b7f94" }}>
            SITUATION REPORT
          </span>
        </div>
        {brief?.generated_at && (
          <span style={{ fontSize: 10, color: "#6b7f94" }}>{timeAgo(brief.generated_at)}</span>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px" }}>
        {loading && (
          <div style={{ color: "#6b7f94", fontSize: 11 }}>Loading…</div>
        )}

        {!loading && !brief && (
          <div style={{ color: "#6b7f94", fontSize: 11 }}>
            Brief will appear after the first scrape cycle.
          </div>
        )}

        {brief && (
          <>
            {brief.incident_count > 0 && (
              <div style={{ fontSize: 10, color: "#6b7f94", marginBottom: 10 }}>
                Based on {brief.incident_count} incident{brief.incident_count !== 1 ? "s" : ""} · 24h window
              </div>
            )}

            <Section label="SITUATION">
              <p style={{ fontSize: 12, lineHeight: 1.6, color: "#c9d6e3" }}>{brief.situation}</p>
            </Section>

            {brief.hotspots?.length > 0 && (
              <Section label="HOTSPOTS">
                {brief.hotspots.map((h, i) => (
                  <div
                    key={i}
                    style={{
                      marginBottom: 8,
                      paddingLeft: 8,
                      borderLeft: `2px solid ${COLORS[h.severity] || "#1e2a38"}`,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: COLORS[h.severity] || "#c9d6e3",
                        marginBottom: 2,
                      }}
                    >
                      {h.location}
                    </div>
                    <div style={{ fontSize: 11, color: "#c9d6e3", lineHeight: 1.5 }}>
                      {h.summary}
                    </div>
                  </div>
                ))}
              </Section>
            )}

            <Section label="OUTLOOK">
              <p style={{ fontSize: 12, lineHeight: 1.6, color: "#c9d6e3" }}>
                {brief.escalation_outlook}
              </p>
            </Section>

            {brief.monitoring_priorities?.length > 0 && (
              <Section label="PRIORITIES">
                <ul style={{ paddingLeft: 14 }}>
                  {brief.monitoring_priorities.map((p, i) => (
                    <li key={i} style={{ fontSize: 11, color: "#c9d6e3", marginBottom: 3 }}>
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
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 1,
          color: "#6b7f94",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

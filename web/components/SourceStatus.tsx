"use client";

import { useEffect, useState } from "react";

interface SourceInfo {
  status: "live" | "error" | string;
  last_run?: string;
  count?: number;
  error?: string;
}

const API_BASE = "/api";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function SourceStatus() {
  const [sources, setSources] = useState<Record<string, SourceInfo>>({});

  useEffect(() => {
    const fetchSources = async () => {
      try {
        const res = await fetch(`${API_BASE}/sources`);
        if (res.ok) setSources(await res.json());
      } catch {}
    };
    fetchSources();
    const interval = setInterval(fetchSources, 60000);
    return () => clearInterval(interval);
  }, []);

  const entries = Object.entries(sources);
  if (entries.length === 0) {
    return (
      <div style={{ color: "#6b7f94", fontSize: 11, padding: "8px 0" }}>
        Waiting for first cycle…
      </div>
    );
  }

  return (
    <div>
      {entries.map(([name, info]) => (
        <div
          key={name}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "3px 0",
            borderBottom: "1px solid #1e2a38",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: info.status === "live" ? "#3fb6a8" : "#cf3a4e",
              flexShrink: 0,
            }}
          />
          <span style={{ flex: 1, fontSize: 11, color: "#c9d6e3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {name}
          </span>
          <span style={{ fontSize: 10, color: "#6b7f94", flexShrink: 0 }}>
            {info.last_run ? timeAgo(info.last_run) : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

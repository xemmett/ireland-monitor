"use client";

export type Severity = "calm" | "watch" | "elevated" | "high" | "critical";

const LEVELS: { key: Severity; label: string; color: string }[] = [
  { key: "calm", label: "CALM", color: "#3fb6a8" },
  { key: "watch", label: "WATCH", color: "#d8b34a" },
  { key: "elevated", label: "ELEVATED", color: "#e08a3c" },
  { key: "high", label: "HIGH", color: "#d8633f" },
  { key: "critical", label: "CRITICAL", color: "#cf3a4e" },
];

interface Props {
  maxSeverity: Severity;
}

export default function ThreatMeter({ maxSeverity }: Props) {
  const activeIdx = LEVELS.findIndex((l) => l.key === maxSeverity);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 10, color: "#6b7f94", fontWeight: 600, letterSpacing: 1, marginRight: 4 }}>
        THREAT
      </span>
      {LEVELS.map((level, i) => (
        <div
          key={level.key}
          title={level.label}
          style={{
            height: 20 + i * 4,
            width: 28,
            borderRadius: 3,
            background: i <= activeIdx ? level.color : "#1e2a38",
            border: i === activeIdx ? `2px solid ${level.color}` : "2px solid transparent",
            boxShadow: i === activeIdx ? `0 0 8px ${level.color}88` : "none",
            transition: "all 0.3s",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            paddingBottom: 2,
          }}
        >
          {i === activeIdx && (
            <span style={{ fontSize: 8, color: "#fff", fontWeight: 700 }}>
              {level.label.slice(0, 3)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

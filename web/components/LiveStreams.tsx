"use client";

import { useEffect, useState } from "react";

const MONO = "'Share Tech Mono', 'Courier New', monospace";

// const TV_CHANNELS = [
//   { id: "bbc", label: "BBC NEWS", channelId: "UC16niRr50-MSBwiO3YDb3RA" },
//   { id: "sky", label: "SKY NEWS", channelId: "UCoMdktPbSTixAyNGwb-UYkQ" },
//   { id: "rte", label: "RTÉ NEWS", channelId: "UC8urSFTmQDxaPDEIZ2Fd63Q" },
// ];

const WEBCAMS = [
  { id: "belfast-clifton", label: "BELFAST · CLIFTON ST (A12)", img: "/api/webcam/belfast-clifton", source: "https://www.trafficwatchni.com/twni/cameras/static?id=9" },
  { id: "belfast-lagan", label: "BELFAST · LAGAN BRIDGE (M3)", img: "/api/webcam/belfast-lagan", source: "https://www.trafficwatchni.com/twni/cameras/static?id=7" },
  { id: "derry-james", label: "DERRY · GREAT JAMES ST", img: "/api/webcam/derry-james", source: "https://www.trafficwatchni.com/twni/cameras/static?id=76" },
];

const REFRESH_MS = 30_000;

export default function LiveStreams() {
  const [activeTv, setActiveTv] = useState("sky");
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  // const tv = TV_CHANNELS.find((c) => c.id === activeTv) ?? TV_CHANNELS[0];

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      {/* LIVE TV */}
      {/* <div style={{ borderBottom: "1px solid #1a2535" }}>
        <div
          style={{
            padding: "8px 10px",
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
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
              marginRight: 2,
            }}
          >
            &gt;&gt; LIVE TV
          </span>
          {TV_CHANNELS.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveTv(c.id)}
              style={{
                fontSize: 9,
                padding: "2px 6px",
                letterSpacing: 1,
                fontFamily: MONO,
                border: `1px solid ${activeTv === c.id ? "#2ea89c44" : "#1a2535"}`,
                borderRadius: 2,
                background: "transparent",
                color: activeTv === c.id ? "#2ea89c" : "#4a6070",
                cursor: "pointer",
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, background: "#000" }}>
          <iframe
            key={tv.id}
            src={`https://www.youtube-nocookie.com/embed/live_stream?channel=${tv.channelId}&autoplay=1&mute=1`}
            title={tv.label}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
          />
        </div>
      </div> */}

      {/* CITY CAMS */}
      <div style={{ padding: "10px 10px" }}>
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 2,
            color: "#4a6070",
            marginBottom: 8,
            fontFamily: MONO,
            borderBottom: "1px solid #1a2535",
            paddingBottom: 4,
          }}
        >
          // CITY CAMS
        </div>
        {WEBCAMS.map((cam) => (
          <div key={cam.id} style={{ marginBottom: 10 }}>
            <div
              style={{
                fontSize: 9,
                color: "#4a6070",
                fontFamily: MONO,
                marginBottom: 4,
                letterSpacing: 1,
              }}
            >
              {cam.label}
            </div>
            <img
              src={`${cam.img}?cache=${tick}`}
              alt={cam.label}
              style={{ width: "100%", display: "block", borderRadius: 2, border: "1px solid #1a2535", background: "#000" }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.opacity = "0.25";
              }}
            />
            {
              cam.source && (
                <a
                  href={cam.source}
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
              )
            }
          </div>
        ))}
        <div style={{ fontSize: 9, color: "#2e3f4d", fontFamily: MONO, marginTop: 2 }}>
          Source: TrafficWatchNI · refreshes every 30s
        </div>
      </div>
    </div>
  );
}

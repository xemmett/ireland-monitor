import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NI Unrest Monitor",
  description: "Real-time civil unrest situational awareness for Ireland/Northern Ireland",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap"
          crossOrigin=""
        />
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          crossOrigin=""
        />
      </head>
      <body style={{ height: "100vh", overflow: "hidden" }}>{children}</body>
    </html>
  );
}

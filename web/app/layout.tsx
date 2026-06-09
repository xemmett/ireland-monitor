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

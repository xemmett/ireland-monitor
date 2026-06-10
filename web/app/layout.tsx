import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ireland Unrest Monitor",
  description: "Real-time civil unrest situational awareness for Ireland/Northern Ireland",
  applicationName: "Ireland Unrest Monitor",
  appleWebApp: {
    capable: true,
    title: "Ireland Monitor",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#080c10",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
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

import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "GHOSTNAME® — Luxury Streetwear | FW26",
  description:
    "FW26 first delivery. Heavyweight silhouettes, cut for the unseen. Shop the GHOSTNAME® collection.",
  metadataBase: new URL("https://ghostnameworldwide.com"),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0A0A0A", color: "#FFFFFF", fontFamily: "'Inter', sans-serif" }}>
        {children}
      </body>
    </html>
  );
}

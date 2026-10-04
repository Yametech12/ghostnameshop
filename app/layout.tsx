import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: {
    default: "GHOSTNAME® — Luxury Streetwear | FW26",
    template: "%s — GHOSTNAME®",
  },
  description:
    "FW26 first delivery from GHOSTNAME® — heavyweight streetwear silhouettes cut for the unseen. Shop the collection with worldwide shipping.",
  metadataBase: new URL("https://ghostnameworldwide.com"),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://ghostnameworldwide.com/",
    siteName: "GHOSTNAME®",
    title: "GHOSTNAME® — Luxury Streetwear | FW26",
    description:
      "FW26 first delivery. Heavyweight silhouettes, cut for the unseen. Shop the GHOSTNAME® collection.",
    images: [
      {
        url: "/og-image",
        width: 1200,
        height: 630,
        alt: "GHOSTNAME® — Luxury Streetwear | FW26",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@ghostnameworldwide",
    title: "GHOSTNAME® — Luxury Streetwear | FW26",
    description:
      "FW26 first delivery. Heavyweight silhouettes, cut for the unseen. Shop the GHOSTNAME® collection.",
    images: ["https://ghostnameworldwide.com/og-image"],
  },
  alternates: {
    canonical: "https://ghostnameworldwide.com/",
  },
  authors: [{ name: "GHOSTNAME WORLDWIDE" }],
  creator: "GHOSTNAME WORLDWIDE",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0A0A0A",
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

import type { Metadata, Viewport } from "next";
import "./globals.css";

const SITE = "https://ghostnameworldwide.com";

export const metadata: Metadata = {
  title: {
    default: "GHOSTNAME® — Boxy tees, printed to order | FW26",
    template: "%s | GHOSTNAME®",
  },
  description:
    "Heavyweight boxy tees printed to order and shipped worldwide. Barcode, Classic and Faceless, from $30.",
  metadataBase: new URL(SITE),
  // No site-wide canonical here: a canonical set in the root layout is inherited by
  // every route (checkout, product pages…) and tells search engines they are all
  // duplicates of "/". Each page sets its own.
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "GHOSTNAME®",
    title: "GHOSTNAME® — Boxy tees, printed to order",
    description: "Heavyweight boxy tees printed to order and shipped worldwide. From $30.",
    // The old value "/og-image" has no route and 404'd for every social crawler.
    images: [{ url: "/assets/og-image.png", width: 1200, height: 630, alt: "GHOSTNAME® FW26" }],
  },
  twitter: {
    card: "summary_large_image",
    site: "@ghostnameworldwide",
    title: "GHOSTNAME® — Boxy tees, printed to order",
    description: "Heavyweight boxy tees printed to order and shipped worldwide. From $30.",
    images: ["/assets/og-image.png"],
  },
  authors: [{ name: "GHOSTNAME WORLDWIDE" }],
  creator: "GHOSTNAME WORLDWIDE",
  icons: { icon: "/assets/logo-monogram.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#070807",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

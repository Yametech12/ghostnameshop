import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "GHOSTNAME WORLDWIDE — Premium Streetwear",
  description:
    "Premium anonymous streetwear. Faceless. Fearless. Forever. FW26 inaugural drop, limited runs, est. 2026.",
  metadataBase: new URL("https://ghostnameworldwide.com"),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0b0b0d", color: "#f2f2f0", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        {children}
      </body>
    </html>
  );
}

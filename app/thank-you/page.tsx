import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Order Confirmed, GHOSTNAME WORLDWIDE",
  robots: { index: false },
};

/**
 * PayPal return_url target for completed payments. The real confirmation
 * state lives in the ledger; PayPal delivers the customer here after
 * a redirect-based approval (buttons capture in-page usually).
 */
export default async function ThankYouPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  const { orderId } = await searchParams;

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 480 }}>
        <div style={{ fontSize: 42, marginBottom: 8 }}>&#10003;</div>
        <h1
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 900,
            letterSpacing: -0.5,
            fontSize: "1.8rem",
          }}
        >
          ORDER CONFIRMED
        </h1>
        {orderId ? (
          <p style={{ color: "#f2f2f0", fontSize: 15, fontWeight: 700, marginTop: 12 }}>
            Order {orderId} confirmed
          </p>
        ) : null}
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.09)",
            background: "#121215",
            padding: 16,
            marginTop: 16,
            textAlign: "left",
          }}
        >
          <p style={{ color: "#8a8a90", fontSize: 13, lineHeight: 1.7, margin: 0 }}>
            Order details will appear here once your payment is verified against
            our records.
          </p>
        </div>
        <p style={{ color: "#8a8a90", fontSize: 14, lineHeight: 1.7, marginTop: 12 }}>
          A confirmation email is on its way.
        </p>
        <Link
          href="/store.html"
          style={{
            display: "inline-block",
            marginTop: 22,
            background: "#8a4b3a",
            color: "#fff",
            padding: "14px 32px",
            letterSpacing: 2,
            fontSize: 12,
            textDecoration: "none",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          Return to Storefront
        </Link>
      </div>
    </main>
  );
}

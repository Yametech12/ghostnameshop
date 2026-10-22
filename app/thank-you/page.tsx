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
            fontFamily: "var(--font-display)",
            fontWeight: 400,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            fontSize: "1.8rem",
          }}
        >
          ORDER CONFIRMED
        </h1>
        {orderId ? (
          <p style={{ color: "#f2f2f0", fontSize: 15, fontWeight: 700, marginTop: 12 }}>
            PayPal reference {orderId.slice(0, 24)}
          </p>
        ) : null}
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.09)",
            background: "var(--panel)",
            padding: 16,
            marginTop: 16,
            textAlign: "left",
          }}
        >
          <p style={{ color: "var(--mut)", fontSize: 13, lineHeight: 1.7, margin: 0 }}>
            Your payment is checked against our records before your order goes to
            production. If anything needs a second look, we email you.
          </p>
        </div>
        <p style={{ color: "var(--mut)", fontSize: 14, lineHeight: 1.7, marginTop: 12 }}>
          PayPal emails your receipt. A tracking email follows once your order ships.
        </p>
        <Link
          href="/"
          style={{
            display: "inline-block",
            marginTop: 22,
            background: "var(--acc)",
            color: "#06130a",
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

import Link from "next/link";

export const metadata = {
  title: "Order Confirmed — GHOSTNAME WORLDWIDE",
  robots: { index: false },
};

/**
 * PayPal return_url target for completed payments. The real confirmation
 * state lives in the ledger; PayPal delivers the customer here after
 * a redirect-based approval (buttons capture in-page usually).
 */
export default function ThankYouPage() {
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
        <p style={{ color: "#8a8a90", fontSize: 14, lineHeight: 1.7, marginTop: 12 }}>
          Payment received. Your pieces are being prepared &mdash; dispatch
          tracking is on its way to your email.
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

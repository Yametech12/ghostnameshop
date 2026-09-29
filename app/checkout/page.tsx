"use client";

/**
 * PayPal checkout for GHOSTNAME WORLDWIDE (USD-only).
 *
 * Flow:
 *  1. Cart arrives via sessionStorage (set by store.html) or localStorage mirror.
 *  2. POST /api/create-order -> server re-prices everything and creates the
 *     PayPal order (client prices are never trusted).
 *  3. PayPal Buttons render; on approval the server captures + fulfills.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";

interface CheckoutItem {
  id: string;
  size: string;
  qty: number;
}
interface Line {
  id: string;
  size: string;
  qty: number;
  name: string;
  unitAmount: number;
  lineTotal: number;
}
interface Totals {
  subtotal: number;
  shipping: number;
  total: number;
}
interface CreateOrderResponse {
  orderId?: string;
  ledgerKey?: string;
  totals?: Totals;
  lines?: Line[];
  error?: string;
}
interface CaptureResponse {
  ok?: boolean;
  status?: string;
  printifyOrderId?: string;
  error?: string;
}

const money = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);

export default function CheckoutPage() {
  const [lines, setLines] = useState<Line[] | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ status: string; printify?: string } | null>(null);
  const itemsRef = useRef<CheckoutItem[] | null>(null);
  const ledgerKeyRef = useRef("");
  const capturingRef = useRef(false);

  const loadCart = useCallback((): CheckoutItem[] | null => {
    try {
      const sess = sessionStorage.getItem("gn_checkout");
      if (sess) {
        const parsed = JSON.parse(sess) as { items: CheckoutItem[] };
        if (Array.isArray(parsed.items) && parsed.items.length) return parsed.items;
      }
    } catch {
      /* fall through */
    }
    try {
      const local = JSON.parse(
        localStorage.getItem("gn_cart") || "[]"
      ) as Array<{ id: string; size?: string; qty: number }>;
      const items = local
        .filter((c) => c && typeof c.id === "string" && c.qty > 0)
        .map((c) => ({ id: c.id, size: c.size || "M", qty: c.qty }));
      return items.length ? items : null;
    } catch {
      return null;
    }
  }, []);

  const priceCart = useCallback(async (items: CheckoutItem[]) => {
    setError("");
    try {
      const res = await fetch("/api/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = (await res.json()) as CreateOrderResponse;
      if (!res.ok || !data.totals) {
        setError(data.error || "Could not prepare your order. Please try again.");
        return;
      }
      setTotals(data.totals);
      if (data.lines?.length) setLines(data.lines);
    } catch {
      setError("Network error - check your connection and try again.");
    }
  }, []);

  useEffect(() => {
    const items = loadCart();
    itemsRef.current = items;
    if (!items) {
      setError("Your cart is empty. Pick something from the drop first.");
      return;
    }
    priceCart(items);
  }, [loadCart, priceCart]);

  const handleCreateOrder = useCallback(async (): Promise<string> => {
    const items = itemsRef.current;
    if (!items?.length) throw new Error("Cart is empty");
    const res = await fetch("/api/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    const data = (await res.json()) as CreateOrderResponse;
    if (!res.ok || !data.orderId) throw new Error(data.error || "Could not start checkout");
    ledgerKeyRef.current = data.ledgerKey || "";
    return data.orderId;
  }, []);

  const handleApprove = useCallback(
    async (data: { orderID: string }) => {
      if (capturingRef.current) return;
      capturingRef.current = true;
      try {
        const res = await fetch("/api/capture-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: data.orderID,
            ledgerKey: ledgerKeyRef.current,
          }),
        });
        const out = (await res.json()) as CaptureResponse;
        if (!res.ok) {
          setError(out.error || "Payment could not be completed.");
          return;
        }
        try {
          sessionStorage.removeItem("gn_checkout");
        } catch {
          /* ignore */
        }
        setDone({ status: out.status || "fulfilled", printify: out.printifyOrderId });
      } finally {
        capturingRef.current = false;
      }
    },
    []
  );

  if (done) return <DoneView status={done.status} printify={done.printify} />;

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "48px 24px",
        maxWidth: 980,
        margin: "0 auto",
      }}
    >
      <Header />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 32,
          marginTop: 36,
        }}
      >
        <Summary lines={lines} totals={totals} error={error} />
        <PayArea
          ready={Boolean(totals) && !error}
          onCreateOrder={handleCreateOrder}
          onApprove={handleApprove}
          onError={setError}
        />
      </div>
    </main>
  );
}

function Header() {
  return (
    <div>
      <a
        href="/store.html"
        style={{ color: "#8a8a90", fontSize: 12, letterSpacing: 2, textDecoration: "none" }}
      >
        &larr; BACK TO STOREFRONT
      </a>
      <h1
        style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontWeight: 900,
          letterSpacing: -1,
          fontSize: "clamp(1.8rem, 4vw, 2.6rem)",
          margin: "14px 0 4px",
        }}
      >
        SECURE CHECKOUT
      </h1>
      <p style={{ color: "#8a8a90", fontSize: 13, letterSpacing: 1 }}>
        FACELESS. FEARLESS. FOREVER. &mdash; ALL PRICES IN USD
      </p>
    </div>
  );
}

function Summary({
  lines,
  totals,
  error,
}: {
  lines: Line[] | null;
  totals: Totals | null;
  error: string;
}) {
  return (
    <section
      style={{
        border: "1px solid rgba(255,255,255,0.09)",
        padding: 24,
        background: "#121215",
      }}
    >
      <h2 style={{ fontSize: 13, letterSpacing: 2, color: "#8a8a90", margin: 0 }}>
        ORDER REVIEW
      </h2>
      {error && (
        <p style={{ color: "#e5484d", fontSize: 13, marginTop: 14 }}>{error}</p>
      )}
      {totals && (
        <>
          {lines?.map((l) => (
            <div
              key={`${l.id}-${l.size}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                padding: "12px 0",
                borderBottom: "1px solid rgba(255,255,255,0.07)",
                fontSize: 14,
              }}
            >
              <span>
                {l.name}
                <span style={{ color: "#8a8a90" }}>
                  {" "}
                  &middot; {l.size} &times; {l.qty}
                </span>
              </span>
              <span>{money(l.lineTotal)}</span>
            </div>
          ))}
          <Row label="Subtotal" value={money(totals.subtotal)} />
          <Row
            label="Worldwide express shipping"
            value={totals.shipping === 0 ? "FREE" : money(totals.shipping)}
          />
          <Row label="Total — charged in USD" value={money(totals.total)} strong />
          <p style={{ color: "#8a8a90", fontSize: 12, lineHeight: 1.6, marginTop: 18 }}>
            You&apos;ll enter your shipping address inside PayPal. Duties are prepaid;
            tracked courier dispatch worldwide.
          </p>
        </>
      )}
    </section>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "10px 0",
        fontSize: strong ? 16 : 13,
        fontWeight: strong ? 700 : 400,
        borderBottom: strong ? "none" : "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <span style={{ color: strong ? "#f2f2f0" : "#8a8a90" }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function PayArea({
  ready,
  onCreateOrder,
  onApprove,
  onError,
}: {
  ready: boolean;
  onCreateOrder: () => Promise<string>;
  onApprove: (data: { orderID: string }) => Promise<void>;
  onError: (msg: string) => void;
}) {
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;

  if (!clientId) {
    return (
      <section
        style={{
          border: "1px solid rgba(255,255,255,0.09)",
          padding: 24,
          background: "#121215",
        }}
      >
        <h2 style={{ fontSize: 13, letterSpacing: 2, color: "#8a8a90", margin: 0 }}>
          PAYMENT
        </h2>
        <p style={{ fontSize: 13, color: "#e5b454", marginTop: 14, lineHeight: 1.6 }}>
          Checkout is not configured yet &mdash; set NEXT_PUBLIC_PAYPAL_CLIENT_ID in
          Settings &rarr; Environment (plus PayPal, Printify and Upstash keys) to
          enable it.
        </p>
      </section>
    );
  }

  if (!ready) return null;

  return (
    <section
      style={{
        border: "1px solid rgba(255,255,255,0.09)",
        padding: 24,
        background: "#121215",
      }}
    >
      <h2 style={{ fontSize: 13, letterSpacing: 2, color: "#8a8a90", margin: 0 }}>
        PAYMENT
      </h2>
      <p style={{ fontSize: 12, color: "#8a8a90", marginTop: 10, lineHeight: 1.6 }}>
        Pay with PayPal balance or any debit/credit card &mdash; no PayPal account
        needed.
      </p>
      <PayPalScriptProvider
        options={{ clientId, currency: "USD", intent: "capture" }}
      >
        <PayPalButtons
          style={{ layout: "vertical", shape: "rect", color: "gold", label: "paypal" }}
          createOrder={onCreateOrder}
          onApprove={onApprove}
          onError={() =>
            onError("PayPal could not be reached. Please try again.")
          }
        />
      </PayPalScriptProvider>
    </section>
  );
}

function DoneView({ status, printify }: { status: string; printify?: string }) {
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
          Payment received. Your pieces are being prepared &mdash; dispatch tracking
          is on its way to your email.
          {printify ? ` Fulfillment reference: ${printify}.` : ""}
          {status === "manual_review"
            ? " A specialist will confirm your order shortly."
            : ""}
        </p>
        <a
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
        </a>
      </div>
    </main>
  );
}

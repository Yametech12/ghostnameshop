import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#0b0b0d",
        color: "#f2f2f0",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <form
        action="/api/admin/login"
        method="post"
        style={{
          width: "min(360px, 90vw)",
          background: "#141416",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 10,
          padding: 32,
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1, marginBottom: 4 }}>
          GHOSTNAME ADMIN
        </h1>
        <p style={{ color: "#8a8a90", fontSize: 13, marginBottom: 22 }}>
          Enter the admin key to manage products, orders, and analytics.
        </p>

        {sp.error && (
          <div
            style={{
              background: "#450a0a",
              border: "1px solid #dc2626",
              color: "#fecaca",
              padding: "10px 14px",
              borderRadius: 4,
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            Invalid admin key. Try again.
          </div>
        )}

        <input
          type="password"
          name="key"
          aria-label="Admin key"
          autoComplete="current-password"
          placeholder="Admin key"
          required
          autoFocus
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: "#0b0b0d",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 4,
            color: "#f2f2f0",
            padding: "12px 14px",
            fontSize: 14,
            marginBottom: 14,
          }}
        />
        <button
          type="submit"
          style={{
            width: "100%",
            background: "#8a4b3a",
            color: "#fff",
            border: "none",
            padding: 12,
            borderRadius: 4,
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: 1,
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          Sign in
        </button>
        <p style={{ marginTop: 18, fontSize: 12, textAlign: "center" }}>
          <Link href="/" style={{ color: "#8a8a90" }}>← Back to storefront</Link>
        </p>
      </form>
    </main>
  );
}

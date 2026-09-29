import { cookies } from "next/headers";
import Link from "next/link";
import { isAdminRequest, ADMIN_COOKIE } from "@/lib/admin-auth";
import { listOrders, computeStats, loadAdminCatalog } from "@/lib/admin-data";

export const dynamic = "force-dynamic";

const money = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);

const STATUS_COLORS: Record<string, string> = {
  created: "#8a8a90",
  paid: "#2563eb",
  fulfilling: "#9333ea",
  fulfilled: "#16a34a",
  manual_review: "#dc2626",
};

export default async function AdminPage() {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value ?? null;
  const authed = isAdminRequest(
    new Request("http://local"),
    token ? `${ADMIN_COOKIE}=${token}` : null
  );

  if (!authed) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0b0b0d", color: "#f2f2f0", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 28, marginBottom: 8 }}>GHOSTNAME Admin</h1>
          <p style={{ color: "#8a8a90", marginBottom: 20 }}>Not signed in.</p>
          <Link href="/admin/login" style={{ color: "#8a4b3a" }}>Go to login →</Link>
        </div>
      </main>
    );
  }

  let orders: Awaited<ReturnType<typeof listOrders>> = [];
  let stats: ReturnType<typeof computeStats> | null = null;
  let products: Awaited<ReturnType<typeof loadAdminCatalog>> = [];
  let loadError: string | null = null;

  try {
    orders = await listOrders();
    stats = computeStats(orders);
    products = await loadAdminCatalog();
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  const maxDay = stats ? Math.max(1, ...stats.days.map((d) => d.revenue)) : 1;

  return (
    <main style={{ minHeight: "100vh", background: "#0b0b0d", color: "#f2f2f0", fontFamily: "system-ui, sans-serif", padding: "32px clamp(16px, 4vw, 48px)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, marginBottom: 32, borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: 1 }}>GHOSTNAME ADMIN</h1>
          <p style={{ color: "#8a8a90", fontSize: 13, marginTop: 4 }}>Store overview · orders · products</p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link href="/" style={{ color: "#8a8a90", fontSize: 13, textDecoration: "none" }}>← Storefront</Link>
          <form action="/api/admin/logout" method="post">
            <button type="submit" style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "#f2f2f0", padding: "8px 16px", borderRadius: 4, cursor: "pointer", fontSize: 13 }}>
              Sign out
            </button>
          </form>
        </div>
      </header>

      {loadError && (
        <div style={{ background: "#450a0a", border: "1px solid #dc2626", color: "#fecaca", padding: 16, borderRadius: 6, marginBottom: 24 }}>
          Failed to load data: {loadError}
        </div>
      )}

      {stats && (
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 40 }}>
          <StatCard label="Paid Revenue" value={money(stats.revenue)} sub="paid, fulfilling, fulfilled, manual_review" />
          <StatCard label="Paid Orders" value={String(stats.orders)} />
          <StatCard label="Fulfilled" value={String(stats.statusCounts.fulfilled ?? 0)} sub="auto-fulfilled via Printify" />
          <StatCard label="Needs Review" value={String(stats.statusCounts.manual_review ?? 0)} sub="check the orders table" accent={stats.statusCounts.manual_review ? "#dc2626" : undefined} />
        </section>
      )}

      {stats && (
        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: "#c7c7cc" }}>Revenue — last 14 days</h2>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 140, borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: 4 }}>
            {stats.days.map((d) => (
              <div key={d.day} style={{ flex: 1, textAlign: "center" }} title={`${d.day}: ${money(d.revenue)} · ${d.orders} orders`}>
                <div style={{ height: `${Math.max(2, (d.revenue / maxDay) * 110)}px`, background: d.revenue > 0 ? "#8a4b3a" : "rgba(255,255,255,0.08)", borderRadius: 3, marginBottom: 6 }} />
                <div style={{ fontSize: 9, color: "#71717a", transform: "rotate(-45deg)" }}>{d.day.slice(5)}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {stats && Object.keys(stats.productRevenue).length > 0 && (
        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: "#c7c7cc" }}>Top products (paid orders)</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {Object.entries(stats.productRevenue)
              .sort((a, b) => b[1] - a[1])
              .map(([id, rev]) => (
                <div key={id} style={{ display: "flex", justifyContent: "space-between", background: "#141416", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "10px 16px" }}>
                  <span>{id} · {stats?.unitsSold[id] ?? 0} sold</span>
                  <span style={{ fontWeight: 700 }}>{money(rev)}</span>
                </div>
              ))}
          </div>
        </section>
      )}

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: "#c7c7cc" }}>Orders</h2>
        {orders.length === 0 ? (
          <p style={{ color: "#71717a" }}>No orders yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: "#71717a", textAlign: "left" }}>
                  <th style={th}>Order</th>
                  <th style={th}>Date</th>
                  <th style={th}>Status</th>
                  <th style={th}>Items</th>
                  <th style={th}>Total</th>
                  <th style={th}>PayPal</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.key} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <td style={td}><code style={{ fontSize: 11 }}>{o.key}</code></td>
                    <td style={td}>{new Date(o.createdAt).toISOString().slice(0, 16).replace("T", " ")}</td>
                    <td style={td}>
                      <span style={{ color: STATUS_COLORS[o.status] ?? "#8a8a90", fontWeight: 700, fontSize: 12 }}>{o.status}</span>
                    </td>
                    <td style={td}>
                      {(o.resolved?.lines ?? []).map((l: { id: string; size: string; qty: number }) => `${l.id}(${l.size})×${l.qty}`).join(", ")}
                    </td>
                    <td style={td}>{money(o.totals?.total ?? 0)}</td>
                    <td style={td}>
                      {o.paypal?.orderId
                        ? <code style={{ fontSize: 11 }}>{o.paypal.orderId.slice(0, 12)}…</code>
                        : "—"}
                      {o.printify?.orderId && (
                        <div style={{ fontSize: 11, color: "#16a34a" }}>PF {o.printify.orderId.slice(0, 10)}…</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6, color: "#c7c7cc" }}>Products</h2>
        <p style={{ color: "#71717a", fontSize: 13, marginBottom: 16 }}>
          Live edits are stored in Redis and served to the storefront via <code>/api/products</code>. Price, name, tag, category, and sold-out flag.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
          {products.map((p) => (
            <ProductCard key={p.id} p={p} />
          ))}
        </div>
      </section>
    </main>
  );
}

const th: React.CSSProperties = { padding: "8px 10px", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 };
const td: React.CSSProperties = { padding: "10px", verticalAlign: "top" };

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{ background: "#141416", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: 20 }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#71717a", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: accent ?? "#f2f2f0" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#71717a", marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function ProductCard({ p }: { p: Awaited<ReturnType<typeof loadAdminCatalog>>[number] }) {
  return (
    <div style={{ background: "#141416", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <strong style={{ fontSize: 14 }}>{p.name}</strong>
        <code style={{ fontSize: 11, color: "#71717a" }}>{p.id}</code>
      </div>
      <div style={{ fontSize: 12, color: "#8a8a90", marginBottom: 12 }}>
        {p.cat} · {p.fabric} · {money(p.price)} · sizes {p.sizes.join("/")}
        {p.soldOut && <span style={{ color: "#dc2626", fontWeight: 700 }}> · SOLD OUT</span>}
      </div>
      <form action="/api/admin/products" method="post" style={{ display: "grid", gap: 8 }}>
        <input type="hidden" name="id" value={p.id} />
        <input name="name" defaultValue={p.name} placeholder="Name" style={inputStyle} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <select name="cat" defaultValue={p.cat} style={inputStyle}>
            {["Outerwear", "Tops", "Bottoms", "Accessories"].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <input name="price" type="number" step="0.01" min="0" defaultValue={p.price} placeholder="Price USD" style={inputStyle} />
        </div>
        <input name="fabric" defaultValue={p.fabric} placeholder="Fabric" style={inputStyle} />
        <input name="tag" defaultValue={p.tag} placeholder="Tag (NEW / LIMITED / empty)" style={inputStyle} />
        <label style={{ fontSize: 12, color: "#8a8a90", display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" name="soldOut" defaultChecked={p.soldOut} /> Sold out
        </label>
        <button type="submit" style={{ background: "#8a4b3a", color: "#fff", border: "none", padding: "10px", borderRadius: 4, cursor: "pointer", fontWeight: 700, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" }}>
          Save
        </button>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "#0b0b0d",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 4,
  color: "#f2f2f0",
  padding: "8px 10px",
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box",
};

import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { listOrders, computeStats } from "@/lib/admin-data";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isAdminRequest(request, request.headers.get("cookie"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rl = await rateLimit("admin/stats", clientIp(request), 120, 60);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limited — try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }
  try {
    const orders = await listOrders();
    const stats = computeStats(orders);
    return NextResponse.json({ stats, orders });
  } catch (err) {
    console.error("[admin/stats] redis read failed", err);
    return NextResponse.json({ error: "Stats unavailable — try again shortly." }, { status: 503 });
  }
}

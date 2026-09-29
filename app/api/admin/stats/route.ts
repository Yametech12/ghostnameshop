import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { listOrders, computeStats } from "@/lib/admin-data";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isAdminRequest(request, request.headers.get("cookie"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orders = await listOrders();
  const stats = computeStats(orders);
  return NextResponse.json({ stats, orders });
}

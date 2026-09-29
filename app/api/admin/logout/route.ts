import { NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const wantsForm = !(request.headers.get("content-type") ?? "").includes("application/json");
  const res = wantsForm
    ? NextResponse.redirect(new URL("/admin/login", request.url), 303)
    : NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}

import { NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const wantsForm = !(request.headers.get("content-type") ?? "").includes("application/json");
  const res = wantsForm
    ? NextResponse.redirect(new URL("/admin/login", request.url), 303)
    : NextResponse.json({ ok: true });
  // Mirror the login cookie attributes exactly so the browser actually clears it.
  res.cookies.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}

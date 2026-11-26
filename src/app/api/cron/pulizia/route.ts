import { timingSafeEqual } from "node:crypto";

import { deleteExpiredRequests } from "@/lib/limits";

/** Daily Vercel cron (vercel.json): deletes expired IP hashes when no scans arrive (ADR-0003). */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  // Without the secret nobody is authorized, not everybody.
  if (!secret || !sameText(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return new Response(null, { status: 401 });
  }
  const deleted = await deleteExpiredRequests();
  return Response.json({ deleted });
}

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

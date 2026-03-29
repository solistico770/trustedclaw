import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const baseUrl = req.nextUrl.origin;
  const body = await req.json().catch(() => ({}));

  const res = await fetch(`${baseUrl}/api/heartbeat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cron-secret": process.env.CRON_SECRET || "",
      "x-triggered-by": "manual",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

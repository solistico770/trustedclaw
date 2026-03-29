import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const userId = sp.get("user_id");
  if (!userId) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  const db = createServiceClient();
  let query = db.from("events")
    .select("*, classifications(*), triage_decisions(*)")
    .eq("user_id", userId)
    .order("occurred_at", { ascending: false })
    .limit(100);

  const status = sp.get("status");
  if (status) query = query.eq("processing_status", status);

  const severity = sp.get("severity");
  if (severity) query = query.eq("classifications.severity", severity);

  const gateType = sp.get("gate_type");
  if (gateType) query = query.eq("raw_payload->>gate_type", gateType);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

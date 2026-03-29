import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id");
  if (!userId) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  const db = createServiceClient();
  const { data, error } = await db
    .from("triage_decisions")
    .select(`
      *,
      events!inner(
        id, raw_payload, normalized_payload, enrichment_data, processing_status, occurred_at, gate_id,
        classifications(severity, urgency, importance_score, reasoning, confidence),
        event_entities(entity_id, role, confidence_score, entities(id, canonical_name, type))
      )
    `)
    .eq("user_id", userId)
    .eq("decision", "escalate")
    .eq("status", "open")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

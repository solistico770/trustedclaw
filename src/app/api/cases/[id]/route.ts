import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createServiceClient();

  const [caseData, events, caseEntities, history, triageDecisions] = await Promise.all([
    db.from("cases").select("*").eq("id", id).single(),
    db.from("events")
      .select("id, raw_payload, normalized_payload, enrichment_data, processing_status, occurred_at, created_at")
      .eq("case_id", id)
      .order("occurred_at", { ascending: true }),
    db.from("case_entities")
      .select("*, entities(id, canonical_name, type, aliases)")
      .eq("case_id", id),
    db.from("case_history")
      .select("*")
      .eq("case_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    db.from("triage_decisions")
      .select("*")
      .eq("case_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (caseData.error) return NextResponse.json({ error: "Case not found" }, { status: 404 });

  return NextResponse.json({
    case: caseData.data,
    events: events.data || [],
    entities: caseEntities.data || [],
    history: history.data || [],
    triage_decisions: triageDecisions.data || [],
  });
}

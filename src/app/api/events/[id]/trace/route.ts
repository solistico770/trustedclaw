import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createServiceClient();

  const [event, classifications, triageDecisions, auditLogs, eventEntities] = await Promise.all([
    db.from("events").select("*").eq("id", id).single(),
    db.from("classifications").select("*").eq("event_id", id).order("created_at"),
    db.from("triage_decisions").select("*").eq("event_id", id).order("created_at"),
    db.from("audit_logs").select("*").eq("target_id", id).eq("target_type", "event").order("created_at"),
    db.from("event_entities").select("*, entities(*)").eq("event_id", id),
  ]);

  if (event.error) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const trace = {
    event: event.data,
    classifications: classifications.data || [],
    triage_decisions: triageDecisions.data || [],
    entities: eventEntities.data || [],
    audit_trail: auditLogs.data || [],
    pipeline_complete: event.data?.processing_status === "completed",
  };

  return NextResponse.json(trace);
}

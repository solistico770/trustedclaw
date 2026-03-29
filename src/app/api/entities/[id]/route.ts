import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createServiceClient();

  const [entity, events] = await Promise.all([
    db.from("entities").select("*").eq("id", id).single(),
    db.from("event_entities")
      .select("*, events(id, raw_payload, normalized_payload, processing_status, occurred_at, classifications(severity, urgency))")
      .eq("entity_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (entity.error) return NextResponse.json({ error: "Entity not found" }, { status: 404 });

  return NextResponse.json({
    entity: entity.data,
    timeline: events.data || [],
  });
}

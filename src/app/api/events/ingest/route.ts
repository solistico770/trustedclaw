import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { runPipeline } from "@/lib/pipeline";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { gate_type, sender_name, channel_name, content, simulated_timestamp, user_id } = body;

    if (!content || !user_id) {
      return NextResponse.json({ error: "Missing required fields: content, user_id" }, { status: 400 });
    }

    const db = createServiceClient();

    // Find or create gate
    let gateId: string | null = null;
    const gType = gate_type || "generic";
    const { data: existingGate } = await db.from("gates")
      .select("id").eq("user_id", user_id).eq("type", gType).limit(1).single();

    if (existingGate) {
      gateId = existingGate.id;
    } else {
      const { data: newGate } = await db.from("gates").insert({
        user_id, type: gType, display_name: gType.charAt(0).toUpperCase() + gType.slice(1), status: "active",
      }).select("id").single();
      gateId = newGate?.id || null;
    }

    // Save raw event synchronously
    const { data: event, error } = await db.from("events").insert({
      gate_id: gateId,
      user_id,
      occurred_at: simulated_timestamp || new Date().toISOString(),
      received_at: new Date().toISOString(),
      raw_payload: { gate_type: gType, sender_name, channel_name, content, simulated_timestamp },
      processing_status: "pending",
    }).select("id").single();

    if (error || !event) {
      return NextResponse.json({ error: "Failed to save event" }, { status: 503 });
    }

    await logAudit(db, {
      user_id, actor: "system", action_type: "ingest",
      target_type: "event", target_id: event.id, reasoning: `Ingested from ${gType}`,
    });

    // Trigger pipeline async (fire and forget in this context)
    runPipeline(db, event.id, user_id).catch((e) =>
      console.error("[ingest] pipeline error:", e)
    );

    return NextResponse.json({ event_id: event.id, processing_status: "pending" });
  } catch (e) {
    console.error("[ingest] error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
